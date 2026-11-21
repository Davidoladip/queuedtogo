import type Stripe from "stripe";
import { adminClient } from "@/lib/supabase/admin";
import { stripeClient } from "@/server/billing";
import { handleConnectEvent } from "@/server/payments/connect-events";
import { logSecurityEvent } from "@/server/security-log";

export const dynamic = "force-dynamic";

/** Stripe Connect webhooks (events on businesses' own accounts). Signed with STRIPE_CONNECT_WEBHOOK_SECRET. */
export async function POST(req: Request) {
  const stripe = stripeClient();
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  const admin = adminClient();
  if (!stripe || !secret || !admin) return new Response("Payments aren't connected.", { status: 503 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature.", { status: 400 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, secret);
  } catch {
    await logSecurityEvent("webhook.bad_signature", { detail: "stripe connect" });
    return new Response("Bad signature.", { status: 400 });
  }
  try {
    return Response.json({ received: true, result: await handleConnectEvent(admin, stripe, event) });
  } catch (e) {
    console.error("stripe connect webhook", event.type, event.id, e instanceof Error ? e.message : e);
    return new Response("Couldn't apply the event.", { status: 500 });
  }
}
