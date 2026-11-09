import "server-only";
import Stripe from "stripe";
import { adminClient } from "@/lib/supabase/admin";
import {
  PASSES, PLANS, isPaidPlan, isPassTier, passExpiry, passLookupKey, planLookupKey, toSubStatus,
  type PaidPlan, type PassTier,
} from "@/lib/plans";

type Admin = NonNullable<ReturnType<typeof adminClient>>;

/** Stripe, when STRIPE_SECRET_KEY is set (server only). Null means billing isn't connected yet. */
export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { maxNetworkRetries: 2, appInfo: { name: "QueuedToGo" } });
}

export const billingConnected = () => !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET;

const PRODUCT_NAMES: Record<string, string> = {
  qtg_starter_monthly: "QueuedToGo Starter",
  qtg_pro_monthly: "QueuedToGo Pro",
  qtg_events_monthly: "QueuedToGo Events",
  qtg_pass_100: "Event invitation pass: up to 100 guests",
  qtg_pass_300: "Event invitation pass: up to 300 guests",
  qtg_pass_unlimited: "Event invitation pass: unlimited guests",
};

/**
 * The Stripe price for a plan or pass, found by its lookup key. Created the first time it's needed
 * (so there is nothing to copy into the app by hand). If you change a price in Stripe, give the new
 * price the same lookup key (Stripe's "transfer lookup key") and the app uses it from then on.
 */
export async function ensurePrice(stripe: Stripe, item: { plan: PaidPlan } | { pass: PassTier }): Promise<string> {
  const lookup = "plan" in item ? planLookupKey(item.plan) : passLookupKey(item.pass);
  const found = await stripe.prices.list({ lookup_keys: [lookup], active: true, limit: 1 });
  if (found.data[0]) return found.data[0].id;
  const amount = "plan" in item ? PLANS[item.plan].price : PASSES[item.pass].price;
  const product = await stripe.products.create({ name: PRODUCT_NAMES[lookup] ?? lookup, metadata: { qtg: lookup } });
  const price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: amount * 100,
    lookup_key: lookup,
    transfer_lookup_key: true,
    ...("plan" in item ? { recurring: { interval: "month" as const } } : {}),
    metadata: { qtg: lookup },
  });
  return price.id;
}

const ts = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null);
const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);

/** The plan a subscription is for: from its price's lookup key, else the metadata we set at checkout. */
export function planOfSubscription(sub: Stripe.Subscription): PaidPlan | null {
  const key = sub.items?.data?.[0]?.price?.lookup_key ?? "";
  const m = /^qtg_(starter|pro|events)_monthly$/.exec(key);
  if (m && isPaidPlan(m[1])) return m[1];
  return isPaidPlan(sub.metadata?.plan) ? sub.metadata.plan : null;
}

/** Copy a Stripe subscription onto the business's plan row. */
export async function syncSubscription(admin: Admin, sub: Stripe.Subscription, deleted = false): Promise<"updated" | "ignored"> {
  const customer = idOf(sub.customer);
  let orgId = typeof sub.metadata?.org_id === "string" ? sub.metadata.org_id : null;
  const { data: row } = orgId
    ? await admin.from("org_billing").select("org_id, stripe_customer_id, stripe_subscription_id, comped").eq("org_id", orgId).maybeSingle()
    : await admin.from("org_billing").select("org_id, stripe_customer_id, stripe_subscription_id, comped").eq("stripe_customer_id", customer ?? "").maybeSingle();
  if (!row) return "ignored";
  orgId = row.org_id;
  // The customer must be the business's own Stripe customer (stops a crafted subscription moving plans).
  if (row.stripe_customer_id && customer && row.stripe_customer_id !== customer) return "ignored";
  // Only the business's current subscription can change it (an old, replaced one is ignored).
  if (row.stripe_subscription_id && row.stripe_subscription_id !== sub.id) {
    if (deleted) return "ignored";
    const { data: cur } = await admin.from("org_billing").select("status").eq("org_id", orgId).single();
    if (cur && ["trialing", "active", "past_due"].includes(cur.status)) return "ignored";
  }
  const plan = planOfSubscription(sub);
  const item = sub.items?.data?.[0];
  const update = deleted
    ? { status: "canceled", stripe_subscription_id: null, cancel_at_period_end: false, current_period_end: ts(item?.current_period_end) }
    : {
        status: toSubStatus(sub.status),
        stripe_subscription_id: sub.id,
        stripe_customer_id: customer,
        current_period_end: ts(item?.current_period_end),
        trial_end: ts(sub.trial_end),
        cancel_at_period_end: !!sub.cancel_at_period_end || !!sub.cancel_at,
        ...(sub.trial_end ? { had_trial: true } : {}),
        // A comped business keeps its plan; otherwise the plan follows the subscription.
        ...(plan && !row.comped ? { plan } : {}),
      };
  const { error } = await admin.from("org_billing").update(update).eq("org_id", orgId);
  if (error) throw new Error(`Could not save the plan: ${error.message}`);
  return "updated";
}

