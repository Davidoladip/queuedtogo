import type { Metadata } from "next";
import Link from "next/link";
import { canManage, requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadStages, stageJobCounts } from "@/lib/board-data";
import { addStage, deleteStage, reorderStages, updateStage } from "@/server/actions/jobs";
import { StageEditor } from "@/components/board/StageEditor";

export const metadata: Metadata = { title: "Stages" };

export default async function StagesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { org } = await requireWorkspace(orgSlug);
  const supabase = await createClient();
  const [stages, counts] = await Promise.all([loadStages(supabase, org.id), stageJobCounts(supabase, org.id)]);

  return (
    <>
      <div className="view-head">
        <div>
          <Link href={`/w/${org.slug}/board`} className="btn ghost small">← Production board</Link>
          <h1 style={{ marginTop: 8 }}>Production stages</h1>
          <p>The columns on your board, in order. Customers see these names on their tracking page.</p>
        </div>
      </div>
      <StageEditor
        stages={stages.map((s) => ({ ...s, jobs: counts.get(s.id) ?? 0 }))}
        canEdit={canManage(org.role)}
        add={addStage.bind(null, org.slug)}
        update={updateStage.bind(null, org.slug)}
        remove={deleteStage.bind(null, org.slug)}
        reorder={reorderStages.bind(null, org.slug)}
      />
      <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>Which stages send the customer a text, and what it says, is set under Notifications.</p>
    </>
  );
}
