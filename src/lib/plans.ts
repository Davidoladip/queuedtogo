// Plans and event passes. Prices and limits live here; the database has the same limits in
// public.plan_limits() (a unit test checks the two agree).

export type PlanKey = "free" | "starter" | "pro" | "events";
export type PaidPlan = Exclude<PlanKey, "free">;
export type Limits = { live_forms: number | null; members: number | null; monthly_replies: number | null; monthly_texts: number | null };

export type Plan = { key: PlanKey; name: string; price: number; blurb: string; limits: Limits; features: string[] };

export const PLANS: Record<PlanKey, Plan> = {
  free: {
    key: "free", name: "Free", price: 0, blurb: "Try it with one event.",
    limits: { live_forms: 1, members: 1, monthly_replies: 50, monthly_texts: 0 },
    features: ["1 live form", "50 replies a month", "Production board and email updates"],
  },
  starter: {
    key: "starter", name: "Starter", price: 29, blurb: "For a small shop doing regular events.",
    limits: { live_forms: 3, members: 2, monthly_replies: 500, monthly_texts: 0 },
    features: ["3 live forms", "500 replies a month", "2 team members", "All form designs and RSVP"],
  },
  pro: {
    key: "pro", name: "Pro", price: 69, blurb: "For busy vendors and growing teams.",
    limits: { live_forms: null, members: 5, monthly_replies: null, monthly_texts: 1000 },
    features: ["Unlimited live forms and replies", "5 team members", "1,000 texts a month", "Event-day tools"],
  },
  events: {
    key: "events", name: "Events", price: 139, blurb: "For planners and venues running many events.",
    limits: { live_forms: null, members: 15, monthly_replies: null, monthly_texts: 3000 },
    features: ["Everything in Pro", "15 team members", "3,000 texts a month", "Priority help"],
  },
};
export const PLAN_ORDER: PlanKey[] = ["free", "starter", "pro", "events"];
export const PAID_PLANS: PaidPlan[] = ["starter", "pro", "events"];
export const TRIAL_DAYS = 14;
export const isPaidPlan = (v: unknown): v is PaidPlan => v === "starter" || v === "pro" || v === "events";

export type PassTier = "100" | "300" | "unlimited";
export type Pass = { tier: PassTier; name: string; price: number; guestLimit: number | null };
export const PASSES: Record<PassTier, Pass> = {
  "100": { tier: "100", name: "Up to 100 guests", price: 29, guestLimit: 100 },
  "300": { tier: "300", name: "Up to 300 guests", price: 49, guestLimit: 300 },
  unlimited: { tier: "unlimited", name: "Unlimited guests", price: 69, guestLimit: null },
};
export const PASS_ORDER: PassTier[] = ["100", "300", "unlimited"];
export const isPassTier = (v: unknown): v is PassTier => v === "100" || v === "300" || v === "unlimited";

/** Stripe price lookup keys (prices are created on first use if they don't exist yet). */
export const planLookupKey = (p: PaidPlan) => `qtg_${p}_monthly`;
export const passLookupKey = (t: PassTier) => `qtg_pass_${t}`;

const DAY = 86_400_000;
/**
 * When a pass ends: 30 days after the event date (end of that day, UTC), or 120 days after purchase
 * when the form has no date. Never earlier than 30 days after purchase.
 */
export function passExpiry(eventDate: string | null | undefined, paidAt: Date): Date {
  const floor = paidAt.getTime() + 30 * DAY;
  if (eventDate && /^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    const end = Date.parse(`${eventDate}T23:59:59Z`) + 30 * DAY;
    if (Number.isFinite(end)) return new Date(Math.max(end, floor));
  }
  return new Date(paidAt.getTime() + 120 * DAY);
}

/** Stripe subscription statuses that keep the plan (the database's effective_plan agrees). */
export const KEEPS_PLAN = new Set(["trialing", "active", "past_due"]);
export const SUB_STATUSES = ["none", "trialing", "active", "past_due", "canceled", "incomplete", "incomplete_expired", "unpaid", "paused"] as const;
export type SubStatus = (typeof SUB_STATUSES)[number];
export const toSubStatus = (s: string): SubStatus => ((SUB_STATUSES as readonly string[]).includes(s) ? (s as SubStatus) : "incomplete");

export const fmtLimit = (n: number | null, unit: string) => (n === null ? `Unlimited ${unit}` : `${n.toLocaleString("en-US")} ${unit}`);

/** "12 of 50" style usage, with how full it is (0..1, or null when unlimited). */
export function usage(used: number, max: number | null): { text: string; ratio: number | null } {
  if (max === null) return { text: `${used.toLocaleString("en-US")} (no limit)`, ratio: null };
  return { text: `${used.toLocaleString("en-US")} of ${max.toLocaleString("en-US")}`, ratio: max === 0 ? 1 : Math.min(used / max, 1) };
}