/** Mark an event pass paid after its checkout completes (checks the business, session and amount). */
export async function markPassPaid(admin: Admin, session: Stripe.Checkout.Session): Promise<"paid" | "ignored"> {
  const passId = session.metadata?.pass_id;
  const orgId = session.metadata?.org_id;
  if (!passId || !orgId || session.payment_status !== "paid") return "ignored";
  const { data: pass } = await admin.from("event_passes").select("id, org_id, form_id, tier, amount_cents, status, stripe_session_id")
    .eq("id", passId).eq("org_id", orgId).maybeSingle();
  if (!pass || pass.stripe_session_id !== session.id) return "ignored";
  if (pass.status === "paid") return "paid";
  if (pass.status !== "pending" || (session.amount_total ?? -1) < pass.amount_cents || (session.currency ?? "usd") !== "usd") return "ignored";
  const { data: form } = await admin.from("forms").select("event_date").eq("id", pass.form_id).eq("org_id", orgId).maybeSingle();
  const paidAt = new Date();
  const { error } = await admin.from("event_passes").update({
    status: "paid",
    paid_at: paidAt.toISOString(),
    expires_at: passExpiry(form?.event_date, paidAt).toISOString(),
    stripe_payment_intent: idOf(session.payment_intent),
  }).eq("id", pass.id).eq("status", "pending");
  if (error) throw new Error(`Could not save the pass: ${error.message}`);
  return "paid";
}

/** Apply one verified Stripe webhook event. Safe to run more than once for the same event. */
export async function handleStripeEvent(admin: Admin, stripe: Stripe, event: Stripe.Event): Promise<string> {
  const { data: seen } = await admin.from("stripe_events").select("id").eq("id", event.id).maybeSingle();
  if (seen) return "duplicate";
  let result = "ignored";
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object;
      if (s.mode === "subscription" && s.subscription) {
        const sub = await stripe.subscriptions.retrieve(idOf(s.subscription)!);
        if (s.metadata?.org_id && !sub.metadata?.org_id) sub.metadata = { ...sub.metadata, org_id: s.metadata.org_id };
        result = await syncSubscription(admin, sub);
      } else if (s.mode === "payment") result = await markPassPaid(admin, s);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      result = await syncSubscription(admin, event.data.object);
      break;
    case "customer.subscription.deleted":
      result = await syncSubscription(admin, event.data.object, true);
      break;
    case "charge.refunded": {
      const c = event.data.object;
      const pi = idOf(c.payment_intent);
      if (pi && c.refunded) {
        const { data } = await admin.from("event_passes").update({ status: "refunded" }).eq("stripe_payment_intent", pi).eq("status", "paid").select("id");
        result = data?.length ? "refunded" : "ignored";
      }
      break;
    }
  }
  await admin.from("stripe_events").upsert({ id: event.id, type: event.type }, { onConflict: "id", ignoreDuplicates: true });
  return result;
}

export const passTierOf = (v: unknown): PassTier | null => (isPassTier(v) ? v : null);
