"use client";

import "./board.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CopyField } from "@/components/ui/CopyField";
import {
  CHANNEL_LABEL, PRIORITIES, actorName, completeStage, describeEvent, dueState, formatDay, orderedStages, reopenStage,
  type ActionResult, type BoardEvent, type BoardJob, type BoardMember, type BoardStage, type JobPatch,
} from "@/lib/board";

export type JobCustomer = { name: string | null; email: string | null; phone: string | null; channel: string | null; consent: boolean } | null;

type Props = {
  job: BoardJob;
  stages: BoardStage[];
  members: BoardMember[];
  events: BoardEvent[];
  customer: JobCustomer;
  trackingUrl: string;
  submissionHref: string | null;
  boardHref: string;
  today: string;
  timeZone: string;
  move: (jobId: string, fromStageId: string, toStageId: string) => Promise<ActionResult>;
  update: (jobId: string, patch: JobPatch) => Promise<ActionResult>;
  addNote: (jobId: string, body: string) => Promise<ActionResult>;
};

type Status = { kind: "saved" | "error"; text: string; at: number } | null;

export function JobPanel(p: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const j = p.job;
  const stages = useMemo(() => orderedStages(p.stages), [p.stages]);
  const stage = stages.find((s) => s.id === j.stageId);
  const people = useMemo(() => new Map(p.members.map((m) => [m.id, m.name])), [p.members]);
  const stageNames = useMemo(() => new Map(stages.map((s) => [s.id, s.name])), [stages]);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(j.title);
  const [summary, setSummary] = useState(j.summary ?? "");

  useEffect(() => {
    if (status?.kind !== "saved") return;
    const id = window.setTimeout(() => setStatus(null), 2500);
    return () => window.clearTimeout(id);
  }, [status]);

  async function run(label: string, fn: () => Promise<ActionResult>) {
    setBusy(true);
    let r: ActionResult;
    try { r = await fn(); } catch { r = { ok: false, error: "We couldn't reach the server. Check your connection and try again." }; }
    setBusy(false);
    setStatus(r.ok ? { kind: "saved", text: label, at: Date.now() } : { kind: "error", text: r.error, at: Date.now() });
    startTransition(() => router.refresh());
    return r.ok;
  }

  const moveTo = (to: string) => {
    const name = stageNames.get(to) ?? "the new stage";
    return run(`Moved to ${name}.`, () => p.move(j.id, j.stageId, to));
  };
  const done = completeStage(stages);
  const reopen = reopenStage(stages);
  const st = dueState(j, stage, p.today);
  const time = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: p.timeZone });

  return (
    <>
      <div className="view-head">
        <div>
          <Link href={p.boardHref} className="btn ghost small">← Production board</Link>
          <h1 style={{ marginTop: 8 }}>Order <span className="mono">QTG-{j.number}</span></h1>
          <p>{p.customer?.name ?? j.title}{j.formTitle ? ` · ${j.formTitle}` : ""}</p>
        </div>
        <div className="row-btns">
          {stage && <span className="pill accent">{stage.name}</span>}
          {st === "overdue" && <span className="pill bad">Overdue since {formatDay(j.dueDate)}</span>}
          {st === "today" && <span className="pill warn">Due today</span>}
          {st === "done" && <span className="pill good">Done{j.completedAt ? ` ${time(j.completedAt)}` : ""}</span>}
        </div>
      </div>

      <div className="job-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section className="panel" aria-labelledby="work">
            <div className="panel-head">
              <h2 id="work">Work on this job</h2>
              <div className="row-btns" aria-live="polite">
                {busy && <span className="muted" style={{ fontSize: 12.5 }}>Saving…</span>}
                {status?.kind === "saved" && <span className="saved">✓ {status.text}</span>}
              </div>
            </div>
            {status?.kind === "error" && <p className="err" role="alert" style={{ marginBottom: 10 }}>{status.text}</p>}
            <div className="job-ctrls">
              <label className="fld"><span>Stage</span>
                <select value={j.stageId} disabled={busy} onChange={(e) => void moveTo(e.target.value)}>
                  {stages.map((s) => <option key={s.id} value={s.id}>{s.name}{s.isFinal ? " (finished)" : ""}</option>)}
                </select>
              </label>
              <label className="fld"><span>Assigned to</span>
                <select value={j.assigneeId ?? ""} disabled={busy}
                  onChange={(e) => { const v = e.target.value || null; void run(v ? `Assigned to ${people.get(v)}.` : "Unassigned.", () => p.update(j.id, { assigneeId: v })); }}>
                  <option value="">Unassigned</option>
                  {p.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              <label className="fld"><span>Due date</span>
                <input type="date" defaultValue={j.dueDate ?? ""} key={j.dueDate ?? "none"} disabled={busy}
                  onChange={(e) => { const v = e.target.value; if (!v || /^\d{4}-\d{2}-\d{2}$/.test(v)) void run(v ? `Due ${formatDay(v)}.` : "Due date removed.", () => p.update(j.id, { dueDate: v || null })); }} />
              </label>
              <label className="fld"><span>Priority</span>
                <select value={Math.min(j.priority, 2)} disabled={busy} onChange={(e) => { const v = Number(e.target.value); void run(`Priority set to ${PRIORITIES[v].label}.`, () => p.update(j.id, { priority: v })); }}>
                  {PRIORITIES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                </select>
              </label>
            </div>
            <div className="row-btns" style={{ marginTop: 14 }}>
              {stage && !stage.isFinal && done && <button type="button" className="btn primary" disabled={busy} onClick={() => void moveTo(done.id)}>Mark complete</button>}
              {stage?.isFinal && reopen && <button type="button" className="btn" disabled={busy} onClick={() => void moveTo(reopen.id)}>Reopen (back to {reopen.name})</button>}
              {!editing && <button type="button" className="btn ghost" onClick={() => setEditing(true)}>Edit title and summary</button>}
            </div>
            {editing && (
              <form
                style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await run("Details saved.", () => p.update(j.id, { title, summary }))) setEditing(false);
                }}
              >
                <label className="fld"><span>Title</span><input type="text" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} required /></label>
                <label className="fld"><span>Summary</span><textarea value={summary} maxLength={500} rows={3} onChange={(e) => setSummary(e.target.value)} /></label>
                <div className="row-btns">
                  <button className="btn primary small" disabled={busy}>Save details</button>
                  <button type="button" className="btn ghost small" onClick={() => { setEditing(false); setTitle(j.title); setSummary(j.summary ?? ""); }}>Cancel</button>
                </div>
              </form>
            )}
          </section>

          <section className="panel" aria-labelledby="activity">
            <h2 id="activity">Activity</h2>
            <p className="muted" style={{ fontSize: 13.5, marginBottom: 12 }}>Notes are for your team. Customers never see them.</p>
            <form
              className="note-add"
              onSubmit={async (e) => {
                e.preventDefault();
                const body = note.trim();
                if (!body) return;
                if (await run("Note added.", () => p.addNote(j.id, body))) setNote("");
              }}
            >
              <textarea value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note" aria-label="Internal note"
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit(); }} />
              <button className="btn" disabled={busy || !note.trim()}>Add note</button>
            </form>
            <ul className="events">
              {p.events.map((e) => (
                <li key={e.id} className={e.type === "note" ? "note" : undefined}>
                  <span>
                    <span className="who">{actorName(e, people)}</span>{" · "}
                    {e.type === "note" ? <>Note: <span className="nt">{e.body}</span></> : describeEvent(e, stageNames, people)}
                  </span>
                  <time dateTime={e.at}>{time(e.at)}</time>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section className="panel" aria-labelledby="cust">
            <h2 id="cust">Customer</h2>
            {p.customer ? (
              <dl className="answers">
                <div><dt>Name</dt><dd>{p.customer.name ?? "—"}</dd></div>
                {p.customer.phone && <div><dt>Mobile</dt><dd><a href={`tel:${p.customer.phone}`}>{p.customer.phone}</a></dd></div>}
                {p.customer.email && <div><dt>Email</dt><dd><a href={`mailto:${p.customer.email}`}>{p.customer.email}</a></dd></div>}
                <div><dt>Order updates</dt><dd>{CHANNEL_LABEL[p.customer.channel ?? ""] ?? "—"} {p.customer.consent ? <span className="pill good">Agreed</span> : <span className="pill warn">Not agreed</span>}</dd></div>
              </dl>
            ) : <p className="muted">No customer is linked to this job.</p>}
            {p.submissionHref && <p style={{ marginTop: 12 }}><Link href={p.submissionHref}>See the order form answers →</Link></p>}
          </section>
          <section className="panel" aria-labelledby="trk">
            <h2 id="trk">Tracking link</h2>
            <p className="muted" style={{ fontSize: 13.5, marginBottom: 10 }}>The customer&apos;s page updates as the job moves. It shows the stage only: no notes, staff names or contact details.</p>
            <CopyField value={p.trackingUrl} label="Copy link" />
            <p style={{ marginTop: 8 }}><a href={p.trackingUrl} target="_blank" rel="noopener noreferrer">Open the tracking page ↗</a></p>
          </section>
          {j.summary && (
            <section className="panel" aria-labelledby="sum">
              <h2 id="sum">Summary</h2>
              <p style={{ whiteSpace: "pre-wrap" }}>{j.summary}</p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
