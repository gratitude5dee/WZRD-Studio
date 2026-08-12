-- The spend guard counted one request per call, but a credit-spending MCP tool
-- calls it twice: once up front to charge rate-limit budget, and again inside
-- reserveCredits to charge the daily cap. That halved the effective 60 rpm
-- ceiling. The guard now takes p_count_request so the second call prices the
-- credits without consuming another request unit.
drop function if exists public.wzrd_token_spend_guard(uuid, int, boolean);

create or replace function public.wzrd_token_spend_guard(
  p_token_id uuid,
  p_credits int default 0,
  p_dry_run boolean default false,
  p_count_request boolean default true
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
  v_count_request boolean := coalesce(p_count_request, true) and not coalesce(p_dry_run, false);
begin
  select daily_credit_cap into v_cap
  from public.wzrd_api_tokens
  where id = p_token_id
  for update;

  if not found then
    return jsonb_build_object('allowed', false, 'code', 'not_found');
  end if;

  if v_count_request then
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
  else
    -- A dry run, or the second call of one request, only reads the buckets.
    select coalesce(requests, 0) into v_minute_requests
    from public.wzrd_api_token_usage
    where token_id = p_token_id and bucket = 'minute' and bucket_start = v_minute;
    v_minute_requests := coalesce(v_minute_requests, 0);

    select coalesce(requests, 0) into v_hour_requests
    from public.wzrd_api_token_usage
    where token_id = p_token_id and bucket = 'hour' and bucket_start = v_hour;
    v_hour_requests := coalesce(v_hour_requests, 0);
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

revoke all on function public.wzrd_token_spend_guard(uuid, int, boolean, boolean) from public;
revoke all on function public.wzrd_token_spend_guard(uuid, int, boolean, boolean) from anon;
revoke all on function public.wzrd_token_spend_guard(uuid, int, boolean, boolean) from authenticated;
grant execute on function public.wzrd_token_spend_guard(uuid, int, boolean, boolean) to service_role;
