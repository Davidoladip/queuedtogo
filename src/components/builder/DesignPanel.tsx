"use client";
/* eslint-disable @next/next/no-img-element -- artwork sizing is controlled by the form design CSS, not next/image */

import { useState } from "react";
import { bestOn, themeFromPalette } from "@/lib/design/color";
import {
  FONTS, LAYOUTS, SHAPES, SHARED_KINDS, TEXTURES, computed, elementsOf, srcOf,
  type FormModel, type SharedKind, type Style,
} from "@/lib/design/engine";
import { processImage } from "@/lib/design/image";
import { ColorInput, NumberInput, Seg, Select, Toggle } from "./controls";
import type { Update, Upload } from "./Builder";

type Props = { form: FormModel; update: Update; selected: string | null; setSelected: (s: string | null) => void; upload: Upload; assetBase: string };

const KIND_PLURAL: Record<string, string> = { button: "buttons", input: "input boxes", choice: "option buttons", label: "question labels", heading: "headings", text: "text blocks" };

function setPath(o: Style, path: string[], v: unknown) {
  let cur = o;
  for (const k of path.slice(0, -1)) { if (!cur[k] || typeof cur[k] !== "object") cur[k] = {}; cur = cur[k]; }
  cur[path[path.length - 1]] = v;
}

