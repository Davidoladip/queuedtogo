import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/auth";
import { feePercentLabel } from "@/lib/payments";
import { loadPayments } from "@/lib/payments-data";
import { refreshPaymentAccount } from "@/server/actions/payments";
import { stripeClient } from "@/server/billing";
import { squareConnected } from "@/server/payments/square";
import { tokenKeySet } from "@/server/payments/secrets";
import { PaymentsPanel } from "@/components/payments/PaymentsPanel";
import "@/components/billing/billing.css";
import "@/components/payments/payments.css";

export const metadata: Metadata = { title: "Get paid" };

const NOTICES: Record<string, { tone: "success" | "error" | "info"; text: string }> = {
  "square=connected": { tone: "success", text: "Square is connected." },
  "square=cancelled": { tone: "info", text: "Square wasn't connected. You can try again any time." },
  "square=expired": { tone: "error", text: "That Square sign-in took too long or was started elsewhere. Please try again from this page." },
  "square=taken": { tone: "error", text: "That Square account is already connected to another QueuedToGo business." },
  "square=failed": { tone: "error", text: "We couldn't connect Square. Please try again." },
  "connect=retry": { tone: "info", text: "Stripe's sign-up link expired. Click Continue setup with Stripe to pick up where you left off." },
};

export default async function PaymentsPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const { org } = await requireWorkspace(orgSlug);
  // Back from Stripe's sign-up: get the latest status now rather than waiting for the webhook.
  if (sp.connect === "done") await refreshPaymentAccount(org.slug);
  const data = await loadPayments(org.id);
  const key = sp.square ? `square=${sp.square}` : sp.connect ? `connect=${sp.connect}` : "";
  const notice = sp.connect === "done"
    ? (data.account?.status === "active" ? { tone: "success" as const, text: "Your Stripe account is ready to take payments." } : { tone: "info" as const, text: "Thanks. Stripe is checking your details; this page updates when it's done." })
    : NOTICES[key] ?? null;
  return (
    <>
      <div className="view-head">
        <div>
          <h1>Get paid</h1>
          <p>Connect your own Stripe or Square account to sell tickets and take pre-paid orders.</p>
        </div>
      </div>
      <PaymentsPanel orgSlug={org.slug} account={data.account} allowed={data.allowed} feeLabel={feePercentLabel(data.plan)} comped={data.comped}
        role={org.role} stripeAvailable={!!stripeClient()} squareAvailable={squareConnected() && tokenKeySet()} notice={notice} />
    </>
  );
}
