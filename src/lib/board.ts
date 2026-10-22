// Production board: shared types, rules and wording. Used by the server actions, the board,
// the job page and the development harness, so all of them behave the same way.
import { z } from "zod";

export type BoardStage = { id: string; name: string; color: string; position: number; isFinal: boolean; notify: boolean };
export type BoardMember = { id: string; name: string };
export type BoardJob = {
  id: string;
  number: number;
  title: string;
  summary: string | null;
  stageId: string;
  dueDate: string | null;
  priority: number;
  assigneeId: string | null;
  customerName: string | null;
  channel: string | null;
  consent: boolean;
  formId: string | null;
  formTitle: string | null;
  completedAt: string | null;
  createdAt: string;
};
export type BoardEvent = {
  id: string;
  type: string;
  actorId: string | null;
  fromStageId: string | null;
  toStageId: string | null;
  body: string | null;
  data: Record<string, unknown>;
  at: string;
};
export type ActionResult = { ok: true } | { ok: false; error: string; conflict?: boolean };

export const PRIORITIES = [
  { value: 0, label: "Normal" },
  { value: 1, label: "High" },
  { value: 2, label: "Urgent" },
] as const;
export const priorityLabel = (p: number) => (p >= 2 ? "Urgent" : p === 1 ? "High" : "Normal");

export const MAX_STAGES = 12;
/** Finished jobs stay on the board for this many days, then drop off (they're still in Submissions). */
export const DONE_DAYS = 14;
export const STAGE_COLORS = ["#7B8194", "#9A5BD0", "#3346D3", "#C9821B", "#1D8657", "#5A6077", "#C62828", "#00838F"];

export const CHANNEL_LABEL: Record<string, string> = { sms: "SMS", whatsapp: "WhatsApp", email: "Email" };

/** Today's date (YYYY-MM-DD) in the business's time zone. */
export function todayIn(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export type DueState = "overdue" | "today" | "done" | null;
export function dueState(job: Pick<BoardJob, "dueDate" | "completedAt">, stage: Pick<BoardStage, "isFinal"> | undefined, today: string): DueState {
  if (stage?.isFinal || job.completedAt) return "done";
  if (!job.dueDate) return null;
  if (job.dueDate < today) return "overdue";
  if (job.dueDate === today) return "today";
  return null;
}

/** Urgent first, then the soonest due date, then the oldest order. */
export function sortJobs<T extends Pick<BoardJob, "priority" | "dueDate" | "number">>(list: T[]): T[] {
  return [...list].sort((a, b) =>
    b.priority - a.priority
    || (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31")
    || a.number - b.number);
}

export function initials(name: string): string {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] ?? "")).toUpperCase();
}

export const orderedStages = (stages: BoardStage[]) => [...stages].sort((a, b) => a.position - b.position);
export function nextStage(stages: BoardStage[], id: string): BoardStage | null {
  const s = orderedStages(stages);
  const i = s.findIndex((x) => x.id === id);
  return i >= 0 && i < s.length - 1 ? s[i + 1] : null;
}
/** Where "Mark complete" sends a job: the first final stage. */
export const completeStage = (stages: BoardStage[]) => orderedStages(stages).find((s) => s.isFinal) ?? null;
/** Where "Reopen" sends a finished job: the last stage that isn't final. */
export const reopenStage = (stages: BoardStage[]) => [...orderedStages(stages)].reverse().find((s) => !s.isFinal) ?? null;

export function formatDay(d: string | null, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }): string {
  if (!d) return "";
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

/** A line of job history in plain words. Stages or people that no longer exist are described generically. */
export function describeEvent(e: BoardEvent, stages: Map<string, string>, people: Map<string, string>): string {
  const stage = (id: string | null) => (id && stages.get(id)) || "a removed stage";
  const person = (id: unknown) => (typeof id === "string" && people.get(id)) || "a former team member";
  switch (e.type) {
    case "created": return `Order received in ${stage(e.toStageId)}`;
    case "stage_changed": return `Moved from ${stage(e.fromStageId)} to ${stage(e.toStageId)}`;
    case "assigned": return e.data.to ? `Assigned to ${person(e.data.to)}` : "Unassigned";
    case "due_changed": return e.data.to ? `Due date set to ${formatDay(String(e.data.to))}` : "Due date removed";
    case "updated": return "Edited the job details";
    case "note": return e.body ?? "";
    case "notification": return "Customer update sent";
    default: return "Updated the job";
  }
}
export function actorName(e: BoardEvent, people: Map<string, string>): string {
  if (e.actorId) return people.get(e.actorId) ?? "A former team member";
  return e.type === "created" ? "Online order" : "QueuedToGo";
}

// ---------------------------------------------------------------------------- input checks
const uuid = z.uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.").refine((d) => !Number.isNaN(Date.parse(d + "T00:00:00Z")), "Enter a valid date.");

export const jobPatchSchema = z
  .object({
    assigneeId: uuid.nullable(),
    dueDate: date.nullable(),
    priority: z.number().int().min(0).max(2),
    title: z.string().trim().min(1, "Give the job a title.").max(200, "Titles can be up to 200 characters."),
    summary: z.string().trim().max(500, "Summaries can be up to 500 characters.").transform((s) => s || null),
  })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, "Nothing to change.");
export type JobPatch = z.infer<typeof jobPatchSchema>;

export const noteSchema = z.string().trim().min(1, "Write a note first.").max(2000, "Notes can be up to 2,000 characters.");

export const stageSchema = z.object({
  name: z.string().trim().min(1, "Give the stage a name.").max(60, "Stage names can be up to 60 characters."),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Choose a colour."),
  isFinal: z.boolean(),
});
export type StageInput = z.infer<typeof stageSchema>;

export const isUuid = (v: unknown): v is string => uuid.safeParse(v).success;
export const firstError = (e: z.ZodError) => e.issues[0]?.message ?? "Check your entry and try again.";

/** Friendly wording for database refusals on the board. */
export function boardDbError(err: { code?: string; message?: string } | null, fallback: string): string {
  if (!err) return fallback;
  switch (err.code) {
    case "QTG04": case "QTG05": case "QTG06": case "QTG07": return err.message ?? fallback;
    case "23503": return err.message?.includes("workflow_stages") ? "This stage still has jobs. Move them to another stage first." : "That person or stage is no longer part of this business. Reload and try again.";
    case "23514": return "That value isn't allowed. Check it and try again.";
    case "42501": return "You don't have permission to do that.";
    default: return fallback;
  }
}
