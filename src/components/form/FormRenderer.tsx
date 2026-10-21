"use client";
/* eslint-disable @next/next/no-img-element -- artwork sizing is controlled by the form design CSS, not next/image */
import "./form.css";

import { useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import {
  CHANNELS,
  IMG_DEFAULT,
  designCss,
  merge,
  pagesOf,
  safeUrl,
  srcOf,
  themeVars,
  type FormField,
  type FormModel,
} from "@/lib/design/engine";

type Mode = "edit" | "live";

type Props = {
  form: FormModel;
  assetBase: string;
  mode: Mode;
  businessName: string;
  /** Edit mode: the selected element id, highlighted in the preview. */
  selected?: string | null;
  /** Edit mode: called with the element id (data-sid) that was clicked. */
  onSelect?: (sid: string) => void;
  /** Live mode: shown instead of the form, e.g. when it is closed. */
  closedMessage?: string | null;
};

const fmtDay = (iso: string | null) =>
  iso ? new Date(iso + "T12:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** US numbers (10 digits, optional +1) or any international E.164 number. */
const PHONE = (v: string) => {
  const d = v.replace(/[\s().-]/g, "");
  return /^\+?1?\d{10}$/.test(d) || /^\+[1-9]\d{7,14}$/.test(d);
};

export function FormRenderer({ form, assetBase, mode, businessName, selected, onSelect, closedMessage }: Props) {
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
  const formRef = useRef<HTMLFormElement>(null);
  const shownPage = Math.min(page, pages.length - 1);

  const selectCss = E && selected && /^[A-Za-z0-9_-]{1,64}$/.test(selected)
    ? `.qf-wrap[data-qf="${form.id}"] [data-sid="${selected}"]{outline:2px solid #3346D3;outline-offset:3px;border-radius:6px}`
    : "";

  function onEditClick(e: MouseEvent) {
    if (!E) return;
    e.preventDefault();
    const el = (e.target as HTMLElement).closest("[data-sid]");
    if (el && onSelect) onSelect(el.getAttribute("data-sid")!);
  }

  function validatePage(i: number): boolean {
    const fd = new FormData(formRef.current!);
    const errs: Record<string, string> = {};
    for (const { f } of pages[i].blocks) {
      if (f.type === "submit" || !f.required && !["email", "phone"].includes(f.type)) continue;
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

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (E) return;
    if (!validatePage(shownPage)) return;
    // Public submissions are connected in Stage 6 (server route with rate limiting).
    setNotice("Thanks! Online ordering for this form opens soon, so your answers weren't sent yet.");
  }

  function nav(dir: 1 | -1) {
    if (E) return;
    if (dir === 1 && !validatePage(shownPage)) return;
    setPage(Math.max(0, Math.min(pages.length - 1, shownPage + dir)));
    setNotice(null);
  }

  const prevLabel = (i: number) => pages[i - 1]?.pb?.f.config.prev || "Back";

  const head = (
    <>
      {(form.eventDate || form.venue) && (
        <div className="qf-eyebrow">{fmtDay(form.eventDate)}{form.eventDate && form.venue ? " · " : ""}{form.venue}</div>
      )}
      <h2 className="qf-title" data-sid="__title" data-kind="heading">{form.title}</h2>
      {form.intro && <p className="qf-intro" data-sid="__intro" data-kind="text">{form.intro}</p>}
    </>
  );

  const body = (
    <form className="qf-form" ref={formRef} noValidate onSubmit={onSubmit}>
      {multi && form.design.adv.progress && (
        <div className="qf-prog">
          <div className="qf-prog-track"><span style={{ width: `${(((E ? 0 : shownPage) + 1) * 100 / pages.length).toFixed(1)}%` }} /></div>
          <div className="qf-step">{E ? `${pages.length} pages` : <>Step <b>{shownPage + 1}</b> of {pages.length}</>}</div>
        </div>
      )}
      {pages.map((pg, i) => (
        <PageSection key={i} hidden={!E && i !== shownPage} index={i} editing={E} pbLabel={pg.pb ? `Page ${i + 2}` : null}>
          {pg.blocks.map(({ f }) =>
            f.type === "submit" ? (
              <div className="qf-blk" key={f.id}>
                {form.settings.notify.consent && (
                  <label className="qf-check">
                    <input type="checkbox" name="__consent" defaultChecked tabIndex={E ? -1 : undefined} />
                    {" "}Send me {CHANNELS[form.settings.notify.channel]} updates about my order. Reply STOP to opt out.
                  </label>
                )}
                {notice && <div className="qf-closed" role="status">{notice}</div>}
                <div className="qf-nav">
                  {i > 0 && <button type="button" className="qf-btn qf-prev" data-sid="__prev" data-kind="button" onClick={() => nav(-1)} tabIndex={E ? -1 : undefined}>{prevLabel(i)}</button>}
                  <button type="submit" className="qf-btn qf-submit" data-sid="__submit" data-kind="button" tabIndex={E ? -1 : undefined}>{form.submitLabel || "Submit"}</button>
                </div>
              </div>
            ) : (
              <Block key={f.id} f={f} editing={E} error={errors[f.id]} assetBase={assetBase} />
            ),
          )}
          {pg.pb && (
            <div className="qf-blk">
              <div className="qf-nav">
                {i > 0 && <button type="button" className="qf-btn qf-prev" data-sid="__prev" data-kind="button" onClick={() => nav(-1)} tabIndex={E ? -1 : undefined}>{prevLabel(i)}</button>}
                <button type="button" className="qf-btn qf-next" data-sid="__next" data-kind="button" onClick={() => nav(1)} tabIndex={E ? -1 : undefined}>{pg.pb.f.config.next || "Next"}</button>
              </div>
            </div>
          )}
        </PageSection>
      ))}
    </form>
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css + selectCss }} />
      <div
        className={`qf-wrap qf-${L}${art ? "" : " noart"}${E ? " editing" : ""}`}
        data-qf={form.id}
        style={themeVars(t) as React.CSSProperties}
        onClickCapture={E ? onEditClick : undefined}
      >
        <div className="qf">
          {art && L !== "background" && <div className="qf-art"><img src={art} alt={`${form.title} artwork`} /></div>}
          {art && L === "background" && <div className="qf-bg"><img src={art} alt="" /></div>}
          <div className="qf-main">
            <div className="qf-card">
              {head}
              {closedMessage ? <div className="qf-closed">{closedMessage}</div> : body}
            </div>
            <div className="qf-powered">Order form by {businessName} · Powered by QueuedToGo</div>
          </div>
        </div>
      </div>
    </>
  );
}

function PageSection({ children, hidden, index, editing, pbLabel }: { children: React.ReactNode; hidden: boolean; index: number; editing: boolean; pbLabel: string | null }) {
  return (
    <>
      <section className="qf-page" data-page={index} hidden={hidden}>{children}</section>
      {editing && pbLabel && <div className="qf-pbmark">{pbLabel}</div>}
    </>
  );
}

function Block({ f: raw, editing, error, assetBase }: { f: FormField; editing: boolean; error?: string; assetBase: string }) {
  const f = { ...raw, options: raw.options.map((o) => o.trim()).filter(Boolean) };
  const ti = editing ? -1 : undefined;
  const req = f.required ? <span className="qf-req" aria-hidden="true">*</span> : null;
  const helpId = `qh-${f.id}`, errId = `qe-${f.id}`, inId = `q-${f.id}`;
  const describedBy = `${f.help ? helpId + " " : ""}${errId}`;
  const help = f.help ? <div className="qf-help" id={helpId}>{f.help}</div> : null;
  const err = <div className="qf-ferr" id={errId} aria-live="polite">{error}</div>;
  const lab = <label className="qf-label" data-sid={`${f.id}__label`} data-kind="label" htmlFor={inId}>{f.label}{req}</label>;
  const glab = <span className="qf-label" data-sid={`${f.id}__label`} data-kind="label" id={`ql-${f.id}`}>{f.label}{req}</span>;
  const wrap = (kind: string, inner: React.ReactNode) => (
    <div className="qf-blk"><div className={`qf-field${error ? " invalid" : ""}`} data-sid={f.id} data-kind={kind}>{inner}{err}</div></div>
  );
  const common = { id: inId, name: f.id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, "aria-required": f.required || undefined, tabIndex: ti };

  switch (f.type) {
    case "heading": return <div className="qf-blk"><h3 className="qf-h" data-sid={f.id} data-kind="heading">{f.label}</h3></div>;
    case "text": return <div className="qf-blk"><p className="qf-p" data-sid={f.id} data-kind="text">{f.label}</p></div>;
    case "divider": return <div className="qf-blk"><hr className="qf-hr" data-sid={f.id} data-kind="divider" /></div>;
    case "button": {
      const u = safeUrl(f.config.url);
      return <div className="qf-blk"><a className="qf-btn qf-link" data-sid={f.id} data-kind="button" href={u || "#"} target="_blank" rel="noopener noreferrer" tabIndex={ti}>{f.label} <span aria-hidden="true">↗</span></a></div>;
    }
    case "image": {
      const g = merge(IMG_DEFAULT, f.config.img), src = srcOf(g.src, assetBase);
      if (!src) return editing ? <div className="qf-blk"><div className="qf-img-empty" data-sid={f.id} data-kind="image">This artwork block has no image yet. Select it and choose a file.</div></div> : null;
      const link = safeUrl(g.link);
      const img = <img src={src} alt={String(g.alt || "")} />;
      return (
        <div className="qf-blk">
          <figure className="qf-img" data-sid={f.id} data-kind="image">
            {link ? <a className="qf-img-in" href={link} target="_blank" rel="noopener noreferrer" tabIndex={ti}>{img}</a> : <span className="qf-img-in">{img}</span>}
          </figure>
        </div>
      );
    }
    case "short": case "email": case "phone": case "date": case "number": {
      const type = { short: "text", email: "email", phone: "tel", date: "date", number: "number" }[f.type];
      return wrap("input", <>{lab}{help}<input className="qf-in" type={type} placeholder={f.placeholder || undefined}
        inputMode={f.type === "phone" ? "tel" : undefined} autoComplete={f.type === "phone" ? "tel" : f.type === "email" ? "email" : undefined} {...common} /></>);
    }
    case "long": return wrap("input", <>{lab}{help}<textarea className="qf-in" placeholder={f.placeholder || undefined} {...common} /></>);
    case "dropdown":
      return wrap("input", <>{lab}{help}<select className="qf-in" defaultValue="" {...common}><option value="">Choose…</option>{f.options.map((o, i) => <option key={i}>{o}</option>)}</select></>);
    case "choice": case "multi": {
      const ty = f.type === "choice" ? "radio" : "checkbox", list = f.config.display === "list";
      return wrap("choice", <>{glab}{help}
        <div className={`qf-opts${list ? " list" : ""}`} role={f.type === "choice" ? "radiogroup" : "group"} aria-labelledby={`ql-${f.id}`} aria-describedby={describedBy}>
          {f.options.map((o, i) => (
            <label key={i} className={list ? "qf-li" : "qf-opt"}><input type={ty} name={f.id} value={o} tabIndex={ti} /><span>{o}</span></label>
          ))}
        </div></>);
    }
    case "sizes":
      return wrap("input", <>{glab}{help}
        <div className="qf-sizes" role="group" aria-labelledby={`ql-${f.id}`}>
          {f.options.map((o, i) => <label key={i}>{o}<input className="qf-in" type="number" min={0} inputMode="numeric" name={f.id} data-size={o} placeholder="0" tabIndex={ti} /></label>)}
        </div></>);
    case "upload":
      return wrap("input", <>{glab}{help}
        <label className="qf-upload" htmlFor={inId}><span><b>Choose a file</b> or drop it here</span></label>
        <input type="file" id={inId} name={f.id} accept="image/*,.pdf" hidden tabIndex={ti} /></>);
  }
  return null;
}
