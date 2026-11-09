"use server";

import { z } from "zod";
import { canManage, requireWorkspace } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/urls";
import { KEEPS_PLAN, PASSES, PASS_ORDER, TRIAL_DAYS, type PaidPlan, type PassTier } from "@/lib/plans";
import { ensurePrice, markPassPaid, stripeClient, syncSubscription } from "@/server/billing";

export type BillingResult = { ok: true; url?: string; message?: string } | { ok: false; error: string };

const NOT_CONNECTED = "Payments aren't switched on yet. Please check back soon.";
const OWNERS = "Only owners and admins can change billing.";
const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/);
const planSchema = z.enum(["starter", "pro", "events"]);
const tierSchema = z.enum(["100", "300", "unlimited"]);

async function setup(orgSlug: string) {
  if (!slugSchema.safeParse(orgSlug).success) return { error: "We couldn't find this business." } as const;
  const { user, org } = await requireWorkspace(orgSlug);
  if (!canManage(org.role)) return { error: OWNERS } as const;
  const stripe = stripeClient();
  const admin = adminClient();
  if (!stripe || !admin) return { error: NOT_CONNECTED } as const;
  const { data: billing } = await admin.from("org_billing").select("*").eq("org_id", org.id).single();
  if (!billing) return { error: "We couldn't load your plan. Try again." } as const;
  return { user, org, stripe, admin, billing } as const;
}

/** The business's Stripe customer, created on first use. */
async function customerFor(s: Exclude<Awaited<ReturnType<typeof setup>>, { error: string }>): Promise<string> {
  if (s.billing.stripe_customer_id) return s.billing.stripe_customer_id;
  const c = await s.stripe.customers.create(
    { name: s.org.name, email: s.user.email || undefined, metadata: { org_id: s.org.id, org_slug: s.org.slug } },
    { idempotencyKey: `qtg-customer-${s.org.id}` },
  );
  // Only set it if nobody else did in the meantime.
  await s.admin.from("org_billing").update({ stripe_customer_id: c.id }).eq("org_id", s.org.id).is("stripe_customer_id", null);
  const { data } = await s.admin.from("org_billing").select("stripe_customer_id").eq("org_id", s.org.id).single();
  return data?.stripe_customer_id ?? c.id;
}

const fail = (e: unknown, what: string): BillingResult => {
  console.error("billing", what, e instanceof Error ? e.message : e);
  return { ok: false, error: `We couldn't reach the payment service to ${what}. Try again in a moment.` };
};

/** Start a plan (Stripe Checkout with a free trial the first time) or switch an existing subscription. */
export async function choosePlan(orgSlug: string, plan: PaidPlan): Promise<BillingResult> {
  const p = planSchema.safeParse(plan);
  if (!p.success) return { ok: false, error: "Choose a plan." };
  const s = await setup(orgSlug);
  if ("error" in s) return { ok: false, error: s.error! };
  if (s.billing.comped) return { ok: false, error: `${s.org.name} has the ${s.billing.plan} plan included at no charge, so there's nothing to pay.` };
  try {
    const price = await ensurePrice(s.stripe, { plan: p.data });
    // Already subscribed: change the plan on the same subscription (Stripe prorates the difference).
    if (s.billing.stripe_subscription_id && KEEPS_PLAN.has(s.billing.status)) {
      if (s.billing.plan === p.data) return { ok: true, message: "You're already on this plan." };
      const sub = await s.stripe.subscriptions.retrieve(s.billing.stripe_subscription_id);
      const item = sub.items.data[0];
      const updated = await s.stripe.subscriptions.update(sub.id, {
        items: [{ id: item.id, price }],
        proration_behavior: "create_prorations",
        cancel_at_period_end: false,
        metadata: { ...sub.metadata, org_id: s.org.id, plan: p.data },
      });
      await syncSubscription(s.admin, updated);
      return { ok: true, message: "Your plan is changed." };
    }
    const customer = await customerFor(s);
    const base = `${await siteUrl()}/w/${s.org.slug}/billing`;
    const session = await s.stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: s.org.id,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      metadata: { org_id: s.org.id, plan: p.data },
      subscription_data: {
        metadata: { org_id: s.org.id, plan: p.data },
        ...(s.billing.had_trial ? {} : { trial_period_days: TRIAL_DAYS }),
      },
      success_url: `${base}?checkout={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}?checkout=cancelled`,
    });
    if (!session.url) return { ok: false, error: "We couldn't open the checkout. Try again." };
    return { ok: true, url: session.url };
  } catch (e) {
    return fail(e, "start the plan");
  }
}

