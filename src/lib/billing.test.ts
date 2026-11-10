import { readFileSync, readdirSync } from "node:fs";
import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => null }));
import { PASSES, PLANS, PLAN_ORDER, passExpiry, usage } from "@/lib/plans";
import { ensurePrice, handleStripeEvent, markPassPaid, planOfSubscription, syncSubscription } from "@/server/billing";

type R = Record<string, unknown>;

/** A tiny stand-in for the Supabase client: enough of from().select/update/insert/upsert/eq/is/maybeSingle/single. */
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
      is: (k: string, v: unknown) => { filters.push((r) => (r[k] ?? null) === v); return b; },
      maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
      single: async () => ({ data: run().data?.[0] ?? null, error: null }),
      then: (res: (x: unknown) => unknown) => Promise.resolve(run()).then(res),
    };
    return b;
  };
  return { from } as never;
}

const ORG = "11111111-1111-4111-8111-111111111111";
const sub = (o: Partial<Stripe.Subscription> & { lookup?: string; end?: number } = {}): Stripe.Subscription => ({
  id: "sub_ABC123456", object: "subscription", customer: "cus_ABC123456", status: "trialing", metadata: { org_id: ORG, plan: "pro" },
  trial_end: 1_800_000_000, cancel_at_period_end: false, cancel_at: null,
  items: { data: [{ id: "si_1", current_period_end: o.end ?? 1_800_000_000, price: { lookup_key: o.lookup ?? "qtg_pro_monthly" } }] },
  ...o,
} as unknown as Stripe.Subscription);

