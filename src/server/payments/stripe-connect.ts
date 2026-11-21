import "server-only";
import type Stripe from "stripe";
import type { adminClient } from "@/lib/supabase/admin";
import type { AccountStatus } from "@/lib/payments";

type Admin = NonNullable<ReturnType<typeof adminClient>>;

/**
 * A new Stripe account for a business, owned by the business: full Stripe dashboard, Stripe collects the identity
 * and bank details, Stripe's fees are paid by the business, and Stripe (not QueuedToGo) is liable for losses such as
 * unpaid refunds and chargebacks. This is the setup where the business, not the platform, carries the risk.
 */
export async function createStripeAccount(stripe: Stripe, org: { id: string; name: string; slug: string }, email: string | null): Promise<string> {
  const acct = await stripe.accounts.create(
    {
      country: "US",
      ...(email ? { email } : {}),
      controller: {
        stripe_dashboard: { type: "full" },
        fees: { payer: "account" },
        losses: { payments: "stripe" },
        requirement_collection: "stripe",
      },
      business_profile: { name: org.name.slice(0, 100) },
      metadata: { qtg_org_id: org.id, qtg_org_slug: org.slug },
    },
    { idempotencyKey: `qtg-connect-${org.id}` },
  );
  return acct.id;
}

/** Stripe's sign-up page for the account (new or unfinished). The link works once and expires after a few minutes. */
export async function onboardingLink(stripe: Stripe, accountId: string, base: string): Promise<string> {
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${base}?connect=retry`,
    return_url: `${base}?connect=done`,
  });
  return link.url;
}

/** Stripe's account details in QueuedToGo's terms. */
export function stripeAccountState(a: Stripe.Account): {
  status: AccountStatus; charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean;
  requirements: string[]; display_name: string | null; livemode: boolean;
} {
  const due = [...(a.requirements?.currently_due ?? []), ...(a.requirements?.past_due ?? [])];
  const disabled = !!a.requirements?.disabled_reason && a.requirements.disabled_reason !== "requirements.pending_verification";
  const status: AccountStatus = a.charges_enabled && !disabled ? "active" : a.details_submitted && (disabled || due.length) ? "restricted" : "pending";
  return {
    status,
    charges_enabled: !!a.charges_enabled,
    payouts_enabled: !!a.payouts_enabled,
    details_submitted: !!a.details_submitted,
    requirements: [...new Set(due)].slice(0, 50).map((r) => r.slice(0, 120)),
    display_name: (a.business_profile?.name ?? a.settings?.dashboard?.display_name ?? null)?.slice(0, 120) ?? null,
    // Account objects don't say whether they're live; the platform key does (live keys contain "_live_").
    livemode: (process.env.STRIPE_SECRET_KEY ?? "").includes("_live_"),
  };
}

/** Save Stripe's view of a connected account onto the business that owns it (matched by account id only). */
export async function syncStripeAccount(admin: Admin, a: Stripe.Account): Promise<"updated" | "ignored"> {
  const { data, error } = await admin.from("payment_accounts")
    .update(stripeAccountState(a))
    .eq("provider", "stripe").eq("account_id", a.id).neq("status", "disconnected")
    .select("org_id");
  if (error) throw new Error(`Could not save the payment account: ${error.message}`);
  return data?.length ? "updated" : "ignored";
}
