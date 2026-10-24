"use server";

// Development harness actions for the Notifications page. 404-equivalent unless QTG_DEV_HARNESS=1.
// Test texts are never faked: the harness has no Twilio settings, so it gives the real "not connected" answer.
import { stageMessageSchema, type NotifyResult } from "@/lib/notify";
import { toE164 } from "@/lib/submission";
import { twilioConfig } from "@/lib/sms";
import { emailConfig, isEmail } from "@/lib/email";
import { harnessEnabled } from "../sample";
import { notifyStore } from "./store";

const OFF: NotifyResult = { ok: false, error: "The development harness is switched off." };

export async function devSetTexting(on: unknown): Promise<NotifyResult> {
  if (!harnessEnabled()) return OFF;
  if (typeof on !== "boolean") return { ok: false, error: "Choose on or off." };
  notifyStore().textingOn = on;
  return { ok: true };
}
export async function devSaveStage(stageId: string, input: unknown): Promise<NotifyResult> {
  if (!harnessEnabled()) return OFF;
  const p = stageMessageSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the message." };
  const s = notifyStore().stages.find((x) => x.id === stageId);
  if (!s) return { ok: false, error: "That stage no longer exists. Reload the page." };
  s.notify = p.data.notify;
  s.template = p.data.template;
  return { ok: true };
}
export async function devSendTest(phone: unknown): Promise<NotifyResult> {
  if (!harnessEnabled()) return OFF;
  if (typeof phone !== "string" || !toE164(phone)) return { ok: false, error: "Enter a mobile number, like (555) 123-4567." };
  if (!twilioConfig()) return { ok: false, error: "Texting isn't connected to Twilio yet. Add the Twilio settings in Vercel first." };
  return { ok: false, error: "The harness doesn't send real texts." };
}

export async function devSetEmailOn(on: unknown): Promise<NotifyResult> {
  if (!harnessEnabled()) return OFF;
  if (typeof on !== "boolean") return { ok: false, error: "Choose on or off." };
  notifyStore().emailOn = on;
  return { ok: true };
}
export async function devSaveReplyTo(v: unknown): Promise<NotifyResult> {
  if (!harnessEnabled()) return OFF;
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s && !isEmail(s)) return { ok: false, error: "Enter an email address, like hello@yourbusiness.com." };
  notifyStore().replyTo = s;
  return { ok: true };
}
export async function devSetMyAlerts(on: unknown): Promise<NotifyResult> {
  if (!harnessEnabled()) return OFF;
  if (typeof on !== "boolean") return { ok: false, error: "Choose on or off." };
  notifyStore().myAlerts = on;
  return { ok: true };
}
export async function devSendTestEmail(): Promise<NotifyResult> {
  if (!harnessEnabled()) return OFF;
  if (!emailConfig()) return { ok: false, error: "Email isn't connected yet. Add RESEND_API_KEY and EMAIL_FROM in Vercel first." };
  return { ok: false, error: "The harness doesn't send real emails." };
}
export async function devStopUpdates(): Promise<{ ok: boolean }> {
  if (!harnessEnabled()) return { ok: false };
  notifyStore().stopped = true;
  return { ok: true };
}
