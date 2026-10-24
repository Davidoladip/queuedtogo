import "server-only";
// Sends queued customer updates (texts and emails) and team alerts. The database queues them
// (queue_customer_message); this claims each one before sending so two servers can never send the
// same message, retries temporary failures, and records the result. Uses the service-role client
// because messages are written only by the server; every query is still limited to one business.
import { adminClient } from "@/lib/supabase/admin";
import { explainError, renderSms, sendSms, twilioConfig, type TwilioConfig } from "@/lib/sms";
import { customerEmail, emailConfig, explainEmailError, sendEmail, teamAlertEmail, testEmail, type EmailConfig } from "@/lib/email";

const MAX_ATTEMPTS = 3;
const MAX_AGE_MS = 24 * 3600_000;

type Admin = NonNullable<ReturnType<typeof adminClient>>;
type Row = {
  id: string; org_id: string; job_id: string | null; kind: string; channel: string; to_address: string | null; template: string | null;
  body: string | null; subject: string | null; attempts: number; created_at: string; customer_id: string | null;
  jobs: { id: string; number: number; tracking_token: string; summary: string | null; title: string; forms: { title: string } | null } | null;
  customers: { name: string | null } | null;
  organizations: { name: string; slug: string; reply_to_email: string | null } | null;
  workflow_stages: { name: string } | null;
};
type Deps = { admin?: Admin | null; cfg?: TwilioConfig | null; email?: EmailConfig | null; fetchImpl?: typeof fetch };
type Outcome =
  | { kind: "sent"; providerId: string; body: string; subject?: string }
  | { kind: "skip"; reason: string }
  | { kind: "error"; code: string; message: string; retry: boolean; body?: string; subject?: string };

export function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

const SELECT = "id, org_id, job_id, kind, channel, to_address, template, body, subject, attempts, created_at, customer_id, jobs(id, number, tracking_token, summary, title, forms(title)), customers(name), organizations(name, slug, reply_to_email), workflow_stages(name)";

/** Sends this business's queued messages (optionally just one job's, or just some messages). Never throws. */
export async function dispatchQueued(opts: { orgId: string; jobId?: string; ids?: string[]; limit?: number }, deps?: Deps) {
  const admin = deps && "admin" in deps ? deps.admin : adminClient();
  const tally = { sent: 0, failed: 0, skipped: 0 };
  if (!admin) return tally;
  const sms = deps && "cfg" in deps ? deps.cfg : twilioConfig();
  const mail = deps && "email" in deps ? deps.email : emailConfig();
  let q = admin.from("messages").select(SELECT).eq("org_id", opts.orgId).eq("status", "queued").order("created_at").limit(opts.limit ?? 20);
  if (opts.jobId) q = q.eq("job_id", opts.jobId);
  if (opts.ids?.length) q = q.in("id", opts.ids);
  const { data, error } = await q;
  if (error || !data) return tally;

  for (const m of data as unknown as Row[]) {
    // Claim it: only one sender can move a message from queued to sending.
    const { data: claimed } = await admin.from("messages").update({ status: "sending", attempts: m.attempts + 1 })
      .eq("id", m.id).eq("status", "queued").select("id");
    if (!claimed?.length) continue;

    const out: Outcome = Date.now() - Date.parse(m.created_at) > MAX_AGE_MS
      ? { kind: "skip", reason: "It was more than a day old, so it wasn't sent." }
      : !m.to_address
        ? { kind: "skip", reason: m.channel === "email" ? "There's no email address." : "The customer has no mobile number." }
        : m.channel === "email" ? await deliverEmail(m, mail, deps?.fetchImpl) : await deliverSms(m, sms, deps?.fetchImpl);

    if (out.kind === "skip") {
      tally.skipped++;
      await admin.from("messages").update({ status: "skipped", skip_reason: out.reason }).eq("id", m.id);
      continue;
    }
    if (out.kind === "sent") {
      tally.sent++;
      await admin.from("messages").update({ status: "sent", provider_sid: out.providerId, body: out.body, subject: out.subject ?? null, sent_at: new Date().toISOString(), error_code: null, error_message: null }).eq("id", m.id);
      if (m.job_id && m.kind !== "team_alert") {
        await admin.from("job_events").insert({ org_id: m.org_id, job_id: m.job_id, type: "notification", body: (out.subject ?? out.body).slice(0, 2000), data: { message_id: m.id, channel: m.channel }, idempotency_key: `message:${m.id}` });
      }
      continue;
    }
    if (out.retry && m.attempts + 1 < MAX_ATTEMPTS) {
      await admin.from("messages").update({ status: "queued", body: out.body ?? null, error_code: out.code, error_message: out.message }).eq("id", m.id);
      continue;
    }
    tally.failed++;
    const reason = m.channel === "email" ? explainEmailError(out.code, out.message) : explainError(out.code, out.message);
    await admin.from("messages").update({ status: "failed", body: out.body ?? null, subject: out.subject ?? null, error_code: out.code.slice(0, 20), error_message: reason.slice(0, 500) }).eq("id", m.id);
    // The customer opted out with STOP: respect it everywhere.
    if (m.channel === "sms" && out.code === "21610") await optOut(admin, m.to_address!);
  }
  return tally;
}

