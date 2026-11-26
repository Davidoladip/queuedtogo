"use client";

import { useState, useTransition } from "react";
import { Notice } from "@/components/ui/Notice";
import { PASSES, PASS_INCLUDES, PASS_ORDER, PLANS, PLAN_ORDER, annualSaving, planPrice, usage, type Interval, type PaidPlan, type PassTier } from "@/lib/plans";
import type { BillingView } from "@/lib/billing-data";
import { buyEventPass, choosePlan, openBillingPortal, resumePlan, type BillingResult } from "@/server/actions/billing";

type Props = {
  orgSlug: string;
  orgName: string;
  view: BillingView;
  manage: boolean;
  connected: boolean;
  checkout: "plan" | "pass" | "pending" | "ignored" | "cancelled" | null;
  /** The form to buy an event pass for (from the builder's Publish button). */
  passForm?: string | null;
  /** Development harness only: replaces the server actions. */
  demoAction?: (key: string) => Promise<BillingResult>;
};

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "");

function Meter({ label, used, max, unit }: { label: string; used: number; max: number | null; unit: string }) {
  if (max === 0) {
    return (
      <div className="bl-meter off">
        <div className="bl-meter-top"><span>{label}</span><b>Not on this plan</b></div>
        <div className="bl-bar" aria-hidden="true"><span style={{ width: 0 }} /></div>
      </div>
    );
  }
  const u = usage(used, max);
  // Red only once something is actually blocked (over the limit isn't possible, so "at it" for replies/texts).
  const tone = u.ratio === null ? "" : u.ratio >= 1 ? " full" : u.ratio >= 0.8 ? " near" : "";
  return (
    <div className={`bl-meter${tone}`}>
      <div className="bl-meter-top"><span>{label}</span><b>{u.text}</b></div>
      <div className="bl-bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max ?? used} aria-valuenow={used} aria-valuetext={`${u.text} ${unit}`}>
        <span style={{ width: `${u.ratio === null ? 0 : Math.round(u.ratio * 100)}%` }} />
      </div>
    </div>
  );
}

