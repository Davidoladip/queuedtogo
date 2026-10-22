"use client";

import "./board.css";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MAX_STAGES, STAGE_COLORS, orderedStages, type ActionResult, type BoardStage, type StageInput } from "@/lib/board";

export type EditorStage = BoardStage & { jobs: number };

type Props = {
  stages: EditorStage[];
  canEdit: boolean;
  add: (input: StageInput) => Promise<ActionResult>;
  update: (id: string, input: StageInput) => Promise<ActionResult>;
  remove: (id: string) => Promise<ActionResult>;
  reorder: (ids: string[]) => Promise<ActionResult>;
};

export function StageEditor(p: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const stages = orderedStages(p.stages) as EditorStage[];
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(STAGE_COLORS[2]);

  async function run(ok: string, fn: () => Promise<ActionResult>) {
    setBusy(true);
    let r: ActionResult;
    try { r = await fn(); } catch { r = { ok: false, error: "We couldn't reach the server. Check your connection and try again." }; }
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error });
    startTransition(() => router.refresh());
    return r.ok;
  }

  const moveBy = (i: number, d: -1 | 1) => {
    const ids = stages.map((s) => s.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    return run(`${stages[i].name} moved ${d < 0 ? "up" : "down"}.`, () => p.reorder(ids));
  };

  return (
    <section className="qb panel" aria-labelledby="stg">
      <div className="panel-head">
        <div>
          <h2 id="stg">Stages</h2>
          <p className="muted" style={{ fontSize: 14 }}>
            New orders arrive in the first stage. Jobs in a <b>final</b> stage count as finished. {p.canEdit ? "" : "Only owners and admins can change stages."}
          </p>
        </div>
      </div>
      <div aria-live="polite" style={{ minHeight: 22, marginBottom: 8 }}>
        {msg && <p className={msg.ok ? "saved" : "err"} role={msg.ok ? undefined : "alert"}>{msg.ok ? "✓ " : ""}{msg.text}</p>}
      </div>
      <ol className="stage-list">
        {stages.map((s, i) => (
          <StageRow key={`${s.id}:${s.name}:${s.color}:${s.isFinal}`} s={s} i={i} count={stages.length} busy={busy} canEdit={p.canEdit}
            onSave={(input) => run(`${input.name} saved.`, () => p.update(s.id, input))}
            onUp={() => moveBy(i, -1)} onDown={() => moveBy(i, 1)}
            onDelete={() => run(`${s.name} deleted.`, () => p.remove(s.id))} />
        ))}
      </ol>
      {p.canEdit && (
        <form
          style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}
          onSubmit={async (e) => {
            e.preventDefault();
            const n = name.trim();
            if (n && (await run(`${n} added. Move it into place with the arrows.`, () => p.add({ name: n, color, isFinal: false })))) setName("");
          }}
        >
          <Swatches value={color} onPick={setColor} label="New stage colour" />
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="New stage, e.g. Embroidering" aria-label="New stage name" style={{ flex: "1 1 220px", width: "auto" }} />
          <button className="btn primary" disabled={busy || !name.trim() || stages.length >= MAX_STAGES}>Add stage</button>
          {stages.length >= MAX_STAGES && <span className="muted" style={{ fontSize: 13 }}>Up to {MAX_STAGES} stages.</span>}
        </form>
      )}
    </section>
  );
}

function StageRow({ s, i, count, busy, canEdit, onSave, onUp, onDown, onDelete }: {
  s: EditorStage; i: number; count: number; busy: boolean; canEdit: boolean;
  onSave: (input: StageInput) => Promise<boolean>; onUp: () => void; onDown: () => void; onDelete: () => void;
}) {
  const [name, setName] = useState(s.name);
  const [color, setColor] = useState(s.color);
  const [isFinal, setFinal] = useState(s.isFinal);
  const [confirm, setConfirm] = useState(false);
  const dirty = name.trim() !== s.name || color.toLowerCase() !== s.color.toLowerCase() || isFinal !== s.isFinal;
  const off = !canEdit || busy;
  return (
    <li className="stage-row" data-stage-row={s.name}>
      <span className="pos" aria-hidden="true">{i + 1}</span>
      <div className="main">
        <Swatches value={color} onPick={setColor} label={`Colour for ${s.name}`} disabled={off} />
        <input type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label={`Name of stage ${i + 1}`} disabled={!canEdit} />
        <label className="chk" title={i === 0 ? "New orders arrive here, so it can't be final." : undefined}>
          <input type="checkbox" checked={isFinal} disabled={off || i === 0} onChange={(e) => setFinal(e.target.checked)} /> Final stage
        </label>
        <span className="muted" style={{ fontSize: 12.5 }}>{s.jobs} {s.jobs === 1 ? "job" : "jobs"}{i === 0 ? " · new orders arrive here" : ""}</span>
      </div>
      {canEdit && (
        <div className="tools">
          {dirty && <button type="button" className="btn primary small" disabled={busy || !name.trim()} onClick={() => void onSave({ name: name.trim(), color, isFinal })}>Save</button>}
          <button type="button" className="btn small" disabled={busy || i === 0} onClick={onUp} aria-label={`Move ${s.name} up`}>↑</button>
          <button type="button" className="btn small" disabled={busy || i === count - 1} onClick={onDown} aria-label={`Move ${s.name} down`}>↓</button>
          {confirm ? (
            <>
              <button type="button" className="btn small danger primary" disabled={busy} onClick={() => { setConfirm(false); onDelete(); }}>Delete {s.name}</button>
              <button type="button" className="btn small ghost" onClick={() => setConfirm(false)}>Keep</button>
            </>
          ) : (
            <button type="button" className="btn small danger" disabled={busy || count <= 1 || s.jobs > 0} title={s.jobs > 0 ? "Move this stage's jobs to another stage first." : undefined} onClick={() => setConfirm(true)} aria-label={`Delete ${s.name}`}>Delete</button>
          )}
        </div>
      )}
    </li>
  );
}

function Swatches({ value, onPick, label, disabled }: { value: string; onPick: (c: string) => void; label: string; disabled?: boolean }) {
  const list = STAGE_COLORS.some((c) => c.toLowerCase() === value.toLowerCase()) ? STAGE_COLORS : [value, ...STAGE_COLORS];
  return (
    <div className="swatch-pick" role="group" aria-label={label}>
      {list.map((c) => (
        <button key={c} type="button" disabled={disabled} aria-pressed={c.toLowerCase() === value.toLowerCase()} aria-label={c} style={{ "--c": c } as React.CSSProperties} onClick={() => onPick(c)} />
      ))}
    </div>
  );
}
