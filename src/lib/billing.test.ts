import { readFileSync, readdirSync } from "node:fs";
import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => null }));
import { PASSES, PLANS, PLAN_ORDER, annualSaving, parseLookupKey, passExpiry, planLookupKey, planPrice, usage } from "@/lib/plans";
import { billingEmail } from "@/lib/email";
import { ensurePrice, handleStripeEvent, intervalOfSubscription, markPassPaid, planOfSubscription, syncSubscription, type BillingNotice } from "@/server/billing";

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
      in: (k: string, v: unknown[]) => { filters.push((r) => v.includes(r[k])); return b; },
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
  trial_end: 1_800_000_000, cancel_at_period_end: false, cancel_at: null, schedule: null,
  items: { data: [{ id: "si_1", current_period_end: o.end ?? 1_800_000_000, price: { id: "price_X", lookup_key: o.lookup ?? "qtg_pro_monthly", recurring: { interval: (o.lookup ?? "").endsWith("_annual") ? "year" : "month" } } }] },
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

describe("annual billing", () => {
  it("is priced at 2 months free with its own lookup keys", () => {
    expect([PLANS.starter.annual, PLANS.pro.annual, PLANS.events.annual]).toEqual([290, 690, 1390]);
    for (const k of ["starter", "pro", "events"] as const) {
      expect(planPrice(k, "year")).toBe(PLANS[k].price * 10);
      expect(annualSaving(k)).toBe(PLANS[k].price * 2);
    }
    expect(planLookupKey("pro", "year")).toBe("qtg_pro_annual");
    expect(planLookupKey("pro")).toBe("qtg_pro_monthly");
    expect(parseLookupKey("qtg_events_annual")).toEqual({ plan: "events", interval: "year" });
    expect(parseLookupKey("qtg_pass_100")).toBeNull();
  });
  it("reads the plan and period of an annual subscription", () => {
    const s = sub({ lookup: "qtg_starter_annual" });
    expect(planOfSubscription(s)).toBe("starter");
    expect(intervalOfSubscription(s)).toBe("year");
    expect(intervalOfSubscription(sub())).toBe("month");
  });
  it("puts the annual price on the same product as the monthly one", async () => {
    const created: Record<string, unknown>[] = [];
    const stripe = {
      prices: {
        list: vi.fn(async (q: { lookup_keys: string[] }) => ({ data: q.lookup_keys[0] === "qtg_pro_monthly" ? [{ id: "price_M", unit_amount: 6900, currency: "usd", product: "prod_PRO" }] : [] })),
        create: vi.fn(async (p: Record<string, unknown>) => { created.push(p); return { id: "price_Y" }; }),
      },
      products: { create: vi.fn(async () => ({ id: "prod_NEW" })) },
    } as unknown as Stripe;
    expect(await ensurePrice(stripe, { plan: "pro", interval: "year" })).toBe("price_Y");
    expect(created[0]).toMatchObject({ product: "prod_PRO", unit_amount: 69000, lookup_key: "qtg_pro_annual", recurring: { interval: "year" } });
  });
  it("saves the period, and clears a booked change once Stripe's schedule is gone", async () => {
    const t = { org_billing: [{ org_id: ORG, plan: "pro", status: "active", comped: false, stripe_customer_id: "cus_ABC123456", stripe_subscription_id: "sub_ABC123456", cancel_at_period_end: false,
      pending_plan: "pro", pending_interval: "month", pending_change_at: "2027-11-13T00:00:00Z" }] as R[] };
    await syncSubscription(fakeAdmin(t), sub({ status: "active", lookup: "qtg_pro_annual", schedule: "sub_sched_1" }));
    expect(t.org_billing[0]).toMatchObject({ billing_interval: "year", pending_plan: "pro" });
    await syncSubscription(fakeAdmin(t), sub({ status: "active", lookup: "qtg_pro_monthly" }));
    expect(t.org_billing[0]).toMatchObject({ billing_interval: "month", pending_plan: null, pending_change_at: null });
  });
});

