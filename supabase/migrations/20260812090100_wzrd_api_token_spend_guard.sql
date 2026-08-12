-- Spend guard for agent PATs: per-token daily credit cap plus request rate
-- limits. Counters live in fixed time buckets so enforcement is a single
-- atomic upsert per request and old rows can be pruned by bucket_start.

create table if not exists public.wzrd_api_token_usage (
  token_id uuid not null references public.wzrd_api_tokens(id) on delete cascade,
  bucket text not null check (bucket in ('minute', 'hour', 'day')),
  bucket_start timestamptz not null,
  requests int not null default 0,
  credits int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (token_id, bucket, bucket_start)
);

create index if not exists wzrd_api_token_usage_bucket_start_idx
  on public.wzrd_api_token_usage (bucket_start);

alter table public.wzrd_api_token_usage enable row level security;

-- No client-facing policies: only the service role (via the functions below)
-- touches these counters.
revoke all on table public.wzrd_api_token_usage from public;
revoke all on table public.wzrd_api_token_usage from anon;
revoke all on table public.wzrd_api_token_usage from authenticated;
grant select, insert, update, delete on table public.wzrd_api_token_usage to service_role;

-- Rate limits are deliberately not configurable per token: a burst ceiling of
-- 60 requests/minute and 600/hour keeps a runaway agent loop from exhausting
-- provider quota before the daily credit cap can bite.
create or replace function public.wzrd_token_spend_guard(
  p_token_id uuid,
  p_credits int default 0,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cap int;
  v_minute timestamptz := date_trunc('minute', now());
  v_hour timestamptz := date_trunc('hour', now());
  v_day timestamptz := date_trunc('day', now() at time zone 'utc');
  v_minute_requests int;
  v_hour_requests int;
  v_used int := 0;
  v_credits int := greatest(coalesce(p_credits, 0), 0);
begin
  select daily_credit_cap into v_cap
  from public.wzrd_api_tokens
  where id = p_token_id
  for update;

  if not found then
    return jsonb_build_object('allowed', false, 'code', 'not_found');
  end if;

  -- A dry run prices a call without performing it, so it must leave every
  -- counter untouched: it only reads the current buckets.
  if coalesce(p_dry_run, false) then
    select coalesce(requests, 0) into v_minute_requests
    from public.wzrd_api_token_usage
    where token_id = p_token_id and bucket = 'minute' and bucket_start = v_minute;
    v_minute_requests := coalesce(v_minute_requests, 0);

    select coalesce(requests, 0) into v_hour_requests
    from public.wzrd_api_token_usage
    where token_id = p_token_id and bucket = 'hour' and bucket_start = v_hour;
    v_hour_requests := coalesce(v_hour_requests, 0);
  else
    insert into public.wzrd_api_token_usage (token_id, bucket, bucket_start, requests)
    values (p_token_id, 'minute', v_minute, 1)
    on conflict (token_id, bucket, bucket_start)
    do update set requests = public.wzrd_api_token_usage.requests + 1, updated_at = now()
    returning requests into v_minute_requests;

    insert into public.wzrd_api_token_usage (token_id, bucket, bucket_start, requests)
    values (p_token_id, 'hour', v_hour, 1)
    on conflict (token_id, bucket, bucket_start)
    do update set requests = public.wzrd_api_token_usage.requests + 1, updated_at = now()
    returning requests into v_hour_requests;
  end if;

  if v_minute_requests > 60 then
    return jsonb_build_object(
      'allowed', false,
      'code', 'rate_limited',
      'limit', 60,
      'window', 'minute',
      'resets_at', v_minute + interval '1 minute'
    );
  end if;

  if v_hour_requests > 600 then
    return jsonb_build_object(
      'allowed', false,
      'code', 'rate_limited',
      'limit', 600,
      'window', 'hour',
      'resets_at', v_hour + interval '1 hour'
    );
  end if;

  select credits into v_used
  from public.wzrd_api_token_usage
  where token_id = p_token_id and bucket = 'day' and bucket_start = v_day;
  v_used := coalesce(v_used, 0);

  if v_credits > 0 then
    if v_used + v_credits > v_cap then
      return jsonb_build_object(
        'allowed', false,
        'code', 'daily_cap',
        'used', v_used,
        'cap', v_cap,
        'requested', v_credits,
        'resets_at', v_day + interval '1 day'
      );
    end if;

    if not coalesce(p_dry_run, false) then
      insert into public.wzrd_api_token_usage (token_id, bucket, bucket_start, credits)
      values (p_token_id, 'day', v_day, v_credits)
      on conflict (token_id, bucket, bucket_start)
      do update set credits = public.wzrd_api_token_usage.credits + v_credits, updated_at = now()
      returning credits into v_used;
    else
      v_used := v_used + v_credits;
    end if;
  end if;

  return jsonb_build_object(
    'allowed', true,
    'used', v_used,
    'cap', v_cap,
    'resets_at', v_day + interval '1 day'
  );
end;
$$;

-- Give back daily headroom when a reservation is released unspent.
create or replace function public.wzrd_token_release_spend(
  p_token_id uuid,
  p_credits int
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_day timestamptz := date_trunc('day', now() at time zone 'utc');
  v_credits int := greatest(coalesce(p_credits, 0), 0);
begin
  if v_credits = 0 then
    return;
  end if;

  update public.wzrd_api_token_usage
  set credits = greatest(credits - v_credits, 0), updated_at = now()
  where token_id = p_token_id and bucket = 'day' and bucket_start = v_day;
end;
$$;

revoke all on function public.wzrd_token_spend_guard(uuid, int, boolean) from public;
revoke all on function public.wzrd_token_spend_guard(uuid, int, boolean) from anon;
revoke all on function public.wzrd_token_spend_guard(uuid, int, boolean) from authenticated;
grant execute on function public.wzrd_token_spend_guard(uuid, int, boolean) to service_role;

revoke all on function public.wzrd_token_release_spend(uuid, int) from public;
revoke all on function public.wzrd_token_release_spend(uuid, int) from anon;
revoke all on function public.wzrd_token_release_spend(uuid, int) from authenticated;
grant execute on function public.wzrd_token_release_spend(uuid, int) to service_role;
