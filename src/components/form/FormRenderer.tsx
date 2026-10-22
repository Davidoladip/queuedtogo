"use client";
/* eslint-disable @next/next/no-img-element -- artwork sizing is controlled by the form design CSS, not next/image */
import { legalReady } from "@/lib/legal";
import "./form.css";

import { useMemo, useRef, useState, type DragEvent, type FormEvent, type MouseEvent, type ReactNode } from "react";
import {
  CHANNELS,
  IMG_DEFAULT,
  LOCKABLE,
  designCss,
  merge,
  pagesOf,
  safeUrl,
  srcOf,
  themeVars,
  type FormField,
  type FormModel,
} from "@/lib/design/engine";
import { DEFAULT_THANKS, fillMessage, type ArtSettings, type SwatchSettings } from "@/lib/design/media";

type Mode = "edit" | "live";

/** Edit mode: show an interactive state (hover, focus, error…) on one element or on every element of a kind. */
export type ForcedState = { state: string; sid?: string | null; kind?: string | null };

type Props = {
  form: FormModel;
  assetBase: string;
  mode: Mode;
  businessName: string;
  /** Edit mode: the selected element id, highlighted in the preview. */
  selected?: string | null;
  /** Edit mode: called with the element id (data-sid) that was clicked. */
  onSelect?: (sid: string) => void;
  forced?: ForcedState | null;
  /** Edit mode: an image was chosen or dropped to insert before field `index`. */
  onInsertArtwork?: (index: number, file: File) => void;
  /** Edit mode: an artwork block was resized with its drag handle (new width in px). */
  onResizeArt?: (sid: string, widthPx: number) => void;
  /** Edit mode: show the thank-you screen customers see after submitting. */
  showThanks?: boolean;
  /** Live mode: shown instead of the form, e.g. when it is closed. */
  closedMessage?: string | null;
  /** Live mode: the published version (sent back so answers match the form the customer saw). */
  version?: number;
  /** Live mode: sends the order. Without it, the form explains that ordering isn't switched on. */
  onSubmitOrder?: (fd: FormData) => Promise<OrderResult>;
};

export type OrderResult = { ok: true; number: number; trackingUrl: string } | { ok: false; message: string; errors?: Record<string, string> };

/** A fresh key per order attempt, so a double click or retry never creates two orders. */
const newClientKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : `${Date.now()}${Math.random().toString(36).slice(2)}`.padEnd(20, "0"));