describe("renewals, failures and cancellations", () => {
  const row = (o: R = {}) => ({ org_id: ORG, plan: "pro", status: "active", comped: false, stripe_customer_id: "cus_ABC123456", stripe_subscription_id: "sub_ABC123456", cancel_at_period_end: false, last_payment_failed_at: null, ...o });
  const invoice = (type: string, id: string) => ({ id, type, data: { object: { id: "in_1", customer: "cus_ABC123456", parent: { subscription_details: { subscription: "sub_ABC123456" } } } } }) as unknown as Stripe.Event;
  const stripeWith = (reason: string | null, current = sub({ status: "past_due" })) => ({
    subscriptions: { retrieve: vi.fn(async () => current) },
    invoicePayments: { list: vi.fn(async () => ({ data: reason ? [{ payment: { payment_intent: { last_payment_error: { message: reason } } } }] : [] })) },
  }) as unknown as Stripe;

  it("record why a renewal failed, email the owners once, and clear it when paid", async () => {
    const t = { org_billing: [row()] as R[], stripe_events: [] as R[] };
    const sent: BillingNotice[] = [];
    const notify = async (_a: unknown, n: BillingNotice) => { sent.push(n); };
    const stripe = stripeWith("Your card has insufficient funds.");
    expect(await handleStripeEvent(fakeAdmin(t), stripe, invoice("invoice.payment_failed", "evt_FAIL0001"), notify)).toBe("failed");
    expect(t.org_billing[0]).toMatchObject({ last_payment_error: "Your card has insufficient funds." });
    expect(sent).toEqual([{ orgId: ORG, kind: "payment_failed", reason: "Your card has insufficient funds." }]);
    await handleStripeEvent(fakeAdmin(t), stripe, invoice("invoice.payment_failed", "evt_FAIL0002"), notify);
    expect(sent).toHaveLength(1);
    expect(await handleStripeEvent(fakeAdmin(t), stripe, invoice("invoice.paid", "evt_PAID0001"), notify)).toBe("paid");
    expect(t.org_billing[0]).toMatchObject({ last_payment_error: null, last_payment_failed_at: null });
  });
  it("ignore a failed invoice for someone else's subscription", async () => {
    const t = { org_billing: [row({ stripe_subscription_id: "sub_OTHER00001" })] as R[], stripe_events: [] as R[] };
    expect(await handleStripeEvent(fakeAdmin(t), stripeWith("x"), invoice("invoice.payment_failed", "evt_FAIL0003"))).toBe("ignored");
    expect(t.org_billing[0].last_payment_error).toBeUndefined();
  });
  it("re-read the subscription from Stripe instead of trusting a late event", async () => {
    const t = { org_billing: [row()] as R[], stripe_events: [] as R[] };
    const stale = { id: "evt_STALE0001", type: "customer.subscription.updated", data: { object: sub({ status: "trialing" }) } } as unknown as Stripe.Event;
    await handleStripeEvent(fakeAdmin(t), stripeWith(null, sub({ status: "past_due" })), stale);
    expect(t.org_billing[0].status).toBe("past_due");
  });
  it("email when a plan is cancelled and when it ends; nothing for a comped business", async () => {
    const t = { org_billing: [row()] as R[] };
    const sent: string[] = [];
    const notify = async (_a: unknown, n: BillingNotice) => { sent.push(n.kind); };
    await syncSubscription(fakeAdmin(t), sub({ status: "active", cancel_at_period_end: true }), false, notify);
    await syncSubscription(fakeAdmin(t), sub({ status: "active", cancel_at_period_end: true }), false, notify);
    await syncSubscription(fakeAdmin(t), sub({ status: "canceled" }), true, notify);
    expect(sent).toEqual(["cancel_confirmed", "plan_ended"]);
    const c = { org_billing: [row({ comped: true, stripe_subscription_id: null, stripe_customer_id: null })] as R[] };
    await syncSubscription(fakeAdmin(c), sub({ status: "active", cancel_at_period_end: true }), false, notify);
    expect(sent).toHaveLength(2);
  });
  it("keep the plan while Stripe retries, and clear the failure once paid up", async () => {
    const t = { org_billing: [row({ last_payment_error: "Declined", last_payment_failed_at: "2026-11-13T00:00:00Z" })] as R[] };
    await syncSubscription(fakeAdmin(t), sub({ status: "past_due" }));
    expect(t.org_billing[0]).toMatchObject({ plan: "pro", status: "past_due", last_payment_error: "Declined" });
    await syncSubscription(fakeAdmin(t), sub({ status: "active" }));
    expect(t.org_billing[0]).toMatchObject({ last_payment_error: null });
  });
  it("accept a pass paid with sales tax on top (checks the amount before tax)", async () => {
    const t = { event_passes: [{ id: "p1", org_id: ORG, form_id: "f1", tier: "100", amount_cents: 2900, status: "pending", stripe_session_id: "cs_test_TAX00001" }] as R[], forms: [{ id: "f1", org_id: ORG, event_date: null }] };
    const s = { id: "cs_test_TAX00001", mode: "payment", payment_status: "paid", amount_subtotal: 2900, amount_total: 3074, currency: "usd", payment_intent: "pi_T", metadata: { org_id: ORG, pass_id: "p1" } } as unknown as Stripe.Checkout.Session;
    expect(await markPassPaid(fakeAdmin(t), s)).toBe("paid");
  });
});

describe("billing emails", () => {
  it("say what happened, link to Billing, and escape names", () => {
    const e = billingEmail({ kind: "payment_failed", business: "Bee <b>&</b> Co", plan: "Pro", billingUrl: "https://queuedtogo.com/w/bee/billing", reason: "Your card was declined." });
    expect(e.subject).toBe("Payment failed for Bee <b>&</b> Co's Pro plan");
    expect(e.html).toContain("Bee &lt;b&gt;&amp;&lt;/b&gt; Co");
    expect(e.html).not.toContain("<b>&</b>");
    expect(e.text).toContain("Your card was declined.");
    expect(e.text).toContain("https://queuedtogo.com/w/bee/billing");
    expect(billingEmail({ kind: "cancel_confirmed", business: "Bee", plan: "Pro", billingUrl: "u", endsOn: "December 13, 2026" }).text).toContain("until December 13, 2026");
    expect(billingEmail({ kind: "plan_ended", business: "Bee", plan: "Pro", billingUrl: "u" }).subject).toBe("Bee is now on the Free plan");
  });
});
