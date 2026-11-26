-- QueuedToGo: build free, pay to go live (Nov 2026)
--
-- * New businesses have no plan until they subscribe or buy an event pass. They can build and preview forms,
--   but a form can only go live with a paid plan or an event pass. effective_plan() returns 'none' for them.
-- * Every business that exists today keeps the Free plan exactly as it was (org_billing.free_plan = true).
-- * Event passes now work for any form (orders, tickets or RSVPs) and include a text-message allowance for that
--   event (event_passes.text_limit). Texts sent for a form while it has a pass come from the pass, not the plan.
-- * The sealed-envelope opening needs Pro, Events, an event pass, or the existing Free plan.
-- * An account can have at most 3 businesses without a paid plan (Free or none).
-- Nothing existing is removed: two columns are added and functions are replaced.

-- ---------------------------------------------------------------- existing businesses keep Free
alter table public.org_billing add column free_plan boolean not null default false;
comment on column public.org_billing.free_plan is 'Businesses created before Nov 26 2026 keep the Free plan when they have no paid plan. Server only.';
update public.org_billing set free_plan = true;

-- ---------------------------------------------------------------- pass text allowance
alter table public.event_passes add column text_limit integer check (text_limit is null or text_limit >= 0);
comment on column public.event_passes.text_limit is 'Texts included for this event (sent while the pass is active). Set by the server.';
update public.event_passes set text_limit = case tier when '100' then 300 when '300' then 900 else 2000 end where text_limit is null;

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
    when 'none'    then '{"live_forms":0,"members":1,"monthly_replies":0,"monthly_texts":0}'::jsonb
    else                '{"live_forms":1,"members":1,"monthly_replies":50,"monthly_texts":0}'::jsonb
  end;
$$;

/** The plan a business actually has: its plan while paid up (or comped); otherwise Free for businesses that
    had it, and 'none' for everyone else. */
create or replace function public.effective_plan(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case when b.comped or b.status in ('trialing', 'active', 'past_due') then b.plan
                when b.free_plan then 'free'
                else 'none' end
      from public.org_billing b where b.org_id = p_org), 'none');
$$;

-- ---------------------------------------------------------------- going live needs a plan or a pass
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
  if v_max = 0 then
    raise exception 'Choose a plan or buy an event pass to publish this form. You can keep building and testing it until then.'
      using errcode = 'QTGP1';
  end if;
  select count(*) into v_live from public.forms f
   where f.org_id = new.org_id and f.status = 'live' and f.id <> new.id and (public.form_pass(f.id)).id is null;
  if v_live >= v_max then
    raise exception 'Your plan allows % live form%. Close another form, upgrade on the Billing page, or buy an event pass for this form.',
      v_max, case when v_max = 1 then '' else 's' end using errcode = 'P0001';
  end if;
  return new;
end;
$$;

/** The sealed-envelope opening is part of Pro, Events and event passes (and the existing Free plan). Checked
    whenever a live form's published version changes or a form goes live. */
