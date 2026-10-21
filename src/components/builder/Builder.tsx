"use client";

import "./builder.css";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { FormRenderer } from "@/components/form/FormRenderer";
import { newId, type FormModel } from "@/lib/design/engine";
import type { ProcessedImage } from "@/lib/design/image";
import { createClient } from "@/lib/supabase/client";
import { toDraftInput } from "@/lib/validation/form";
import { publishForm, saveDraft, setFormStatus } from "@/server/actions/forms";
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
    if (tab === "settings") setTab("questions");
  }

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

      <div className="b-grid">
        <section className="panel b-panel" aria-label="Form settings">
          <div className="b-tabs" role="tablist">
            {(["questions", "design", "settings"] as Tab[]).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                {{ questions: "Questions", design: "Design", settings: "Settings" }[k]}
              </button>
            ))}
          </div>
          <div className="b-body">
            {tab === "questions" && <QuestionsPanel form={form} update={update} selected={selected} setSelected={setSelected} upload={upload} assetBase={assetBase} />}
            {tab === "design" && <DesignPanel form={form} update={update} selected={selected} setSelected={setSelected} upload={upload} assetBase={assetBase} />}
            {tab === "settings" && (
              <SettingsPanel form={form} update={update} orgSlug={orgSlug} siteUrl={siteUrl} status={status} version={version}
                onStatus={onStatus} pending={pending} canDelete={props.canDelete} />
            )}
          </div>
        </section>
        <section className="b-prev" aria-label="Form preview">
          <div className="b-prev-bar">
            <span>Live preview · click any part of the form to {tab === "design" ? "style" : "edit"} it</span>
            <div className="b-seg sm">
              {(["desktop", "phone"] as const).map((d) => (
                <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)}>{d === "desktop" ? "Desktop" : "Phone"}</button>
              ))}
            </div>
          </div>
          <div className={`b-frame ${device}`}>
            <FormRenderer form={form} assetBase={assetBase} mode="edit" businessName={orgName} selected={selected} onSelect={onSelect} />
          </div>
        </section>
      </div>
    </div>
  );
}
