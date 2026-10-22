// Replies customers send to our Twilio number. STOP opts them out of every business's updates
// (it's one shared sender); START opts back in customers who had agreed before. Twilio itself
// sends the standard STOP/START/HELP confirmations, so we reply with an empty response.
import { adminClient } from "@/lib/supabase/admin";
import { isE164, isStartWord, isStopWord } from "@/lib/sms";
import { optBackIn, optOut } from "@/server/messaging";
import { readTwilioWebhook } from "../webhook";

const EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

export async function POST(req: Request) {
  const p = await readTwilioWebhook(req, "/api/twilio/inbound");
  if (!p) return new Response("Forbidden", { status: 403 });
  const admin = adminClient();
  const from = p.From ?? "";
  const body = p.Body ?? "";
  if (admin && isE164(from)) {
    if (isStopWord(body) || p.OptOutType === "STOP") await optOut(admin, from);
    else if (isStartWord(body) || p.OptOutType === "START") await optBackIn(admin, from);
  }
  return new Response(EMPTY, { headers: { "Content-Type": "text/xml" } });
}
