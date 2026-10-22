import "server-only";
// Sends queued customer texts. The database queues them (queue_customer_message); this claims each
// one before sending so two servers can never send the same text, retries temporary failures, and
// records the result. Uses the service-role client because customers' texts are written only by
// the server; every query is still limited to one business.
import { adminClient } from "@/lib/supabase/admin";
import { explainError, renderSms, sendSms, twilioConfig, type TwilioConfig } from "@/lib/sms";

const MAX_ATTEMPTS = 3;
const MAX_AGE_MS = 24 * 3600_000;

type Admin = NonNullable<ReturnType<typeof adminClient>>;
type Row = {
  id: string; org_id: string; job_id: string | null; kind: string; to_address: string | null; template: string | null;
  body: string | null; attempts: number; created_at: string; customer_id: string | null;
  jobs: { number: number; tracking_token: string } | null;
  customers: { name: string | null } | null;
  organizations: { name: string } | null;
  workflow_stages: { name: string } | null;
};

export function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** Sends this business's queued texts (optionally just one job's, or just some messages). Never throws. */
export async function dispatchQueued(opts: { orgId: string; jobId?: string; ids?: string[]; limit?: number }, deps?: { admin?: Admin | null; cfg?: TwilioConfig | null; fetchImpl?: typeof fetch }) {
  const admin = deps && "admin" in deps ? deps.admin : adminClient();
  if (!admin) return { sent: 0, failed: 0, skipped: 0 };
  const cfg = deps && "cfg" in deps ? deps.cfg : twilioConfig();
  let q = admin
    .from("messages")
    .select("id, org_id, job_id, kind, to_address, template, body, attempts, created_at, customer_id, jobs(number, tracking_token), customers(name), organizations(name), workflow_stages(name)")
    .eq("org_id", opts.orgId).eq("status", "queued").order("created_at").limit(opts.limit ?? 20);
  if (opts.jobId) q = q.eq("job_id", opts.jobId);
  if (opts.ids?.length) q = q.in("id", opts.ids);
  const { data, error } = await q;
  if (error || !data) return { sent: 0, failed: 0, skipped: 0 };

  const tally = { sent: 0, failed: 0, skipped: 0 };
  for (const m of data as unknown as Row[]) {
    // Claim it: only one sender can move a text from queued to sending.
    const { data: claimed } = await admin.from("messages").update({ status: "sending", attempts: m.attempts + 1 })
      .eq("id", m.id).eq("status", "queued").select("id");
    if (!claimed?.length) continue;

    const skip = async (reason: string) => {
      tally.skipped++;
      await admin.from("messages").update({ status: "skipped", skip_reason: reason }).eq("id", m.id);
    };
    if (!cfg) { await skip("Texting isn't connected to Twilio yet."); continue; }
    if (Date.now() - Date.parse(m.created_at) > MAX_AGE_MS) { await skip("It was more than a day old, so it wasn't sent."); continue; }
    if (!m.to_address) { await skip("The customer has no mobile number."); continue; }

    const body = m.body ?? renderSms(m.template ?? "", {
      name: m.customers?.name ?? null,
      order: m.jobs?.number ?? null,
      link: m.jobs ? `${siteBase()}/t/${m.jobs.tracking_token}` : null,
      business: m.organizations?.name ?? "",
      stage: m.workflow_stages?.name ?? null,
    });
    const r = await sendSms(cfg, m.to_address, body, `${siteBase()}/api/twilio/status`, deps?.fetchImpl);
    if (r.ok) {
      tally.sent++;
      await admin.from("messages").update({ status: "sent", provider_sid: r.sid, body, sent_at: new Date().toISOString(), error_code: null, error_message: null }).eq("id", m.id);
      if (m.job_id) {
        await admin.from("job_events").insert({ org_id: m.org_id, job_id: m.job_id, type: "notification", body: body.slice(0, 2000), data: { message_id: m.id }, idempotency_key: `message:${m.id}` });
      }
      continue;
    }
    if (r.retry && m.attempts + 1 < MAX_ATTEMPTS) {
      await admin.from("messages").update({ status: "queued", body, error_code: r.code, error_message: r.message }).eq("id", m.id);
      continue;
    }
    tally.failed++;
    await admin.from("messages").update({ status: "failed", body, error_code: r.code, error_message: explainError(r.code, r.message) }).eq("id", m.id);
    // The customer opted out with STOP: respect it everywhere.
    if (r.code === "21610") await optOut(admin, m.to_address);
  }
  return tally;
}

/** STOP: this number gets no more texts from any business on QueuedToGo (it's one shared sender). */
export async function optOut(admin: Admin, phone: string) {
  await admin.from("customers").update({ consent_updates: false }).eq("phone", phone).eq("consent_updates", true);
}
/** START: customers with this number who had agreed before get updates again. */
export async function optBackIn(admin: Admin, phone: string) {
  await admin.from("customers").update({ consent_updates: true }).eq("phone", phone).eq("consent_updates", false).not("consent_at", "is", null);
}
