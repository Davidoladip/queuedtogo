// In-memory production board for the development harness (browser tests). It follows the same rules
// as the database: stale moves are refused, final stages complete jobs, stage limits and guards.
// Never used on Vercel: every harness page and action checks harnessEnabled().
import { MAX_STAGES, type BoardEvent, type BoardJob, type BoardMember, type BoardStage } from "@/lib/board";
import type { JobCustomer } from "@/components/board/JobPanel";

type Store = {
  stages: BoardStage[];
  jobs: (BoardJob & { customer: JobCustomer })[];
  events: (BoardEvent & { jobId: string })[];
  members: BoardMember[];
  seq: number;
};

export const DEV_ME = "00000000-0000-4000-8000-000000000001";
const uid = (n: number, p = "a") => `00000000-0000-4000-8${p}00-${String(n).padStart(12, "0")}`;

function seed(): Store {
  const stageNames: [string, string, boolean][] = [
    ["New order", "#7B8194", false], ["Artwork approval", "#9A5BD0", false], ["In production", "#3346D3", false],
    ["Quality check", "#C9821B", false], ["Ready for collection", "#1D8657", false], ["Completed", "#5A6077", true],
  ];
  const stages = stageNames.map(([name, color, isFinal], i) => ({ id: uid(i + 1, "b"), name, color, position: i, isFinal, notify: i !== 3 && i !== 5 }));
  const members = [{ id: DEV_ME, name: "Grace Owner" }, { id: uid(2), name: "Finn Member" }];
  const d = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const mk = (n: number, name: string, summary: string, stage: number, due: string | null, extra: Partial<BoardJob> = {}) => ({
    id: uid(n, "c"), number: 1000 + n, title: `Food Fest · ${name}`, summary, stageId: stages[stage].id, dueDate: due, priority: 0,
    assigneeId: null, customerName: name, channel: "sms", consent: true, formId: uid(1, "d"), formTitle: "Food Fest",
    completedAt: stages[stage].isFinal ? new Date().toISOString() : null, createdAt: new Date().toISOString(),
    customer: { name, email: `${name.split(" ")[0].toLowerCase()}@example.com`, phone: "+15551234567", channel: "sms", consent: true },
    ...extra,
  });
  const jobs = [
    mk(1, "Lena Ortiz", "Item: Hoodie · Sizes: M × 2", 0, d(3)),
    mk(2, "Sam Lee", "Item: Cap", 0, d(-2), { priority: 2 }),
    mk(3, "Ada Byron", "Item: Apron", 2, d(0), { assigneeId: uid(2) }),
    mk(4, "Tom Hardy", "Item: T-shirt", 5, d(-5), { consent: false }),
  ];
  const events = jobs.map((j, i) => ({ id: uid(i + 1, "e"), jobId: j.id, type: "created", actorId: null, fromStageId: null, toStageId: stages[0].id, body: null, data: {}, at: j.createdAt }));
  return { stages, jobs, events, members, seq: 100 };
}

const g = globalThis as unknown as { __qtgBoard?: Store };
export const store = (): Store => (g.__qtgBoard ??= seed());
/** Board jobs without their customer details (the board doesn't need them). */
export const boardJobs = (): BoardJob[] => store().jobs.map((j) => { const c = { ...j } as Partial<Store["jobs"][number]>; delete c.customer; return c as BoardJob; });
/** A job's history, newest first. */
export const jobEvents = (jobId: string): BoardEvent[] => store().events.filter((e) => e.jobId === jobId).map((e) => { const c = { ...e } as Partial<Store["events"][number]>; delete c.jobId; return c as BoardEvent; }).reverse();
export const resetStore = () => { g.__qtgBoard = seed(); };

function log(s: Store, jobId: string, e: Partial<BoardEvent>) {
  s.events.push({ id: uid(++s.seq, "e"), jobId, type: "updated", actorId: DEV_ME, fromStageId: null, toStageId: null, body: null, data: {}, at: new Date().toISOString(), ...e });
}

