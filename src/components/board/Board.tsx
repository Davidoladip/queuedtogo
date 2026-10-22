"use client";

import "./board.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  CHANNEL_LABEL, DONE_DAYS, dueState, formatDay, initials, nextStage, orderedStages, priorityLabel, sortJobs,
  type ActionResult, type BoardJob, type BoardMember, type BoardStage,
} from "@/lib/board";

type Props = {
  stages: BoardStage[];
  jobs: BoardJob[];
  members: BoardMember[];
  forms: { id: string; title: string }[];
  me: string;
  today: string;
  /** Base link for a job, e.g. "/w/acme/board/" (the job id is appended). */
  jobHref: string;
  stagesHref: string | null;
  move: (jobId: string, fromStageId: string, toStageId: string) => Promise<ActionResult>;
  /** Seconds between automatic refreshes, so moves by teammates and new orders appear. */
  refreshEvery?: number;
};

type Toast = { text: string; bad?: boolean } | null;

export function Board(p: Props) {
  const router = useRouter();
  const stages = useMemo(() => orderedStages(p.stages), [p.stages]);
  const [jobs, setJobs] = useState(p.jobs);
  const [prevJobs, setPrevJobs] = useState(p.jobs);
  if (p.jobs !== prevJobs) { setPrevJobs(p.jobs); setJobs(p.jobs); }

  const [form, setForm] = useState("all");
  const [who, setWho] = useState("all");
  const [q, setQ] = useState("");
  const [over, setOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<Toast>(null);
  const [live, setLive] = useState("");
  const [, startTransition] = useTransition();
  const busy = useRef(0);

  // Keep the board current: teammates' moves and new orders appear without a reload.
  useEffect(() => {
    const tick = () => { if (!busy.current && document.visibilityState === "visible") startTransition(() => router.refresh()); };
    const id = window.setInterval(tick, (p.refreshEvery ?? 30) * 1000);
    const onVis = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [router, p.refreshEvery]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), toast.bad ? 7000 : 3500);
    return () => window.clearTimeout(id);
  }, [toast]);

  const people = useMemo(() => new Map(p.members.map((m) => [m.id, m.name])), [p.members]);
  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);

  const term = q.trim().toLowerCase().replace(/^qtg-?/, "");
  const shown = jobs.filter((j) =>
    (form === "all" || j.formId === form)
    && (who === "all" || (who === "me" ? j.assigneeId === p.me : who === "none" ? !j.assigneeId : j.assigneeId === who))
    && (!term || String(j.number).includes(term) || (j.customerName ?? "").toLowerCase().includes(term) || j.title.toLowerCase().includes(term)));

  const open = shown.filter((j) => !stageById.get(j.stageId)?.isFinal);
  const states = open.map((j) => dueState(j, stageById.get(j.stageId), p.today));
  const overdue = states.filter((s) => s === "overdue").length;
  const dueToday = states.filter((s) => s === "today").length;
  const unassigned = open.filter((j) => !j.assigneeId).length;

  async function doMove(jobId: string, toStageId: string) {
    const job = jobs.find((j) => j.id === jobId);
    if (!job || job.stageId === toStageId || pending.has(jobId)) return;
    const from = job.stageId;
    const to = stageById.get(toStageId);
    if (!to) return;
    busy.current++;
    setPending((s) => new Set(s).add(jobId));
    setJobs((list) => list.map((j) => (j.id === jobId ? { ...j, stageId: toStageId, completedAt: to.isFinal ? j.completedAt ?? new Date().toISOString() : null } : j)));
    let r: ActionResult;
    try {
      r = await p.move(jobId, from, toStageId);
    } catch {
      r = { ok: false, error: "We couldn't reach the server. Check your connection and try again." };
    }
    busy.current--;
    setPending((s) => { const n = new Set(s); n.delete(jobId); return n; });
    if (r.ok) {
      setLive(`QTG-${job.number} moved to ${to.name}.`);
      setToast({ text: `QTG-${job.number} moved to ${to.name}.` });
    } else {
      setJobs((list) => list.map((j) => (j.id === jobId ? { ...j, stageId: from, completedAt: job.completedAt } : j)));
      setLive(r.error);
      setToast({ text: r.error, bad: true });
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="qb">
      <div className="stats" aria-label="Summary">
        <div className="stat"><b>{open.length}</b><span>Open jobs</span></div>
        <div className="stat"><b>{dueToday}</b><span>Due today</span></div>
        <div className={`stat${overdue ? " alert" : ""}`}><b>{overdue}</b><span>Overdue</span></div>
        <div className="stat"><b>{unassigned}</b><span>Unassigned</span></div>
      </div>

      <div className="boardtools">
        <label>Form
          <select value={form} onChange={(e) => setForm(e.target.value)} aria-label="Show jobs from">
            <option value="all">All forms</option>
            {p.forms.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
          </select>
        </label>
        <label>Person
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Show jobs for">
            <option value="all">Everyone</option>
            <option value="me">My jobs</option>
            <option value="none">Unassigned</option>
            {p.members.filter((m) => m.id !== p.me).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <input type="search" placeholder="Search order number or name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search jobs" />
        <span className="spacer" />
        {p.stagesHref && <Link href={p.stagesHref} className="btn small">Edit stages</Link>}
      </div>

      <div className="board-scroll">
        <div className="board">
          {stages.map((s) => {
            const list = sortJobs(shown.filter((j) => j.stageId === s.id));
            return (
              <section
                key={s.id}
                className={`col${over === s.id ? " over" : ""}`}
                aria-label={s.name}
                data-stage={s.id}
                onDragOver={(e) => { if (!dragging) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== s.id) setOver(s.id); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null); }}
                onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/x-qtg-job") || dragging; setDragging(null); if (id) void doMove(id, s.id); }}
              >
                <div className="col-head"><span className="dot" style={{ "--c": s.color } as React.CSSProperties} />{s.name}<span className="count">{list.length}</span></div>
                {s.isFinal && <div className="col-note">Finished in the last {DONE_DAYS} days</div>}
                {list.length ? list.map((j) => (
                  <Ticket
                    key={j.id}
                    job={j}
                    next={s.isFinal ? null : nextStage(stages, s.id)}
                    stage={s}
                    today={p.today}
                    assignee={j.assigneeId ? people.get(j.assigneeId) ?? null : null}
                    href={p.jobHref + j.id}
                    pending={pending.has(j.id)}
                    dragging={dragging === j.id}
                    onDragStart={(e) => { e.dataTransfer.setData("text/x-qtg-job", j.id); e.dataTransfer.effectAllowed = "move"; setDragging(j.id); }}
                    onDragEnd={() => { setDragging(null); setOver(null); }}
                    onMove={(to) => void doMove(j.id, to)}
                  />
                )) : <div className="empty-col">{dragging ? "Drop a job here" : "No jobs"}</div>}
              </section>
            );
          })}
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{live}</p>
      {toast && <div className={`toast${toast.bad ? " bad" : ""}`} role={toast.bad ? "alert" : "status"}>{toast.text}</div>}
    </div>
  );
}

