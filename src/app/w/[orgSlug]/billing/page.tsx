import type { Metadata } from "next";
import { canManage, requireWorkspace } from "@/lib/auth";
import { loadBilling } from "@/lib/billing-data";
import { billingConnected } from "@/server/billing";
import { confirmCheckout } from "@/server/actions/billing";
import { BillingPanel } from "@/components/billing/BillingPanel";
import "@/components/billing/billing.css";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { org } = await requireWorkspace(orgSlug);
  // Back from Stripe Checkout: apply the result now rather than waiting for the webhook.
  const checkout = sp.checkout === "cancelled" ? "cancelled" : sp.checkout ? await confirmCheckout(org.slug, sp.checkout) : null;
  const view = await loadBilling(org.id);
  return (
    <>
      <div className="view-head">
        <div>
          <h1>Billing</h1>
          <p>Your plan, what you&apos;ve used this month, and event invitation passes.</p>
        </div>
      </div>
      <BillingPanel orgSlug={org.slug} orgName={org.name} view={view} manage={canManage(org.role)} connected={billingConnected()} checkout={checkout} />
    </>
  );
}
