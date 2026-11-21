import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { authEmail, emailConfig, isEmail, sendEmail, type AuthEmailKind } from "@/lib/email";
import { safeNext } from "@/lib/urls";
import { logSecurityEvent } from "@/server/security-log";

/**
 * Supabase "Send Email" hook: Supabase Auth calls this instead of sending its own emails, so sign-up confirmations
 * and password resets come from QueuedToGo's address in QueuedToGo's design (not "Supabase Auth").
 * Requests are signed (Standard Webhooks) with SEND_EMAIL_HOOK_SECRET; anything unsigned or stale is refused.
 */
export const dynamic = "force-dynamic";

const KINDS: AuthEmailKind[] = ["signup", "recovery", "magiclink", "invite", "reauthentication"];

function verify(body: string, h: Headers): boolean {
  const raw = process.env.SEND_EMAIL_HOOK_SECRET ?? "";
  const secret = raw.replace(/^v1,/, "").replace(/^whsec_/, "");
  const id = h.get("webhook-id") ?? "";
  const ts = h.get("webhook-timestamp") ?? "";
  const sigs = (h.get("webhook-signature") ?? "").split(" ");
  if (!secret || !id || !/^\d{9,11}$/.test(ts)) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = createHmac("sha256", Buffer.from(secret, "base64")).update(`${id}.${ts}.${body}`).digest();
  return sigs.some((s) => {
    const [v, b64] = s.split(",");
    if (v !== "v1" || !b64) return false;
    const got = Buffer.from(b64, "base64");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

const fail = (status: number, message: string) => NextResponse.json({ error: { http_code: status, message } }, { status });

export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > 20_000 || !verify(body, req.headers)) {
    await logSecurityEvent("webhook.bad_signature", { detail: "auth email hook" });
    return fail(401, "Bad signature");
  }
  let p: { user?: { email?: string }; email_data?: { token?: string; token_hash?: string; redirect_to?: string; email_action_type?: string } };
  try { p = JSON.parse(body); } catch { return fail(400, "Bad payload"); }
  const to = p.user?.email ?? "";
  const kind = p.email_data?.email_action_type as AuthEmailKind;
  const hash = p.email_data?.token_hash ?? "";
  if (!isEmail(to)) return fail(400, "No email address");
  // Email changes aren't offered in QueuedToGo; refuse rather than send a half-working email.
  if (!KINDS.includes(kind)) return fail(400, `Unsupported email type: ${String(kind).slice(0, 40)}`);
  if (kind !== "reauthentication" && !/^[A-Za-z0-9_-]{10,200}$/.test(hash)) return fail(400, "Missing token");

  const site = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  // Where to go after confirming: the "next" the app asked for, kept on this site.
  let next = kind === "recovery" ? "/reset-password" : "/onboarding";
  try {
    const r = new URL(p.email_data?.redirect_to ?? "", site);
    if (r.origin === new URL(site).origin && r.searchParams.get("next")) next = safeNext(r.searchParams.get("next"), next);
  } catch { /* keep the default */ }
  const link = `${site}/auth/confirm?token_hash=${encodeURIComponent(hash)}&type=${kind}&next=${encodeURIComponent(next)}`;

  const cfg = emailConfig();
  if (!cfg) return fail(503, "Email isn't set up");
  const msg = authEmail(kind, { link, code: p.email_data?.token ?? null });
  const sent = await sendEmail(cfg, { to, ...msg, fromName: "QueuedToGo", tags: { kind: `auth_${kind}` } });
  if (!sent.ok) {
    console.error("auth email failed", kind, sent.code);
    return fail(502, "We couldn't send the email. Try again in a minute.");
  }
  return NextResponse.json({});
}
