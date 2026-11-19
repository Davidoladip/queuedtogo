import { adminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/urls";
import { squareConfig, squareSignatureOk } from "@/server/payments/square";
import { checkWithProvider, loadOrder } from "@/server/payments/settle";

export const dynamic = "force-dynamic";

type Notification = { event_id?: string; type?: string; merchant_id?: string; data?: { object?: { payment?: { id?: string; order_id?: string; status?: string } } } };

/**
 * Square payment notifications. Only signed ones are accepted, and even then nothing in them is trusted: the order
 * is looked up by its Square order id and the payment is read back from Square with the business's own token.
 */
export async function POST(req: Request) {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ?? "";
  const admin = adminClient();
  if (!key || !admin || !squareConfig()) return new Response("Square isn't connected.", { status: 503 });
  const body = await req.text();
  const url = `${await siteUrl()}/api/payments/square/webhook`;
  if (!squareSignatureOk(body, req.headers.get("x-square-hmacsha256-signature"), url, key)) return new Response("Bad signature.", { status: 400 });
  let n: Notification;
  try { n = JSON.parse(body) as Notification; } catch { return new Response("Bad body.", { status: 400 }); }
  const p = n.data?.object?.payment;
  if (!n.type?.startsWith("payment.") || !p?.order_id || p.status !== "COMPLETED") return Response.json({ received: true, result: "ignored" });
  const { data: row } = await admin.from("paid_orders").select("id, account_id").eq("provider", "square").eq("payment_ref", p.order_id).maybeSingle();
  if (!row || row.account_id !== n.merchant_id) return Response.json({ received: true, result: "unknown order" });
  const order = await loadOrder(admin, row.id);
  if (!order) return Response.json({ received: true, result: "unknown order" });
  try {
    const r = await checkWithProvider(admin, order);
    return Response.json({ received: true, result: r.status });
  } catch (e) {
    console.error("square webhook", n.event_id, e instanceof Error ? e.message : e);
    return new Response("Couldn't apply the event.", { status: 500 });
  }
}
