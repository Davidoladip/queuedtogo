import { createHmac, randomBytes } from "node:crypto";
import type Stripe from "stripe";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/messaging", () => ({ dispatchQueued: vi.fn(async () => ({})) }));
import { createSquareCheckout, createStripeCheckout, squareOrderPaid, type CheckoutOrder } from "@/server/payments/checkout";
import { handleConnectEvent } from "@/server/payments/connect-events";
import { squareSignatureOk } from "@/server/payments/square";
import { sealToken } from "@/server/payments/secrets";
import type { Line } from "@/lib/pricing";

type R = Record<string, unknown>;

/** A small stand-in for the Supabase admin client: tables in memory, RPC answers supplied by the test. */
function fakeAdmin(tables: Record<string, R[]>, rpc: (name: string, args: R) => unknown = () => null) {
  const calls: { rpc: [string, R][]; removed: string[] } = { rpc: [], removed: [] };
  const from = (t: string) => {
    let op: "select" | "update" | "upsert" = "select";
    let patch: R = {};
    const filters: ((r: R) => boolean)[] = [];
    const rows = () => (tables[t] ??= []);
    const run = () => {
      const hit = rows().filter((r) => filters.every((f) => f(r)));
      if (op === "update") hit.forEach((r) => Object.assign(r, patch));
      if (op === "upsert" && !rows().some((r) => r.id === patch.id)) rows().push(patch);
      return { data: hit, error: null };
    };
    const b: R = {
      select: () => b,
      update: (p: R) => { op = "update"; patch = p; return b; },
      upsert: (p: R) => { op = "upsert"; patch = p; return b; },
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return b; },
      maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
      then: (res: (x: unknown) => unknown) => Promise.resolve(run()).then(res),
    };
    return b;
  };
  const admin = {
    from,
    rpc: async (name: string, args: R) => { calls.rpc.push([name, args]); return { data: rpc(name, args), error: null }; },
    storage: { from: () => ({ remove: async (paths: string[]) => { calls.removed.push(...paths); return { error: null }; } }) },
  };
  return { admin: admin as never, calls };
}

const lines: Line[] = [
  { fieldId: "f", option: 0, name: "General admission", unit: 2500, qty: 2, amount: 5000, ticket: "tt_general01" },
  { fieldId: "f", option: 1, name: "Comp", unit: 0, qty: 1, amount: 0, ticket: "tt_comp00001" },
  { fieldId: "s", option: 1, name: "Event tee", unit: 1800, qty: 1, amount: 1800 },
];
const order = (o: Partial<CheckoutOrder> = {}): CheckoutOrder => ({
  id: "6f1c1d1e-0000-4000-8000-000000000001", orgId: "org1", accountId: "acct_SELLER1", locationId: "L1", lines,
  feeCents: 136, feePayer: "guest", totalCents: 6936, holdExpiresAt: "2026-11-19T12:31:00.000Z", email: "ada@example.com", title: "Harbourfront Gala", ...o,
});

