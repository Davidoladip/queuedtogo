# Stage 9: Subscriptions, plan limits and event invitation passes

## What's built

**Plans** (monthly, through Stripe, 14-day free trial with a card the first time a business subscribes):

| Plan | Price | Live forms | Team | Replies / month | Texts / month |
|---|---|---|---|---|---|
| Free | $0 | 1 | 1 | 50 | 0 |
| Starter | $29 | 3 | 2 | 500 | 0 |
| Pro | $69 | Unlimited | 5 | Unlimited | 1,000 |
| Events | $139 | Unlimited | 15 | Unlimited | 3,000 |

**Event invitation passes** (one-time payment for one RSVP form, on any plan): $29 up to 100 guest replies,
$49 up to 300, $69 unlimited. A form with a pass doesn't use the plan's live-form or reply allowance.
A pass lasts until 30 days after the event date (120 days after purchase if the form has no date; never
less than 30 days).

**Billing page** (`/w/<business>/billing`, new "Billing" tab): current plan, trial/renewal/cancellation
dates, usage meters for this month, plan cards (trial / switch), "Manage billing" (Stripe's own page for
card, invoices and cancelling), and the event pass purchase with active passes. Members can see it;
only owners and admins can buy or change anything.

**ThreadToGo** is comped on Events: it keeps the plan at no charge and sees no buy buttons.

## How limits are enforced

Limits live in the database so they can't be bypassed by calling the API directly:

- A form can't go live past the plan's live-form limit (forms with a pass don't count).
- Members plus open invitations can't exceed the plan's team size (checked on invite and on accept).
- New orders and RSVPs stop at the monthly reply limit, or at the pass's guest-reply limit. The guest
  sees "This form can't take more replies this month. Please contact the business."
- Texts stop at the monthly allowance; skipped texts say why in Notifications.

**Limits are switched OFF** (`billing_config.enforce = false`) until Stripe is connected and tested.
Nothing changes for anyone until then.

## Stripe

- Server only: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (never in browser code).
- Prices are created in Stripe on first use, found by lookup key (`qtg_starter_monthly`,
  `qtg_pro_monthly`, `qtg_events_monthly`, `qtg_pass_100`, `qtg_pass_300`, `qtg_pass_unlimited`).
- Webhook `POST /api/stripe/webhook`: signature checked, each event applied once (`stripe_events`).
  Events used: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `customer.subscription.created/updated/deleted/paused/resumed`, `charge.refunded`.
- Coming back from Checkout applies the result immediately, so the plan doesn't wait for the webhook.
- Plan writes come only from Stripe data: the subscription must belong to the business's own Stripe
  customer; an old, replaced subscription can't change the plan; a pass is marked paid only when the
  session, business and amount all match.

## Database (migrations `20261109172317_billing`, `20261109172331_billing_tighten`, applied to queuedtogo-us)

New tables `billing_config`, `org_billing`, `event_passes`, `stripe_events` with RLS (members read their own
plan and passes; no client writes; visitors see nothing). Nothing existing was removed or changed.

## Tests

- Database: 281 checks (36 new: isolation, no self-upgrades, limits on/off, passes, expiry, trial,
  past-due, comped, monthly reset, text allowance).
- Unit: 129 (15 new: price/limit agreement with the database, pass expiry, webhook signatures, plan sync,
  replaced/foreign subscriptions, comped, pass payment checks, refunds, duplicate events, text allowance).
- Browser: 33 new Billing page checks; the existing 420 browser checks still pass.

## Not tested yet (needs your Stripe account)

A real Checkout, trial, plan switch, portal, pass purchase and webhook delivery. The shell here can't
reach Stripe, so Stripe calls are covered with stand-ins. Steps to connect are in the chat summary.
