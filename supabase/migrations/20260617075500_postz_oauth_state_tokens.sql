-- Phase 3: extend postz_oauth_state to hold temporary encrypted tokens for in-between steps

alter table public.postz_oauth_state
  add column if not exists access_token_ref text null,
  add column if not exists refresh_token_ref text null,
  add column if not exists token_expires_at timestamptz null,
  add column if not exists auth_details jsonb null;
