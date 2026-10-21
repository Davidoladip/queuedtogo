-- QueuedToGo: forms, submissions, customers, production jobs, audit events, files
-- Every table carries org_id. Child tables use composite foreign keys (parent_id, org_id)
-- so a row can never reference another business's parent, even if application code is wrong.

-- ---------------------------------------------------------------------------
-- workflow_stages
-- ---------------------------------------------------------------------------
create table public.workflow_stages (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  name              text not null check (char_length(btrim(name)) between 1 and 60),
  position          smallint not null check (position >= 0),
  color             text not null default '#7B8194' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_final          boolean not null default false,
  notify_customer   boolean not null default false,
  message_template  text check (message_template is null or char_length(message_template) <= 1000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, org_id)
);
create index workflow_stages_org_position_idx on public.workflow_stages (org_id, position);

-- ---------------------------------------------------------------------------
-- forms
-- design: editor draft (versioned JSON, same shape as the prototype: v, theme, shared, el, page, card, adv)
-- published_config: immutable snapshot used by the public form
-- ---------------------------------------------------------------------------
create table public.forms (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  title              text not null check (char_length(btrim(title)) between 1 and 140),
  slug               text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$'),
  status             public.form_status not null default 'draft',
  event_date         date,
  venue              text check (venue is null or char_length(venue) <= 140),
  intro              text check (intro is null or char_length(intro) <= 2000),
  thanks             text check (thanks is null or char_length(thanks) <= 2000),
  submit_label       text not null default 'Submit' check (char_length(submit_label) between 1 and 60),
  settings           jsonb not null default '{}'::jsonb
                     check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) < 16384),
  design             jsonb not null default '{"v": 1}'::jsonb
                     check (jsonb_typeof(design) = 'object' and design ? 'v' and pg_column_size(design) < 524288),
  published_config   jsonb check (published_config is null or (jsonb_typeof(published_config) = 'object' and pg_column_size(published_config) < 1048576)),
  published_version  integer not null default 0 check (published_version >= 0),
  published_at       timestamptz,
  created_by         uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (org_id, slug),
  unique (id, org_id),
  constraint forms_live_requires_published check (status <> 'live' or published_config is not null)
);
create index forms_org_updated_idx on public.forms (org_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- form_fields (one row per block; order by position)
-- ---------------------------------------------------------------------------
create table public.form_fields (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  form_id      uuid not null,
  position     integer not null check (position >= 0),
  type         text not null check (type in (
                 'short', 'long', 'email', 'phone', 'number', 'choice', 'multi', 'dropdown', 'sizes', 'date',
                 'upload', 'button', 'heading', 'text', 'divider', 'image', 'page', 'submit')),
  label        text not null default '' check (char_length(label) <= 500),
  help         text not null default '' check (char_length(help) <= 500),
  placeholder  text not null default '' check (char_length(placeholder) <= 200),
  required     boolean not null default false,
  options      jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) <= 100),
  config       jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object' and pg_column_size(config) < 32768),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (form_id, org_id) references public.forms (id, org_id) on delete cascade
);
create index form_fields_form_position_idx on public.form_fields (form_id, position);
create unique index form_fields_one_submit_idx on public.form_fields (form_id) where type = 'submit';

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
create table public.customers (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  name               text check (name is null or char_length(name) <= 120),
  email              text check (email is null or (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  phone              text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  preferred_channel  public.notify_channel,
  consent_updates    boolean not null default false,
  consent_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, org_id),
  constraint customers_has_identity check (name is not null or email is not null or phone is not null)
);
comment on column public.customers.phone is 'E.164 format, e.g. +15555550100';
create unique index customers_org_email_idx on public.customers (org_id, lower(email)) where email is not null;
create index customers_org_phone_idx on public.customers (org_id, phone) where phone is not null;

-- ---------------------------------------------------------------------------
-- form_submissions (written by the server only; members read)
-- ---------------------------------------------------------------------------
create table public.form_submissions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  form_id         uuid not null,
  form_version    integer not null check (form_version >= 0),
  answers         jsonb not null check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) < 262144),
  customer_id     uuid,
  consent         boolean not null default false,
  source_ip_hash  text check (source_ip_hash is null or char_length(source_ip_hash) <= 128),
  user_agent      text check (user_agent is null or char_length(user_agent) <= 400),
  created_at      timestamptz not null default now(),
  unique (id, org_id),
  foreign key (form_id, org_id) references public.forms (id, org_id) on delete cascade,
  foreign key (customer_id, org_id) references public.customers (id, org_id) on delete set null (customer_id)
);
create index form_submissions_org_form_created_idx on public.form_submissions (org_id, form_id, created_at desc);
create index form_submissions_ip_created_idx on public.form_submissions (source_ip_hash, created_at desc) where source_ip_hash is not null;

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------
create table public.jobs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  number          integer not null,
  stage_id        uuid not null,
  form_id         uuid,
  submission_id   uuid,
  customer_id     uuid,
  assignee_id     uuid,
  title           text not null check (char_length(btrim(title)) between 1 and 200),
  summary         text check (summary is null or char_length(summary) <= 500),
  due_date        date,
  priority        smallint not null default 0 check (priority between 0 and 3),
  tracking_token  text not null unique
                  default encode(sha256((gen_random_uuid()::text || gen_random_uuid()::text)::bytea), 'hex')
                  check (char_length(tracking_token) >= 32),
  completed_at    timestamptz,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, number),
  unique (id, org_id),
  foreign key (stage_id, org_id) references public.workflow_stages (id, org_id) on delete restrict,
  foreign key (form_id, org_id) references public.forms (id, org_id) on delete set null (form_id),
  foreign key (submission_id, org_id) references public.form_submissions (id, org_id) on delete set null (submission_id),
  foreign key (customer_id, org_id) references public.customers (id, org_id) on delete set null (customer_id),
  foreign key (org_id, assignee_id) references public.organization_members (org_id, user_id) on delete set null (assignee_id)
);
create index jobs_org_stage_idx on public.jobs (org_id, stage_id, due_date);
create index jobs_org_form_idx on public.jobs (org_id, form_id);
create index jobs_assignee_idx on public.jobs (org_id, assignee_id) where assignee_id is not null;

