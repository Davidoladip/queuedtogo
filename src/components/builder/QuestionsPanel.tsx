"use client";
/* eslint-disable @next/next/no-img-element -- artwork sizing is controlled by the form design CSS, not next/image */

import { useState } from "react";
import { BLOCKS, IMG_DEFAULT, LOCKABLE, baseFieldId, blankField, hasChoiceOptions, hasOptions, isInput, newId, srcOf, supportsMedia, type FieldType, type FormField, type FormModel } from "@/lib/design/engine";
import { artDefaultFor, emptyMeta, type OptionMeta } from "@/lib/design/media";
import { PARTY_LIMIT, RSVP_DEFAULT_OPTIONS, RSVP_DEFAULT_PARTY_LABEL } from "@/lib/rsvp";
import { DEFAULT_MAX_PER_ORDER, MAX_PER_ORDER_CAP, MAX_TICKET_QTY, PRICEABLE, fieldIsPaid, money, newTicketId, newTicketType, parsePrice, priceInput, type TicketType } from "@/lib/pricing";
import type { PaymentsStatus } from "@/lib/payments";

const RSVP_ANSWER_NAMES = ["Yes", "No", "Maybe"];
import { ArtQuick, ArtUploader, SwatchEditor, newSwatches } from "./media-controls";
import { processImage } from "@/lib/design/image";
import { NumberInput, Seg, TextInput, Toggle } from "./controls";
import type { Update, Upload } from "./Builder";

type Props = {
  form: FormModel; update: Update; selected: string | null; setSelected: (s: string | null) => void; upload: Upload; assetBase: string;
  /** Switch to the Design tab with this element selected. */
  openDesign: (sid: string) => void;
  /** Whether this business may sell (prices and the Tickets question appear only then). */
  payments: PaymentsStatus;
};

const ADDABLE = (Object.keys(BLOCKS) as FieldType[]).filter((t) => t !== "submit");

/** The field a preview element belongs to ("abc__label" → "abc", "__submit" → the submit block). */
export function fieldIdOf(form: FormModel, sid: string | null): string | null {
  if (!sid) return null;
  if (sid === "__submit") return form.fields.find((f) => f.type === "submit")?.id ?? null;
  if (sid.startsWith("__")) return null;
  return baseFieldId(sid);
}

