// Emails: order confirmations, stage updates for customers who chose email, and new-order alerts
// for the team. Sent through Resend's REST API (one call, no SDK). The API key is a server-only
// environment variable and never reaches the browser.

export type EmailConfig = { apiKey: string; from: string };

const EMAIL = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;
/** "QueuedToGo <updates@queuedtogo.com>" or "updates@queuedtogo.com". */
const FROM = /^(?:[^<>@\r\n]{1,80} <[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+>|[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+)$/;

export function emailConfig(env: Record<string, string | undefined> = process.env): EmailConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim() ?? "";
  const from = env.EMAIL_FROM?.trim() ?? "";
  if (!/^re_[A-Za-z0-9_]{16,}$/.test(apiKey) || !FROM.test(from)) return null;
  return { apiKey, from };
}
export function emailSetupStatus(env: Record<string, string | undefined> = process.env) {
  return {
    apiKey: /^re_[A-Za-z0-9_]{16,}$/.test(env.RESEND_API_KEY?.trim() ?? ""),
    from: FROM.test(env.EMAIL_FROM?.trim() ?? ""),
    ready: emailConfig(env) !== null,
  };
}
export const isEmail = (v: string) => v.length <= 254 && EMAIL.test(v);

// ---------------------------------------------------------------------------- sending

export type EmailResult = { ok: true; id: string } | { ok: false; code: string; message: string; retry: boolean };

export async function sendEmail(
  cfg: EmailConfig,
  msg: { to: string; subject: string; html: string; text: string; replyTo?: string | null; idempotencyKey?: string; unsubscribeUrl?: string | null; fromName?: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<EmailResult> {
  if (!isEmail(msg.to)) return { ok: false, code: "invalid_to", message: "The email address isn't valid.", retry: false };
  // Show the business's name as the sender, on QueuedToGo's verified address.
  const address = cfg.from.match(/<([^>]+)>/)?.[1] ?? cfg.from;
  const name = (msg.fromName ?? "").replace(/[<>"\r\n]/g, "").trim().slice(0, 60);
  const headers: Record<string, string> = {};
  if (msg.unsubscribeUrl) headers["List-Unsubscribe"] = `<${msg.unsubscribeUrl}>`;
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
        ...(msg.idempotencyKey ? { "Idempotency-Key": msg.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: name ? `${name} via QueuedToGo <${address}>` : cfg.from,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...(msg.replyTo && isEmail(msg.replyTo) ? { reply_to: msg.replyTo } : {}),
        ...(Object.keys(headers).length ? { headers } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; name?: string; message?: string };
    if (res.ok && data.id) return { ok: true, id: data.id };
    return {
      ok: false,
      code: String(data.name ?? res.status).slice(0, 20),
      message: (data.message ?? `The email service answered ${res.status}.`).slice(0, 300),
      retry: res.status === 429 || res.status >= 500,
    };
  } catch (e) {
    return { ok: false, code: "network", message: e instanceof Error ? e.message.slice(0, 200) : "Network error", retry: true };
  }
}

export function explainEmailError(code: string, fallback: string): string {
  if (code === "401" || code === "403" || /api_key|unauthorized|restricted/i.test(code)) return "The email service rejected the API key. Check RESEND_API_KEY in Vercel.";
  if (/validation_error|422/.test(code)) return "The email service refused this email. Check that queuedtogo.com is verified in Resend and EMAIL_FROM uses it.";
  if (code === "invalid_to") return "The email address isn't valid.";
  return fallback;
}

// ---------------------------------------------------------------------------- content

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Texts ask people to reply STOP; that doesn't apply to email, so it's removed there. */
export const stripSmsOptOut = (s: string) => s.replace(/\s*Reply STOP[^.!]*[.!]?/gi, "").trim();

function layout(o: { preheader: string; heading: string; paragraphs: string[]; button?: { url: string; label: string } | null; details?: [string, string][]; footer: string[] }) {
  const p = o.paragraphs.map((t) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#161A2B">${esc(t)}</p>`).join("");
  const rows = (o.details ?? []).map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#5A6077;font-size:14px;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;font-size:14px;color:#161A2B">${esc(v)}</td></tr>`).join("");
  const btn = o.button ? `<p style="margin:18px 0 8px"><a href="${esc(o.button.url)}" style="display:inline-block;background:#3346D3;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:15px">${esc(o.button.label)}</a></p>` : "";
  const foot = o.footer.map((t) => `<p style="margin:0 0 6px">${t}</p>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.heading)}</title></head>
<body style="margin:0;padding:0;background:#F2F3F7;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${esc(o.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F3F7"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #D4D8E3;border-radius:12px"><tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#161A2B">${esc(o.heading)}</h1>${p}
${rows ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 10px;border-top:1px dashed #D4D8E3;padding-top:8px">${rows}</table>` : ""}${btn}
</td></tr></table>
<div style="max-width:560px;padding:14px 8px;color:#5A6077;font-size:12.5px;line-height:1.5;text-align:left">${foot}</div>
</td></tr></table></body></html>`;
}

export type CustomerEmailInput = {
  kind: "confirmation" | "stage_update";
  business: string;
  customerName: string | null;
  orderNumber: number;
  summary: string | null;
  formTitle: string | null;
  stage: string | null;
  /** The stage's message, already filled in (stage updates only). */
  message?: string | null;
  trackingUrl: string;
  stopUrl: string | null;
  replyTo: string | null;
};

export function customerEmail(v: CustomerEmailInput) {
  const first = (v.customerName ?? "").trim().split(/\s+/)[0] || "there";
  const order = `QTG-${v.orderNumber}`;
  const details: [string, string][] = [["Order", order]];
  if (v.formTitle) details.push(["For", v.formTitle]);
  if (v.summary) details.push(["Items", v.summary]);
  if (v.stage) details.push(["Status", v.stage]);
  const contact = v.replyTo ? `Questions? Reply to this email to reach ${esc(v.business)}.` : `Questions? Contact ${esc(v.business)} and quote ${order}.`;
  const footer = [
    contact,
    v.stopUrl ? `You're getting this because you asked for updates on your order. <a href="${esc(v.stopUrl)}" style="color:#5A6077">Stop order updates</a>.` : "You're getting this because you placed an order.",
    `Sent by QueuedToGo for ${esc(v.business)}.`,
  ];
  if (v.kind === "confirmation") {
    const subject = `${v.business}: we've got your order ${order}`;
    const paragraphs = [`Hi ${first},`, `Thanks for your order with ${v.business}. Your order number is ${order}. Follow its progress any time on your tracking page.`];
    const text = [...paragraphs, "", ...details.map(([k, val]) => `${k}: ${val}`), "", `Track your order: ${v.trackingUrl}`, "", stripTags(contact), v.stopUrl ? `Stop order updates: ${v.stopUrl}` : ""].join("\n").trim();
    return { subject, html: layout({ preheader: `Order ${order} is in the queue.`, heading: "You're in the queue!", paragraphs, details, button: { url: v.trackingUrl, label: "Track my order" }, footer }), text };
  }
  const msg = stripSmsOptOut(v.message ?? "") || `Your order ${order} has moved to ${v.stage ?? "its next stage"}.`;
  const subject = `${v.business}: order ${order}${v.stage ? ` · ${v.stage}` : ""}`;
  const text = [msg, "", ...details.map(([k, val]) => `${k}: ${val}`), "", `Track your order: ${v.trackingUrl}`, "", stripTags(contact), v.stopUrl ? `Stop order updates: ${v.stopUrl}` : ""].join("\n").trim();
  return { subject, html: layout({ preheader: msg.slice(0, 120), heading: v.stage ? `Order update: ${v.stage}` : "Order update", paragraphs: [msg], details, button: { url: v.trackingUrl, label: "See my order" }, footer }), text };
}

export function teamAlertEmail(v: { business: string; orderNumber: number; customerName: string | null; summary: string | null; formTitle: string | null; jobUrl: string; settingsUrl: string }) {
  const order = `QTG-${v.orderNumber}`;
  const who = v.customerName ?? "a customer";
  const details: [string, string][] = [["Order", order], ["Customer", who]];
  if (v.formTitle) details.push(["Form", v.formTitle]);
  if (v.summary) details.push(["Items", v.summary]);
  const subject = `New order ${order} from ${who}`;
  const text = [`New order ${order} for ${v.business}.`, "", ...details.map(([k, val]) => `${k}: ${val}`), "", `Open the job: ${v.jobUrl}`, "", `Change your alerts: ${v.settingsUrl}`].join("\n");
  return {
    subject,
    text,
    html: layout({
      preheader: `${who} placed order ${order}.`, heading: `New order ${order}`, paragraphs: [`${who} just placed an order with ${v.business}.`], details,
      button: { url: v.jobUrl, label: "Open the job" },
      footer: [`You get these because you're on the ${esc(v.business)} team. <a href="${esc(v.settingsUrl)}" style="color:#5A6077">Change your alerts</a>.`],
    }),
  };
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

export function testEmail(v: { business: string; notificationsUrl: string }) {
  const subject = `Test email from ${v.business} on QueuedToGo`;
  const p = `This is a test. Order confirmations, email updates and new-order alerts for ${v.business} will come from this address.`;
  return {
    subject,
    text: `${p}\n\nNotification settings: ${v.notificationsUrl}`,
    html: layout({ preheader: "Your email setup works.", heading: "Your email setup works", paragraphs: [p], button: { url: v.notificationsUrl, label: "Notification settings" }, footer: [`Sent by QueuedToGo for ${esc(v.business)}.`] }),
  };
}

/** Shortens an email address for lists: lena@example.com → l•••@example.com. */
export const maskEmail = (e: string) => { const [u, d] = e.split("@"); return d ? `${u.slice(0, 1)}•••@${d}` : "•••"; };
