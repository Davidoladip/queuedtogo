"use client";

import { CopyField } from "@/components/ui/CopyField";
import { CHANNELS, type FormModel } from "@/lib/design/engine";
import { CONSENT_VARS, DEFAULT_CONSENT, DEFAULT_THANKS, THANKS_VARS, fillMessage, unknownPlaceholders } from "@/lib/design/media";
import { deleteForm } from "@/server/actions/forms";
import { Select, TextInput, Toggle } from "./controls";
import type { Status, Update } from "./Builder";

type Props = {
  form: FormModel; update: Update; orgSlug: string; siteUrl: string; status: Status; version: number;
  onStatus: (s: Status) => void; pending: boolean; canDelete: boolean; orgName: string;
  /** Show the thank-you screen in the preview. */
  onPreviewThanks: () => void;
};

/** A customer-facing message: editor, placeholder check, preview and reset. */
function MessageEditor({ label, value, fallback, vars, sample, onChange, hint, maxLength }: {
  label: string; value: string; fallback: string; vars: readonly string[]; sample: Record<string, string>;
  onChange: (v: string) => void; hint: string; maxLength: number;
}) {
  const unknown = unknownPlaceholders(value, vars);
  return (
    <div className="b-field">
      <TextInput label={label} multiline value={value} maxLength={maxLength} onChange={onChange}
        hint={<>{hint} You can use {vars.map((v, i) => <span key={v}>{i ? ", " : ""}<code>{`{${v}}`}</code></span>)}.</>} />
      {unknown.length > 0 && (
        <span className="b-warn" role="alert">
          {unknown.map((u) => `{${u}}`).join(", ")} {unknown.length === 1 ? "isn't a placeholder this message supports" : "aren't placeholders this message supports"}, so customers will see {unknown.length === 1 ? "it" : "them"} exactly as typed.
        </span>
      )}
      <span className="b-label">Preview</span>
      <div className="b-msg-prev" aria-live="polite">{fillMessage(value.trim() ? value : fallback, sample)}</div>
      {value !== fallback && <button type="button" className="linkbtn" style={{ alignSelf: "flex-start" }} onClick={() => onChange(fallback)}>Reset to the default message</button>}
    </div>
  );
}

export function SettingsPanel({ form, update, orgSlug, siteUrl, status, version, onStatus, pending, canDelete, orgName, onPreviewThanks }: Props) {
  const channel = CHANNELS[form.settings.notify.channel];
  const consent = form.settings.notify.consentText;
  const slugOk = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/.test(form.slug);
  return (
    <div className="stack">
      <section className="b-card form">
        <h3>Event details</h3>
        <TextInput label="Form title" value={form.title} maxLength={140} onChange={(v) => update((d) => { d.title = v; }, { coalesce: "title" })} />
        <div className="row">
          <TextInput label="Event date" type="date" value={form.eventDate ?? ""} onChange={(v) => update((d) => { d.eventDate = v || null; })} />
          <TextInput label="Venue" value={form.venue} maxLength={140} placeholder="e.g. Pier 3, Harbourfront" onChange={(v) => update((d) => { d.venue = v; }, { coalesce: "venue" })} />
        </div>
        <TextInput
          label="Form address"
          prefix={`/f/${orgSlug}/`}
          value={form.slug}
          maxLength={60}
          onChange={(v) => update((d) => { d.slug = v.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-").slice(0, 60); }, { coalesce: "slug" })}
          hint={slugOk ? "Changing the address breaks links you have already shared." : "Use 2 to 60 lowercase letters, numbers and dashes, not starting or ending with a dash."}
        />
      </section>

      <section className="b-card form">
        <h3>Messages customers see</h3>
        <MessageEditor label="Thank-you message" value={form.thanks} fallback={DEFAULT_THANKS} vars={THANKS_VARS} maxLength={2000}
          sample={{ order_number: "QTG-1001", business: orgName, form_title: form.title }}
          hint="Shown after a customer submits, with their order number."
          onChange={(v) => update((d) => { d.thanks = v; }, { coalesce: "thanks" })} />
        <button type="button" className="btn small" style={{ alignSelf: "flex-start" }} onClick={onPreviewThanks}>Show the thank-you screen in the preview</button>
        {form.settings.notify.consent && (
          <>
            <MessageEditor label="Permission checkbox text" value={consent} fallback={DEFAULT_CONSENT} vars={CONSENT_VARS} maxLength={300}
              sample={{ channel, business: orgName }}
              hint="Shown next to the checkbox above the submit button."
              onChange={(v) => update((d) => { d.settings.notify.consentText = v; }, { coalesce: "consent" })} />
            {form.settings.notify.channel !== "email" && !/\bstop\b/i.test(consent) && (
              <span className="b-warn">For text messages, US rules expect you to say how to opt out, for example “Reply STOP to opt out.”</span>
            )}
          </>
        )}
      </section>

      <section className="b-card form">
        <h3>Customer updates</h3>
        <Toggle label="Ask customers for permission to send order updates" checked={form.settings.notify.consent}
          onChange={(v) => update((d) => { d.settings.notify.consent = v; })} hint="Adds a checkbox above the submit button. US rules require consent before texting." />
        <Select label="Send updates by" value={form.settings.notify.channel} options={Object.entries(CHANNELS) as ["sms", string][]}
          onChange={(v) => update((d) => { d.settings.notify.channel = v; })} />
        <p className="muted b-note">Messages aren&apos;t sent yet. Sending is connected in a later stage.</p>
      </section>

      <section className="b-card form">
        <h3>Publishing</h3>
        {version > 0 ? (
          <>
            <p className="b-note">Published version {version}. Customers see the published version until you publish again.</p>
            <span className="b-label">Public link</span>
            <CopyField label="Copy link" value={`${siteUrl}/f/${orgSlug}/${form.slug}`} />
          </>
        ) : (
          <p className="b-note muted">Not published yet. Use <b>Publish form</b> at the top when it&apos;s ready.</p>
        )}
        <div className="b-row-actions">
          {status === "live" && <button type="button" className="btn small" disabled={pending} onClick={() => onStatus("closed")}>Close form</button>}
          {status === "closed" && <button type="button" className="btn small" disabled={pending} onClick={() => onStatus("live")}>Reopen form</button>}
          {status !== "draft" && <button type="button" className="btn small" disabled={pending} onClick={() => onStatus("draft")}>Back to draft</button>}
        </div>
      </section>

      {canDelete && (
        <section className="b-card form">
          <h3>Delete form</h3>
          <p className="b-note muted">Deletes the form, its questions and its design. This can&apos;t be undone.</p>
          <form action={deleteForm} onSubmit={(e) => { if (!confirmDelete(form.title)) e.preventDefault(); }}>
            <input type="hidden" name="formId" value={form.id} />
            <input type="hidden" name="orgSlug" value={orgSlug} />
            <button type="submit" className="btn small danger">Delete this form</button>
          </form>
        </section>
      )}
    </div>
  );
}

function confirmDelete(title: string) {
  return window.confirm(`Delete "${title}"? This can't be undone.`);
}
