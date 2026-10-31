"use client";

import { CopyField } from "@/components/ui/CopyField";
import { FormQr } from "./FormQr";
import { CHANNELS, COVER_VARS, blankField, coverDefaults, initialsOf, type FormModel } from "@/lib/design/engine";
import { artDefaultFor } from "@/lib/design/media";
import { LOOKS } from "@/lib/design/looks";
import { ArtQuick, ArtUploader } from "./media-controls";
import { DEFAULT_RSVP_CONSENT, DEFAULT_RSVP_THANKS, DEFAULT_RSVP_TITLES, RSVP_CONSENT_VARS, RSVP_SUBMIT_LABEL, RSVP_THANKS_VARS, type RsvpTitles } from "@/lib/rsvp";
import { CONSENT_VARS, DEFAULT_CONSENT, DEFAULT_THANKS, THANKS_VARS, fillMessage, unknownPlaceholders } from "@/lib/design/media";
import { deleteForm } from "@/server/actions/forms";
import { ColorInput, Seg, Select, TextInput, Toggle } from "./controls";
import type { Status, Update, Upload } from "./Builder";

type Props = {
  form: FormModel; update: Update; orgSlug: string; siteUrl: string; status: Status; version: number;
  onStatus: (s: Status) => void; pending: boolean; canDelete: boolean; orgName: string;
  /** Show the thank-you screen in the preview (for RSVP forms, optionally for one kind of reply). */
  onPreviewThanks: (reply?: "yes" | "no" | "maybe" | "wait") => void;
  /** RSVP texts are available on QueuedToGo (the texting campaign covers them). */
  rsvpTextsApproved: boolean;
  upload: Upload;
  assetBase: string;
  /** Show the cover page in the preview. */
  onPreviewCover: () => void;
  /** Open an element's styles in the Design tab. */
  openDesign: (sid: string) => void;
  /** Play the cover's opening in the preview. */
  onPlayOpening: () => void;
  /** Show the sealed envelope in the preview. */
  onPreviewEnvelope: () => void;
};

/** Offering texts needs a mobile number question; add an optional one if the form has none. */
function offerTexts(d: FormModel, on: boolean) {
  d.settings.rsvp.texts = on;
  if (on && !d.fields.some((f) => f.type === "phone")) {
    const p = blankField("phone");
    p.label = "Mobile number";
    p.help = "Only if you'd like texts about this event.";
    const at = d.fields.findIndex((f) => f.type === "submit");
    d.fields.splice(at < 0 ? d.fields.length : at, 0, p);
  }
}

/** Turns a form into an RSVP form: adds the RSVP question (and name and email, if missing) and RSVP wording. */
/** Cover wording that is still the default follows the form type. */
function swapCoverDefaults(d: FormModel, from: "order" | "rsvp") {
  const a = coverDefaults(from), b = coverDefaults(d.settings.mode);
  for (const k of ["heading", "text", "button"] as const) if (d.settings.cover[k] === a[k]) d.settings.cover[k] = b[k];
}
function makeRsvp(d: FormModel) {
  d.settings.mode = "rsvp";
  swapCoverDefaults(d, "order");
  if (!d.fields.some((f) => f.type === "rsvp")) {
    const add = [];
    if (!d.fields.some((f) => f.type === "short")) { const n = blankField("short"); n.label = "Your name"; n.required = true; add.push(n); }
    if (!d.fields.some((f) => f.type === "email")) { const e = blankField("email"); e.required = true; e.help = "We'll email your confirmation and a link to change your reply."; add.push(e); }
    add.push(blankField("rsvp"));
    const at = d.fields.findIndex((f) => f.type === "submit");
    d.fields.splice(at < 0 ? d.fields.length : at, 0, ...add);
  }
  if (["Submit", "Place my order", "Send order", ""].includes(d.submitLabel.trim())) d.submitLabel = RSVP_SUBMIT_LABEL;
  if (d.thanks.trim() === DEFAULT_THANKS) d.thanks = "";
}
function makeOrder(d: FormModel) {
  d.settings.mode = "order";
  swapCoverDefaults(d, "rsvp");
  if (d.submitLabel === RSVP_SUBMIT_LABEL) d.submitLabel = "Submit";
  if (d.thanks.trim() === DEFAULT_RSVP_THANKS) d.thanks = "";
}

