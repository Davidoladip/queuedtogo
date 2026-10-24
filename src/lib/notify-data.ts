import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { maskPhone, type LogEntry } from "@/lib/notify";
import { maskEmail } from "@/lib/email";

type Db = Awaited<ReturnType<typeof createClient>>;
type MsgRow = {
  id: string; created_at: string; kind: string; status: string; channel: string; subject: string | null; to_address: string | null; body: string | null;
  skip_reason: string | null; error_message: string | null; job_id: string | null;
  jobs: { number: number } | null; customers: { name: string | null } | null; workflow_stages: { name: string } | null;
};
const COLS = "id, created_at, kind, status, channel, subject, to_address, body, skip_reason, error_message, job_id, jobs(number), customers(name), workflow_stages(name)";

const toEntry = (m: MsgRow): LogEntry => ({
  id: m.id, at: m.created_at, kind: m.kind, status: m.status, to: m.to_address ? (m.channel === "email" ? maskEmail(m.to_address) : maskPhone(m.to_address)) : null, channel: m.channel, subject: m.subject, body: m.body,
  reason: m.status === "skipped" ? m.skip_reason : ["failed", "undelivered"].includes(m.status) ? m.error_message : null,
  jobId: m.job_id, orderNumber: m.jobs?.number ?? null, customer: m.customers?.name ?? null, stage: m.workflow_stages?.name ?? null,
});

/** The business's latest messages (row level security limits this to the signed-in member's business). */
export async function loadMessageLog(db: Db, orgId: string, opts: { jobId?: string; limit?: number } = {}): Promise<LogEntry[]> {
  let q = db.from("messages").select(COLS).eq("org_id", orgId).order("created_at", { ascending: false }).limit(opts.limit ?? 50);
  if (opts.jobId) q = q.eq("job_id", opts.jobId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as unknown as MsgRow[]).map(toEntry);
}
