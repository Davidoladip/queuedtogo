"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { hsv2rgb, parseColor, rgb2hsv, toHex, toRgba, type HSV } from "@/lib/design/color";
import { useDesign } from "./context";

type Props = {
  anchor: HTMLElement;
  value: string;
  label: string;
  onChange: (v: string) => void;
  onClose: () => void;
  clearable?: boolean;
  onClear?: () => void;
  onReset?: () => void;
  addBrand?: boolean;
};

/** Round-swatch colour picker: saturation/brightness square, hue and opacity sliders, code input and saved colours. */
export function ColorPicker({ anchor, value, label, onChange, onClose, clearable, onClear, onReset, addBrand }: Props) {
  const { brand, setBrand, canEditBrand, recent, pushRecent, form, notify } = useDesign();
  const start = parseColor(value) || parseColor("#3346D3")!;
  const [hsv, setHsv] = useState<HSV>(() => rgb2hsv(start));
  const [alpha, setAlpha] = useState(start.a);
  const [fmt, setFmt] = useState<"hex" | "rgba">("hex");
  const [text, setText] = useState<string | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const changed = useRef(false);
  const ref = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);

  const color = toHex({ ...hsv2rgb(hsv), a: alpha });
  const shown = text ?? (fmt === "rgba" ? toRgba(parseColor(color)!) : color);
  const bad = text !== null && !parseColor(text);

  function emit(h: HSV, a: number) {
    setHsv(h); setAlpha(a); setText(null);
    changed.current = true;
    if (!addBrand) onChange(toHex({ ...hsv2rgb(h), a }));
  }
  function close() {
    if (changed.current && !addBrand) pushRecent(color);
    onClose();
  }

  useLayoutEffect(() => {
    const P = ref.current;
    if (!P || window.innerWidth <= 520) return;
    const r = anchor.getBoundingClientRect(), W = P.offsetWidth, H = P.offsetHeight;
    const left = Math.min(window.innerWidth - W - 8, Math.max(8, r.left - W / 2 + 14));
    let top = r.bottom + 8;
    if (top + H > window.innerHeight - 8) top = Math.max(8, r.top - H - 8);
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    svRef.current?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node) && e.target !== anchor) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); anchor.focus(); } };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("pointerdown", onDown, true); document.removeEventListener("keydown", onKey, true); };
  });

  function setSV(x: number, y: number) {
    const b = svRef.current!.getBoundingClientRect();
    emit({ ...hsv, s: Math.max(0, Math.min(1, (x - b.left) / b.width)), v: Math.max(0, Math.min(1, 1 - (y - b.top) / b.height)) }, alpha);
  }
  const use = (c: string) => { const p = parseColor(c); if (p) emit(rgb2hsv(p), p.a); };
  const themeDots = [...new Set([form.design.theme.page, form.design.theme.card, form.design.theme.text, form.design.theme.accent, form.design.theme.accentText, ...form.design.palette])];

  async function saveBrand() {
    if (brand.includes(color)) return;
    const err = await setBrand([...brand, color].slice(-18));
    notify(err ?? `${color} saved to your brand colours.`);
  }

  return createPortal(
    <div className="cp" ref={ref} role="dialog" aria-label={`${label} colour picker`} style={pos ? { left: pos.left, top: pos.top } : { visibility: window.innerWidth <= 520 ? "visible" : "hidden" }}>
      <div
        className="cp-sv" ref={svRef} tabIndex={0} role="slider" aria-label="Saturation and brightness. Use the arrow keys to adjust." aria-valuetext={color} aria-valuenow={Math.round(hsv.s * 100)} aria-valuemin={0} aria-valuemax={100}
        style={{ "--h": Math.round(hsv.h) } as React.CSSProperties}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setSV(e.clientX, e.clientY); }}
        onPointerMove={(e) => { if (e.buttons) setSV(e.clientX, e.clientY); }}
        onKeyDown={(e) => {
          const st = e.shiftKey ? 0.1 : 0.02, k = e.key;
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(k)) return;
          e.preventDefault();
          const n = { ...hsv };
          if (k === "ArrowLeft") n.s = Math.max(0, n.s - st);
          if (k === "ArrowRight") n.s = Math.min(1, n.s + st);
          if (k === "ArrowUp") n.v = Math.min(1, n.v + st);
          if (k === "ArrowDown") n.v = Math.max(0, n.v - st);
          emit(n, alpha);
        }}
      >
        <span className="cp-knob" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: color.slice(0, 7) }} />
      </div>
      <label className="cp-sl"><span>Hue</span><input type="range" className="cp-hue" min={0} max={360} step={1} value={Math.round(hsv.h)} onChange={(e) => emit({ ...hsv, h: +e.target.value }, alpha)} /></label>
      <label className="cp-sl"><span>Opacity</span><input type="range" className="cp-alpha" min={0} max={100} step={1} value={Math.round(alpha * 100)} style={{ "--cpc": color.slice(0, 7) } as React.CSSProperties} onChange={(e) => emit(hsv, +e.target.value / 100)} /></label>
      <div className="cp-row">
        <span className="cp-prev" style={{ "--sw": color } as React.CSSProperties} />
        <input type="text" id="cp-txt" className={bad ? "bad" : undefined} value={shown} spellCheck={false} autoComplete="off" aria-label="Colour code"
          onChange={(e) => {
            const v = e.target.value; setText(v);
            const c = parseColor(v);
            if (c) { setHsv(rgb2hsv(c)); setAlpha(c.a); changed.current = true; if (!addBrand) onChange(toHex(c)); }
          }} />
        <button type="button" className="cc-ic" title="Copy colour code" aria-label="Copy colour code" onClick={() => { void navigator.clipboard?.writeText(shown).then(() => notify(`Copied ${shown}.`), () => notify("Copying isn't allowed in this browser.")); }}>
          <CopyIcon />
        </button>
      </div>
      <div className="cp-msg" role="alert">{bad ? "That is not a colour code. Use one like #2563EB or rgba(37, 99, 235, 0.5)." : ""}</div>
      <div className="seg sm" role="group" aria-label="Code format">
        <button type="button" aria-pressed={fmt === "hex"} onClick={() => { setFmt("hex"); setText(null); }}>HEX</button>
        <button type="button" aria-pressed={fmt === "rgba"} onClick={() => { setFmt("rgba"); setText(null); }}>RGBA</button>
      </div>
      <div>
        <h6>Brand colours</h6>
        <div className="dotrow"><PickDots list={brand} use={use} />{canEditBrand && <button type="button" className="dot-add" title="Save this colour to brand colours" aria-label="Save this colour to brand colours" onClick={() => void saveBrand()}>+</button>}</div>
      </div>
      {recent.length > 0 && <div><h6>Recent</h6><div className="dotrow"><PickDots list={recent} use={use} /></div></div>}
      <div><h6>This form</h6><div className="dotrow"><PickDots list={themeDots} use={use} /></div></div>
      <div className="cp-foot">
        {clearable && <button type="button" className="btn small" onClick={() => { changed.current = false; onClear?.(); onClose(); }}>No colour</button>}
        {onReset && <button type="button" className="btn small" onClick={() => { changed.current = false; onReset(); onClose(); }}>Reset to default</button>}
        <button type="button" className="btn small primary" onClick={async () => { if (addBrand) await saveBrand(); close(); }}>{addBrand ? "Add to brand colours" : "Done"}</button>
      </div>
    </div>,
    document.body,
  );
}

export const CopyIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="5" y="5" width="8.5" height="8.5" rx="1.5" /><path d="M3 10.5V3.5A1.5 1.5 0 0 1 4.5 2h6" /></svg>
);
export const ResetIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.6-3.7" /><path d="M3 2.5v3h3" /></svg>
);

function PickDots({ list, use }: { list: string[]; use: (c: string) => void }) {
  return <>{list.map((c) => <button key={c} type="button" className="dot-c" style={{ "--sw": c } as React.CSSProperties} title={c} aria-label={`Use ${c}`} onClick={() => use(c)} />)}</>;
}
