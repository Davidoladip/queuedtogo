import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Production board" };

export default async function BoardPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { org } = await requireWorkspace(orgSlug);
  const supabase = await createClient();
  const [{ data: stages, error }, { data: jobs, error: jobsError }] = await Promise.all([
    supabase.from("workflow_stages").select("id, name, color, position, notify_customer").eq("org_id", org.id).order("position"),
    supabase.from("jobs").select("id, number, title, stage_id, due_date").eq("org_id", org.id).order("due_date", { nullsFirst: false }),
  ]);
  if (error || jobsError) throw new Error((error ?? jobsError)!.message);

  return (
    <>
      <div className="view-head">
        <div>
          <h1>Production board</h1>
          <p>Your stages, from your business&apos;s saved workflow. Moving jobs between stages arrives with the board rebuild in the next stage.</p>
        </div>
      </div>
      <div className="board-scroll">
        <div className="board">
          {stages.map((s) => {
            const list = jobs.filter((j) => j.stage_id === s.id);
            return (
              <section key={s.id} className="col" aria-label={s.name}>
                <div className="col-head"><span className="dot" style={{ "--c": s.color } as React.CSSProperties} />{s.name}<span className="count">{list.length}</span></div>
                <div className={`col-rule${s.notify_customer ? " on" : ""}`}>{s.notify_customer ? "● Customer update planned" : "○ No customer update"}</div>
                {list.length ? (
                  list.map((j) => (
                    <div key={j.id} className="panel" style={{ padding: 12 }}>
                      <div className="mono muted" style={{ fontSize: 12 }}>QTG-{j.number}</div>
                      <b>{j.title}</b>
                    </div>
                  ))
                ) : (
                  <div className="empty-col">No jobs</div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
