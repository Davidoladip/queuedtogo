-- QueuedToGo: subscriptions and event passes (Stage 9)
--
-- Plans: free, starter ($19), pro ($49), events ($99) a month, billed through Stripe; event passes are
-- one-off payments that unlock one RSVP form (up to 100 / 300 / unlimited guests).
--   * billing_config: one row; "enforce" turns plan limits on. It starts OFF, so nothing changes for anyone
--     until Stripe is connected and the switch is flipped.
--   * org_billing: one row per business (created automatically). Written only by the server (Stripe webhooks);
--     members can read their own business's row. A "comped" business keeps its plan without paying.
--   * event_passes: one-off passes, written only by the server; members can read their own.
--   * stripe_events: webhook ids already handled (so a retried webhook is applied once). Server only.
--   * Limits enforced in the database (so they can't be skipped by calling the API directly):
--     live forms per plan (forms with a pass don't count) and team size (members + open invitations).
--     Monthly replies and texts are counted by the server, which is the only path for submissions and texts.
-- Existing businesses get a free row; ThreadToGo (the operator's own business) is comped on Events.
-- Nothing existing is removed or changed.

-- ---------------------------------------------------------------- switch
create table public.billing_config (
  id boolean primary key default true check (id),
  enforce boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.billing_config (id, enforce) values (true, false);
alter table public.billing_config enable row level security;
revoke all on public.billing_config from anon, authenticated;

-- ---------------------------------------------------------------- plans
/** Limits per plan; null means no limit. Kept in step with src/lib/plans.ts (checked by the tests). */
create or replace function public.plan_limits(p_plan text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_plan
    when 'starter' then '{"live_forms":3,"members":2,"monthly_replies":500,"monthly_texts":0}'::jsonb
    when 'pro'     then '{"live_forms":null,"members":5,"monthly_replies":null,"monthly_texts":1000}'::jsonb
    when 'events'  then '{"live_forms":null,"members":15,"monthly_replies":null,"monthly_texts":3000}'::jsonb
    else                '{"live_forms":1,"members":1,"monthly_replies":50,"monthly_texts":0}'::jsonb
  end;
$$;

create table public.org_billing (
  org_id                 uuid primary key references public.organizations (id) on delete cascade,
  plan                   text not null default 'free' check (plan in ('free', 'starter', 'pro', 'events')),
  status                 text not null default 'none'
                         check (status in ('none', 'trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused')),
  comped                 boolean not null default false,
  stripe_customer_id     text unique check (stripe_customer_id is null or stripe_customer_id ~ '^cus_[A-Za-z0-9]{6,64}$'),
  stripe_subscription_id text unique check (stripe_subscription_id is null or stripe_subscription_id ~ '^sub_[A-Za-z0-9]{6,64}$'),
  current_period_end     timestamptz,
  trial_end              timestamptz,
  cancel_at_period_end   boolean not null default false,
  had_trial              boolean not null default false,
  updated_at             timestamptz not null default now()
);
comment on table public.org_billing is 'Each business''s plan. Written only by the server from Stripe; members can read their own.';
create trigger org_billing_updated_at before update on public.org_billing for each row execute function public.set_updated_at();
alter table public.org_billing enable row level security;
create policy "Members can see their business's plan" on public.org_billing
  for select to authenticated using ((select public.is_org_member(org_id)));
revoke all on public.org_billing from anon;
revoke insert, update, delete, truncate, references, trigger on public.org_billing from authenticated;
grant select on public.org_billing to authenticated;

insert into public.org_billing (org_id, plan, comped)
select o.id, case when o.slug = 'threadtogo' then 'events' else 'free' end, o.slug = 'threadtogo'
  from public.organizations o
on conflict (org_id) do nothing;

/** Every new business starts on the free plan. */
create or replace function public.organizations_billing_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.org_billing (org_id) values (new.id) on conflict (org_id) do nothing;
  return new;
end;
$$;
revoke execute on function public.organizations_billing_row() from public, anon, authenticated;
create trigger organizations_billing_row after insert on public.organizations for each row execute function public.organizations_billing_row();

/** The plan a business actually has: its plan while paid up (or comped), otherwise free. */
create or replace function public.effective_plan(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case when b.comped or b.status in ('trialing', 'active', 'past_due') then b.plan else 'free' end
      from public.org_billing b where b.org_id = p_org), 'free');
$$;
revoke execute on function public.effective_plan(uuid) from public, anon;
grant execute on function public.effective_plan(uuid) to authenticated, service_role;

create or replace function public.billing_enforced()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select enforce from public.billing_config where id), false);
$$;
revoke execute on function public.billing_enforced() from public, anon;
grant execute on function public.billing_enforced() to authenticated, service_role;

-- ---------------------------------------------------------------- event passes
create table public.event_passes (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  form_id           uuid not null,
  tier              text not null check (tier in ('100', '300', 'unlimited')),
  guest_limit       integer check (guest_limit is null or guest_limit > 0),
  status            text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'expired')),
  amount_cents      integer not null check (amount_cents >= 0),
  stripe_session_id text unique check (stripe_session_id is null or stripe_session_id ~ '^cs_[A-Za-z0-9_]{6,200}$'),
  stripe_payment_intent text check (stripe_payment_intent is null or stripe_payment_intent ~ '^pi_[A-Za-z0-9_]{6,200}$'),
  paid_at           timestamptz,
  expires_at        timestamptz,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  foreign key (form_id, org_id) references public.forms (id, org_id) on delete cascade
);
comment on table public.event_passes is 'One-off passes that unlock one RSVP form. Written only by the server.';
create index event_passes_form_idx on public.event_passes (form_id) where status = 'paid';
create index event_passes_org_idx on public.event_passes (org_id);
alter table public.event_passes enable row level security;
create policy "Members can see their business's passes" on public.event_passes
  for select to authenticated using ((select public.is_org_member(org_id)));
