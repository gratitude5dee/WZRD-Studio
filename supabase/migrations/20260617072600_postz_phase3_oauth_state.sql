-- Phase 3: Postz OAuth state store (short-lived PKCE/CSRF)
-- Source of truth: postizgoal.md §5.3

create table if not exists public.postz_oauth_state (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  provider text not null,
  state text not null,
  code_verifier text not null,
  redirect text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists postz_oauth_state_owner_idx on public.postz_oauth_state (owner_id);
create index if not exists postz_oauth_state_state_idx on public.postz_oauth_state (state);
create index if not exists postz_oauth_state_expires_idx on public.postz_oauth_state (expires_at);

alter table public.postz_oauth_state enable row level security;
-- Intentionally no RLS policies: client should never read/write this table.
