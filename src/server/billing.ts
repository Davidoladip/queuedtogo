import "server-only";
import Stripe from "stripe";
import { adminClient } from "@/lib/supabase/admin";
import {
  PASSES, isPassTier, parseLookupKey, passExpiry, passLookupKey, planLookupKey, planPrice, toSubStatus,
  type Interval, type PaidPlan, type PassTier,
} from "@/lib/plans";

type Admin = NonNullable<ReturnType<typeof adminClient>>;

/** Stripe, when STRIPE_SECRET_KEY is set (server only). Null means billing isn't connected yet. */
export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { maxNetworkRetries: 2, appInfo: { name: "QueuedToGo" } });
}

export const billingConnected = () => !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET;

/** Sales tax through Stripe Tax: on only when STRIPE_TAX=on (set once Stripe Tax is active, with Maryland registered). */
export const taxEnabled = () => process.env.STRIPE_TAX === "on";

/** Checkout options for sales tax: Stripe works out the tax from the buyer's address and adds it on top. */
export function checkoutTaxOptions(): Partial<Stripe.Checkout.SessionCreateParams> {
  if (!taxEnabled()) return {};
  return { automatic_tax: { enabled: true }, billing_address_collection: "required", customer_update: { address: "auto", name: "auto" } };
}

const PRODUCT_NAMES: Record<string, string> = {
  qtg_starter_monthly: "QueuedToGo Starter",
  qtg_pro_monthly: "QueuedToGo Pro",
  qtg_events_monthly: "QueuedToGo Events",
  qtg_pass_100: "Event invitation pass: up to 100 guests",
  qtg_pass_300: "Event invitation pass: up to 300 guests",
  qtg_pass_unlimited: "Event invitation pass: unlimited guests",
};

type PriceItem = { plan: PaidPlan; interval?: Interval } | { pass: PassTier };

/**
 * The Stripe price for a plan (monthly or annual) or pass, found by its lookup key. Created the first time it's
 * needed. The amount always follows src/lib/plans.ts: if the price under the key has a different amount, a new
 * price takes over the key (existing subscribers stay on their old price until moved in Stripe). Annual prices
 * go on the same product as the monthly one, so the customer portal shows them as one plan.
 */
export async function ensurePrice(stripe: Stripe, item: PriceItem): Promise<string> {
  const interval: Interval = "plan" in item ? item.interval ?? "month" : "month";
  const lookup = "plan" in item ? planLookupKey(item.plan, interval) : passLookupKey(item.pass);
  const cents = ("plan" in item ? planPrice(item.plan, interval) : PASSES[item.pass].price) * 100;
  const found = await stripe.prices.list({ lookup_keys: [lookup], active: true, limit: 1 });
  const cur = found.data[0];
  const exclusive = taxEnabled();
  if (cur && cur.unit_amount === cents && cur.currency === "usd") {
    // Stripe Tax needs to know whether tax is on top of the price; a price can be told once.
    if (exclusive && cur.tax_behavior === "unspecified") await stripe.prices.update(cur.id, { tax_behavior: "exclusive" });
    return cur.id;
  }
  const productOf = (p: Stripe.Price) => (typeof p.product === "string" ? p.product : p.product.id);
  let productId = cur ? productOf(cur) : null;
  if (!productId && "plan" in item && interval === "year") {
    const monthly = await stripe.prices.list({ lookup_keys: [planLookupKey(item.plan, "month")], limit: 1 });
    if (monthly.data[0]) productId = productOf(monthly.data[0]);
  }
  if (!productId) {
    const name = PRODUCT_NAMES["plan" in item ? planLookupKey(item.plan, "month") : lookup] ?? lookup;
    productId = (await stripe.products.create({ name, metadata: { qtg: lookup } })).id;
  }
  const price = await stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: cents,
    lookup_key: lookup,
    transfer_lookup_key: true,
    ...("plan" in item ? { recurring: { interval } } : {}),
    ...(exclusive ? { tax_behavior: "exclusive" as const } : {}),
    metadata: { qtg: lookup },
  });
  return price.id;
}