export function devMove(jobId: string, from: string, to: string): string | null {
  const s = store();
  const j = s.jobs.find((x) => x.id === jobId);
  const st = s.stages.find((x) => x.id === to);
  if (!j || !st) return "This job no longer exists.";
  if (j.stageId !== from) return `Someone else just moved this job to ${s.stages.find((x) => x.id === j.stageId)?.name}. The board has been updated.`;
  j.stageId = to;
  j.completedAt = st.isFinal ? j.completedAt ?? new Date().toISOString() : null;
  log(s, jobId, { type: "stage_changed", fromStageId: from, toStageId: to });
  return null;
}

export function devUpdate(jobId: string, p: { assigneeId?: string | null; dueDate?: string | null; priority?: number; title?: string; summary?: string | null }): string | null {
  const s = store();
  const j = s.jobs.find((x) => x.id === jobId);
  if (!j) return "This job no longer exists.";
  if (p.assigneeId && !s.members.some((m) => m.id === p.assigneeId)) return "That person isn't on your team any more.";
  if ("assigneeId" in p && p.assigneeId !== j.assigneeId) { log(s, jobId, { type: "assigned", data: { from: j.assigneeId, to: p.assigneeId ?? null } }); j.assigneeId = p.assigneeId ?? null; }
  if ("dueDate" in p && p.dueDate !== j.dueDate) { log(s, jobId, { type: "due_changed", data: { from: j.dueDate, to: p.dueDate ?? null } }); j.dueDate = p.dueDate ?? null; }
  if ((p.priority !== undefined && p.priority !== j.priority) || (p.title !== undefined && p.title !== j.title) || ("summary" in p && p.summary !== j.summary)) {
    if (p.priority !== undefined) j.priority = p.priority;
    if (p.title !== undefined) j.title = p.title;
    if ("summary" in p) j.summary = p.summary ?? null;
    log(s, jobId, { type: "updated" });
  }
  return null;
}

export function devNote(jobId: string, body: string): string | null {
  const s = store();
  if (!s.jobs.some((x) => x.id === jobId)) return "This job no longer exists.";
  log(s, jobId, { type: "note", body });
  return null;
}

const ordered = (s: Store) => [...s.stages].sort((a, b) => a.position - b.position);

export function devAddStage(name: string, color: string): string | null {
  const s = store();
  if (s.stages.length >= MAX_STAGES) return `A business can have up to ${MAX_STAGES} stages.`;
  s.stages.push({ id: uid(++s.seq, "b"), name, color, position: Math.max(...s.stages.map((x) => x.position)) + 1, isFinal: false, notify: false });
  return null;
}

export function devUpdateStage(id: string, name: string, color: string, isFinal: boolean): string | null {
  const s = store();
  const st = s.stages.find((x) => x.id === id);
  if (!st) return "That stage no longer exists. Reload the page.";
  if (isFinal && ordered(s)[0].id === id) return "The first stage is where new orders arrive, so it can't be a final stage.";
  if (st.isFinal !== isFinal) for (const j of s.jobs) if (j.stageId === id) j.completedAt = isFinal ? new Date().toISOString() : null;
  Object.assign(st, { name, color, isFinal });
  return null;
}

export function devDeleteStage(id: string): string | null {
  const s = store();
  const n = s.jobs.filter((j) => j.stageId === id).length;
  if (n) return `This stage still has ${n} ${n === 1 ? "job" : "jobs"}. Move ${n === 1 ? "it" : "them"} to another stage first.`;
  if (s.stages.length <= 1) return "A business needs at least one stage.";
  s.stages = s.stages.filter((x) => x.id !== id);
  ordered(s).forEach((x, i) => { x.position = i; });
  return null;
}

export function devReorder(ids: string[]): string | null {
  const s = store();
  if (ids.length !== s.stages.length || new Set(ids).size !== ids.length || !ids.every((id) => s.stages.some((x) => x.id === id))) return "The stage list has changed. Reload and try again.";
  if (s.stages.find((x) => x.id === ids[0])?.isFinal) return "The first stage is where new orders arrive, so it can't be a final stage.";
  ids.forEach((id, i) => { s.stages.find((x) => x.id === id)!.position = i; });
  return null;
}
