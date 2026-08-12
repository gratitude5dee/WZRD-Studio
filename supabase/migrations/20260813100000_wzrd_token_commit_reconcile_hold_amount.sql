-- The reconcile function read `credit_holds.reserved_amount`, a column from the
-- unapplied 20260306110000 ledger schema; the live table (20260505054219) calls
-- it `amount`. A plpgsql body is not column-resolved until it runs, so the
-- function created cleanly and only failed at call time — where commitCredits
-- logs the error and moves on, silently leaking the token's daily headroom.
--
-- Claiming the hold with the update below also makes the refund idempotent: a
-- retried commit finds the marker already set and refunds nothing.
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
  v_reserved int;
  v_refund int;
begin
  if p_actual is null then
    return;
  end if;

  update public.credit_holds h
  set metadata = coalesce(h.metadata, '{}'::jsonb) || jsonb_build_object('wzrd_token_reconciled', true)
  from public.wzrd_api_tokens t
  where h.id = p_hold_id
    and t.id = p_token_id
    and h.user_id = t.user_id
    and coalesce((h.metadata->>'wzrd_token_reconciled')::boolean, false) = false
  returning h.amount into v_reserved;

  if not found then
    return;
  end if;

  v_refund := greatest(v_reserved - greatest(ceil(p_actual)::int, 0), 0);
  if v_refund = 0 then
    return;
  end if;

  update public.wzrd_api_token_usage
  set credits = greatest(credits - v_refund, 0), updated_at = now()
  where token_id = p_token_id and bucket = 'day' and bucket_start = v_day;
end;
$$;
