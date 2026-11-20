import { randomBytes } from "node:crypto";
import type Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/messaging", () => ({ dispatchQueued: vi.fn(async () => ({})) }));
import { PLATFORM_FEE_RATE, feePercentLabel, platformFeeCents, requirementLabel } from "@/lib/payments";
import { openToken, sealToken } from "@/server/payments/secrets";
import { stripeAccountState, syncStripeAccount } from "@/server/payments/stripe-connect";
import { handleConnectEvent } from "@/server/payments/connect-events";
import { squareAuthorizeUrl, squareExchangeCode, squareMerchantDetails } from "@/server/payments/square";

type R = Record<string, unknown>;
function fakeAdmin(tables: Record<string, R[]>) {
  const from = (t: string) => {
    let op: "select" | "update" | "upsert" = "select";
    let patch: R = {};
    const filters: ((r: R) => boolean)[] = [];
    const rows = () => (tables[t] ??= []);
    const run = () => {
      const hit = rows().filter((r) => filters.every((f) => f(r)));
      if (op === "update") { hit.forEach((r) => Object.assign(r, patch)); return { data: hit, error: null }; }
      if (op === "upsert") { if (!rows().some((r) => r.id === patch.id)) rows().push(patch); return { data: null, error: null }; }
      return { data: hit, error: null };
    };
    const b: R = {
      select: () => b,
      update: (p: R) => { op = "update"; patch = p; return b; },
      upsert: (p: R) => { op = "upsert"; patch = p; return b; },
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return b; },
      neq: (k: string, v: unknown) => { filters.push((r) => r[k] !== v); return b; },
      maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
      then: (res: (x: unknown) => unknown) => Promise.resolve(run()).then(res),
    };
    return b;
  };
  return { from } as never;
}

describe("platform fee", () => {
  it("is lower on higher plans and rounds to the cent", () => {
    expect(PLATFORM_FEE_RATE).toEqual({ free: 0.03, starter: 0.02, pro: 0.01, events: 0.005 });
    expect(platformFeeCents(4000, "free")).toBe(120);
    expect(platformFeeCents(4000, "pro")).toBe(40);
    expect(platformFeeCents(4000, "events")).toBe(20);
    expect(platformFeeCents(2550, "starter")).toBe(51);
    expect(feePercentLabel("events")).toBe("0.5%");
  });
  it("is nothing on free sales and for comped businesses", () => {
    expect(platformFeeCents(0, "free")).toBe(0);
    expect(platformFeeCents(4000, "free", true)).toBe(0);
    expect(platformFeeCents(-5, "free")).toBe(0);
    expect(platformFeeCents(10.5, "free")).toBe(0);
  });
});

describe("Stripe's requirements in plain words", () => {
  it("explains common ones", () => {
    expect(requirementLabel("external_account")).toBe("a bank account for payouts");
    expect(requirementLabel("individual.verification.document")).toBe("a photo of an ID document");
    expect(requirementLabel("tos_acceptance.date")).toBe("accepting Stripe's terms");
    expect(requirementLabel("something.new")).toBe("more details");
  });
});

describe("stored Square tokens", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("are encrypted and only readable with the key", () => {
    vi.stubEnv("PAYMENT_TOKEN_KEY", randomBytes(32).toString("base64"));
    const sealed = sealToken("EAAAl-secret-token");
    expect(sealed).not.toContain("secret");
    expect(openToken(sealed)).toBe("EAAAl-secret-token");
    const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "B" : "A") + sealed.slice(-1);
    expect(() => openToken(tampered)).toThrow();
    vi.stubEnv("PAYMENT_TOKEN_KEY", randomBytes(32).toString("base64"));
    expect(() => openToken(sealed)).toThrow();
  });
  it("refuse to work without a proper key", () => {
    vi.stubEnv("PAYMENT_TOKEN_KEY", "short");
    expect(() => sealToken("x")).toThrow(/32 bytes/);
  });
});

const acct = (o: Partial<Stripe.Account> = {}) => ({
  id: "acct_TEST1", object: "account", charges_enabled: false, payouts_enabled: false, details_submitted: false,
  requirements: { currently_due: [], past_due: [], disabled_reason: null }, business_profile: { name: "ThreadToGo LLC" }, ...o,
}) as unknown as Stripe.Account;

