import "./event.css";
import { dueState, formatDay, orderedStages, type BoardStage } from "@/lib/board";
import { itemsLine, tallyItems, type DayJob } from "@/lib/eventday";

/** The daily production summary: where every open job is, what's due, and how many of each item to make. */
export function SummaryView({ jobs, stages, today, title }: { jobs: DayJob[]; stages: BoardStage[]; today: string; title: string }) {
  const st = orderedStages(stages);
  const byId = new Map(st.map((s) => [s.id, s]));
  const open = jobs.filter((j) => !byId.get(j.stageId)?.isFinal);
  const due = (s: "overdue" | "today") => open.filter((j) => dueState(j, byId.get(j.stageId), today) === s);
  const overdue = due("overdue");
  const dueToday = due("today");
  const finishedToday = jobs.filter((j) => j.completedAt && j.completedAt.slice(0, 10) === today).length;
  const tally = tallyItems(open);
  const list = (rows: DayJob[]) => (
    <table className="qe-t">
      <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Stage</th><th>Due</th></tr></thead>
      <tbody>{rows.map((j) => <tr key={j.id}><td className="mono">QTG-{j.number}</td><td>{j.customerName ?? "—"}</td><td>{itemsLine(j, 120)}</td><td>{byId.get(j.stageId)?.name}</td><td>{j.dueDate ? formatDay(j.dueDate) : "—"}</td></tr>)}</tbody>
    </table>
  );
  return (
    <div className="qe">
      <h2 style={{ fontSize: 20, marginBottom: 10 }}>{title}</h2>
      <div className="qe-stats">
        <div className="qe-stat"><b>{open.length}</b><span>Open jobs</span></div>
        <div className="qe-stat"><b>{dueToday.length}</b><span>Due today</span></div>
        <div className="qe-stat"><b style={{ color: overdue.length ? "var(--bad)" : undefined }}>{overdue.length}</b><span>Overdue</span></div>
        <div className="qe-stat"><b>{finishedToday}</b><span>Finished today</span></div>
      </div>
      <div className="grid2">
        <section className="panel" aria-labelledby="bystage">
          <h2 id="bystage">By stage</h2>
          <table className="qe-t"><tbody>{st.map((s) => <tr key={s.id}><td>{s.name}</td><td className="n">{jobs.filter((j) => j.stageId === s.id).length}</td></tr>)}</tbody></table>
        </section>
        <section className="panel" aria-labelledby="tomake">
          <h2 id="tomake">To make (open jobs)</h2>
          {tally.length ? tally.map((t) => (
            <table key={t.question} className="qe-t" style={{ marginBottom: 10 }}>
              <thead><tr><th>{t.question}</th><th className="n">{t.total}</th></tr></thead>
              <tbody>{t.items.map((i) => <tr key={i.item}><td>{i.item}</td><td className="n">{i.count}</td></tr>)}</tbody>
            </table>
          )) : <p className="muted">No choice or size questions on the open orders.</p>}
        </section>
      </div>
      {overdue.length > 0 && <section className="panel" style={{ marginTop: 16 }} aria-labelledby="od"><h2 id="od">Overdue</h2>{list(overdue)}</section>}
      {dueToday.length > 0 && <section className="panel" style={{ marginTop: 16 }} aria-labelledby="dt"><h2 id="dt">Due today</h2>{list(dueToday)}</section>}
    </div>
  );
}
