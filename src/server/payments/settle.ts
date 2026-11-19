import "server-only";
import type Stripe from "stripe";
import type { adminClient } from "@/lib/supabase/admin";
import { stripeClient } from "@/server/billing";
import { dispatchQueued } from "@/server/messaging";
import { squareOrderPaid, squareRefund, stripeCheckoutPaid, stripeRefund } from "@/server/payments/checkout";

type Admin = NonNullable<ReturnType<typeof adminClient>>;

type Unsettled = "pending" | "expired" | "canceled" | "refunded" | "review" | "refund_due" | "partly_refunded";
export type Settled =
  | { status: "paid"; number: number; trackingToken: string; repeat: boolean }
  | { status: Unsettled };

type OrderRow = {
  id: string; org_id: string; status: string; provider: string; account_id: string; checkout_id: string | null; payment_ref: string | null;
  total_cents: number; fee_cents: number; files: unknown;
};

const ORDER_COLS = "id, org_id, status, provider, account_id, checkout_id, payment_ref, total_cents, fee_cents, files";

export async function loadOrder(admin: Admin, id: string): Promise<OrderRow | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await admin.from("paid_orders").select(ORDER_COLS).eq("id", id).maybeSingle();
  return (data as OrderRow | null) ?? null;
}

/**
 * Applies a confirmed payment: the database checks the amount, currency and seller account against the checkout and
 * creates the real order (once, however many times this runs). If the hold had lapsed and the tickets were sold in the
 * meantime, the payment is refunded in full here.
 */
export async function applyPayment(admin: Admin, o: OrderRow, proof: { amount: number; currency: string; account: string; paymentRef: string | null }, stripe?: Stripe | null): Promise<Settled> {
  const { data, error } = await admin.rpc("confirm_paid_order", {
    p_order: o.id, p_amount: proof.amount, p_currency: proof.currency, p_account: proof.account, p_payment_ref: proof.paymentRef as string,
  });
  if (error) throw new Error(`confirm_paid_order: ${error.message}`);
  const r = data as { status: string; number?: number; tracking_token?: string; repeat?: boolean };
  if (r.status === "paid") {
    if (!r.repeat) await dispatchQueued({ orgId: o.org_id }).catch(() => undefined);
    return { status: "paid", number: r.number!, trackingToken: r.tracking_token!, repeat: !!r.repeat };
  }
  if (r.status === "refund" && proof.paymentRef) {
    await refundInFull(admin, { ...o, payment_ref: proof.paymentRef }, stripe);
    return { status: "refunded" };
  }
  if (r.status === "review") console.error("paid order needs review: amount, currency or account did not match", o.id);
  return { status: r.status as Unsettled };
}

/** Full refund (QueuedToGo's fee included) for an order whose tickets sold out before its payment arrived. */
export async function refundInFull(admin: Admin, o: OrderRow, stripe?: Stripe | null) {
  if (!o.payment_ref) return;
  if (o.provider === "stripe") {
    const s = stripe ?? stripeClient();
    if (!s) throw new Error("Stripe isn't connected");
    await stripeRefund(s, o.account_id, o.payment_ref, o.id);
  } else if (o.provider === "square") {
    // For Square, payment_ref is the Square order; refund each completed payment on it.
    const paid = await squareOrderPaid(admin, o.org_id, o.payment_ref);
    if (paid.paymentId) await squareRefund(admin, o.org_id, paid.paymentId, o.total_cents, o.fee_cents, o.id);
  }
  await admin.from("paid_orders").update({ status: "refunded" }).eq("id", o.id).eq("status", "refund_due");
  await removeOrderFiles(admin, o);
}

/** The buyer's uploads for a checkout that never became an order. */
export async function removeOrderFiles(admin: Admin, o: Pick<OrderRow, "files">) {
  const paths = (Array.isArray(o.files) ? o.files : []).map((f) => (f && typeof f === "object" ? String((f as { path?: unknown }).path ?? "") : "")).filter(Boolean);
  if (paths.length) await admin.storage.from("submission-uploads").remove(paths);
}

/**
 * Asks Stripe or Square directly whether a pending order has been paid (the return page does this, so a buyer
 * isn't left waiting on a slow webhook). Never trusts anything in the buyer's URL.
 */
export async function checkWithProvider(admin: Admin, o: OrderRow): Promise<Settled> {
  if (o.status === "paid") {
    const { data } = await admin.from("jobs").select("number, tracking_token").eq("submission_id", o.id).maybeSingle();
    if (data) return { status: "paid", number: data.number, trackingToken: data.tracking_token, repeat: true };
  }
  if (o.status !== "pending" && o.status !== "expired") return { status: (o.status === "paid" ? "pending" : o.status) as Unsettled };
  if (o.provider === "stripe" && o.checkout_id) {
    const stripe = stripeClient();
    if (!stripe) return { status: "pending" };
    const s = await stripeCheckoutPaid(stripe, o.account_id, o.checkout_id);
    if (s.orderId !== o.id) return { status: "pending" };
    if (s.paid) return applyPayment(admin, o, { amount: s.amount, currency: s.currency, account: o.account_id, paymentRef: s.paymentRef }, stripe);
    if (s.expired) { await expireOrder(admin, o); return { status: "expired" }; }
    return { status: "pending" };
  }
  if (o.provider === "square" && o.payment_ref) {
    const s = await squareOrderPaid(admin, o.org_id, o.payment_ref);
    if (s.paid) return applyPayment(admin, o, { amount: s.amount, currency: s.currency, account: o.account_id, paymentRef: o.payment_ref });
    return { status: o.status as "pending" | "expired" };
  }
  return { status: o.status as "pending" | "expired" };
}

/** A checkout that ended without payment: release the hold and delete the buyer's uploads. */
export async function expireOrder(admin: Admin, o: Pick<OrderRow, "id" | "files">) {
  const { data } = await admin.from("paid_orders").update({ status: "expired" }).eq("id", o.id).eq("status", "pending").select("id");
  if (data?.length) await removeOrderFiles(admin, o);
}