create or replace function public.forms_plan_features()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'live' or not public.billing_enforced() then return new; end if;
  if (new.published_config #>> '{settings,cover,on}') is distinct from 'true'
     or (new.published_config #>> '{settings,cover,envelope,on}') is distinct from 'true' then
    return new;
  end if;
  if (public.form_pass(new.id)).id is not null then return new; end if;
  if public.effective_plan(new.org_id) in ('pro', 'events', 'free') then return new; end if;
  raise exception 'The sealed envelope opening comes with Pro, Events or an event pass. Turn the envelope off in Settings, or choose a plan or pass on the Billing page.'
    using errcode = 'QTGP2';
end;
$$;
revoke execute on function public.forms_plan_features() from public, anon, authenticated;
create trigger forms_plan_features before insert or update of status, published_config on public.forms
  for each row execute function public.forms_plan_features();

-- ---------------------------------------------------------------- texts: plan allowance vs pass allowance
/** The form a message belongs to (through its order or its RSVP), or null. */
create or replace function public.message_form(p_job uuid, p_rsvp uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select j.form_id from public.jobs j where j.id = p_job), (select r.form_id from public.rsvps r where r.id = p_rsvp));
$$;
revoke execute on function public.message_form(uuid, uuid) from public, anon, authenticated;

/** Texts this month that count toward the plan: texts for a form sent while it had an active pass come from the pass. */
create or replace function public.org_month_texts(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.messages m
   where m.org_id = p_org and m.channel = 'sms' and m.status in ('sent', 'delivered', 'undelivered', 'sending')
     and m.created_at >= public.org_month_start(p_org)
     and not exists (
       select 1 from public.event_passes p
        where p.org_id = p_org and p.status = 'paid' and p.form_id = public.message_form(m.job_id, m.rsvp_id)
          and m.created_at >= p.paid_at and (p.expires_at is null or m.created_at < p.expires_at));
$$;
revoke execute on function public.org_month_texts(uuid) from public, anon, authenticated;

/** Texts sent for one form since a moment (used for a pass's allowance). */
create or replace function public.form_texts_since(p_org uuid, p_form uuid, p_since timestamptz)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.messages m
   where m.org_id = p_org and m.channel = 'sms' and m.status in ('sent', 'delivered', 'undelivered', 'sending')
     and m.created_at >= p_since and public.message_form(m.job_id, m.rsvp_id) = p_form;
$$;
revoke execute on function public.form_texts_since(uuid, uuid, timestamptz) from public, anon, authenticated;

/** Texts left for a message about one form (null = no limit): the form's pass allowance when it has an
    active pass, otherwise the plan's monthly allowance. Server only; used by the sender before each text. */
create or replace function public.texts_left_for(p_org uuid, p_form uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pass public.event_passes;
begin
  if not public.billing_enforced() then return null; end if;
  if p_form is not null then
    v_pass := public.form_pass(p_form);
    if v_pass.id is not null and v_pass.org_id = p_org then
      return greatest(coalesce(v_pass.text_limit, 0) - public.form_texts_since(p_org, p_form, v_pass.paid_at), 0);
    end if;
  end if;
  return public.texts_left(p_org);
end;
$$;
revoke execute on function public.texts_left_for(uuid, uuid) from public, anon, authenticated;
grant execute on function public.texts_left_for(uuid, uuid) to service_role;

-- ---------------------------------------------------------------- Billing page
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
                        'used', (select count(*) from public.form_submissions s where s.form_id = p.form_id and s.created_at >= p.paid_at),
                        'text_limit', p.text_limit, 'texts_used', public.form_texts_since(p_org, p.form_id, p.paid_at)) order by p.paid_at desc)
                        from public.event_passes p where p.org_id = p_org and p.status = 'paid' and (p.expires_at is null or p.expires_at > now())), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.billing_overview(uuid) from public, anon;
grant execute on function public.billing_overview(uuid) to authenticated;

-- ---------------------------------------------------------------- businesses without a paid plan: at most 3 per account
create or replace function public.create_organization(p_name text, p_slug text)
 returns public.organizations
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_org public.organizations;
begin
  if v_uid is null then
    raise exception 'Sign in to create a business' using errcode = '42501';
  end if;
  if (select count(*) from public.organizations o where o.created_by = v_uid) >= 20 then
    raise exception 'You have reached the limit of 20 businesses' using errcode = 'P0001';
  end if;
  if (select count(*) from public.organizations o
       where o.created_by = v_uid and public.effective_plan(o.id) in ('free', 'none')) >= 3 then
    raise exception 'You already have 3 businesses without a paid plan. Choose a plan for one of them to add another.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'Profile missing for this account' using errcode = 'P0001';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), v_uid)
  returning * into v_org;

  insert into public.organization_members (org_id, user_id, role) values (v_org.id, v_uid, 'owner');
  perform public.seed_default_stages(v_org.id);
  return v_org;
end;
$function$;
