"use client";

import { useState, type ReactNode } from "react";
import { cc } from "@/lib/design/color";
import { RADII, SHAPES, TEXTURES, obj, texUrl } from "@/lib/design/engine";
import { canReset } from "./paths";
import { useDesign } from "./context";
import { ColorPicker, CopyIcon, ResetIcon } from "./ColorPicker";

const pid = (p: string) => "c_" + p.replace(/[^A-Za-z0-9]/g, "_");

export function CNum({ label, path, value, min, max, step = 1, unit }: { label: string; path: string; value: unknown; min?: number; max?: number; step?: number; unit?: string }) {
  const { apply } = useDesign();
  const id = pid(path);
  return (
    <label className="c" htmlFor={id}>
      <span className="cl">{label}</span>
      <span className="ci">
        <input type="number" id={id} value={value == null || Number.isNaN(Number(value)) ? "" : String(value)} min={min} max={max} step={step}
          onChange={(e) => { if (e.target.value === "") return; const n = Number(e.target.value); if (Number.isFinite(n)) apply(path, n, true); }} />
        {unit && <i>{unit}</i>}
      </span>
    </label>
  );
}

export function CSel<T extends string | number>({ label, path, value, options, onPick }: { label: string; path: string; value: T; options: [T, string][]; onPick?: (v: T) => void }) {
  const { apply } = useDesign();
  const id = pid(path);
  const isNum = typeof options[0]?.[0] === "number";
  return (
    <label className="c" htmlFor={id}>
      <span className="cl">{label}</span>
      <select id={id} value={String(value)} onChange={(e) => { const v = (isNum ? Number(e.target.value) : e.target.value) as T; if (onPick) onPick(v); else apply(path, v); }}>
        {options.map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}
      </select>
    </label>
  );
}

export function CSeg<T extends string>({ label, path, value, options, onPick }: { label: string; path?: string; value: T; options: [T, string][]; onPick?: (v: T) => void }) {
  const { apply } = useDesign();
  return (
    <div className="c">
      <span className="cl">{label}</span>
      <div className="seg sm" role="group" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={String(value) === v} onClick={() => (onPick ? onPick(v) : path && apply(path, v))}>{l}</button>
        ))}
      </div>
    </div>
  );
}

export function CTog({ label, path, value, onPick }: { label: string; path?: string; value: boolean; onPick?: (v: boolean) => void }) {
  const { apply } = useDesign();
  return (
    <label className="switch">
      <input type="checkbox" checked={value} onChange={(e) => (onPick ? onPick(e.target.checked) : path && apply(path, e.target.checked))} />
      {label}
    </label>
  );
}

export function CText({ label, path, value, placeholder, hint, type = "text" }: { label: string; path: string; value: string; placeholder?: string; hint?: string; type?: string }) {
  const { apply } = useDesign();
  const id = pid(path);
  return (
    <label className="c" htmlFor={id}>
      <span className="cl">{label}</span>
      <input type={type} id={id} value={value} placeholder={placeholder} maxLength={500} onChange={(e) => apply(path, e.target.value, true)} />
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

/** Colour row: round swatch (opens the picker), code box, copy and reset. */
export function CColor({ label, path, value, clear }: { label: string; path: string; value: unknown; clear?: boolean }) {
  const { apply, reset, notify } = useDesign();
  const v = cc(value) || "";
  const [text, setText] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const resettable = canReset(path), clearable = !!clear;
  const shown = text ?? v;
  const bad = text !== null && text.trim() !== "" && !cc(text);
  const id = pid(path);
  return (
    <div className={`cc${bad ? " bad" : ""}`}>
      <span className="cl">{label}</span>
      <button type="button" className="cc-sw" style={{ "--sw": v || "transparent" } as React.CSSProperties} aria-label={`${label}: ${v || "none"}. Open colour picker`}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)} />
      <input type="text" className="cc-tx" id={id} value={shown} placeholder={clearable ? "None" : "#000000"} spellCheck={false} autoComplete="off" aria-label={`${label} colour code`} aria-invalid={bad || undefined}
        onChange={(e) => {
          const t = e.target.value; setText(t);
          const c = cc(t);
          if (c) apply(path, c, true);
          else if (!t.trim() && clearable) apply(path, "", true);
        }}
        onBlur={() => setText(null)} />
      <button type="button" className="cc-ic" title="Copy colour code" aria-label={`Copy ${label} colour code`}
        onClick={() => { if (v) void navigator.clipboard?.writeText(v).then(() => notify(`Copied ${v}.`), () => notify("Copying isn't allowed in this browser.")); }}>
        <CopyIcon />
      </button>
      {resettable ? (
        <button type="button" className="cc-ic" title="Reset to default" aria-label={`Reset ${label}`} onClick={() => { setText(null); reset(path); }}><ResetIcon /></button>
      ) : <span />}
      <span className="cc-err">{bad ? "That is not a colour code. Use one like #2563EB." : ""}</span>
      {anchor && (
        <ColorPicker anchor={anchor} value={v || "#3346D3"} label={label} onClose={() => setAnchor(null)}
          onChange={(c) => { setText(null); apply(path, c, true); }}
          clearable={clearable} onClear={() => apply(path, "")}
          onReset={resettable ? () => reset(path) : undefined} />
      )}
    </div>
  );
}

