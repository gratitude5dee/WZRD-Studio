-- Long-running MCP tool calls. Tools that spend credits never block the JSON-RPC
-- response: they reserve credits, insert a job row, return `{ jobId }`, and settle
-- (commit or release) from the background task, so an interrupted client can never
-- leave an orphaned credit hold.

create extension if not exists pgcrypto;

create table if not exists public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_id uuid references public.agent_access_tokens(id) on delete set null,
  tool text not null,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed', 'cancelled')),
  project_id uuid references public.projects(id) on delete cascade,
  idempotency_key text not null,
  credit_hold_id uuid,
  credits_quoted integer not null default 0,
  credits_charged integer,
  request jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists agent_jobs_user_idempotency_uniq
  on public.agent_jobs (user_id, tool, idempotency_key);

create index if not exists agent_jobs_user_created_idx
  on public.agent_jobs (user_id, created_at desc);

drop trigger if exists set_updated_at_agent_jobs on public.agent_jobs;
create trigger set_updated_at_agent_jobs
before update on public.agent_jobs
for each row
execute function public.set_updated_at();

alter table public.agent_jobs enable row level security;

drop policy if exists agent_jobs_owner_select on public.agent_jobs;
create policy agent_jobs_owner_select
on public.agent_jobs
for select
to authenticated
using (user_id = auth.uid());
