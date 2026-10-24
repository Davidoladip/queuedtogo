"use client";

import "./notify.css";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { NotifyResult } from "@/lib/notify";

type Props = {
  status: { twilio: boolean; from: boolean; ready: boolean };
  emailOn: boolean;
  replyTo: string;
  myAlerts: boolean;
  myEmail: string;
  canEdit: boolean;
  setEmailOn: (on: boolean) => Promise<NotifyResult>;
  saveReplyTo: (v: string) => Promise<NotifyResult>;
  setMyAlerts: (on: boolean) => Promise<NotifyResult>;
  sendTest: () => Promise<NotifyResult>;
};
type Msg = { ok: boolean; text: string } | null;

export function EmailSettings(p: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [alertMsg, setAlertMsg] = useState<Msg>(null);
  const [testMsg, setTestMsg] = useState<Msg>(null);
  const [on, setOn] = useState(p.emailOn);
  const [prevOn, setPrevOn] = useState(p.emailOn);
  if (p.emailOn !== prevOn) { setPrevOn(p.emailOn); setOn(p.emailOn); }
  const [alerts, setAlerts] = useState(p.myAlerts);
  const [prevAlerts, setPrevAlerts] = useState(p.myAlerts);
  if (p.myAlerts !== prevAlerts) { setPrevAlerts(p.myAlerts); setAlerts(p.myAlerts); }
  const [reply, setReply] = useState(p.replyTo);

  async function run(fn: () => Promise<NotifyResult>, ok: string, set: (m: Msg) => void) {
    setBusy(true);
    let r: NotifyResult;
    try { r = await fn(); } catch { r = { ok: false, error: "We couldn't reach the server. Check your connection and try again." }; }
    setBusy(false);
    set(r.ok ? { ok: true, text: r.note ?? ok } : { ok: false, text: r.error });
    startTransition(() => router.refresh());
    return r.ok;
  }
  const line = (m: Msg) => m && <p className={m.ok ? "qn-ok" : "qn-err"} role={m.ok ? undefined : "alert"}>{m.ok ? "✓ " : ""}{m.text}</p>;

  return (
    <div className="qn">
      <div className="qn-grid" style={{ marginTop: 16 }}>
        <section className="panel" aria-labelledby="eml">
          <h2 id="eml">Email</h2>
          <div className={`qn-conn ${p.status.ready ? "on" : "off"}`} role="status">
            <b>{p.status.ready ? "● Email is connected" : "○ Email isn't connected yet"}</b>
            {!p.status.ready && (
              <span>Missing in Vercel: {[!p.status.twilio && "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN", !p.status.from && "EMAIL_FROM"].filter(Boolean).join(", ")}. Email goes through your Twilio account (Twilio Email). Until then no emails are sent, and the log says why.</span>
            )}
          </div>
          <label className="qn-switch">
            <input type="checkbox" checked={on} disabled={!p.canEdit || busy}
              onChange={async (e) => {
                const next = e.target.checked;
                setOn(next);
                if (!(await run(() => p.setEmailOn(next), next ? "Email is on." : "Email is off. No emails will be sent.", setMsg))) setOn(!next);
              }} />
            <span><b>Send emails for this business</b><br />
              <small className="muted">An order confirmation to every customer who gives an email address; stage updates to customers who chose email and agreed to updates; and new-order alerts to your team.</small></span>
          </label>
          <form className="qn-reply" onSubmit={(e) => { e.preventDefault(); void run(() => p.saveReplyTo(reply), reply.trim() ? "Customers will see " + reply.trim() + " as your contact." : "Contact address removed.", setMsg); }}>
            <label>
              <span className="muted">Contact email shown to customers</span>
              <input type="email" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="hello@yourbusiness.com" disabled={!p.canEdit} aria-label="Contact email for customers" />
            </label>
            <button className="btn" disabled={!p.canEdit || busy || reply.trim() === p.replyTo}>Save</button>
          </form>
          <div aria-live="polite" style={{ minHeight: 20, marginTop: 8 }}>{line(msg)}</div>
          {p.canEdit && (
            <>
              <button type="button" className="btn small" disabled={busy || !p.status.ready} onClick={() => void run(p.sendTest, "Sent.", setTestMsg)}>Send a test email to me</button>
              <div aria-live="polite" style={{ minHeight: 20, marginTop: 8 }}>{line(testMsg)}</div>
            </>
          )}
        </section>

        <section className="panel" id="alerts" aria-labelledby="alr">
          <h2 id="alr">Your new-order alerts</h2>
          <p className="muted" style={{ fontSize: 13.5, margin: "6px 0 12px" }}>Each person on the team chooses this for themselves.</p>
          <label className="qn-switch">
            <input type="checkbox" checked={alerts} disabled={busy}
              onChange={async (e) => {
                const next = e.target.checked;
                setAlerts(next);
                if (!(await run(() => p.setMyAlerts(next), next ? "You'll get an email for each new order." : "You won't get new-order emails.", setAlertMsg))) setAlerts(!next);
              }} />
            <span><b>Email me when a new order arrives</b><br /><small className="muted">Sent to {p.myEmail || "your account email"}{on ? "" : ", once email is switched on for the business"}.</small></span>
          </label>
          <div aria-live="polite" style={{ minHeight: 20, marginTop: 8 }}>{line(alertMsg)}</div>
        </section>
      </div>
    </div>
  );
}
