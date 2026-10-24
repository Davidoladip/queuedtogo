-- QueuedToGo: email updates, order confirmations and team alerts (Stage 9)
--   * organizations.email_enabled (off by default) and reply_to_email (where customers' replies go).
--   * messages now also hold emails: order confirmations, stage updates for customers who chose
--     email, and "new order" alerts to team members.
--   * member_alerts: each team member chooses whether they get new-order emails (on by default).
--   * queue_customer_message (replaced): queues by channel, plus confirmations and team alerts.
--   * stop_updates: the "Stop updates" link on the tracking page and in emails.

alter table public.organizations add column email_enabled boolean not null default false;
alter table public.organizations add column reply_to_email text
  check (reply_to_email is null or (char_length(reply_to_email) <= 254 and reply_to_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'));
grant update (email_enabled, reply_to_email) on public.organizations to authenticated;

alter table public.messages drop constraint if exists messages_to_address_check;
alter table public.messages add constraint messages_to_address_check check (
  to_address is null
  or (channel in ('sms', 'whatsapp') and to_address ~ '^\+[1-9][0-9]{7,14}$')
  or (channel = 'email' and char_length(to_address) <= 254 and to_address ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'));
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('stage_update', 'test', 'confirmation', 'team_alert'));
alter table public.messages add column subject text check (subject is null or char_length(subject) <= 200);
alter table public.messages drop constraint if exists messages_provider_sid_check;
alter table public.messages add constraint messages_provider_sid_check check (provider_sid is null or char_length(provider_sid) between 8 and 100);

-- ---------------------------------------------------------------------------
-- Team members' alert choices
-- ---------------------------------------------------------------------------
create table public.member_alerts (
  org_id           uuid not null,
  user_id          uuid not null,
  new_order_email  boolean not null default true,
  updated_at       timestamptz not null default now(),
  primary key (org_id, user_id),
  foreign key (org_id, user_id) references public.organization_members (org_id, user_id) on delete cascade
);
create trigger member_alerts_updated_at before update on public.member_alerts for each row execute function public.set_updated_at();
alter table public.member_alerts enable row level security;
create policy "Members see their own alert settings" on public.member_alerts
  for select to authenticated using (user_id = (select auth.uid()) and (select public.is_org_member(org_id)));
create policy "Members add their own alert settings" on public.member_alerts
  for insert to authenticated with check (user_id = (select auth.uid()) and (select public.is_org_member(org_id)));
create policy "Members change their own alert settings" on public.member_alerts
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and (select public.is_org_member(org_id)));
revoke all on public.member_alerts from anon;
revoke update on public.member_alerts from authenticated;
grant select, insert on public.member_alerts to authenticated;
grant update (new_order_email) on public.member_alerts to authenticated;

-- ---------------------------------------------------------------------------
-- Queue customer updates, confirmations and team alerts
-- ---------------------------------------------------------------------------
create or replace function public.queue_customer_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage   record;
  v_job     record;
  v_cust    record;
  v_org     record;
  v_channel public.notify_channel;
  v_to      text;
  v_status  text := 'queued';
  v_reason  text;
  v_confirm boolean := false;
begin
  select j.id, j.customer_id, j.number into v_job from public.jobs j where j.id = new.job_id and j.org_id = new.org_id;
  select c.id, c.phone, c.email, c.consent_updates, c.preferred_channel into v_cust
    from public.customers c where c.id = v_job.customer_id and c.org_id = new.org_id;
  select o.texting_enabled, o.email_enabled into v_org from public.organizations o where o.id = new.org_id;

  if new.type = 'created' then
    -- Order confirmation by email: a receipt for the order, sent whenever the customer gave an email.
    if v_cust.email is not null and v_org.email_enabled then
      insert into public.messages (org_id, job_id, customer_id, stage_id, kind, channel, to_address, status, idempotency_key)
      values (new.org_id, new.job_id, v_cust.id, new.to_stage_id, 'confirmation', 'email', v_cust.email, 'queued', 'confirm:' || new.job_id)
      on conflict (org_id, idempotency_key) do nothing;
      v_confirm := true;
    end if;
    -- New-order alerts for team members who want them (everyone, unless they switched it off).
    if v_org.email_enabled then
      insert into public.messages (org_id, job_id, kind, channel, to_address, status, idempotency_key)
      select new.org_id, new.job_id, 'team_alert', 'email', p.email, 'queued', 'alert:' || new.job_id || ':' || m.user_id
        from public.organization_members m
        join public.profiles p on p.id = m.user_id
        left join public.member_alerts a on a.org_id = m.org_id and a.user_id = m.user_id
       where m.org_id = new.org_id and p.email is not null and coalesce(a.new_order_email, true)
      on conflict (org_id, idempotency_key) do nothing;
    end if;
  end if;

  select s.id, s.notify_customer, s.message_template into v_stage
    from public.workflow_stages s where s.id = new.to_stage_id and s.org_id = new.org_id;
  if v_stage.id is null or not v_stage.notify_customer or coalesce(btrim(v_stage.message_template), '') = '' then
    return new;
  end if;

  v_channel := coalesce(v_cust.preferred_channel, 'sms');
  -- The confirmation email already tells an email customer their order arrived.
  if v_confirm and v_channel = 'email' then
    return new;
  end if;
  v_to := case v_channel when 'email' then v_cust.email else v_cust.phone end;

  if v_cust.id is null then
    v_status := 'skipped'; v_reason := 'No customer is linked to this job.';
  elsif not v_cust.consent_updates then
    v_status := 'skipped'; v_reason := 'The customer didn''t agree to order updates.';
  elsif v_channel = 'whatsapp' then
    v_status := 'skipped'; v_reason := 'WhatsApp updates aren''t available yet.';
  elsif v_to is null then
    v_status := 'skipped'; v_reason := case v_channel when 'email' then 'The customer has no email address.' else 'The customer has no mobile number.' end;
  elsif v_channel = 'sms' and not coalesce(v_org.texting_enabled, false) then
    v_status := 'skipped'; v_reason := 'Texting is switched off for this business.';
  elsif v_channel = 'email' and not coalesce(v_org.email_enabled, false) then
    v_status := 'skipped'; v_reason := 'Email updates are switched off for this business.';
  elsif exists (select 1 from public.messages m
                 where m.job_id = new.job_id and m.stage_id = v_stage.id and m.kind = 'stage_update'
                   and m.status in ('queued', 'sending', 'sent', 'delivered')
                   and m.created_at > now() - interval '10 minutes') then
    v_status := 'skipped'; v_reason := 'An update for this stage was already sent in the last 10 minutes.';
  end if;

  insert into public.messages (org_id, job_id, customer_id, stage_id, kind, channel, to_address, template, status, skip_reason, idempotency_key, created_by)
  values (new.org_id, new.job_id, v_cust.id, v_stage.id, 'stage_update', v_channel,
          case when v_status = 'queued' then v_to end, v_stage.message_template, v_status, v_reason,
          'event:' || new.id, new.actor_id)
  on conflict (org_id, idempotency_key) do nothing;
  return new;
end;
$$;
revoke execute on function public.queue_customer_message() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- "Stop updates" from the tracking page or an email link. Only needs the job's private tracking link.
-- ---------------------------------------------------------------------------
create or replace function public.stop_updates(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cust uuid;
begin
  if p_token is null or char_length(p_token) < 32 then return false; end if;
  select j.customer_id into v_cust from public.jobs j where j.tracking_token = p_token;
  if v_cust is null then return false; end if;
  update public.customers set consent_updates = false where id = v_cust and consent_updates;
  -- Anything still waiting to go out to this customer is cancelled.
  update public.messages set status = 'skipped', skip_reason = 'The customer stopped updates.'
   where customer_id = v_cust and status = 'queued' and kind = 'stage_update';
  return true;
end;
$$;
revoke execute on function public.stop_updates(text) from public;
grant execute on function public.stop_updates(text) to anon, authenticated;

-- Tracking now also says whether updates are on, so the page can offer "Stop updates".
create or replace function public.get_job_tracking(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'number', j.number,
           'title', j.title,
           'summary', j.summary,
           'due_date', j.due_date,
           'org_name', o.name,
           'form_title', f.title,
           'design', f.published_config -> 'design',
           'current_stage_id', j.stage_id,
           'updates_on', coalesce(c.consent_updates, false),
           'stages', (select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'position', s.position, 'is_final', s.is_final) order by s.position)
                        from public.workflow_stages s where s.org_id = j.org_id),
           'history', (select coalesce(jsonb_agg(jsonb_build_object('stage_id', e.to_stage_id, 'at', e.created_at) order by e.created_at), '[]'::jsonb)
                         from public.job_events e where e.job_id = j.id and e.type in ('created', 'stage_changed')))
  from public.jobs j
  join public.organizations o on o.id = j.org_id
  left join public.forms f on f.id = j.form_id
  left join public.customers c on c.id = j.customer_id
  where char_length(p_token) >= 32 and j.tracking_token = p_token;
$$;
revoke execute on function public.get_job_tracking(text) from public;
grant execute on function public.get_job_tracking(text) to anon, authenticated;