const fmtDay = (iso: string | null) =>
  iso ? new Date(iso + "T12:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** US numbers (10 digits, optional +1) or any international E.164 number. */
const PHONE = (v: string) => {
  const d = v.replace(/[\s().-]/g, "");
  return /^\+?1?\d{10}$/.test(d) || /^\+[1-9]\d{7,14}$/.test(d);
};
const isLocked = (f: FormField) => LOCKABLE.has(f.type) && f.config.locked === true;

export function FormRenderer({ form, assetBase, mode, businessName, selected, onSelect, forced, onInsertArtwork, onResizeArt, showThanks, closedMessage, version, onSubmitOrder }: Props) {
  const E = mode === "edit";
  const t = form.design.theme;
  const art = srcOf(form.design.art, assetBase);
  const L = t.layout;
  const css = useMemo(() => designCss(form, assetBase), [form, assetBase]);
  const pages = useMemo(() => pagesOf(form), [form]);
  const multi = pages.length > 1;
  const [page, setPage] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState<boolean[]>([]);
  const [drop, setDrop] = useState<{ idx: number; after: boolean } | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ number: number; trackingUrl: string } | null>(null);
  const [clientKey, setClientKey] = useState(newClientKey);
  const [formKey, setFormKey] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const insertAt = useRef(0);
  const shownPage = Math.min(page, pages.length - 1);
  const gate = !E && form.design.adv.disableUntilValid;

  const selectCss = E && selected && /^[A-Za-z0-9_-]{1,64}$/.test(selected)
    ? `.qf-wrap[data-qf="${form.id}"] [data-sid="${selected}"]{outline:2px solid #3346D3;outline-offset:3px;border-radius:6px}`
    : "";

  /** Class for a forced state preview (edit mode only). */
  const fs = (sid: string, kind: string) =>
    E && forced && ((forced.sid && forced.sid === sid) || (forced.kind && forced.kind === kind)) ? ` fs-${forced.state}` : "";

  function onEditClick(e: MouseEvent) {
    if (!E) return;
    const target = e.target as HTMLElement;
    const ins = target.closest<HTMLElement>("[data-ins]");
    if (ins) {
      e.preventDefault();
      insertAt.current = Number(ins.dataset.ins);
      fileRef.current?.click();
      return;
    }
    e.preventDefault();
    const el = target.closest("[data-sid]");
    if (el && onSelect) onSelect(el.getAttribute("data-sid")!);
  }

  function dropTarget(e: DragEvent) {
    const blk = (e.target as HTMLElement).closest<HTMLElement>("[data-idx]");
    if (!blk) return { idx: form.fields.findIndex((f) => f.type === "submit"), after: false };
    const r = blk.getBoundingClientRect();
    return { idx: Number(blk.dataset.idx), after: e.clientY > r.top + r.height / 2 };
  }

  /** Missing required answers on a page (formats aren't checked until Next/Submit). */
  function missing(i: number, fd: FormData) {
    return pages[i].blocks.some(({ f }) => {
      if (colourMissing(f, fd)) return true;
      if (!f.required || isLocked(f)) return false;
      const values = fd.getAll(f.id).map((v) => (typeof v === "string" ? v.trim() : v.size ? "file" : ""));
      return f.type === "sizes" ? !values.some((v) => Number(v) > 0) : !values.some(Boolean);
    });
  }
  function recheck() {
    if (!gate || !formRef.current) return;
    const fd = new FormData(formRef.current);
    setReady(pages.map((_, i) => !missing(i, fd)));
  }

  function validatePage(i: number): boolean {
    const fd = new FormData(formRef.current!);
    const errs: Record<string, string> = {};
    for (const { f } of pages[i].blocks) {
      const colour = colourMissing(f, fd);
      if (colour) { errs[f.id] = colour; continue; }
      if (f.type === "submit" || isLocked(f) || (!f.required && !["email", "phone"].includes(f.type))) continue;
      const values = fd.getAll(f.id).map((v) => (typeof v === "string" ? v.trim() : v.size ? "file" : ""));
      const filled = f.type === "sizes" ? values.some((v) => Number(v) > 0) : values.some(Boolean);
      if (f.required && !filled) { errs[f.id] = f.type === "sizes" ? "Enter a quantity for at least one size." : "This is required."; continue; }
      const v = String(values[0] ?? "");
      if (f.type === "email" && v && !EMAIL.test(v)) errs[f.id] = "Enter a valid email address.";
      if (f.type === "phone" && v && !PHONE(v)) errs[f.id] = "Enter a valid mobile number, like (555) 123-4567.";
    }
    setErrors(errs);
    const first = Object.keys(errs)[0];
    if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
    return !first;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (E || sending) return;
    if (!validatePage(shownPage)) return;
    if (!onSubmitOrder) { setNotice("Online ordering isn't switched on for this form yet. Please check back soon."); return; }
    setSending(true);
    setNotice(null);
    try {
      const res = await onSubmitOrder(new FormData(formRef.current!));
      if (res.ok) { setDone({ number: res.number, trackingUrl: res.trackingUrl }); window.scrollTo?.({ top: 0, behavior: "smooth" }); return; }
      setNotice(res.message);
      if (res.errors && Object.keys(res.errors).length) {
        setErrors(res.errors);
        // Go back to the first page with a problem.
        const first = Object.keys(res.errors)[0];
        const p = pages.findIndex((pg) => pg.blocks.some(({ f }) => f.id === first));
        if (p >= 0) setPage(p);
      }
    } catch {
      setNotice("We couldn't reach the order system. Check your connection and try again. Your answers are still here.");
    } finally {
      setSending(false);
    }
  }
  function another() {
    setDone(null); setErrors({}); setNotice(null); setPage(0); setReady([]);
    setClientKey(newClientKey());
    setFormKey((k) => k + 1);
  }

  function nav(dir: 1 | -1) {
    if (E) return;
    if (dir === 1 && !validatePage(shownPage)) return;
    setPage(Math.max(0, Math.min(pages.length - 1, shownPage + dir)));
    setNotice(null);
  }

  const prevLabel = (i: number) => pages[i - 1]?.pb?.f.config.prev || "Back";
  // With "disable until valid", Next/Submit stay disabled while a required answer on the page is missing.
  const blocked = (i: number) => gate && !(ready[i] ?? !pages[i].blocks.some(({ f }) => f.required && !isLocked(f)));
  const ti = E ? -1 : undefined;
  const ins = (idx: number, after?: boolean) =>
    E && onInsertArtwork ? <button type="button" className={`qf-ins${after ? " after" : ""}`} data-ins={idx} tabIndex={-1}>+ Artwork</button> : null;
  const blk = (idx: number, content: ReactNode, last: boolean, key: string) => (
    <div key={key} className={`qf-blk${drop?.idx === idx ? (drop.after ? " drop-after" : " drop-before") : ""}`} data-idx={idx}>
      {ins(idx)}{content}{last && ins(idx + 1, true)}
    </div>
  );

  const prevBtn = (i: number) => (
    <button type="button" className={`qf-btn qf-prev${fs("__prev", "button")}`} data-sid="__prev" data-kind="button" onClick={() => nav(-1)} tabIndex={ti}>{prevLabel(i)}</button>
  );

  const artProps = { assetBase, editing: E, selected: selected ?? null, onResize: onResizeArt };
  const headText = (
    <div className="qf-head-t">
      {(form.eventDate || form.venue) && (
        <div className="qf-eyebrow">{fmtDay(form.eventDate)}{form.eventDate && form.venue ? " · " : ""}{form.venue}</div>
      )}
      <h2 className={`qf-title${fs("__title", "heading")}`} data-sid="__title" data-kind="heading">{form.title}</h2>
      {form.intro && <p className={`qf-intro${fs("__intro", "text")}`} data-sid="__intro" data-kind="text">{form.intro}</p>}
    </div>
  );
  const ha = form.design.headArt;
  const head = ha && srcOf(ha.src, assetBase)
    ? <div className={`qf-head qf-head-${ha.pos}`}><ArtBlock sid="__hart" a={ha} alt={ha.alt || `${form.title} artwork`} {...artProps} />{headText}</div>
    : <div className="qf-head">{headText}</div>;
  const consentText = fillMessage(form.settings.notify.consentText, { channel: CHANNELS[form.settings.notify.channel], business: businessName });
  const orderNo = done ? `QTG-${done.number}` : "QTG-1001";
  const thanks = (
    <div className="qf-done" role="status">
      <h2 className="qf-title" data-sid="__title" data-kind="heading">You&apos;re in the queue!</h2>
      <p className="qf-intro" data-sid="__intro" data-kind="text">{fillMessage(form.thanks || DEFAULT_THANKS, { order_number: orderNo, business: businessName, form_title: form.title })}</p>
      <div>Your order number</div>
      <div className="num">{orderNo}</div>
      {E && <div className="qf-sample">Sample order number. Customers see their real one.</div>}
      {done && (
        <>
          <div>Track your order any time:</div>
          <a className="lk" href={done.trackingUrl}>{done.trackingUrl}</a>
          <button type="button" className="qf-btn qf-submit" data-sid="__submit" data-kind="button" onClick={another}>Submit another order</button>
        </>
      )}
    </div>
  );

  const body = (
    <form key={formKey} className="qf-form" ref={formRef} noValidate onSubmit={onSubmit} onInput={recheck} onChange={recheck} aria-busy={sending || undefined}
>
      {!E && (
        <>
          <input type="hidden" name="__v" value={version ?? ""} />
          <input type="hidden" name="__k" value={clientKey} />
          {/* Left empty by people; bots that fill every box are turned away. */}
          <div className="qf-hp" aria-hidden="true"><label>Leave this empty<input type="text" name="__hp" tabIndex={-1} autoComplete="off" defaultValue="" /></label></div>
        </>
      )}
      {multi && form.design.adv.progress && (
        <div className="qf-prog">
          <div className="qf-prog-track"><span style={{ width: `${(((E ? 0 : shownPage) + 1) * 100 / pages.length).toFixed(1)}%` }} /></div>
          <div className="qf-step">{E ? `${pages.length} pages` : <>Step <b>{shownPage + 1}</b> of {pages.length}</>}</div>
        </div>
      )}
      {pages.map((pg, i) => (
        <PageSection key={i} hidden={!E && i !== shownPage} index={i} editing={E} pbLabel={pg.pb ? `Page ${i + 2}` : null}>
          {pg.blocks.map(({ f, i: idx }, k) => {
            const last = k === pg.blocks.length - 1 && !pg.pb;
            if (f.type === "submit") {
              return blk(idx, (
                <>
                  {form.settings.notify.consent && (
                    <label className="qf-check">
                      {/* Never pre-ticked: consent to texts must be the customer's own choice (carrier rules). */}
                      <input type="checkbox" name="__consent" tabIndex={ti} />
                      {" "}{consentText}
                    </label>
                  )}
                  {form.settings.notify.consent && legalReady() && (
                    <p className="qf-legal">See the <a href="/terms" target="_blank" rel="noopener">texting terms</a> and <a href="/privacy" target="_blank" rel="noopener">privacy policy</a>.</p>
                  )}
                  {notice && <div className="qf-closed" role="status">{notice}</div>}
                  <div className="qf-nav">
                    {i > 0 && prevBtn(i)}
                    <button type="submit" className={`qf-btn qf-submit${fs("__submit", "button")}`} data-sid="__submit" data-kind="button" tabIndex={ti} disabled={blocked(i) || sending}>{sending ? "Sending…" : form.submitLabel || "Submit"}</button>
                  </div>
                </>
              ), last, f.id);
            }
            const content = <Block f={f} editing={E} error={errors[f.id] ?? (E && forced?.state === "error" && fs(f.id, "input") ? "Please answer this question." : undefined)} fs={fs} art={artProps} />;
            if (!E && f.type === "image" && !srcOf(merge(IMG_DEFAULT, f.config.img).src, assetBase)) return null;
            return blk(idx, content, last, f.id);
          })}
          {pg.pb && blk(pg.pb.i, (
            <div className="qf-nav">
              {i > 0 && prevBtn(i)}
              <button type="button" className={`qf-btn qf-next${fs("__next", "button")}`} data-sid="__next" data-kind="button" onClick={() => nav(1)} tabIndex={ti} disabled={blocked(i)}>{pg.pb.f.config.next || "Next"}</button>
            </div>
          ), false, pg.pb.f.id)}
        </PageSection>
      ))}
    </form>
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css + selectCss }} />
      {E && onInsertArtwork && (
        <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml" aria-hidden="true"
          onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) onInsertArtwork(insertAt.current, file); }} />
      )}
      <div
        className={`qf-wrap qf-${L}${art ? "" : " noart"}${E ? " editing" : ""}`}
        data-qf={form.id}
        style={themeVars(t) as React.CSSProperties}
        onClickCapture={E ? onEditClick : undefined}
        onDragOver={E && onInsertArtwork ? (e) => { if (!e.dataTransfer.types.includes("Files")) return; e.preventDefault(); setDrop(dropTarget(e)); } : undefined}
        onDragLeave={E ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null); } : undefined}
        onDrop={E && onInsertArtwork ? (e) => {
          e.preventDefault();
          const target = dropTarget(e);
          setDrop(null);
          const file = e.dataTransfer.files?.[0];
          if (file) onInsertArtwork(target.idx + (target.after ? 1 : 0), file);
        } : undefined}
      >
        <div className="qf">
          {art && L !== "background" && <div className="qf-art"><img src={art} alt={`${form.title} artwork`} /></div>}
          {art && L === "background" && <div className="qf-bg"><img src={art} alt="" /></div>}
          <div className="qf-main">
            <div className="qf-card">
              {showThanks || done ? thanks : <>{head}{closedMessage ? <div className="qf-closed">{closedMessage}</div> : body}</>}
            </div>
            <div className="qf-powered">Order form by {businessName} · Powered by QueuedToGo</div>
          </div>
        </div>
      </div>
    </>
  );
}

