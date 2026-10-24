"use client";

import "./notify.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { unknownPlaceholders } from "@/lib/design/media";
import { MAX_TEMPLATE, SMS_VARS, renderSms, smsSegments } from "@/lib/sms-text";
import { STATUS_LABEL, type LogEntry, type NotifyResult, type StageMessage, type TwilioStatus } from "@/lib/notify";

type Props = {
  business: string;
  textingOn: boolean;
  canEdit: boolean;
  twilio: TwilioStatus;
  stages: StageMessage[];
  log: LogEntry[];
  siteUrl: string;
  jobHref: string;
  timeZone: string;
  setTexting: (on: boolean) => Promise<NotifyResult>;
  saveStage: (id: string, input: { notify: boolean; template: string }) => Promise<NotifyResult>;
  sendTest: (phone: string) => Promise<NotifyResult>;
  /** The email settings, shown under the text settings. */
  emailSlot?: React.ReactNode;
};

type Msg = { ok: boolean; text: string } | null;

export function NotificationsPanel(p: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [phone, setPhone] = useState("");
  const [testMsg, setTestMsg] = useState<Msg>(null);
  const [on, setOn] = useState(p.textingOn);
  const [prevOn, setPrevOn] = useState(p.textingOn);
  if (p.textingOn !== prevOn) { setPrevOn(p.textingOn); setOn(p.textingOn); }

  async function run(fn: () => Promise<NotifyResult>, ok: string, set: (m: Msg) => void = setMsg) {
    setBusy(true);
    let r: NotifyResult;
    try { r = await fn(); } catch { r = { ok: false, error: "We couldn't reach the server. Check your connection and try again." }; }
    setBusy(false);
    set(r.ok ? { ok: true, text: r.note ?? ok } : { ok: false, text: r.error });
    startTransition(() => router.refresh());
    return r.ok;
  }

  const sample = { name: "Lena Ortiz", order: 1042, link: `${p.siteUrl}/t/…`, business: p.business };
  const time = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: p.timeZone });

  return (
    <div className="qn">
      <div className="qn-grid">
        <section className="panel" aria-labelledby="txt">
          <h2 id="txt">Text updates</h2>
          <div className={`qn-conn ${p.twilio.ready ? "on" : "off"}`} role="status">
            <b>{p.twilio.ready ? "● Connected to Twilio" : "○ Not connected to Twilio yet"}</b>
            {!p.twilio.ready && (
              <span>
                Missing in Vercel: {[!p.twilio.accountSid && "TWILIO_ACCOUNT_SID", !p.twilio.authToken && "TWILIO_AUTH_TOKEN", !p.twilio.sender && "TWILIO_MESSAGING_SERVICE_SID"].filter(Boolean).join(", ")}.
                Until then nothing is texted, and the log below says why.
              </span>
            )}
          </div>
          <label className="qn-switch">
            <input type="checkbox" checked={on} disabled={!p.canEdit || busy}
              onChange={async (e) => {
                const next = e.target.checked;
                setOn(next);
                const ok = await run(() => p.setTexting(next), next ? "Texting is on. Customers who agreed will get updates." : "Texting is off. No customer texts will be sent.");
                if (!ok) setOn(!next);
              }} />
            <span><b>Text customers when their order reaches a stage</b><br />
              <small className="muted">Only customers who ticked the updates box on your form are texted, and only for the stages switched on below. Each text ends with &ldquo;Reply STOP to opt out.&rdquo;</small></span>
          </label>
          <div aria-live="polite" style={{ minHeight: 20, marginTop: 8 }}>
            {msg && <p className={msg.ok ? "qn-ok" : "qn-err"} role={msg.ok ? undefined : "alert"}>{msg.ok ? "✓ " : ""}{msg.text}</p>}
          </div>
        </section>

        <section className="panel" aria-labelledby="tst">
          <h2 id="tst">Send a test text</h2>
          <p className="muted" style={{ fontSize: 13.5, marginBottom: 10 }}>Check the setup by texting your own phone. Up to 5 an hour.</p>
          <form className="qn-test" onSubmit={async (e) => { e.preventDefault(); if (await run(() => p.sendTest(phone), "Sent.", setTestMsg)) setPhone(""); }}>
            <input type="tel" inputMode="tel" autoComplete="tel" placeholder="(555) 123-4567" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Your mobile number" disabled={!p.canEdit} />
            <button className="btn" disabled={!p.canEdit || busy || !phone.trim() || !p.twilio.ready}>Send test</button>
          </form>
          <div aria-live="polite" style={{ minHeight: 20, marginTop: 8 }}>
            {testMsg && <p className={testMsg.ok ? "qn-ok" : "qn-err"} role={testMsg.ok ? undefined : "alert"}>{testMsg.text}</p>}
          </div>
        </section>
      </div>

      {p.emailSlot}

      <section className="panel" style={{ marginTop: 16 }} aria-labelledby="stg">
        <h2 id="stg">Messages for each stage</h2>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 4 }}>Sent by text, or by email to customers who chose email.</p>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 12 }}>
          Insert details with {SMS_VARS.map((v) => <code key={v} className="qn-var">{`{${v}}`}</code>)}. {p.canEdit ? "" : "Only owners and admins can change these."}
        </p>
        <div className="qn-rules">
          {p.stages.map((s) => (
            <StageRule key={`${s.id}:${s.notify}:${s.template}`} s={s} canEdit={p.canEdit} busy={busy} sample={sample}
              onSave={(input) => run(() => p.saveStage(s.id, input), `${s.name} saved.`)} />
          ))}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }} aria-labelledby="log">
        <h2 id="log">Message log</h2>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 8 }}>The latest {p.log.length} updates, newest first. Numbers are shortened here; the full number is on the job.</p>
        {p.log.length ? (
          <ul className="qn-log">
            {p.log.map((m) => {
              const st = STATUS_LABEL[m.status] ?? { text: m.status, tone: "plain" as const };
              return (
                <li key={m.id} data-status={m.status}>
                  <div className="qn-log-top">
                    <span className={`pill ${st.tone}`}>{st.text}</span>
                    <span className="qn-chan">{m.channel === "email" ? "Email" : "Text"}</span>
                    {m.kind === "test" ? <b>Test</b> : m.kind === "team_alert" ? <b>Team alert{m.orderNumber ? ` · QTG-${m.orderNumber}` : ""}</b> : m.jobId ? <Link href={p.jobHref + m.jobId} className="mono">QTG-{m.orderNumber}</Link> : <span className="mono">—</span>}
                    <span>{m.customer ?? ""}</span>
                    <span className="muted">{m.stage ? `· ${m.stage}` : ""}</span>
                    <span className="muted mono" style={{ marginLeft: "auto" }}>{m.to ?? "—"}</span>
                    <time className="muted" dateTime={m.at}>{time(m.at)}</time>
                  </div>
                  {m.subject ? <p className="qn-body"><b>{m.subject}</b></p> : m.body && <p className="qn-body">{m.body}</p>}
                  {m.reason && <p className="qn-reason">{m.reason}</p>}
                </li>
              );
            })}
          </ul>
        ) : <p className="muted">No updates yet. They appear here when jobs reach a stage that notifies the customer.</p>}
      </section>
    </div>
  );
}