describe("Stripe Checkout on the business's account", () => {
  it("is a direct charge with QueuedToGo's fee as the application fee, expiring with the hold", async () => {
    const create = vi.fn(async () => ({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }));
    const stripe = { checkout: { sessions: { create } } } as unknown as Stripe;
    const r = await createStripeCheckout(stripe, order(), { success: "https://queuedtogo.com/pay/x", cancel: "https://queuedtogo.com/pay/x/cancel" });
    expect(r).toEqual({ checkoutId: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1", paymentRef: null });
    const [params, opts] = create.mock.calls[0] as unknown as [Stripe.Checkout.SessionCreateParams, Stripe.RequestOptions];
    expect(opts).toEqual({ stripeAccount: "acct_SELLER1", idempotencyKey: "qtg-checkout-6f1c1d1e-0000-4000-8000-000000000001" });
    expect(params.payment_intent_data?.application_fee_amount).toBe(136);
    expect(params.expires_at).toBe(Math.floor(Date.parse("2026-11-19T12:31:00.000Z") / 1000));
    expect(params.metadata).toEqual({ qtg_order: "6f1c1d1e-0000-4000-8000-000000000001", qtg_org: "org1" });
    // Free tickets aren't charged lines; the fee is its own line when the buyer pays it.
    expect(params.line_items!.map((l) => [l.price_data!.product_data!.name, l.price_data!.unit_amount, l.quantity]))
      .toEqual([["General admission ticket", 2500, 2], ["Event tee", 1800, 1], ["Booking fee", 136, 1]]);
    const total = params.line_items!.reduce((n, l) => n + l.price_data!.unit_amount! * l.quantity!, 0);
    expect(total).toBe(6936);
  });
  it("leaves the fee off the buyer's lines when the business pays it, but still collects it", async () => {
    const create = vi.fn(async () => ({ id: "cs_2", url: "https://checkout.stripe.com/c/pay/cs_2" }));
    await createStripeCheckout({ checkout: { sessions: { create } } } as unknown as Stripe, order({ feePayer: "business", totalCents: 6800 }), { success: "https://a/s", cancel: "https://a/c" });
    const [params] = create.mock.calls[0] as unknown as [Stripe.Checkout.SessionCreateParams];
    expect(params.line_items!.some((l) => l.price_data!.product_data!.name === "Booking fee")).toBe(false);
    expect(params.payment_intent_data?.application_fee_amount).toBe(136);
  });
});

describe("Square payment links", () => {
  afterEach(() => vi.unstubAllEnvs());
  const env = () => {
    vi.stubEnv("SQUARE_APPLICATION_ID", "sandbox-sq0idb-TEST"); vi.stubEnv("SQUARE_APPLICATION_SECRET", "sandbox-sq0csb-SECRET"); vi.stubEnv("SQUARE_ENV", "sandbox");
    vi.stubEnv("PAYMENT_TOKEN_KEY", randomBytes(32).toString("base64"));
  };
  const secrets = () => ({ payment_secrets: [{ org_id: "org1", access_token_enc: sealToken("EAAA-merchant"), refresh_token_enc: null, expires_at: "2099-01-01T00:00:00Z" }] });

  it("charge on the business's Square account with QueuedToGo's app fee", async () => {
    env();
    const { admin } = fakeAdmin(secrets());
    let sent: R = {}, auth = "";
    const f = vi.fn(async (url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body)); auth = String((init.headers as Record<string, string>).Authorization);
      expect(url).toBe("https://connect.squareupsandbox.com/v2/online-checkout/payment-links");
      return new Response(JSON.stringify({ payment_link: { id: "PL1", url: "https://square.link/u/abc", order_id: "SQORDER1" } }));
    }) as unknown as typeof fetch;
    const r = await createSquareCheckout(admin, order(), "https://queuedtogo.com/pay/x", f);
    expect(r).toEqual({ checkoutId: "PL1", url: "https://square.link/u/abc", paymentRef: "SQORDER1" });
    expect(auth).toBe("Bearer EAAA-merchant");
    expect(sent.idempotency_key).toBe(order().id);
    expect((sent.checkout_options as R).app_fee_money).toEqual({ amount: 136, currency: "USD" });
    const o = sent.order as { location_id: string; reference_id: string; line_items: { name: string; quantity: string; base_price_money: { amount: number } }[] };
    expect(o.location_id).toBe("L1");
    expect(o.reference_id).toBe(order().id);
    expect(o.line_items.reduce((n, l) => n + l.base_price_money.amount * Number(l.quantity), 0)).toBe(6936);
  });
  it("count as paid only when every payment on the Square order is completed and belongs to it", async () => {
    env();
    const { admin } = fakeAdmin(secrets());
    const reply = (paymentOrder: string, status: string) => vi.fn(async (url: string) => {
      if (url.includes("/v2/orders/")) return new Response(JSON.stringify({ order: { id: "SQORDER1", tenders: [{ payment_id: "PAY1" }] } }));
      return new Response(JSON.stringify({ payment: { id: "PAY1", status, order_id: paymentOrder, amount_money: { amount: 6936, currency: "USD" } } }));
    }) as unknown as typeof fetch;
    expect(await squareOrderPaid(admin, "org1", "SQORDER1", reply("SQORDER1", "COMPLETED"))).toEqual({ paid: true, amount: 6936, currency: "usd", paymentId: "PAY1" });
    expect((await squareOrderPaid(admin, "org1", "SQORDER1", reply("SQORDER1", "APPROVED"))).paid).toBe(false);
    expect((await squareOrderPaid(admin, "org1", "SQORDER1", reply("OTHER", "COMPLETED"))).paid).toBe(false);
  });
  it("notifications are accepted only with Square's signature over the URL and body", () => {
    const key = "sig-key-123", url = "https://queuedtogo.com/api/payments/square/webhook", body = '{"type":"payment.updated"}';
    const good = createHmac("sha256", key).update(url + body).digest("base64");
    expect(squareSignatureOk(body, good, url, key)).toBe(true);
    expect(squareSignatureOk(body + " ", good, url, key)).toBe(false);
    expect(squareSignatureOk(body, good, "https://evil.example/hook", key)).toBe(false);
    expect(squareSignatureOk(body, null, url, key)).toBe(false);
    expect(squareSignatureOk(body, good, url, "")).toBe(false);
  });
});

