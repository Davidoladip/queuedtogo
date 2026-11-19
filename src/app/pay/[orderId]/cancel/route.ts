import { adminClient } from "@/lib/supabase/admin";
import { stripeClient } from "@/server/billing";
import { expireOrder, loadOrder } from "@/server/payments/settle";

export const dynamic = "force-dynamic";

/**
 * The buyer pressed "back" on Stripe's checkout page: close that checkout so it can't be paid later, release the
 * held tickets, and send the buyer back to the form.
 */
export async function GET(req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const admin = adminClient();
  const back = (path: string) => Response.redirect(new URL(path, req.url), 303);
  if (!admin) return back("/");
  const order = await loadOrder(admin, orderId);
  if (!order) return back("/");
  const { data: meta } = await admin.from("paid_orders").select("forms(slug), organizations(slug)").eq("id", order.id).maybeSingle();
  const m = meta as unknown as { forms: { slug: string } | null; organizations: { slug: string } | null } | null;
  const formPath = m?.forms && m.organizations ? `/f/${m.organizations.slug}/${m.forms.slug}` : "/";
  if (order.status === "pending" && order.provider === "stripe" && order.checkout_id) {
    const stripe = stripeClient();
    try {
      const s = stripe ? await stripe.checkout.sessions.retrieve(order.checkout_id, {}, { stripeAccount: order.account_id }) : null;
      if (s?.payment_status === "paid") return back(`/pay/${order.id}`);
      if (s?.status === "open") await stripe!.checkout.sessions.expire(order.checkout_id, {}, { stripeAccount: order.account_id });
      await expireOrder(admin, order);
    } catch {
      // Leave the hold to lapse on its own; the order is never confirmed without a payment.
    }
  }
  return back(`${formPath}?checkout=canceled`);
}