describe("plans", () => {
  it("match the limits in the database", () => {
    const file = readdirSync("supabase/migrations").find((f) => f.endsWith("_billing.sql"))!;
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
    for (const key of PLAN_ORDER) {
      const m = key === "free" ? /else\s+'(\{[^']+\})'::jsonb/.exec(sql) : new RegExp(`when '${key}'\\s+then '(\\{[^']+\\})'::jsonb`).exec(sql);
      expect(m, key).not.toBeNull();
      expect(JSON.parse(m![1])).toEqual(PLANS[key].limits);
    }
  });
  it("are priced $29 / $69 / $139 with passes at $29 / $49 / $69", () => {
    expect([PLANS.starter.price, PLANS.pro.price, PLANS.events.price]).toEqual([29, 69, 139]);
    expect([PASSES["100"].price, PASSES["300"].price, PASSES.unlimited.price]).toEqual([29, 49, 69]);
    expect(PASSES.unlimited.guestLimit).toBeNull();
  });
  it("passes last until 30 days after the event, or 120 days without a date", () => {
    const paid = new Date("2026-11-09T12:00:00Z");
    expect(passExpiry("2026-12-31", paid).toISOString()).toBe("2027-01-30T23:59:59.000Z");
    expect(passExpiry(null, paid).toISOString()).toBe("2027-03-09T12:00:00.000Z");
    // An event already past still gets at least 30 days.
    expect(passExpiry("2026-01-01", paid).toISOString()).toBe("2026-12-09T12:00:00.000Z");
  });
  it("shows usage", () => {
    expect(usage(12, 50)).toEqual({ text: "12 of 50", ratio: 0.24 });
    expect(usage(3, null).ratio).toBeNull();
  });
});

describe("Stripe subscriptions", () => {
  it("read the plan from the price, falling back to our metadata", () => {
    expect(planOfSubscription(sub({ lookup: "qtg_events_monthly" }))).toBe("events");
    expect(planOfSubscription(sub({ lookup: "something_else" }))).toBe("pro");
  });
  it("update the business's plan, trial and renewal date", async () => {
    const t = { org_billing: [{ org_id: ORG, plan: "free", status: "none", comped: false, stripe_customer_id: null, stripe_subscription_id: null }] };
    expect(await syncSubscription(fakeAdmin(t), sub())).toBe("updated");
    expect(t.org_billing[0]).toMatchObject({ plan: "pro", status: "trialing", stripe_subscription_id: "sub_ABC123456", stripe_customer_id: "cus_ABC123456", had_trial: true, current_period_end: new Date(1_800_000_000_000).toISOString() });
    await syncSubscription(fakeAdmin(t), sub({ status: "active", lookup: "qtg_events_monthly", trial_end: null }));
    expect(t.org_billing[0]).toMatchObject({ plan: "events", status: "active" });
    await syncSubscription(fakeAdmin(t), sub({ status: "canceled" }), true);
    expect(t.org_billing[0]).toMatchObject({ status: "canceled", stripe_subscription_id: null });
  });
  it("ignore a subscription for someone else's Stripe customer, or an old replaced one", async () => {
    const t = { org_billing: [{ org_id: ORG, plan: "starter", status: "active", comped: false, stripe_customer_id: "cus_MINE000001", stripe_subscription_id: "sub_CURRENT001" }] };
    expect(await syncSubscription(fakeAdmin(t), sub())).toBe("ignored");
    expect(await syncSubscription(fakeAdmin(t), sub({ customer: "cus_MINE000001" }))).toBe("ignored");
    expect(t.org_billing[0]).toMatchObject({ plan: "starter", status: "active" });
  });
  it("never change a comped business's plan", async () => {
    const t = { org_billing: [{ org_id: ORG, plan: "events", status: "none", comped: true, stripe_customer_id: null, stripe_subscription_id: null }] };
    await syncSubscription(fakeAdmin(t), sub({ lookup: "qtg_starter_monthly", status: "active" }));
    expect(t.org_billing[0].plan).toBe("events");
  });
});

describe("event passes", () => {
  const session = (o: R = {}) => ({ id: "cs_test_PASS0001", mode: "payment", payment_status: "paid", amount_total: 2900, currency: "usd", payment_intent: "pi_PASS000001", metadata: { org_id: ORG, pass_id: "p1" }, ...o }) as unknown as Stripe.Checkout.Session;
  const tables = () => ({
    event_passes: [{ id: "p1", org_id: ORG, form_id: "f1", tier: "100", amount_cents: 2900, status: "pending", stripe_session_id: "cs_test_PASS0001" }] as R[],
    forms: [{ id: "f1", org_id: ORG, event_date: "2026-12-31" }],
  });
  it("are marked paid with an expiry once Stripe confirms the payment", async () => {
    const t = tables();
    expect(await markPassPaid(fakeAdmin(t), session())).toBe("paid");
    expect(t.event_passes[0]).toMatchObject({ status: "paid", stripe_payment_intent: "pi_PASS000001" });
    expect(String(t.event_passes[0].expires_at)).toMatch(/^2027-01-30/);
  });
  it("aren't unlocked by an unpaid, underpaid, mismatched or other business's session", async () => {
    for (const bad of [{ payment_status: "unpaid" }, { amount_total: 100 }, { id: "cs_test_OTHER0001" }, { metadata: { org_id: "22222222-2222-4222-8222-222222222222", pass_id: "p1" } }]) {
      const t = tables();
      expect(await markPassPaid(fakeAdmin(t), session(bad))).toBe("ignored");
      expect(t.event_passes[0].status).toBe("pending");
    }
  });
});

describe("Stripe prices", () => {
  const fake = (existing: { id: string; unit_amount: number; currency: string; product: string } | null) => {
    const created: Record<string, unknown>[] = [];
    const stripe = {
      prices: {
        list: vi.fn(async () => ({ data: existing ? [existing] : [] })),
        create: vi.fn(async (p: Record<string, unknown>) => { created.push(p); return { id: "price_NEW" }; }),
      },
      products: { create: vi.fn(async () => ({ id: "prod_NEW" })) },
    } as unknown as Stripe;
    return { stripe, created };
  };
  it("reuse the price when the amount matches the app", async () => {
    const { stripe, created } = fake({ id: "price_OLD", unit_amount: 6900, currency: "usd", product: "prod_PRO" });
    expect(await ensurePrice(stripe, { plan: "pro" })).toBe("price_OLD");
    expect(created).toHaveLength(0);
  });
  it("make a new price (same product, takes over the key) when the app's price changed", async () => {
    const { stripe, created } = fake({ id: "price_OLD", unit_amount: 4900, currency: "usd", product: "prod_PRO" });
    expect(await ensurePrice(stripe, { plan: "pro" })).toBe("price_NEW");
    expect(created[0]).toMatchObject({ product: "prod_PRO", unit_amount: 6900, lookup_key: "qtg_pro_monthly", transfer_lookup_key: true, recurring: { interval: "month" } });
  });
  it("create the product and price the first time", async () => {
    const { stripe, created } = fake(null);
    expect(await ensurePrice(stripe, { pass: "300" })).toBe("price_NEW");
    expect(created[0]).toMatchObject({ product: "prod_NEW", unit_amount: 4900, lookup_key: "qtg_pass_300" });
    expect(created[0].recurring).toBeUndefined();
  });
});

describe("Stripe webhooks", () => {
  const stripe = new Stripe("sk_test_dummy");
  it("accept only correctly signed events", async () => {
    const payload = JSON.stringify({ id: "evt_TEST000001", object: "event", type: "charge.refunded", data: { object: {} } });
    const secret = "whsec_test_secret";
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect((await stripe.webhooks.constructEventAsync(payload, header, secret)).id).toBe("evt_TEST000001");
    await expect(stripe.webhooks.constructEventAsync(payload.replace("refunded", "succeeded"), header, secret)).rejects.toThrow();
    await expect(stripe.webhooks.constructEventAsync(payload, header, "whsec_wrong")).rejects.toThrow();
  });
  it("apply a refund once, and skip an event that was already handled", async () => {
    const t = { event_passes: [{ id: "p1", status: "paid", stripe_payment_intent: "pi_PASS000001" }] as R[], stripe_events: [] as R[] };
    const ev = { id: "evt_REFUND0001", type: "charge.refunded", data: { object: { payment_intent: "pi_PASS000001", refunded: true } } } as unknown as Stripe.Event;
    expect(await handleStripeEvent(fakeAdmin(t), stripe, ev)).toBe("refunded");
    expect(t.event_passes[0].status).toBe("refunded");
    expect(await handleStripeEvent(fakeAdmin(t), stripe, ev)).toBe("duplicate");
  });
  it("turn a completed subscription checkout into the plan", async () => {
    const t = { org_billing: [{ org_id: ORG, plan: "free", status: "none", comped: false, stripe_customer_id: "cus_ABC123456", stripe_subscription_id: null }], stripe_events: [] as R[] };
    const fake = { subscriptions: { retrieve: vi.fn(async () => sub({ metadata: {} as Stripe.Metadata, lookup: "qtg_starter_monthly" })) } } as unknown as Stripe;
    const ev = { id: "evt_CHECKOUT01", type: "checkout.session.completed", data: { object: { mode: "subscription", subscription: "sub_ABC123456", metadata: { org_id: ORG } } } } as unknown as Stripe.Event;
    expect(await handleStripeEvent(fakeAdmin(t), fake, ev)).toBe("updated");
    expect(t.org_billing[0]).toMatchObject({ plan: "starter", status: "trialing" });
  });
});
