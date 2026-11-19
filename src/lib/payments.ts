// Stage 10: tickets and pre-paid orders. Each business sells through its own Stripe or Square account; QueuedToGo
// takes a platform fee per paid sale. Fee rates live here next to the plan prices so they can be changed the same way.

import type { PlanKey } from "@/lib/plans";

export type PaymentProvider = "stripe" | "square";
export const PROVIDER_NAMES: Record<PaymentProvider, string> = { stripe: "Stripe", square: "Square" };

/** QueuedToGo's platform fee, by the business's plan. Lower on higher plans. */
export const PLATFORM_FEE_RATE: Record<PlanKey, number> = { free: 0.03, starter: 0.02, pro: 0.01, events: 0.005 };

/** How long seats or stock are held while a buyer pays. */
export const HOLD_MINUTES = 15;

/**
 * The platform fee in cents for a sale of `cents` (before any fee), rounded to the nearest cent.
 * Free sales and comped businesses pay nothing.
 */
export function platformFeeCents(cents: number, plan: PlanKey, comped = false): number {
  if (!Number.isInteger(cents) || cents <= 0 || comped) return 0;
  return Math.round(cents * PLATFORM_FEE_RATE[plan]);
}

/** The platform fee rate a business pays (0 when comped). */
export const feeRate = (plan: PlanKey, comped: boolean) => (comped ? 0 : PLATFORM_FEE_RATE[plan]);

/** What the form builder needs to know about selling. */
export type PaymentsStatus = { allowed: boolean; ready: boolean; rate: number };

export const feePercentLabel = (plan: PlanKey) => `${+(PLATFORM_FEE_RATE[plan] * 100).toFixed(2)}%`;

export type AccountStatus = "pending" | "active" | "restricted" | "disconnected";

/** How a business's connected account looks on the "Get paid" page. */
export type PaymentAccountView = {
  provider: PaymentProvider;
  status: AccountStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirements: string[];
  displayName: string | null;
  livemode: boolean;
} | null;

/** Plain words for Stripe's requirement codes ("individual.verification.document" → "an ID document"). */
export function requirementLabel(code: string): string {
  const c = code.toLowerCase();
  if (c.includes("external_account")) return "a bank account for payouts";
  if (c.includes("verification.document")) return "a photo of an ID document";
  if (c.includes("verification.additional_document")) return "a proof of address document";
  if (c.includes("ssn_last_4") || c.includes("id_number")) return "a Social Security or tax ID number";
  if (c.includes("dob")) return "date of birth";
  if (c.includes("address")) return "an address";
  if (c.includes("tos_acceptance")) return "accepting Stripe's terms";
  if (c.includes("business_profile.url") || c.includes("business_profile.product_description")) return "a website or description of what you sell";
  if (c.includes("business_profile.mcc")) return "your type of business";
  if (c.includes("phone")) return "a phone number";
  if (c.includes("email")) return "an email address";
  if (c.includes("tax_id") || c.includes("company.tax_id")) return "your business tax ID (EIN)";
  if (c.includes("representative") || c.includes("owners") || c.includes("directors")) return "details of the business's owners";
  if (c.includes("name")) return "names";
  return "more details";
}
