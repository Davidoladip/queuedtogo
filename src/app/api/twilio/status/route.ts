// Twilio delivery updates for texts we sent. Signed by Twilio; anything else gets a 403.
import { adminClient } from "@/lib/supabase/admin";
import { STATUS_RANK, explainError, mapStatus } from "@/lib/sms";
import { optOut } from "@/server/messaging";
import { readTwilioWebhook } from "../webhook";

export async function POST(req: Request) {
  const p = await readTwilioWebhook(req, "/api/twilio/status");
  if (!p) return new Response("Forbidden", { status: 403 });
  const admin = adminClient();
  const sid = p.MessageSid ?? p.SmsSid ?? "";
  const next = mapStatus(p.MessageStatus ?? p.SmsStatus ?? "");
  if (!admin || !/^(SM|MM)[0-9a-f]{32}$/.test(sid) || !next) return new Response(null, { status: 204 });

  const { data: m } = await admin.from("messages").select("id, status, to_address").eq("provider_sid", sid).maybeSingle();
  // Ignore unknown messages, and late callbacks that would move a text backwards (e.g. "sent" after "delivered").
  if (!m || (STATUS_RANK[m.status] ?? 0) >= next.rank) return new Response(null, { status: 204 });
  const code = p.ErrorCode || null;
  await admin.from("messages").update({
    status: next.status,
    error_code: code,
    error_message: next.rank === 3 ? explainError(code, "The carrier couldn't deliver the text.") : null,
  }).eq("id", m.id);
  if (code === "21610" && m.to_address) await optOut(admin, m.to_address);
  return new Response(null, { status: 204 });
}
