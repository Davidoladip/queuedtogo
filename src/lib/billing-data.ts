import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isPassTier, type Interval, type Limits, type PaidPlan, type PassTier, type PlanKey, type SubStatus, toSubStatus } from "@/lib/plans";

export type BillingView = {
  plan: PlanKey;
  /** The plan chosen in Stripe (may differ from `plan` while unpaid). */
  chosen: PlanKey;
  status: SubStatus;
  comped: boolean;
  enforced: boolean;
  limits: Limits;
  hasCustomer: boolean;
  periodEnd: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hadTrial: boolean;
  interval: Interval;
  /** A change booked for the renewal date (annual to monthly). */
  pending: { plan: PaidPlan; interval: Interval; at: string } | null;
  /** Stripe's reason the last renewal failed, while it's unpaid. */
  paymentError: string | null;
  usage: { liveForms: number; members: number; replies: number; texts: number };
  passes: { formId: string; title: string; tier: PassTier; guestLimit: number | null; used: number; expiresAt: string | null }[];
  rsvpForms: { id: string; title: string; status: string; eventDate: string | null }[];
};

const asPlan = (v: unknown): PlanKey => (v === "starter" || v === "pro" || v === "events" ? v : "free");

/** Everything the Billing page shows, read as the signed-in member (row level security applies). */
export async function loadBilling(orgId: string): Promise<BillingView> {
  const supabase = await createClient();
  const [{ data: ov, error: oErr }, { data: row }, { data: forms }] = await Promise.all([
    supabase.rpc("billing_overview", { p_org: orgId }),
    supabase.from("org_billing").select("*").eq("org_id", orgId).maybeSingle(),
    supabase.from("forms").select("id, title, status, event_date, settings").eq("org_id", orgId).order("created_at", { ascending: false }),
  ]);
  if (oErr) throw new Error(`Could not load billing: ${oErr.message}`);
  const o = (ov ?? {}) as Record<string, unknown>;
  const titles = new Map((forms ?? []).map((f) => [f.id, f.title]));
  return {
    plan: asPlan(o.plan),
    chosen: asPlan(row?.plan),
    status: toSubStatus(row?.status ?? "none"),
    comped: !!row?.comped,
    enforced: !!o.enforced,
    limits: (o.limits ?? {}) as Limits,
    hasCustomer: !!row?.stripe_customer_id,
    periodEnd: row?.current_period_end ?? null,
    trialEnd: row?.trial_end ?? null,
    cancelAtPeriodEnd: !!row?.cancel_at_period_end,
    hadTrial: !!row?.had_trial,
    interval: row?.billing_interval === "year" ? "year" : "month",
    pending: row?.pending_plan && row.pending_change_at && asPlan(row.pending_plan) !== "free"
      ? { plan: asPlan(row.pending_plan) as PaidPlan, interval: row.pending_interval === "year" ? "year" : "month", at: row.pending_change_at } : null,
    paymentError: row?.last_payment_error ?? null,
    usage: { liveForms: Number(o.live_forms ?? 0), members: Number(o.members ?? 0), replies: Number(o.replies_month ?? 0), texts: Number(o.texts_month ?? 0) },
    passes: ((o.passes ?? []) as { form_id: string; tier: string; guest_limit: number | null; used: number; expires_at: string | null }[])
      .filter((p) => isPassTier(p.tier))
      .map((p) => ({ formId: p.form_id, title: titles.get(p.form_id) ?? "A form", tier: p.tier as PassTier, guestLimit: p.guest_limit, used: Number(p.used), expiresAt: p.expires_at })),
    rsvpForms: (forms ?? []).filter((f) => (f.settings as { mode?: string } | null)?.mode === "rsvp")
      .map((f) => ({ id: f.id, title: f.title, status: f.status, eventDate: f.event_date })),
  };
}
