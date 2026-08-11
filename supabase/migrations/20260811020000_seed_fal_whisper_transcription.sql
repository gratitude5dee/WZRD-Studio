-- Seed the Fal Whisper speech-to-text row used by browser caption transcription.
-- Price comes from the app's own studio-model-constants config (credits: 2 → $0.02
-- per request at 1 credit = 1 cent); nothing is invented. The row is editor-only:
-- enabled for strict billing but kept out of Studio/Kanvas pickers via empty
-- surfaces plus the editor_only pricing marker.
BEGIN;

INSERT INTO public.ai_model_catalog (
  id, endpoint_id, provider, provider_label, name, description, category,
  pricing_text, pricing, transport_type, media_type, workflow_type, ui_group,
  supports, payload_keys, requires_assets, defaults, controls, aliases,
  enabled, credits, time_label, sort_rank, studio_surfaces, kanvas_modes,
  raw_api_example, raw_payload, raw_source_block, is_default, default_rank
) VALUES (
  'fal-ai/whisper', 'fal-ai/whisper', 'fal-ai', 'fal.ai',
  'Whisper Speech-to-Text',
  'OpenAI Whisper transcription with segment timestamps.',
  'speech-to-text',
  '$0.02 / per request USD (studio model constants)',
  '{"unit":"per_request","usd":0.02,"provenance":"studio-model-constants","source":"studio-model-constants","minimum_credits":1,"editor_only":true}'::jsonb,
  'fal_queue', 'audio', 'speech-to-text', 'advanced',
  ARRAY['audio_url']::text[], ARRAY['audio_url']::text[], ARRAY[]::text[],
  '{"task":"transcribe","chunk_level":"segment"}'::jsonb, '[]'::jsonb,
  ARRAY['fal-ai/whisper']::text[],
  TRUE, 2, '~5s', 1000, ARRAY[]::text[], ARRAY[]::text[],
  '', '{"source":"studio-model-constants"}'::jsonb, '', FALSE, 1000
)
ON CONFLICT (id) DO UPDATE
SET enabled = TRUE,
    pricing = ai_model_catalog.pricing || '{"editor_only":true}'::jsonb,
    credits = GREATEST(ai_model_catalog.credits, 1),
    updated_at = now()
WHERE ai_model_catalog.credits = 0
   OR ai_model_catalog.enabled = FALSE;

COMMIT;
