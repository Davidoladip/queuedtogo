import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { dispatchQueued } from "@/server/messaging";

// Daily (see vercel.json): queues and sends the day-before RSVP reminders (emails and texts), and sends
// RSVP texts that were held back overnight.
// Vercel calls this with "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
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
  if (!authorized(req)) return Response.json({ error: "Not allowed" }, { status: 401 });
  const admin = adminClient();
  if (!admin) return Response.json({ error: "Server not configured" }, { status: 503 });
  const { data, error } = await admin.rpc("queue_rsvp_reminders");
  if (error) return Response.json({ error: "Couldn't queue reminders" }, { status: 500 });
  // Also businesses with RSVP texts that were held back overnight (quiet hours) and are still fresh.
  const since = new Date(Date.now() - 23 * 3600_000).toISOString();
  const { data: held } = await admin.from("messages").select("org_id").eq("status", "queued").in("kind", ["rsvp_reminder", "rsvp_promoted"]).gte("created_at", since).limit(1000);
  const orgs = [...new Set([...((data as unknown as string[] | null) ?? []), ...(held ?? []).map((h) => h.org_id)])];
  let sent = 0, failed = 0, skipped = 0;
  for (const orgId of orgs) {
    // Send in batches until this business's queue is empty (each call sends up to 50).
    for (let i = 0; i < 20; i++) {
      const t = await dispatchQueued({ orgId, limit: 50 });
      sent += t.sent; failed += t.failed; skipped += t.skipped;
      if (t.sent + t.failed + t.skipped < 50) break;
    }
  }
  return Response.json({ businesses: orgs.length, sent, failed, skipped });
}