export function QuestionsPanel({ form, update, selected, setSelected, upload, assetBase, openDesign, payments }: Props) {
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
                  <FieldEditor form={form} f={f} patch={patch} update={update} upload={upload} assetBase={assetBase} openDesign={openDesign} canPrice={payments.allowed} />
                  {!isSubmit && (
                    <div className="b-row-actions">
                      <button type="button" className="btn small" onClick={() => { const copy = { ...structuredClone(f), id: newId() }; if (copy.config.tickets) copy.config.tickets = copy.config.tickets.map((t) => ({ ...t, id: newTicketId() })); update((d) => { d.fields.splice(i + 1, 0, copy); }); setSelected(copy.id); }}>Duplicate</button>
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
            {ADDABLE.filter((t) => (t !== "rsvp" || !form.fields.some((x) => x.type === "rsvp")) && (t !== "tickets" || payments.allowed)).map((t) => <option key={t} value={t}>{BLOCKS[t].k}  {BLOCKS[t].name}</option>)}
          </select>
          <button type="button" className="btn primary" onClick={add}>Add</button>
        </div>
        {payments.allowed && !payments.ready && form.fields.some(fieldIsPaid) && (
          <p className="muted b-note">Forms with prices or tickets can be published once your payment account is approved on the Get paid page.</p>
        )}
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

function FieldEditor({ form, f, patch, update, upload, assetBase, openDesign, canPrice }: {
  form: FormModel; f: FormField; patch: Patch; update: Update; upload: Upload; assetBase: string; openDesign: (sid: string) => void; canPrice: boolean;
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
          {hasOptions(f.type) && <OptionsEditor f={f} patch={patch} upload={upload} assetBase={assetBase} openDesign={openDesign} canPrice={canPrice} />}
          {f.type === "rsvp" && (
            <>
              <NumberInput label="Most people per reply (including the guest)" value={f.config.partyMax ?? 1} min={1} max={PARTY_LIMIT}
                onChange={(v) => patch(f.id, (x) => { x.config.partyMax = v; }, "pmax")} />
              {(f.config.partyMax ?? 1) > 1 ? (
                <TextInput label="Guest count question" value={f.config.partyLabel ?? ""} maxLength={120} placeholder={RSVP_DEFAULT_PARTY_LABEL}
                  hint="Shown under the answers; hidden when a guest says no." onChange={(v) => patch(f.id, (x) => { x.config.partyLabel = v; }, "plab")} />
              ) : <p className="muted b-note">Set more than 1 to let guests bring plus-ones.</p>}
            </>
          )}
          {(f.type === "choice" || f.type === "multi") && (
            <Seg label="Show options as" value={f.config.display === "list" ? "list" : "buttons"} options={[["buttons", "Buttons"], ["list", "List"]]}
              onChange={(v) => patch(f.id, (x) => { x.config.display = v; })} />
          )}
          {f.type !== "rsvp" && <Toggle label="Required" checked={f.required} onChange={(v) => patch(f.id, (x) => { x.required = v; })} />}
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
type Aligned = { meta: OptionMeta[]; prices: number[]; tix: TicketType[] };

function OptionsEditor({ f, patch, upload, assetBase, openDesign, canPrice }: { f: FormField; patch: Patch; upload: Upload; assetBase: string; openDesign: (sid: string) => void; canPrice: boolean }) {
  const [bulk, setBulk] = useState(false);
  const [openOpt, setOpenOpt] = useState<number | null>(null);
  const [openTix, setOpenTix] = useState<number | null>(null);
  const rich = hasChoiceOptions(f.type);
  const fixed = f.type === "rsvp";
  const isTix = f.type === "tickets";
  // Prices show once the business may sell, or while a question still has prices (so they can be removed).
  const priced = isTix || (PRICEABLE.has(f.type) && (canPrice || (f.config.prices ?? []).some((p) => p > 0)));
  const noun = f.type === "sizes" ? "size" : isTix ? "ticket type" : "option";
  const Noun = noun[0].toUpperCase() + noun.slice(1);
  /** Change the option list and keep each option's artwork, swatches, style, price and ticket settings attached to it. */
  const edit = (fn: (opts: string[], a: Aligned) => void, key?: string) => patch(f.id, (x) => {
    const a: Aligned = {
      meta: x.options.map((_, i) => x.config.optMeta?.[i] ?? emptyMeta()),
      prices: x.options.map((_, i) => x.config.prices?.[i] ?? 0),
      tix: x.options.map((_, i) => x.config.tickets?.[i] ?? newTicketType()),
    };
    fn(x.options, a);
    const n = x.options.length;
    if (rich) x.config.optMeta = a.meta.slice(0, n); else delete x.config.optMeta;
    if (PRICEABLE.has(x.type) && a.prices.some((p) => p > 0)) x.config.prices = a.prices.slice(0, n); else delete x.config.prices;
    if (x.type === "tickets") x.config.tickets = a.tix.slice(0, n);
  }, key);
  const swap = <T,>(arr: T[], i: number, j: number) => { [arr[i], arr[j]] = [arr[j], arr[i]]; };
  const move = (i: number, dir: -1 | 1) => edit((o, a) => {
    const j = i + dir;
    if (j < 0 || j >= o.length) return;
    swap(o, i, j); swap(a.meta, i, j); swap(a.prices, i, j); swap(a.tix, i, j);
  });
  return (
    <div className="b-field">
      <div className="b-el-head">
        <span className="b-label">{f.type === "sizes" ? "Sizes" : fixed ? "Answers" : isTix ? "Ticket types" : "Options"}{priced && !isTix ? " and prices" : ""}</span>
        {!fixed && <button type="button" className="linkbtn" onClick={() => setBulk(!bulk)}>{bulk ? "Edit one by one" : "Paste a list"}</button>}
      </div>
      {bulk ? (
        <TextInput label={`${f.type === "sizes" ? "Sizes" : isTix ? "Ticket types" : "Options"} (one per line)`} multiline value={f.options.join("\n")}
          hint={isTix ? "Ticket types that keep the same name keep their price and limits." : "Options that keep the same wording keep their artwork, colours, style and price."}
          onChange={(v) => edit((o, a) => {
            const next = v.split("\n").map((t) => t.slice(0, 200)).slice(0, 100);
            const byText = new Map(o.map((t, i) => [t.trim(), i]));
            const at = (t: string) => byText.get(t.trim());
            const nm = next.map((t) => (at(t) != null ? a.meta[at(t)!] : emptyMeta()));
            const np = next.map((t) => (at(t) != null ? a.prices[at(t)!] : 0));
            const used = new Set<number>();
            const nt = next.map((t) => { const i = at(t); if (i != null && !used.has(i)) { used.add(i); return a.tix[i]; } return newTicketType(); });
            o.splice(0, o.length, ...next); a.meta.splice(0, a.meta.length, ...nm); a.prices.splice(0, a.prices.length, ...np); a.tix.splice(0, a.tix.length, ...nt);
          }, "opts")} />
      ) : (
        <ol className="b-opt-list">
          {f.options.map((o, i) => {
            const m = f.config.optMeta?.[i];
            const extras = (m?.art ? 1 : 0) + (m?.swatches ? 1 : 0) + (m && Object.keys(m.style ?? {}).length ? 1 : 0);
            return (
              <li key={i} className={`b-opt${openOpt === i ? " open" : ""}`}>
                <div className="b-opt-row">
                  {fixed && <span className="b-opt-key">{RSVP_ANSWER_NAMES[i]}</span>}
                  <input type="text" value={o} maxLength={200} aria-label={fixed ? `Wording for ${RSVP_ANSWER_NAMES[i]}` : `${noun} ${i + 1}`} placeholder={fixed ? (i === 2 ? "Leave empty to hide Maybe" : RSVP_DEFAULT_OPTIONS[i]) : `${noun[0].toUpperCase()}${noun.slice(1)} ${i + 1}`}
                    onChange={(e) => edit((opts) => { opts[i] = e.target.value; }, `opt${i}`)} />
                  {priced && (
                    <PriceBox cents={isTix ? f.config.tickets?.[i]?.price ?? 0 : f.config.prices?.[i] ?? 0} label={`Price of ${o || `${noun} ${i + 1}`}`} free={isTix}
                      onChange={(c) => edit((_, a) => { if (isTix) a.tix[i] = { ...a.tix[i], price: c }; else a.prices[i] = c; }, `price${i}`)} />
                  )}
                  {isTix && (
                    <button type="button" className={`b-icon${f.config.tickets?.[i] && (f.config.tickets[i].qty || f.config.tickets[i].max || f.config.tickets[i].ends) ? " on" : ""}`} aria-expanded={openTix === i}
                      aria-label={`Quantity, limit and sales end for ${o || `ticket type ${i + 1}`}`} title="Quantity, limit per order and sales end" onClick={() => setOpenTix(openTix === i ? null : i)}>⚙</button>
                  )}
                  {rich && (
                    <button type="button" className={`b-icon${extras ? " on" : ""}`} aria-expanded={openOpt === i} aria-label={`Artwork, colours and style for ${o || `option ${i + 1}`}`} title="Artwork, colours and style"
                      onClick={() => setOpenOpt(openOpt === i ? null : i)}>✦{extras ? <sup>{extras}</sup> : null}</button>
                  )}
                  {!fixed && (
                    <>
                      <button type="button" className="b-icon" aria-label={`Move ${noun} ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                      <button type="button" className="b-icon" aria-label={`Move ${noun} ${i + 1} down`} disabled={i === f.options.length - 1} onClick={() => move(i, 1)}>↓</button>
                      <button type="button" className="b-icon" aria-label={`Remove ${noun} ${i + 1}`} disabled={f.options.length <= 1} onClick={() => { edit((opts, a) => { opts.splice(i, 1); a.meta.splice(i, 1); a.prices.splice(i, 1); a.tix.splice(i, 1); }); setOpenOpt(null); setOpenTix(null); }}>✕</button>
                    </>
                  )}
                </div>
                {isTix && openTix === i && f.config.tickets?.[i] && (
                  <TicketSettings t={f.config.tickets[i]} onChange={(t) => edit((_, a) => { a.tix[i] = t; }, `tix${i}`)} />
                )}
                {rich && openOpt === i && (
                  <div className="b-opt-body form">
                    <span className="b-label">Artwork for this option</span>
                    <ArtUploader art={m?.art} assetBase={assetBase} upload={upload} compact
                      onUploaded={(path, name) => edit((_, { meta }) => { meta[i] = { ...meta[i], art: { ...(meta[i].art ?? artDefaultFor("option")), src: { path }, name } }; })}
                      onRemove={() => edit((_, { meta }) => { meta[i] = { ...meta[i], art: null }; })} />
                    {m?.art && <ArtQuick art={m.art} set={(k, v) => edit((_, { meta }) => { const a = meta[i].art; if (a) meta[i] = { ...meta[i], art: { ...a, [k]: v } }; }, `oa${i}${k}`)} />}
                    <span className="b-label">Colour swatches under this option</span>
                    {m?.swatches ? (
                      <SwatchEditor value={m.swatches} onChange={(sw) => edit((_, { meta }) => { meta[i] = { ...meta[i], swatches: sw }; }, `os${i}`)}
                        onRemoveAll={() => edit((_, { meta }) => { meta[i] = { ...meta[i], swatches: null }; })} />
                    ) : (
                      <button type="button" className="btn small" style={{ alignSelf: "flex-start" }} onClick={() => edit((_, { meta }) => { meta[i] = { ...meta[i], swatches: newSwatches() }; })}>+ Add colour swatches</button>
                    )}
                    <button type="button" className="linkbtn" style={{ alignSelf: "flex-start" }} onClick={() => openDesign(`${f.id}__o${i}`)}>Style this option in Design →</button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {fixed && <p className="muted b-note">Guests pick one. The answers always mean yes, no and maybe, whatever you call them. Leave Maybe empty to offer only yes and no.</p>}
      {!bulk && !fixed && (
        <button type="button" className="btn small" style={{ alignSelf: "flex-start" }} disabled={f.options.length >= 100}
          onClick={() => edit((o, a) => { o.push(`${Noun} ${o.length + 1}`); a.meta.push(emptyMeta()); a.prices.push(0); a.tix.push(newTicketType()); })}>+ Add {noun}</button>
      )}
      {priced && !isTix && <p className="muted b-note">Leave a price empty for options that cost nothing extra.</p>}
      {isTix && <p className="muted b-note">Guests choose how many of each type. Use ⚙ to set how many are available, the most per order and when sales end.</p>}
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

// ---------------------------------------------------------------- prices and ticket settings
/** A price in dollars ("25" or "25.50"). Shows an error until what's typed is a price; empty means free. */
function PriceBox({ cents, label, free, onChange }: { cents: number; label: string; free?: boolean; onChange: (c: number) => void }) {
  const [text, setText] = useState(priceInput(cents));
  const [bad, setBad] = useState(false);
  // Follow outside changes (undo, moving options) unless the box already shows that price.
  const [seen, setSeen] = useState(cents);
  if (seen !== cents) {
    setSeen(cents);
    if (parsePrice(text) !== cents) { setText(priceInput(cents)); setBad(false); }
  }
  return (
    <span className={`b-price${bad ? " bad" : ""}`}>
      <span aria-hidden="true">$</span>
      <input type="text" inputMode="decimal" value={text} aria-label={label} aria-invalid={bad || undefined} placeholder={free ? "Free" : "0"}
        title={bad ? "Enter a price up to $10,000, like 25 or 25.50" : undefined}
        onChange={(e) => {
          setText(e.target.value);
          const c = parsePrice(e.target.value);
          setBad(c == null);
          if (c != null) onChange(c);
        }}
        onBlur={() => { const c = parsePrice(text); if (c != null) setText(priceInput(c)); }} />
    </span>
  );
}

const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const optInt = (v: string, max: number) => { const n = Math.floor(Number(v)); return v.trim() && n > 0 ? Math.min(n, max) : null; };

function TicketSettings({ t, onChange }: { t: TicketType; onChange: (t: TicketType) => void }) {
  return (
    <div className="b-opt-body form">
      <TextInput label="How many are available" type="number" value={t.qty == null ? "" : String(t.qty)} placeholder="No limit"
        hint="Sold out once this many are sold. Leave empty for no limit."
        onChange={(v) => onChange({ ...t, qty: optInt(v, MAX_TICKET_QTY) })} />
      <TextInput label="Most per order" type="number" value={t.max == null ? "" : String(t.max)} placeholder={String(DEFAULT_MAX_PER_ORDER)}
        hint={`Up to ${MAX_PER_ORDER_CAP}. Leave empty for ${DEFAULT_MAX_PER_ORDER}.`}
        onChange={(v) => onChange({ ...t, max: optInt(v, MAX_PER_ORDER_CAP) })} />
      <TextInput label="Sales end (optional)" type="datetime-local" value={toLocalInput(t.ends)}
        hint={t.ends ? `Ends ${new Date(t.ends).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}, your time.` : "Leave empty to sell until you close the form."}
        onChange={(v) => onChange({ ...t, ends: v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null })} />
      {t.price > 0 && <p className="muted b-note">Each ticket is {money(t.price, true)}.</p>}
    </div>
  );
}
