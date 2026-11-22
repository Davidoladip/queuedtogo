"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { FormModel } from "@/lib/design/engine";
import type { FlyerSpec } from "@/lib/design/flyer";
import type { TemplateGroup } from "@/lib/templates";
import { createForm } from "@/server/actions/forms";
import { initialState } from "@/lib/validation/form-state";
import { DemoForm } from "@/components/demo/DemoForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";
import { Flyer } from "./Flyer";

export type GalleryItem = { key: string; group: TemplateGroup; name: string; blurb: string; example: string; form: FormModel; spec: FlyerSpec };

const BLANK = "blank";

/**
 * Templates grouped by what the event needs. Choosing one shows it working (a live preview: nothing is saved)
 * next to the name field that creates the form from it. On phones the preview opens as a full-screen sheet.
 */
export function TemplateGallery({ orgId, groups, items, assetBase, initial }: {
  orgId: string; groups: { key: TemplateGroup; title: string; blurb: string }[]; items: GalleryItem[]; assetBase: string; initial: string | null;
}) {
  const [picked, setPicked] = useState<string | null>(initial);
  const [state, action] = useActionState(createForm, initialState);
  const panel = useRef<HTMLDivElement>(null);
  const item = items.find((i) => i.key === picked) ?? null;

  // Move focus to the panel when a template is picked, so keyboard and screen reader users land on it.
  useEffect(() => {
    if (picked) panel.current?.focus({ preventScroll: window.matchMedia("(min-width: 980px)").matches });
  }, [picked]);
  useEffect(() => {
    if (!picked) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !window.matchMedia("(min-width: 980px)").matches) setPicked(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked]);

  return (
    <div className={`tpl${picked ? " tpl-open" : ""}`}>
      <div className="tpl-list">
        {groups.map((g) => (
          <section key={g.key} className="tpl-group" aria-labelledby={`tg-${g.key}`}>
            <div className="tpl-group-head">
              <h2 id={`tg-${g.key}`}>{g.title}</h2>
              <p>{g.blurb}</p>
            </div>
            <ul className="tpl-grid">
              {items.filter((i) => i.group === g.key).map((i) => (
                <li key={i.key}>
                  <button type="button" className="tpl-tile" aria-pressed={picked === i.key} onClick={() => setPicked(i.key)}>
                    <Flyer spec={i.spec} title={i.form.title} meta={i.form.venue || undefined} button={i.form.submitLabel} />
                    <span className="tpl-name">{i.name}</span>
                    <span className="tpl-blurb">{i.blurb}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <section className="tpl-group tpl-blank" aria-labelledby="tg-blank">
          <div className="tpl-group-head">
            <h2 id="tg-blank">Start from scratch</h2>
            <p>A plain form with a few common order questions, on the default look.</p>
          </div>
          <button type="button" className="btn" aria-pressed={picked === BLANK} onClick={() => setPicked(BLANK)}>Use a blank form</button>
        </section>
      </div>

      <div className="tpl-panel" ref={panel} tabIndex={-1} role="region" aria-label={item ? `${item.name} template` : picked === BLANK ? "Blank form" : "Preview"}>
        {picked ? (
          <>
            <div className="tpl-panel-head">
              <div>
                <h2>{item ? item.name : "Blank form"}</h2>
                <p>{item ? item.blurb : "Your name, mobile number, a choice of items and a notes box."}</p>
              </div>
              <button type="button" className="btn small ghost tpl-close" onClick={() => setPicked(null)}>Back to templates</button>
            </div>
            <form action={action} className="tpl-create" noValidate>
              <input type="hidden" name="orgId" value={orgId} />
              <input type="hidden" name="template" value={picked} />
              <label htmlFor="tpl-title">Event name</label>
              <div className="nf-row">
                <input id="tpl-title" name="title" maxLength={140} placeholder={item ? `e.g. ${item.example}` : "e.g. Harbourfront Food Fest"}
                  defaultValue={state.values?.title} autoComplete="off"
                  aria-invalid={state.fieldErrors?.title ? true : undefined} aria-describedby={state.fieldErrors?.title ? "tpl-err" : undefined} />
                <SubmitButton pendingText="Creating…">Create form</SubmitButton>
              </div>
              {state.fieldErrors?.title && <span className="err" id="tpl-err">{state.fieldErrors.title}</span>}
              {state.error && <Notice tone="error">{state.error}</Notice>}
            </form>
            {item ? (
              <figure className="tpl-preview">
                <div className="tpl-phone">
                  <DemoForm key={item.key} form={item.form} assetBase={assetBase} />
                </div>
                <figcaption>Try it: the preview works like the real form, and nothing you type is saved.</figcaption>
              </figure>
            ) : (
              <p className="muted tpl-blank-note">You&apos;ll pick colours, fonts and questions in the builder.</p>
            )}
          </>
        ) : (
          <div className="tpl-hint">
            <b>Pick a template to preview it</b>
            <span>You&apos;ll see it working here, then name your event to create it.</span>
          </div>
        )}
      </div>
    </div>
  );
}
