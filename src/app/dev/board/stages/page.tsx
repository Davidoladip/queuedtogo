import { connection } from "next/server";
import { notFound } from "next/navigation";
import { StageEditor } from "@/components/board/StageEditor";
import { harnessEnabled } from "../../sample";
import { store } from "../store";
import { devStageAdd, devStageDelete, devStageReorder, devStageUpdate } from "../actions";

/** Development harness: the stage editor. ?role=member shows the read-only view. 404 unless QTG_DEV_HARNESS=1. */
export default async function DevStagesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection();
  if (!harnessEnabled()) notFound();
  const sp = await searchParams;
  const s = store();
  const stages = s.stages.map((st) => ({ ...st, jobs: s.jobs.filter((j) => j.stageId === st.id).length }));
  return (
    <main className="page wrap">
      <StageEditor stages={structuredClone(stages)} canEdit={sp.role !== "member"} add={devStageAdd} update={devStageUpdate} remove={devStageDelete} reorder={devStageReorder} />
    </main>
  );
}