revoke all on public.event_passes from anon;
revoke insert, update, delete, truncate, references, trigger on public.event_passes from authenticated;
grant select on public.event_passes to authenticated;

/** The paid, unexpired pass for a form (the largest one if there are several), or null. */
create or replace function public.form_pass(p_form uuid)
returns public.event_passes
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.event_passes p
   where p.form_id = p_form and p.status = 'paid' and (p.expires_at is null or p.expires_at > now())
   order by p.guest_limit desc nulls first, p.paid_at desc
   limit 1;
$$;
revoke execute on function public.form_pass(uuid) from public, anon, authenticated;
grant execute on function public.form_pass(uuid) to service_role;

-- ---------------------------------------------------------------- webhook log
create table public.stripe_events (
  id          text primary key check (id ~ '^evt_[A-Za-z0-9]{6,200}$'),
  type        text not null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

-- ---------------------------------------------------------------- limits in the database
/** A form going live must fit the plan's live-form limit (forms with an event pass don't count). */
create or replace function public.forms_live_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text;
  v_max integer;
  v_live integer;
begin
  if new.status <> 'live' or (tg_op = 'UPDATE' and old.status = 'live') or not public.billing_enforced() then
    return new;
  end if;
  if (public.form_pass(new.id)).id is not null then return new; end if;
  v_plan := public.effective_plan(new.org_id);
  v_max := (public.plan_limits(v_plan) ->> 'live_forms')::integer;
  if v_max is null then return new; end if;
  select count(*) into v_live from public.forms f
   where f.org_id = new.org_id and f.status = 'live' and f.id <> new.id and (public.form_pass(f.id)).id is null;
  if v_live >= v_max then
    raise exception 'Your plan allows % live form%. Close another form, upgrade on the Billing page, or buy an event pass for this form.',
      v_max, case when v_max = 1 then '' else 's' end using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.forms_live_limit() from public, anon, authenticated;
create trigger forms_live_limit before insert or update of status on public.forms for each row execute function public.forms_live_limit();

/** Team size: members plus open invitations must fit the plan. p_skip_email: the person being added
    (so their own open invitation, or a resent one, isn't counted twice). */
create or replace function public.check_team_size(p_org uuid, p_skip_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer;
  v_used integer;
begin
  if not public.billing_enforced() then return; end if;
  v_max := (public.plan_limits(public.effective_plan(p_org)) ->> 'members')::integer;
  if v_max is null then return; end if;
  select (select count(*) from public.organization_members m where m.org_id = p_org)
       + (select count(*) from public.organization_invitations i
           where i.org_id = p_org and i.accepted_at is null and i.expires_at > now()
             and lower(i.email) is distinct from lower(p_skip_email))
    into v_used;
  if v_used >= v_max then
    raise exception 'Your plan allows % team member%. Upgrade on the Billing page to add more.', v_max, case when v_max = 1 then '' else 's' end
      using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.check_team_size(uuid, text) from public, anon, authenticated;

create or replace function public.organization_invitations_team_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.check_team_size(new.org_id, new.email);
  return new;
end;
$$;
revoke execute on function public.organization_invitations_team_limit() from public, anon, authenticated;

create or replace function public.organization_members_team_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.check_team_size(new.org_id, (select p.email from public.profiles p where p.id = new.user_id));
  return new;
end;
$$;
revoke execute on function public.organization_members_team_limit() from public, anon, authenticated;

create trigger organization_members_team_limit before insert on public.organization_members for each row execute function public.organization_members_team_limit();
create trigger organization_invitations_team_limit before insert on public.organization_invitations for each row execute function public.organization_invitations_team_limit();

-- ---------------------------------------------------------------- monthly usage
/** Start of this calendar month in the business's own time zone. */
create or replace function public.org_month_start(p_org uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select date_trunc('month', now() at time zone coalesce(o.timezone, 'America/New_York')) at time zone coalesce(o.timezone, 'America/New_York')
    from public.organizations o where o.id = p_org;
$$;
revoke execute on function public.org_month_start(uuid) from public, anon, authenticated;

/** Replies this month that count toward the plan (forms with an event pass have their own limit). */
create or replace function public.org_month_replies(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.form_submissions s
   where s.org_id = p_org and s.created_at >= public.org_month_start(p_org)
     and (public.form_pass(s.form_id)).id is null;
$$;
revoke execute on function public.org_month_replies(uuid) from public, anon, authenticated;

create or replace function public.org_month_texts(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.messages m
   where m.org_id = p_org and m.channel = 'sms' and m.status in ('sent', 'delivered', 'undelivered', 'sending')
     and m.created_at >= public.org_month_start(p_org);
$$;
revoke execute on function public.org_month_texts(uuid) from public, anon, authenticated;

/** A new order or RSVP must fit the monthly reply limit, or the form's event pass. */
create or replace function public.form_submissions_reply_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pass public.event_passes;
  v_max integer;
begin
  if not public.billing_enforced() then return new; end if;
  v_pass := public.form_pass(new.form_id);
  if v_pass.id is not null then
    if v_pass.guest_limit is not null
       and (select count(*) from public.form_submissions s where s.form_id = new.form_id and s.created_at >= v_pass.paid_at) >= v_pass.guest_limit then
      raise exception 'This invitation has reached its limit of % replies. Please contact the host.', v_pass.guest_limit using errcode = 'QTG20';
    end if;
    return new;
  end if;
  v_max := (public.plan_limits(public.effective_plan(new.org_id)) ->> 'monthly_replies')::integer;
  if v_max is not null and public.org_month_replies(new.org_id) >= v_max then
    raise exception 'This form can''t take more replies this month. Please contact the business.' using errcode = 'QTG20';
  end if;
  return new;
end;
$$;
revoke execute on function public.form_submissions_reply_limit() from public, anon, authenticated;
create trigger form_submissions_reply_limit before insert on public.form_submissions for each row execute function public.form_submissions_reply_limit();

/** Texts left this month (null = no limit). Server only; used by the sender before each text. */
create or replace function public.texts_left(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when not public.billing_enforced() then null
              else greatest(((public.plan_limits(public.effective_plan(p_org)) ->> 'monthly_texts')::integer) - public.org_month_texts(p_org), 0) end;
$$;
revoke execute on function public.texts_left(uuid) from public, anon, authenticated;
grant execute on function public.texts_left(uuid) to service_role;

/** Plan, limits and this month's usage, for the Billing page. Members of the business only. */
create or replace function public.billing_overview(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan text;
begin
  if not public.is_org_member(p_org) then
    raise exception 'You are not a member of this business.' using errcode = '42501';
  end if;
  v_plan := public.effective_plan(p_org);
  return jsonb_build_object(
    'plan', v_plan,
    'enforced', public.billing_enforced(),
    'limits', public.plan_limits(v_plan),
    'live_forms', (select count(*) from public.forms f where f.org_id = p_org and f.status = 'live' and (public.form_pass(f.id)).id is null),
    'members', (select count(*) from public.organization_members m where m.org_id = p_org)
             + (select count(*) from public.organization_invitations i where i.org_id = p_org and i.accepted_at is null and i.expires_at > now()),
    'replies_month', public.org_month_replies(p_org),
    'texts_month', public.org_month_texts(p_org),
    'passes', coalesce((select jsonb_agg(jsonb_build_object('form_id', p.form_id, 'tier', p.tier, 'guest_limit', p.guest_limit, 'expires_at', p.expires_at,
                        'used', (select count(*) from public.form_submissions s where s.form_id = p.form_id and s.created_at >= p.paid_at)) order by p.paid_at desc)
                        from public.event_passes p where p.org_id = p_org and p.status = 'paid' and (p.expires_at is null or p.expires_at > now())), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.billing_overview(uuid) from public, anon;
grant execute on function public.billing_overview(uuid) to authenticated;
