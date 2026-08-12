-- Universal Plugin Phase 3: storyboard sessions (free propose/diff/commit loop)
-- and the shot continuity graph (shots as nodes, typed continuity edges).
--
-- storyboard_sessions holds staged, uncommitted scene/shot deltas so agents can
-- iterate at zero credit cost. `revision` provides optimistic concurrency:
-- storyboard_commit must present the revision it diffed against.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.storyboard_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists storyboard_sessions_project_uniq
  on public.storyboard_sessions (project_id);

drop trigger if exists set_updated_at_storyboard_sessions on public.storyboard_sessions;
create trigger set_updated_at_storyboard_sessions
before update on public.storyboard_sessions
for each row
execute function public.set_updated_at();

alter table public.storyboard_sessions enable row level security;

drop policy if exists storyboard_sessions_select on public.storyboard_sessions;
create policy storyboard_sessions_select
on public.storyboard_sessions
for select
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = storyboard_sessions.project_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists storyboard_sessions_insert on public.storyboard_sessions;
create policy storyboard_sessions_insert
on public.storyboard_sessions
for insert
to authenticated
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists storyboard_sessions_update on public.storyboard_sessions;
create policy storyboard_sessions_update
on public.storyboard_sessions
for update
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = storyboard_sessions.project_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = storyboard_sessions.project_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists storyboard_sessions_delete on public.storyboard_sessions;
create policy storyboard_sessions_delete
on public.storyboard_sessions
for delete
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = storyboard_sessions.project_id
      and p.user_id = auth.uid()
  )
);

-- ── Shot continuity graph ────────────────────────────────────────────────────
-- Edges are directed: from_shot_id is the predecessor that to_shot_id inherits
-- continuity from. `entity_type` types the edge; `entity_key` is the normalized
-- entity (character name, location, prop) the edge was derived from.

alter table public.shots
  add column if not exists continuity jsonb;

comment on column public.shots.continuity is
  'Agent-supplied continuity override: { characters, locations, props, predecessorShotId, ignore }. Null means fully derived.';

create table if not exists public.shot_continuity_edges (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  from_shot_id uuid not null references public.shots(id) on delete cascade,
  to_shot_id uuid not null references public.shots(id) on delete cascade,
  entity_type text not null check (entity_type in ('character', 'location', 'prop')),
  entity_key text not null,
  source text not null default 'derived' check (source in ('derived', 'agent')),
  created_at timestamptz not null default now(),
  constraint shot_continuity_edges_no_self check (from_shot_id <> to_shot_id)
);

create unique index if not exists shot_continuity_edges_uniq
  on public.shot_continuity_edges (to_shot_id, from_shot_id, entity_type, entity_key);

create index if not exists shot_continuity_edges_project_idx
  on public.shot_continuity_edges (project_id, to_shot_id);

alter table public.shot_continuity_edges enable row level security;

drop policy if exists shot_continuity_edges_select on public.shot_continuity_edges;
create policy shot_continuity_edges_select
on public.shot_continuity_edges
for select
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = shot_continuity_edges.project_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists shot_continuity_edges_write on public.shot_continuity_edges;
create policy shot_continuity_edges_write
on public.shot_continuity_edges
for all
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = shot_continuity_edges.project_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = shot_continuity_edges.project_id
      and p.user_id = auth.uid()
  )
);
