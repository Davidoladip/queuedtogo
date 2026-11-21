import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { keyedHash } from "@/server/abuse";

/**
 * Suspicious activity, for the daily security digest and for searching the logs ("[security]").
 * Never stores IPs, emails, tokens or request bodies: IPs and emails are kept only as keyed hashes, and the
 * detail is a short label. Logging never fails the request it describes.
 */
export type SecurityEventKind =
  | "rate_limit.hit"
  | "bot_check.failed"
  | "auth.signin_failed"
  | "auth.google_failed"
  | "webhook.bad_signature"
  | "cron.unauthorized"
  | "payment.review"
  | "payment.refund_due"
  | "upload.rejected";

export async function logSecurityEvent(kind: SecurityEventKind, v: { ip?: string; email?: string; orgId?: string | null; detail?: string } = {}): Promise<void> {
  const ipHash = v.ip ? keyedHash(v.ip, "security-ip").slice(0, 32) : null;
  const emailHash = v.email ? keyedHash(v.email.toLowerCase(), "security-email").slice(0, 32) : null;
  const detail = (v.detail ?? "").replace(/[\r\n]+/g, " ").slice(0, 200) || null;
  console.warn("[security]", JSON.stringify({ kind, ip: ipHash, email: emailHash, org: v.orgId ?? null, detail }));
  try {
    const admin = adminClient();
    if (!admin) return;
    await admin.from("security_events").insert({ kind, ip_hash: ipHash, email_hash: emailHash, org_id: v.orgId ?? null, detail });
  } catch {
    // Best effort.
  }
}