export function CBox({ label, path, value }: { label: string; path: string; value: unknown }) {
  const { apply } = useDesign();
  const p = obj(value);
  return (
    <div className="c">
      <span className="cl">{label} <span className="hint">top · right · bottom · left (px)</span></span>
      <div className="cg4">
        {(["t", "r", "b", "l"] as const).map((k) => (
          <input key={k} type="number" min={0} max={80} value={p[k] ?? 0} aria-label={`${label} ${{ t: "top", r: "right", b: "bottom", l: "left" }[k]}`}
            onChange={(e) => { if (e.target.value !== "") apply(`${path}.${k}`, Number(e.target.value), true); }} />
        ))}
      </div>
    </div>
  );
}

export function CRadius({ path, value }: { path: string; value: unknown }) {
  const { apply } = useDesign();
  const r = obj(value), linked = r.linked !== false;
  return (
    <>
      <div className="c">
        <span className="cl">Corner shape</span>
        <div className="seg sm">
          {SHAPES.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={linked && Number(r.all) === RADII[k]}
              onClick={() => apply(path, { linked: true, all: RADII[k], tl: RADII[k], tr: RADII[k], br: RADII[k], bl: RADII[k] })}>{l}</button>
          ))}
        </div>
      </div>
      <CTog label="Same radius on every corner" value={linked} onPick={(v) => apply(path, { ...r, linked: v, ...(v ? {} : { tl: r.tl ?? r.all, tr: r.tr ?? r.all, br: r.br ?? r.all, bl: r.bl ?? r.all }) })} />
      {linked ? (
        <CNum label="Corner radius" path={`${path}.all`} value={r.all} min={0} max={999} unit="px" />
      ) : (
        <div className="cg4">
          {([["tl", "Top left"], ["tr", "Top right"], ["br", "Bottom right"], ["bl", "Bottom left"]] as const).map(([k, l]) => (
            <label key={k} className="c">
              <input type="number" min={0} max={999} value={r[k] ?? 0} aria-label={`${l} radius`} onChange={(e) => { if (e.target.value !== "") apply(`${path}.${k}`, Number(e.target.value), true); }} />
              <span className="corner-lbl">{l}</span>
            </label>
          ))}
        </div>
      )}
    </>
  );
}

export function CTex({ path, value, base }: { path: string; value: unknown; base: string }) {
  const { apply } = useDesign();
  const t = obj(value);
  return (
    <>
      <div className="c">
        <span className="cl">Texture</span>
        <div className="texgrid">
          {TEXTURES.map(([k, l]) => {
            const u = texUrl(k, t.texColor || "#000000", Math.max(40, Number(t.texOp) || 0), 10);
            return (
              <button key={k} type="button" className="texbtn" aria-pressed={(t.tex || "none") === k} onClick={() => apply(`${path}.tex`, k)}>
                <span style={{ backgroundColor: cc(base) || "#FFFFFF", ...(u ? { backgroundImage: u, backgroundSize: "10px 10px" } : {}) }} />{l}
              </button>
            );
          })}
        </div>
      </div>
      {t.tex && t.tex !== "none" && (
        <>
          <CColor label="Texture colour" path={`${path}.texColor`} value={t.texColor} />
          <div className="cg">
            <CNum label="Texture strength" path={`${path}.texOp`} value={t.texOp} min={0} max={100} unit="%" />
            <CNum label="Pattern size" path={`${path}.texScale`} value={t.texScale} min={4} max={80} unit="px" />
          </div>
        </>
      )}
    </>
  );
}

/** A collapsible sub-group. Open/closed state is remembered per key. */
export function Sub({ k, title, children, defaultOpen = true }: { k: string; title: string; children: ReactNode; defaultOpen?: boolean }) {
  const { open, toggle } = useDesign();
  const isOpen = open["sub-" + k] ?? defaultOpen;
  return (
    <details className="sub" open={isOpen} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; if (o !== isOpen) toggle("sub-" + k, o); }}>
      <summary>{title}</summary>
      {isOpen && <div className="sub-b">{children}</div>}
    </details>
  );
}
