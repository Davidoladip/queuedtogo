import "server-only";
import { twilioConfig, validTwilioSignature } from "@/lib/sms";
import { siteBase } from "@/server/messaging";

/** Reads a Twilio webhook and checks its signature against our public URL. Null if it isn't genuine. */
export async function readTwilioWebhook(req: Request, path: string): Promise<Record<string, string> | null> {
  const cfg = twilioConfig();
  if (!cfg) return null;
  const fd = await req.formData().catch(() => null);
  if (!fd) return null;
  const params: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") params[k] = v;
  const search = new URL(req.url).search;
  const ok = validTwilioSignature(cfg.authToken, siteBase() + path + search, params, req.headers.get("x-twilio-signature"));
  if (!ok || params.AccountSid !== cfg.accountSid) return null;
  return params;
}
