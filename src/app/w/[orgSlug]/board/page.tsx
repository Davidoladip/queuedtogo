import type { Metadata } from "next";
import { canManage, requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadBoard } from "@/lib/board-data";
import { todayIn } from "@/lib/board";
import { moveJob } from "@/server/actions/jobs";
import { Board } from "@/components/board/Board";

export const metadata: Metadata = { title: "Production board" };

export default async function BoardPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { user, org } = await requireWorkspace(orgSlug);
  const supabase = await createClient();
  const data = await loadBoard(supabase, org.id);

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Production board</h1>
          <p>Every order lands in {data.stages[0]?.name ?? "the first stage"}. Drag a job to another stage, or use its move button. Open a job to assign it, set a due date or add notes.</p>
        </div>
      </div>
      <Board
        stages={data.stages}
        jobs={data.jobs}
        members={data.members}
        forms={data.forms}
        me={user.id}
        today={todayIn(org.timezone)}
        jobHref={`/w/${org.slug}/board/`}
        stagesHref={`/w/${org.slug}/board/stages`}
        move={moveJob.bind(null, org.slug)}
      />
      {data.truncated && <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>Showing the newest 500 jobs. Use Submissions to find older orders.</p>}
      {!canManage(org.role) && <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>Owners and admins can rename, reorder and add stages.</p>}
    </>
  );
}