-- Per-business order numbers (QTG-1001, QTG-1002, ...)
create or replace function public.assign_job_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.organizations
     set next_job_number = next_job_number + 1
   where id = new.org_id
  returning next_job_number - 1 into new.number;
  if new.number is null then
    raise exception 'Unknown business' using errcode = '23503';
  end if;
  new.created_by := coalesce(new.created_by, (select auth.uid()));
  return new;
end;
$$;

create trigger jobs_assign_number before insert on public.jobs
  for each row execute function public.assign_job_number();

-- ---------------------------------------------------------------------------
-- job_events (append-only audit history)
-- ---------------------------------------------------------------------------
create table public.job_events (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  job_id           uuid not null,
  actor_id         uuid references public.profiles (id) on delete set null,
  type             text not null check (type in ('created', 'stage_changed', 'assigned', 'due_changed', 'updated', 'note', 'notification')),
  from_stage_id    uuid,
  to_stage_id      uuid,
  body             text check (body is null or char_length(body) <= 2000),
  data             jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 16384),
  idempotency_key  text check (idempotency_key is null or char_length(idempotency_key) <= 200),
  created_at       timestamptz not null default now(),
  foreign key (job_id, org_id) references public.jobs (id, org_id) on delete cascade
);
create index job_events_job_created_idx on public.job_events (job_id, created_at);
create unique index job_events_idempotency_idx on public.job_events (org_id, idempotency_key) where idempotency_key is not null;
comment on column public.job_events.idempotency_key is 'Set by automations so the same event is never processed twice.';

-- Write audit events automatically when jobs change.
create or replace function public.audit_job_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into public.job_events (org_id, job_id, actor_id, type, to_stage_id)
    values (new.org_id, new.id, v_actor, 'created', new.stage_id);
    return new;
  end if;

  if new.stage_id is distinct from old.stage_id then
    insert into public.job_events (org_id, job_id, actor_id, type, from_stage_id, to_stage_id)
    values (new.org_id, new.id, v_actor, 'stage_changed', old.stage_id, new.stage_id);
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    insert into public.job_events (org_id, job_id, actor_id, type, data)
    values (new.org_id, new.id, v_actor, 'assigned', jsonb_build_object('from', old.assignee_id, 'to', new.assignee_id));
  end if;
  if new.due_date is distinct from old.due_date then
    insert into public.job_events (org_id, job_id, actor_id, type, data)
    values (new.org_id, new.id, v_actor, 'due_changed', jsonb_build_object('from', old.due_date, 'to', new.due_date));
  end if;
  if (new.title, new.summary, new.priority) is distinct from (old.title, old.summary, old.priority) then
    insert into public.job_events (org_id, job_id, actor_id, type)
    values (new.org_id, new.id, v_actor, 'updated');
  end if;
  return new;