/** Stripe's billing page: card, invoices, cancelling. */
export async function openBillingPortal(orgSlug: string): Promise<BillingResult> {
  const s = await setup(orgSlug);
  if ("error" in s) return { ok: false, error: s.error! };
  if (!s.billing.stripe_customer_id) return { ok: false, error: "There's no billing account yet. Choose a plan first." };
  try {
    const portal = await s.stripe.billingPortal.sessions.create({
      customer: s.billing.stripe_customer_id,
      return_url: `${await siteUrl()}/w/${s.org.slug}/billing`,
    });
    return { ok: true, url: portal.url };
  } catch (e) {
    return fail(e, "open billing");
  }
}

/** Buy an event invitation pass for one RSVP form (a one-off payment). */
export async function buyEventPass(orgSlug: string, formId: string, tier: PassTier): Promise<BillingResult> {
  const t = tierSchema.safeParse(tier);
  if (!t.success || !z.uuid().safeParse(formId).success) return { ok: false, error: "Choose a form and a pass." };
  const s = await setup(orgSlug);
  if ("error" in s) return { ok: false, error: s.error! };
  // The form must belong to this business and be an RSVP form.
  const { data: form } = await s.admin.from("forms").select("id, title, settings").eq("id", formId).eq("org_id", s.org.id).maybeSingle();
  if (!form) return { ok: false, error: "We couldn't find that form." };
  if ((form.settings as { mode?: string } | null)?.mode !== "rsvp") return { ok: false, error: "Event passes are for RSVP forms. Switch the form to RSVP in its settings first." };
  const { data: current } = await s.admin.from("event_passes").select("tier").eq("form_id", form.id).eq("status", "paid")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  if ((current ?? []).some((c) => PASS_ORDER.indexOf(c.tier as PassTier) >= PASS_ORDER.indexOf(t.data))) {
    return { ok: false, error: "This form already has this pass or a bigger one." };
  }
  const pass = PASSES[t.data];
  try {
    const price = await ensurePrice(s.stripe, { pass: t.data });
    const customer = await customerFor(s);
    const { data: row, error } = await s.admin.from("event_passes").insert({
      org_id: s.org.id, form_id: form.id, tier: t.data, guest_limit: pass.guestLimit, amount_cents: pass.price * 100, created_by: s.user.id,
    }).select("id").single();
    if (error || !row) return { ok: false, error: "We couldn't start the purchase. Try again." };
    const base = `${await siteUrl()}/w/${s.org.slug}/billing`;
    const meta = { org_id: s.org.id, pass_id: row.id, form_id: form.id, tier: t.data };
    const session = await s.stripe.checkout.sessions.create({
      mode: "payment",
      customer,
      client_reference_id: s.org.id,
      line_items: [{ price, quantity: 1 }],
      metadata: meta,
      payment_intent_data: { metadata: meta, description: `Event pass (${pass.name}) for "${form.title}"`.slice(0, 200) },
      success_url: `${base}?checkout={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}?checkout=cancelled`,
    });
    await s.admin.from("event_passes").update({ stripe_session_id: session.id }).eq("id", row.id);
    if (!session.url) return { ok: false, error: "We couldn't open the checkout. Try again." };
    return { ok: true, url: session.url };
  } catch (e) {
    return fail(e, "start the purchase");
  }
}

/**
 * After returning from Checkout: apply the result straight away (the webhook does the same; whichever
 * comes first wins and the other changes nothing). Only sessions for this business are accepted.
 */
export async function confirmCheckout(orgSlug: string, sessionId: string): Promise<"plan" | "pass" | "pending" | "ignored"> {
  if (!/^cs_[A-Za-z0-9_]{6,200}$/.test(sessionId)) return "ignored";
  const { org } = await requireWorkspace(orgSlug);
  const stripe = stripeClient();
  const admin = adminClient();
  if (!stripe || !admin) return "ignored";
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.metadata?.org_id !== org.id || session.client_reference_id !== org.id) return "ignored";
    if (session.status !== "complete") return "pending";
    if (session.mode === "subscription" && session.subscription) {
      const sub = await stripe.subscriptions.retrieve(typeof session.subscription === "string" ? session.subscription : session.subscription.id);
      sub.metadata = { ...sub.metadata, org_id: org.id };
      return (await syncSubscription(admin, sub)) === "updated" ? "plan" : "ignored";
    }
    if (session.mode === "payment") return (await markPassPaid(admin, session)) === "paid" ? "pass" : "pending";
  } catch (e) {
    console.error("billing confirm", e instanceof Error ? e.message : e);
  }
  return "ignored";
}
