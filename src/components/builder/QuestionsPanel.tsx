"use client";
/* eslint-disable @next/next/no-img-element -- artwork sizing is controlled by the form design CSS, not next/image */

import { useState } from "react";
import { BLOCKS, IMG_DEFAULT, LOCKABLE, baseFieldId, blankField, hasChoiceOptions, hasOptions, isInput, newId, srcOf, supportsMedia, type FieldType, type FormField, type FormModel } from "@/lib/design/engine";
import { artDefaultFor, emptyMeta, type OptionMeta } from "@/lib/design/media";
import { ArtQuick, ArtUploader, SwatchEditor, newSwatches } from "./media-controls";
import { processImage } from "@/lib/design/image";
import { NumberInput, Seg, TextInput, Toggle } from "./controls";
import type { Update, Upload } from "./Builder";

type Props = {
  form: FormModel; update: Update; selected: string | null; setSelected: (s: string | null) => void; upload: Upload; assetBase: string;
  /** Switch to the Design tab with this element selected. */
  openDesign: (sid: string) => void;
};

const ADDABLE = (Object.keys(BLOCKS) as FieldType[]).filter((t) => t !== "submit");

/** The field a preview element belongs to ("abc__label" → "abc", "__submit" → the submit block). */
export function fieldIdOf(form: FormModel, sid: string | null): string | null {
  if (!sid) return null;
  if (sid === "__submit") return form.fields.find((f) => f.type === "submit")?.id ?? null;
  if (sid.startsWith("__")) return null;
  return baseFieldId(sid);
}

