import "server-only";
import { billingEmail, emailConfig, isEmail, sendEmail } from "@/lib/email";
import { PLANS, type PlanKey } from "@/lib/plans";
import type { adminClient } from "@/lib/supabase/admin";
import type { BillingNotice } from "@/server/billing";
import { siteBase } from "@/server/messaging";

type Admin = NonNullable<ReturnType<typeof adminClient>>;

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;

/** Email a billing notice to the business's owners and admins. Never throws: a failed email mustn't fail the webhook. */
export async function notifyOwners(admin: Admin, n: BillingNotice): Promise<void> {
  try {
    const cfg = emailConfig();
    if (!cfg) return;
    const [{ data: org }, { data: bill }, { data: people }] = await Promise.all([
      admin.from("organizations").select("name, slug").eq("id", n.orgId).single(),
      admin.from("org_billing").select("plan").eq("org_id", n.orgId).single(),
      admin.from("organization_members").select("role, profiles(email)").eq("org_id", n.orgId).in("role", ["owner", "admin"]),
    ]);
    if (!org) return;
    const plan = PLANS[(bill?.plan as PlanKey) ?? "free"]?.name ?? "paid";
    const msg = billingEmail({ kind: n.kind, business: org.name, plan, billingUrl: `${siteBase()}/w/${org.slug}/billing`, reason: n.reason, endsOn: day(n.endsAt) });
    const to = [...new Set((people ?? []).map((p) => (p.profiles as { email?: string | null } | null)?.email ?? "").filter(isEmail))].slice(0, 10);
    for (const address of to) {
      const r = await sendEmail(cfg, { to: address, ...msg, tags: { kind: `billing_${n.kind}` } });
      if (!r.ok) console.error("billing email", n.kind, r.code);
    }
  } catch (e) {
    console.error("billing email", n.kind, e instanceof Error ? e.message : e);
  }
}
