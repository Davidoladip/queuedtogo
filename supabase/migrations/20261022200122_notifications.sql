-- QueuedToGo: customer text updates (Stage 8)
--   * organizations.texting_enabled: each business switches texting on itself (off by default).
--   * messages: every customer update, queued, sent, delivered, failed or skipped (with the reason).
--     Team members can read their business's log. Only the server (service role) writes to it.
--   * queue_customer_message: when a job is created in, or moved to, a stage that notifies the
--     customer, a text is queued in the same transaction, once per event. The app's server then
--     sends queued texts through Twilio.

alter table public.organizations add column texting_enabled boolean not null default false;
grant update (texting_enabled) on public.organizations to authenticated;

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  job_id           uuid,
  customer_id      uuid,
  stage_id         uuid,
  kind             text not null default 'stage_update' check (kind in ('stage_update', 'test')),
  channel          public.notify_channel not null default 'sms',
  to_address       text check (to_address is null or to_address ~ '^\+[1-9][0-9]{7,14}$'),
  template         text check (template is null or char_length(template) <= 1000),
  body             text check (body is null or char_length(body) <= 1600),
  status           text not null default 'queued'
                   check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'undelivered', 'skipped')),
  skip_reason      text check (skip_reason is null or char_length(skip_reason) <= 200),
  provider_sid     text unique check (provider_sid is null or provider_sid ~ '^(SM|MM)[0-9a-f]{32}$'),
  error_code       text check (error_code is null or char_length(error_code) <= 20),
  error_message    text check (error_message is null or char_length(error_message) <= 500),
  attempts         smallint not null default 0 check (attempts between 0 and 10),
  idempotency_key  text check (idempotency_key is null or char_length(idempotency_key) <= 200),
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  sent_at          timestamptz,
  unique (org_id, idempotency_key),
  foreign key (job_id, org_id) references public.jobs (id, org_id) on delete cascade,
  foreign key (customer_id, org_id) references public.customers (id, org_id) on delete set null (customer_id),
  foreign key (stage_id, org_id) references public.workflow_stages (id, org_id) on delete set null (stage_id)
);
comment on table public.messages is 'Customer updates (texts). Written only by the server; members can read their business''s log.';
create index messages_org_created_idx on public.messages (org_id, created_at desc);
create index messages_job_idx on public.messages (job_id, created_at desc) where job_id is not null;
create index messages_queued_idx on public.messages (org_id, created_at) where status = 'queued';
create index messages_recent_stage_idx on public.messages (job_id, stage_id, created_at desc) where job_id is not null;

create trigger messages_updated_at before update on public.messages for each row execute function public.set_updated_at();
create trigger messages_org_fixed before update on public.messages for each row execute function public.prevent_org_change();

alter table public.messages enable row level security;
create policy "Members can view their business's messages" on public.messages
  for select to authenticated using ((select public.is_org_member(org_id)));
revoke insert, update, delete on public.messages from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Queue a customer update when a job arrives in a stage that notifies the customer.
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
  v_on      boolean;
  v_status  text := 'queued';
  v_reason  text;
begin
  select s.id, s.notify_customer, s.message_template into v_stage
    from public.workflow_stages s where s.id = new.to_stage_id and s.org_id = new.org_id;
  if v_stage.id is null or not v_stage.notify_customer or coalesce(btrim(v_stage.message_template), '') = '' then
    return new;
  end if;

  select j.id, j.customer_id into v_job from public.jobs j where j.id = new.job_id and j.org_id = new.org_id;
  select c.id, c.phone, c.consent_updates, c.preferred_channel into v_cust
    from public.customers c where c.id = v_job.customer_id and c.org_id = new.org_id;
  select o.texting_enabled into v_on from public.organizations o where o.id = new.org_id;

  if v_cust.id is null then
    v_status := 'skipped'; v_reason := 'No customer is linked to this job.';
  elsif not v_cust.consent_updates then
    v_status := 'skipped'; v_reason := 'The customer didn''t agree to order updates.';
  elsif v_cust.preferred_channel is distinct from 'sms' then
    v_status := 'skipped'; v_reason := 'WhatsApp and email updates aren''t available yet.';
  elsif v_cust.phone is null then
    v_status := 'skipped'; v_reason := 'The customer has no mobile number.';
  elsif not coalesce(v_on, false) then
    v_status := 'skipped'; v_reason := 'Texting is switched off for this business.';
  elsif exists (select 1 from public.messages m
                 where m.job_id = new.job_id and m.stage_id = v_stage.id
                   and m.status in ('queued', 'sending', 'sent', 'delivered')
                   and m.created_at > now() - interval '10 minutes') then
    v_status := 'skipped'; v_reason := 'An update for this stage was already sent in the last 10 minutes.';
  end if;

  insert into public.messages (org_id, job_id, customer_id, stage_id, kind, channel, to_address, template, status, skip_reason, idempotency_key, created_by)
  values (new.org_id, new.job_id, v_cust.id, v_stage.id, 'stage_update', coalesce(v_cust.preferred_channel, 'sms'),
          case when v_status = 'queued' then v_cust.phone end, v_stage.message_template, v_status, v_reason,
          'event:' || new.id, new.actor_id)
  on conflict (org_id, idempotency_key) do nothing;
  return new;
end;
$$;
revoke execute on function public.queue_customer_message() from public, anon, authenticated;

create trigger job_events_queue_message after insert on public.job_events
  for each row when (new.type in ('created', 'stage_changed'))
  execute function public.queue_customer_message();
