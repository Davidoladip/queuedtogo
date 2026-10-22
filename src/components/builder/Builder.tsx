"use client";

import "./builder.css";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { FormRenderer } from "@/components/form/FormRenderer";
import { IMG_DEFAULT, blankField, newId, normalizeDesign, type FormModel } from "@/lib/design/engine";
import { processImage, type ProcessedImage } from "@/lib/design/image";
import { createClient } from "@/lib/supabase/client";
import { toDraftInput } from "@/lib/validation/form";
import { getFormDesign, publishForm, saveDraft, setFormStatus, updateBrandColors } from "@/server/actions/forms";
import type { PreviewState } from "./design/context";
import { QuestionsPanel } from "./QuestionsPanel";
import { DesignPanel } from "./DesignPanel";
import { SettingsPanel } from "./SettingsPanel";
import { DraftStore, type SaveState } from "./draft";

export type Status = "draft" | "live" | "closed";
export type Update = (fn: (draft: FormModel) => void, opts?: { coalesce?: string }) => void;
export type Upload = (img: ProcessedImage) => Promise<{ path: string }>;
type Tab = "questions" | "design" | "settings";

export type BuilderProps = {
  initial: FormModel;
  orgId: string;
  orgSlug: string;
  orgName: string;
  assetBase: string;
  siteUrl: string;
  status: Status;
  publishedVersion: number;
  changedSincePublish: boolean;
  canDelete: boolean;
  /** Business brand colours (organizations.brand.colors); only owners and admins can change them. */
  brand: string[];
  canEditBrand: boolean;
  /** Other forms in the business, for "copy the design from another form". */
  otherForms: { id: string; title: string }[];
  /** Development harness only: saves stay in memory and nothing is sent to the server. */
  demo?: boolean;
};

