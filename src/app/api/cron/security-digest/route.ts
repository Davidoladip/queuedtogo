import { timingSafeEqual } from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";
import { emailConfig, sendEmail } from "@/lib/email";
import { logSecurityEvent } from "@/server/security-log";

// Daily (see vercel.json): counts the last 24 hours of the security log, emails the operator when something
// stands out, and deletes entries older than 90 days.
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Any of these is worth a look; the rest only in bulk. */
const ALWAYS = new Set(["webhook.bad_signature", "cron.unauthorized", "payment.review", "payment.refund_due"]);
const BULK = 50;

const LABELS: Record<string, string> = {
  "rate_limit.hit": "Requests blocked by a rate limit",
  "bot_check.failed": "Failed bot checks on public forms",
  "auth.signin_failed": "Failed password sign-ins",
  "auth.google_failed": "Failed Google sign-ins",
  "webhook.bad_signature": "Webhook calls with a bad or missing signature",
  "cron.unauthorized": "Scheduled-job URLs called without the secret",
  "payment.review": "Payments that didn't match their order (held for review)",
  "payment.refund_due": "Late payments refunded because tickets sold out",
  "upload.rejected": "Uploads whose content didn't match their file type",
};

export async function GET(req: Request) {
  if (!authorized(req)) {
    await logSecurityEvent("cron.unauthorized", { detail: "security-digest" });
    return Response.json({ error: "Not allowed" }, { status: 401 });
  }
  const admin = adminClient();
  if (!admin) return Response.json({ error: "Server not configured" }, { status: 503 });
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data } = await admin.from("security_events").select("kind, ip_hash, detail").gte("created_at", since).limit(10_000);
  const counts = new Map<string, { n: number; ips: Set<string>; details: Map<string, number> }>();
  for (const e of data ?? []) {
    const c = counts.get(e.kind) ?? { n: 0, ips: new Set(), details: new Map() };
    c.n++;
    if (e.ip_hash) c.ips.add(e.ip_hash);
    if (e.detail) c.details.set(e.detail, (c.details.get(e.detail) ?? 0) + 1);
    counts.set(e.kind, c);
  }
  await admin.from("security_events").delete().lt("created_at", new Date(Date.now() - 90 * 86400_000).toISOString());

  const notable = [...counts].filter(([k, c]) => ALWAYS.has(k) || c.n >= BULK);
  const to = process.env.SECURITY_ALERT_EMAIL || "hello@threadtogo.com";
  const cfg = emailConfig();
  if (!notable.length || !cfg) return Response.json({ events: data?.length ?? 0, alerted: false });

  const rows = [...counts].sort((a, b) => b[1].n - a[1].n).map(([k, c]) => {
    const top = [...c.details].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d, n]) => `${d} (${n})`).join(", ");
    return { label: LABELS[k] ?? k, n: c.n, sources: c.ips.size, top };
  });
  const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
  const text = ["QueuedToGo security digest: the last 24 hours.", "", ...rows.map((r) => `${r.label}: ${r.n} (from ${r.sources} source${r.sources === 1 ? "" : "s"})${r.top ? ` — ${r.top}` : ""}`), "", "Search the Vercel logs for \"[security]\" for each event."].join("\n");
  const html = `<p>QueuedToGo security digest: the last 24 hours.</p><table cellpadding="6" style="border-collapse:collapse;font:14px sans-serif">${rows.map((r) => `<tr><td>${esc(r.label)}</td><td align="right"><b>${r.n}</b></td><td>${r.sources} source${r.sources === 1 ? "" : "s"}</td><td>${esc(r.top)}</td></tr>`).join("")}</table><p style="font:13px sans-serif;color:#555">Search the Vercel logs for "[security]" to see each event. Sources are counted by a one-way hash of the IP address.</p>`;
  const sent = await sendEmail(cfg, { to, subject: "QueuedToGo security digest: something to check", html, text, tags: { kind: "security-digest" } });
  return Response.json({ events: data?.length ?? 0, alerted: sent.ok });
}