function PageSection({ children, hidden, index, editing, pbLabel }: { children: ReactNode; hidden: boolean; index: number; editing: boolean; pbLabel: string | null }) {
  return (
    <>
      <section className="qf-page" data-page={index} hidden={hidden}>{children}</section>
      {editing && pbLabel && <div className="qf-pbmark">{pbLabel}</div>}
    </>
  );
}

type ArtCtx = { assetBase: string; editing: boolean; selected: string | null; onResize?: (sid: string, widthPx: number) => void };

/** Required colour choice not made: on the question, or on the option the customer picked. */
function colourMissing(f: FormField, fd: FormData): string | null {
  const sw = f.config.swatches;
  if (sw?.selectable && sw.required && !fd.get(`${f.id}__color`)) return "Choose a colour.";
  if (f.type === "choice" || f.type === "multi") {
    const picked = new Set(fd.getAll(f.id).map(String));
    for (const [i, o] of f.options.entries()) {
      const m = f.config.optMeta?.[i]?.swatches;
      if (m?.selectable && m.required && picked.has(o.trim()) && !fd.get(`${f.id}__o${i}__color`)) return `Choose a colour for ${o.trim()}.`;
    }
  }
  return null;
}

/** An uploaded image with its own styling. In the editor, the selected one shows a drag handle to resize it. */
function ArtBlock({ sid, a, alt, assetBase, editing, selected, onResize }: { sid: string; a: ArtSettings; alt: string } & ArtCtx) {
  const src = srcOf(a.src, assetBase);
  if (!src) return null;
  const startDrag = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!onResize) return;
    e.preventDefault();
    e.stopPropagation();
    const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const x0 = e.clientX, w0 = box.width, k = a.align === "center" ? 2 : a.align === "right" ? -1 : 1;
    const move = (m: PointerEvent) => onResize(sid, Math.round(Math.max(16, Math.min(2000, w0 + (m.clientX - x0) * k))));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div className="qf-art-blk" data-sid={sid} data-kind="art">
      <span className="qf-art-in">
        <img src={src} alt={alt} />
        {editing && selected === sid && onResize && (
          <span className="qf-rsz" role="slider" aria-label="Drag to resize the artwork" aria-valuenow={a.w} tabIndex={-1} onPointerDown={startDrag} />
        )}
      </span>
    </div>
  );
}