export function Builder(props: BuilderProps) {
  const { orgId, orgSlug, orgName, assetBase, siteUrl } = props;
  const formId = props.initial.id;
  const [form, setForm] = useState<FormModel>(props.initial);
  const [tab, setTab] = useState<Tab>("questions");
  const [selected, setSelected] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [save, setSave] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(props.status);
  const [version, setVersion] = useState(props.publishedVersion);
  const [unpublished, setUnpublished] = useState(props.changedSincePublish || props.publishedVersion === 0);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [ps, setPs] = useState<PreviewState>({ ctx: "", state: "default" });
  const [brand, setBrandState] = useState<string[]>(props.brand);
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);
  const notify = useCallback((text: string) => setToast((t) => ({ text, n: (t?.n ?? 0) + 1 })), []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const [hist, setHist] = useState({ undo: false, redo: false });
  const [store] = useState(() => new DraftStore(
    props.initial,
    props.demo ? async () => ({ ok: true as const }) : (f) => saveDraft(toDraftInput(f)),
    (f) => { setForm(f); setUnpublished(true); },
    (st, err) => { setSave(st); setSaveError(err); },
  ));
  const syncHist = useCallback(() => setHist({ undo: store.canUndo, redo: store.canRedo }), [store]);
  const update: Update = useCallback((fn, opts) => { store.apply(fn, opts?.coalesce); syncHist(); }, [store, syncHist]);
  const undo = useCallback(() => { store.undo(); syncHist(); }, [store, syncHist]);
  const redo = useCallback(() => { store.redo(); syncHist(); }, [store, syncHist]);
  const doSave = useCallback(() => store.flush(), [store]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
    };
    const onUnload = (e: BeforeUnloadEvent) => { if (store.busy) e.preventDefault(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onUnload);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", onUnload); };
  }, [undo, redo, store]);

  const upload: Upload = useCallback(async (img) => {
    if (props.demo) throw new Error("Uploads need a connected Supabase project.");
    const supabase = createClient();
    const path = `${orgId}/forms/${formId}/${newId()}.${img.ext}`;
    const { error } = await supabase.storage.from("form-assets").upload(path, img.blob, { contentType: img.contentType, cacheControl: "31536000", upsert: false });
    if (error) throw new Error(/mime|type/i.test(error.message) ? "That file type isn't allowed. Use a PNG, JPG or WebP image." : /size|large/i.test(error.message) ? "That image is too large. Images can be up to 10 MB." : "The upload didn't go through. Check your connection and try again.");
    return { path };
  }, [orgId, formId, props.demo]);

  const setBrand = useCallback(async (colors: string[]): Promise<string | null> => {
    if (props.demo) { setBrandState(colors); return null; }
    const res = await updateBrandColors(orgId, colors);
    if (!res.ok) return res.error;
    setBrandState(res.colors ?? colors);
    return null;
  }, [orgId, props.demo]);

  /** Upload an image and add it as an artwork block before field `index`. */
  const insertArtwork = useCallback(async (file: File, index: number) => {
    try {
      const p = await processImage(file, 1400);
      const { path } = await upload(p);
      const f = blankField("image");
      f.config.img = { ...IMG_DEFAULT, src: { path }, name: p.name };
      update((d) => { d.fields.splice(Math.max(0, Math.min(index, d.fields.length)), 0, f); });
      setSelected(f.id);
      notify("Artwork added. Style it under Individual element styles.");
    } catch (ex) { notify((ex as Error).message); }
  }, [upload, update, notify]);

  const copyDesignFrom = useCallback(async (sourceId: string): Promise<string | null> => {
    const res = props.demo
      ? { ok: true as const, design: { theme: { page: "#12306B", card: "#FFFFFF", text: "#12213F", accent: "#FFC93C", accentText: "#141414", font: "sporty", radius: "square" } } }
      : await getFormDesign(sourceId);
    if (!res.ok) return res.error;
    const src = normalizeDesign(res.design);
    update((d) => {
      const keepArt = d.design.art, keepPalette = d.design.palette;
      d.design.theme = { ...src.theme, layout: d.design.theme.layout };
      d.design.shared = src.shared;
      d.design.page = src.page;
      d.design.card = src.card;
      d.design.adv = src.adv;
      for (const sid of ["__submit", "__next", "__prev"]) {
        if (src.el[sid]) d.design.el[sid] = src.el[sid]; else delete d.design.el[sid];
      }
      d.design.art = keepArt; d.design.palette = keepPalette;
    });
    return null;
  }, [update, props.demo]);

  function onPublish() {
    setBanner(null);
    startTransition(async () => {
      if (!(await doSave())) { setBanner({ kind: "error", text: "Fix the problem shown at the top before publishing." }); return; }
      const res = props.demo ? { ok: true as const, version: version + 1 } : await publishForm(form.id, orgSlug);
      if (!res.ok) { setBanner({ kind: "error", text: res.error }); return; }
      setVersion(res.version ?? version + 1);
      setStatus("live");
      setUnpublished(false);
      setBanner({ kind: "success", text: "Published. Customers now see this version." });
    });
  }
  function onStatus(next: Status) {
    setBanner(null);
    startTransition(async () => {
      const res = props.demo ? { ok: true as const } : await setFormStatus(form.id, orgSlug, next);
      if (!res.ok) { setBanner({ kind: "error", text: res.error }); return; }
      setStatus(next);
      setBanner({ kind: "success", text: next === "closed" ? "Form closed. Customers see a closed message." : next === "live" ? "Form reopened." : "Form moved back to draft. The public link stops working." });
    });
  }

  function onSelect(sid: string) {
    setSelected(sid);
    setPs({ ctx: "", state: "default" });
    if (tab === "settings") setTab("questions");
  }
  function pickTab(k: Tab) {
    setTab(k);
    setPs({ ctx: "", state: "default" });
  }
  const forced = tab === "design" && ps.state !== "default" ? ps : null;

  const publicUrl = `${siteUrl}/f/${orgSlug}/${form.slug}`;
  const saveText = { saved: "All changes saved", dirty: "Unsaved changes…", saving: "Saving…", error: "Not saved" }[save];

  return (
    <div className="b-shell">
      <div className="b-top">
        <Link className="btn ghost small" href={`/w/${orgSlug}/forms`}>← All forms</Link>
        <h1 className="b-title">{form.title || "Untitled form"}</h1>
        <span className={`pill ${status === "live" ? "good" : status === "closed" ? "bad" : "plain"}`}>{status === "live" ? "Live" : status === "closed" ? "Closed" : "Draft"}</span>
        {version > 0 && unpublished && <span className="pill warn">Unpublished changes</span>}
        <span className={`b-save ${save}`} role="status" aria-live="polite">{saveText}</span>
        <span className="b-sp" />
        <div className="b-seg sm">
          <button type="button" onClick={undo} disabled={!hist.undo} title="Undo (Ctrl+Z)">↶ Undo</button>
          <button type="button" onClick={redo} disabled={!hist.redo} title="Redo (Ctrl+Shift+Z)">↷ Redo</button>
        </div>
        {status === "live" && <a className="btn small" href={publicUrl} target="_blank" rel="noopener noreferrer">Open live form ↗</a>}
        <button type="button" className="btn small primary" onClick={onPublish} disabled={pending || save === "error"}>
          {pending ? "Working…" : version === 0 ? "Publish form" : unpublished ? "Publish changes" : "Published"}
        </button>
      </div>
      {saveError && <div className="notice error b-banner" role="alert">{saveError}</div>}
      {banner && <div className={`notice ${banner.kind} b-banner`} role={banner.kind === "error" ? "alert" : "status"}>{banner.text}</div>}

      {toast && <div className="b-toast" role="status" key={toast.n}>{toast.text}</div>}
      <div className="b-grid">
        <section className="panel b-panel" aria-label="Form settings">
          <div className="b-tabs" role="tablist">
            {(["questions", "design", "settings"] as Tab[]).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => pickTab(k)}>
                {{ questions: "Questions", design: "Design", settings: "Settings" }[k]}
              </button>
            ))}
          </div>
          <div className="b-body">
            {tab === "questions" && <QuestionsPanel form={form} update={update} selected={selected} setSelected={setSelected} upload={upload} assetBase={assetBase} />}
            {tab === "design" && (
              <DesignPanel form={form} update={update} selected={selected} setSelected={setSelected} upload={upload} assetBase={assetBase}
                ps={ps} setPs={setPs} brand={brand} setBrand={setBrand} canEditBrand={props.canEditBrand} otherForms={props.otherForms}
                copyDesignFrom={copyDesignFrom} insertArtwork={insertArtwork} notify={notify} />
            )}
            {tab === "settings" && (
              <SettingsPanel form={form} update={update} orgSlug={orgSlug} siteUrl={siteUrl} status={status} version={version}
                onStatus={onStatus} pending={pending} canDelete={props.canDelete} />
            )}
          </div>
        </section>
        <section className="b-prev" aria-label="Form preview">
          <div className="b-prev-bar">
            <span>Live preview · click any part of the form to {tab === "design" ? "style" : "edit"} it</span>
            {forced && (
              <span className="ps-bar">
                <span className="pill warn">Showing {forced.state} state</span>
                <button type="button" className="linkbtn" onClick={() => setPs({ ctx: "", state: "default" })}>Show default</button>
              </span>
            )}
            <div className="b-seg sm">
              {(["desktop", "phone"] as const).map((d) => (
                <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)}>{d === "desktop" ? "Desktop" : "Phone"}</button>
              ))}
            </div>
          </div>
          <div className={`b-frame ${device}`}>
            <FormRenderer form={form} assetBase={assetBase} mode="edit" businessName={orgName} selected={selected} onSelect={onSelect}
              forced={forced ? { state: forced.state, sid: forced.ctx === "e" ? selected : null, kind: forced.ctx.startsWith("g.") ? forced.ctx.slice(2) : null } : null}
              onInsertArtwork={(index, file) => void insertArtwork(file, index)} />
          </div>
        </section>
      </div>
    </div>
  );
}
