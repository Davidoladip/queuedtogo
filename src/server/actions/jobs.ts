"use server";

// Production board actions. Every action re-checks the signed-in user's membership of the business
// in the URL, and every query is also limited by row level security, so a member of one business can
// never read or change another business's jobs or stages.
import { revalidatePath } from "next/cache";
import { canManage, requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_STAGES, boardDbError, firstError, isUuid, jobPatchSchema, noteSchema, stageSchema,
  type ActionResult,
} from "@/lib/board";

const NOT_FOUND = "This job no longer exists, or you no longer have access to it.";
const STAGE_ADMIN = "Only owners and admins can change the stages.";

function refresh(orgSlug: string) {
  revalidatePath(`/w/${orgSlug}`, "layout");
}

/**
 * Moves a job. `fromStageId` is the stage the person saw: if someone else moved the job in the
 * meantime, nothing changes and the board is told to refresh.
 */
export async function moveJob(orgSlug: string, jobId: string, fromStageId: string, toStageId: string): Promise<ActionResult> {
  const { org } = await requireWorkspace(orgSlug);
  if (![jobId, fromStageId, toStageId].every(isUuid)) return { ok: false, error: NOT_FOUND };
  if (fromStageId === toStageId) return { ok: true };
  const supabase = await createClient();

  const { data: to } = await supabase.from("workflow_stages").select("id").eq("org_id", org.id).eq("id", toStageId).maybeSingle();
  if (!to) return { ok: false, error: "That stage no longer exists. Reload the board.", conflict: true };

  const { data, error } = await supabase
    .from("jobs").update({ stage_id: toStageId })
    .eq("org_id", org.id).eq("id", jobId).eq("stage_id", fromStageId)
    .select("id");
  if (error) return { ok: false, error: boardDbError(error, "We couldn't move the job. Try again.") };
  if (!data.length) {
    const { data: now } = await supabase.from("jobs").select("workflow_stages(name)").eq("org_id", org.id).eq("id", jobId).maybeSingle();
    if (!now) return { ok: false, error: NOT_FOUND, conflict: true };
    return { ok: false, conflict: true, error: `Someone else just moved this job to ${now.workflow_stages?.name ?? "another stage"}. The board has been updated.` };
  }
  refresh(orgSlug);
  return { ok: true };
}

/** Changes a job's assignee, due date, priority, title or summary. */
export async function updateJob(orgSlug: string, jobId: string, patch: unknown): Promise<ActionResult> {
  const { org } = await requireWorkspace(orgSlug);
  if (!isUuid(jobId)) return { ok: false, error: NOT_FOUND };
  const parsed = jobPatchSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const p = parsed.data;
  const supabase = await createClient();

  if (p.assigneeId) {
    const { data: m } = await supabase.from("organization_members").select("user_id").eq("org_id", org.id).eq("user_id", p.assigneeId).maybeSingle();
    if (!m) return { ok: false, error: "That person isn't on your team any more. Reload and try again." };
  }
  const row: { assignee_id?: string | null; due_date?: string | null; priority?: number; title?: string; summary?: string | null } = {};
  if ("assigneeId" in p) row.assignee_id = p.assigneeId ?? null;
  if ("dueDate" in p) row.due_date = p.dueDate ?? null;
  if (p.priority !== undefined) row.priority = p.priority;
  if (p.title !== undefined) row.title = p.title;
  if ("summary" in p) row.summary = p.summary ?? null;

  const { data, error } = await supabase.from("jobs").update(row).eq("org_id", org.id).eq("id", jobId).select("id");
  if (error) return { ok: false, error: boardDbError(error, "We couldn't save that change. Try again.") };
  if (!data.length) return { ok: false, error: NOT_FOUND };
  refresh(orgSlug);
  return { ok: true };
}

/** Adds an internal note. Customers never see notes. */
export async function addNote(orgSlug: string, jobId: string, body: unknown): Promise<ActionResult> {
  const { user, org } = await requireWorkspace(orgSlug);
  if (!isUuid(jobId)) return { ok: false, error: NOT_FOUND };
  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const supabase = await createClient();
  const { data: job } = await supabase.from("jobs").select("id").eq("org_id", org.id).eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, error: NOT_FOUND };
  const { error } = await supabase.from("job_events").insert({ org_id: org.id, job_id: jobId, actor_id: user.id, type: "note", body: parsed.data });
  if (error) return { ok: false, error: boardDbError(error, "We couldn't add the note. Try again.") };
  refresh(orgSlug);
  return { ok: true };
}