const ts = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null);
const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);

/** The plan a subscription is for: from its price's lookup key, else the metadata we set at checkout. */
export function planOfSubscription(sub: Stripe.Subscription): PaidPlan | null {
  const parsed = parseLookupKey(sub.items?.data?.[0]?.price?.lookup_key);
  if (parsed) return parsed.plan;
  const m = sub.metadata?.plan;
  return m === "starter" || m === "pro" || m === "events" ? m : null;
}

/** Monthly or annual, from the subscription's price. */
export function intervalOfSubscription(sub: Stripe.Subscription): Interval {
  const price = sub.items?.data?.[0]?.price;
  if (price?.recurring?.interval === "year") return "year";
  return parseLookupKey(price?.lookup_key)?.interval ?? "month";
}

export type BillingNotice = { orgId: string; kind: "payment_failed" | "plan_ended" | "cancel_confirmed"; reason?: string | null; endsAt?: string | null };
export type Notify = (admin: Admin, n: BillingNotice) => Promise<void>;
const noNotify: Notify = async () => {};

/** Copy a Stripe subscription onto the business's plan row. */
export async function syncSubscription(admin: Admin, sub: Stripe.Subscription, deleted = false, notify: Notify = noNotify): Promise<"updated" | "ignored"> {
  const customer = idOf(sub.customer);
  let orgId = typeof sub.metadata?.org_id === "string" ? sub.metadata.org_id : null;
  const cols = "org_id, plan, status, stripe_customer_id, stripe_subscription_id, comped, cancel_at_period_end";
  const { data: row } = orgId
    ? await admin.from("org_billing").select(cols).eq("org_id", orgId).maybeSingle()
    : await admin.from("org_billing").select(cols).eq("stripe_customer_id", customer ?? "").maybeSingle();
  if (!row) return "ignored";
  orgId = row.org_id as string;
  // The customer must be the business's own Stripe customer (stops a crafted subscription moving plans).
  if (row.stripe_customer_id && customer && row.stripe_customer_id !== customer) return "ignored";
  // Only the business's current subscription can change it (an old, replaced one is ignored).
  if (row.stripe_subscription_id && row.stripe_subscription_id !== sub.id) {
    if (deleted) return "ignored";
    if (["trialing", "active", "past_due"].includes(row.status as string)) return "ignored";
  }
  const before = { status: row.status as string, cancelling: !!row.cancel_at_period_end };
  const plan = planOfSubscription(sub);
  const item = sub.items?.data?.[0];
  const status = deleted ? "canceled" : toSubStatus(sub.status);
  const cancelling = !deleted && (!!sub.cancel_at_period_end || !!sub.cancel_at);
  const paidUp = status === "active" || status === "trialing";
  const update = deleted
    ? {
        status: "canceled", stripe_subscription_id: null, cancel_at_period_end: false, current_period_end: ts(item?.current_period_end),
        pending_plan: null, pending_interval: null, pending_change_at: null,
      }
    : {
        status,
        stripe_subscription_id: sub.id,
        stripe_customer_id: customer,
        current_period_end: ts(item?.current_period_end),
        trial_end: ts(sub.trial_end),
        cancel_at_period_end: cancelling,
        billing_interval: intervalOfSubscription(sub),
        ...(sub.trial_end ? { had_trial: true } : {}),
        // A comped business keeps its plan; otherwise the plan follows the subscription.
        ...(plan && !row.comped ? { plan } : {}),
        // A booked change lives in a Stripe schedule; once the schedule is gone the change has happened or was dropped.
        ...(sub.schedule ? {} : { pending_plan: null, pending_interval: null, pending_change_at: null }),
        ...(paidUp ? { last_payment_error: null, last_payment_failed_at: null } : {}),
      };
  const { error } = await admin.from("org_billing").update(update).eq("org_id", orgId);
  if (error) throw new Error(`Could not save the plan: ${error.message}`);
  if (!row.comped) {
    if (deleted && before.status !== "canceled") await notify(admin, { orgId, kind: "plan_ended" });
    else if (cancelling && !before.cancelling) await notify(admin, { orgId, kind: "cancel_confirmed", endsAt: ts(sub.cancel_at ?? item?.current_period_end) });
  }
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
  // amount_subtotal is before tax, so sales tax never makes a payment look like a different amount.
  const paid = session.amount_subtotal ?? session.amount_total ?? -1;
  if (pass.status !== "pending" || paid < pass.amount_cents || (session.currency ?? "usd") !== "usd") return "ignored";
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

/** The subscription as Stripe has it now. Webhooks can arrive late or out of order, so the event's copy isn't trusted. */
async function freshSubscription(stripe: Stripe, sub: Stripe.Subscription): Promise<Stripe.Subscription> {
  try {
    return await stripe.subscriptions.retrieve(sub.id);
  } catch (e) {
    if (e instanceof Stripe.errors.StripeInvalidRequestError && e.code === "resource_missing") return sub;
    throw e;
  }
}

/** Why an invoice's payment failed, in Stripe's words ("Your card was declined."). */
async function failureReason(stripe: Stripe, invoice: Stripe.Invoice): Promise<string> {
  const fallback = "The payment was declined.";
  try {
    const list = await stripe.invoicePayments.list({ invoice: invoice.id!, limit: 3, expand: ["data.payment.payment_intent"] });
    for (const p of list.data) {
      const pi = p.payment?.payment_intent;
      if (pi && typeof pi !== "string" && pi.last_payment_error?.message) return pi.last_payment_error.message.slice(0, 300);
    }
  } catch (e) {
    console.error("billing failure reason", e instanceof Error ? e.message : e);
  }
  return fallback;
}

const subscriptionOfInvoice = (inv: Stripe.Invoice) => idOf(inv.parent?.subscription_details?.subscription ?? null);

/** A renewal failed (status moves to past_due through the subscription event) or was paid. */
async function recordInvoice(admin: Admin, stripe: Stripe, inv: Stripe.Invoice, paid: boolean, notify: Notify): Promise<string> {
  const subId = subscriptionOfInvoice(inv);
  const customer = idOf(inv.customer);
  if (!subId || !customer) return "ignored";
  const { data: row } = await admin.from("org_billing").select("org_id, stripe_customer_id, stripe_subscription_id, comped, last_payment_failed_at")
    .eq("stripe_customer_id", customer).maybeSingle();
  if (!row || (row.stripe_subscription_id && row.stripe_subscription_id !== subId)) return "ignored";
  if (paid) {
    await admin.from("org_billing").update({ last_payment_error: null, last_payment_failed_at: null }).eq("org_id", row.org_id);
    return "paid";
  }
  const firstFailure = !row.last_payment_failed_at;
  const reason = await failureReason(stripe, inv);
  await admin.from("org_billing").update({ last_payment_error: reason, last_payment_failed_at: new Date().toISOString() }).eq("org_id", row.org_id);
  // Email the owners on the first failure of this run of retries only (Stripe retries several times).
  if (!row.comped && firstFailure) await notify(admin, { orgId: row.org_id as string, kind: "payment_failed", reason });
  return "failed";
}

/** Apply one verified Stripe webhook event. Safe to run more than once for the same event. */
export async function handleStripeEvent(admin: Admin, stripe: Stripe, event: Stripe.Event, notify: Notify = noNotify): Promise<string> {
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
        result = await syncSubscription(admin, sub, false, notify);
      } else if (s.mode === "payment") result = await markPassPaid(admin, s);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.paused":
    case "customer.subscription.resumed": {
      const sub = await freshSubscription(stripe, event.data.object);
      result = await syncSubscription(admin, sub, sub.status === "canceled", notify);
      break;
    }
    case "customer.subscription.deleted":
      result = await syncSubscription(admin, event.data.object, true, notify);
      break;
    case "invoice.payment_failed":
      result = await recordInvoice(admin, stripe, event.data.object, false, notify);
      break;
    case "invoice.paid":
      result = await recordInvoice(admin, stripe, event.data.object, true, notify);
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
