// Replies customers send to our Twilio number. STOP opts them out of every business's updates
// (it's one shared sender); START opts back in customers who had agreed before. Twilio itself
// sends the standard STOP/START/HELP confirmations, so we reply with an empty response.
import { adminClient } from "@/lib/supabase/admin";
import { isE164, isOptOutRequest, isStartWord, isStopWord } from "@/lib/sms";
import { optBackIn, optOut } from "@/server/messaging";
import { readTwilioWebhook } from "../webhook";
import { logSecurityEvent } from "@/server/security-log";

const EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const CONFIRM = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>QueuedToGo Order Updates: you are unsubscribed and will get no more texts. Reply START to resubscribe.</Message></Response>';

export async function POST(req: Request) {
  const p = await readTwilioWebhook(req, "/api/twilio/inbound");
  if (!p) {
    await logSecurityEvent("webhook.bad_signature", { detail: "twilio inbound" });
    return new Response("Forbidden", { status: 403 });
  }
  const admin = adminClient();
  const from = p.From ?? "";
  const body = p.Body ?? "";
  if (admin && isE164(from)) {
    if (isStopWord(body) || p.OptOutType === "STOP") await optOut(admin, from);
    else if (isOptOutRequest(body)) {
      // A stop request in plain words: Twilio doesn't recognise it, so we opt them out and send the one
      // confirmation the TCPA allows ourselves.
      await optOut(admin, from);
      return new Response(CONFIRM, { headers: { "Content-Type": "text/xml" } });
    } else if (isStartWord(body) || p.OptOutType === "START") await optBackIn(admin, from);
  }
  return new Response(EMPTY, { headers: { "Content-Type": "text/xml" } });
}
