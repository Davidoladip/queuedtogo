"use client";

import { PaymentsPanel } from "@/components/payments/PaymentsPanel";
import type { PaymentAccountView } from "@/lib/payments";

function account(state: string): PaymentAccountView {
  if (state === "none") return null;
  const square = state === "square";
  return {
    provider: square ? "square" : "stripe",
    status: square ? "active" : (["pending", "restricted", "active", "disconnected"] as const).find((s) => s === state) ?? "pending",
    chargesEnabled: state === "active" || square, payoutsEnabled: state === "active" || square, detailsSubmitted: state !== "pending",
    requirements: state === "restricted" ? ["external_account", "individual.verification.document", "individual.ssn_last_4"] : state === "pending" ? ["business_profile.url", "tos_acceptance.date"] : [],
    displayName: "ThreadToGo LLC", livemode: false,
  };
}

export function DemoPayments(p: { state: string; role: "owner" | "admin" | "member"; allowed: boolean; nosquare: boolean; comped: boolean }) {
  return (
    <PaymentsPanel orgSlug="threadtogo" account={account(p.state)} allowed={p.allowed} feeLabel="1%" comped={p.comped} role={p.role}
      stripeAvailable squareAvailable={!p.nosquare} notice={null}
      demoAction={async (key) => (key === "square" ? { ok: false, error: "Square isn't available yet. Please check back soon." } : { ok: true, message: `demo:${key}` })} />
  );
}
