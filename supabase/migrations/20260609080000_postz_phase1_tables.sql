-- Phase 1: Postz (Postiz port) foundational tables + RLS + indexes
-- Source of truth: postizgoal.md

-- Extensions
create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- updated_at trigger helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- postz_channels
-- -----------------------------------------------------------------------------
create table if not exists public.postz_channels (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  workspace_id uuid null,
  provider text not null,
  provider_account_id text not null,
  name text null,
  username text null,
  picture text null,
  profile jsonb null,
  token_ref text not null,
  refresh_token_ref text null,
  token_expires_at timestamptz null,
  status text not null default 'connected',
  disabled boolean not null default false,
  posting_times jsonb not null default '[{"time":120},{"time":400},{"time":700}]'::jsonb,
  additional_settings jsonb not null default '[]'::jsonb,
  custom_instance_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create unique index if not exists postz_channels_owner_provider_account_uniq
  on public.postz_channels (owner_id, provider, provider_account_id);
create index if not exists postz_channels_owner_idx on public.postz_channels (owner_id);
create index if not exists postz_channels_provider_idx on public.postz_channels (provider);
create index if not exists postz_channels_status_idx on public.postz_channels (status);

drop trigger if exists set_updated_at_postz_channels on public.postz_channels;
create trigger set_updated_at_postz_channels
before update on public.postz_channels
for each row
execute function public.set_updated_at();

alter table public.postz_channels enable row level security;

drop policy if exists postz_channels_select on public.postz_channels;
create policy postz_channels_select
on public.postz_channels
for select
to authenticated
using (owner_id = auth.uid() and deleted_at is null);

drop policy if exists postz_channels_insert on public.postz_channels;
create policy postz_channels_insert
on public.postz_channels
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists postz_channels_update on public.postz_channels;
create policy postz_channels_update
on public.postz_channels
for update
to authenticated
using (owner_id = auth.uid() and deleted_at is null)
with check (owner_id = auth.uid());

drop policy if exists postz_channels_delete on public.postz_channels;
create policy postz_channels_delete
on public.postz_channels
for delete
to authenticated
using (owner_id = auth.uid() and deleted_at is null);

-- -----------------------------------------------------------------------------
-- postz_posts
-- -----------------------------------------------------------------------------
create table if not exists public.postz_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  channel_id uuid not null references public.postz_channels (id),
  group_id uuid not null,
  state text not null default 'QUEUE',
  publish_date timestamptz not null,
  content text not null default '',
  title text null,
  description text null,
  settings jsonb null,
  media jsonb not null default '[]'::jsonb,
  poll jsonb null,
  parent_post_id uuid null references public.postz_posts (id),
  first_comment text null,
  release_url text null,
  release_provider_id text null,
  error text null,
  attempts int not null default 0,
  interval_in_days int null,
  creation_method text not null default 'ui',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create index if not exists postz_posts_owner_idx on public.postz_posts (owner_id);
create index if not exists postz_posts_channel_idx on public.postz_posts (channel_id);
create index if not exists postz_posts_group_idx on public.postz_posts (group_id);
create index if not exists postz_posts_state_idx on public.postz_posts (state);
create index if not exists postz_posts_publish_date_idx on public.postz_posts (publish_date);
create index if not exists postz_posts_state_publish_date_idx on public.postz_posts (state, publish_date);

drop trigger if exists set_updated_at_postz_posts on public.postz_posts;
create trigger set_updated_at_postz_posts
before update on public.postz_posts
for each row
execute function public.set_updated_at();

alter table public.postz_posts enable row level security;

drop policy if exists postz_posts_select on public.postz_posts;
create policy postz_posts_select
on public.postz_posts
for select
to authenticated
using (owner_id = auth.uid() and deleted_at is null);

drop policy if exists postz_posts_insert on public.postz_posts;
create policy postz_posts_insert
on public.postz_posts
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists postz_posts_update on public.postz_posts;
create policy postz_posts_update
on public.postz_posts
for update
to authenticated
using (owner_id = auth.uid() and deleted_at is null)
with check (owner_id = auth.uid());

drop policy if exists postz_posts_delete on public.postz_posts;
create policy postz_posts_delete
on public.postz_posts
for delete
to authenticated
using (owner_id = auth.uid() and deleted_at is null);

-- -----------------------------------------------------------------------------
-- postz_tags
-- -----------------------------------------------------------------------------
create table if not exists public.postz_tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  name text not null,
  color text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create unique index if not exists postz_tags_owner_name_uniq on public.postz_tags (owner_id, name);
create index if not exists postz_tags_owner_idx on public.postz_tags (owner_id);

drop trigger if exists set_updated_at_postz_tags on public.postz_tags;
create trigger set_updated_at_postz_tags
before update on public.postz_tags
for each row
execute function public.set_updated_at();

alter table public.postz_tags enable row level security;

drop policy if exists postz_tags_select on public.postz_tags;
create policy postz_tags_select
on public.postz_tags
for select
to authenticated
using (owner_id = auth.uid() and deleted_at is null);

drop policy if exists postz_tags_insert on public.postz_tags;
create policy postz_tags_insert
on public.postz_tags
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists postz_tags_update on public.postz_tags;
create policy postz_tags_update
on public.postz_tags
for update
to authenticated
using (owner_id = auth.uid() and deleted_at is null)
with check (owner_id = auth.uid());

drop policy if exists postz_tags_delete on public.postz_tags;
create policy postz_tags_delete
on public.postz_tags
for delete
to authenticated
using (owner_id = auth.uid() and deleted_at is null);

-- -----------------------------------------------------------------------------
-- postz_post_tags
-- -----------------------------------------------------------------------------
create table if not exists public.postz_post_tags (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  post_id uuid not null references public.postz_posts (id) on delete cascade,
  tag_id uuid not null references public.postz_tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  unique (post_id, tag_id)
);

create index if not exists postz_post_tags_owner_idx on public.postz_post_tags (owner_id);
create index if not exists postz_post_tags_post_idx on public.postz_post_tags (post_id);
create index if not exists postz_post_tags_tag_idx on public.postz_post_tags (tag_id);

drop trigger if exists set_updated_at_postz_post_tags on public.postz_post_tags;
create trigger set_updated_at_postz_post_tags
before update on public.postz_post_tags
for each row
execute function public.set_updated_at();

alter table public.postz_post_tags enable row level security;

drop policy if exists postz_post_tags_select on public.postz_post_tags;
create policy postz_post_tags_select
on public.postz_post_tags
for select
to authenticated
using (owner_id = auth.uid() and deleted_at is null);

drop policy if exists postz_post_tags_insert on public.postz_post_tags;
create policy postz_post_tags_insert
on public.postz_post_tags
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists postz_post_tags_update on public.postz_post_tags;
create policy postz_post_tags_update
on public.postz_post_tags
for update
to authenticated
using (owner_id = auth.uid() and deleted_at is null)
with check (owner_id = auth.uid());

drop policy if exists postz_post_tags_delete on public.postz_post_tags;
create policy postz_post_tags_delete
on public.postz_post_tags
for delete
to authenticated
using (owner_id = auth.uid() and deleted_at is null);

-- -----------------------------------------------------------------------------
-- postz_sets
-- -----------------------------------------------------------------------------
create table if not exists public.postz_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  name text not null,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create unique index if not exists postz_sets_owner_name_uniq on public.postz_sets (owner_id, name);
create index if not exists postz_sets_owner_idx on public.postz_sets (owner_id);

drop trigger if exists set_updated_at_postz_sets on public.postz_sets;
create trigger set_updated_at_postz_sets
before update on public.postz_sets
for each row
execute function public.set_updated_at();

alter table public.postz_sets enable row level security;

drop policy if exists postz_sets_select on public.postz_sets;
create policy postz_sets_select
on public.postz_sets
for select
to authenticated
using (owner_id = auth.uid() and deleted_at is null);

drop policy if exists postz_sets_insert on public.postz_sets;
create policy postz_sets_insert
on public.postz_sets
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists postz_sets_update on public.postz_sets;
create policy postz_sets_update
on public.postz_sets
for update
to authenticated
using (owner_id = auth.uid() and deleted_at is null)
with check (owner_id = auth.uid());

drop policy if exists postz_sets_delete on public.postz_sets;
create policy postz_sets_delete
on public.postz_sets
for delete
to authenticated
using (owner_id = auth.uid() and deleted_at is null);

-- -----------------------------------------------------------------------------
-- postz_signatures
-- -----------------------------------------------------------------------------
create table if not exists public.postz_signatures (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  name text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create unique index if not exists postz_signatures_owner_name_uniq on public.postz_signatures (owner_id, name);
create index if not exists postz_signatures_owner_idx on public.postz_signatures (owner_id);

drop trigger if exists set_updated_at_postz_signatures on public.postz_signatures;
create trigger set_updated_at_postz_signatures
before update on public.postz_signatures
for each row
execute function public.set_updated_at();

alter table public.postz_signatures enable row level security;

drop policy if exists postz_signatures_select on public.postz_signatures;
create policy postz_signatures_select
on public.postz_signatures
for select
to authenticated
using (owner_id = auth.uid() and deleted_at is null);

drop policy if exists postz_signatures_insert on public.postz_signatures;
create policy postz_signatures_insert
on public.postz_signatures
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists postz_signatures_update on public.postz_signatures;
create policy postz_signatures_update
on public.postz_signatures
for update
to authenticated
using (owner_id = auth.uid() and deleted_at is null)
with check (owner_id = auth.uid());

drop policy if exists postz_signatures_delete on public.postz_signatures;
create policy postz_signatures_delete
on public.postz_signatures
for delete
to authenticated
using (owner_id = auth.uid() and deleted_at is null);

-- -----------------------------------------------------------------------------
-- postz_analytics
-- -----------------------------------------------------------------------------
create table if not exists public.postz_analytics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  channel_id uuid not null references public.postz_channels (id),
  post_id uuid null references public.postz_posts (id),
  metric text not null,
  value numeric not null,
  captured_for date not null,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  unique (channel_id, post_id, metric, captured_for)
);

create index if not exists postz_analytics_owner_idx on public.postz_analytics (owner_id);
create index if not exists postz_analytics_channel_idx on public.postz_analytics (channel_id);
create index if not exists postz_analytics_post_idx on public.postz_analytics (post_id);

drop trigger if exists set_updated_at_postz_analytics on public.postz_analytics;
create trigger set_updated_at_postz_analytics
before update on public.postz_analytics
for each row
execute function public.set_updated_at();

alter table public.postz_analytics enable row level security;

drop policy if exists postz_analytics_select on public.postz_analytics;
create policy postz_analytics_select
on public.postz_analytics
for select
to authenticated
using (owner_id = auth.uid() and deleted_at is null);

drop policy if exists postz_analytics_insert on public.postz_analytics;
create policy postz_analytics_insert
on public.postz_analytics
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists postz_analytics_update on public.postz_analytics;
create policy postz_analytics_update
on public.postz_analytics
for update
to authenticated
using (owner_id = auth.uid() and deleted_at is null)
with check (owner_id = auth.uid());

drop policy if exists postz_analytics_delete on public.postz_analytics;
create policy postz_analytics_delete
on public.postz_analytics
for delete
to authenticated
using (owner_id = auth.uid() and deleted_at is null);

-- -----------------------------------------------------------------------------
-- postz_oauth_state (server-only)
-- -----------------------------------------------------------------------------
create table if not exists public.postz_oauth_state (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  provider text not null,
  state text not null,
  code_verifier text not null,
  redirect text null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create index if not exists postz_oauth_state_owner_idx on public.postz_oauth_state (owner_id);
create index if not exists postz_oauth_state_provider_idx on public.postz_oauth_state (provider);
create index if not exists postz_oauth_state_state_idx on public.postz_oauth_state (state);

drop trigger if exists set_updated_at_postz_oauth_state on public.postz_oauth_state;
create trigger set_updated_at_postz_oauth_state
before update on public.postz_oauth_state
for each row
execute function public.set_updated_at();


alter table public.postz_oauth_state enable row level security;

-- deny all client access (service role bypasses RLS)
drop policy if exists postz_oauth_state_deny on public.postz_oauth_state;
create policy postz_oauth_state_deny
on public.postz_oauth_state
as restrictive
for all
to authenticated
using (false)
with check (false);

-- -----------------------------------------------------------------------------
-- postz_publish_log (server-only)
-- -----------------------------------------------------------------------------
create table if not exists public.postz_publish_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  post_id uuid not null references public.postz_posts (id),
  channel_id uuid not null references public.postz_channels (id),
  attempt int not null,
  outcome text not null,
  detail jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create index if not exists postz_publish_log_owner_idx on public.postz_publish_log (owner_id);
create index if not exists postz_publish_log_post_idx on public.postz_publish_log (post_id);
create index if not exists postz_publish_log_channel_idx on public.postz_publish_log (channel_id);

drop trigger if exists set_updated_at_postz_publish_log on public.postz_publish_log;
create trigger set_updated_at_postz_publish_log
before update on public.postz_publish_log
for each row
execute function public.set_updated_at();


alter table public.postz_publish_log enable row level security;

-- deny all client access (service role bypasses RLS)
drop policy if exists postz_publish_log_deny on public.postz_publish_log;
create policy postz_publish_log_deny
on public.postz_publish_log
as restrictive
for all
to authenticated
using (false)
with check (false);


notify pgrst, 'reload schema';
