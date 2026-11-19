"use server";

import { createHash, randomBytes } from "node:crypto";
import Stripe from "stripe";
import { z } from "zod";
import { canManage, requireWorkspace } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/urls";
import { stripeClient } from "@/server/billing";
import { createStripeAccount, onboardingLink, syncStripeAccount } from "@/server/payments/stripe-connect";
import { squareAuthorizeUrl, squareConnected, squareRevoke } from "@/server/payments/square";
import { tokenKeySet } from "@/server/payments/secrets";

export type PaymentsResult = { ok: true; url?: string; message?: string } | { ok: false; error: string };

const OWNERS = "Only owners and admins can connect a payment account.";
const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/);

async function setup(orgSlug: string) {
  if (!slugSchema.safeParse(orgSlug).success) return { error: "We couldn't find this business." } as const;
  const { user, org } = await requireWorkspace(orgSlug);
  if (!canManage(org.role)) return { error: OWNERS } as const;
  const admin = adminClient();
  if (!admin) return { error: "Payments aren't available right now. Try again later." } as const;
  const { data: account } = await admin.from("payment_accounts").select("*").eq("org_id", org.id).maybeSingle();
  return { user, org, admin, account } as const;
}

const fail = (e: unknown, what: string): PaymentsResult => {
  console.error(`payments: ${what}`, e instanceof Error ? e.message : e);
  if (e instanceof Stripe.errors.StripeError && /connect|platform/i.test(e.message)) {
    return { ok: false, error: "Stripe Connect isn't switched on for QueuedToGo yet. Please check back soon." };
  }
  return { ok: false, error: `We couldn't ${what}. Try again, or contact us if it keeps happening.` };
};

/** Start or continue Stripe's sign-up for this business's own Stripe account. */
export async function connectStripe(orgSlug: string): Promise<PaymentsResult> {
  const s = await setup(orgSlug);
  if ("error" in s) return { ok: false, error: s.error! };
  const stripe = stripeClient();
  if (!stripe) return { ok: false, error: "Stripe isn't available right now. Try again later." };
  if (s.account && s.account.provider !== "stripe" && s.account.status !== "disconnected") {
    return { ok: false, error: "This business is connected to Square. Disconnect Square first to use Stripe instead." };
  }
  try {
    let accountId = s.account?.provider === "stripe" && s.account.status !== "disconnected" ? s.account.account_id : null;
    if (!accountId) {
      accountId = await createStripeAccount(stripe, s.org, s.user.email || null);
      const { error } = await s.admin.from("payment_accounts").upsert({
        org_id: s.org.id, provider: "stripe", account_id: accountId, status: "pending", charges_enabled: false,
        payouts_enabled: false, details_submitted: false, requirements: [], display_name: s.org.name.slice(0, 120),
        location_id: null, livemode: (process.env.STRIPE_SECRET_KEY ?? "").includes("_live_"), connected_by: s.user.id,
        connected_at: new Date().toISOString(),
      }, { onConflict: "org_id" });
      if (error) return fail(error, "save the account");
      await s.admin.from("payment_secrets").delete().eq("org_id", s.org.id);
    }
    const url = await onboardingLink(stripe, accountId, `${await siteUrl()}/w/${s.org.slug}/payments`);
    return { ok: true, url };
  } catch (e) {
    return fail(e, "open Stripe's sign-up");
  }
}

/** Ask Stripe for the latest status (used when the owner comes back from Stripe's sign-up). */
export async function refreshPaymentAccount(orgSlug: string): Promise<PaymentsResult> {
  const s = await setup(orgSlug);
  if ("error" in s) return { ok: false, error: s.error! };
  if (!s.account || s.account.provider !== "stripe" || s.account.status === "disconnected") return { ok: true };
  const stripe = stripeClient();
  if (!stripe) return { ok: true };
  try {
    const a = await stripe.accounts.retrieve(s.account.account_id);
    await syncStripeAccount(s.admin, a);
    return { ok: true };
  } catch (e) {
    return fail(e, "check the account with Stripe");
  }
}

/** Start Square's sign-in so the business can connect its own Square account. */
export async function connectSquare(orgSlug: string): Promise<PaymentsResult> {
  const s = await setup(orgSlug);
  if ("error" in s) return { ok: false, error: s.error! };
  if (!squareConnected() || !tokenKeySet()) return { ok: false, error: "Square isn't available yet. Please check back soon." };
  if (s.account && s.account.provider !== "square" && s.account.status !== "disconnected") {
    return { ok: false, error: "This business is connected to Stripe. Disconnect Stripe first to use Square instead." };
  }
  const state = randomBytes(32).toString("base64url");
  const { error } = await s.admin.from("payment_oauth_states").insert({
    state_hash: createHash("sha256").update(state).digest("hex"), org_id: s.org.id, user_id: s.user.id, provider: "square",
  });
  if (error) return fail(error, "start Square's sign-in");
  await s.admin.from("payment_oauth_states").delete().lt("expires_at", new Date().toISOString());
  const url = squareAuthorizeUrl(state);
  return url ? { ok: true, url } : { ok: false, error: "Square isn't available yet." };
}

/**
 * Stop selling through the connected account. Paid orders and tickets already sold stay as they are; the money and
 * any refunds stay in the business's own Stripe or Square account.
 */
export async function disconnectPayments(orgSlug: string): Promise<PaymentsResult> {
  const s = await setup(orgSlug);
  if ("error" in s) return { ok: false, error: s.error! };
  if (s.org.role !== "owner") return { ok: false, error: "Only the owner can disconnect the payment account." };
  if (!s.account || s.account.status === "disconnected") return { ok: true, message: "Nothing is connected." };
  if (s.account.provider === "square") await squareRevoke(s.admin, s.org.id, s.account.account_id);
  const { error } = await s.admin.from("payment_accounts")
    .update({ status: "disconnected", charges_enabled: false, payouts_enabled: false }).eq("org_id", s.org.id);
  if (error) return fail(error, "disconnect the account");
  return { ok: true, message: `${s.account.provider === "stripe" ? "Stripe" : "Square"} is disconnected. New sales are off; past sales and payouts aren't affected.` };
}
