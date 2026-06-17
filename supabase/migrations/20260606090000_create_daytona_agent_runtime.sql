CREATE TABLE IF NOT EXISTS public.daytona_agent_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid,
  sandbox_id text,
  daytona_workspace_id text,
  status text NOT NULL DEFAULT 'creating'
    CHECK (status IN ('creating', 'ready', 'active', 'stopped', 'failed')),
  input_dir text NOT NULL DEFAULT '/tmp/wzrd-input',
  output_dir text NOT NULL DEFAULT '/tmp/wzrd-output',
  workspace_dir text NOT NULL DEFAULT '/workspace/wzrd-studio-desktop',
  relay_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours'
);

CREATE TABLE IF NOT EXISTS public.daytona_agent_events (
  id bigserial PRIMARY KEY,
  session_id uuid REFERENCES public.daytona_agent_sessions(id) ON DELETE CASCADE,
  user_id uuid,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS daytona_agent_sessions_user_project_updated_idx
  ON public.daytona_agent_sessions (user_id, project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS daytona_agent_sessions_sandbox_idx
  ON public.daytona_agent_sessions (sandbox_id);

CREATE INDEX IF NOT EXISTS daytona_agent_events_session_created_idx
  ON public.daytona_agent_events (session_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_daytona_agent_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS daytona_agent_sessions_updated_at
  ON public.daytona_agent_sessions;

CREATE TRIGGER daytona_agent_sessions_updated_at
  BEFORE UPDATE ON public.daytona_agent_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_daytona_agent_updated_at();

ALTER TABLE public.daytona_agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daytona_agent_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own daytona agent sessions"
  ON public.daytona_agent_sessions;

CREATE POLICY "Users can view own daytona agent sessions"
  ON public.daytona_agent_sessions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can create own daytona agent sessions"
  ON public.daytona_agent_sessions;

CREATE POLICY "Users can create own daytona agent sessions"
  ON public.daytona_agent_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own daytona agent sessions"
  ON public.daytona_agent_sessions;

CREATE POLICY "Users can update own daytona agent sessions"
  ON public.daytona_agent_sessions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own daytona agent events"
  ON public.daytona_agent_events;

CREATE POLICY "Users can view own daytona agent events"
  ON public.daytona_agent_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