function Ticket({ job: j, next, stage, today, assignee, href, pending, dragging, onDragStart, onDragEnd, onMove }: {
  job: BoardJob; next: BoardStage | null; stage: BoardStage; today: string; assignee: string | null; href: string;
  pending: boolean; dragging: boolean;
  onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void; onMove: (to: string) => void;
}) {
  const st = dueState(j, stage, today);
  const pri = j.priority >= 2 ? "urgent" : j.priority === 1 ? "high" : "";
  return (
    <article
      className={`ticket${pri ? " " + pri : ""}${dragging ? " dragging" : ""}${pending ? " pending" : ""}`}
      draggable={!pending}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      data-job={j.number}
      aria-busy={pending || undefined}
    >
      <Link className="t-open" href={href} draggable={false} aria-label={`Open order QTG-${j.number}`} />
      <div className="t-top">
        <span className="t-num mono">QTG-{j.number}</span>
        {st === "overdue" && <span className="pill bad">Overdue</span>}
        {st === "today" && <span className="pill warn">Due today</span>}
        {st === "done" && <span className="pill good">Done</span>}
        {pri && <span className={`pill ${pri === "urgent" ? "bad" : "warn"}`}>{priorityLabel(j.priority)}</span>}
        {j.channel && <span className="chan" title={j.consent ? "Agreed to updates" : "Didn't agree to updates"}>{CHANNEL_LABEL[j.channel] ?? j.channel}{j.consent ? "" : " · off"}</span>}
      </div>
      <div className="t-body">
        <div className="t-cust">{j.customerName ?? j.title}</div>
        {j.summary && <div className="t-item">{j.summary}</div>}
        {j.formTitle && <span className="formtag"><span className="dot" /><span>{j.formTitle}</span></span>}
        <div className="t-meta">
          {assignee ? <span className="avatar sm" title={assignee}>{initials(assignee)}</span> : <span className="avatar sm none" title="Unassigned">?</span>}
          <span className="nm">{assignee ?? "Unassigned"}</span>
          {j.dueDate && <span className="due">Due {formatDay(j.dueDate)}</span>}
        </div>
      </div>
      {next && (
        <button type="button" className="btn t-next" disabled={pending} onClick={() => onMove(next.id)}>
          Move to {next.name} →
        </button>
      )}
    </article>
  );
}
