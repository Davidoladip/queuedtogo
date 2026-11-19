import "server-only";
import type Stripe from "stripe";
import type { adminClient } from "@/lib/supabase/admin";
import { syncStripeAccount } from "@/server/payments/stripe-connect";

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
  }
  await admin.from("stripe_events").upsert({ id: event.id, type: event.type }, { onConflict: "id", ignoreDuplicates: true });
  return result;
}
