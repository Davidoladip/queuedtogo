"use client";
/* eslint-disable @next/next/no-img-element -- previews of uploaded artwork */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { themeFromPalette } from "@/lib/design/color";
import {
  FONTS, FONT_STACKS, KIND_PLURAL, LAYOUTS, SHAPES, SHARED_KINDS, computed, computedShared, elementsOf, repEl, srcOf,
  type FormModel,
} from "@/lib/design/engine";
import { processImage } from "@/lib/design/image";
import { fieldIdOf } from "../QuestionsPanel";
import { CColor, CSeg, CTex, CText, CTog, Sub } from "./controls";
import { useDesign } from "./context";
import { ColorPicker } from "./ColorPicker";
import { Contrast, GrpBorder, GrpText, ImageStyle, StyleBody, posName, posOptions } from "./groups";

const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

function Dots({ list, onRemove }: { list: string[]; onRemove?: (c: string) => void }) {
  const { notify } = useDesign();
  const copy = (c: string) => void navigator.clipboard?.writeText(c).then(() => notify(`Copied ${c}.`), () => notify("Copying isn't allowed in this browser."));
  return (
    <>
      {list.map((c) =>
        onRemove ? (
          <span key={c} className="dotwrap">
            <button type="button" className="dot-c" style={{ "--sw": c } as React.CSSProperties} title={c} aria-label={`Copy ${c}`} onClick={() => copy(c)} />
            <button type="button" className="x" aria-label={`Remove ${c} from brand colours`} onClick={() => onRemove(c)}>×</button>
          </span>
        ) : (
          <button key={c} type="button" className="dot-c" style={{ "--sw": c } as React.CSSProperties} title={c} aria-label={`Copy ${c}`} onClick={() => copy(c)} />
        ),
      )}
    </>
  );
}

function useFilePick(onFile: (f: File) => Promise<void> | void) {
  const ref = useRef<HTMLInputElement>(null);
  const input = <input ref={ref} type="file" hidden accept={ACCEPT} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onFile(f); }} />;
  return { input, open: () => ref.current?.click() };
}