export function QuestionsPanel({ form, update, selected, setSelected, upload, assetBase, openDesign }: Props) {
  const openId = fieldIdOf(form, selected);
  const [addType, setAddType] = useState<FieldType>("short");

  const patch = (id: string, fn: (f: FormField) => void, key?: string) =>
    update((d) => { const f = d.fields.find((x) => x.id === id); if (f) fn(f); }, key ? { coalesce: `${id}:${key}` } : undefined);

  function move(i: number, dir: -1 | 1) {
    update((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.fields.length) return;
      [d.fields[i], d.fields[j]] = [d.fields[j], d.fields[i]];
    });
  }
  function add() {
    const f = blankField(addType);
    update((d) => {
      const sub = d.fields.findIndex((x) => x.type === "submit");
      let idx = openId ? d.fields.findIndex((x) => x.id === openId) + 1 : sub;
      if (openId && d.fields[idx - 1]?.type === "submit") idx = sub;
      if (idx < 0) idx = d.fields.length;
      d.fields.splice(idx, 0, f);
    });
    setSelected(f.id);
  }

  return (
    <div className="stack">
      <details className="b-card" open={selected === "__title" || selected === "__intro" || selected === "__hart" || undefined}>
        <summary>Form heading</summary>
        <div className="form">
          <TextInput label="Title" value={form.title} maxLength={140} onChange={(v) => update((d) => { d.title = v; }, { coalesce: "title" })} />
          <TextInput label="Intro" multiline value={form.intro} maxLength={2000} placeholder="A sentence or two about what customers can order." onChange={(v) => update((d) => { d.intro = v; }, { coalesce: "intro" })} />
          <span className="b-label">Heading artwork (logo, illustration or banner)</span>
          <ArtUploader art={form.design.headArt} assetBase={assetBase} upload={upload} label="heading artwork"
            onUploaded={(path, name) => update((d) => { d.design.headArt = { ...(d.design.headArt ?? artDefaultFor("head")), src: { path }, name }; })}
            onRemove={() => update((d) => { d.design.headArt = null; })} />
          {form.design.headArt && (
            <>
              <ArtQuick asTitle art={form.design.headArt} set={(k, v) => update((d) => { if (d.design.headArt) (d.design.headArt as Record<string, unknown>)[k] = v; }, { coalesce: "hart:" + k })} />
              <button type="button" className="linkbtn" style={{ alignSelf: "flex-start" }} onClick={() => openDesign("__hart")}>More artwork styling in Design →</button>
            </>
          )}
        </div>
      </details>

      <ol className="b-rows">
        {form.fields.map((f, i) => {
          const open = f.id === openId;
          const isSubmit = f.type === "submit";
          return (
            <li key={f.id} className={`b-row${open ? " open" : ""}`}>
              <div className="b-row-head">
                <button type="button" className="b-row-main" aria-expanded={open} onClick={() => setSelected(open ? null : f.type === "submit" ? "__submit" : f.id)}>
                  <span className="b-k" aria-hidden="true">{BLOCKS[f.type].k}</span>
                  <span className="b-row-label">{rowLabel(form, f)}{f.required && <span className="b-req"> *</span>}</span>
                  <span className="b-row-type">{BLOCKS[f.type].name}</span>
                </button>
                {!isSubmit && (
                  <span className="b-row-tools">
                    <button type="button" className="b-icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                    <button type="button" className="b-icon" aria-label="Move down" disabled={i === form.fields.length - 1} onClick={() => move(i, 1)}>↓</button>
                  </span>
                )}
              </div>
              {open && (
                <div className="b-row-body form">
                  <FieldEditor form={form} f={f} patch={patch} update={update} upload={upload} assetBase={assetBase} openDesign={openDesign} />
                  {!isSubmit && (
                    <div className="b-row-actions">
                      <button type="button" className="btn small" onClick={() => { const copy = { ...structuredClone(f), id: newId() }; update((d) => { d.fields.splice(i + 1, 0, copy); }); setSelected(copy.id); }}>Duplicate</button>
                      <button type="button" className="btn small danger" onClick={() => { update((d) => { d.fields = d.fields.filter((x) => x.id !== f.id); }); setSelected(null); }}>Delete block</button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="b-add">
        <label htmlFor="b-add-type" className="b-label">Add a block{openId ? " below the open one" : ""}</label>
        <div className="b-add-row">
          <select id="b-add-type" value={addType} onChange={(e) => setAddType(e.target.value as FieldType)}>
            {ADDABLE.map((t) => <option key={t} value={t}>{BLOCKS[t].k}  {BLOCKS[t].name}</option>)}
          </select>
          <button type="button" className="btn primary" onClick={add}>Add</button>
        </div>
      </div>
    </div>
  );
}

function rowLabel(form: FormModel, f: FormField) {
  if (f.type === "submit") return form.submitLabel || "Submit";
  if (f.type === "page") return `Page break · ${f.config.next || "Next"}`;
  if (f.type === "image") return f.config.img?.alt || f.config.img?.name || "Artwork";
  if (f.type === "divider") return "—";
  return f.label || "Untitled";
}

type Patch = (id: string, fn: (f: FormField) => void, key?: string) => void;

function FieldEditor({ form, f, patch, update, upload, assetBase, openDesign }: {
  form: FormModel; f: FormField; patch: Patch; update: Update; upload: Upload; assetBase: string; openDesign: (sid: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (f.type === "submit") {
    return (
      <>
        <TextInput label="Button text" value={form.submitLabel} maxLength={60} onChange={(v) => update((d) => { d.submitLabel = v; }, { coalesce: "submit" })} />
        <p className="muted b-note">Style the button in the Design tab. The consent checkbox above it is set in Settings.</p>
      </>
    );
  }
  if (f.type === "divider") return <p className="muted b-note">A line between sections. Style it in the Design tab.</p>;
  if (f.type === "page") {
    return (
      <>
        <p className="muted b-note">Everything below this block appears on the next page.</p>
        <div className="row">
          <TextInput label="Next button" value={f.config.next ?? "Next"} maxLength={40} onChange={(v) => patch(f.id, (x) => { x.config.next = v; }, "next")} />
          <TextInput label="Back button" value={f.config.prev ?? "Back"} maxLength={40} onChange={(v) => patch(f.id, (x) => { x.config.prev = v; }, "prev")} />
        </div>
      </>
    );
  }
  if (f.type === "image") {
    const img = { ...IMG_DEFAULT, ...f.config.img };
    const src = srcOf(img.src, assetBase);
    return (
      <>
        <div className="b-art">
          {src ? <img src={src} alt="" /> : <span className="muted">No image yet</span>}
          <label className="btn small">
            {busy ? "Uploading…" : src ? "Replace image" : "Choose image"}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden disabled={busy} onChange={async (e) => {
              const file = e.target.files?.[0]; e.target.value = "";
              if (!file) return;
              setErr(null); setBusy(true);
              try {
                const p = await processImage(file, 1400);
                const { path } = await upload(p);
                patch(f.id, (x) => { x.config.img = { ...IMG_DEFAULT, ...x.config.img, src: { path }, name: p.name, alt: x.config.img?.alt || "" }; });
              } catch (ex) { setErr((ex as Error).message); } finally { setBusy(false); }
            }} />
          </label>
        </div>
        {err && <div className="notice error" role="alert">{err}</div>}
        <TextInput label="Description for screen readers" value={img.alt} maxLength={200} placeholder="e.g. Sample of the embroidered logo" onChange={(v) => patch(f.id, (x) => { x.config.img = { ...IMG_DEFAULT, ...x.config.img, alt: v }; }, "alt")} />
        <NumberInput label="Width" value={Number(img.w)} min={10} max={100} suffix="%" onChange={(v) => patch(f.id, (x) => { x.config.img = { ...IMG_DEFAULT, ...x.config.img, w: v, wUnit: "%" }; }, "w")} />
        <NumberInput label="Corner rounding" value={Number(img.br)} min={0} max={60} suffix="px" onChange={(v) => patch(f.id, (x) => { x.config.img = { ...IMG_DEFAULT, ...x.config.img, br: v }; }, "br")} />
        <Seg label="Alignment" value={img.align as "left" | "center" | "right"} options={[["left", "Left"], ["center", "Centre"], ["right", "Right"]]} onChange={(v) => patch(f.id, (x) => { x.config.img = { ...IMG_DEFAULT, ...x.config.img, align: v }; })} />
        <TextInput label="Link (optional)" type="url" value={img.link} maxLength={500} placeholder="https://" onChange={(v) => patch(f.id, (x) => { x.config.img = { ...IMG_DEFAULT, ...x.config.img, link: v }; }, "link")} />
      </>
    );
  }

  const input = isInput(f.type);
  return (
    <>
      <TextInput label={f.type === "text" ? "Text" : f.type === "heading" ? "Heading" : f.type === "button" ? "Button text" : "Question"}
        multiline={f.type === "text"} value={f.label} maxLength={500} onChange={(v) => patch(f.id, (x) => { x.label = v; }, "label")} />
      {f.type === "button" && (
        <TextInput label="Opens this link" type="url" value={f.config.url ?? ""} maxLength={500} placeholder="https://" hint="Opens in a new tab. Only web, email and phone links work."
          onChange={(v) => patch(f.id, (x) => { x.config.url = v; }, "url")} />
      )}
      {input && (
        <>
          <TextInput label="Help text" value={f.help} maxLength={500} placeholder="Optional hint shown under the question" onChange={(v) => patch(f.id, (x) => { x.help = v; }, "help")} />
          {["short", "long", "email", "phone", "number"].includes(f.type) && (
            <TextInput label="Placeholder" value={f.placeholder} maxLength={200} onChange={(v) => patch(f.id, (x) => { x.placeholder = v; }, "ph")} />
          )}
          {hasOptions(f.type) && <OptionsEditor f={f} patch={patch} upload={upload} assetBase={assetBase} openDesign={openDesign} />}
          {(f.type === "choice" || f.type === "multi") && (
            <Seg label="Show options as" value={f.config.display === "list" ? "list" : "buttons"} options={[["buttons", "Buttons"], ["list", "List"]]}
              onChange={(v) => patch(f.id, (x) => { x.config.display = v; })} />
          )}
          <Toggle label="Required" checked={f.required} onChange={(v) => patch(f.id, (x) => { x.required = v; })} />
          {LOCKABLE.has(f.type) && (
            <>
              <Toggle label="Prefill and lock this answer" hint="Customers see the answer but can't change it, e.g. the event name or a fixed price." checked={f.config.locked === true}
                onChange={(v) => patch(f.id, (x) => { x.config.locked = v; })} />
              {f.config.locked && (
                <TextInput label="Locked answer" type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"} value={String(f.config.value ?? "")} maxLength={200}
                  onChange={(v) => patch(f.id, (x) => { x.config.value = v; }, "lockv")} />
              )}
            </>
          )}
          {f.type === "upload" && <p className="muted b-note">Customer file uploads are switched on with online ordering (next stage).</p>}
        </>
      )}
      {supportsMedia(f.type) && <QuestionMedia f={f} patch={patch} upload={upload} assetBase={assetBase} openDesign={openDesign} />}
    </>
  );
}

// ---------------------------------------------------------------- options (one row each)
function OptionsEditor({ f, patch, upload, assetBase, openDesign }: { f: FormField; patch: Patch; upload: Upload; assetBase: string; openDesign: (sid: string) => void }) {
  const [bulk, setBulk] = useState(false);
  const [openOpt, setOpenOpt] = useState<number | null>(null);
  const rich = hasChoiceOptions(f.type);
  const noun = f.type === "sizes" ? "size" : "option";
  /** Change the option list and keep each option's artwork, swatches and style attached to it. */
  const edit = (fn: (opts: string[], meta: OptionMeta[]) => void, key?: string) => patch(f.id, (x) => {
    const meta: OptionMeta[] = x.options.map((_, i) => x.config.optMeta?.[i] ?? emptyMeta());
    fn(x.options, meta);
    if (rich) x.config.optMeta = meta.slice(0, x.options.length); else delete x.config.optMeta;
  }, key);
  const move = (i: number, dir: -1 | 1) => edit((o, m) => {
    const j = i + dir;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]]; [m[i], m[j]] = [m[j], m[i]];
  });
  return (
    <div className="b-field">
      <div className="b-el-head">
        <span className="b-label">{f.type === "sizes" ? "Sizes" : "Options"}</span>
        <button type="button" className="linkbtn" onClick={() => setBulk(!bulk)}>{bulk ? "Edit one by one" : "Paste a list"}</button>
      </div>
      {bulk ? (
        <TextInput label={`${f.type === "sizes" ? "Sizes" : "Options"} (one per line)`} multiline value={f.options.join("\n")}
          hint="Options that keep the same wording keep their artwork, colours and style."
          onChange={(v) => edit((o, m) => {
            const next = v.split("\n").map((t) => t.slice(0, 200)).slice(0, 100);
            const byText = new Map(o.map((t, i) => [t.trim(), m[i]]));
            const nm = next.map((t) => byText.get(t.trim()) ?? emptyMeta());
            o.splice(0, o.length, ...next); m.splice(0, m.length, ...nm);
          }, "opts")} />
      ) : (
        <ol className="b-opt-list">
          {f.options.map((o, i) => {
            const m = f.config.optMeta?.[i];
            const extras = (m?.art ? 1 : 0) + (m?.swatches ? 1 : 0) + (m && Object.keys(m.style ?? {}).length ? 1 : 0);
            return (
              <li key={i} className={`b-opt${openOpt === i ? " open" : ""}`}>
                <div className="b-opt-row">
                  <input type="text" value={o} maxLength={200} aria-label={`${noun} ${i + 1}`} placeholder={`${noun[0].toUpperCase()}${noun.slice(1)} ${i + 1}`}
                    onChange={(e) => edit((opts) => { opts[i] = e.target.value; }, `opt${i}`)} />
                  {rich && (
                    <button type="button" className={`b-icon${extras ? " on" : ""}`} aria-expanded={openOpt === i} aria-label={`Artwork, colours and style for ${o || `option ${i + 1}`}`} title="Artwork, colours and style"
                      onClick={() => setOpenOpt(openOpt === i ? null : i)}>✦{extras ? <sup>{extras}</sup> : null}</button>
                  )}
                  <button type="button" className="b-icon" aria-label={`Move ${noun} ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button type="button" className="b-icon" aria-label={`Move ${noun} ${i + 1} down`} disabled={i === f.options.length - 1} onClick={() => move(i, 1)}>↓</button>
                  <button type="button" className="b-icon" aria-label={`Remove ${noun} ${i + 1}`} disabled={f.options.length <= 1} onClick={() => { edit((opts, meta) => { opts.splice(i, 1); meta.splice(i, 1); }); setOpenOpt(null); }}>✕</button>
                </div>
                {rich && openOpt === i && (
                  <div className="b-opt-body form">
                    <span className="b-label">Artwork for this option</span>
                    <ArtUploader art={m?.art} assetBase={assetBase} upload={upload} compact
                      onUploaded={(path, name) => edit((_, meta) => { meta[i] = { ...meta[i], art: { ...(meta[i].art ?? artDefaultFor("option")), src: { path }, name } }; })}
                      onRemove={() => edit((_, meta) => { meta[i] = { ...meta[i], art: null }; })} />
                    {m?.art && <ArtQuick art={m.art} set={(k, v) => edit((_, meta) => { const a = meta[i].art; if (a) meta[i] = { ...meta[i], art: { ...a, [k]: v } }; }, `oa${i}${k}`)} />}
                    <span className="b-label">Colour swatches under this option</span>
                    {m?.swatches ? (
                      <SwatchEditor value={m.swatches} onChange={(sw) => edit((_, meta) => { meta[i] = { ...meta[i], swatches: sw }; }, `os${i}`)}
                        onRemoveAll={() => edit((_, meta) => { meta[i] = { ...meta[i], swatches: null }; })} />
                    ) : (
                      <button type="button" className="btn small" style={{ alignSelf: "flex-start" }} onClick={() => edit((_, meta) => { meta[i] = { ...meta[i], swatches: newSwatches() }; })}>+ Add colour swatches</button>
                    )}
                    <button type="button" className="linkbtn" style={{ alignSelf: "flex-start" }} onClick={() => openDesign(`${f.id}__o${i}`)}>Style this option in Design →</button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {!bulk && (
        <button type="button" className="btn small" style={{ alignSelf: "flex-start" }} disabled={f.options.length >= 100}
          onClick={() => edit((o, m) => { o.push(`${noun[0].toUpperCase()}${noun.slice(1)} ${o.length + 1}`); m.push(emptyMeta()); })}>+ Add {noun}</button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- question artwork and swatches
function QuestionMedia({ f, patch, upload, assetBase, openDesign }: { f: FormField; patch: Patch; upload: Upload; assetBase: string; openDesign: (sid: string) => void }) {
  return (
    <>
      <details className="b-sub" open={!!f.config.art || undefined}>
        <summary>Artwork for this question{f.config.art ? " ✓" : ""}</summary>
        <div className="form">
          <ArtUploader art={f.config.art} assetBase={assetBase} upload={upload} compact
            onUploaded={(path, name) => patch(f.id, (x) => { x.config.art = { ...(x.config.art ?? artDefaultFor("field")), src: { path }, name }; })}
            onRemove={() => patch(f.id, (x) => { delete x.config.art; })} />
          {f.config.art && (
            <>
              <ArtQuick art={f.config.art} set={(k, v) => patch(f.id, (x) => { if (x.config.art) x.config.art = { ...x.config.art, [k]: v }; }, "fa" + k)} />
              <button type="button" className="linkbtn" style={{ alignSelf: "flex-start" }} onClick={() => openDesign(`${f.id}__art`)}>More artwork styling in Design →</button>
            </>
          )}
        </div>
      </details>
      <details className="b-sub" open={!!f.config.swatches || undefined}>
        <summary>Colour swatches under this question{f.config.swatches ? " ✓" : ""}</summary>
        <div className="form">
          {f.config.swatches ? (
            <SwatchEditor value={f.config.swatches} onChange={(sw) => patch(f.id, (x) => { x.config.swatches = sw; }, "fs")}
              onRemoveAll={() => patch(f.id, (x) => { delete x.config.swatches; })} />
          ) : (
            <button type="button" className="btn small" style={{ alignSelf: "flex-start" }} onClick={() => patch(f.id, (x) => { x.config.swatches = newSwatches(); })}>+ Add colour swatches</button>
          )}
        </div>
      </details>
    </>
  );
}
