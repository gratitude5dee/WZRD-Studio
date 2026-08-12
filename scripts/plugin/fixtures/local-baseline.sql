-- Local-stack baseline for the plugin test suites (§11.1).
--
-- Production's core tables (projects, scenes, shots, characters, user_credits)
-- predate the committed migration history — Lovable created them directly — so
-- a plain `supabase db reset` cannot replay the repo's migrations from zero.
-- This fixture recreates just those prerequisites, mirroring the production
-- schema, and is prepended (uncommitted, at test time) as the earliest
-- migration by scripts/plugin/local-stack.sh. It is NOT a deployable
-- migration: production already has all of these tables.

create extension if not exists "uuid-ossp" with schema extensions;

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.projects (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null,
  title text not null default 'Untitled Project',
  description text,
  aspect_ratio text default '16:9',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  concept_option text default 'ai',
  concept_text text,
  format text,
  custom_format_description text,
  genre text,
  tone text,
  add_voiceover boolean default false,
  special_requests text,
  product_name text,
  target_audience text,
  main_message text,
  call_to_action text,
  selected_storyline_id uuid,
  video_style text default 'cinematic',
  style_reference_asset_id uuid,
  cinematic_inspiration text,
  voiceover_id text,
  voiceover_name text,
  voiceover_preview_url text,
  ad_brief_data jsonb default '{}'::jsonb,
  music_video_data jsonb default '{}'::jsonb,
  infotainment_data jsonb default '{}'::jsonb,
  deleted_at timestamptz,
  status text default 'active',
  is_private boolean default true,
  custom_meta_prompts jsonb
);

create table if not exists public.storylines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text,
  description text,
  full_story text,
  tags text[],
  is_selected boolean default false,
  generated_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.scenes (
  id uuid primary key default extensions.uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  storyline_id uuid,
  scene_number integer not null,
  title text,
  description text,
  location text,
  lighting text,
  weather text,
  voiceover text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  location_details jsonb default '{}'::jsonb,
  location_prompt_context text,
  enabled_sections jsonb default '{"sound": true, "objects": false, "clothing": true}'::jsonb,
  story_goal text,
  evaluation_summary jsonb default '{}'::jsonb,
  review_status text default 'not_reviewed'
);

create table if not exists public.shots (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.scenes(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  shot_number integer not null,
  shot_type text,
  prompt_idea text,
  visual_prompt text,
  dialogue text,
  sound_effects text,
  image_url text,
  image_status text default 'pending',
  luma_generation_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  audio_url text,
  audio_status text default 'pending',
  failure_reason text,
  video_url text,
  video_status text default 'pending',
  image_progress integer default 0,
  shot_packet jsonb default '{}'::jsonb,
  evaluation_summary jsonb default '{}'::jsonb,
  review_status text default 'not_reviewed',
  image_asset_id uuid,
  video_asset_id uuid,
  upscaled_image_url text,
  image_generation_error text,
  video_generation_error text,
  image_generation_attempts integer not null default 0,
  video_generation_attempts integer not null default 0
);

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  description text,
  image_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  image_status text default 'pending',
  image_generation_error text,
  identity_profile jsonb default '{}'::jsonb,
  anchor_asset_ids uuid[] default '{}'::uuid[],
  consistency_summary jsonb default '{}'::jsonb
);

