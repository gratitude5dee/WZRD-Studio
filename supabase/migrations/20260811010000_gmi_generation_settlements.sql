-- Track credit holds for queued GMI generations so gmi-execute can settle
-- (commit/release) at completion instead of committing at submission time.
-- Service-role only: clients never read or write settlement rows directly.

create table if not exists public.gmi_generation_settlements (
  request_id text primary key,
  user_id uuid not null,
  hold_id uuid,
  hold_skipped boolean not null default false,
  amount numeric(12,2) not null default 0,
  model_id text not null,
  status text not null default 'pending'
    check (status in ('pending', 'committed', 'released', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists gmi_generation_settlements_user_idx
  on public.gmi_generation_settlements (user_id, status);

alter table public.gmi_generation_settlements enable row level security;

-- No policies: only the service role (which bypasses RLS) touches this table.

revoke all on public.gmi_generation_settlements from anon, authenticated;
