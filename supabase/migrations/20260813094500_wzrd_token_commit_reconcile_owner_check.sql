-- Bind the refund to the hold's owner. Callers run as the service role, so a
-- mismatched (token, hold) pair would otherwise let one token's oversized
-- reservation zero out another token's daily counter and bypass its cap.
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
  if p_actual is null then
    return;
  end if;

  select h.reserved_amount into v_reserved
  from public.credit_holds h
  join public.wzrd_api_tokens t on t.id = p_token_id
  where h.id = p_hold_id and h.user_id = t.user_id;

  if not found then
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