export function BillingPanel({ orgSlug, orgName, view, manage, connected, checkout, passForm, demoAction }: Props) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [formId, setFormId] = useState(view.forms.find((f) => f.id === passForm)?.id ?? view.forms[0]?.id ?? "");
  const subscribed = view.status === "trialing" || view.status === "active" || view.status === "past_due";
  const canPay = manage && connected && !view.comped;
  const [period, setPeriod] = useState<Interval>(subscribed ? view.interval : "month");
  const per = (i: Interval) => (i === "year" ? "year" : "month");
  const periodName = (i: Interval) => (i === "year" ? "annual" : "monthly");

  function run(key: string, fn: () => Promise<BillingResult>) {
    setBusy(key);
    setMsg(null);
    start(async () => {
      let r: BillingResult;
      try { r = demoAction ? await demoAction(key) : await fn(); } catch { r = { ok: false, error: "We couldn't reach the server. Check your connection and try again." }; }
      if (r.ok && r.url) { window.location.assign(r.url); return; }
      setBusy(null);
      setMsg(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error });
    });
  }

  const planButton = (key: PaidPlan) => {
    if (view.comped) return null;
    if (view.pending && view.pending.plan === key && view.pending.interval === period) return <span className="pill plain">Starts {day(view.pending.at)}</span>;
    if (subscribed && view.chosen === key && view.interval === period && !view.pending) return <span className="pill accent">Your plan</span>;
    const label = subscribed
      ? view.chosen === key && view.interval !== period ? `Switch to ${periodName(period)}`
        : view.chosen === key ? `Keep ${PLANS[key].name} ${periodName(period)}` : `Switch to ${PLANS[key].name}${view.interval !== period ? ` ${periodName(period)}` : ""}`
      : `Choose ${PLANS[key].name}`;
    return (
      <button type="button" className={`btn block${key === "pro" ? " primary" : ""}`} disabled={!canPay || pending}
        onClick={() => run(`plan-${key}-${period}`, () => choosePlan(orgSlug, key, period))}>
        {busy === `plan-${key}-${period}` ? "Opening…" : label}
      </button>
    );
  };
  const hasPass = (t: PassTier) => view.passes.some((p) => p.formId === formId && PASS_ORDER.indexOf(p.tier) >= PASS_ORDER.indexOf(t));

  return (
    <div className="bl">
      {checkout === "plan" && <Notice tone="success">Thanks! Your plan is active.</Notice>}
      {checkout === "pass" && <Notice tone="success">Thanks! Your event pass is active.</Notice>}
      {checkout === "pending" && <Notice>Your payment is still being confirmed. This page updates once Stripe confirms it.</Notice>}
      {checkout === "cancelled" && <Notice>Checkout was cancelled. Nothing was charged.</Notice>}
      {!connected && !view.comped && <Notice>Payments aren&apos;t switched on yet, so plans can&apos;t be bought here just now.</Notice>}
      {!manage && <Notice>Only owners and admins can change billing.</Notice>}
      {view.status === "past_due" && !view.comped && (
        <Notice tone="error">
          <span className="bl-due">
            <span>Your last payment didn&apos;t go through{view.paymentError ? <>: <b>{view.paymentError}</b></> : "."} Stripe will try again; update your card to keep your plan.</span>
            {view.hasCustomer && manage && connected && (
              <button type="button" className="btn small" disabled={pending} onClick={() => run("card", () => openBillingPortal(orgSlug))}>
                {busy === "card" ? "Opening…" : "Update card"}
              </button>
            )}
          </span>
        </Notice>
      )}
      {msg && <Notice tone={msg.ok ? "success" : "error"}>{msg.text}</Notice>}

      <section className="panel bl-current" aria-labelledby="bl-now">
        <div className="bl-current-main">
          <p className="bl-kicker">Current plan</p>
          <h2 id="bl-now">{PLANS[view.plan].name}{PLANS[view.plan].price && !view.comped ? <span className="bl-price-sm"> · ${planPrice(view.plan, view.interval).toLocaleString("en-US")}/{per(view.interval)}</span> : null}</h2>
          <p className="muted">
            {view.comped ? `${orgName} has the ${PLANS[view.plan].name} plan included at no charge.`
              : view.status === "trialing" ? `Free trial until ${day(view.trialEnd)}. Your card is charged after that unless you cancel.`
                : view.cancelAtPeriodEnd && subscribed ? `Cancelled. You keep ${PLANS[view.plan].name} until ${day(view.periodEnd)}${view.legacyFree ? ", then move to Free." : ". After that, forms without an event pass stop taking new replies until you choose a plan again."}`
                  : subscribed ? `Renews on ${day(view.periodEnd)}${view.interval === "year" ? " (billed yearly)" : ""}.`
                    : view.plan === "free" ? "You're on the Free plan, which your business keeps from before plans changed. You can move to a paid plan at any time."
                      : "You don't have a plan yet. You can build and preview as many forms as you like; to publish one, choose a plan below or buy an event pass for it."}
          </p>
          {view.pending && subscribed && !view.comped && (
            <p className="bl-note">Moves to {PLANS[view.pending.plan].name} {periodName(view.pending.interval)} on {day(view.pending.at)}.</p>
          )}
          {!view.enforced && <p className="bl-note">Plan limits aren&apos;t switched on yet, so nothing is blocked.</p>}
        </div>
        {view.hasCustomer && manage && connected && !view.comped && (
          <div className="bl-current-act">
            {view.cancelAtPeriodEnd && subscribed && (
              <button type="button" className="btn primary" disabled={pending} onClick={() => run("resume", () => resumePlan(orgSlug))}>
                {busy === "resume" ? "Resuming…" : "Resume plan"}
              </button>
            )}
            <button type="button" className="btn" disabled={pending} onClick={() => run("portal", () => openBillingPortal(orgSlug))}>
              {busy === "portal" ? "Opening…" : "Manage billing"}
            </button>
          </div>
        )}
      </section>

      {view.plan !== "none" && <section className="panel" aria-labelledby="bl-use">
        <h2 id="bl-use">This month</h2>
        <div className="bl-meters">
          <Meter label="Live forms" used={view.usage.liveForms} max={view.limits.live_forms} unit="live forms" />
          <Meter label="Team members" used={view.usage.members} max={view.limits.members} unit="people, counting open invitations" />
          <Meter label="Replies" used={view.usage.replies} max={view.limits.monthly_replies} unit="orders and RSVPs" />
          <Meter label="Texts" used={view.usage.texts} max={view.limits.monthly_texts} unit="texts sent" />
        </div>
        <p className="muted bl-small">Forms with an event pass don&apos;t count toward live forms, replies or texts. Emails are always unlimited.</p>
      </section>}

      <section aria-labelledby="bl-plans">
        <div className="bl-plans-head">
          <h2 id="bl-plans" className="bl-h">Plans</h2>
          {!view.comped && (
            <div className="bl-toggle" role="radiogroup" aria-label="Billing period">
              {(["month", "year"] as const).map((i) => (
                <button key={i} type="button" role="radio" aria-checked={period === i} className={period === i ? "on" : ""} onClick={() => setPeriod(i)}>
                  {i === "month" ? "Monthly" : <>Annual <span className="bl-save">2 months free</span></>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="bl-plans">
          {PLAN_ORDER.map((k) => {
            const p = PLANS[k];
            const current = view.plan === k;
            return (
              <article key={k} className={`bl-plan${current ? " current" : ""}${k === "pro" ? " pop" : ""}`} aria-label={`${p.name} plan`}>
                {k === "pro" && <span className="bl-flag">Most popular</span>}
                <h3>{p.name}</h3>
                <p className="bl-price"><b>${planPrice(k, period).toLocaleString("en-US")}</b><span>/{per(period)}</span></p>
                {period === "year" && (
                  <p className="bl-yearly">${(p.annual / 12).toFixed(2)} a month · save ${annualSaving(k)} a year</p>
                )}
                <p className="muted bl-small">{p.blurb}</p>
                <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
                <div className="bl-plan-act">
                  {planButton(k)}
                </div>
              </article>
            );
          })}
        </div>
        {!view.comped && !subscribed && (
          <p className="bl-small bl-renew">
            <b>Plans renew automatically.</b>{" "}
            You&apos;re charged the price shown for the period you choose ({periodName(period)}) when you subscribe, and again every {period === "year" ? "year" : "month"} until you cancel. There&apos;s no free trial.{" "}
            Cancel any time here in Billing (Manage billing); you keep the plan until the end of the period you paid for. Prices exclude any sales tax.
            By starting a plan you agree to the <a href="/terms-of-service" target="_blank" rel="noopener">Terms of Service</a>.
          </p>
        )}
        {subscribed && !view.comped && <p className="muted bl-small">Moving to annual charges the year now, less what&apos;s left of this month. Moving from annual to monthly starts when your year ends.</p>}
      </section>

      <section className="panel" aria-labelledby="bl-pass">
        <h2 id="bl-pass">Event pass</h2>
        <p className="muted">
          Just one event? Pay once for one form instead of a monthly plan. A pass doesn&apos;t renew, works with or without a plan, and
          doesn&apos;t use your plan&apos;s live forms, replies or texts.
        </p>
        <ul className="bl-pass-inc">{PASS_INCLUDES.map((x) => <li key={x}>{x}</li>)}</ul>
        {view.forms.length === 0 ? (
          <p className="bl-note">You don&apos;t have a form yet. Create one on the Forms page, then come back here to buy its pass.</p>
        ) : (
          <>
            <label className="bl-select">
              <span>Form</span>
              <select aria-label="Form" value={formId} onChange={(e) => setFormId(e.target.value)}>
                {view.forms.map((f) => <option key={f.id} value={f.id}>{f.title}{f.eventDate ? ` (${f.eventDate})` : ""}</option>)}
              </select>
            </label>
            <div className="bl-passes">
              {PASS_ORDER.map((t) => {
                const p = PASSES[t];
                const owned = hasPass(t);
                return (
                  <article key={t} className="bl-passcard" aria-label={`${p.name} pass`}>
                    <h3>{p.name}</h3>
                    <p className="bl-price"><b>${p.price}</b><span> one time</span></p>
                    <p className="muted bl-small">{p.texts.toLocaleString("en-US")} texts included</p>
                    {owned ? <span className="pill good">Included</span> : (
                      <button type="button" className="btn block" disabled={!manage || !connected || pending || !formId}
                        onClick={() => run(`pass-${t}`, () => buyEventPass(orgSlug, formId, t))}>
                        {busy === `pass-${t}` ? "Opening…" : `Buy for $${p.price}`}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}
        {view.passes.length > 0 && (
          <div className="bl-active">
            <h3>Active passes</h3>
            <ul>
              {view.passes.map((p) => (
                <li key={`${p.formId}-${p.tier}`}>
                  <b>{p.title}</b> · {PASSES[p.tier].name} · {p.guestLimit === null ? `${p.used} replies` : `${p.used} of ${p.guestLimit} replies`}
                  {p.textLimit !== null && <> · {p.textsUsed} of {p.textLimit.toLocaleString("en-US")} texts</>} · until {day(p.expiresAt)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
