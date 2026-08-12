-- Async job records for MCP tool calls.
--
-- Edge Function isolates are short-lived and non-sticky, so anything an agent
-- has to poll (`get_job`) or replay (idempotency) must be durable rather than
-- in-memory. Credit-spending tools key a row by (user_id, tool,
-- idempotency_key) so a replayed call returns the original result instead of
-- charging twice.

create table if not exists public.wzrd_mcp_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_id uuid references public.wzrd_api_tokens(id) on delete set null,
  tool text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  idempotency_key text,
  args jsonb not null default '{}'::jsonb,
  progress jsonb not null default '{}'::jsonb,
  result jsonb,
  error jsonb,
  credits int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists wzrd_mcp_jobs_idempotency_uniq
  on public.wzrd_mcp_jobs (user_id, tool, idempotency_key)
  where idempotency_key is not null;

create index if not exists wzrd_mcp_jobs_user_created_idx
  on public.wzrd_mcp_jobs (user_id, created_at desc);

drop trigger if exists set_updated_at_wzrd_mcp_jobs on public.wzrd_mcp_jobs;
create trigger set_updated_at_wzrd_mcp_jobs
before update on public.wzrd_mcp_jobs
for each row
execute function public.set_updated_at();

alter table public.wzrd_mcp_jobs enable row level security;

drop policy if exists wzrd_mcp_jobs_select on public.wzrd_mcp_jobs;
create policy wzrd_mcp_jobs_select
on public.wzrd_mcp_jobs
for select
to authenticated
using (user_id = auth.uid());

revoke all on table public.wzrd_mcp_jobs from public;
revoke all on table public.wzrd_mcp_jobs from anon;
revoke all on table public.wzrd_mcp_jobs from authenticated;
grant select on table public.wzrd_mcp_jobs to authenticated;
grant select, insert, update, delete on table public.wzrd_mcp_jobs to service_role;
