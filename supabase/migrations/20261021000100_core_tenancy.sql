-- QueuedToGo: core tenancy (organizations, profiles, members, invitations)
-- Every business is an organization. Users reach business data only through organization_members.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.org_role as enum ('owner', 'admin', 'member');
create type public.form_status as enum ('draft', 'live', 'closed');
create type public.notify_channel as enum ('sms', 'whatsapp', 'email');

-- ---------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Business-owned rows can never move to another organization.
create or replace function public.prevent_org_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'Records cannot be moved to another business' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
create table public.organizations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(btrim(name)) between 1 and 120),
  slug             text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$'),
  country          text not null default 'US' check (country ~ '^[A-Z]{2}$'),
  timezone         text not null default 'America/New_York' check (char_length(timezone) between 1 and 64),
  currency         text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  brand            jsonb not null default '{"colors": []}'::jsonb
                   check (jsonb_typeof(brand) = 'object' and pg_column_size(brand) < 16384),
  next_job_number  integer not null default 1001 check (next_job_number > 0),
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.organizations is 'One row per business using QueuedToGo.';

create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- profiles (one per auth user, created automatically)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text check (full_name is null or char_length(full_name) <= 120),
  email       text check (email is null or char_length(email) <= 254),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.profiles is 'Public profile for each signed-up user. Email is copied from auth.users so teammates can see it.';

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120), ''),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- organization_members
-- ---------------------------------------------------------------------------
create table public.organization_members (
  org_id      uuid not null references public.organizations (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        public.org_role not null default 'member',
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

-- Membership helpers. SECURITY DEFINER so policies on organization_members can use them
-- without recursing into their own RLS.
create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.has_org_role(p_org uuid, p_roles public.org_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.role = any (p_roles)
  );
$$;

-- Guard membership changes: keep at least one owner; only owners manage owners.
create or replace function public.guard_member_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role public.org_role;
  v_owner_count integer;
begin
  -- Deleting the whole organization cascades here; allow it.
  if tg_op = 'DELETE' and not exists (select 1 from public.organizations o where o.id = old.org_id) then
    return old;
  end if;

  if tg_op = 'UPDATE' and (new.org_id <> old.org_id or new.user_id <> old.user_id) then
    raise exception 'Membership business and user cannot be changed' using errcode = '42501';
  end if;

  select m.role into v_caller_role
  from public.organization_members m
  where m.org_id = old.org_id and m.user_id = (select auth.uid());

  -- Losing an owner (removed, left, or demoted)
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    select count(*) into v_owner_count
    from public.organization_members m
    where m.org_id = old.org_id and m.role = 'owner';
    if v_owner_count <= 1 then
      raise exception 'A business must keep at least one owner. Make someone else an owner first.' using errcode = 'P0001';
    end if;
    if (select auth.uid()) is not null and old.user_id <> (select auth.uid()) and v_caller_role is distinct from 'owner' then
      raise exception 'Only owners can remove or change another owner' using errcode = '42501';
    end if;
  end if;

  -- Granting owner
  if tg_op = 'UPDATE' and new.role = 'owner' and old.role <> 'owner'
     and (select auth.uid()) is not null and v_caller_role is distinct from 'owner' then
    raise exception 'Only owners can make someone an owner' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger organization_members_guard
  before update or delete on public.organization_members
  for each row execute function public.guard_member_change();

-- ---------------------------------------------------------------------------
-- organization_invitations
-- ---------------------------------------------------------------------------
create table public.organization_invitations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  email        text not null check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role         public.org_role not null default 'member' check (role <> 'owner'),
  token_hash   text not null unique,
  invited_by   uuid references public.profiles (id) on delete set null,
  expires_at   timestamptz not null default (now() + interval '7 days'),
  accepted_at  timestamptz,
  accepted_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create unique index organization_invitations_open_email_idx
  on public.organization_invitations (org_id, lower(email)) where accepted_at is null;
comment on column public.organization_invitations.token_hash is 'SHA-256 of the invite token. The raw token is shown once to the inviter and never stored.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;

-- organizations: members read; owners/admins edit settings; owners delete. Created only via create_organization().
create policy "Members can view their organizations" on public.organizations
  for select to authenticated using ((select public.is_org_member(id)));
create policy "Owners and admins can update organization settings" on public.organizations
  for update to authenticated
  using ((select public.has_org_role(id, '{owner,admin}')))
  with check ((select public.has_org_role(id, '{owner,admin}')));
create policy "Owners can delete organizations" on public.organizations
  for delete to authenticated using ((select public.has_org_role(id, '{owner}')));

-- Only settings columns are editable from the app; counters and ownership are not.
revoke update on public.organizations from authenticated, anon;
grant update (name, slug, country, timezone, currency, brand) on public.organizations to authenticated;

-- profiles: you see yourself and people who share a business with you.
create policy "Users can view their own and teammates' profiles" on public.profiles
  for select to authenticated using (
    id = (select auth.uid())
    or exists (
      select 1
      from public.organization_members mine
      join public.organization_members theirs on theirs.org_id = mine.org_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
    )
  );
create policy "Users can update their own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.profiles from authenticated, anon;
grant update (full_name) on public.profiles to authenticated;

-- organization_members: members see the team; owners/admins change roles and remove; anyone can leave.
-- New members join only through create_organization() or accept_invitation().
create policy "Members can view their team" on public.organization_members
  for select to authenticated using ((select public.is_org_member(org_id)));
create policy "Owners and admins can change roles" on public.organization_members
  for update to authenticated
  using ((select public.has_org_role(org_id, '{owner,admin}')))
  with check ((select public.has_org_role(org_id, '{owner,admin}')));
create policy "Owners and admins can remove members; anyone can leave" on public.organization_members
  for delete to authenticated using (
    user_id = (select auth.uid()) or (select public.has_org_role(org_id, '{owner,admin}'))
  );
revoke update on public.organization_members from authenticated, anon;
grant update (role) on public.organization_members to authenticated;

-- invitations: owners/admins see and cancel; created only via create_invitation().
create policy "Owners and admins can view invitations" on public.organization_invitations
  for select to authenticated using ((select public.has_org_role(org_id, '{owner,admin}')));
create policy "Owners and admins can cancel invitations" on public.organization_invitations
  for delete to authenticated using ((select public.has_org_role(org_id, '{owner,admin}')));
revoke insert, update, select on public.organization_invitations from authenticated, anon;
grant select (id, org_id, email, role, invited_by, expires_at, accepted_at, accepted_by, created_at)
  on public.organization_invitations to authenticated;

-- ---------------------------------------------------------------------------
-- Functions callable from the app
-- ---------------------------------------------------------------------------
revoke execute on function public.is_org_member(uuid) from public, anon;
revoke execute on function public.has_org_role(uuid, public.org_role[]) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.org_role[]) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;
revoke execute on function public.guard_member_change() from public, anon, authenticated;