end;
$$;

create trigger jobs_audit after insert or update on public.jobs
  for each row execute function public.audit_job_change();

-- Audit rows are never edited.
create or replace function public.block_audit_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Audit history cannot be changed' using errcode = '42501';
end;
$$;
create trigger job_events_no_update before update on public.job_events
  for each row execute function public.block_audit_edit();

-- ---------------------------------------------------------------------------
-- files (metadata for objects in Supabase Storage)
-- ---------------------------------------------------------------------------
create table public.files (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  bucket         text not null check (bucket in ('form-assets', 'submission-uploads')),
  path           text not null check (char_length(path) <= 512),
  kind           text not null check (kind in ('artwork', 'form_asset', 'submission_upload')),
  mime_type      text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf')),
  size_bytes     integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  original_name  text check (original_name is null or char_length(original_name) <= 255),
  form_id        uuid,
  submission_id  uuid,
  uploaded_by    uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (bucket, path),
  unique (id, org_id),
  constraint files_path_in_org_folder check (split_part(path, '/', 1) = org_id::text),
  foreign key (form_id, org_id) references public.forms (id, org_id) on delete set null (form_id),
  foreign key (submission_id, org_id) references public.form_submissions (id, org_id) on delete cascade
);
create index files_org_form_idx on public.files (org_id, form_id);

-- ---------------------------------------------------------------------------
-- updated_at and org_id guards
-- ---------------------------------------------------------------------------
create trigger workflow_stages_updated_at before update on public.workflow_stages for each row execute function public.set_updated_at();
create trigger forms_updated_at before update on public.forms for each row execute function public.set_updated_at();
create trigger form_fields_updated_at before update on public.form_fields for each row execute function public.set_updated_at();
create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger jobs_updated_at before update on public.jobs for each row execute function public.set_updated_at();

create trigger workflow_stages_org_fixed before update on public.workflow_stages for each row execute function public.prevent_org_change();
create trigger forms_org_fixed before update on public.forms for each row execute function public.prevent_org_change();
create trigger form_fields_org_fixed before update on public.form_fields for each row execute function public.prevent_org_change();
create trigger customers_org_fixed before update on public.customers for each row execute function public.prevent_org_change();
create trigger form_submissions_org_fixed before update on public.form_submissions for each row execute function public.prevent_org_change();
create trigger jobs_org_fixed before update on public.jobs for each row execute function public.prevent_org_change();
create trigger files_org_fixed before update on public.files for each row execute function public.prevent_org_change();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.workflow_stages enable row level security;
alter table public.forms enable row level security;
alter table public.form_fields enable row level security;
alter table public.customers enable row level security;
alter table public.form_submissions enable row level security;
alter table public.jobs enable row level security;
alter table public.job_events enable row level security;
alter table public.files enable row level security;

-- workflow_stages: members read; owners/admins manage.
create policy "Members can view stages" on public.workflow_stages for select to authenticated using ((select public.is_org_member(org_id)));
create policy "Owners and admins can add stages" on public.workflow_stages for insert to authenticated with check ((select public.has_org_role(org_id, '{owner,admin}')));
create policy "Owners and admins can edit stages" on public.workflow_stages for update to authenticated using ((select public.has_org_role(org_id, '{owner,admin}'))) with check ((select public.has_org_role(org_id, '{owner,admin}')));
create policy "Owners and admins can delete stages" on public.workflow_stages for delete to authenticated using ((select public.has_org_role(org_id, '{owner,admin}')));

