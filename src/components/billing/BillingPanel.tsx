"use client";

import { useState, useTransition } from "react";
import { Notice } from "@/components/ui/Notice";
import { PASSES, PASS_ORDER, PLANS, PLAN_ORDER, TRIAL_DAYS, usage, type PaidPlan, type PassTier } from "@/lib/plans";
import type { BillingView } from "@/lib/billing-data";
import { buyEventPass, choosePlan, openBillingPortal, type BillingResult } from "@/server/actions/billing";

type Props = {
  orgSlug: string;
  orgName: string;
  view: BillingView;
  manage: boolean;
  connected: boolean;
  checkout: "plan" | "pass" | "pending" | "ignored" | "cancelled" | null;
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

export function BillingPanel({ orgSlug, orgName, view, manage, connected, checkout, demoAction }: Props) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [formId, setFormId] = useState(view.rsvpForms[0]?.id ?? "");
  const subscribed = view.status === "trialing" || view.status === "active" || view.status === "past_due";
  const canPay = manage && connected && !view.comped;

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
    if (subscribed && view.chosen === key) return <span className="pill accent">Your plan</span>;
    const label = subscribed ? `Switch to ${PLANS[key].name}` : view.hadTrial ? `Choose ${PLANS[key].name}` : `Start ${TRIAL_DAYS}-day free trial`;
    return (
      <button type="button" className={`btn block${key === "pro" ? " primary" : ""}`} disabled={!canPay || pending}
        onClick={() => run(`plan-${key}`, () => choosePlan(orgSlug, key))}>
        {busy === `plan-${key}` ? "Opening…" : label}
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
        <Notice tone="error">Your last payment didn&apos;t go through. Update your card in Manage billing to keep your plan.</Notice>
      )}
      {msg && <Notice tone={msg.ok ? "success" : "error"}>{msg.text}</Notice>}

      <section className="panel bl-current" aria-labelledby="bl-now">
        <div className="bl-current-main">
          <p className="bl-kicker">Current plan</p>
          <h2 id="bl-now">{PLANS[view.plan].name}{PLANS[view.plan].price && !view.comped ? <span className="bl-price-sm"> · ${PLANS[view.plan].price}/month</span> : null}</h2>
          <p className="muted">
            {view.comped ? `${orgName} has the ${PLANS[view.plan].name} plan included at no charge.`
              : view.status === "trialing" ? `Free trial until ${day(view.trialEnd)}. Your card is charged after that unless you cancel.`
                : view.cancelAtPeriodEnd && subscribed ? `Cancelled. You keep ${PLANS[view.plan].name} until ${day(view.periodEnd)}, then move to Free.`
                  : subscribed ? `Renews on ${day(view.periodEnd)}.`
                    : "You're on the Free plan."}
          </p>
          {!view.enforced && <p className="bl-note">Plan limits aren&apos;t switched on yet, so nothing is blocked.</p>}
        </div>
        {view.hasCustomer && manage && connected && !view.comped && (
          <button type="button" className="btn" disabled={pending} onClick={() => run("portal", () => openBillingPortal(orgSlug))}>
            {busy === "portal" ? "Opening…" : "Manage billing"}
          </button>
        )}
      </section>

      <section className="panel" aria-labelledby="bl-use">
        <h2 id="bl-use">This month</h2>
        <div className="bl-meters">
          <Meter label="Live forms" used={view.usage.liveForms} max={view.limits.live_forms} unit="live forms" />
          <Meter label="Team members" used={view.usage.members} max={view.limits.members} unit="people, counting open invitations" />
          <Meter label="Replies" used={view.usage.replies} max={view.limits.monthly_replies} unit="orders and RSVPs" />
          <Meter label="Texts" used={view.usage.texts} max={view.limits.monthly_texts} unit="texts sent" />
        </div>
        <p className="muted bl-small">Forms with an event pass don&apos;t count toward live forms or replies. Emails are always unlimited.</p>
      </section>

      <section aria-labelledby="bl-plans">
        <h2 id="bl-plans" className="bl-h">Plans</h2>
        <div className="bl-plans">
          {PLAN_ORDER.map((k) => {
            const p = PLANS[k];
            const current = view.plan === k;
            return (
              <article key={k} className={`bl-plan${current ? " current" : ""}${k === "pro" ? " pop" : ""}`} aria-label={`${p.name} plan`}>
                {k === "pro" && <span className="bl-flag">Most popular</span>}
                <h3>{p.name}</h3>
                <p className="bl-price"><b>${p.price}</b><span>/month</span></p>
                <p className="muted bl-small">{p.blurb}</p>
                <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
                <div className="bl-plan-act">
                  {k === "free" ? (current ? <span className="pill plain">Your plan</span> : <span className="muted bl-small">Cancel in Manage billing to go back to Free.</span>) : planButton(k)}
                </div>
              </article>
            );
          })}
        </div>
        {!view.comped && !view.hadTrial && <p className="muted bl-small">The {TRIAL_DAYS}-day free trial needs a card; you won&apos;t be charged until it ends, and you can cancel any time.</p>}
      </section>

      <section className="panel" aria-labelledby="bl-pass">
        <h2 id="bl-pass">Event invitation pass</h2>
        <p className="muted">
          Hosting one event? Pay once for a single RSVP invitation instead of a monthly plan. It works on any plan, doesn&apos;t use your
          live-form or reply allowance, and lasts until 30 days after the event (or 120 days if the form has no date).
        </p>
        {view.rsvpForms.length === 0 ? (
          <p className="bl-note">You don&apos;t have an RSVP form yet. Create a form and set its type to RSVP in its settings, then come back here.</p>
        ) : (
          <>
            <label className="bl-select">
              <span>Invitation</span>
              <select aria-label="Invitation" value={formId} onChange={(e) => setFormId(e.target.value)}>
                {view.rsvpForms.map((f) => <option key={f.id} value={f.id}>{f.title}{f.eventDate ? ` (${f.eventDate})` : ""}</option>)}
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
                  <b>{p.title}</b> · {PASSES[p.tier].name} · {p.guestLimit === null ? `${p.used} replies` : `${p.used} of ${p.guestLimit} replies`} · until {day(p.expiresAt)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
