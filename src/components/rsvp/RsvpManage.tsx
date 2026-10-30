"use client";
/* eslint-disable @next/next/no-img-element -- artwork sizing is controlled by the form design CSS */

// A guest's own RSVP page (from the link in their confirmation). It uses the form's design (colours,
// fonts, the RSVP question's option styles and artwork), so it looks like the form they filled in.
import "../form/form.css";
import { useMemo, useState, type FormEvent } from "react";
import { RsvpChoices } from "@/components/form/FormRenderer";
import { designCss, srcOf, themeVars, usedFontKeys, type FormModel } from "@/lib/design/engine";
import { googleFontsUrls } from "@/lib/design/fonts";
import { guestsText, rsvpHeadline, whenText, type RsvpStatus } from "@/lib/rsvp";

export type ManageResult = { ok: true; status: RsvpStatus; party: number; waitlisted: boolean } | { ok: false; error: string };

type Props = {
  form: FormModel;
  assetBase: string;
  businessName: string;
  name: string | null;
  initial: { status: RsvpStatus; party: number; waitlisted: boolean };
  /** Changes allowed by the host. */
  canChange: boolean;
  /** Past the reply deadline (or the form is closed): guests can only cancel or lower their numbers. */
  closed: boolean;
  /** The event date has passed. */
  past: boolean;
  googleUrl: string | null;
  icsUrl: string | null;
  contact: string | null;
  onSave: (status: RsvpStatus, party: number) => Promise<ManageResult>;
};

export function RsvpManage(p: Props) {
  const { form } = p;
  const css = useMemo(() => designCss(form, p.assetBase), [form, p.assetBase]);
  const [cur, setCur] = useState(p.initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const field = form.fields.find((f) => f.type === "rsvp");
  const art = srcOf(form.design.art, p.assetBase);
  const editable = p.canChange && !p.past && !!field;
  const first = (p.name || "").split(" ")[0];

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!field || busy) return;
    const fd = new FormData(e.currentTarget);
    const status = String(fd.get(field.id) ?? "") as RsvpStatus;
    if (!status) { setMsg({ ok: false, text: "Choose an answer." }); return; }
    const party = status === "no" ? 0 : Number(fd.get(`${field.id}__party`) ?? 1) || 1;
    setBusy(true);
    setMsg(null);
    let r: ManageResult;
    try { r = await p.onSave(status, party); } catch { r = { ok: false, error: "We couldn't reach the server. Check your connection and try again." }; }
    setBusy(false);
    if (r.ok) {
      setCur({ status: r.status, party: r.party, waitlisted: r.waitlisted });
      setMsg({ ok: true, text: r.status === "no" ? "Your RSVP is cancelled. Thanks for letting us know." : r.waitlisted ? "Saved. You're on the waitlist; we'll email you if a place opens up." : "Saved. See you there!" });
    } else setMsg({ ok: false, text: r.error });
  }

  return (
    <>
      {googleFontsUrls(usedFontKeys(form)).map((h) => <link key={h} rel="stylesheet" href={h} />)}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className={`qf-wrap qf-${form.design.theme.layout === "background" ? "background" : "banner"}${art ? "" : " noart"}`} data-qf={form.id} style={themeVars(form.design.theme) as React.CSSProperties}>
        <div className="qf">
          {art && form.design.theme.layout !== "background" && <div className="qf-art"><img src={art} alt={`${form.title} artwork`} /></div>}
          {art && form.design.theme.layout === "background" && <div className="qf-bg"><img src={art} alt="" /></div>}
          <div className="qf-main">
            <div className="qf-card">
              <div className="qf-head"><div className="qf-head-t">
                {(form.eventDate || form.venue) && <div className="qf-eyebrow">{whenText(form.eventDate, form.settings.rsvp)}{form.eventDate && form.venue ? " · " : ""}{form.venue}</div>}
                <h2 className="qf-title" data-sid="__title" data-kind="heading">{form.title}</h2>
              </div></div>
              <div className="qf-done qf-rsvp-done" role="status" data-rsvp={cur.waitlisted ? "wait" : cur.status} aria-live="polite">
                <p className="qf-intro" data-sid="__intro" data-kind="text">
                  {first ? `Hi ${first}, ` : ""}your reply: <b>{rsvpHeadline(form.settings.rsvp, cur.status, cur.waitlisted)}</b>
                  {cur.status !== "no" && cur.party > 1 ? ` (${guestsText(cur.party)})` : ""}
                </p>
                {cur.status !== "no" && !cur.waitlisted && p.googleUrl && (
                  <div className="qf-cal">
                    <a className="qf-btn qf-submit" data-sid="__submit" data-kind="button" href={p.googleUrl} target="_blank" rel="noopener noreferrer">Add to Google Calendar</a>
                    {p.icsUrl && <a className="qf-cal-ics" href={p.icsUrl}>Apple / Outlook calendar (.ics)</a>}
                  </div>
                )}
              </div>

              {editable && field ? (
                <form className="qf-form" onSubmit={save} style={{ marginTop: 20 }} noValidate>
                  <div className="qf-field" data-sid={field.id} data-kind="choice">
                    <span className="qf-label" data-sid={`${field.id}__label`} data-kind="label" id={`ql-${field.id}`}>Change your reply</span>
                    {p.closed && <div className="qf-help">Replies have closed, so you can only cancel or bring fewer people.</div>}
                    <RsvpChoices key={`${cur.status}-${cur.party}`} f={field} editing={false} fs={() => ""} art={{ assetBase: p.assetBase, editing: false, selected: null }} initial={cur.status} initialParty={cur.party} />
                  </div>
                  <div className="qf-nav">
                    <button type="submit" className="qf-btn qf-submit" data-sid="__submit" data-kind="button" disabled={busy}>{busy ? "Saving…" : "Save my reply"}</button>
                  </div>
                  {msg && <div className={msg.ok ? "qf-help" : "qf-closed"} role={msg.ok ? undefined : "alert"}>{msg.text}</div>}
                </form>
              ) : (
                <p className="qf-help" style={{ marginTop: 16 }}>
                  {p.past ? "This event has already happened." : `To change your reply, contact ${p.businessName}${p.contact ? ` at ${p.contact}` : ""}.`}
                </p>
              )}
              {editable && p.contact && <p className="qf-help" style={{ marginTop: 16 }}>Questions? Email {p.businessName} at <a href={`mailto:${p.contact}`}>{p.contact}</a>.</p>}
            </div>
            <div className="qf-powered">RSVP by {p.businessName} · Powered by QueuedToGo</div>
          </div>
        </div>
      </div>
    </>
  );
}
