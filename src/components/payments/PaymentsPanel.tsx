"use client";

import { useState, useTransition } from "react";
import { Notice } from "@/components/ui/Notice";
import { PROVIDER_NAMES, requirementLabel, type PaymentAccountView } from "@/lib/payments";
import { connectSquare, connectStripe, disconnectPayments, type PaymentsResult } from "@/server/actions/payments";

type Props = {
  orgSlug: string;
  account: PaymentAccountView;
  /** Payments switched on for this business by QueuedToGo. */
  allowed: boolean;
  feeLabel: string;
  comped: boolean;
  role: "owner" | "admin" | "member";
  stripeAvailable: boolean;
  squareAvailable: boolean;
  /** Message from coming back from Stripe or Square. */
  notice: { tone: "success" | "error" | "info"; text: string } | null;
  demoAction?: (key: string) => Promise<PaymentsResult>;
};

const STATUS: Record<string, { label: string; tone: string }> = {
  active: { label: "Ready to take payments", tone: "good" },
  pending: { label: "Setting up", tone: "warn" },
  restricted: { label: "Needs information", tone: "bad" },
  disconnected: { label: "Disconnected", tone: "plain" },
};

export function PaymentsPanel(p: Props) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const manage = p.role === "owner" || p.role === "admin";
  const a = p.account && p.account.status !== "disconnected" ? p.account : null;

  function run(key: string, fn: () => Promise<PaymentsResult>) {
    setBusy(key);
    setMsg(null);
    start(async () => {
      let r: PaymentsResult;
      try { r = p.demoAction ? await p.demoAction(key) : await fn(); } catch { r = { ok: false, error: "We couldn't reach the server. Check your connection and try again." }; }
      if (r.ok && r.url) { window.location.assign(r.url); return; }
      setBusy(null);
      setConfirming(false);
      setMsg(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error });
    });
  }

  const dashboard = a?.provider === "square"
    ? (a.livemode ? "https://squareup.com/dashboard" : "https://squareupsandbox.com/dashboard")
    : `https://dashboard.stripe.com/${a?.livemode === false ? "test/" : ""}dashboard`;
  const st = a ? STATUS[a.status] : null;

  return (
    <div className="pay">
      {p.notice && <Notice tone={p.notice.tone}>{p.notice.text}</Notice>}
      {msg && <Notice tone={msg.ok ? "success" : "error"}>{msg.text}</Notice>}
      {!p.allowed && (
        <Notice>
          Paid tickets and orders are opening business by business. You can connect your account now; we&apos;ll let you know when selling is switched on for you.
        </Notice>
      )}

      <section className="panel pay-how" aria-labelledby="pay-how">
        <h2 id="pay-how">How getting paid works</h2>
        <ul>
          <li><b>You&apos;re the seller.</b> Buyers pay you directly through your own Stripe or Square account, and your business name is on their receipt and card statement.</li>
          <li><b>Your account, your money.</b> Payouts go straight to your bank from Stripe or Square. Refunds and card disputes are handled in your own account.</li>
          <li><b>QueuedToGo&apos;s fee: {p.comped ? "none (included with your plan)" : `${p.feeLabel} of each paid ticket or order`}.</b> Taken automatically at the moment of sale. Stripe&apos;s or Square&apos;s own card fee also applies, as with any card sale.</li>
        </ul>
      </section>

      {a ? (
        <section className="panel pay-acct" aria-labelledby="pay-acct">
          <div className="pay-acct-head">
            <div>
              <p className="bl-kicker">Connected account</p>
              <h2 id="pay-acct">{PROVIDER_NAMES[a.provider]}{a.displayName ? <span className="pay-name"> · {a.displayName}</span> : null}</h2>
            </div>
            {st && <span className={`pill ${st.tone}`}>{st.label}</span>}
          </div>
          {!a.livemode && <p className="muted pay-small">Test mode: no real money moves.</p>}
          {a.status === "active" && (
            <p>Buyers can pay you{a.payoutsEnabled ? ", and payouts go to your bank." : ". Add a bank account in " + PROVIDER_NAMES[a.provider] + " to receive payouts."}</p>
          )}
          {a.status === "pending" && <p>Finish {PROVIDER_NAMES[a.provider]}&apos;s sign-up to start taking payments. It takes about 10 minutes.</p>}
          {a.status === "restricted" && <p>{PROVIDER_NAMES[a.provider]} needs a few more details before you can take payments.</p>}
          {a.requirements.length > 0 && a.status !== "active" && (
            <div className="pay-req">
              <p className="pay-small"><b>Still needed:</b></p>
              <ul>{[...new Set(a.requirements.map(requirementLabel))].slice(0, 8).map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          )}
          {manage && (
            <div className="pay-actions">
              {a.provider === "stripe" && a.status !== "active" && (
                <button type="button" className="btn primary" disabled={pending} onClick={() => run("stripe", () => connectStripe(p.orgSlug))}>
                  {busy === "stripe" ? "Opening Stripe…" : "Continue setup with Stripe"}
                </button>
              )}
              <a className="btn" href={dashboard} target="_blank" rel="noopener noreferrer">Open {PROVIDER_NAMES[a.provider]} dashboard</a>
              {p.role === "owner" && !confirming && (
                <button type="button" className="btn ghost danger" disabled={pending} onClick={() => setConfirming(true)}>Disconnect</button>
              )}
            </div>
          )}
          {confirming && (
            <div className="pay-confirm" role="alertdialog" aria-labelledby="pay-confirm-t">
              <p id="pay-confirm-t"><b>Disconnect {PROVIDER_NAMES[a.provider]}?</b> New paid sales stop straight away. Sales already made, refunds and payouts stay in your {PROVIDER_NAMES[a.provider]} account.</p>
              <div className="pay-actions">
                <button type="button" className="btn danger primary" disabled={pending} onClick={() => run("disconnect", () => disconnectPayments(p.orgSlug))}>
                  {busy === "disconnect" ? "Disconnecting…" : "Yes, disconnect"}
                </button>
                <button type="button" className="btn" onClick={() => setConfirming(false)}>Keep it connected</button>
              </div>
            </div>
          )}
          {!manage && <p className="muted pay-small">Only owners and admins can change the payment account.</p>}
        </section>
      ) : (
        <section aria-labelledby="pay-choose">
          <h2 id="pay-choose" className="bl-h">Connect your payment account</h2>
          <div className="pay-choices">
            <article className="pay-choice" aria-labelledby="pay-stripe">
              <h3 id="pay-stripe">Stripe</h3>
              <p>Cards, Apple Pay and Google Pay. Use your existing Stripe login or create an account during sign-up.</p>
              <ul>
                <li>Payouts in about 2 business days</li>
                <li>Your own Stripe dashboard for refunds and payouts</li>
              </ul>
              <button type="button" className="btn primary block" disabled={!manage || !p.stripeAvailable || pending}
                onClick={() => run("stripe", () => connectStripe(p.orgSlug))}>
                {busy === "stripe" ? "Opening Stripe…" : "Connect Stripe"}
              </button>
              {!p.stripeAvailable && <p className="muted pay-small">Stripe isn&apos;t available yet.</p>}
            </article>
            <article className="pay-choice" aria-labelledby="pay-square">
              <h3 id="pay-square">Square</h3>
              <p>Already selling with Square at your table? Connect it so online sales land in the same Square account.</p>
              <ul>
                <li>Sales show up next to your in-person Square sales</li>
                <li>Refunds and payouts in your Square dashboard</li>
              </ul>
              <button type="button" className="btn block" disabled={!manage || !p.squareAvailable || pending}
                onClick={() => run("square", () => connectSquare(p.orgSlug))}>
                {busy === "square" ? "Opening Square…" : "Connect Square"}
              </button>
              {!p.squareAvailable && <p className="muted pay-small">Square isn&apos;t available yet.</p>}
            </article>
          </div>
          {!manage && <p className="muted pay-small">Only owners and admins can connect a payment account.</p>}
        </section>
      )}
    </div>
  );
}
