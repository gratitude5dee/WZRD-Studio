-- Personal access tokens for the WZRD Studio Universal Plugin MCP surface.
--
-- Agents authenticate with an opaque token (`wzrd_pat_…`); only its SHA-256 hash
-- is stored. Tokens carry scopes (read / write / generate / billing) and an
-- optional monthly credit cap enforced by the MCP server before any spend.

create extension if not exists pgcrypto;

create table if not exists public.agent_access_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  token_prefix text not null,
  scopes text[] not null default array['read']::text[],
  monthly_credit_cap integer,
  last_used_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_access_tokens_scopes_known check (
    scopes <@ array['read', 'write', 'generate', 'billing']::text[]
  ),
  constraint agent_access_tokens_cap_non_negative check (
    monthly_credit_cap is null or monthly_credit_cap >= 0
  )
);

create index if not exists agent_access_tokens_user_idx
  on public.agent_access_tokens (user_id, created_at desc);

drop trigger if exists set_updated_at_agent_access_tokens on public.agent_access_tokens;
create trigger set_updated_at_agent_access_tokens
before update on public.agent_access_tokens
for each row
execute function public.set_updated_at();

alter table public.agent_access_tokens enable row level security;

-- Token rows are readable/manageable by their owner. The hash column is not a
-- secret-recovery vector, but agents never read this table: the MCP server uses
-- the service role.
drop policy if exists agent_access_tokens_owner on public.agent_access_tokens;
create policy agent_access_tokens_owner
on public.agent_access_tokens
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create table if not exists public.agent_token_usage (
  token_id uuid not null references public.agent_access_tokens(id) on delete cascade,
  period_month date not null,
  credits_used integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (token_id, period_month)
);

alter table public.agent_token_usage enable row level security;

drop policy if exists agent_token_usage_owner on public.agent_token_usage;
create policy agent_token_usage_owner
on public.agent_token_usage
for select
to authenticated
using (
  exists (
    select 1 from public.agent_access_tokens t
    where t.id = agent_token_usage.token_id
      and t.user_id = auth.uid()
  )
);

-- Atomic increment used by the MCP server after a spend commits.
create or replace function public.agent_token_usage_add(
  p_token_id uuid,
  p_credits integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period date := date_trunc('month', now())::date;
  v_total integer;
begin
  insert into public.agent_token_usage (token_id, period_month, credits_used)
  values (p_token_id, v_period, greatest(0, coalesce(p_credits, 0)))
  on conflict (token_id, period_month)
  do update set
    credits_used = public.agent_token_usage.credits_used + greatest(0, coalesce(p_credits, 0)),
    updated_at = now()
  returning credits_used into v_total;

  return v_total;
end;
$$;

revoke all on function public.agent_token_usage_add(uuid, integer) from public;
grant execute on function public.agent_token_usage_add(uuid, integer) to service_role;
