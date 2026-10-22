-- QueuedToGo: public form submissions (Stage 6)
--
-- submit_form() is called only by the app server (service role) after it has validated the answers
-- against the published form. In one transaction it:
--   * checks the form is live and the published version matches what the customer saw
--   * applies rate limits (per visitor and per form) and ignores repeated clicks (client_key)
--   * finds or creates the customer (by email, then phone) and records consent
--   * stores the submission, creates a job in the business's first stage, and records uploaded files
-- Browsers and signed-in users cannot call it.
-- Error codes: QTG01 not taking orders, QTG02 form changed since it was loaded, QTG03 rate limited.

alter table public.form_submissions
  add column client_key text check (client_key is null or client_key ~ '^[A-Za-z0-9_-]{16,80}$');
create unique index form_submissions_form_client_key_idx on public.form_submissions (form_id, client_key) where client_key is not null;

create or replace function public.submit_form(
  p_submission uuid,
  p_form uuid,
  p_version integer,
  p_answers jsonb,
  p_customer jsonb,
  p_consent boolean,
  p_title text,
  p_summary text,
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
  v_existing record;
  v_customer uuid;
  v_stage uuid;
  v_job public.jobs;
  v_email text := nullif(lower(btrim(p_customer ->> 'email')), '');
  v_phone text := nullif(btrim(p_customer ->> 'phone'), '');
  v_name  text := nullif(btrim(p_customer ->> 'name'), '');
  v_channel public.notify_channel;
  v_recent integer;
  f jsonb;
begin
  select * into v_form from public.forms where id = p_form;
  if not found or v_form.status <> 'live' or v_form.published_config is null then
    raise exception 'This form is not taking orders' using errcode = 'QTG01';
  end if;
  if v_form.published_version <> p_version then
    raise exception 'This form was updated. Reload the page and try again.' using errcode = 'QTG02';
  end if;
  if jsonb_typeof(p_answers) is distinct from 'object' or jsonb_typeof(coalesce(p_files, '[]')) is distinct from 'array'
     or jsonb_array_length(coalesce(p_files, '[]')) > 10 then
    raise exception 'Invalid submission' using errcode = '22023';
  end if;

  -- A repeated click with the same client key returns the first result instead of a second order.
  if p_client_key is not null then
    select s.id, j.number, j.tracking_token into v_existing
      from public.form_submissions s left join public.jobs j on j.submission_id = s.id
     where s.form_id = p_form and s.client_key = p_client_key;
    if found then
      return jsonb_build_object('submission_id', v_existing.id, 'number', v_existing.number, 'tracking_token', v_existing.tracking_token, 'repeat', true);
    end if;
  end if;

  -- Rate limits: 10 orders per visitor per form in 10 minutes; 120 per form per minute.
  if p_ip_hash is not null then
    select count(*) into v_recent from public.form_submissions
     where source_ip_hash = p_ip_hash and form_id = p_form and created_at > now() - interval '10 minutes';
    if v_recent >= 10 then
      raise exception 'Too many orders from this device. Wait a few minutes and try again.' using errcode = 'QTG03';
    end if;
  end if;
  select count(*) into v_recent from public.form_submissions where form_id = p_form and created_at > now() - interval '1 minute';
  if v_recent >= 120 then
    raise exception 'This form is very busy. Try again in a minute.' using errcode = 'QTG03';
  end if;

  -- Customer: match on email, then phone, within this business.
  if v_email is not null or v_phone is not null or v_name is not null then
    v_channel := case when (p_customer ->> 'channel') in ('sms', 'whatsapp', 'email') then (p_customer ->> 'channel')::public.notify_channel end;
    if v_email is not null then
      select id into v_customer from public.customers where org_id = v_form.org_id and lower(email) = v_email;
    end if;
    if v_customer is null and v_phone is not null then
      select id into v_customer from public.customers where org_id = v_form.org_id and phone = v_phone order by created_at limit 1;
    end if;
    if v_customer is null then
      insert into public.customers (org_id, name, email, phone, preferred_channel, consent_updates, consent_at)
      values (v_form.org_id, v_name, v_email, v_phone, v_channel, coalesce(p_consent, false), case when p_consent then now() end)
      returning id into v_customer;
    else
      update public.customers c
         set name = coalesce(v_name, c.name),
             email = coalesce(c.email, v_email),
             phone = coalesce(v_phone, c.phone),
             preferred_channel = coalesce(v_channel, c.preferred_channel),
             consent_updates = case when p_consent then true else c.consent_updates end,
             consent_at = case when p_consent then now() else c.consent_at end
       where c.id = v_customer;
    end if;
  end if;

  begin
    insert into public.form_submissions (id, org_id, form_id, form_version, answers, customer_id, consent, source_ip_hash, user_agent, client_key)
    values (p_submission, v_form.org_id, p_form, p_version, p_answers, v_customer, coalesce(p_consent, false),
            left(p_ip_hash, 128), left(p_user_agent, 400), p_client_key);
  exception when unique_violation then
    -- The same order arrived twice at the same moment (double tap): return the first one.
    select s.id, j.number, j.tracking_token into v_existing
      from public.form_submissions s left join public.jobs j on j.submission_id = s.id
     where s.form_id = p_form and s.client_key = p_client_key;
    if found then
      return jsonb_build_object('submission_id', v_existing.id, 'number', v_existing.number, 'tracking_token', v_existing.tracking_token, 'repeat', true);
    end if;
    raise;
  end;

  for f in select * from jsonb_array_elements(coalesce(p_files, '[]')) loop
    insert into public.files (org_id, bucket, path, kind, mime_type, size_bytes, original_name, form_id, submission_id)
    values (v_form.org_id, 'submission-uploads', f ->> 'path', 'submission_upload', f ->> 'mime', (f ->> 'size')::integer,
            left(f ->> 'name', 255), p_form, p_submission);
  end loop;

  select id into v_stage from public.workflow_stages where org_id = v_form.org_id order by position limit 1;
  if v_stage is null then
    raise exception 'This business has no production stages' using errcode = 'QTG01';
  end if;
  insert into public.jobs (org_id, stage_id, form_id, submission_id, customer_id, title, summary)
  values (v_form.org_id, v_stage, p_form, p_submission, v_customer,
          left(coalesce(nullif(btrim(p_title), ''), v_form.title), 200), left(nullif(btrim(p_summary), ''), 500))
  returning * into v_job;

  return jsonb_build_object('submission_id', p_submission, 'number', v_job.number, 'tracking_token', v_job.tracking_token, 'repeat', false);
end;
$$;
revoke execute on function public.submit_form(uuid, uuid, integer, jsonb, jsonb, boolean, text, text, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_form(uuid, uuid, integer, jsonb, jsonb, boolean, text, text, jsonb, text, text, text) to service_role;

-- The public form needs the published version number to send back with the answers.
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
           'status', f.status,
           'version', case when f.status = 'live' then f.published_version end,
           'config', case when f.status = 'live' then f.published_config else null end)
  from public.forms f
  join public.organizations o on o.id = f.org_id
  where o.slug = p_org_slug and f.slug = p_form_slug
    and f.status in ('live', 'closed') and f.published_config is not null;
$$;
