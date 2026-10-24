import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { Answer } from "@/lib/submission";
import type { DayJob } from "@/lib/eventday";
import { loadMembers, loadStages } from "@/lib/board-data";

type Db = Awaited<ReturnType<typeof createClient>>;
type Row = {
  id: string; number: number; title: string; summary: string | null; stage_id: string; due_date: string | null; priority: number;
  assignee_id: string | null; created_at: string; completed_at: string | null; form_id: string | null;
  forms: { title: string } | null;
  customers: { name: string | null; phone: string | null; email: string | null; consent_updates: boolean } | null;
  form_submissions: { answers: Record<string, Answer> | null } | null;
};

export type DayFilter = { formId?: string | null; stageId?: string | null; ids?: string[]; openOnly?: boolean; doneSinceDays?: number; limit?: number };

/** Jobs with their customers and answers, for the event-day tools. Row level security limits this to the member's business. */
export async function loadDayJobs(db: Db, orgId: string, f: DayFilter = {}) {
  const [stages, members] = await Promise.all([loadStages(db, orgId), loadMembers(db, orgId)]);
  let q = db.from("jobs")
    .select("id, number, title, summary, stage_id, due_date, priority, assignee_id, created_at, completed_at, form_id, forms(title), customers(name, phone, email, consent_updates), form_submissions(answers)")
    .eq("org_id", orgId).order("number", { ascending: true }).limit(f.limit ?? 2000);
  if (f.formId) q = q.eq("form_id", f.formId);
  if (f.stageId) q = q.eq("stage_id", f.stageId);
  if (f.ids?.length) q = q.in("id", f.ids);
  if (f.openOnly) q = q.is("completed_at", null);
  else if (f.doneSinceDays) q = q.or(`completed_at.is.null,completed_at.gte."${new Date(Date.now() - f.doneSinceDays * 86_400_000).toISOString()}"`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const names = new Map(members.map((m) => [m.id, m.name]));
  const jobs: DayJob[] = (data as unknown as Row[]).map((r) => ({
    id: r.id, number: r.number, title: r.title, summary: r.summary, stageId: r.stage_id, dueDate: r.due_date, priority: r.priority,
    customerName: r.customers?.name ?? null, phone: r.customers?.phone ?? null, email: r.customers?.email ?? null, consent: Boolean(r.customers?.consent_updates),
    formId: r.form_id, formTitle: r.forms?.title ?? null, assignee: r.assignee_id ? names.get(r.assignee_id) ?? null : null,
    createdAt: r.created_at, completedAt: r.completed_at, answers: (r.form_submissions?.answers ?? {}) as Record<string, Answer>,
  }));
  return { stages, jobs };
}
