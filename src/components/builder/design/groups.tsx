"use client";
/* eslint-disable @next/next/no-img-element -- previews of uploaded artwork */

import { useState } from "react";
import { alphaMul, cc, contrast, over } from "@/lib/design/color";
import {
  FONT_OPTS, IMG_DEFAULT, WEIGHTS, computed, computedShared, obj, repEl, srcOf,
  type El, type FormField, type FormModel, type Style,
} from "@/lib/design/engine";
import { processImage } from "@/lib/design/image";
import type { ArtSettings, SwatchSettings } from "@/lib/design/media";
import { ArtUploader, SwatchEditor } from "../media-controls";
import { CBox, CColor, CNum, CRadius, CSel, CSeg, CTex, CTog, CText, Sub } from "./controls";
import { useDesign } from "./context";

export function GrpText({ pf, s, ph }: { pf: string; s: Style; ph?: boolean }) {
  const { apply } = useDesign();
  const unit = String(s.unit || "px");
  return (
    <>
      <div className="cg">
        <CSel label="Font" path={`${pf}.font`} value={String(s.font)} options={FONT_OPTS} />
        <div className="c">
          <span className="cl">Size</span>
          <div className="ci2">
            <input type="number" aria-label="Font size" step={unit === "px" ? 1 : 0.05} min={unit === "px" ? 8 : 0.5} max={unit === "px" ? 120 : 8} value={s.size ?? ""}
              onChange={(e) => { if (e.target.value !== "") apply(`${pf}.size`, Number(e.target.value), true); }} />
            <select aria-label="Font size unit" value={unit} onChange={(e) => {
              const to = e.target.value, size = Number(s.size) || 16;
              // Keep the visible size the same when switching units (1rem = 16px).
              const px = unit === "px" ? size : size * 16;
              apply(`${pf}.unit`, to);
              apply(`${pf}.size`, to === "px" ? Math.round(px) : +(px / 16).toFixed(2));
            }}>
              {["px", "rem", "em"].map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <CSel label="Weight" path={`${pf}.weight`} value={Number(s.weight)} options={WEIGHTS} />
        <CSel label="Letter case" path={`${pf}.transform`} value={String(s.transform)} options={[["none", "As typed"], ["uppercase", "UPPERCASE"], ["lowercase", "lowercase"], ["capitalize", "Capitalise Each"]]} />
        <CNum label="Letter spacing" path={`${pf}.spacing`} value={s.spacing} step={0.01} min={-0.1} max={0.5} unit="em" />
        <CNum label="Line height" path={`${pf}.lh`} value={s.lh} step={0.05} min={0.8} max={3} />
      </div>
      <CSeg label="Text alignment" path={`${pf}.align`} value={String(s.align)} options={[["left", "Left"], ["center", "Centre"], ["right", "Right"]]} />
      <CColor label="Text colour" path={`${pf}.color`} value={s.color} />
      {ph && <CColor label="Placeholder colour" path={`${pf}.ph`} value={s.ph} />}
    </>
  );
}

function Spacing({ pf, s }: { pf: string; s: Style }) {
  return (
    <div className="cg">
      <CNum label="Space above" path={`${pf}.mar.t`} value={obj(s.mar).t} min={-40} max={200} unit="px" />
      <CNum label="Space below" path={`${pf}.mar.b`} value={obj(s.mar).b} min={-40} max={200} unit="px" />
    </div>
  );
}

export function GrpBox({ pf, s, el }: { pf: string; s: Style; el: El }) {
  const btn = el.kind === "button";
  // Group layout applies to a question's options (or all option buttons), not to one option.
  const group = el.kind === "choice" && !pf.startsWith("o.");
  return (
    <>
      {group && (
        <>
          <CSeg label="Arrange options" path={`${pf}.layout`} value={String(s.layout || "row")} options={[["row", "Side by side"], ["column", "Stacked"]]} />
          <CSeg label="Align the group" path={`${pf}.place`} value={String(s.place || "left")} options={[["left", "Left"], ["center", "Centre"], ["right", "Right"]]} />
          <CNum label="Space between options" path={`${pf}.gap`} value={s.gap ?? 8} min={0} max={64} unit="px" />
        </>
      )}
      <CSeg label="Width" path={`${pf}.width`} value={String(s.width)} options={[["auto", "Auto"], ["full", "Full width"], ["custom", "Custom"]]} />
      {s.width === "custom" && (
        <div className="cg">
          <CNum label="Custom width" path={`${pf}.w`} value={s.w} min={1} max={s.wUnit === "%" ? 100 : 2000} />
          <CSel label="Unit" path={`${pf}.wUnit`} value={String(s.wUnit)} options={[["px", "px"], ["%", "%"]]} />
        </div>
      )}
      {btn && el.btn !== "prev" && s.width !== "full" && (
        <CSeg label="Position" path={`${pf}.place`} value={String(s.place)} options={[["left", "Left"], ["center", "Centre"], ["right", "Right"]]} />
      )}
      <CNum label="Minimum height" path={`${pf}.minH`} value={s.minH} min={0} max={400} unit="px" />
      <CBox label="Inner padding" path={`${pf}.pad`} value={s.pad} />
      <Spacing pf={pf} s={s} />
    </>
  );
}

export function GrpBg({ pf, bg: raw }: { pf: string; bg: unknown }) {
  const { apply, upload, assetBase, notify } = useDesign();
  const [busy, setBusy] = useState(false);
  const bg = obj(raw), P = `${pf}.bg`, t = String(bg.type || "solid");
  const src = t === "image" ? srcOf(bg.img, assetBase) : null;
  return (
    <>
      <CSeg label="Fill" path={`${P}.type`} value={t} options={[["solid", "Solid"], ["gradient", "Gradient"], ["texture", "Texture"], ["image", "Image"]]} />
      <CColor label={t === "gradient" ? "Start colour" : t === "image" ? "Base colour" : "Background colour"} path={`${P}.color`} value={bg.color} />
      {t === "gradient" && (
        <>
          <CColor label="End colour" path={`${P}.color2`} value={bg.color2} />
          <div className="cg">
            <CNum label="Angle" path={`${P}.angle`} value={bg.angle} min={0} max={360} unit="°" />
            <CSel label="Style" path={`${P}.gtype`} value={String(bg.gtype || "linear")} options={[["linear", "Linear"], ["radial", "Radial"]]} />
          </div>
        </>
      )}
      {t === "texture" && <CTex path={P} value={bg} base={String(bg.color || "#FFFFFF")} />}
      {t === "image" && (
        <>
          <div className="imgc">
            {src ? <img src={src} alt="" /> : <span className="blk-th" style={{ width: 64, height: 64 }} />}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <label className="btn small">
                {busy ? "Uploading…" : src ? "Replace image" : "Upload image"}
                <input type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={busy} onChange={async (e) => {
                  const file = e.target.files?.[0]; e.target.value = "";
                  if (!file) return;
                  setBusy(true);
                  try { const p = await processImage(file, 1400); const { path } = await upload(p); apply(`${P}.img`, { path }); }
                  catch (ex) { notify((ex as Error).message); } finally { setBusy(false); }
                }} />
              </label>
              {src && <button type="button" className="btn small" onClick={() => apply(`${P}.img`, null)}>Remove</button>}
            </div>
          </div>
          <div className="cg">
            <CSel label="Image size" path={`${P}.imgSize`} value={String(bg.imgSize || "cover")} options={[["cover", "Fill (cover)"], ["contain", "Fit (contain)"], ["auto", "Original"], ["custom", "Custom %"]]} />
            {bg.imgSize === "custom" && <CNum label="Scale" path={`${P}.imgScale`} value={bg.imgScale} min={5} max={400} unit="%" />}
            <CSel label="Position" path={`${P}.pos`} value={String(bg.pos || "center")} options={[["center", "Centre"], ["top", "Top"], ["bottom", "Bottom"], ["left", "Left"], ["right", "Right"], ["top left", "Top left"], ["top right", "Top right"], ["bottom left", "Bottom left"], ["bottom right", "Bottom right"]]} />
            <CSel label="Repeat" path={`${P}.repeat`} value={String(bg.repeat || "no-repeat")} options={[["no-repeat", "No repeat"], ["repeat", "Tile"], ["repeat-x", "Across"], ["repeat-y", "Down"]]} />
          </div>
        </>
      )}
      <CNum label={t === "image" ? "Image opacity" : "Background opacity"} path={`${P}.opacity`} value={bg.opacity} min={0} max={100} unit="%" />
    </>
  );
}

export function GrpBorder({ pf, s, noRadius }: { pf: string; s: Style; noRadius?: boolean }) {
  const b = obj(s.border);
  return (
    <>
      <div className="cg">
        <CSel label="Border style" path={`${pf}.border.style`} value={String(b.style || "solid")} options={[["none", "None"], ["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]]} />
        {b.style !== "none" && <CNum label="Border width" path={`${pf}.border.width`} value={b.width} min={0} max={12} step={0.5} unit="px" />}
      </div>
      {b.style !== "none" && <CColor label="Border colour" path={`${pf}.border.color`} value={b.color} />}
      {!noRadius && <CRadius path={`${pf}.radius`} value={s.radius} />}
    </>
  );
}

export const STATES: Record<string, [string, string][]> = {
  button: [["default", "Default"], ["hover", "Hover"], ["active", "Pressed"], ["focus", "Focus"], ["disabled", "Disabled"]],
  input: [["default", "Default"], ["hover", "Hover"], ["focus", "Focus"], ["error", "Error"], ["disabled", "Disabled"]],
  choice: [["default", "Default"], ["hover", "Hover"], ["selected", "Selected"], ["focus", "Focus"]],
};

export function GrpStates({ pf, s, el, ctx }: { pf: string; s: Style; el: El; ctx: string }) {
  const { ps, setPs } = useDesign();
  const cs = ps.ctx === ctx ? ps.state : "default", x = obj(obj(s.st)[cs]), P = `${pf}.st.${cs}`;
  const cl = (l: string, k: string) => <CColor key={k} label={l} path={`${P}.${k}`} value={x[k]} clear />;
  let body;
  if (cs === "default") body = <p className="hint">The default state uses the settings above. Pick a state to style it. The preview shows that state while you edit.</p>;
  else if (cs === "focus") body = <>{cl("Focus ring", "ring")}<CNum label="Ring width" path={`${P}.ringW`} value={x.ringW} min={1} max={10} unit="px" />{cl("Border colour", "border")}<p className="hint">Shown when someone moves to this element with the keyboard. If you clear the ring, a plain outline is used so it stays visible.</p></>;
  else if (cs === "error") body = <>{cl("Border colour", "border")}{cl("Message colour", "color")}</>;
  else if (cs === "disabled") body = <><CNum label="Opacity" path={`${P}.opacity`} value={x.opacity} min={10} max={100} unit="%" />{cl("Text colour", "color")}{cl("Background", "bg")}{cl("Border colour", "border")}
    <p className="hint">{el.kind === "button" ? "Shown while required questions are unanswered, if that option is on in Advanced settings." : "Shown on answers you prefill and lock in Questions."}</p></>;
  else if (el.kind === "input" && cs === "hover") body = <>{cl("Border colour", "border")}{cl("Background", "bg")}</>;
  else body = <>{cl("Text colour", "color")}{cl("Background", "bg")}{cl("Border colour", "border")}</>;
  return (
    <>
      <div className="seg sm" role="group" aria-label="State to edit">
        {STATES[el.kind].map(([k, l]) => <button key={k} type="button" aria-pressed={cs === k} onClick={() => setPs({ ctx, state: k })}>{l}</button>)}
      </div>
      {body}
      {cs !== "default" && <p className="hint">Empty means no change from the default state.</p>}
    </>
  );
}

export function StyleBody({ el, pf, s, ctx }: { el: El; pf: string; s: Style; ctx: string }) {
  switch (el.kind) {
    case "button": case "input": case "choice":
      return (
        <>
          <Sub k="text" title="Typography"><GrpText pf={pf} s={s} ph={el.kind === "input"} /></Sub>
          <Sub k="box" title="Size and spacing"><GrpBox pf={pf} s={s} el={el} /></Sub>
          <Sub k="bg" title="Background and texture"><GrpBg pf={pf} bg={s.bg} /></Sub>
          <Sub k="border" title="Border and corners"><GrpBorder pf={pf} s={s} /></Sub>
          {el.kind !== "input" && <Sub k="shadow" title="Shadow and opacity"><GrpShadow path={`${pf}.shadow`} value={s.shadow} /><CNum label="Opacity" path={`${pf}.opacity`} value={s.opacity ?? 100} min={10} max={100} unit="%" /></Sub>}
          <Sub k="states" title="Interactive states"><GrpStates pf={pf} s={s} el={el} ctx={ctx} /></Sub>
        </>
      );
    case "divider":
      return (<><Sub k="border" title="Line"><GrpBorder pf={pf} s={s} noRadius /></Sub><Sub k="box" title="Spacing"><Spacing pf={pf} s={s} /></Sub></>);
    default:
      return (<><Sub k="text" title="Typography"><GrpText pf={pf} s={s} /></Sub><Sub k="box" title="Spacing"><Spacing pf={pf} s={s} /></Sub></>);
  }
}

// ---------------------------------------------------------------- artwork blocks
export function posName(f: FormField) {
  if (f.type === "submit") return "Submit button";
  if (f.type === "page") return "page break";
  if (f.type === "image") return `artwork “${(f.config.img?.alt || f.config.img?.name || "image").slice(0, 24)}”`;
  return `“${(f.label || f.type).slice(0, 28)}”`;
}
/** Insert positions: index n means "before field n" (0 = beginning). */
export function posOptions(form: FormModel, exclude: string | null): [number, string][] {
  const list = form.fields.filter((f) => f.id !== exclude);
  let pageN = 1;
  const opts: [number, string][] = [[0, "Beginning of the form"]];
  list.forEach((f, j) => {
    if (f.type === "page") { pageN++; opts.push([j + 1, `Start of page ${pageN}`]); }
    else if (f.type === "submit") opts.push([j + 1, "Below the Submit button"]);
    else opts.push([j + 1, "After " + posName(f)]);
  });
  return opts;
}

export function ImageStyle({ f }: { f: FormField }) {
  const { form, update, assetBase, upload, notify, setSelected } = useDesign();
  const [busy, setBusy] = useState(false);
  const g = { ...IMG_DEFAULT, ...f.config.img }, P = `img.${f.id}`;
  const src = srcOf(g.src, assetBase);
  const cur = form.fields.findIndex((x) => x.id === f.id);
  return (
    <>
      <Sub k="isize" title="Size">
        <div className="cg">
          <CNum label="Width" path={`${P}.w`} value={g.w} min={1} max={g.wUnit === "%" ? 100 : 2000} />
          <CSel label="Unit" path={`${P}.wUnit`} value={String(g.wUnit)} options={[["%", "% of form"], ["px", "px"]]} />
        </div>
        <CTog label="Keep the original proportions" path={`${P}.keep`} value={g.keep !== false} />
        {g.keep === false && (
          <div className="cg">
            <CNum label="Height" path={`${P}.h`} value={g.h} min={10} max={2000} unit="px" />
            <CSel label="Fit" path={`${P}.fit`} value={String(g.fit)} options={[["cover", "Fill and crop"], ["contain", "Fit inside"], ["fill", "Stretch"]]} />
          </div>
        )}
      </Sub>
      <Sub k="iplace" title="Placement">
        <CSeg label="Alignment" path={`${P}.align`} value={String(g.align)} options={[["left", "Left"], ["center", "Centre"], ["right", "Right"]]} />
        <div className="cg">
          <CNum label="Vertical spacing" path={`${P}.marY`} value={g.marY} min={0} max={200} unit="px" />
          <CNum label="Side spacing" path={`${P}.marX`} value={g.marX} min={0} max={200} unit="px" />
        </div>
        <label className="c">
          <span className="cl">Position in the form</span>
          <select value={cur} onChange={(e) => {
            const to = Number(e.target.value);
            update((d) => { const i = d.fields.findIndex((x) => x.id === f.id); const [b] = d.fields.splice(i, 1); d.fields.splice(to, 0, b); });
          }}>
            {posOptions(form, f.id).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </Sub>
      <Sub k="ilook" title="Border and look">
        <div className="cg">
          <CNum label="Border width" path={`${P}.bw`} value={g.bw} min={0} max={20} unit="px" />
          <CNum label="Corner radius" path={`${P}.br`} value={g.br} min={0} max={999} unit="px" />
        </div>
        <CColor label="Border colour" path={`${P}.bc`} value={g.bc} />
        <CNum label="Opacity" path={`${P}.op`} value={g.op} min={0} max={100} unit="%" />
      </Sub>
      <Sub k="icontent" title="Image, link and alt text">
        <div className="imgc">
          {src ? <img src={src} alt="" /> : <span className="blk-th" style={{ width: 64, height: 64 }} />}
          <label className="btn small">
            {busy ? "Uploading…" : src ? "Replace image" : "Choose image"}
            <input type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={busy} onChange={async (e) => {
              const file = e.target.files?.[0]; e.target.value = "";
              if (!file) return;
              setBusy(true);
              try {
                const p = await processImage(file, 1400); const { path } = await upload(p);
                update((d) => { const x = d.fields.find((y) => y.id === f.id); if (x) x.config.img = { ...IMG_DEFAULT, ...x.config.img, src: { path }, name: p.name }; });
              } catch (ex) { notify((ex as Error).message); } finally { setBusy(false); }
            }} />
          </label>
        </div>
        <CText label="Description for screen readers (alt text)" path={`${P}.alt`} value={g.alt} placeholder="e.g. Sample of the embroidered logo" />
        <CText label="Link (optional)" path={`${P}.link`} value={g.link} type="url" placeholder="https://" hint="Opens in a new tab when the image is clicked." />
      </Sub>
      <div className="chiprow">
        <button type="button" className="btn small" onClick={() => {
          const copy = { ...structuredClone(f), id: crypto.randomUUID() };
          update((d) => { const i = d.fields.findIndex((x) => x.id === f.id); d.fields.splice(i + 1, 0, copy); });
          setSelected(copy.id);
        }}>Duplicate</button>
        <button type="button" className="btn small danger" onClick={() => { update((d) => { d.fields = d.fields.filter((x) => x.id !== f.id); }); setSelected(null); }}>Delete artwork</button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- contrast checks
function Line({ label, fg, bgs, min }: { label: string; fg: unknown; bgs: string[]; min: number }) {
  const r = Math.min(...bgs.map((b) => contrast(over(fg, b), b)));
  const ok = r >= min;
  return <span className={ok ? "ok" : "low"}>{ok ? "✓" : "!"} {label} {r.toFixed(1)}:1{ok ? "" : ` — below ${min}:1, hard to read. Pick a stronger colour.`}</span>;
}
function bgSamples(bgIn: unknown, base: string): string[] {
  const bg = obj(bgIn), op = Number(bg.opacity ?? 100) / 100;
  if (bg.type === "image") return [over(cc(bg.color) || base, base)];
  const c1 = over(alphaMul(bg.color, op) || "#00000000", base);
  return bg.type === "gradient" ? [c1, over(alphaMul(bg.color2, op) || "#00000000", base)] : [c1];
}

export function Contrast({ form, el, scope }: { form: FormModel; el: El | "theme"; scope?: "el" | "g" }) {
  const T = form.design.theme, card = over(T.card, T.page);
  let content: React.ReactNode = null;
  if (el === "theme") {
    content = <><Line label="Text on form" fg={T.text} bgs={[card]} min={4.5} /><Line label="Button text on button colour" fg={T.accentText} bgs={[T.accent]} min={4.5} /></>;
  } else if (el.kind !== "image" && el.kind !== "divider") {
    const s = scope === "g" || el.sid === "__rep" ? computedShared(form, el) : computed(form, el);
    const bg = bgSamples(s.bg, card), bt = obj(s.bg).type;
    const note = bt === "image" ? <span className="info">Background image: check that text stays readable over it.</span> : bt === "texture" ? <span className="info">Textures can lower contrast. Keep them subtle behind text.</span> : null;
    if (el.kind === "button" || el.kind === "choice") {
      const sel = obj(obj(s.st).selected);
      content = <><Line label="Text on background" fg={s.color} bgs={bg} min={4.5} />{el.kind === "choice" && cc(sel.bg) && <Line label="Selected text" fg={cc(sel.color) || s.color} bgs={[over(sel.bg, card)]} min={4.5} />}{note}</>;
    } else if (el.kind === "input") {
      const lab = el.sid !== "__rep" ? computed(form, { ...el, kind: "label", sid: el.sid + "__label" }) : computedShared(form, repEl("label"));
      content = <><Line label="Typed text" fg={s.color} bgs={bg} min={4.5} /><Line label="Placeholder" fg={s.ph} bgs={bg} min={3} /><Line label="Label on form" fg={lab.color} bgs={[card]} min={4.5} />{note}</>;
    } else content = <Line label="Text on form" fg={s.color} bgs={[card]} min={4.5} />;
  }
  return content ? <div className="contrast" aria-live="polite">{content}</div> : null;
}

// ---------------------------------------------------------------- shadows, artwork and swatches
export function GrpShadow({ path, value }: { path: string; value: unknown }) {
  const v = obj(value);
  return (
    <>
      <CTog label="Show a shadow" path={`${path}.on`} value={v.on === true} />
      {v.on === true && (
        <>
          <div className="cg">
            <CNum label="Across" path={`${path}.x`} value={v.x ?? 0} min={-40} max={40} unit="px" />
            <CNum label="Down" path={`${path}.y`} value={v.y ?? 4} min={-40} max={40} unit="px" />
            <CNum label="Blur" path={`${path}.blur`} value={v.blur ?? 14} min={0} max={80} unit="px" />
          </div>
          <CColor label="Shadow colour" path={`${path}.color`} value={v.color ?? "#00000033"} />
        </>
      )}
    </>
  );
}

/** Full styling for an artwork block. `base` is its path prefix: ha, fa.<id> or oa.<id>.<n>. */
export function ArtStyle({ base, a, onReplace, onRemove }: { base: string; a: ArtSettings; onReplace: (path: string, name: string) => void; onRemove: () => void }) {
  const { upload, assetBase } = useDesign();
  const beside = a.pos === "left" || a.pos === "right";
  return (
    <>
      <Sub k="aimg" title="Image">
        <ArtUploader art={a} assetBase={assetBase} upload={upload} compact onUploaded={onReplace} onRemove={onRemove} />
        <CText label="Description for screen readers (alt text)" path={`${base}.alt`} value={a.alt} placeholder="e.g. Harbourfront Food Fest logo" />
      </Sub>
      <Sub k="asize" title="Size">
        <div className="cg">
          <CNum label="Width" path={`${base}.w`} value={a.w} min={1} max={a.wUnit === "%" ? 100 : 2000} />
          <CSel label="Unit" path={`${base}.wUnit`} value={a.wUnit} options={[["px", "px"], ["%", "% of space"]]} />
        </div>
        <CTog label="Keep the original proportions" path={`${base}.keep`} value={a.keep} />
        {!a.keep && (
          <div className="cg">
            <CNum label="Height" path={`${base}.h`} value={a.h} min={10} max={2000} unit="px" />
            <CSel label="Fit" path={`${base}.fit`} value={a.fit} options={[["contain", "Fit inside"], ["cover", "Fill and crop"], ["fill", "Stretch"]]} />
          </div>
        )}
        <div className="cg">
          <CNum label="Minimum width" path={`${base}.minW`} value={a.minW} min={0} max={2000} unit="px" />
          <CNum label="Maximum width" path={`${base}.maxW`} value={a.maxW} min={0} max={4000} unit="px" />
          <CNum label="Maximum height" path={`${base}.maxH`} value={a.maxH} min={0} max={4000} unit="px" />
        </div>
        <p className="hint">0 means no limit. You can also drag the blue handle on the selected artwork in the preview.</p>
      </Sub>
      <Sub k="aplace" title="Position and spacing">
        <CSeg label="Position" path={`${base}.pos`} value={a.pos} options={[["above", "Above text"], ["below", "Below text"], ["left", "Left of text"], ["right", "Right of text"], ...(base === "ha" ? [["title", "Instead of title"] as [string, string]] : [])]} />
        <CSeg label="Horizontal alignment" path={`${base}.align`} value={a.align} options={[["left", "Left"], ["center", "Centre"], ["right", "Right"]]} />
        {beside && <CSeg label="Vertical alignment" path={`${base}.valign`} value={a.valign} options={[["top", "Top"], ["center", "Middle"], ["bottom", "Bottom"]]} />}
        <CBox label="Padding" path={`${base}.pad`} value={a.pad} />
        <CBox label="Margin" path={`${base}.mar`} value={a.mar} />
        {beside && <p className="hint">On narrow screens, artwork beside the text moves above it automatically.</p>}
      </Sub>
      <Sub k="alook" title="Border and look">
        <CColor label="Background" path={`${base}.bg`} value={a.bg} clear />
        <div className="cg">
          <CNum label="Border width" path={`${base}.bw`} value={a.bw} min={0} max={20} unit="px" />
          <CNum label="Corner radius" path={`${base}.br`} value={a.br} min={0} max={999} unit="px" />
        </div>
        {a.bw > 0 && <CColor label="Border colour" path={`${base}.bc`} value={a.bc} />}
        <CNum label="Opacity" path={`${base}.op`} value={a.op} min={0} max={100} unit="%" />
      </Sub>
      <Sub k="ashadow" title="Shadow"><GrpShadow path={`${base}.shadow`} value={a.shadow} /></Sub>
    </>
  );
}

/** Colour swatch row: the colours themselves plus their look. `base` is fs.<id> or os.<id>.<n>. */
export function SwatchStyle({ base, s, onChange, onRemove }: { base: string; s: SwatchSettings; onChange: (s: SwatchSettings) => void; onRemove: () => void }) {
  return (
    <>
      <Sub k="switems" title="Colours"><SwatchEditor value={s} onChange={onChange} onRemoveAll={onRemove} /></Sub>
      <Sub k="swlook" title="Shape and border">
        <CTog label="Keep swatches round" path={`${base}.round`} value={s.round} />
        {!s.round && <CNum label="Corner radius" path={`${base}.br`} value={s.br} min={0} max={48} unit="px" />}
        <div className="cg">
          <CNum label="Swatch size" path={`${base}.size`} value={s.size} min={12} max={96} unit="px" />
          <CNum label="Border width" path={`${base}.bw`} value={s.bw} min={0} max={8} unit="px" />
        </div>
        {s.bw > 0 && <CColor label="Border colour" path={`${base}.bc`} value={s.bc} />}
        <CColor label="Selected outline" path={`${base}.ring`} value={s.ring} />
        <CNum label="Outline width" path={`${base}.ringW`} value={s.ringW} min={1} max={8} unit="px" />
      </Sub>
      <Sub k="swplace" title="Layout and spacing">
        <CSeg label="Alignment" path={`${base}.align`} value={s.align} options={[["left", "Left"], ["center", "Centre"], ["right", "Right"]]} />
        <div className="cg">
          <CNum label="Space between" path={`${base}.gap`} value={s.gap} min={0} max={48} unit="px" />
          <CNum label="Space above" path={`${base}.mar.t`} value={s.mar.t} min={-20} max={80} unit="px" />
          <CNum label="Space below" path={`${base}.mar.b`} value={s.mar.b} min={-20} max={80} unit="px" />
        </div>
      </Sub>
    </>
  );
}
