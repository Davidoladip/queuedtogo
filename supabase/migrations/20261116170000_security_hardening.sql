-- Security hardening (from the November 2026 security review).
-- 1. Browser roles lose table rights they never use (TRUNCATE ignores row-level security).
-- 2. No SVG files in the public image bucket (an SVG can carry script).
-- 3. At most 3 free businesses per account (stops free-plan limits being dodged with throwaway businesses).
-- 4. Caps on outgoing texts and emails: texts only to US/Canada numbers, per-recipient and per-business daily caps
--    (stops SMS pumping and email bombing through public forms).
-- 5. Forms can't be published with questions asking for passwords, card numbers, bank or social security numbers.
-- 6. Public forms say whether the business is on the Free plan (the form then shows a "Report this form" link).
-- No existing rows are changed or removed.

-- 1 ------------------------------------------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate, references, trigger on table public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from anon, authenticated;

-- 2 ------------------------------------------------------------------------------------------------------------
update storage.buckets set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'] where id = 'form-assets';

-- 3 ------------------------------------------------------------------------------------------------------------
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
  -- Free businesses: at most 3 per account. A business on a paid or included plan doesn't count.
  if (select count(*) from public.organizations o
       where o.created_by = v_uid and public.effective_plan(o.id) = 'free') >= 3 then
    raise exception 'You already have 3 businesses on the Free plan. Upgrade one of them to add another.' using errcode = 'P0001';
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

