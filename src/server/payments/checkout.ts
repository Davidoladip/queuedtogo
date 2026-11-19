import "server-only";
import type Stripe from "stripe";
import type { adminClient } from "@/lib/supabase/admin";
import type { Line } from "@/lib/pricing";
import { squareAccessToken, squareFetch } from "@/server/payments/square";

type Admin = NonNullable<ReturnType<typeof adminClient>>;

/** What a checkout needs from the pending paid order. */
export type CheckoutOrder = {
  id: string;
  orgId: string;
  accountId: string;
  locationId: string | null;
  lines: Line[];
  feeCents: number;
  feePayer: "guest" | "business";
  totalCents: number;
  holdExpiresAt: string;
  email: string | null;
  /** What the buyer's card statement and receipt call the purchase, e.g. "Harbourfront Gala". */
  title: string;
};

export type CheckoutResult = { checkoutId: string; url: string; paymentRef: string | null };

/** Line names on the provider's checkout page: "VIP ticket", "Event tee". */
const lineName = (l: Line) => (l.ticket ? `${l.name} ticket` : l.name).slice(0, 120) || "Item";

/**
 * Stripe Checkout on the business's own account (a direct charge): the business is the seller of record, Stripe takes
 * its card fee from the business, and QueuedToGo's fee moves to QueuedToGo as an application fee at payment time.
 * The session expires with the hold, so a buyer can't pay after their tickets were released.
 */
export async function createStripeCheckout(stripe: Stripe, o: CheckoutOrder, urls: { success: string; cancel: string }): Promise<CheckoutResult> {
  const items: Stripe.Checkout.SessionCreateParams.LineItem[] = o.lines.filter((l) => l.unit > 0).map((l) => ({
    quantity: l.qty,
    price_data: { currency: "usd", unit_amount: l.unit, product_data: { name: lineName(l) } },
  }));
  if (o.feePayer === "guest" && o.feeCents > 0) {
    items.push({ quantity: 1, price_data: { currency: "usd", unit_amount: o.feeCents, product_data: { name: "Booking fee" } } });
  }
  const s = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: items,
      client_reference_id: o.id,
      metadata: { qtg_order: o.id, qtg_org: o.orgId },
      ...(o.email ? { customer_email: o.email } : {}),
      expires_at: Math.floor(Date.parse(o.holdExpiresAt) / 1000),
      success_url: urls.success,
      cancel_url: urls.cancel,
      payment_intent_data: {
        ...(o.feeCents > 0 ? { application_fee_amount: o.feeCents } : {}),
        metadata: { qtg_order: o.id, qtg_org: o.orgId },
        description: o.title.slice(0, 200),
      },
    },
    { stripeAccount: o.accountId, idempotencyKey: `qtg-checkout-${o.id}` },
  );
  if (!s.url) throw new Error("Stripe didn't return a checkout page");
  return { checkoutId: s.id, url: s.url, paymentRef: null };
}

/** Has this Stripe Checkout been paid? Read from Stripe, not from the browser. */
export async function stripeCheckoutPaid(stripe: Stripe, accountId: string, sessionId: string) {
  const s = await stripe.checkout.sessions.retrieve(sessionId, {}, { stripeAccount: accountId });
  const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
  return { paid: s.payment_status === "paid", expired: s.status === "expired", amount: s.amount_total ?? -1, currency: s.currency ?? "", paymentRef: pi, orderId: s.metadata?.qtg_order ?? null };
}

/** Refund a Stripe payment in full, with QueuedToGo's fee returned too. */
export async function stripeRefund(stripe: Stripe, accountId: string, paymentIntent: string, orderId: string) {
  await stripe.refunds.create(
    { payment_intent: paymentIntent, refund_application_fee: true, reason: "requested_by_customer", metadata: { qtg_order: orderId } },
    { stripeAccount: accountId, idempotencyKey: `qtg-refund-${orderId}` },
  );
}

type SquareMoney = { amount?: number; currency?: string };
type SquareLink = { payment_link?: { id: string; url: string; order_id?: string }; errors?: { detail?: string; code?: string }[] };

/**
 * A Square payment link on the business's own Square account, with QueuedToGo's fee as Square's app fee.
 * Square payment links don't expire on their own; a payment that arrives after the hold lapsed is accepted if the
 * tickets are still there, and refunded automatically if they were sold meanwhile.
 */
