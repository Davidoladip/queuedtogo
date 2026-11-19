-- Stage 10, step 1: each business connects its own Stripe or Square account to sell tickets and pre-paid orders.
-- The business is the seller; Stripe or Square carries refunds, disputes and negative balances on that account.
-- QueuedToGo keeps only the account id and status (members can read it) and, for Square, the access tokens,
-- encrypted by the app and never readable from the browser. Everything here is written by the server only.

create table public.payment_accounts (
  org_id            uuid primary key references public.organizations(id) on delete cascade,
  provider          text not null check (provider in ('stripe', 'square')),
  account_id        text not null check (account_id ~ '^[A-Za-z0-9_-]{3,100}$'),
  status            text not null default 'pending' check (status in ('pending', 'active', 'restricted', 'disconnected')),
  charges_enabled   boolean not null default false,
  payouts_enabled   boolean not null default false,
  details_submitted boolean not null default false,
  -- What the provider still needs from the business (Stripe's "currently due" list, shortened).
  requirements      text[] not null default '{}' check (cardinality(requirements) <= 50),
  display_name      text check (display_name is null or char_length(display_name) <= 120),
  -- Square: the location sales are made at.
  location_id       text check (location_id is null or location_id ~ '^[A-Za-z0-9_-]{3,100}$'),
  livemode          boolean not null default false,
  connected_by      uuid references auth.users(id) on delete set null,
  connected_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- A Stripe or Square account can belong to one QueuedToGo business only (no pointing two businesses at one account).
  unique (provider, account_id)
);
comment on table public.payment_accounts is 'The Stripe or Square account each business sells through. Written by the server only.';

create trigger payment_accounts_updated_at before update on public.payment_accounts
  for each row execute function public.set_updated_at();

alter table public.payment_accounts enable row level security;
create policy "Members can see their business's payment account" on public.payment_accounts
  for select to authenticated using ((select public.is_org_member(org_id)));
revoke insert, update, delete, truncate, references, trigger on public.payment_accounts from anon, authenticated;
revoke select on public.payment_accounts from anon;

-- Square OAuth tokens (Stripe needs none: the platform key acts on the connected account). Encrypted by the app
-- (AES-256-GCM, key only in the server's environment); no browser role can read this table at all.
create table public.payment_secrets (
  org_id            uuid primary key references public.organizations(id) on delete cascade,
  provider          text not null check (provider = 'square'),
  access_token_enc  text not null check (char_length(access_token_enc) <= 4000),
  refresh_token_enc text check (refresh_token_enc is null or char_length(refresh_token_enc) <= 4000),
  expires_at        timestamptz,
  updated_at        timestamptz not null default now()
);
create trigger payment_secrets_updated_at before update on public.payment_secrets
  for each row execute function public.set_updated_at();
alter table public.payment_secrets enable row level security;
revoke all on public.payment_secrets from anon, authenticated;

-- One-time "state" values for the Square sign-in round trip (stops someone attaching their account to another
-- business by tricking an owner into clicking a link). Stored hashed; they expire after 15 minutes.
create table public.payment_oauth_states (
  state_hash  text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  provider    text not null check (provider = 'square'),
  expires_at  timestamptz not null default now() + interval '15 minutes'
);
alter table public.payment_oauth_states enable row level security;
revoke all on public.payment_oauth_states from anon, authenticated;

-- Payments are switched on per business (ThreadToGo first), on top of having a connected account.
alter table public.org_billing add column payments_allowed boolean not null default false;
comment on column public.org_billing.payments_allowed is 'Stage 10: this business may sell tickets and pre-paid orders. Set by QueuedToGo staff.';

-- The business's payment setup as its members see it.
create or replace function public.payments_ready(p_org uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce((select b.payments_allowed from public.org_billing b where b.org_id = p_org), false)
     and exists (select 1 from public.payment_accounts a
                  where a.org_id = p_org and a.status = 'active' and a.charges_enabled);
$function$;
revoke all on function public.payments_ready(uuid) from public, anon;
revoke all on function public.payments_ready(uuid) from authenticated;
grant execute on function public.payments_ready(uuid) to service_role;
