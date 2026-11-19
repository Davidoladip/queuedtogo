import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminClient } from "@/lib/supabase/admin";
import { AutoRefresh } from "@/components/ui/AutoRefresh";
import { money } from "@/lib/pricing";
import { checkWithProvider, loadOrder, type Settled } from "@/server/payments/settle";

export const metadata: Metadata = { title: "Your payment", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Where Stripe or Square send the buyer after paying. The page asks the provider itself whether the order is paid
 * (it never trusts the URL), so the buyer sees their order number even before the webhook arrives.
 */
export default async function PaymentReturnPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const admin = adminClient();
  if (!admin) notFound();
  const order = await loadOrder(admin, orderId);
  if (!order) notFound();
  const { data: meta } = await admin.from("paid_orders")
    .select("total_cents, forms(title, slug), organizations(name, slug)").eq("id", order.id).maybeSingle();
  const m = meta as unknown as { total_cents: number; forms: { title: string; slug: string } | null; organizations: { name: string; slug: string } | null } | null;
  let result: Settled;
  try {
    result = await checkWithProvider(admin, order);
  } catch (e) {
    console.error("payment return", order.id, e instanceof Error ? e.message : e);
    result = { status: (order.status === "paid" ? "pending" : order.status) as Exclude<Settled["status"], "paid"> };
  }
  const formUrl = m?.forms && m.organizations ? `/f/${m.organizations.slug}/${m.forms.slug}` : "/";
  const org = m?.organizations?.name ?? "the organizer";

  return (
    <div className="auth-shell wrap">
      <main className="auth-card" style={{ maxWidth: 520 }}>
        <span className="section-label">{org}</span>
        {result.status === "paid" ? (
          <>
            <h1>You&apos;re all set!</h1>
            <p className="muted">Your payment of {money(m?.total_cents ?? 0, true)} to {org} went through{m?.forms ? ` for ${m.forms.title}` : ""}.</p>
            <div className="notice success" role="status">
              <div className="section-label">Your order number</div>
              <b className="mono" style={{ fontSize: 26 }}>QTG-{result.number}</b>
            </div>
            <p>We&apos;ve sent your confirmation. Your receipt comes from {order.provider === "square" ? "Square" : "Stripe"} by email.</p>
            <Link className="btn primary" href={`/t/${result.trackingToken}`}>Track your order</Link>
          </>
        ) : result.status === "pending" ? (
          <>
            <AutoRefresh seconds={3} />
            <h1>Confirming your payment…</h1>
            <p className="muted">This usually takes a few seconds. Keep this page open; it updates by itself.</p>
            <p className="muted">If you closed the payment page without paying, nothing was charged and your tickets are released after 30 minutes.</p>
          </>
        ) : result.status === "refunded" || result.status === "refund_due" ? (
          <>
            <h1>Sorry, those tickets sold out</h1>
            <p>Your payment arrived after your hold ended and the last tickets had been sold. We&apos;ve refunded it in full; it can take 5 to 10 days to show on your statement.</p>
            <Link className="btn" href={formUrl}>Back to the form</Link>
          </>
        ) : result.status === "review" ? (
          <>
            <h1>We&apos;re checking your payment</h1>
            <p>Something about this payment didn&apos;t match your order, so {org} will check it and contact you. You won&apos;t be charged twice.</p>
          </>
        ) : (
          <>
            <h1>This checkout has ended</h1>
            <p className="muted">Nothing was charged{result.status === "expired" ? ", and the tickets you picked were released" : ""}.</p>
            <Link className="btn primary" href={formUrl}>Start again</Link>
          </>
        )}
      </main>
    </div>
  );
}
