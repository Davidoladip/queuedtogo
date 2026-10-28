-- QueuedToGo: RSVP mode (Stage 10)
--
-- A form can be an order form (the default) or an RSVP form (settings.mode = 'rsvp' in the published
-- snapshot). RSVP forms create a guest on the guest list instead of a job on the production board.
--   * form_fields accepts the new 'rsvp' question (Yes / No / Maybe, plus an optional guest count).
--   * rsvps: one row per reply. Each guest gets a private token (64 hex) for their change-RSVP link.
--   * submit_rsvp(): server only. Checks the form, rate limits, the reply deadline and the capacity;
--     when full, guests go on the waitlist (if the business allows it). Queues the confirmation email.
--   * update_rsvp(): server only, keyed by the guest's token. Lets guests change or cancel; freed
--     places go to the waitlist in order (promote_waitlist), and promoted guests get an email.
--   * queue_rsvp_reminders(): server only, run daily: queues the day-before reminder emails.
--   * Members can read their business's guest list and record door check-in (checked_in_at only).
--     Owners and admins can remove a guest. Nothing here is readable by visitors.
--   * get_public_form() also returns the business's time zone and whether RSVPs are closed or full.
-- Error codes: QTG08 full, QTG09 replies closed, QTG10 email already replied, QTG11 link not found,
-- QTG12 changes not allowed.
-- Nothing existing is removed or rewritten: order forms behave exactly as before.

-- ---------------------------------------------------------------- the RSVP question
alter table public.form_fields drop constraint if exists form_fields_type_check;
alter table public.form_fields add constraint form_fields_type_check check (type in (
  'short', 'long', 'email', 'phone', 'number', 'choice', 'multi', 'dropdown', 'sizes', 'date',
  'upload', 'button', 'heading', 'text', 'divider', 'image', 'page', 'submit', 'rsvp'));

