// Customer text updates: message wording, the Twilio REST call, webhook signatures and opt-out words.
// No Twilio SDK: one REST call and one signature check keep this small and easy to audit.
// Credentials come only from server environment variables and are never sent to the browser.
import { createHmac, timingSafeEqual } from "node:crypto";

export type TwilioConfig = {
  accountSid: string;
  /** Basic-auth user and password: an API key (SK…) and its secret, or the Account SID and Auth Token. */
  user: string;
  pass: string;
  /** Used to check that webhooks really come from Twilio. */
  authToken: string;
  messagingServiceSid: string | null;
  from: string | null;
};

const AC = /^AC[0-9a-f]{32}$/;
const SK = /^SK[0-9a-f]{32}$/;
const MG = /^MG[0-9a-f]{32}$/;
const E164 = /^\+[1-9]\d{7,14}$/;

/** Twilio settings from the environment, or null if texting isn't set up (or set up wrongly). */
export function twilioConfig(env: Record<string, string | undefined> = process.env): TwilioConfig | null {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim() ?? "";
  const authToken = env.TWILIO_AUTH_TOKEN?.trim() ?? "";
  const keySid = env.TWILIO_API_KEY_SID?.trim() ?? "";
  const keySecret = env.TWILIO_API_KEY_SECRET?.trim() ?? "";
  const service = env.TWILIO_MESSAGING_SERVICE_SID?.trim() ?? "";
  const from = env.TWILIO_FROM_NUMBER?.trim() ?? "";
  if (!AC.test(accountSid) || authToken.length < 32) return null;
  if (!MG.test(service) && !E164.test(from)) return null;
  const useKey = SK.test(keySid) && keySecret.length >= 32;
  return {
    accountSid,
    user: useKey ? keySid : accountSid,
    pass: useKey ? keySecret : authToken,
    authToken,
    messagingServiceSid: MG.test(service) ? service : null,
    from: MG.test(service) ? null : from,
  };
}

/** Which setup pieces are present, for the Notifications page (never the values themselves). */
export function twilioSetupStatus(env: Record<string, string | undefined> = process.env) {
  return {
    accountSid: AC.test(env.TWILIO_ACCOUNT_SID?.trim() ?? ""),
    authToken: (env.TWILIO_AUTH_TOKEN?.trim().length ?? 0) >= 32,
    sender: MG.test(env.TWILIO_MESSAGING_SERVICE_SID?.trim() ?? "") || E164.test(env.TWILIO_FROM_NUMBER?.trim() ?? ""),
    ready: twilioConfig(env) !== null,
  };
}

export { MAX_TEMPLATE, SMS_VARS, renderSms, smsSegments, type SmsVars } from "./sms-text";

// ---------------------------------------------------------------------------- sending

export type SendResult =
  | { ok: true; sid: string; status: string }
  | { ok: false; code: string; message: string; retry: boolean };

/** Sends one text through Twilio's Messages API. Never throws. */
export async function sendSms(cfg: TwilioConfig, to: string, body: string, statusCallback: string | null, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  if (!E164.test(to)) return { ok: false, code: "21211", message: "The mobile number isn't valid.", retry: false };
  const form = new URLSearchParams({ To: to, Body: body });
  if (cfg.messagingServiceSid) form.set("MessagingServiceSid", cfg.messagingServiceSid);
  else if (cfg.from) form.set("From", cfg.from);
  if (statusCallback) form.set("StatusCallback", statusCallback);
  try {
    const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${cfg.user}:${cfg.pass}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; code?: number; message?: string };
    if (res.ok && data.sid) return { ok: true, sid: data.sid, status: data.status ?? "queued" };
    return {
      ok: false,
      code: String(data.code ?? res.status),
      message: (data.message ?? `Twilio answered ${res.status}.`).slice(0, 300),
      retry: res.status === 429 || res.status >= 500,
    };
  } catch (e) {
    return { ok: false, code: "network", message: e instanceof Error ? e.message.slice(0, 200) : "Network error", retry: true };
  }
}

/** Our status for a Twilio message status, and how far along it is (callbacks can arrive out of order). */
export function mapStatus(twilio: string): { status: "sent" | "delivered" | "undelivered" | "failed"; rank: number } | null {
  switch (twilio) {
    case "accepted": case "scheduled": case "queued": case "sending": case "sent": return { status: "sent", rank: 1 };
    case "delivered": case "read": return { status: "delivered", rank: 2 };
    case "undelivered": return { status: "undelivered", rank: 3 };
    case "failed": return { status: "failed", rank: 3 };
    default: return null;
  }
}
export const STATUS_RANK: Record<string, number> = { queued: 0, sending: 0, sent: 1, delivered: 2, undelivered: 3, failed: 3, skipped: 3 };

/** Plain-words reasons for common Twilio error codes. */
export function explainError(code: string | null, fallback = "The text couldn't be sent."): string {
  switch (code) {
    case "21610": return "The customer replied STOP, so they can't be texted.";
    case "21211": case "21614": return "The mobile number isn't valid or can't receive texts.";
    case "21408": return "Texting this country isn't switched on in Twilio.";
    case "30003": return "The phone was off or unreachable.";
    case "30004": return "The customer's carrier blocked the text.";
    case "30005": return "The number doesn't exist.";
    case "30006": return "That number is a landline or can't receive texts.";
    case "30007": return "The carrier filtered the text as possible spam.";
    case "30032": return "The toll-free number isn't verified yet.";
    case "30034": return "The number isn't registered for A2P 10DLC yet.";
    case "20003": return "Twilio rejected the account details. Check the Twilio keys in Vercel.";
    default: return fallback;
  }
}

// ---------------------------------------------------------------------------- webhooks

/** X-Twilio-Signature: base64 HMAC-SHA1 of the full URL followed by each POST field (sorted), keyed by the Auth Token. */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params).sort().reduce((s, k) => s + k + params[k], url);
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
}
export function validTwilioSignature(authToken: string, url: string, params: Record<string, string>, given: string | null): boolean {
  if (!given) return false;
  const want = Buffer.from(twilioSignature(authToken, url, params));
  const got = Buffer.from(given);
  return want.length === got.length && timingSafeEqual(want, got);
}

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"]);
const START_WORDS = new Set(["START", "UNSTOP", "YES"]);
const word = (body: string) => body.trim().toUpperCase().replace(/[^A-Z]/g, "");
export const isStopWord = (body: string) => STOP_WORDS.has(word(body));
export const isStartWord = (body: string) => START_WORDS.has(word(body));

export const isE164 = (v: string) => E164.test(v);
