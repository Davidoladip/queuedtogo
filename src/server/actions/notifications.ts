"use server";

// Notifications settings: the business's texting switch, each stage's message, and a test text.
// Owners and admins only (also enforced by row level security). Sending uses the server's Twilio
// credentials, which never reach the browser.
import { revalidatePath } from "next/cache";
import { canManage, requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/board";
import { toE164 } from "@/lib/submission";
import { twilioConfig } from "@/lib/sms";
import { emailConfig, isEmail } from "@/lib/email";
import { TEST_LIMIT_PER_HOUR, TEST_TEXT, stageMessageSchema, type NotifyResult } from "@/lib/notify";
import { dispatchQueued } from "@/server/messaging";

const ADMIN_ONLY = "Only owners and admins can change notifications.";

export async function setTexting(orgSlug: string, enabled: unknown): Promise<NotifyResult> {
  const { org } = await requireWorkspace(orgSlug);
  if (!canManage(org.role)) return { ok: false, error: ADMIN_ONLY };
  if (typeof enabled !== "boolean") return { ok: false, error: "Choose on or off." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("organizations").update({ texting_enabled: enabled }).eq("id", org.id).select("id");
  if (error || !data.length) return { ok: false, error: "We couldn't save that. Try again." };
  revalidatePath(`/w/${org.slug}/notifications`);
  return { ok: true };
}

export async function saveStageMessage(orgSlug: string, stageId: string, input: unknown): Promise<NotifyResult> {
  const { org } = await requireWorkspace(orgSlug);
  if (!canManage(org.role)) return { ok: false, error: ADMIN_ONLY };
  if (!isUuid(stageId)) return { ok: false, error: "That stage no longer exists. Reload the page." };
  const parsed = stageMessageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the message." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workflow_stages")
    .update({ notify_customer: parsed.data.notify, message_template: parsed.data.template || null })
    .eq("org_id", org.id).eq("id", stageId).select("id");
  if (error) return { ok: false, error: "We couldn't save the message. Try again." };
  if (!data.length) return { ok: false, error: "That stage no longer exists. Reload the page." };
  revalidatePath(`/w/${org.slug}`, "layout");
  return { ok: true };
}

/** Sends a test text to a number the owner or admin types in (for example their own phone). */
export async function sendTestText(orgSlug: string, phone: unknown): Promise<NotifyResult> {
  const { user, org } = await requireWorkspace(orgSlug);
  if (!canManage(org.role)) return { ok: false, error: ADMIN_ONLY };
  const to = typeof phone === "string" ? toE164(phone) : null;
  if (!to) return { ok: false, error: "Enter a mobile number, like (555) 123-4567." };
  if (!twilioConfig()) return { ok: false, error: "Texting isn't connected to Twilio yet. Add the Twilio settings in Vercel first." };
  const admin = adminClient();
  if (!admin) return { ok: false, error: "The server isn't set up to send texts (the Supabase secret key is missing)." };

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("messages").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("kind", "test").gte("created_at", since);
  if ((count ?? 0) >= TEST_LIMIT_PER_HOUR) return { ok: false, error: `You can send up to ${TEST_LIMIT_PER_HOUR} test texts an hour. Try again later.` };

  const { data: row, error } = await admin.from("messages")
    .insert({ org_id: org.id, kind: "test", channel: "sms", to_address: to, template: TEST_TEXT, status: "queued", created_by: user.id })
    .select("id").single();
  if (error || !row) return { ok: false, error: "We couldn't queue the test text. Try again." };
  const r = await dispatchQueued({ orgId: org.id, ids: [row.id] });
  revalidatePath(`/w/${org.slug}/notifications`);
  if (r.sent) return { ok: true, note: `Test text sent to •••• ${to.slice(-4)}. It should arrive within a minute.` };
  const { data: m } = await admin.from("messages").select("status, skip_reason, error_message").eq("id", row.id).single();
  return { ok: false, error: m?.error_message || m?.skip_reason || "The test text wasn't sent. Try again." };
}

// ---------------------------------------------------------------------------- email

export async function setEmailOn(orgSlug: string, enabled: unknown): Promise<NotifyResult> {
  const { org } = await requireWorkspace(orgSlug);
  if (!canManage(org.role)) return { ok: false, error: ADMIN_ONLY };
  if (typeof enabled !== "boolean") return { ok: false, error: "Choose on or off." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("organizations").update({ email_enabled: enabled }).eq("id", org.id).select("id");
  if (error || !data.length) return { ok: false, error: "We couldn't save that. Try again." };
  revalidatePath(`/w/${org.slug}/notifications`);
  return { ok: true };
}

/** Where customers' replies to emails go (for example the business's own inbox). Empty clears it. */
export async function saveReplyTo(orgSlug: string, value: unknown): Promise<NotifyResult> {
  const { org } = await requireWorkspace(orgSlug);
  if (!canManage(org.role)) return { ok: false, error: ADMIN_ONLY };
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (v && !isEmail(v)) return { ok: false, error: "Enter an email address, like hello@yourbusiness.com." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("organizations").update({ reply_to_email: v || null }).eq("id", org.id).select("id");
  if (error || !data.length) return { ok: false, error: "We couldn't save that. Try again." };
  revalidatePath(`/w/${org.slug}/notifications`);
  return { ok: true };
}

/** Every team member chooses their own new-order emails. */
export async function setMyAlerts(orgSlug: string, on: unknown): Promise<NotifyResult> {
  const { user, org } = await requireWorkspace(orgSlug);
  if (typeof on !== "boolean") return { ok: false, error: "Choose on or off." };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("member_alerts").select("user_id").eq("org_id", org.id).eq("user_id", user.id).maybeSingle();
  const { error } = existing
    ? await supabase.from("member_alerts").update({ new_order_email: on }).eq("org_id", org.id).eq("user_id", user.id)
    : await supabase.from("member_alerts").insert({ org_id: org.id, user_id: user.id, new_order_email: on });
  if (error) return { ok: false, error: "We couldn't save that. Try again." };
  revalidatePath(`/w/${org.slug}/notifications`);
  return { ok: true };
}

/** Sends a test email to the signed-in owner or admin. */
export async function sendTestEmail(orgSlug: string): Promise<NotifyResult> {
  const { user, org } = await requireWorkspace(orgSlug);
  if (!canManage(org.role)) return { ok: false, error: ADMIN_ONLY };
  if (!emailConfig()) return { ok: false, error: "Email isn't connected yet. Add RESEND_API_KEY and EMAIL_FROM in Vercel first." };
  if (!user.email || !isEmail(user.email)) return { ok: false, error: "Your account has no email address to send to." };
  const admin = adminClient();
  if (!admin) return { ok: false, error: "The server isn't set up to send emails (the Supabase secret key is missing)." };
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("messages").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("kind", "test").gte("created_at", since);
  if ((count ?? 0) >= TEST_LIMIT_PER_HOUR) return { ok: false, error: `You can send up to ${TEST_LIMIT_PER_HOUR} tests an hour. Try again later.` };
  const { data: row, error } = await admin.from("messages")
    .insert({ org_id: org.id, kind: "test", channel: "email", to_address: user.email, status: "queued", created_by: user.id })
    .select("id").single();
  if (error || !row) return { ok: false, error: "We couldn't queue the test email. Try again." };
  const r = await dispatchQueued({ orgId: org.id, ids: [row.id] });
  revalidatePath(`/w/${org.slug}/notifications`);
  if (r.sent) return { ok: true, note: `Test email sent to ${user.email}. Check your inbox (and spam folder).` };
  const { data: m } = await admin.from("messages").select("skip_reason, error_message").eq("id", row.id).single();
  return { ok: false, error: m?.error_message || m?.skip_reason || "The test email wasn't sent. Try again." };
}