-- forms: members create and edit; owners/admins delete.
create policy "Members can view forms" on public.forms for select to authenticated using ((select public.is_org_member(org_id)));
create policy "Members can create forms" on public.forms for insert to authenticated with check ((select public.is_org_member(org_id)));
create policy "Members can edit forms" on public.forms for update to authenticated using ((select public.is_org_member(org_id))) with check ((select public.is_org_member(org_id)));
create policy "Owners and admins can delete forms" on public.forms for delete to authenticated using ((select public.has_org_role(org_id, '{owner,admin}')));
-- Publishing goes through publish_form(), so the snapshot always matches the saved fields.
revoke insert, update on public.forms from authenticated, anon;
grant insert (org_id, title, slug, status, event_date, venue, intro, thanks, submit_label, settings, design) on public.forms to authenticated;
grant update (title, slug, status, event_date, venue, intro, thanks, submit_label, settings, design) on public.forms to authenticated;

-- form_fields: members manage.
create policy "Members can view fields" on public.form_fields for select to authenticated using ((select public.is_org_member(org_id)));
create policy "Members can add fields" on public.form_fields for insert to authenticated with check ((select public.is_org_member(org_id)));
create policy "Members can edit fields" on public.form_fields for update to authenticated using ((select public.is_org_member(org_id))) with check ((select public.is_org_member(org_id)));
create policy "Members can delete fields" on public.form_fields for delete to authenticated using ((select public.is_org_member(org_id)));

-- customers: members manage; owners/admins delete.
create policy "Members can view customers" on public.customers for select to authenticated using ((select public.is_org_member(org_id)));
create policy "Members can add customers" on public.customers for insert to authenticated with check ((select public.is_org_member(org_id)));
create policy "Members can edit customers" on public.customers for update to authenticated using ((select public.is_org_member(org_id))) with check ((select public.is_org_member(org_id)));
create policy "Owners and admins can delete customers" on public.customers for delete to authenticated using ((select public.has_org_role(org_id, '{owner,admin}')));

-- form_submissions: members read; owners/admins delete. Inserted only by the server (rate-limited route).
create policy "Members can view submissions" on public.form_submissions for select to authenticated using ((select public.is_org_member(org_id)));
create policy "Owners and admins can delete submissions" on public.form_submissions for delete to authenticated using ((select public.has_org_role(org_id, '{owner,admin}')));
revoke insert, update on public.form_submissions from authenticated, anon;

-- jobs: members manage; owners/admins delete. Order numbers and tracking tokens are set by the database.
create policy "Members can view jobs" on public.jobs for select to authenticated using ((select public.is_org_member(org_id)));
create policy "Members can create jobs" on public.jobs for insert to authenticated with check ((select public.is_org_member(org_id)));
create policy "Members can edit jobs" on public.jobs for update to authenticated using ((select public.is_org_member(org_id))) with check ((select public.is_org_member(org_id)));
create policy "Owners and admins can delete jobs" on public.jobs for delete to authenticated using ((select public.has_org_role(org_id, '{owner,admin}')));
revoke insert, update on public.jobs from authenticated, anon;
grant insert (org_id, stage_id, form_id, submission_id, customer_id, assignee_id, title, summary, due_date, priority) on public.jobs to authenticated;
grant update (stage_id, assignee_id, title, summary, due_date, priority, completed_at) on public.jobs to authenticated;

-- job_events: members read; members add their own notes. No edits or deletes.
create policy "Members can view job history" on public.job_events for select to authenticated using ((select public.is_org_member(org_id)));
create policy "Members can add notes" on public.job_events for insert to authenticated
  with check ((select public.is_org_member(org_id)) and type = 'note' and actor_id = (select auth.uid()) and idempotency_key is null);
revoke insert, update, delete on public.job_events from authenticated, anon;
grant insert (org_id, job_id, actor_id, type, body) on public.job_events to authenticated;

-- files: members manage metadata; owners/admins delete.
create policy "Members can view files" on public.files for select to authenticated using ((select public.is_org_member(org_id)));
create policy "Members can add files" on public.files for insert to authenticated with check ((select public.is_org_member(org_id)) and uploaded_by = (select auth.uid()));
create policy "Owners and admins can delete files" on public.files for delete to authenticated using ((select public.has_org_role(org_id, '{owner,admin}')));
revoke update on public.files from authenticated, anon;

revoke execute on function public.assign_job_number() from public, anon, authenticated;
revoke execute on function public.audit_job_change() from public, anon, authenticated;
