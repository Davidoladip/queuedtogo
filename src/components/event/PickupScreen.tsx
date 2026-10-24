"use client";

import "./event.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { searchPickup } from "@/lib/eventday";
import type { ActionResult, BoardStage } from "@/lib/board";

/** A job as the pickup screen needs it. Only the last 4 digits of the phone reach the browser. */
export type PickupJob = { id: string; number: number; customerName: string | null; phone: string | null; stageId: string; items: string };

export function PickupScreen({ jobs, stages, completeStageId, move, jobHref }: {
  jobs: PickupJob[]; stages: BoardStage[]; completeStageId: string | null; jobHref: string;
  move: (jobId: string, from: string, to: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const stage = (id: string) => stages.find((s) => s.id === id);

  useEffect(() => {
    const id = window.setInterval(() => { if (document.visibilityState === "visible") startTransition(() => router.refresh()); }, 20_000);
    return () => window.clearInterval(id);
  }, [router]);

  const hits = searchPickup(jobs, q).slice(0, 20);
  async function collect(j: PickupJob) {
    if (!completeStageId) return;
    setBusy(j.id);
    let r: ActionResult;
    try { r = await move(j.id, j.stageId, completeStageId); } catch { r = { ok: false, error: "We couldn't reach the server. Try again." }; }
    setBusy(null);
    setNote(r.ok ? { ok: true, text: `QTG-${j.number} marked as collected.` } : { ok: false, text: r.error });
    startTransition(() => router.refresh());
    if (r.ok) { setQ(""); input.current?.focus(); }
  }

  return (
    <div className="qe">
      <input ref={input} className="qe-search" type="search" inputMode="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Order number, name or last 4 digits of phone" aria-label="Find an order" />
      <div aria-live="polite" style={{ minHeight: 24, marginTop: 8 }}>
        {note && <p className={note.ok ? "saved" : "err"} role={note.ok ? undefined : "alert"} style={{ color: note.ok ? "var(--good)" : "var(--bad)" }}>{note.ok ? "✓ " : ""}{note.text}</p>}
      </div>
      <div className="qe-results">
        {q.trim() && !hits.length && <p className="muted">No orders match &ldquo;{q.trim()}&rdquo;. Check the number on the customer&apos;s text or email.</p>}
        {hits.map((j) => {
          const s = stage(j.stageId);
          const done = Boolean(s?.isFinal);
          return (
            <div key={j.id} className="qe-hit" data-job={j.number}>
              <span className="qe-num">QTG-{j.number}</span>
              <span>
                <span className="qe-who">{j.customerName ?? "Customer"}</span>{j.phone && <span className="muted"> · ••{j.phone}</span>}
                <br /><span className="qe-what">{j.items || "—"}</span>
                <br /><span className={`pill ${done ? "good" : "accent"}`}>{s?.name ?? "Unknown stage"}</span>{" "}
                <a href={jobHref + j.id} className="muted" style={{ fontSize: 13 }}>Open job</a>
              </span>
              {done ? <span className="pill good" style={{ fontSize: 14 }}>Collected ✓</span>
                : completeStageId ? <button type="button" className="btn primary" disabled={busy === j.id} onClick={() => void collect(j)}>{busy === j.id ? "Saving…" : "Mark collected"}</button>
                  : null}
            </div>
          );
        })}
      </div>
      {!q.trim() && <p className="muted" style={{ marginTop: 12 }}>{jobs.length} orders on hand. Type to find one.</p>}
    </div>
  );
}
