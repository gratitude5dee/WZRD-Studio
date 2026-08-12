-- A PAT's daily headroom is charged for the full reservation before the work
-- runs, so a commit that settles for less has to give the difference back.
-- Deriving the reservation from credit_holds here (rather than having every
-- commitCredits caller pass it) means a new call site cannot silently skip the
-- refund and leak headroom.
create or replace function public.wzrd_token_commit_reconcile(
  p_token_id uuid,
  p_hold_id uuid,
  p_actual numeric
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_day timestamptz := date_trunc('day', now() at time zone 'utc');
  v_reserved numeric;
  v_refund int;
begin
  select reserved_amount into v_reserved
  from public.credit_holds
  where id = p_hold_id;

  if not found or p_actual is null then
    return;
  end if;

  v_refund := greatest(ceil(v_reserved)::int - greatest(ceil(p_actual)::int, 0), 0);
  if v_refund = 0 then
    return;
  end if;

  update public.wzrd_api_token_usage
  set credits = greatest(credits - v_refund, 0), updated_at = now()
  where token_id = p_token_id and bucket = 'day' and bucket_start = v_day;
end;
$$;

revoke all on function public.wzrd_token_commit_reconcile(uuid, uuid, numeric) from public;
revoke all on function public.wzrd_token_commit_reconcile(uuid, uuid, numeric) from anon;
revoke all on function public.wzrd_token_commit_reconcile(uuid, uuid, numeric) from authenticated;
grant execute on function public.wzrd_token_commit_reconcile(uuid, uuid, numeric) to service_role;
