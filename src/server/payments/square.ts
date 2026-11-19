import "server-only";
import type { adminClient } from "@/lib/supabase/admin";
import { openToken, sealToken } from "@/server/payments/secrets";

type Admin = NonNullable<ReturnType<typeof adminClient>>;

/**
 * Square: the business signs in to its own Square account (OAuth) and lets QueuedToGo take payments on its behalf
 * with an app fee. Square is the processor and the business is the seller; Square holds the money and handles
 * disputes. Set up with SQUARE_APPLICATION_ID, SQUARE_APPLICATION_SECRET and SQUARE_ENV (sandbox or production).
 */
export const SQUARE_SCOPES = [
  "MERCHANT_PROFILE_READ", "PAYMENTS_READ", "PAYMENTS_WRITE", "PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS",
  "ORDERS_READ", "ORDERS_WRITE",
];

export function squareConfig() {
  const id = process.env.SQUARE_APPLICATION_ID?.trim() ?? "";
  const secret = process.env.SQUARE_APPLICATION_SECRET?.trim() ?? "";
  const sandbox = (process.env.SQUARE_ENV ?? "sandbox") !== "production";
  if (!id || !secret) return null;
  return { id, secret, sandbox, base: sandbox ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com" };
}
export const squareConnected = () => squareConfig() !== null;
const SQUARE_VERSION = "2026-09-18";

export function squareAuthorizeUrl(state: string): string | null {
  const c = squareConfig();
  if (!c) return null;
  const u = new URL(`${c.base}/oauth2/authorize`);
  u.searchParams.set("client_id", c.id);
  u.searchParams.set("scope", SQUARE_SCOPES.join(" "));
  u.searchParams.set("session", "false");
  u.searchParams.set("state", state);
  return u.toString();
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_at?: string; merchant_id?: string; message?: string; errors?: { detail?: string }[] };

async function squareFetch<T>(path: string, init: RequestInit & { token?: string } = {}, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; status: number; json: T }> {
  const c = squareConfig();
  if (!c) throw new Error("Square isn't set up");
  const res = await fetchImpl(`${c.base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION,
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  return { ok: res.ok, status: res.status, json: (await res.json().catch(() => ({}))) as T };
}

/** Swap the code Square sends back for the business's tokens. */
export async function squareExchangeCode(code: string, fetchImpl?: typeof fetch) {
  const c = squareConfig()!;
  const r = await squareFetch<TokenResponse>("/oauth2/token", {
    method: "POST",
    body: JSON.stringify({ client_id: c.id, client_secret: c.secret, code, grant_type: "authorization_code" }),
  }, fetchImpl);
  if (!r.ok || !r.json.access_token || !r.json.merchant_id) throw new Error(r.json.errors?.[0]?.detail ?? r.json.message ?? "Square didn't accept the sign-in");
  return { accessToken: r.json.access_token, refreshToken: r.json.refresh_token ?? null, expiresAt: r.json.expires_at ?? null, merchantId: r.json.merchant_id };
}

/** The merchant's name and main active location (where sales are recorded). */
export async function squareMerchantDetails(token: string, merchantId: string, fetchImpl?: typeof fetch) {
  const m = await squareFetch<{ merchant?: { business_name?: string; status?: string; main_location_id?: string } }>(`/v2/merchants/${encodeURIComponent(merchantId)}`, { token }, fetchImpl);
  const l = await squareFetch<{ locations?: { id: string; status?: string; capabilities?: string[]; country?: string; currency?: string }[] }>("/v2/locations", { token }, fetchImpl);
  const locs = (l.json.locations ?? []).filter((x) => x.status === "ACTIVE");
  const main = locs.find((x) => x.id === m.json.merchant?.main_location_id) ?? locs[0];
  return {
    name: m.json.merchant?.business_name ?? null,
    active: m.json.merchant?.status !== "INACTIVE",
    locationId: main?.id ?? null,
    canCharge: !!main && (main.capabilities ?? []).includes("CREDIT_CARD_PROCESSING") && (main.currency ?? "USD") === "USD",
  };
}

/** Save a newly connected Square account and its (encrypted) tokens. */
export async function saveSquareAccount(admin: Admin, orgId: string, userId: string, t: Awaited<ReturnType<typeof squareExchangeCode>>, d: Awaited<ReturnType<typeof squareMerchantDetails>>) {
  const c = squareConfig()!;
  const { error: e1 } = await admin.from("payment_accounts").upsert({
    org_id: orgId, provider: "square", account_id: t.merchantId,
    status: d.active && d.canCharge && d.locationId ? "active" : "restricted",
    charges_enabled: d.active && d.canCharge && !!d.locationId, payouts_enabled: d.active, details_submitted: true,
    requirements: d.canCharge ? [] : ["card_processing"], display_name: d.name?.slice(0, 120) ?? null,
    location_id: d.locationId, livemode: !c.sandbox, connected_by: userId, connected_at: new Date().toISOString(),
  }, { onConflict: "org_id" });
  if (e1) throw new Error(e1.code === "23505" ? "That Square account is already connected to another QueuedToGo business." : `Could not save the account: ${e1.message}`);
  const { error: e2 } = await admin.from("payment_secrets").upsert({
    org_id: orgId, provider: "square", access_token_enc: sealToken(t.accessToken),
    refresh_token_enc: t.refreshToken ? sealToken(t.refreshToken) : null, expires_at: t.expiresAt,
  }, { onConflict: "org_id" });
  if (e2) throw new Error(`Could not save the account: ${e2.message}`);
}

/** The business's Square access token, refreshed first when it's within 7 days of expiring. */
export async function squareAccessToken(admin: Admin, orgId: string, fetchImpl?: typeof fetch): Promise<string | null> {
  const { data } = await admin.from("payment_secrets").select("access_token_enc, refresh_token_enc, expires_at").eq("org_id", orgId).maybeSingle();
  if (!data) return null;
  const soon = !data.expires_at || Date.parse(data.expires_at) - Date.now() < 7 * 86_400_000;
  if (!soon || !data.refresh_token_enc) return openToken(data.access_token_enc);
  const c = squareConfig()!;
  const r = await squareFetch<TokenResponse>("/oauth2/token", {
    method: "POST",
    body: JSON.stringify({ client_id: c.id, client_secret: c.secret, refresh_token: openToken(data.refresh_token_enc), grant_type: "refresh_token" }),
  }, fetchImpl);
  if (!r.ok || !r.json.access_token) return openToken(data.access_token_enc);
  await admin.from("payment_secrets").update({
    access_token_enc: sealToken(r.json.access_token),
    ...(r.json.refresh_token ? { refresh_token_enc: sealToken(r.json.refresh_token) } : {}),
    expires_at: r.json.expires_at ?? null,
  }).eq("org_id", orgId);
  return r.json.access_token;
}

/** Tell Square to cut QueuedToGo's access to the account (used when a business disconnects). */
export async function squareRevoke(admin: Admin, orgId: string, merchantId: string) {
  const c = squareConfig();
  if (!c) return;
  await squareFetch("/oauth2/revoke", {
    method: "POST",
    headers: { Authorization: `Client ${c.secret}` },
    body: JSON.stringify({ client_id: c.id, merchant_id: merchantId }),
  }).catch(() => undefined);
  await admin.from("payment_secrets").delete().eq("org_id", orgId);
}