describe("Stripe account status", () => {
  it("maps Stripe's account onto pending, restricted and active", () => {
    expect(stripeAccountState(acct({ requirements: { currently_due: ["tos_acceptance.date"], past_due: [], disabled_reason: "requirements.past_due" } as never })).status).toBe("pending");
    expect(stripeAccountState(acct({ details_submitted: true, requirements: { currently_due: ["external_account"], past_due: [], disabled_reason: "requirements.past_due" } as never })).status).toBe("restricted");
    const ok = stripeAccountState(acct({ details_submitted: true, charges_enabled: true, payouts_enabled: true }));
    expect(ok).toMatchObject({ status: "active", charges_enabled: true, payouts_enabled: true, display_name: "ThreadToGo LLC", requirements: [] });
  });
  it("updates only the business that owns the account, and never a disconnected one", async () => {
    const t = { payment_accounts: [
      { org_id: "o1", provider: "stripe", account_id: "acct_TEST1", status: "pending" },
      { org_id: "o2", provider: "stripe", account_id: "acct_OTHER", status: "pending" },
      { org_id: "o3", provider: "stripe", account_id: "acct_OLD", status: "disconnected" },
    ] as R[] };
    expect(await syncStripeAccount(fakeAdmin(t), acct({ charges_enabled: true, details_submitted: true }))).toBe("updated");
    expect(t.payment_accounts[0].status).toBe("active");
    expect(t.payment_accounts[1].status).toBe("pending");
    expect(await syncStripeAccount(fakeAdmin(t), acct({ id: "acct_OLD", charges_enabled: true }))).toBe("ignored");
    expect(t.payment_accounts[2].status).toBe("disconnected");
  });
});

describe("Connect webhooks", () => {
  it("re-read the account from Stripe, apply each event once, and stop sales when a business removes QueuedToGo", async () => {
    const t = { payment_accounts: [{ org_id: "o1", provider: "stripe", account_id: "acct_TEST1", status: "pending", charges_enabled: false }] as R[], stripe_events: [] as R[] };
    const stripe = { accounts: { retrieve: vi.fn(async () => acct({ charges_enabled: true, details_submitted: true })) } } as unknown as Stripe;
    const ev = { id: "evt_C1", type: "account.updated", account: "acct_TEST1", data: { object: acct() } } as unknown as Stripe.Event;
    expect(await handleConnectEvent(fakeAdmin(t), stripe, ev)).toBe("updated");
    expect(t.payment_accounts[0]).toMatchObject({ status: "active", charges_enabled: true });
    expect(await handleConnectEvent(fakeAdmin(t), stripe, ev)).toBe("duplicate");
    const gone = { id: "evt_C2", type: "account.application.deauthorized", account: "acct_TEST1", data: { object: {} } } as unknown as Stripe.Event;
    expect(await handleConnectEvent(fakeAdmin(t), stripe, gone)).toBe("disconnected");
    expect(t.payment_accounts[0]).toMatchObject({ status: "disconnected", charges_enabled: false });
  });
});

describe("Square sign-in", () => {
  afterEach(() => vi.unstubAllEnvs());
  const env = () => { vi.stubEnv("SQUARE_APPLICATION_ID", "sandbox-sq0idb-TEST"); vi.stubEnv("SQUARE_APPLICATION_SECRET", "sandbox-sq0csb-SECRET");  };
  it("asks only for payment permissions, with a one-time state", () => {
    env();
    const u = new URL(squareAuthorizeUrl("STATE123")!);
    expect(u.origin).toBe("https://connect.squareupsandbox.com");
    expect(u.searchParams.get("state")).toBe("STATE123");
    expect(u.searchParams.get("scope")).toContain("PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS");
    expect(u.searchParams.get("scope")).not.toMatch(/CUSTOMERS|EMPLOYEES|BANK/);
    expect(u.toString()).not.toContain("SECRET");
  });
  it("swaps the code for tokens and finds the main location", async () => {
    env();
    const calls: string[] = [];
    const f = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith("/oauth2/token")) return new Response(JSON.stringify({ access_token: "EAAA1", refresh_token: "R1", expires_at: "2026-12-19T00:00:00Z", merchant_id: "MLM1" }));
      if (url.includes("/v2/merchants/")) return new Response(JSON.stringify({ merchant: { business_name: "ThreadToGo", status: "ACTIVE", main_location_id: "L2" } }));
      return new Response(JSON.stringify({ locations: [{ id: "L1", status: "ACTIVE", capabilities: [] }, { id: "L2", status: "ACTIVE", capabilities: ["CREDIT_CARD_PROCESSING"], currency: "USD" }] }));
    }) as unknown as typeof fetch;
    const t = await squareExchangeCode("CODE", f);
    expect(t).toMatchObject({ accessToken: "EAAA1", merchantId: "MLM1" });
    const d = await squareMerchantDetails(t.accessToken, t.merchantId, f);
    expect(d).toEqual({ name: "ThreadToGo", active: true, locationId: "L2", canCharge: true });
  });
  it("reports Square's refusal", async () => {
    env();
    const f = vi.fn(async () => new Response(JSON.stringify({ errors: [{ detail: "Authorization code is expired" }] }), { status: 401 })) as unknown as typeof fetch;
    await expect(squareExchangeCode("OLD", f)).rejects.toThrow("expired");
  });
});