function DropArea({ className, onFile, children }: { className: string; onFile: (f: File) => void; children: ReactNode }) {
  const [over, setOver] = useState(false);
  return (
    <div className={`${className}${over ? " over" : ""}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- Global theme
export function SecTheme() {
  const { form, update, upload, assetBase, notify } = useDesign();
  const [busy, setBusy] = useState(false);
  const t = form.design.theme, art = srcOf(form.design.art, assetBase);
  async function onArt(file: File) {
    setBusy(true);
    try {
      const p = await processImage(file, 1800);
      const { path } = await upload(p);
      update((d) => { d.design.art = { path }; d.design.palette = p.palette; });
    } catch (ex) { notify((ex as Error).message); } finally { setBusy(false); }
  }
  const pick = useFilePick(onArt);
  return (
    <>
      <DropArea className="artbox" onFile={(f) => void onArt(f)}>
        <div className="th">{art ? <img src={art} alt="" /> : "None yet"}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
          <button type="button" className="btn small primary" disabled={busy} onClick={pick.open}>{busy ? "Uploading…" : art ? "Replace event artwork" : "Upload event artwork"}</button>
          {pick.input}
          {art && <button type="button" className="linkbtn" style={{ fontSize: 13 }} onClick={() => update((d) => { d.design.art = null; d.design.palette = []; })}>Remove</button>}
          <span className="hint">Drop an image here or choose a file. PNG, JPG, SVG or WebP. Wide images work best.</span>
        </div>
      </DropArea>
      {art && (
        <>
          <div className="c">
            <span className="cl">Colours found in your artwork · click to copy</span>
            <div className="dotrow">{form.design.palette.length ? <Dots list={form.design.palette} /> : <span className="hint">No colours found.</span>}</div>
          </div>
          {form.design.palette.length > 0 && (
            <button type="button" className="btn small" style={{ alignSelf: "flex-start" }} onClick={() => {
              const th = themeFromPalette(form.design.palette);
              if (th) update((d) => { Object.assign(d.design.theme, th); });
            }}>Match form colours to artwork</button>
          )}
        </>
      )}
      <CSeg label="Layout" path="th.layout" value={t.layout} options={Object.entries(LAYOUTS) as [string, string][]} />
      <CColor label="Page" path="th.page" value={t.page} />
      <CColor label="Form" path="th.card" value={t.card} />
      <CColor label="Text" path="th.text" value={t.text} />
      <CColor label="Buttons" path="th.accent" value={t.accent} />
      <CColor label="Button text" path="th.accentText" value={t.accentText} />
      <Contrast form={form} el="theme" />
      <p className="hint">These colours are the defaults for every element. Styles you set on single elements, or on all buttons or inputs, take priority.</p>
    </>
  );
}

// ---------------------------------------------------------------- Individual element
export function SecElement() {
  const { form, selected, setSelected, scope, setScope, update, setPs } = useDesign();
  const els = elementsOf(form);
  const el = selected ? els.find((e) => e.sid === selected) : null;
  const picker = (
    <label className="c">
      <span className="cl">Element</span>
      <select value={el ? el.sid : ""} onChange={(e) => { setSelected(e.target.value || null); setPs({ ctx: "", state: "default" }); }}>
        <option value="">Choose an element to style…</option>
        {els.map((e) => <option key={e.sid} value={e.sid}>{e.name}</option>)}
      </select>
    </label>
  );
  if (!el) return <>{picker}<p className="hint">Click any element in the preview, such as a button, an input box, a label or a picture, or choose one above. Its own style controls appear here.</p></>;
  const head = <div className="elhead"><b>{el.name}</b><code>Element ID: {el.sid}</code></div>;
  if (el.kind === "image" && el.f) return <>{picker}{head}<ImageStyle f={el.f} /></>;

  const isShared = (SHARED_KINDS as readonly string[]).includes(el.kind);
  const sc = isShared && scope === "g" ? "g" : "el";
  const pf = sc === "el" ? `e.${el.sid}` : `g.${el.kind}`;
  const s = sc === "el" ? computed(form, el) : computedShared(form, el);
  const own = Object.keys(form.design.el[el.sid] || {}).length > 0;
  const ch = el.f && (el.f.type === "choice" || el.f.type === "multi");
  return (
    <>
      {picker}{head}
      {el.part && el.f && (
        <div className="seg sm" role="group" aria-label="Part to style">
          {([[el.f.id, ch ? "Options" : "Input box"], [el.f.id + "__label", "Label"]] as [string, string][]).map(([sid, l]) => (
            <button key={sid} type="button" aria-pressed={selected === sid} onClick={() => setSelected(sid)}>{l}</button>
          ))}
        </div>
      )}
      {isShared && (
        <div className="seg sm" role="group" aria-label="Apply changes to">
          <button type="button" aria-pressed={sc === "el"} onClick={() => { setScope("el"); setPs({ ctx: "", state: "default" }); }}>This element only</button>
          <button type="button" aria-pressed={sc === "g"} onClick={() => { setScope("g"); setPs({ ctx: "", state: "default" }); }}>All {KIND_PLURAL[el.kind]}</button>
        </div>
      )}
      {sc === "el" ? (
        <div className="notebox">
          {own ? <>This element has its own styles. <button type="button" className="linkbtn" onClick={() => update((d) => { delete d.design.el[el.sid]; })}>Reset it to the shared style</button></> : "Changes apply to this element only."}
        </div>
      ) : (
        <div className="notebox">Changes apply to all {KIND_PLURAL[el.kind]}, except settings an element has changed for itself.{own ? " This element has its own styles, and those win." : ""}</div>
      )}
      <StyleBody el={el} pf={pf} s={s} ctx="e" />
      <Contrast form={form} el={el} scope={sc} />
    </>
  );
}

// ---------------------------------------------------------------- Typography
export function SecType() {
  const { form, apply } = useDesign();
  const t = form.design.theme;
  return (
    <>
      <div className="c">
        <span className="cl">Form font style</span>
        <div className="fontpick">
          {Object.entries(FONTS).map(([k, f]) => (
            <button key={k} type="button" aria-pressed={t.font === k} onClick={() => apply("th.font", k)}>
              <b style={{ fontFamily: FONT_STACKS[f.head], textTransform: f.upper ? "uppercase" : undefined }}>Aa</b><span>{f.label}</span>
            </button>
          ))}
        </div>
      </div>
      <Sub k="tlabel" title="All question labels"><GrpText pf="g.label" s={computedShared(form, repEl("label"))} /><Contrast form={form} el={repEl("label")} /></Sub>
      <Sub k="thead" title="All headings (title and section headings)"><GrpText pf="g.heading" s={computedShared(form, repEl("heading"))} /><Contrast form={form} el={repEl("heading")} /></Sub>
      <Sub k="ttext" title="All text blocks (intro and text)"><GrpText pf="g.text" s={computedShared(form, repEl("text"))} /></Sub>
    </>
  );
}

function Chips({ kinds }: { kinds: string[] }) {
  const { form, setSelected, toggle, setScope } = useDesign();
  return (
    <div className="chiprow">
      {elementsOf(form).filter((e) => kinds.includes(e.kind)).map((e) => (
        <button key={e.sid} type="button" className="chipbtn" onClick={() => { setSelected(e.sid); setScope("el"); toggle("element", true); }}>{e.name}</button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Buttons
export function SecButtons() {
  const { form } = useDesign();
  const rep = repEl("button");
  return (
    <>
      <CText label="Submit button text" path="ev.submitLabel" value={form.submitLabel} />
      <p className="hint">Style one button on its own:</p>
      <Chips kinds={["button"]} />
      <div className="notebox">The settings below apply to every button: Submit, Next, Back and link buttons. A button you style on its own keeps its own settings.</div>
      <StyleBody el={rep} pf="g.button" s={computedShared(form, rep)} ctx="g.button" />
      <Contrast form={form} el={rep} />
    </>
  );
}

// ---------------------------------------------------------------- Inputs
export function SecInputs() {
  const { form } = useDesign();
  const ri = repEl("input"), rc = repEl("choice");
  return (
    <>
      <p className="hint">Style one field on its own:</p>
      <Chips kinds={["input", "choice"]} />
      <div className="notebox">These settings apply to every text box, email, phone, number, date, dropdown, size and upload field.</div>
      <StyleBody el={ri} pf="g.input" s={computedShared(form, ri)} ctx="g.input" />
      <Contrast form={form} el={ri} />
      <Sub k="choicesh" title="Choice, radio and checkbox options" defaultOpen={false}>
        <StyleBody el={rc} pf="g.choice" s={computedShared(form, rc)} ctx="g.choice" />
        <Contrast form={form} el={rc} />
      </Sub>
    </>
  );
}

// ---------------------------------------------------------------- Colours and brand palette
export function SecColors() {
  const { form, brand, setBrand, canEditBrand, recent, clearRecent, notify } = useDesign();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const T = form.design.theme;
  const save = async (list: string[], msg: string) => { const err = await setBrand(list); notify(err ?? msg); };
  return (
    <>
      <div className="c">
        <span className="cl">Brand colours · click to copy{canEditBrand ? ", hover to remove" : ""}</span>
        <div className="dotrow">
          <Dots list={brand} onRemove={canEditBrand ? (c) => void save(brand.filter((x) => x !== c), `${c} removed from brand colours.`) : undefined} />
          {canEditBrand && <button type="button" className="dot-add" title="Add a brand colour" aria-label="Add a brand colour" onClick={(e) => setAnchor(e.currentTarget)}>+</button>}
        </div>
        <span className="hint">{canEditBrand ? "Brand colours are shared by all your business's forms and appear in every colour picker." : "Brand colours are shared by all your business's forms. Only owners and admins can change them."}</span>
        {anchor && <ColorPicker anchor={anchor} value={T.accent} label="New brand colour" addBrand onChange={() => {}} onClose={() => setAnchor(null)} />}
      </div>
      <div className="c">
        <span className="cl">Recently used</span>
        <div className="dotrow">
          {recent.length ? <><Dots list={recent} /><button type="button" className="linkbtn" style={{ fontSize: 12.5 }} onClick={clearRecent}>Clear</button></> : <span className="hint">Colours you pick appear here.</span>}
        </div>
      </div>
      <div className="c"><span className="cl">This form&apos;s theme</span><div className="dotrow"><Dots list={[T.page, T.card, T.text, T.accent, T.accentText]} /></div></div>
      {form.design.palette.length > 0 && (
        <div className="c">
          <span className="cl">From the event artwork</span>
          <div className="dotrow">
            <Dots list={form.design.palette} />
            {canEditBrand && <button type="button" className="linkbtn" style={{ fontSize: 12.5 }} onClick={() => void save([...brand, ...form.design.palette.filter((c) => !brand.includes(c))].slice(-18), "Artwork colours saved to your brand colours.")}>Save all to brand colours</button>}
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Borders and corners
export function SecBorders() {
  const { form, apply } = useDesign();
  return (
    <>
      <div className="c">
        <span className="cl">Corner style for the whole form</span>
        <div className="seg sm">
          {SHAPES.map(([k, l]) => <button key={k} type="button" aria-pressed={form.design.theme.radius === k} onClick={() => apply("th.radius", k)}>{l}</button>)}
        </div>
        <span className="hint">Sets the corners of every button, input and option. Elements with their own corners keep them.</span>
      </div>
      <Sub k="bbtn" title="Button borders"><GrpBorder pf="g.button" s={computedShared(form, repEl("button"))} /></Sub>
      <Sub k="binp" title="Input borders"><GrpBorder pf="g.input" s={computedShared(form, repEl("input"))} /></Sub>
    </>
  );
}

// ---------------------------------------------------------------- Backgrounds and textures
export function SecBgs() {
  const { form, assetBase } = useDesign();
  const T = form.design.theme;
  return (
    <>
      <Sub k="bpage" title="Page background">
        <CColor label="Page colour" path="th.page" value={T.page} />
        <CTex path="pg" value={form.design.page} base={T.page} />
        {T.layout === "background" && srcOf(form.design.art, assetBase) && <p className="hint">The event artwork covers the page in the Full background layout, so a page texture shows only without artwork.</p>}
      </Sub>
      <Sub k="bcard" title="Form background">
        <CColor label="Form colour" path="th.card" value={T.card} />
        <CTex path="cd" value={form.design.card} base={T.card} />
      </Sub>
      <p className="hint">To give a single button or input a texture or image, select it and use its Background and texture settings.</p>
    </>
  );
}

// ---------------------------------------------------------------- Artwork and images
export function SecArtwork() {
  const { form, selected, setSelected, update, assetBase, insertArtwork, toggle } = useDesign();
  const imgs = form.fields.filter((f) => f.type === "image");
  const pi = form.fields.findIndex((f) => f.id === fieldIdOf(form, selected));
  const def = pi >= 0 ? pi + 1 : form.fields.findIndex((f) => f.type === "submit");
  const [pos, setPos] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const at = pos ?? def;
  const add = async (f: File) => { setBusy(true); try { await insertArtwork(f, at); } finally { setBusy(false); } };
  const pick = useFilePick(add);
  const move = (id: string, dir: -1 | 1) => update((d) => {
    const i = d.fields.findIndex((x) => x.id === id), j = i + dir;
    if (j < 0 || j >= d.fields.length) return;
    [d.fields[i], d.fields[j]] = [d.fields[j], d.fields[i]];
  });
  return (
    <>
      <label className="c">
        <span className="cl">Place new artwork</span>
        <select value={at} onChange={(e) => setPos(Number(e.target.value))}>
          {posOptions(form, null).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <DropArea className="dropzone" onFile={(f) => void add(f)}>
        <span>Drop an image here</span>
        <button type="button" className="btn small primary" disabled={busy} onClick={pick.open}>{busy ? "Uploading…" : "Choose an image"}</button>
        {pick.input}
        <span className="hint">PNG, JPG, SVG or WebP, up to 10 MB (SVG up to 1 MB).</span>
      </DropArea>
      <p className="hint">You can also hover between questions in the preview and click “+ Artwork”, or drop an image straight onto the preview.</p>
      {imgs.length ? (
        <div className="artlist">
          {imgs.map((f) => {
            const i = form.fields.indexOf(f), prev = form.fields[i - 1], src = srcOf(f.config.img?.src, assetBase);
            return (
              <div key={f.id} className={`artrow${selected === f.id ? " on" : ""}`}>
                {src ? <img src={src} alt="" /> : <span className="blk-th" style={{ width: 44, height: 44 }} />}
                <div style={{ minWidth: 0 }}>
                  <div className="nm">{f.config.img?.alt || f.config.img?.name || "Artwork"}</div>
                  <div className="ps">{prev ? "After " + posName(prev) : "Beginning of the form"}</div>
                </div>
                <div className="ac">
                  <button type="button" title="Edit" aria-label="Edit artwork" onClick={() => { setSelected(f.id); toggle("element", true); }}>✎</button>
                  <button type="button" title="Move up" aria-label="Move up" disabled={i === 0} onClick={() => move(f.id, -1)}>↑</button>
                  <button type="button" title="Move down" aria-label="Move down" disabled={i === form.fields.length - 1} onClick={() => move(f.id, 1)}>↓</button>
                  <button type="button" title="Duplicate" aria-label="Duplicate" onClick={() => update((d) => { const k = d.fields.findIndex((x) => x.id === f.id); d.fields.splice(k + 1, 0, { ...structuredClone(f), id: crypto.randomUUID() }); })}>⧉</button>
                  <button type="button" title="Delete" aria-label="Delete" onClick={() => { update((d) => { d.fields = d.fields.filter((x) => x.id !== f.id); }); if (selected === f.id) setSelected(null); }}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : <p className="hint">No artwork blocks in this form yet.</p>}
    </>
  );
}

// ---------------------------------------------------------------- Advanced
export function SecAdv() {
  const { form, update, otherForms, copyDesignFrom, notify } = useDesign();
  const [from, setFrom] = useState(otherForms[0]?.id ?? "");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 5000);
    return () => clearTimeout(id);
  }, [confirming]);
  return (
    <>
      <CTog label="Disable Next and Submit until required questions are answered" path="adv.disableUntilValid" value={form.design.adv.disableUntilValid} />
      <CTog label="Show progress bar on forms with page breaks" path="adv.progress" value={form.design.adv.progress} />
      {otherForms.length > 0 && (
        <div className="c">
          <span className="cl">Copy the design from another form</span>
          <div className="ci2" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
            <select aria-label="Form to copy from" value={from} onChange={(e) => setFrom(e.target.value)}>
              {otherForms.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
            </select>
            <button type="button" className="btn small" disabled={busy || !from} onClick={async () => {
              setBusy(true);
              const err = await copyDesignFrom(from);
              setBusy(false);
              notify(err ?? "Design copied. You can undo this.");
            }}>{busy ? "Copying…" : "Copy"}</button>
          </div>
          <span className="hint">Copies colours, fonts, textures, shared styles and the Submit, Next and Back button styles. Questions and artwork stay as they are.</span>
        </div>
      )}
      <div className="c">
        <span className="cl">Start over</span>
        <button type="button" className="btn small danger" style={{ alignSelf: "flex-start" }} onClick={() => {
          if (!confirming) { setConfirming(true); return; }
          setConfirming(false);
          update((d) => resetAllStyles(d));
          notify("All custom styles removed. You can undo this.");
        }}>{confirming ? "Click again to remove all custom styles" : "Reset all element styles"}</button>
        <span className="hint">Removes per-element and shared styles and textures. You can undo this.</span>
      </div>
    </>
  );
}

export function resetAllStyles(d: FormModel) {
  d.design.el = {};
  for (const k of SHARED_KINDS) d.design.shared[k] = {};
  d.design.page = { tex: "none", texColor: "#FFFFFF", texOp: 12, texScale: 18 };
  d.design.card = { tex: "none", texColor: d.design.theme.text, texOp: 6, texScale: 14 };
}

export const SECTIONS: [string, string, () => ReactNode][] = [
  ["theme", "Global theme", SecTheme],
  ["element", "Individual element styles", SecElement],
  ["type", "Typography", SecType],
  ["buttons", "Buttons", SecButtons],
  ["inputs", "Text boxes and input fields", SecInputs],
  ["colors", "Colours and brand palette", SecColors],
  ["borders", "Borders and corners", SecBorders],
  ["bgs", "Backgrounds and textures", SecBgs],
  ["artwork", "Artwork and images", SecArtwork],
  ["adv", "Advanced settings", SecAdv],
];