// ---------------------------------------------------------------------------- stages (owners and admins)

async function stageAdmin(orgSlug: string) {
  const { org } = await requireWorkspace(orgSlug);
  return { org, allowed: canManage(org.role), supabase: await createClient() };
}

export async function addStage(orgSlug: string, input: unknown): Promise<ActionResult> {
  const { org, allowed, supabase } = await stageAdmin(orgSlug);
  if (!allowed) return { ok: false, error: STAGE_ADMIN };
  const parsed = stageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { data: stages } = await supabase.from("workflow_stages").select("position").eq("org_id", org.id);
  if ((stages?.length ?? 0) >= MAX_STAGES) return { ok: false, error: `A business can have up to ${MAX_STAGES} stages.` };
  const position = Math.max(-1, ...(stages ?? []).map((s) => s.position)) + 1;
  const { error } = await supabase.from("workflow_stages").insert({
    org_id: org.id, name: parsed.data.name, color: parsed.data.color, is_final: parsed.data.isFinal && position > 0, position,
  });
  if (error) return { ok: false, error: boardDbError(error, "We couldn't add the stage. Try again.") };
  refresh(orgSlug);
  return { ok: true };
}

export async function updateStage(orgSlug: string, stageId: string, input: unknown): Promise<ActionResult> {
  const { org, allowed, supabase } = await stageAdmin(orgSlug);
  if (!allowed) return { ok: false, error: STAGE_ADMIN };
  if (!isUuid(stageId)) return { ok: false, error: "That stage no longer exists. Reload the page." };
  const parsed = stageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { data, error } = await supabase
    .from("workflow_stages").update({ name: parsed.data.name, color: parsed.data.color, is_final: parsed.data.isFinal })
    .eq("org_id", org.id).eq("id", stageId).select("id");
  if (error) return { ok: false, error: boardDbError(error, "We couldn't save the stage. Try again.") };
  if (!data.length) return { ok: false, error: "That stage no longer exists. Reload the page." };
  refresh(orgSlug);
  return { ok: true };
}

export async function deleteStage(orgSlug: string, stageId: string): Promise<ActionResult> {
  const { org, allowed, supabase } = await stageAdmin(orgSlug);
  if (!allowed) return { ok: false, error: STAGE_ADMIN };
  if (!isUuid(stageId)) return { ok: false, error: "That stage no longer exists. Reload the page." };
  const { count } = await supabase.from("jobs").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("stage_id", stageId);
  if (count) return { ok: false, error: `This stage still has ${count} ${count === 1 ? "job" : "jobs"}. Move ${count === 1 ? "it" : "them"} to another stage first.` };
  const { data: stages } = await supabase.from("workflow_stages").select("id, is_final").eq("org_id", org.id).order("position");
  const rest = (stages ?? []).filter((s) => s.id !== stageId);
  if (stages?.[0]?.id === stageId && rest[0]?.is_final) return { ok: false, error: "The next stage is a final stage, and the first stage is where new orders arrive. Add or move a working stage to the top first." };
  const { data, error } = await supabase.from("workflow_stages").delete().eq("org_id", org.id).eq("id", stageId).select("id");
  if (error) return { ok: false, error: boardDbError(error, "We couldn't delete the stage. Try again.") };
  if (!data.length) return { ok: false, error: "That stage no longer exists. Reload the page." };
  // Close the gap so positions stay 0, 1, 2…
  if (rest.length) await supabase.rpc("reorder_stages", { p_org: org.id, p_order: rest.map((s) => s.id) });
  refresh(orgSlug);
  return { ok: true };
}

/** Saves a new stage order: every stage id of the business, first to last. */
export async function reorderStages(orgSlug: string, ids: unknown): Promise<ActionResult> {
  const { org, allowed, supabase } = await stageAdmin(orgSlug);
  if (!allowed) return { ok: false, error: STAGE_ADMIN };
  if (!Array.isArray(ids) || ids.length > MAX_STAGES || !ids.every(isUuid)) return { ok: false, error: "The stage list has changed. Reload and try again." };
  const { error } = await supabase.rpc("reorder_stages", { p_org: org.id, p_order: ids });
  if (error) return { ok: false, error: boardDbError(error, "We couldn't save the new order. Try again."), conflict: error.code === "QTG06" };
  refresh(orgSlug);
  return { ok: true };
}