/** Round colour swatches. When selectable, the customer's pick is submitted as `<name>`. */
function Swatches({ sid, s, name, label, editing, fs }: { sid: string; s: SwatchSettings; name: string; label: string; editing: boolean; fs: (sid: string, kind: string) => string }) {
  const forcedSel = fs(sid, "swatch").includes("fs-selected");
  return (
    <div className={`qf-sw${fs(sid, "swatch")}`} data-sid={sid} data-kind="swatch" role={s.selectable ? "radiogroup" : "list"} aria-label={label}>
      {s.items.map((c, i) => {
        const dot = <span className="qf-sw-dot" style={{ background: c.color }} />;
        const text = s.labels && c.label ? <span className="qf-sw-l">{c.label}</span> : null;
        const title = c.label ? `${c.label} (${c.color})` : c.color;
        return s.selectable ? (
          <label key={i} className={`qf-sw-i${forcedSel && i === 0 ? " fs-selected" : ""}`} title={title}>
            <input type="radio" name={name} value={c.label ? `${c.label} (${c.color})` : c.color} aria-label={title} tabIndex={editing ? -1 : undefined} />
            {dot}{text}
          </label>
        ) : (
          <span key={i} className="qf-sw-i" title={title} role="listitem">{dot}{text}<span className="sr-only">{title}</span></span>
        );
      })}
    </div>
  );
}