function StageRule({ s, canEdit, busy, sample, onSave }: {
  s: StageMessage; canEdit: boolean; busy: boolean;
  sample: { name: string; order: number; link: string; business: string };
  onSave: (input: { notify: boolean; template: string }) => Promise<boolean>;
}) {
  const [notify, setNotify] = useState(s.notify);
  const [template, setTemplate] = useState(s.template);
  const dirty = notify !== s.notify || template !== s.template;
  const bad = unknownPlaceholders(template, SMS_VARS);
  const preview = template.trim() ? renderSms(template, { ...sample, stage: s.name }) : "";
  const seg = preview ? smsSegments(preview) : 0;
  return (
    <div className={`qn-rule${notify ? "" : " off"}`} data-stage={s.name}>
      <div className="qn-rule-head">
        <span className="dot" style={{ "--c": s.color } as React.CSSProperties} />
        <b>{s.name}</b>
        <label className="qn-toggle">
          <input type="checkbox" checked={notify} disabled={!canEdit} onChange={(e) => setNotify(e.target.checked)} aria-label={`Text the customer at ${s.name}`} />
          {notify ? "On" : "Off"}
        </label>
      </div>
      <textarea value={template} maxLength={MAX_TEMPLATE} rows={2} disabled={!canEdit} onChange={(e) => setTemplate(e.target.value)} aria-label={`Message for ${s.name}`} />
      {bad.length > 0 && <p className="qn-err">Unknown placeholder {bad.map((b) => `{${b}}`).join(", ")}. It would be sent as typed.</p>}
      {preview && (
        <p className="qn-preview"><span className="muted">Preview · {seg} {seg === 1 ? "text" : "texts"}:</span> {preview}</p>
      )}
      {canEdit && dirty && (
        <div className="qn-rule-btns">
          <button type="button" className="btn primary small" disabled={busy || bad.length > 0 || (notify && !template.trim())} onClick={() => void onSave({ notify, template: template.trim() })}>Save</button>
          <button type="button" className="btn ghost small" onClick={() => { setNotify(s.notify); setTemplate(s.template); }}>Undo</button>
        </div>
      )}
    </div>
  );
}
