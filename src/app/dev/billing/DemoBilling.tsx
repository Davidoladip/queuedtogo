"use client";

import { BillingPanel } from "@/components/billing/BillingPanel";
import type { BillingView } from "@/lib/billing-data";
import { PLANS, type PlanKey } from "@/lib/plans";

const later = (d: number) => new Date(Date.UTC(2026, 10, 9 + d, 12)).toISOString();

function view(state: string, norsvp: boolean): BillingView {
  const plan: PlanKey = state === "free" ? "free" : state === "comped" ? "events" : state === "trial" ? "pro" : "starter";
  return {
    plan, chosen: plan,
    status: state === "trial" ? "trialing" : state === "pastdue" ? "past_due" : ["active", "cancelling", "annual", "booked"].includes(state) ? "active" : "none",
    comped: state === "comped", enforced: state !== "comped", limits: PLANS[plan].limits,
    hasCustomer: state !== "free" && state !== "comped",
    periodEnd: later(21), trialEnd: later(14), cancelAtPeriodEnd: state === "cancelling", hadTrial: state !== "free",
    interval: state === "annual" || state === "booked" ? "year" : "month",
    pending: state === "booked" ? { plan: "starter", interval: "month", at: later(21) } : null,
    paymentError: state === "pastdue" ? "Your card has insufficient funds." : null,
    usage: { liveForms: 1, members: 1, replies: plan === "free" ? 47 : 212, texts: 0 },
    passes: [{ formId: "f2", title: "Dr. Funmi's Golden Experience", tier: "300", guestLimit: 300, used: 41, expiresAt: later(60) }],
    rsvpForms: norsvp ? [] : [
      { id: "f1", title: "Spring Gala", status: "draft", eventDate: "2027-03-14" },
      { id: "f2", title: "Dr. Funmi's Golden Experience", status: "live", eventDate: "2026-12-12" },
    ],
  };
}

export function DemoBilling(p: { state: string; member: boolean; off: boolean; norsvp: boolean; checkout: "plan" | "pass" | "pending" | "cancelled" | null }) {
  return (
    <BillingPanel orgSlug="threadtogo" orgName="ThreadToGo" view={view(p.state, p.norsvp)} manage={!p.member} connected={!p.off} checkout={p.checkout}
      demoAction={async (key) => (key === "pass-unlimited" ? { ok: false, error: "We couldn't reach the payment service to start the purchase. Try again in a moment." } : { ok: true, message: `demo:${key}` })} />
  );
}