function Block({ f: raw, editing, error, fs, art }: { f: FormField; editing: boolean; error?: string; fs: (sid: string, kind: string) => string; art: ArtCtx }) {
  // Keep each option's original index, so per-option artwork, swatches and styles stay attached.
  const opts = raw.options.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
  const f = raw;
  const assetBase = art.assetBase;
  const ti = editing ? -1 : undefined;
  const req = f.required ? <span className="qf-req" aria-hidden="true">*</span> : null;
  const helpId = `qh-${f.id}`, errId = `qe-${f.id}`, inId = `q-${f.id}`;
  const describedBy = `${f.help ? helpId + " " : ""}${errId}`;
  const help = f.help ? <div className="qf-help" id={helpId}>{f.help}</div> : null;
  const err = <div className="qf-ferr" id={errId} aria-live="polite">{error}</div>;
  const labSid = `${f.id}__label`;
  const lab = <label className={`qf-label${fs(labSid, "label")}`} data-sid={labSid} data-kind="label" htmlFor={inId}>{f.label}{req}</label>;
  const glab = <span className={`qf-label${fs(labSid, "label")}`} data-sid={labSid} data-kind="label" id={`ql-${f.id}`}>{f.label}{req}</span>;
  const fArt = f.config.art ? <ArtBlock sid={`${f.id}__art`} a={f.config.art} alt={f.config.art.alt} {...art} /> : null;
  const fSw = f.config.swatches ? <Swatches sid={`${f.id}__sw`} s={f.config.swatches} name={`${f.id}__color`} label={`${f.label || "Question"}: colours`} editing={editing} fs={fs} /> : null;
  const wrap = (kind: string, inner: ReactNode) => {
    const pos = f.config.art?.pos ?? "above";
    const body = !fArt ? inner
      : pos === "left" || pos === "right" ? <div className={`qf-media qf-media-${pos}`}>{fArt}<div className="qf-media-t">{inner}</div></div>
        : pos === "below" ? <>{inner}{fArt}</> : <>{fArt}{inner}</>;
    return <div className={`qf-field${error ? " invalid" : ""}${fs(f.id, kind)}`} data-sid={f.id} data-kind={kind}>{body}{fSw}{err}</div>;
  };
  const locked = isLocked(f);
  const common = { id: inId, name: f.id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, "aria-required": (f.required && !locked) || undefined, tabIndex: ti };

  switch (f.type) {
    case "heading": return <h3 className={`qf-h${fs(f.id, "heading")}`} data-sid={f.id} data-kind="heading">{f.label}</h3>;
    case "text": return <p className={`qf-p${fs(f.id, "text")}`} data-sid={f.id} data-kind="text">{f.label}</p>;
    case "divider": return <hr className="qf-hr" data-sid={f.id} data-kind="divider" />;
    case "button": {
      const u = safeUrl(f.config.url);
      return <a className={`qf-btn qf-link${fs(f.id, "button")}`} data-sid={f.id} data-kind="button" href={u || "#"} target="_blank" rel="noopener noreferrer" tabIndex={ti}>{f.label} <span aria-hidden="true">↗</span></a>;
    }
    case "image": {
      const g = merge(IMG_DEFAULT, f.config.img), src = srcOf(g.src, assetBase);
      if (!src) return editing ? <div className="qf-img-empty" data-sid={f.id} data-kind="image">This artwork block has no image yet. Select it and choose a file.</div> : null;
      const link = safeUrl(g.link);
      const img = <img src={src} alt={String(g.alt || "")} />;
      return (
        <figure className="qf-img" data-sid={f.id} data-kind="image">
          {link ? <a className="qf-img-in" href={link} target="_blank" rel="noopener noreferrer" tabIndex={ti}>{img}</a> : <span className="qf-img-in">{img}</span>}
        </figure>
      );
    }
    case "short": case "email": case "phone": case "date": case "number": {
      const type = { short: "text", email: "email", phone: "tel", date: "date", number: "number" }[f.type];
      return wrap("input", <>{lab}{help}<input className="qf-in" type={type} placeholder={f.placeholder || undefined}
        inputMode={f.type === "phone" ? "tel" : undefined} autoComplete={f.type === "phone" ? "tel" : f.type === "email" ? "email" : undefined}
        {...(locked ? { value: String(f.config.value ?? ""), disabled: true, readOnly: true } : {})} {...common} /></>);
    }
    case "long": return wrap("input", <>{lab}{help}<textarea className="qf-in" placeholder={f.placeholder || undefined} {...common} /></>);
    case "dropdown":
      return wrap("input", <>{lab}{help}<select className="qf-in" defaultValue="" {...common}><option value="">Choose…</option>{opts.map(({ o, i }) => <option key={i}>{o}</option>)}</select></>);
    case "choice": case "multi": {
      const ty = f.type === "choice" ? "radio" : "checkbox", list = f.config.display === "list";
      return wrap("choice", <>{glab}{help}
        <div className={`qf-opts${list ? " list" : ""}`} role={f.type === "choice" ? "radiogroup" : "group"} aria-labelledby={`ql-${f.id}`} aria-describedby={describedBy}>
          {opts.map(({ o, i }) => {
            const sid = `${f.id}__o${i}`, m = f.config.optMeta?.[i];
            const oArt = m?.art ? <ArtBlock sid={`${sid}__art`} a={m.art} alt={m.art.alt || o} {...art} /> : null;
            const text = oArt ? <span className={`qf-opt-c ${m!.art!.pos}`}>{oArt}<span className="qf-opt-t">{o}</span></span> : o;
            const optLabel = (
              <label key={i} className={`${list ? "qf-li" : "qf-opt"}${fs(sid, "option")}`} data-sid={sid} data-kind="option">
                <input type={ty} name={f.id} value={o} tabIndex={ti} /><span>{text}</span>
              </label>
            );
            return m?.swatches ? (
              <div key={i} className="qf-optw">
                {optLabel}
                <Swatches sid={`${sid}__sw`} s={m.swatches} name={`${sid}__color`} label={`${o}: colours`} editing={editing} fs={fs} />
              </div>
            ) : optLabel;
          })}
        </div></>);
    }
    case "sizes":
      return wrap("input", <>{glab}{help}
        <div className="qf-sizes" role="group" aria-labelledby={`ql-${f.id}`}>
          {opts.map(({ o, i }) => <label key={i}>{o}<input className="qf-in" type="number" min={0} inputMode="numeric" name={f.id} data-size={o} placeholder="0" tabIndex={ti} /></label>)}
        </div></>);
    case "upload":
      return wrap("input", <>{glab}{help}
        <label className="qf-upload" htmlFor={inId}><span><b>Choose a file</b> or drop it here</span></label>
        <input type="file" id={inId} name={f.id} accept="image/*,.pdf" hidden tabIndex={ti} /></>);
  }
  return null;
}
