-- Personal access tokens (PATs) for the WZRD Studio universal agent plugin.
--
-- A PAT is the sole identity carried by MCP requests: the raw token is shown
-- once at mint time and only its sha256 hex digest is stored, so a leaked row
-- cannot be replayed against the MCP server.

create extension if not exists pgcrypto;

create table if not exists public.wzrd_api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  -- sha256(raw token) as lowercase hex. The raw token is never stored.
  token_hash text not null unique,
  -- Leading characters of the raw token, for humans to recognise a row.
  token_prefix text not null,
  scopes text[] not null default '{read}'::text[],
  daily_credit_cap int not null default 500,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint wzrd_api_tokens_name_not_blank check (length(btrim(name)) > 0),
  constraint wzrd_api_tokens_daily_credit_cap_positive check (daily_credit_cap >= 0),
  constraint wzrd_api_tokens_scopes_known check (
    scopes <@ array['read', 'generate', 'billing']::text[]
  )
);

-- Hash lookups only ever consider live tokens.
create index if not exists wzrd_api_tokens_active_hash_idx
  on public.wzrd_api_tokens (token_hash)
  where revoked_at is null;

create index if not exists wzrd_api_tokens_user_created_idx
  on public.wzrd_api_tokens (user_id, created_at desc);

alter table public.wzrd_api_tokens enable row level security;

drop policy if exists wzrd_api_tokens_select on public.wzrd_api_tokens;
create policy wzrd_api_tokens_select
on public.wzrd_api_tokens
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists wzrd_api_tokens_insert on public.wzrd_api_tokens;
create policy wzrd_api_tokens_insert
on public.wzrd_api_tokens
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists wzrd_api_tokens_update on public.wzrd_api_tokens;
create policy wzrd_api_tokens_update
on public.wzrd_api_tokens
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Supabase default privileges expose new public tables broadly; keep this one
-- owner-scoped and, critically, never let a client read token_hash back.
revoke all on table public.wzrd_api_tokens from public;
revoke all on table public.wzrd_api_tokens from anon;
revoke all on table public.wzrd_api_tokens from authenticated;

grant select (
  id, user_id, name, token_prefix, scopes, daily_credit_cap,
  expires_at, last_used_at, revoked_at, created_at
) on table public.wzrd_api_tokens to authenticated;

grant insert (
  user_id, name, token_hash, token_prefix, scopes, daily_credit_cap, expires_at
) on table public.wzrd_api_tokens to authenticated;

grant update (
  name, scopes, daily_credit_cap, expires_at, revoked_at
) on table public.wzrd_api_tokens to authenticated;

grant select, insert, update, delete on table public.wzrd_api_tokens to service_role;