describe("Stripe payment events", () => {
  const paidOrder = () => ({
    id: "6f1c1d1e-0000-4000-8000-000000000001", org_id: "org1", status: "pending", provider: "stripe", account_id: "acct_SELLER1",
    checkout_id: "cs_test_1", payment_ref: null, total_cents: 6936, fee_cents: 136, files: [{ path: "org1/f/x.png" }],
  });
  const session = (o: R = {}) => ({ id: "cs_test_1", payment_status: "paid", amount_total: 6936, currency: "usd", payment_intent: "pi_1", metadata: { qtg_order: "6f1c1d1e-0000-4000-8000-000000000001" }, ...o });
  const ev = (type: string, account: string, s: R) => ({ id: `evt_${Math.random()}`, type, account, data: { object: s } }) as unknown as Stripe.Event;

  it("confirm the order with the amount, currency and account Stripe reports", async () => {
    const { admin, calls } = fakeAdmin({ paid_orders: [paidOrder()], stripe_events: [] }, () => ({ status: "paid", number: 1042, tracking_token: "t".repeat(40), repeat: false }));
    expect(await handleConnectEvent(admin, {} as Stripe, ev("checkout.session.completed", "acct_SELLER1", session()))).toBe("paid");
    expect(calls.rpc[0]).toEqual(["confirm_paid_order", { p_order: paidOrder().id, p_amount: 6936, p_currency: "usd", p_account: "acct_SELLER1", p_payment_ref: "pi_1" }]);
  });
  it("ignore events from another account or another checkout", async () => {
    const { admin, calls } = fakeAdmin({ paid_orders: [paidOrder()], stripe_events: [] });
    expect(await handleConnectEvent(admin, {} as Stripe, ev("checkout.session.completed", "acct_EVIL", session()))).toBe("unknown order");
    expect(await handleConnectEvent(admin, {} as Stripe, ev("checkout.session.completed", "acct_SELLER1", session({ id: "cs_other" })))).toBe("unknown order");
    expect(calls.rpc).toHaveLength(0);
  });
  it("wait for delayed payment methods instead of confirming early", async () => {
    const { admin, calls } = fakeAdmin({ paid_orders: [paidOrder()], stripe_events: [] });
    expect(await handleConnectEvent(admin, {} as Stripe, ev("checkout.session.completed", "acct_SELLER1", session({ payment_status: "unpaid" })))).toBe("awaiting payment");
    expect(calls.rpc).toHaveLength(0);
  });
  it("refund in full, fee included, when the tickets sold out before a late payment", async () => {
    const t = { paid_orders: [paidOrder()], stripe_events: [] as R[] };
    const { admin, calls } = fakeAdmin(t, () => { t.paid_orders[0].status = "refund_due"; return { status: "refund" }; });
    const refunds = { create: vi.fn(async () => ({ id: "re_1" })) };
    expect(await handleConnectEvent(admin, { refunds } as unknown as Stripe, ev("checkout.session.completed", "acct_SELLER1", session()))).toBe("refunded");
    expect(refunds.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: "pi_1", refund_application_fee: true }),
      { stripeAccount: "acct_SELLER1", idempotencyKey: `qtg-refund-${paidOrder().id}` });
    expect(t.paid_orders[0].status).toBe("refunded");
    expect(calls.removed).toEqual(["org1/f/x.png"]);
  });
  it("release the hold and delete uploads when a checkout expires", async () => {
    const t = { paid_orders: [paidOrder()], stripe_events: [] as R[] };
    const { admin, calls } = fakeAdmin(t);
    expect(await handleConnectEvent(admin, {} as Stripe, ev("checkout.session.expired", "acct_SELLER1", session({ payment_status: "unpaid" })))).toBe("expired");
    expect(t.paid_orders[0].status).toBe("expired");
    expect(calls.removed).toEqual(["org1/f/x.png"]);
  });
});
