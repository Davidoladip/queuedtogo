-- QueuedToGo: texts for RSVP forms (Stage 10b)
--
-- RSVP forms can offer texts (settings.rsvp.texts in the published snapshot). Guests opt in with an
-- unticked checkbox and a mobile number; their permission is recorded on their reply (sms_consent,
-- sms_consent_at), separately from order-update permission. When the business has texting switched on,
-- consenting guests get their confirmation, the day-before reminder and "you're off the waitlist" by text,
-- as well as by email. STOP (handled by the app) clears sms_consent for that number everywhere.
-- Only the functions below are replaced; nothing is removed, and existing replies keep sms_consent = false.

alter table public.rsvps add column sms_consent boolean not null default false;
alter table public.rsvps add column sms_consent_at timestamptz;
alter table public.rsvps add constraint rsvps_sms_needs_phone check (not sms_consent or phone is not null);
create index rsvps_phone_idx on public.rsvps (phone) where phone is not null;

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
  v_text_on boolean;
  n integer := 0;
  r record;
begin
  select * into v_form from public.forms where id = p_form for update;
  if not found then return 0; end if;
  v_cap := public.rsvp_capacity(v_form.published_config);
  select email_enabled, texting_enabled and (v_form.published_config #>> '{settings,rsvp,texts}') = 'true'
    into v_email_on, v_text_on from public.organizations where id = v_form.org_id;
  v_count := public.rsvp_headcount(p_form);
  for r in select id, party_size, email, phone, sms_consent, customer_id from public.rsvps
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
    if v_text_on and r.sms_consent and r.phone is not null then
      insert into public.messages (org_id, rsvp_id, customer_id, kind, channel, to_address, status, idempotency_key)
      values (v_form.org_id, r.id, r.customer_id, 'rsvp_promoted', 'sms', r.phone, 'queued', 'rsvp:' || r.id || ':promoted-sms:' || extract(epoch from now())::bigint)
      on conflict (org_id, idempotency_key) do nothing;
    end if;
  end loop;
  return n;
end;
$$;
revoke execute on function public.promote_waitlist(uuid) from public, anon, authenticated;

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
  v_sms   boolean;
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
  -- Texting permission counts only when the form offers texts, the guest ticked the box, and gave a mobile number.
  v_sms := (p_customer ->> 'sms_consent') = 'true' and (v_form.published_config #>> '{settings,rsvp,texts}') = 'true'
           and coalesce(v_phone ~ '^\+[1-9][0-9]{7,14}$', false);

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

  insert into public.rsvps (org_id, form_id, submission_id, customer_id, name, email, phone, status, party_size, waitlisted, sms_consent, sms_consent_at)
  values (v_form.org_id, p_form, p_submission, v_customer, v_name, v_email, case when v_phone ~ '^\+[1-9][0-9]{7,14}$' then v_phone end,
          v_status, v_party, v_wait, v_sms, case when v_sms then now() end)
  returning * into v_rsvp;

  if v_org.email_enabled and v_email is not null then
    insert into public.messages (org_id, rsvp_id, customer_id, kind, channel, to_address, status, idempotency_key)
    values (v_form.org_id, v_rsvp.id, v_customer, 'rsvp_confirmation', 'email', v_email, 'queued', 'rsvp:' || v_rsvp.id || ':confirmation');
  end if;
  if v_org.texting_enabled and v_sms then
    insert into public.messages (org_id, rsvp_id, customer_id, kind, channel, to_address, status, idempotency_key)
    values (v_form.org_id, v_rsvp.id, v_customer, 'rsvp_confirmation', 'sms', v_rsvp.phone, 'queued', 'rsvp:' || v_rsvp.id || ':confirmation-sms');
  end if;

  return jsonb_build_object('submission_id', p_submission, 'token', v_rsvp.token, 'status', v_rsvp.status,
                            'waitlisted', v_rsvp.waitlisted, 'party', v_rsvp.party_size, 'repeat', false);
end;
$$;
revoke execute on function public.submit_rsvp(uuid, uuid, integer, jsonb, jsonb, text, integer, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_rsvp(uuid, uuid, integer, jsonb, jsonb, text, integer, jsonb, text, text, text) to service_role;

create or replace function public.queue_rsvp_reminders()
returns setof uuid
language sql
security definer
set search_path = ''
as $$
  with q as (
    insert into public.messages (org_id, rsvp_id, customer_id, kind, channel, to_address, status, idempotency_key)
    select r.org_id, r.id, r.customer_id, 'rsvp_reminder', ch.channel, ch.addr, 'queued', 'rsvp:' || r.id || ':reminder' || ch.suffix
      from public.rsvps r
      join public.forms f on f.id = r.form_id
      join public.organizations o on o.id = r.org_id
      cross join lateral (
        select 'email'::public.notify_channel as channel, r.email as addr, '' as suffix where o.email_enabled and r.email is not null
        union all
        select 'sms'::public.notify_channel, r.phone, '-sms'
         where o.texting_enabled and r.sms_consent and r.phone is not null and (f.published_config #>> '{settings,rsvp,texts}') = 'true'
      ) ch
     where f.status in ('live', 'closed')
       and (f.published_config #>> '{settings,mode}') = 'rsvp'
       and (f.published_config #>> '{settings,rsvp,reminder}') = 'true'
       and r.status in ('yes', 'maybe') and not r.waitlisted
       and public.safe_date(f.published_config ->> 'event_date') = public.local_today(o.timezone) + 1
    on conflict (org_id, idempotency_key) do nothing
    returning org_id
  )
  select distinct org_id from q;
$$;
revoke execute on function public.queue_rsvp_reminders() from public, anon, authenticated;
grant execute on function public.queue_rsvp_reminders() to service_role;