async function deliverSms(m: Row, cfg: TwilioConfig | null | undefined, fetchImpl?: typeof fetch): Promise<Outcome> {
  if (!cfg) return { kind: "skip", reason: "Texting isn't connected to Twilio yet." };
  const body = m.body ?? renderSms(m.template ?? "", {
    name: m.customers?.name ?? null,
    order: m.jobs?.number ?? null,
    link: m.jobs ? `${siteBase()}/t/${m.jobs.tracking_token}` : null,
    business: m.organizations?.name ?? "",
    stage: m.workflow_stages?.name ?? null,
  });
  const r = await sendSms(cfg, m.to_address!, body, `${siteBase()}/api/twilio/status`, fetchImpl);
  return r.ok ? { kind: "sent", providerId: r.sid, body } : { kind: "error", code: r.code, message: r.message, retry: r.retry, body };
}

async function deliverEmail(m: Row, cfg: EmailConfig | null | undefined, fetchImpl?: typeof fetch): Promise<Outcome> {
  if (!cfg) return { kind: "skip", reason: "Email isn't connected yet." };
  const org = m.organizations;
  const job = m.jobs;
  if (!org) return { kind: "skip", reason: "The business no longer exists." };
  let content: { subject: string; html: string; text: string };
  let stopUrl: string | null = null;
  if (m.kind === "team_alert") {
    if (!job) return { kind: "skip", reason: "The job no longer exists." };
    content = teamAlertEmail({
      business: org.name, orderNumber: job.number, customerName: m.customers?.name ?? null, summary: job.summary, formTitle: job.forms?.title ?? null,
      jobUrl: `${siteBase()}/w/${org.slug}/board/${job.id}`, settingsUrl: `${siteBase()}/w/${org.slug}/notifications#alerts`,
    });
  } else if (m.kind === "confirmation" || m.kind === "stage_update") {
    if (!job) return { kind: "skip", reason: "The job no longer exists." };
    const trackingUrl = `${siteBase()}/t/${job.tracking_token}`;
    stopUrl = `${trackingUrl}?stop=1`;
    const message = m.kind === "stage_update"
      ? renderSms(m.template ?? "", { name: m.customers?.name ?? null, order: job.number, link: trackingUrl, business: org.name, stage: m.workflow_stages?.name ?? null }, { optOut: false })
      : null;
    content = customerEmail({
      kind: m.kind, business: org.name, customerName: m.customers?.name ?? null, orderNumber: job.number, summary: job.summary,
      formTitle: job.forms?.title ?? null, stage: m.workflow_stages?.name ?? null, message, trackingUrl,
      stopUrl: m.kind === "stage_update" ? stopUrl : null, replyTo: org.reply_to_email,
    });
  } else if (m.kind === "test") {
    content = testEmail({ business: org.name, notificationsUrl: `${siteBase()}/w/${org.slug}/notifications` });
  } else {
    return { kind: "skip", reason: "This kind of message isn't sent by email." };
  }
  const r = await sendEmail(cfg, {
    to: m.to_address!, subject: content.subject, html: content.html, text: content.text,
    unsubscribeUrl: m.kind === "stage_update" ? stopUrl : null, fromName: org.name,
    tags: { message_id: m.id, kind: m.kind.replace("_", "-") },
  }, fetchImpl);
  return r.ok
    ? { kind: "sent", providerId: r.id, body: content.text.slice(0, 1600), subject: content.subject.slice(0, 200) }
    : { kind: "error", code: r.code, message: r.message, retry: r.retry, body: content.text.slice(0, 1600), subject: content.subject.slice(0, 200) };
}

/** STOP: this number gets no more texts from any business on QueuedToGo (it's one shared sender). */
export async function optOut(admin: Admin, phone: string) {
  await admin.from("customers").update({ consent_updates: false }).eq("phone", phone).eq("consent_updates", true);
}
/** START: customers with this number who had agreed before get updates again. */
export async function optBackIn(admin: Admin, phone: string) {
  await admin.from("customers").update({ consent_updates: true }).eq("phone", phone).eq("consent_updates", false).not("consent_at", "is", null);
}