export function DesignPanel({ form, update, selected, setSelected, upload, assetBase }: Props) {
  const T = form.design.theme;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [scope, setScope] = useState<"one" | "all">("one");
  const art = srcOf(form.design.art, assetBase);
  const setTheme = (k: keyof typeof T, v: string) => update((d) => { (d.design.theme as Record<string, string>)[k] = v; }, { coalesce: `theme:${k}` });

  const els = elementsOf(form);
  const el = selected ? els.find((e) => e.sid === selected) : null;
  const styled = el && el.kind !== "image";
  const shared = el && (SHARED_KINDS as readonly string[]).includes(el.kind);
  const s = el ? computed(form, el) : null;
  const useAll = shared && scope === "all";

  function setStyle(path: string[], v: unknown, key: string) {
    if (!el) return;
    update((d) => {
      const target = useAll ? (d.design.shared[el.kind as SharedKind] ??= {}) : (d.design.el[el.sid] ??= {});
      setPath(target, path, v);
      if (path[0] === "bg" && path[1] === "color") { setPath(target, ["bg", "opacity"], 100); setPath(target, ["bg", "type"], "solid"); }
    }, { coalesce: `${useAll ? el.kind : el.sid}:${key}` });
  }
  function resetStyle() {
    if (!el) return;
    update((d) => { if (useAll) d.design.shared[el.kind as SharedKind] = {}; else delete d.design.el[el.sid]; });
  }

  async function onArt(file: File) {
    setErr(null); setBusy(true);
    try {
      const p = await processImage(file, 1800);
      const { path } = await upload(p);
      update((d) => { d.design.art = { path }; d.design.palette = p.palette; });
    } catch (ex) { setErr((ex as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="stack">
      <section className="b-card">
        <h3>Event artwork</h3>
        <div className="b-art">
          {art ? <img src={art} alt="" /> : <span className="muted">Upload the event&apos;s poster or artwork. PNG, JPG, WebP or SVG, up to 10 MB.</span>}
        </div>
        <div className="b-row-actions">
          <label className="btn small primary">
            {busy ? "Uploading…" : art ? "Replace artwork" : "Upload artwork"}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onArt(f); }} />
          </label>
          {art && <button type="button" className="btn small danger" onClick={() => update((d) => { d.design.art = null; })}>Remove</button>}
        </div>
        {err && <div className="notice error" role="alert">{err}</div>}
        <Seg label="Layout" value={T.layout as "banner"} options={Object.entries(LAYOUTS) as ["banner", string][]} onChange={(v) => setTheme("layout", v)} />
        {form.design.palette.length > 0 && (
          <div className="b-field">
            <span className="b-label">Colours from your artwork</span>
            <div className="b-swatches">
              {form.design.palette.map((c) => <span key={c} className="b-swatch" style={{ background: c }} title={c} />)}
              <button type="button" className="btn small" onClick={() => {
                const t = themeFromPalette(form.design.palette);
                if (t) update((d) => { Object.assign(d.design.theme, t); });
              }}>Match form colours</button>
            </div>
          </div>
        )}
      </section>

      <section className="b-card">
        <h3>Colours</h3>
        <div className="b-colors">
          <ColorInput label="Page background" value={T.page} onChange={(v) => setTheme("page", v)} />
          <ColorInput label="Form card" value={T.card} onChange={(v) => setTheme("card", v)} />
          <ColorInput label="Text" value={T.text} onChange={(v) => setTheme("text", v)} />
          <ColorInput label="Accent (buttons)" value={T.accent} onChange={(v) => update((d) => { d.design.theme.accent = v; d.design.theme.accentText = bestOn(v); }, { coalesce: "theme:accent" })} />
          <ColorInput label="Text on accent" value={T.accentText} onChange={(v) => setTheme("accentText", v)} />
        </div>
      </section>

      <section className="b-card">
        <h3>Type and shape</h3>
        <Select label="Font style" value={T.font} options={Object.entries(FONTS).map(([k, f]) => [k, f.label] as [string, string])} onChange={(v) => setTheme("font", v)} />
        <Seg label="Corners" value={T.radius} options={SHAPES} onChange={(v) => setTheme("radius", v)} />
      </section>

      <section className="b-card">
        <h3>Textures</h3>
        {(["page", "card"] as const).map((layer) => {
          const L = form.design[layer];
          return (
            <div key={layer} className="form">
              <Select label={layer === "page" ? "Page texture" : "Card texture"} value={L.tex} options={TEXTURES} onChange={(v) => update((d) => { d.design[layer].tex = v; })} />
              {L.tex !== "none" && (
                <div className="row">
                  <ColorInput label="Texture colour" value={L.texColor} onChange={(v) => update((d) => { d.design[layer].texColor = v; }, { coalesce: `${layer}:texc` })} />
                  <NumberInput label="Strength" value={L.texOp} min={2} max={60} suffix="%" onChange={(v) => update((d) => { d.design[layer].texOp = v; }, { coalesce: `${layer}:texo` })} />
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="b-card">
        <h3>Selected element</h3>
        {!el ? (
          <p className="muted b-note">Click any part of the preview, like the title, a question or the submit button, to style it on its own.</p>
        ) : !styled ? (
          <p className="muted b-note">Artwork blocks are sized and aligned in the Questions tab.</p>
        ) : (
          <div className="form">
            <div className="b-el-head">
              <b>{el.name}</b>
              <button type="button" className="linkbtn" onClick={() => setSelected(null)}>Done</button>
            </div>
            {shared && (
              <Seg label="Apply changes to" value={scope} options={[["one", "Just this one"], ["all", `All ${KIND_PLURAL[el.kind]}`]]} onChange={setScope} />
            )}
            {el.kind !== "divider" && (
              <>
                <ColorInput label="Text colour" value={s!.color} onChange={(v) => setStyle(["color"], v, "color")} />
                <div className="row">
                  <NumberInput label="Text size" value={Number(s!.size)} min={10} max={el.kind === "heading" ? 72 : 32} suffix="px" onChange={(v) => setStyle(["size"], v, "size")} />
                  <Select label="Weight" value={String(s!.weight)} options={[["300", "Light"], ["400", "Regular"], ["500", "Medium"], ["600", "Semibold"], ["700", "Bold"], ["800", "Extra bold"]]} onChange={(v) => setStyle(["weight"], Number(v), "weight")} />
                </div>
                <Seg label="Align text" value={s!.align as "left"} options={[["left", "Left"], ["center", "Centre"], ["right", "Right"]]} onChange={(v) => setStyle(["align"], v, "align")} />
              </>
            )}
            {(el.kind === "button" || el.kind === "choice" || el.kind === "input") && (
              <>
                <div className="row">
                  <ColorInput label="Background" value={s!.bg?.color} onChange={(v) => setStyle(["bg", "color"], v, "bg")} />
                  <ColorInput label="Border" value={s!.border?.color} onChange={(v) => { setStyle(["border", "color"], v, "bc"); }} />
                </div>
                <NumberInput label="Corner rounding" value={Math.min(60, Number(s!.radius?.all ?? 12))} min={0} max={60} suffix="px" onChange={(v) => setStyle(["radius"], { linked: true, all: v, tl: v, tr: v, br: v, bl: v }, "radius")} />
                {el.kind === "button" && (
                  <Seg label="Width" value={(s!.width === "full" ? "full" : "auto") as "auto"} options={[["auto", "Fit text"], ["full", "Full width"]]} onChange={(v) => setStyle(["width"], v, "width")} />
                )}
                {el.kind === "button" && (
                  <ColorInput label="Hover background" value={s!.st?.hover?.bg} allowEmpty onChange={(v) => setStyle(["st", "hover", "bg"], v, "hbg")} />
                )}
                {el.kind === "choice" && (
                  <ColorInput label="Selected background" value={s!.st?.selected?.bg} onChange={(v) => setStyle(["st", "selected", "bg"], v, "sbg")} />
                )}
              </>
            )}
            {el.kind === "divider" && (
              <ColorInput label="Line colour" value={s!.border?.color} onChange={(v) => setStyle(["border", "color"], v, "bc")} />
            )}
            <div className="b-row-actions">
              <button type="button" className="btn small" onClick={resetStyle}>Reset {useAll ? `all ${KIND_PLURAL[el.kind]}` : "this element"}</button>
            </div>
          </div>
        )}
      </section>

      <section className="b-card">
        <h3>Multi-page forms</h3>
        <Toggle label="Show a progress bar" hint="Appears when the form has page breaks." checked={form.design.adv.progress} onChange={(v) => update((d) => { d.design.adv.progress = v; })} />
      </section>
    </div>
  );
}
