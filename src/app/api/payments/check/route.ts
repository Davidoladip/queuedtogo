import { timingSafeEqual } from "node:crypto";
import { squareConfig } from "@/server/payments/square";

export const dynamic = "force-dynamic";

/**
 * Readiness check for payments, for the operator. Makes no changes anywhere: each Stripe probe sends a request that
 * Stripe must reject (bad parameters), and tells apart "your key isn't allowed to do this" (403) from "allowed, but
 * the request was invalid" (400/404). The Square probe swaps a made-up sign-in code, which tells apart wrong app
 * credentials from right ones. Answers are yes/no only, never keys or account details.
 * Only works with the PAYMENTS_CHECK_TOKEN header; 404 without it.
 */
function authorized(req: Request): boolean {
  const want = process.env.PAYMENTS_CHECK_TOKEN ?? "";
  if (want.length < 32) return false;
  // Header or ?token= (the token is temporary and removed after the check).
  const got = Buffer.from(req.headers.get("x-check-token") ?? new URL(req.url).searchParams.get("token") ?? "");
  return got.length === want.length && timingSafeEqual(got, Buffer.from(want));
}

async function stripeAllowed(key: string, method: "GET" | "POST", path: string, body?: Record<string, string>): Promise<boolean | null> {
  try {
    const r = await fetch(`https://api.stripe.com${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: body ? new URLSearchParams(body).toString() : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    await r.text();
    if (r.status === 401) return null;
    return r.status !== 403;
  } catch {
    return null;
  }
}

async function squareProbe(base: string, id: string, secret: string) {
  try {
    const r = await fetch(`${base}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Square-Version": "2025-01-23" },
      body: JSON.stringify({ client_id: id, client_secret: secret, code: "qtg-readiness-check", grant_type: "authorization_code" }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const j = (await r.json().catch(() => ({}))) as { errors?: { code?: string; category?: string; detail?: string }[]; type?: string; message?: string };
    // Square's error wording names the problem ("code not found" vs "invalid client"); it never echoes credentials.
    const words = (t: string | undefined) => (t ?? "").replace(/[A-Za-z0-9_-]{20,}/g, "…").slice(0, 160);
    return { status: r.status, codes: (j.errors ?? []).map((e) => `${e.category ?? ""}:${e.code ?? ""}:${words(e.detail)}`), type: j.type ?? null, message: words(j.message) };
  } catch {
    return { status: 0, codes: ["unreachable"], type: null };
  }
}

export async function GET(req: Request) {
  if (!authorized(req)) return new Response("Not found", { status: 404 });
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  const stripe = key
    ? {
        live: key.includes("_live_"),
        restricted: key.startsWith("rk_"),
        connectWebhookSecret: !!process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
        readAccounts: await stripeAllowed(key, "GET", "/v1/accounts?limit=1"),
        writeAccounts: await stripeAllowed(key, "POST", "/v1/accounts", { type: "qtg_invalid" }),
        writeAccountLinks: await stripeAllowed(key, "POST", "/v1/account_links", { account: "acct_qtgcheck", type: "qtg_invalid" }),
        writeCheckout: await stripeAllowed(key, "POST", "/v1/checkout/sessions", { mode: "qtg_invalid" }),
        writeRefunds: await stripeAllowed(key, "POST", "/v1/refunds", { charge: "ch_qtgcheck" }),
        readApplicationFees: await stripeAllowed(key, "GET", "/v1/application_fees?limit=1"),
      }
    : null;
  const c = squareConfig();
  const square = c
    ? {
        environment: c.sandbox ? "sandbox" : "production",
        webhookSignatureKey: !!process.env.SQUARE_WEBHOOK_SIGNATURE_KEY,
        tokenKey: (process.env.PAYMENT_TOKEN_KEY ?? "").length > 0,
        probe: await squareProbe(c.base, c.id, c.secret),
        // The same request with a deliberately wrong secret: if Square answers differently, the real secret is accepted.
        wrongSecretProbe: await squareProbe(c.base, c.id, "qtg-wrong-secret"),
        otherEnvironmentProbe: await squareProbe(c.sandbox ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com", c.id, c.secret),
      }
    : null;
  return Response.json({ stripe, square });
}
