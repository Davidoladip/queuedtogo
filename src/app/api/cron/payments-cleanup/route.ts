import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { squareAccessToken, squareFetch } from "@/server/payments/square";
import { checkWithProvider, expireOrder, loadOrder } from "@/server/payments/settle";
import { logSecurityEvent } from "@/server/security-log";

// Daily (see vercel.json): closes checkouts that were never paid. Each is checked with Stripe or Square first, so a
// payment whose webhook went missing still becomes an order; Square payment links are deleted so they can't be paid
// later; then the hold is released and the buyer's uploads are deleted.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    await logSecurityEvent("cron.unauthorized", { detail: "payments-cleanup" });
    return Response.json({ error: "Not allowed" }, { status: 401 });
  }
  const admin = adminClient();
  if (!admin) return Response.json({ error: "Server not configured" }, { status: 503 });
  const cutoff = new Date(Date.now() - 2 * 3600_000).toISOString();
  const { data } = await admin.from("paid_orders").select("id").eq("status", "pending").lt("hold_expires_at", cutoff).limit(200);
  let paid = 0, closed = 0, failed = 0;
  for (const { id } of data ?? []) {
    try {
      const o = await loadOrder(admin, id);
      if (!o) continue;
      const r = await checkWithProvider(admin, o);
      if (r.status === "paid") { paid++; continue; }
      if (r.status !== "pending") continue;
      if (o.provider === "square" && o.checkout_id) {
        const token = await squareAccessToken(admin, o.org_id);
        if (token) await squareFetch(`/v2/online-checkout/payment-links/${encodeURIComponent(o.checkout_id)}`, { method: "DELETE", token });
      }
      await expireOrder(admin, o);
      closed++;
    } catch (e) {
      failed++;
      console.error("payments cleanup", id, e instanceof Error ? e.message : e);
    }
  }
  return Response.json({ paid, closed, failed });
}
