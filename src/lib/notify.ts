// Notifications page: shared types and input checks (used by the server actions, the page and the harness).
import { z } from "zod";
import { unknownPlaceholders } from "@/lib/design/media";
import { MAX_TEMPLATE, SMS_VARS } from "@/lib/sms-text";

export type StageMessage = { id: string; name: string; color: string; notify: boolean; template: string };
export type LogEntry = {
  id: string;
  at: string;
  kind: string;
  status: string;
  /** Already shortened on the server (•••• 4567): full numbers never reach the browser in the log. */
  to: string | null;
  channel?: string;
  subject?: string | null;
  body: string | null;
  reason: string | null;
  jobId: string | null;
  orderNumber: number | null;
  customer: string | null;
  stage: string | null;
};
export type TwilioStatus = { accountSid: boolean; authToken: boolean; sender: boolean; ready: boolean };
export type NotifyResult = { ok: true; note?: string } | { ok: false; error: string };

export const stageMessageSchema = z
  .object({
    notify: z.boolean(),
    template: z.string().trim().max(MAX_TEMPLATE, `Keep the message under ${MAX_TEMPLATE} characters.`),
  })
  .superRefine((v, ctx) => {
    if (v.notify && !v.template) ctx.addIssue({ code: "custom", message: "Write the message, or switch this stage's updates off." });
    const bad = unknownPlaceholders(v.template, SMS_VARS);
    if (bad.length) ctx.addIssue({ code: "custom", message: `Unknown placeholder ${bad.map((b) => `{${b}}`).join(", ")}. Use ${SMS_VARS.map((x) => `{${x}}`).join(" ")}.` });
  });

export const TEST_TEXT = "This is a test text from {business} on QueuedToGo. Order updates to your customers will look like this.";
export const TEST_LIMIT_PER_HOUR = 5;

/** Shows only the last 4 digits of a number in lists. */
export const maskPhone = (p: string | null) => (p ? `•••• ${p.slice(-4)}` : "—");

export const STATUS_LABEL: Record<string, { text: string; tone: "good" | "warn" | "bad" | "plain" | "accent" }> = {
  queued: { text: "Waiting to send", tone: "plain" },
  sending: { text: "Sending", tone: "plain" },
  sent: { text: "Sent", tone: "accent" },
  delivered: { text: "Delivered", tone: "good" },
  undelivered: { text: "Not delivered", tone: "bad" },
  failed: { text: "Failed", tone: "bad" },
  skipped: { text: "Not sent", tone: "warn" },
};
