import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { feeRate, type PaymentAccountView, type PaymentProvider, type AccountStatus, type PaymentsStatus } from "@/lib/payments";
import type { PlanKey } from "@/lib/plans";

/** The business's payment account, plan and whether selling is switched on (membership already checked). */
export async function loadPayments(orgId: string): Promise<{ account: PaymentAccountView; allowed: boolean; plan: PlanKey; comped: boolean }> {
  const admin = adminClient();
  if (!admin) return { account: null, allowed: false, plan: "free", comped: false };
  const [{ data: a }, { data: b }, { data: eff }] = await Promise.all([
    admin.from("payment_accounts").select("provider, status, charges_enabled, payouts_enabled, details_submitted, requirements, display_name, livemode").eq("org_id", orgId).maybeSingle(),
    admin.from("org_billing").select("payments_allowed, comped").eq("org_id", orgId).maybeSingle(),
    admin.rpc("effective_plan", { p_org: orgId }),
  ]);
  const plan = (["free", "starter", "pro", "events"] as const).find((p) => p === eff) ?? "free";
  return {
    account: a ? {
      provider: a.provider as PaymentProvider, status: a.status as AccountStatus, chargesEnabled: a.charges_enabled,
      payoutsEnabled: a.payouts_enabled, detailsSubmitted: a.details_submitted, requirements: a.requirements ?? [],
      displayName: a.display_name, livemode: a.livemode,
    } : null,
    allowed: !!b?.payments_allowed,
    plan,
    comped: !!b?.comped,
  };
}

/** Whether the business may sell, whether it can right now, and its platform fee rate (membership already checked). */
export async function loadPaymentsStatus(orgId: string): Promise<PaymentsStatus> {
  const admin = adminClient();
  if (!admin) return { allowed: false, ready: false, rate: 0 };
  const [p, { data: ready }] = await Promise.all([loadPayments(orgId), admin.rpc("payments_ready", { p_org: orgId })]);
  return { allowed: p.allowed, ready: ready === true, rate: feeRate(p.plan, p.comped) };
}
