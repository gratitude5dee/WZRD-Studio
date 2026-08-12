#!/usr/bin/env bash
# Boot a local Supabase stack with the schema the plugin suites (§11.1) need.
#
# The repo's migration history is not replayable from zero: production's core
# tables (projects, scenes, shots, characters, user_credits) predate it, and
# several early migrations collide when re-run. Rather than replaying that
# history, this script builds a schema from:
#
#   1. scripts/plugin/fixtures/local-baseline.sql — the production-mirrored
#      prerequisites;
#   2. every migration from the credit ledger (20260306110000) onward — the
#      billing, catalog, PAT and storyboard layers the suites exercise.
#
# The swap is confined to a temporary directory; the committed
# supabase/migrations/ files are never touched.
#
#   bash scripts/plugin/local-stack.sh
#   WZRD_MOCK_GENERATION=1 bunx supabase functions serve --no-verify-jwt &
#   bun run plugin:conformance && bun run plugin:integration && bun run plugin:adversarial
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS="$ROOT/supabase/migrations"
BACKUP="$ROOT/supabase/.migrations-full"
FIRST_MIGRATION="20260305112701"

cleanup() {
  if [ -d "$BACKUP" ]; then
    rm -rf "$MIGRATIONS"
    mv "$BACKUP" "$MIGRATIONS"
  fi
}
trap cleanup EXIT

# Migrations that only touch legacy production tables the suites never use
# (RLS hardening over pre-migration-history tables); skipped locally.
SKIP="
20260305112701_688d837d-4342-42b7-a1e7-cf36e8402626.sql
20260305143000_add_moltbook_identity_metadata.sql
20260331093534_e8f334cd-b8dd-44b1-ba71-6086a2bbc8ae.sql
20260331094013_0c50ba98-18df-4410-833c-59a866b7145e.sql
20260331094614_d4f6272a-6832-4d0d-8ecc-4625f4a264f1.sql
20260331095222_8c76509b-45ae-43b2-8dd2-d38582457f0a.sql
20260331100443_cb2dcaab-b76a-42f8-b7b2-23ba03318c5c.sql
20260331101135_7726cb26-1a96-4563-8e73-a49cb4ec8784.sql
20260331101156_6dbf9a2f-11fe-47bc-9b9c-46e2fbed949c.sql
20260331103510_e5047e13-710a-4884-b471-c29b697778f1.sql
20260401042850_799df1ed-517d-4b0e-967f-aa4919000314.sql
20260401043304_e6748bb0-3cd0-4eab-adb7-5eb472613a92.sql
20260402005019_77f35c81-5f29-423d-81c8-bdf888a2101b.sql
20260404223150_ae4c3211-ce2a-478a-b765-5f130eb0383b.sql
20260406184549_aba35ce0-41d4-4893-937d-f72ff15516d7.sql
20260407145710_8f9dce8a-1f2f-4abc-ae6c-d668de8b22e6.sql
20260506145033_bb030725-c81b-4c6b-9eb6-fd9ebc91aa0b.sql
"

mv "$MIGRATIONS" "$BACKUP"
mkdir -p "$MIGRATIONS"
cp "$ROOT/scripts/plugin/fixtures/local-baseline.sql" "$MIGRATIONS/20260101000000_local_baseline.sql"
for file in "$BACKUP"/*.sql; do
  name="$(basename "$file")"
  stamp="${name%%_*}"
  case "$stamp" in
    *-*) continue ;; # legacy name the CLI skips anyway
  esac
  case "$SKIP" in
    *"$name"*) continue ;;
  esac
  if [ "$stamp" -ge "$FIRST_MIGRATION" ] 2>/dev/null; then
    cp "$file" "$MIGRATIONS/$name"
  fi
done

# _credits_restore_consumed declares `p_wallet inout` and then `return p_wallet;`,
# which Postgres 17 rejects (with an INOUT parameter the body must use a bare
# `return;`). Production got the corrected definition out of band; patch the
# temporary copy the same way.
sed -i 's/^\([[:space:]]*\)return p_wallet;$/\1return;/' \
  "$MIGRATIONS/20260306110000_credit_ledger_billing.sql"

# 20260503120000 changes save_compute_graph's return type, which
# `create or replace` cannot do; production dropped the old signature out of
# band. Do the same in the temporary copy.
sed -i '1i drop function if exists public.save_compute_graph(uuid, integer, text, jsonb, jsonb, jsonb, jsonb);' \
  "$MIGRATIONS/20260503120000_registry_actions_handles_fal_defaults.sql"

# 20260503191248 indexes timeline_assets(position_order) before the
# 20260504064546 drift repair adds the column locally; production already had
# it. Add it up front in the temporary copy (the repair's own
# `add column if not exists` then no-ops).
sed -i '1i alter table public.timeline_assets add column if not exists position_order integer not null default 0, add column if not exists asset_type text, add column if not exists source_url text, add column if not exists duration_ms integer, add column if not exists metadata jsonb default '"'"'{}'"'"'::jsonb, add column if not exists user_id uuid;' \
  "$MIGRATIONS/20260503191248_add_wzrd_agent_sessions_and_export_indexes.sql"

# 20260504163124 re-creates the ip_vault_items policies that 20260504143000
# already created (production only had one of the two applied). Drop them
# first in the temporary copy so the re-create succeeds.
sed -i '1i drop function if exists public.ensure_credit_account(uuid, text);\ndrop function if exists public.ensure_credit_account(uuid);\ndrop policy if exists "Users can read their own IP vault items" on public.ip_vault_items;\ndrop policy if exists "Users can create their own IP vault items" on public.ip_vault_items;\ndrop policy if exists "Users can update their own IP vault items" on public.ip_vault_items;\ndrop policy if exists "Users can delete their own IP vault items" on public.ip_vault_items;' \
  "$MIGRATIONS/20260504163124_43c54fb3-316e-4c43-b65a-125087dd1fa6.sql"

# The 2026-03-06 ledger migration creates credit_holds with a reserved_amount
# column, so the 2026-05-05 "create table if not exists" (whose shape — an
# `amount` column — is what production and credits_reserve use) never runs.
# Recreate it locally with the production shape.
sed -i '1i drop table if exists public.credit_holds cascade;' \
  "$MIGRATIONS/20260505054219_3fe50eb0-808f-4d5b-aefb-18ac57e3c184.sql"

# The local image's default privileges for postgres-owned objects in public
# don't include DML for the API roles, so PostgREST gets "permission denied"
# on every table the replay creates. Grant them at the end (local only; RLS
# still applies to anon/authenticated).
cat > "$MIGRATIONS/20991231235959_local_grants.sql" << 'SQL'
-- The replay leaves both the numeric (2026-03/05) and integer (2026-08-05)
-- overloads of credits_reserve in place, which makes PostgREST rpc calls
-- ambiguous. Production only carries the integer one; keep that.
drop function if exists public.credits_reserve(text, numeric, text, text, text, jsonb);
drop function if exists public.credits_commit(uuid, numeric, jsonb);

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to service_role;
SQL

if bunx supabase status >/dev/null 2>&1; then
  bunx supabase db reset --no-seed
else
  bunx supabase start
fi
