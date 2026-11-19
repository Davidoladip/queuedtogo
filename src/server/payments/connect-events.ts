import "server-only";
import type Stripe from "stripe";
import type { adminClient } from "@/lib/supabase/admin";
import { syncStripeAccount } from "@/server/payments/stripe-connect";
import { applyPayment, expireOrder, loadOrder } from "@/server/payments/settle";

type Admin = NonNullable<ReturnType<typeof adminClient>>;

/** Events from businesses' own Stripe accounts (Connect). Each event is applied once. */
export async function handleConnectEvent(admin: Admin, stripe: Stripe, event: Stripe.Event): Promise<string> {
  const { data: seen } = await admin.from("stripe_events").select("id").eq("id", event.id).maybeSingle();
  if (seen) return "duplicate";
  let result = "ignored";
  switch (event.type) {
    case "account.updated": {
      // Re-read the account: events can arrive late or out of order.
      const id = event.account ?? (event.data.object as Stripe.Account).id;
      const a = await stripe.accounts.retrieve(id);
      result = await syncStripeAccount(admin, a);
      break;
    }
    case "account.application.deauthorized": {
      // The business removed QueuedToGo from its Stripe account: stop selling through it.
      if (event.account) {
        const { data } = await admin.from("payment_accounts")
          .update({ status: "disconnected", charges_enabled: false, payouts_enabled: false })
          .eq("provider", "stripe").eq("account_id", event.account).select("org_id");
        result = data?.length ? "disconnected" : "ignored";
      }
      break;
    }
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      // A buyer paid on a business's account. The order must exist and belong to the account the event came from.
      const session = event.data.object as Stripe.Checkout.Session;
      const order = await loadOrder(admin, String(session.metadata?.qtg_order ?? ""));
      if (!order || !event.account || order.account_id !== event.account || order.checkout_id !== session.id) { result = "unknown order"; break; }
      if (session.payment_status !== "paid") { result = "awaiting payment"; break; }
      const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
      const done = await applyPayment(admin, order, { amount: session.amount_total ?? -1, currency: session.currency ?? "", account: event.account, paymentRef: pi }, stripe);
      result = done.status;
      break;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const order = await loadOrder(admin, String(session.metadata?.qtg_order ?? ""));
      if (!order || order.account_id !== event.account || order.checkout_id !== session.id) { result = "unknown order"; break; }
      await expireOrder(admin, order);
      result = "expired";
      break;
    }
  }
  await admin.from("stripe_events").upsert({ id: event.id, type: event.type }, { onConflict: "id", ignoreDuplicates: true });
  return result;
}
