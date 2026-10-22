import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { DONE_DAYS, type BoardEvent, type BoardJob, type BoardMember, type BoardStage } from "@/lib/board";
import type { JobCustomer } from "@/components/board/JobPanel";

type Db = Awaited<ReturnType<typeof createClient>>;

const JOB_COLS = "id, number, title, summary, stage_id, due_date, priority, assignee_id, completed_at, created_at, form_id, submission_id, tracking_token, forms(title), customers(name, email, phone, preferred_channel, consent_updates)";

type JobRow = {
  id: string; number: number; title: string; summary: string | null; stage_id: string; due_date: string | null; priority: number;
  assignee_id: string | null; completed_at: string | null; created_at: string; form_id: string | null; submission_id: string | null; tracking_token: string;
  forms: { title: string } | null;
  customers: { name: string | null; email: string | null; phone: string | null; preferred_channel: string | null; consent_updates: boolean } | null;
};

const toJob = (r: JobRow): BoardJob => ({
  id: r.id, number: r.number, title: r.title, summary: r.summary, stageId: r.stage_id, dueDate: r.due_date, priority: r.priority,
  assigneeId: r.assignee_id, customerName: r.customers?.name ?? null, channel: r.customers?.preferred_channel ?? null,
  consent: Boolean(r.customers?.consent_updates), formId: r.form_id, formTitle: r.forms?.title ?? null, completedAt: r.completed_at, createdAt: r.created_at,
});

export async function loadStages(db: Db, orgId: string): Promise<BoardStage[]> {
  const { data, error } = await db.from("workflow_stages").select("id, name, color, position, is_final, notify_customer").eq("org_id", orgId).order("position");
  if (error) throw new Error(error.message);
  return data.map((s) => ({ id: s.id, name: s.name, color: s.color, position: s.position, isFinal: s.is_final, notify: s.notify_customer }));
}

export async function loadMembers(db: Db, orgId: string): Promise<BoardMember[]> {
  const { data, error } = await db.from("organization_members").select("user_id, profiles(full_name, email)").eq("org_id", orgId).order("created_at");
  if (error) throw new Error(error.message);
  return data.map((m) => ({ id: m.user_id, name: m.profiles?.full_name?.trim() || m.profiles?.email || "Team member" }));
}

/** Open jobs, plus jobs finished in the last DONE_DAYS days. */
export async function loadBoard(db: Db, orgId: string) {
  const since = new Date(Date.now() - DONE_DAYS * 86_400_000).toISOString();
  const [stages, members, jobs, forms] = await Promise.all([
    loadStages(db, orgId),
    loadMembers(db, orgId),
    db.from("jobs").select(JOB_COLS).eq("org_id", orgId).or(`completed_at.is.null,completed_at.gte."${since}"`).order("number", { ascending: false }).limit(500),
    db.from("forms").select("id, title").eq("org_id", orgId).order("created_at", { ascending: false }),
  ]);
  if (jobs.error) throw new Error(jobs.error.message);
  if (forms.error) throw new Error(forms.error.message);
  return { stages, members, jobs: (jobs.data as unknown as JobRow[]).map(toJob), forms: forms.data, truncated: jobs.data.length === 500 };
}

export async function loadJob(db: Db, orgId: string, jobId: string) {
  const { data, error } = await db.from("jobs").select(JOB_COLS).eq("org_id", orgId).eq("id", jobId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as unknown as JobRow;
  const [stages, members, events] = await Promise.all([
    loadStages(db, orgId),
    loadMembers(db, orgId),
    db.from("job_events").select("id, type, actor_id, from_stage_id, to_stage_id, body, data, created_at").eq("org_id", orgId).eq("job_id", jobId)
      .order("created_at", { ascending: false }).limit(200),
  ]);
  if (events.error) throw new Error(events.error.message);
  const c = row.customers;
  const customer: JobCustomer = c ? { name: c.name, email: c.email, phone: c.phone, channel: c.preferred_channel, consent: Boolean(c.consent_updates) } : null;
  return {
    job: toJob(row),
    customer,
    trackingToken: row.tracking_token,
    submissionId: row.submission_id,
    stages,
    members,
    events: events.data.map((e): BoardEvent => ({
      id: e.id, type: e.type, actorId: e.actor_id, fromStageId: e.from_stage_id, toStageId: e.to_stage_id, body: e.body,
      data: e.data && typeof e.data === "object" && !Array.isArray(e.data) ? (e.data as Record<string, unknown>) : {}, at: e.created_at,
    })),
  };
}

export async function stageJobCounts(db: Db, orgId: string): Promise<Map<string, number>> {
  const { data, error } = await db.from("jobs").select("stage_id").eq("org_id", orgId).limit(10000);
  if (error) throw new Error(error.message);
  const m = new Map<string, number>();
  for (const r of data) m.set(r.stage_id, (m.get(r.stage_id) ?? 0) + 1);
  return m;
}
