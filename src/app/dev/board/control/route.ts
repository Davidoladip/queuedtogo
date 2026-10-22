// Test controls for the board harness: reset the sample data, or move a job "from another device"
// to test conflicts. 404 unless QTG_DEV_HARNESS=1 (never on Vercel).
import { notFound } from "next/navigation";
import { harnessEnabled } from "../../sample";
import { devMove, resetStore, store } from "../store";

export async function POST(req: Request) {
  if (!harnessEnabled()) notFound();
  const body = (await req.json().catch(() => ({}))) as { action?: string; job?: number; stage?: string };
  if (body.action === "reset") { resetStore(); return Response.json({ ok: true }); }
  if (body.action === "teammate-move") {
    const s = store();
    const j = s.jobs.find((x) => x.number === body.job);
    const st = s.stages.find((x) => x.name === body.stage);
    if (!j || !st) return Response.json({ ok: false }, { status: 404 });
    return Response.json({ ok: devMove(j.id, j.stageId, st.id) === null });
  }
  return Response.json({ ok: false }, { status: 400 });
}