-- 4 ------------------------------------------------------------------------------------------------------------
create or replace function public.messages_send_guard()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_recent integer;
begin
  if new.status <> 'queued' or new.kind in ('test', 'team_alert') or new.to_address is null then
    return new;
  end if;
  -- Texts: US and Canadian numbers only (premium-rate international numbers are how SMS pumping works).
  if new.channel in ('sms', 'whatsapp') and new.to_address !~ '^\+1[2-9][0-9]{9}$' then
    new.status := 'skipped';
    new.skip_reason := 'Texts go to US and Canadian numbers only.';
    return new;
  end if;
  -- One person gets at most 3 confirmations a day from a business (stops a form being used to flood someone's inbox).
  if new.kind in ('confirmation', 'rsvp_confirmation') then
    select count(*) into v_recent from public.messages m
     where m.org_id = new.org_id and m.to_address = new.to_address and m.kind in ('confirmation', 'rsvp_confirmation')
       and m.status <> 'skipped' and m.created_at > now() - interval '24 hours';
    if v_recent >= 3 then
      new.status := 'skipped';
      new.skip_reason := 'Daily limit: this person already got 3 confirmations today.';
      return new;
    end if;
  end if;
  -- Any one person: at most 20 messages a day from a business.
  select count(*) into v_recent from public.messages m
   where m.org_id = new.org_id and m.to_address = new.to_address and m.kind not in ('test', 'team_alert')
     and m.status <> 'skipped' and m.created_at > now() - interval '24 hours';
  if v_recent >= 20 then
    new.status := 'skipped';
    new.skip_reason := 'Daily limit: this person already got 20 messages today.';
    return new;
  end if;
  -- A business: at most 1,000 texts and 3,000 emails a day (far above a busy event; a bot hits it, a vendor won't).
  select count(*) into v_recent from public.messages m
   where m.org_id = new.org_id and m.channel = new.channel and m.kind not in ('test', 'team_alert')
     and m.status <> 'skipped' and m.created_at > now() - interval '24 hours';
  if v_recent >= (case when new.channel = 'email' then 3000 else 1000 end) then
    new.status := 'skipped';
    new.skip_reason := 'Daily sending limit reached for this business. Contact support if you need more.';
  end if;
  return new;
end;
$function$;
revoke all on function public.messages_send_guard() from public, anon, authenticated;

drop trigger if exists messages_send_guard on public.messages;
create trigger messages_send_guard before insert on public.messages
  for each row execute function public.messages_send_guard();

create index if not exists messages_recipient_recent_idx on public.messages (org_id, to_address, created_at desc);
create index if not exists messages_channel_recent_idx on public.messages (org_id, channel, created_at desc);

-- 5 ------------------------------------------------------------------------------------------------------------
create or replace function public.sensitive_field_label(p_label text)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  select coalesce(p_label, '') ~* '(pass ?word|passcode|\mpin (number|code)\M|^\s*pin\s*\??\s*$|card number|credit card|debit card|\mcvv\M|\mcvc\M|card security code|social security|\mssn\M|bank account|routing number|\miban\M|sort code|one[- ]time code|verification code|\motp\M)';
$function$;

create or replace function public.publish_form(p_form uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_form public.forms;
  v_version integer;
  v_bad text;
begin
  select * into v_form from public.forms f where f.id = p_form for update;
  if not found or not public.is_org_member(v_form.org_id) then
    raise exception 'Form not found' using errcode = 'P0002';
  end if;
  -- Forms are for orders and RSVPs; questions asking for secrets are how forms get used for phishing.
  select ff.label into v_bad from public.form_fields ff
   where ff.form_id = v_form.id and (public.sensitive_field_label(ff.label) or public.sensitive_field_label(ff.placeholder))
   order by ff.position limit 1;
  if v_bad is not null then
    raise exception 'Forms can''t ask for passwords, card numbers, bank details or social security numbers. Change or remove the question "%".', left(v_bad, 80)
      using errcode = 'P0001';
  end if;
  v_version := v_form.published_version + 1;
  update public.forms f
     set published_version = v_version,
         published_at = now(),
         published_config = jsonb_build_object(
           'version', v_version,
           'title', v_form.title,
           'event_date', v_form.event_date,
           'venue', v_form.venue,
           'intro', v_form.intro,
           'thanks', v_form.thanks,
           'submit_label', v_form.submit_label,
           'settings', v_form.settings,
           'design', v_form.design,
           'fields', coalesce((
             select jsonb_agg(jsonb_build_object(
               'id', ff.id, 'type', ff.type, 'label', ff.label, 'help', ff.help, 'placeholder', ff.placeholder,
               'required', ff.required, 'options', ff.options, 'config', ff.config) order by ff.position)
             from public.form_fields ff where ff.form_id = v_form.id), '[]'::jsonb))
   where f.id = v_form.id;
  return v_version;
end;
$function$;

-- 6 ------------------------------------------------------------------------------------------------------------
create or replace function public.get_public_form(p_org_slug text, p_form_slug text)
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  select jsonb_build_object(
           'form_id', f.id,
           'org_name', o.name,
           'org_slug', o.slug,
           'timezone', o.timezone,
           'status', f.status,
           'version', case when f.status = 'live' then f.published_version end,
           'config', case when f.status = 'live' then f.published_config else null end,
           'free_plan', public.effective_plan(o.id) = 'free',
           'rsvp', case when (f.published_config #>> '{settings,mode}') = 'rsvp' then jsonb_build_object(
             'closed', public.rsvp_deadline_passed(f.published_config, o.timezone),
             'full', public.rsvp_capacity(f.published_config) is not null
                     and (f.published_config #>> '{settings,rsvp,waitlist}') is distinct from 'true'
                     and public.rsvp_headcount(f.id) >= public.rsvp_capacity(f.published_config)) end)
  from public.forms f
  join public.organizations o on o.id = f.org_id
  where o.slug = p_org_slug and f.slug = p_form_slug
    and f.status in ('live', 'closed') and f.published_config is not null;
$function$;

-- 7 ------------------------------------------------------------------------------------------------------------
-- Rate limits for sign-up, password reset, resend and sign-in, keyed by a hash of the visitor's IP or email
-- (never the address itself). Server only.
create table if not exists public.rate_events (
  key        text not null check (char_length(key) between 8 and 200),
  created_at timestamptz not null default now()
);
create index if not exists rate_events_key_idx on public.rate_events (key, created_at desc);
alter table public.rate_events enable row level security;
revoke all on table public.rate_events from anon, authenticated;

create or replace function public.rate_limit_take(p_key text, p_max integer, p_window_seconds integer)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_used integer;
begin
  if p_max < 1 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Bad rate limit' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_key));
  delete from public.rate_events where key = p_key and created_at < now() - make_interval(secs => p_window_seconds);
  select count(*) into v_used from public.rate_events where key = p_key;
  if v_used >= p_max then
    return false;
  end if;
  insert into public.rate_events (key) values (p_key);
  -- Keep the table small: drop anything older than a day, now and then.
  if random() < 0.01 then
    delete from public.rate_events where created_at < now() - interval '1 day';
  end if;
  return true;
end;
$function$;
revoke all on function public.rate_limit_take(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_take(text, integer, integer) to service_role;
