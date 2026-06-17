-- Phase 3: QCut snapshot persistence (additive)

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS qcut_project_json jsonb;