create table if not exists public.compute_nodes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  kind text not null,
  label text not null default 'Untitled Node',
  version text not null default '1.0.0',
  position jsonb not null default '{"x": 0, "y": 0}'::jsonb,
  size jsonb default '{"h": 300, "w": 420}'::jsonb,
  inputs jsonb not null default '[]'::jsonb,
  outputs jsonb not null default '[]'::jsonb,
  params jsonb not null default '{}'::jsonb,
  metadata jsonb default '{}'::jsonb,
  preview jsonb,
  status text not null default 'idle',
  progress integer default 0,
  error text,
  is_dirty boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.compute_edges (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  source_node_id uuid not null,
  source_port_id text not null,
  target_node_id uuid not null,
  target_port_id text not null,
  data_type text not null default 'any',
  status text not null default 'idle',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.compute_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  status text not null default 'pending',
  execution_order jsonb default '[]'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  outputs jsonb default '{}'::jsonb,
  logs jsonb default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.saved_flows (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  user_id uuid,
  name text not null,
  description text,
  thumbnail_url text,
  node_count integer default 0,
  edge_count integer default 0,
  flow_data jsonb,
  is_template boolean default false,
  tags text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  status text not null default 'queued',
  mode text not null default 'text-to-image',
  models text[] default '{}'::text[],
  tests text[] default '{}'::text[],
  parameters jsonb default '{}'::jsonb,
  progress integer default 0,
  total_generations integer default 0,
  metadata jsonb default '{}'::jsonb
);

create table if not exists public.evaluation_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.evaluation_runs(id) on delete cascade,
  test_id text not null,
  model_id text not null,
  image_url text,
  generation_time_ms integer,
  judge_score integer,
  judge_reasoning text,
  judge_confidence text,
  criteria_breakdown jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  detailed_reasoning jsonb,
  generation_error text
);

create table if not exists public.audio_tracks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null,
  name text not null,
  storage_bucket text not null default 'audio',
  storage_path text not null,
  duration_ms integer,
  start_time_ms integer,
  end_time_ms integer,
  waveform jsonb default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media_items (
  id uuid primary key default extensions.uuid_generate_v4(),
  project_id uuid not null references public.projects(id) on delete cascade,
  media_type text not null,
  name text not null,
  url text,
  duration double precision,
  start_time double precision default 0,
  end_time double precision,
  status text default 'ready',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  user_id uuid not null default auth.uid(),
  storage_path text,
  storage_bucket text default 'project-media',
  duration_seconds numeric,
  file_size bigint,
  mime_type text,
  thumbnail_url text,
  source_type text default 'uploaded'
);

create table if not exists public.final_project_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_type text not null default 'video',
  file_url text,
  storage_path text,
  storage_bucket text default 'final-exports',
  file_size bigint,
  duration_ms integer,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  progress integer default 0,
  output_url text,
  error_message text,
  settings jsonb default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  provider text default 'internal_ffmpeg',
  provider_job_id text,
  provider_status text,
  fallback_used boolean default false,
  provider_payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.final_project_assets enable row level security;
alter table public.export_jobs enable row level security;

create policy "final_assets_owner" on public.final_project_assets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "export_jobs_owner" on public.export_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.canvas_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null default 'Untitled Canvas',
  description text,
  thumbnail_url text,
  canvas_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.token_holders (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null,
  holder_address text not null,
  holder_name text,
  token_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount integer not null,
  transaction_type text not null,
  resource_type text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.project_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  name text not null,
  url text not null,
  thumbnail_url text,
  type text not null,
  size integer default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.project_settings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  base_text_model text default 'gpt-4o',
  base_image_model text default 'flux-2-turbo',
  base_video_model text default 'minimax-video-01',
  base_audio_model text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  storyline_text_model text default 'llama-3.3-70b-versatile',
  storyline_text_settings jsonb default '{}'::jsonb
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  avatar_url text,
  wallet_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  wallet_type text,
  last_wallet_connection timestamptz,
  onboarding_completed boolean not null default false,
  personality_type text,
  connected_accounts jsonb default '[]'::jsonb,
  uploaded_files jsonb default '[]'::jsonb,
  ai_preferences jsonb default '{"llm": "gpt-4o", "chain": "ethereum", "style": "balanced"}'::jsonb,
  full_name text
);

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_type text not null,
  status text not null default 'queued',
  config jsonb not null default '{}'::jsonb,
  result_url text,
  error_message text,
  progress integer default 0,
  priority integer default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  worker_id text
);

create table if not exists public.user_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  total_credits integer not null default 10,
  used_credits integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;
alter table public.storylines enable row level security;
alter table public.scenes enable row level security;
alter table public.shots enable row level security;
alter table public.characters enable row level security;
alter table public.user_credits enable row level security;

create policy "projects_owner" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "storylines_owner" on public.storylines
  for all using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "scenes_owner" on public.scenes
  for all using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "shots_owner" on public.shots
  for all using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "characters_owner" on public.characters
  for all using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
create policy "user_credits_owner" on public.user_credits
  for select using (auth.uid() = user_id);
