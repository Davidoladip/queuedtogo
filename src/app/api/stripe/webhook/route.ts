import type Stripe from "stripe";
import { adminClient } from "@/lib/supabase/admin";
import { handleStripeEvent, stripeClient } from "@/server/billing";

export const dynamic = "force-dynamic";

/** Stripe webhooks. Only events signed with STRIPE_WEBHOOK_SECRET are accepted. */
export async function POST(req: Request) {
  const stripe = stripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const admin = adminClient();
  if (!stripe || !secret || !admin) return new Response("Billing isn't connected.", { status: 503 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature.", { status: 400 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, secret);
  } catch {
    return new Response("Bad signature.", { status: 400 });
  }
  try {
    const result = await handleStripeEvent(admin, stripe, event);
    return Response.json({ received: true, result });
  } catch (e) {
    console.error("stripe webhook", event.type, event.id, e instanceof Error ? e.message : e);
    // A 500 makes Stripe retry later.
    return new Response("Couldn't apply the event.", { status: 500 });
  }
}