-- ---------------------------------------------------------------- helpers (internal)
/** A date from text, or null when it isn't a real date. */
create or replace function public.safe_date(p text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return p::date;
exception when others then
  return null;
end;
$$;

/** Today's date in a business's time zone (falls back to US Eastern if the zone name is unknown). */
create or replace function public.local_today(p_tz text)
returns date
language plpgsql
stable
set search_path = ''
as $$
begin
  return (now() at time zone p_tz)::date;
exception when others then
  return (now() at time zone 'America/New_York')::date;
end;
$$;

/** The guest limit from a published snapshot, or null for no limit. */
create or replace function public.rsvp_capacity(p_config jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when (p_config #>> '{settings,rsvp,capacity}') ~ '^[0-9]{1,5}$' and (p_config #>> '{settings,rsvp,capacity}')::int > 0
              then (p_config #>> '{settings,rsvp,capacity}')::int end;
$$;

/** True once the reply deadline (the end of that day, in the business's time zone) has passed. */
create or replace function public.rsvp_deadline_passed(p_config jsonb, p_tz text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(public.local_today(p_tz) > public.safe_date(p_config #>> '{settings,rsvp,deadline}'), false);
$$;

revoke execute on function public.safe_date(text) from public, anon, authenticated;
revoke execute on function public.local_today(text) from public, anon, authenticated;
revoke execute on function public.rsvp_capacity(jsonb) from public, anon, authenticated;
revoke execute on function public.rsvp_deadline_passed(jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- the guest list
create type public.rsvp_status as enum ('yes', 'no', 'maybe');

create table public.rsvps (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  form_id        uuid not null,
  submission_id  uuid unique,
  customer_id    uuid,
  name           text check (name is null or char_length(name) <= 120),
  email          text check (email is null or (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  phone          text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  status         public.rsvp_status not null,
  party_size     smallint not null check (party_size between 0 and 50),
  waitlisted     boolean not null default false,
  token          text not null unique
                 default encode(sha256((gen_random_uuid()::text || gen_random_uuid()::text)::bytea), 'hex')
                 check (token ~ '^[0-9a-f]{64}$'),
  checked_in_at  timestamptz,
  responded_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, org_id),
  constraint rsvps_party_matches_status check ((status = 'no') = (party_size = 0)),
  constraint rsvps_waitlist_only_yes check (not waitlisted or status = 'yes'),
  foreign key (form_id, org_id) references public.forms (id, org_id) on delete cascade,
  foreign key (submission_id, org_id) references public.form_submissions (id, org_id) on delete cascade,
  foreign key (customer_id, org_id) references public.customers (id, org_id) on delete set null (customer_id)
);
comment on table public.rsvps is 'Guest replies to RSVP forms. Written by the server; members read them and record check-in.';
create index rsvps_form_created_idx on public.rsvps (form_id, created_at);
create index rsvps_org_idx on public.rsvps (org_id);
create index rsvps_waitlist_idx on public.rsvps (form_id, responded_at) where waitlisted;
-- One reply per email address per event (also stops someone replying twice by accident).
create unique index rsvps_form_email_idx on public.rsvps (form_id, lower(email)) where email is not null;

create trigger rsvps_updated_at before update on public.rsvps for each row execute function public.set_updated_at();
create trigger rsvps_org_fixed before update on public.rsvps for each row execute function public.prevent_org_change();

alter table public.rsvps enable row level security;
create policy "Members can view their business's guests" on public.rsvps
  for select to authenticated using ((select public.is_org_member(org_id)));
create policy "Members can record check-in" on public.rsvps
  for update to authenticated using ((select public.is_org_member(org_id))) with check ((select public.is_org_member(org_id)));
create policy "Owners and admins can remove a guest" on public.rsvps
  for delete to authenticated using ((select public.has_org_role(org_id, array['owner', 'admin']::public.org_role[])));
revoke all on public.rsvps from anon;
revoke insert, update, delete, truncate, references, trigger on public.rsvps from authenticated;
grant select, delete on public.rsvps to authenticated;
grant update (checked_in_at) on public.rsvps to authenticated;

-- ---------------------------------------------------------------- RSVP emails
alter table public.messages add column rsvp_id uuid;
alter table public.messages add constraint messages_rsvp_fk foreign key (rsvp_id, org_id) references public.rsvps (id, org_id) on delete cascade;
create index messages_rsvp_idx on public.messages (rsvp_id) where rsvp_id is not null;
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in (
  'stage_update', 'test', 'confirmation', 'team_alert', 'rsvp_confirmation', 'rsvp_reminder', 'rsvp_promoted'));

/** Confirmed guests (yes, not on the waitlist) and their party sizes, optionally leaving one reply out. */
create or replace function public.rsvp_headcount(p_form uuid, p_except uuid default null)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(party_size), 0)::int from public.rsvps
   where form_id = p_form and status = 'yes' and not waitlisted and id is distinct from p_except;
$$;
revoke execute on function public.rsvp_headcount(uuid, uuid) from public, anon, authenticated;

/** Moves waitlisted guests onto the list, first come first served, while there is room. Caller holds the form lock. */
create or replace function public.promote_waitlist(p_form uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_form public.forms;
  v_cap integer;
  v_count integer;
  v_email_on boolean;
  n integer := 0;
  r record;
begin
  select * into v_form from public.forms where id = p_form for update;
  if not found then return 0; end if;
  v_cap := public.rsvp_capacity(v_form.published_config);
  select email_enabled into v_email_on from public.organizations where id = v_form.org_id;
  v_count := public.rsvp_headcount(p_form);
  for r in select id, party_size, email, customer_id from public.rsvps
            where form_id = p_form and waitlisted order by responded_at, created_at for update loop
    exit when v_cap is not null and v_count + r.party_size > v_cap;
    update public.rsvps set waitlisted = false where id = r.id;
    v_count := v_count + r.party_size;
    n := n + 1;
    if v_email_on and r.email is not null then
      insert into public.messages (org_id, rsvp_id, customer_id, kind, channel, to_address, status, idempotency_key)
      values (v_form.org_id, r.id, r.customer_id, 'rsvp_promoted', 'email', r.email, 'queued', 'rsvp:' || r.id || ':promoted:' || extract(epoch from now())::bigint)
      on conflict (org_id, idempotency_key) do nothing;
    end if;
  end loop;
  return n;
end;
$$;
revoke execute on function public.promote_waitlist(uuid) from public, anon, authenticated;

/** When a confirmed guest is removed from the list, their place goes to the waitlist. */
create or replace function public.rsvps_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'yes' and not old.waitlisted then
    perform public.promote_waitlist(old.form_id);
  end if;
  return old;
end;
$$;
revoke execute on function public.rsvps_after_delete() from public, anon, authenticated;
create trigger rsvps_promote_after_delete after delete on public.rsvps for each row execute function public.rsvps_after_delete();

-- ---------------------------------------------------------------- replying
create or replace function public.submit_rsvp(
  p_submission uuid,
  p_form uuid,
  p_version integer,
  p_answers jsonb,
  p_customer jsonb,
  p_status text,
  p_party integer,
  p_files jsonb,
  p_ip_hash text,
  p_user_agent text,
  p_client_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_form public.forms;
  v_org public.organizations;
  v_existing record;
  v_customer uuid;
  v_rsvp public.rsvps;
  v_email text := nullif(lower(btrim(p_customer ->> 'email')), '');
  v_phone text := nullif(btrim(p_customer ->> 'phone'), '');
  v_name  text := left(nullif(btrim(p_customer ->> 'name'), ''), 120);
  v_status public.rsvp_status;
  v_party integer;
  v_cap integer;
  v_wait boolean := false;
  v_recent integer;
  f jsonb;
begin
  -- The form lock makes capacity checks exact when many guests reply at once.
  select * into v_form from public.forms where id = p_form for update;
  if not found or v_form.status <> 'live' or v_form.published_config is null
     or (v_form.published_config #>> '{settings,mode}') is distinct from 'rsvp' then
    raise exception 'This form is not taking RSVPs' using errcode = 'QTG01';
  end if;
  if v_form.published_version <> p_version then
    raise exception 'This form was updated. Reload the page and try again.' using errcode = 'QTG02';
  end if;
  if p_status not in ('yes', 'no', 'maybe') or jsonb_typeof(p_answers) is distinct from 'object'
     or jsonb_typeof(coalesce(p_files, '[]')) is distinct from 'array' or jsonb_array_length(coalesce(p_files, '[]')) > 10 then
    raise exception 'Invalid RSVP' using errcode = '22023';
  end if;
  v_status := p_status::public.rsvp_status;
  v_party := case when v_status = 'no' then 0 else coalesce(p_party, 1) end;
  if v_status <> 'no' and (v_party < 1 or v_party > 50) then
    raise exception 'Invalid guest count' using errcode = '22023';
  end if;
  select * into v_org from public.organizations where id = v_form.org_id;

  -- A repeated click with the same client key returns the first reply.
  if p_client_key is not null then
    select r.token, r.status, r.waitlisted, r.party_size, s.id as sid into v_existing
      from public.form_submissions s join public.rsvps r on r.submission_id = s.id
     where s.form_id = p_form and s.client_key = p_client_key;
    if found then
      return jsonb_build_object('submission_id', v_existing.sid, 'token', v_existing.token, 'status', v_existing.status,
                                'waitlisted', v_existing.waitlisted, 'party', v_existing.party_size, 'repeat', true);
    end if;
  end if;

  if p_ip_hash is not null then
    select count(*) into v_recent from public.form_submissions
     where source_ip_hash = p_ip_hash and form_id = p_form and created_at > now() - interval '10 minutes';
    if v_recent >= 10 then
      raise exception 'Too many replies from this device. Wait a few minutes and try again.' using errcode = 'QTG03';
    end if;
  end if;
  select count(*) into v_recent from public.form_submissions where form_id = p_form and created_at > now() - interval '1 minute';
  if v_recent >= 120 then
    raise exception 'This form is very busy. Try again in a minute.' using errcode = 'QTG03';
  end if;

  if public.rsvp_deadline_passed(v_form.published_config, v_org.timezone) then
    raise exception 'RSVPs for this event have closed.' using errcode = 'QTG09';
  end if;
  if v_email is not null and exists (select 1 from public.rsvps where form_id = p_form and lower(email) = v_email) then
    raise exception 'This email address has already replied. Use the link in your confirmation email to change your RSVP.' using errcode = 'QTG10';
  end if;

  -- Capacity: waitlisted guests go first when places free up, so a new "yes" joins the back of the queue.
  if v_status = 'yes' then
    perform public.promote_waitlist(p_form);
    v_cap := public.rsvp_capacity(v_form.published_config);
    if v_cap is not null and (public.rsvp_headcount(p_form) + v_party > v_cap
                              or exists (select 1 from public.rsvps where form_id = p_form and waitlisted)) then
      if (v_form.published_config #>> '{settings,rsvp,waitlist}') = 'true' then
        v_wait := true;
      else
        raise exception 'Sorry, this event is full.' using errcode = 'QTG08';
      end if;
    end if;
  end if;

  -- The guest is also a customer of the business (matched on email, then phone). RSVPs never change texting consent.
  if v_email is not null or v_phone is not null or v_name is not null then
    if v_email is not null then
      select id into v_customer from public.customers where org_id = v_form.org_id and lower(email) = v_email;
    end if;
    if v_customer is null and v_phone is not null then
      select id into v_customer from public.customers where org_id = v_form.org_id and phone = v_phone order by created_at limit 1;
    end if;
    if v_customer is null then
      insert into public.customers (org_id, name, email, phone, preferred_channel, consent_updates)
      values (v_form.org_id, v_name, v_email, v_phone, case when v_email is not null then 'email'::public.notify_channel end, false)
      returning id into v_customer;
    else
      update public.customers c set name = coalesce(v_name, c.name), email = coalesce(c.email, v_email), phone = coalesce(c.phone, v_phone)
       where c.id = v_customer;
    end if;
  end if;

  begin
    insert into public.form_submissions (id, org_id, form_id, form_version, answers, customer_id, consent, source_ip_hash, user_agent, client_key)
    values (p_submission, v_form.org_id, p_form, p_version, p_answers, v_customer, false, left(p_ip_hash, 128), left(p_user_agent, 400), p_client_key);
  exception when unique_violation then
    select r.token, r.status, r.waitlisted, r.party_size, s.id as sid into v_existing
      from public.form_submissions s join public.rsvps r on r.submission_id = s.id
     where s.form_id = p_form and s.client_key = p_client_key;
    if found then
      return jsonb_build_object('submission_id', v_existing.sid, 'token', v_existing.token, 'status', v_existing.status,
                                'waitlisted', v_existing.waitlisted, 'party', v_existing.party_size, 'repeat', true);
    end if;
    raise;
  end;

  for f in select * from jsonb_array_elements(coalesce(p_files, '[]')) loop
    insert into public.files (org_id, bucket, path, kind, mime_type, size_bytes, original_name, form_id, submission_id)
    values (v_form.org_id, 'submission-uploads', f ->> 'path', 'submission_upload', f ->> 'mime', (f ->> 'size')::integer,
            left(f ->> 'name', 255), p_form, p_submission);
  end loop;

  insert into public.rsvps (org_id, form_id, submission_id, customer_id, name, email, phone, status, party_size, waitlisted)
  values (v_form.org_id, p_form, p_submission, v_customer, v_name, v_email, case when v_phone ~ '^\+[1-9][0-9]{7,14}$' then v_phone end,
          v_status, v_party, v_wait)
  returning * into v_rsvp;

  if v_org.email_enabled and v_email is not null then
    insert into public.messages (org_id, rsvp_id, customer_id, kind, channel, to_address, status, idempotency_key)
    values (v_form.org_id, v_rsvp.id, v_customer, 'rsvp_confirmation', 'email', v_email, 'queued', 'rsvp:' || v_rsvp.id || ':confirmation');
  end if;

  return jsonb_build_object('submission_id', p_submission, 'token', v_rsvp.token, 'status', v_rsvp.status,
                            'waitlisted', v_rsvp.waitlisted, 'party', v_rsvp.party_size, 'repeat', false);
end;
$$;
revoke execute on function public.submit_rsvp(uuid, uuid, integer, jsonb, jsonb, text, integer, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_rsvp(uuid, uuid, integer, jsonb, jsonb, text, integer, jsonb, text, text, text) to service_role;

/** A guest changes or cancels their reply from their private link. */
create or replace function public.update_rsvp(p_token text, p_status text, p_party integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rsvp public.rsvps;
  v_form public.forms;
  v_tz text;
  v_status public.rsvp_status;
  v_party integer;
  v_cap integer;
  v_room integer;
  v_wait boolean := false;
  v_was_in boolean;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'We couldn''t find this RSVP.' using errcode = 'QTG11';
  end if;
  select * into v_rsvp from public.rsvps where token = p_token;
  if not found then
    raise exception 'We couldn''t find this RSVP.' using errcode = 'QTG11';
  end if;
  select * into v_form from public.forms where id = v_rsvp.form_id for update;
  select * into v_rsvp from public.rsvps where id = v_rsvp.id for update;
  select timezone into v_tz from public.organizations where id = v_form.org_id;
  if p_status not in ('yes', 'no', 'maybe') then
    raise exception 'Choose yes, no or maybe.' using errcode = '22023';
  end if;
  v_status := p_status::public.rsvp_status;
  v_party := case when v_status = 'no' then 0 else coalesce(p_party, 1) end;
  if v_status <> 'no' and (v_party < 1 or v_party > 50) then
    raise exception 'Invalid guest count' using errcode = '22023';
  end if;

  if (v_form.published_config #>> '{settings,rsvp,allowChange}') = 'false' then
    raise exception 'Changes aren''t allowed for this event. Contact the event host.' using errcode = 'QTG12';
  end if;
  if public.safe_date(v_form.published_config ->> 'event_date') < public.local_today(v_tz) then
    raise exception 'This event has already happened.' using errcode = 'QTG09';
  end if;
  -- After the deadline (or once the form is closed), guests can still say they can't come.
  if v_status <> 'no' and (v_form.status <> 'live' or public.rsvp_deadline_passed(v_form.published_config, v_tz))
     and (v_status <> v_rsvp.status or v_party > v_rsvp.party_size) then
    raise exception 'RSVPs for this event have closed, so you can only cancel or lower your numbers.' using errcode = 'QTG09';
  end if;

  v_was_in := v_rsvp.status = 'yes' and not v_rsvp.waitlisted;
  if v_status = 'yes' then
    v_cap := public.rsvp_capacity(v_form.published_config);
    v_room := case when v_cap is null then null else v_cap - public.rsvp_headcount(v_form.id, v_rsvp.id) end;
    if v_was_in then
      -- Already on the list: they keep their place unless they ask for more places than are free.
      if v_room is not null and v_party > v_room then
        raise exception 'There''s only room for % in your party right now.', greatest(v_room, v_rsvp.party_size) using errcode = 'QTG08';
      end if;
    elsif v_rsvp.waitlisted then
      v_wait := true;  -- stays in the queue in their original place; promotion below lets them in if there's room
    elsif v_room is not null and (v_party > v_room or exists (select 1 from public.rsvps where form_id = v_form.id and waitlisted)) then
      if (v_form.published_config #>> '{settings,rsvp,waitlist}') = 'true' then
        v_wait := true;
      else
        raise exception 'Sorry, this event is full.' using errcode = 'QTG08';
      end if;
    end if;
  end if;

  update public.rsvps
     set status = v_status, party_size = v_party, waitlisted = v_wait,
         responded_at = case when v_wait and v_rsvp.waitlisted then v_rsvp.responded_at else now() end
   where id = v_rsvp.id
   returning * into v_rsvp;
  perform public.promote_waitlist(v_form.id);
  select * into v_rsvp from public.rsvps where id = v_rsvp.id;
  return jsonb_build_object('status', v_rsvp.status, 'party', v_rsvp.party_size, 'waitlisted', v_rsvp.waitlisted);
end;
$$;
revoke execute on function public.update_rsvp(text, text, integer) from public, anon, authenticated;
grant execute on function public.update_rsvp(text, text, integer) to service_role;

/** Day-before reminders to guests who said yes or maybe. Returns the businesses that have new reminders. */
create or replace function public.queue_rsvp_reminders()
returns setof uuid
language sql
security definer
set search_path = ''
as $$
  with q as (
    insert into public.messages (org_id, rsvp_id, customer_id, kind, channel, to_address, status, idempotency_key)
    select r.org_id, r.id, r.customer_id, 'rsvp_reminder', 'email', r.email, 'queued', 'rsvp:' || r.id || ':reminder'
      from public.rsvps r
      join public.forms f on f.id = r.form_id
      join public.organizations o on o.id = r.org_id
     where f.status in ('live', 'closed')
       and (f.published_config #>> '{settings,mode}') = 'rsvp'
       and (f.published_config #>> '{settings,rsvp,reminder}') = 'true'
       and o.email_enabled and r.email is not null and r.status in ('yes', 'maybe') and not r.waitlisted
       and public.safe_date(f.published_config ->> 'event_date') = public.local_today(o.timezone) + 1
    on conflict (org_id, idempotency_key) do nothing
    returning org_id
  )
  select distinct org_id from q;
$$;
revoke execute on function public.queue_rsvp_reminders() from public, anon, authenticated;
grant execute on function public.queue_rsvp_reminders() to service_role;

-- ---------------------------------------------------------------- public form: time zone and RSVP state
create or replace function public.get_public_form(p_org_slug text, p_form_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'form_id', f.id,
           'org_name', o.name,
           'org_slug', o.slug,
           'timezone', o.timezone,
           'status', f.status,
           'version', case when f.status = 'live' then f.published_version end,
           'config', case when f.status = 'live' then f.published_config else null end,
           'rsvp', case when (f.published_config #>> '{settings,mode}') = 'rsvp' then jsonb_build_object(
             'closed', public.rsvp_deadline_passed(f.published_config, o.timezone),
             'full', public.rsvp_capacity(f.published_config) is not null
                     and (f.published_config #>> '{settings,rsvp,waitlist}') is distinct from 'true'
                     and public.rsvp_headcount(f.id) >= public.rsvp_capacity(f.published_config)) end)
  from public.forms f
  join public.organizations o on o.id = f.org_id
  where o.slug = p_org_slug and f.slug = p_form_slug
    and f.status in ('live', 'closed') and f.published_config is not null;
$$;
revoke execute on function public.get_public_form(text, text) from public;
grant execute on function public.get_public_form(text, text) to anon, authenticated;
