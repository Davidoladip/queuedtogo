-- Who accepted which version of the Terms of Service, and when: the evidence that a business agreed to them.
-- Written only by the server (service role); a person can read their own rows.
create table public.terms_acceptances (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  org_id       uuid references public.organizations (id) on delete set null,
  version      text not null check (version ~ '^\d{4}-\d{2}-\d{2}$'),
  context      text not null check (context in ('onboarding', 'update')),
  ip_hash      text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{16,64}$'),
  accepted_at  timestamptz not null default now()
);
create index terms_acceptances_user_idx on public.terms_acceptances (user_id, version);
create index terms_acceptances_org_idx on public.terms_acceptances (org_id);
alter table public.terms_acceptances enable row level security;
revoke all on public.terms_acceptances from anon, authenticated;
grant select on public.terms_acceptances to authenticated;
create policy terms_acceptances_own on public.terms_acceptances for select to authenticated using (user_id = (select auth.uid()));
comment on table public.terms_acceptances is 'Terms of Service acceptances (version, time, hashed IP). Inserted by the server only.';
