-- Annual billing, scheduled plan changes and failed-payment tracking on each business's plan row.
-- Adds columns only: no existing row or rule changes. Written by the server from Stripe, like the rest of org_billing.

alter table public.org_billing
  add column billing_interval      text not null default 'month' check (billing_interval in ('month', 'year')),
  -- A change booked for the next renewal (annual -> monthly), shown to the owner until it happens.
  add column pending_plan          text check (pending_plan is null or pending_plan in ('starter', 'pro', 'events')),
  add column pending_interval      text check (pending_interval is null or pending_interval in ('month', 'year')),
  add column pending_change_at     timestamptz,
  -- The last failed renewal: Stripe's reason (e.g. "Your card was declined.") and when. Cleared once a payment succeeds.
  add column last_payment_error    text check (last_payment_error is null or char_length(last_payment_error) <= 300),
  add column last_payment_failed_at timestamptz,
  add constraint org_billing_pending_complete check ((pending_plan is null) = (pending_interval is null) and (pending_plan is null) = (pending_change_at is null));

comment on column public.org_billing.billing_interval is 'month or year, from the Stripe price.';
comment on column public.org_billing.pending_plan is 'Plan booked to start at pending_change_at (set by the app when it schedules a change in Stripe).';
comment on column public.org_billing.last_payment_error is 'Reason the last renewal failed, from Stripe. Null once paid.';
