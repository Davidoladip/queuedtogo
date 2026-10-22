"use server";

// Development harness actions for the board. They refuse to run unless QTG_DEV_HARNESS=1 (never on
// Vercel), and check input with the same schemas as the real actions.
import { firstError, isUuid, jobPatchSchema, noteSchema, stageSchema, type ActionResult } from "@/lib/board";
import { harnessEnabled } from "../sample";
import { devAddStage, devDeleteStage, devMove, devNote, devReorder, devUpdate, devUpdateStage } from "./store";

const OFF: ActionResult = { ok: false, error: "The development harness is switched off." };
const res = (err: string | null, conflict = false): ActionResult => (err ? { ok: false, error: err, conflict } : { ok: true });
const wait = () => new Promise((r) => setTimeout(r, 150));

export async function devMoveJob(jobId: string, from: string, to: string): Promise<ActionResult> {
  if (!harnessEnabled()) return OFF;
  if (![jobId, from, to].every(isUuid)) return { ok: false, error: "This job no longer exists." };
  await wait();
  const err = devMove(jobId, from, to);
  return res(err, Boolean(err));
}
export async function devUpdateJob(jobId: string, patch: unknown): Promise<ActionResult> {
  if (!harnessEnabled()) return OFF;
  const p = jobPatchSchema.safeParse(patch);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  return res(devUpdate(jobId, p.data));
}
export async function devAddNote(jobId: string, body: unknown): Promise<ActionResult> {
  if (!harnessEnabled()) return OFF;
  const p = noteSchema.safeParse(body);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  return res(devNote(jobId, p.data));
}
export async function devStageAdd(input: unknown): Promise<ActionResult> {
  if (!harnessEnabled()) return OFF;
  const p = stageSchema.safeParse(input);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  return res(devAddStage(p.data.name, p.data.color));
}
export async function devStageUpdate(id: string, input: unknown): Promise<ActionResult> {
  if (!harnessEnabled()) return OFF;
  const p = stageSchema.safeParse(input);
  if (!p.success) return { ok: false, error: firstError(p.error) };
  return res(devUpdateStage(id, p.data.name, p.data.color, p.data.isFinal));
}
export async function devStageDelete(id: string): Promise<ActionResult> {
  if (!harnessEnabled()) return OFF;
  return res(devDeleteStage(id));
}
export async function devStageReorder(ids: unknown): Promise<ActionResult> {
  if (!harnessEnabled()) return OFF;
  if (!Array.isArray(ids) || !ids.every(isUuid)) return { ok: false, error: "The stage list has changed. Reload and try again." };
  return res(devReorder(ids as string[]));
}