export async function createSquareCheckout(admin: Admin, o: CheckoutOrder, redirectUrl: string, fetchImpl?: typeof fetch): Promise<CheckoutResult> {
  const token = await squareAccessToken(admin, o.orgId, fetchImpl);
  if (!token || !o.locationId) throw new Error("Square isn't connected for this business");
  const line_items = o.lines.filter((l) => l.unit > 0).map((l) => ({
    name: lineName(l), quantity: String(l.qty), base_price_money: { amount: l.unit, currency: "USD" },
  }));
  if (o.feePayer === "guest" && o.feeCents > 0) line_items.push({ name: "Booking fee", quantity: "1", base_price_money: { amount: o.feeCents, currency: "USD" } });
  const r = await squareFetch<SquareLink>("/v2/online-checkout/payment-links", {
    method: "POST",
    token,
    body: JSON.stringify({
      idempotency_key: o.id,
      order: { location_id: o.locationId, reference_id: o.id, line_items, metadata: { qtg_order: o.id } },
      checkout_options: {
        redirect_url: redirectUrl,
        ask_for_shipping_address: false,
        ...(o.feeCents > 0 ? { app_fee_money: { amount: o.feeCents, currency: "USD" } } : {}),
      },
      ...(o.email ? { pre_populated_data: { buyer_email: o.email } } : {}),
      payment_note: o.title.slice(0, 200),
    }),
  }, fetchImpl);
  const link = r.json.payment_link;
  if (!r.ok || !link?.url || !link.order_id) throw new Error(r.json.errors?.[0]?.detail ?? "Square didn't create the checkout");
  return { checkoutId: link.id, url: link.url, paymentRef: link.order_id };
}

type SquarePayment = { id: string; status?: string; order_id?: string; amount_money?: SquareMoney; total_money?: SquareMoney; location_id?: string };

/** Has the Square order behind a payment link been paid? Read from Square with the business's own token. */
export async function squareOrderPaid(admin: Admin, orgId: string, squareOrderId: string, fetchImpl?: typeof fetch) {
  const token = await squareAccessToken(admin, orgId, fetchImpl);
  if (!token) return { paid: false, amount: -1, currency: "", paymentId: null as string | null };
  const r = await squareFetch<{ order?: { id: string; state?: string; tenders?: { payment_id?: string }[]; reference_id?: string } }>(
    `/v2/orders/${encodeURIComponent(squareOrderId)}`, { token }, fetchImpl);
  const paymentIds = (r.json.order?.tenders ?? []).map((t) => t.payment_id).filter((x): x is string => !!x);
  let amount = 0, currency = "", paymentId: string | null = null, allDone = paymentIds.length > 0;
  for (const id of paymentIds) {
    const p = await squareFetch<{ payment?: SquarePayment }>(`/v2/payments/${encodeURIComponent(id)}`, { token }, fetchImpl);
    const pay = p.json.payment;
    if (!pay || pay.status !== "COMPLETED" || pay.order_id !== squareOrderId) { allDone = false; continue; }
    amount += pay.amount_money?.amount ?? 0;
    currency = (pay.amount_money?.currency ?? "").toLowerCase();
    paymentId ??= pay.id;
  }
  return { paid: allDone, amount: allDone ? amount : -1, currency, paymentId };
}

/** Refund a Square payment in full, returning QueuedToGo's app fee too. */
export async function squareRefund(admin: Admin, orgId: string, paymentId: string, amountCents: number, feeCents: number, orderId: string, fetchImpl?: typeof fetch) {
  const token = await squareAccessToken(admin, orgId, fetchImpl);
  if (!token) throw new Error("Square isn't connected for this business");
  const r = await squareFetch<{ errors?: { detail?: string }[] }>("/v2/refunds", {
    method: "POST",
    token,
    body: JSON.stringify({
      idempotency_key: `qtg-refund-${orderId}`.slice(0, 45),
      payment_id: paymentId,
      amount_money: { amount: amountCents, currency: "USD" },
      ...(feeCents > 0 ? { app_fee_money: { amount: feeCents, currency: "USD" } } : {}),
      reason: "Tickets sold out before the payment arrived",
    }),
  }, fetchImpl);
  if (!r.ok) throw new Error(r.json.errors?.[0]?.detail ?? "Square didn't accept the refund");
}
