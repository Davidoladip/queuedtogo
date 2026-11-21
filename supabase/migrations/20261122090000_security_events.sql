-- Security log: suspicious activity (rate limits hit, failed sign-ins, bad webhook signatures, payment mismatches).
-- No raw IPs, emails, tokens or bodies: only keyed hashes and a short label. Written and read by the server only;
-- a daily job emails a digest when something stands out and deletes entries older than 90 days.
create table public.security_events (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind ~ '^[a-z_]+\.[a-z_]+$' and char_length(kind) <= 40),
  ip_hash     text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{16,64}$'),
  email_hash  text check (email_hash is null or email_hash ~ '^[0-9a-f]{16,64}$'),
  org_id      uuid references public.organizations (id) on delete set null,
  detail      text check (detail is null or char_length(detail) <= 200),
  created_at  timestamptz not null default now()
);
create index security_events_created_idx on public.security_events (created_at desc);
create index security_events_kind_idx on public.security_events (kind, created_at desc);
alter table public.security_events enable row level security;
revoke all on public.security_events from anon, authenticated;
comment on table public.security_events is 'Suspicious activity for the daily security digest. Server only; hashes, never raw IPs or emails.';