const TITLE_LABELS: [keyof RsvpTitles, string][] = [["yes", "Headline when a guest says yes"], ["maybe", "…says maybe"], ["no", "…says no"], ["wait", "…joins the waitlist"]];

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

export function SettingsPanel({ form, update, orgSlug, siteUrl, status, version, onStatus, pending, canDelete, orgName, onPreviewThanks, rsvpTextsApproved, upload, assetBase, onPreviewCover, openDesign, onPlayOpening, onPreviewEnvelope }: Props) {
  const channel = CHANNELS[form.settings.notify.channel];
  const consent = form.settings.notify.consentText;
  const slugOk = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/.test(form.slug);
  const isRsvp = form.settings.mode === "rsvp";
  const r = form.settings.rsvp;
  const hasRsvpQ = form.fields.some((f) => f.type === "rsvp");
  return (
    <div className="stack">
      <section className="b-card form">
        <h3>Form type</h3>
        <Seg label="This form is" value={form.settings.mode} options={[["order", "An order form"], ["rsvp", "An RSVP"]]}
          onChange={(v) => update((d) => { if (v === "rsvp") makeRsvp(d); else makeOrder(d); })} />
        <p className="muted b-note">
          {isRsvp
            ? "Replies go to the Guests page (not the production board). Guests can say yes, no or maybe and bring plus-ones. Publish to apply."
            : "Orders go to the production board with an order number and a tracking page. Publish to apply."}
        </p>
        {isRsvp && !hasRsvpQ && <span className="b-warn" role="alert">This RSVP form has no RSVP question. Add one in Questions (“RSVP (yes / no / maybe)”).</span>}
        {!isRsvp && hasRsvpQ && <span className="b-note muted">The RSVP question stays on the form as an ordinary question. Remove it in Questions if you don&apos;t need it.</span>}
      </section>

      <section className="b-card form" id="cover">
        <h3>Cover page</h3>
        <Toggle label="Show a cover page first" checked={form.settings.cover.on}
          onChange={(v) => { update((d) => { d.settings.cover.on = v; }); if (v) onPreviewCover(); }}
          hint={isRsvp ? "Guests open your link to an invitation, then press its button to RSVP. Same link, no extra page to share." : "Customers see a welcome page first, then press its button to open the order form. Same link."} />
        {form.settings.cover.on && (
          <>
            <TextInput label="Cover heading" value={form.settings.cover.heading} maxLength={120} onChange={(v) => update((d) => { d.settings.cover.heading = v; }, { coalesce: "cvh" })} />
            <TextInput label="Cover message" multiline value={form.settings.cover.text} maxLength={1000}
              hint={<>Optional. Line breaks are kept. You can use {COVER_VARS.map((v, i) => <span key={v}>{i ? ", " : ""}<code>{`{${v}}`}</code></span>)}.</>}
              onChange={(v) => update((d) => { d.settings.cover.text = v; }, { coalesce: "cvt" })} />
            <TextInput label="Button text" value={form.settings.cover.button} maxLength={60} onChange={(v) => update((d) => { d.settings.cover.button = v; }, { coalesce: "cvb" })} />
            <span className="b-label">Cover artwork (for example your invitation card)</span>
            <ArtUploader art={form.design.coverArt} assetBase={assetBase} upload={upload} label="cover artwork"
              onUploaded={(path, name) => update((d) => { d.design.coverArt = { ...(d.design.coverArt ?? artDefaultFor("cover")), src: { path }, name }; })}
              onRemove={() => update((d) => { d.design.coverArt = null; })} />
            {form.design.coverArt && (
              <ArtQuick asTitle art={form.design.coverArt} set={(k, v) => update((d) => { if (d.design.coverArt) (d.design.coverArt as Record<string, unknown>)[k] = v; }, { coalesce: "cart:" + k })} />
            )}
            <span className="b-label">Finish</span>
            <Seg label="When the button is pressed" value={form.settings.cover.effect}
              options={[["fade", "Form fades in"], ["unveil", "Card parts to reveal it"], ["none", "No effect"]]}
              onChange={(v) => update((d) => { d.settings.cover.effect = v; })} />
            <Seg label="Frame" value={form.settings.cover.frame} options={[["none", "None"], ["line", "Fine line"], ["double", "Double line"]]}
              onChange={(v) => update((d) => { d.settings.cover.frame = v; })} />
            <Toggle label="Gold foil heading" checked={form.settings.cover.foil} onChange={(v) => update((d) => { d.settings.cover.foil = v; })}
              hint="A soft metallic shine on the heading, made from your button colour (Design → Global theme → Buttons)." />
            <Toggle label="Start in a sealed envelope" checked={form.settings.cover.envelope.on}
              onChange={(v) => { update((d) => { d.settings.cover.envelope.on = v; }); if (v) onPreviewEnvelope(); }}
              hint="Guests first see a sealed envelope. They tap the seal, the flap lifts and your invitation slides out." />
            {form.settings.cover.envelope.on && (
              <div className="b-env form">
                <ColorInput label="Envelope colour" allowEmpty value={form.settings.cover.envelope.color} onChange={(v) => update((d) => { d.settings.cover.envelope.color = v; }, { coalesce: "envc" })} />
                <ColorInput label="Liner and seal colour" allowEmpty value={form.settings.cover.envelope.liner} onChange={(v) => update((d) => { d.settings.cover.envelope.liner = v; }, { coalesce: "envl" })} />
                <span className="b-note muted">Leave a colour empty to use your form colour (envelope) and button colour (liner and seal).</span>
                <Seg label="On the seal" value={form.settings.cover.envelope.seal}
                  options={[["emblem", form.design.coverArt ? "Your emblem" : "Emblem (add cover artwork)"], ["initials", "Initials"], ["plain", "Plain"]]}
                  onChange={(v) => update((d) => { d.settings.cover.envelope.seal = v; })} />
                {form.settings.cover.envelope.seal === "initials" && (
                  <TextInput label="Initials" value={form.settings.cover.envelope.initials} maxLength={3} placeholder={initialsOf(form.title)}
                    onChange={(v) => update((d) => { d.settings.cover.envelope.initials = v; }, { coalesce: "envi" })} />
                )}
                <TextInput label="Writing on the envelope" value={form.settings.cover.envelope.front} maxLength={80} placeholder="e.g. For our honoured guest"
                  hint="Optional. Written in the cover heading's font." onChange={(v) => update((d) => { d.settings.cover.envelope.front = v; }, { coalesce: "envf" })} />
                <TextInput label="Line under the envelope" value={form.settings.cover.envelope.prompt} maxLength={60}
                  onChange={(v) => update((d) => { d.settings.cover.envelope.prompt = v; }, { coalesce: "envp" })} />
                <button type="button" className="btn small" style={{ alignSelf: "flex-start" }} onClick={onPreviewEnvelope}>Show the envelope in the preview</button>
              </div>
            )}
            <Toggle label="Subtle sparkle" checked={form.settings.cover.sparkle} onChange={(v) => update((d) => { d.settings.cover.sparkle = v; })}
              hint="A few small twinkles around the edges, in your button colour. Still for visitors who turn motion off." />
            <div className="b-row-actions">
              <button type="button" className="btn small" onClick={onPreviewCover}>Show the cover in the preview</button>
              {(form.settings.cover.effect !== "none" || form.settings.cover.envelope.on) && <button type="button" className="btn small" onClick={onPlayOpening}>Play the opening</button>}
              <button type="button" className="linkbtn" onClick={() => openDesign("__ctitle")}>Style the cover in Design →</button>
            </div>
            <div className="b-look">
              <b>{LOOKS.luxury.label}</b>
              <span className="muted">{LOOKS.luxury.description}{form.design.coverArt ? " Your cover artwork becomes the emblem at the top." : ""}</span>
              <button type="button" className="btn small" onClick={() => { update((d) => LOOKS.luxury.apply(d)); onPreviewCover(); }}>Apply this look</button>
              <small className="muted">Changes colours, fonts and button styles across the form. Use Undo at the top to go back.</small>
            </div>
          </>
        )}
      </section>

      <section className="b-card form">
        <h3>Event details</h3>
        <TextInput label="Form title" value={form.title} maxLength={140} onChange={(v) => update((d) => { d.title = v; }, { coalesce: "title" })} />
        <div className="row">
          <TextInput label="Event date" type="date" value={form.eventDate ?? ""} onChange={(v) => update((d) => { d.eventDate = v || null; })} />
          <TextInput label="Venue" value={form.venue} maxLength={140} placeholder="e.g. Pier 3, Harbourfront" onChange={(v) => update((d) => { d.venue = v; }, { coalesce: "venue" })} />
        </div>
        {isRsvp && (
          <div className="row">
            <TextInput label="Starts at" type="time" value={r.start} onChange={(v) => update((d) => { d.settings.rsvp.start = v; })} />
            <TextInput label="Ends at" type="time" value={r.end} onChange={(v) => update((d) => { d.settings.rsvp.end = v; })} />
          </div>
        )}
        {isRsvp && !form.eventDate && <span className="b-note muted">Add the event date so guests can add it to their calendar and get a reminder.</span>}
        <TextInput
          label="Form address"
          prefix={`/f/${orgSlug}/`}
          value={form.slug}
          maxLength={60}
          onChange={(v) => update((d) => { d.slug = v.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-").slice(0, 60); }, { coalesce: "slug" })}
          hint={slugOk ? "Changing the address breaks links you have already shared." : "Use 2 to 60 lowercase letters, numbers and dashes, not starting or ending with a dash."}
        />
      </section>

      {isRsvp && (
        <section className="b-card form">
          <h3>Guests</h3>
          <TextInput label="Guest limit" type="number" value={r.capacity == null ? "" : String(r.capacity)} placeholder="No limit"
            hint="The most people (including plus-ones) who can say yes. Leave empty for no limit. Maybes don't count."
            onChange={(v) => update((d) => { const n = Math.floor(Number(v)); d.settings.rsvp.capacity = v.trim() && n > 0 ? Math.min(n, 99999) : null; }, { coalesce: "cap" })} />
          {r.capacity != null && (
            <Toggle label="When it's full, keep a waitlist" checked={r.waitlist} onChange={(v) => update((d) => { d.settings.rsvp.waitlist = v; })}
              hint={r.waitlist ? "Later guests join the waitlist. When someone cancels, the next guest gets the place and an email." : "When it's full, the form says the event is full."} />
          )}
          <TextInput label="Reply by (last day)" type="date" value={r.deadline ?? ""} onChange={(v) => update((d) => { d.settings.rsvp.deadline = v || null; })}
            hint="After this day the form closes. Guests can still cancel. Leave empty to keep it open." />
          <Toggle label="Guests can change or cancel their reply" checked={r.allowChange} onChange={(v) => update((d) => { d.settings.rsvp.allowChange = v; })}
            hint="From the link in their confirmation email and thank-you screen." />
          <Toggle label="Email a reminder the day before" checked={r.reminder} onChange={(v) => update((d) => { d.settings.rsvp.reminder = v; })}
            hint="To guests who said yes or maybe and gave an email address. Needs the event date, and email switched on in Notifications." />
        </section>
      )}

      <section className="b-card form">
        <h3>Messages {isRsvp ? "guests" : "customers"} see</h3>
        {isRsvp ? (
          <>
            {TITLE_LABELS.map(([k, label]) => (
              <TextInput key={k} label={label} value={r.titles[k]} maxLength={80} placeholder={DEFAULT_RSVP_TITLES[k]}
                onChange={(v) => update((d) => { d.settings.rsvp.titles[k] = v; }, { coalesce: "rt" + k })} />
            ))}
            <MessageEditor label="Thank-you message" value={form.thanks} fallback={DEFAULT_RSVP_THANKS} vars={RSVP_THANKS_VARS} maxLength={2000}
              sample={{ name: "Sam", business: orgName, form_title: form.title, guests: "2 people" }}
              hint="Shown under the headline after a guest replies."
              onChange={(v) => update((d) => { d.thanks = v; }, { coalesce: "thanks" })} />
            <div className="b-row-actions">
              {(["yes", "maybe", "no", "wait"] as const).map((k) => (
                <button key={k} type="button" className="btn small" onClick={() => onPreviewThanks(k)}>Preview {k === "wait" ? "waitlist" : `"${k}"`}</button>
              ))}
            </div>
          </>
        ) : (
          <>
            <MessageEditor label="Thank-you message" value={form.thanks} fallback={DEFAULT_THANKS} vars={THANKS_VARS} maxLength={2000}
              sample={{ order_number: "QTG-1001", business: orgName, form_title: form.title }}
              hint="Shown after a customer submits, with their order number."
              onChange={(v) => update((d) => { d.thanks = v; }, { coalesce: "thanks" })} />
            <button type="button" className="btn small" style={{ alignSelf: "flex-start" }} onClick={() => onPreviewThanks()}>Show the thank-you screen in the preview</button>
          </>
        )}
        {form.settings.notify.consent && !isRsvp && (
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

      {isRsvp ? (
        <section className="b-card form">
          <h3>Guest emails and texts</h3>
          <p className="muted b-note">Guests who give an email address get a confirmation{r.reminder ? ", a reminder the day before" : ""}{r.capacity != null && r.waitlist ? " and an email if they come off the waitlist" : ""}. Email is switched on, and the contact address set, on the Notifications page.</p>
          <Toggle label="Offer texts to guests" checked={r.texts} onChange={(v) => update((d) => offerTexts(d, v))}
            hint="Adds a permission checkbox (never ticked for them). Guests who tick it and give a mobile number get the same messages by text. Texting must also be on in Notifications." />
          {r.texts && !rsvpTextsApproved && (
            <span className="b-warn" role="status">Texts for RSVPs aren&apos;t switched on for QueuedToGo yet, so guests won&apos;t see the checkbox and no texts are sent. They start once QueuedToGo&apos;s texting registration covers event RSVPs.</span>
          )}
          {r.texts && (
            <>
              <MessageEditor label="Permission checkbox text" value={r.consentText} fallback={DEFAULT_RSVP_CONSENT} vars={RSVP_CONSENT_VARS} maxLength={300}
                sample={{ business: orgName }} hint="Shown next to the checkbox above the RSVP button."
                onChange={(v) => update((d) => { d.settings.rsvp.consentText = v; }, { coalesce: "rconsent" })} />
              {!/\bstop\b/i.test(r.consentText) && <span className="b-warn">US texting rules expect you to say how to opt out, for example “Reply STOP to opt out.”</span>}
              {!form.fields.some((f) => f.type === "phone") && <span className="b-warn" role="alert">Add a mobile number question in Questions, or guests can&apos;t get texts.</span>}
            </>
          )}
        </section>
      ) : (
      <section className="b-card form">
        <h3>Customer updates</h3>
        <Toggle label="Ask customers for permission to send order updates" checked={form.settings.notify.consent}
          onChange={(v) => update((d) => { d.settings.notify.consent = v; })} hint="Adds a checkbox above the submit button. US rules require consent before texting." />
        <Select label="Send updates by" value={form.settings.notify.channel} options={Object.entries(CHANNELS) as ["sms", string][]}
          onChange={(v) => update((d) => { d.settings.notify.channel = v; })} />
        <p className="muted b-note">Texts and emails are switched on, and each stage&apos;s message is written, on the Notifications page.</p>
      </section>
      )}

      <section className="b-card form">
        <h3>Publishing</h3>
        {version > 0 ? (
          <>
            <p className="b-note">Published version {version}. Customers see the published version until you publish again.</p>
            <span className="b-label">Public link</span>
            <CopyField label="Copy link" value={`${siteUrl}/f/${orgSlug}/${form.slug}`} />
            <FormQr url={`${siteUrl}/f/${orgSlug}/${form.slug}`} slug={form.slug} title={form.title} />
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
