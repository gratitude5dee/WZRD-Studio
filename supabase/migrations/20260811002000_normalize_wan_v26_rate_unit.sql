-- Normalize the verified Wan v2.6 per-second catalog rate.
-- The guarded snapshot preserves rows that have been edited since the source
-- catalog was imported.
BEGIN;

UPDATE public.ai_model_catalog
SET pricing_text = '$0.1 / per second USD (partner)',
    pricing = '{"raw":"$0.1 / per second USD (partner)","note":"Your request will cost $0.10 per second for 720p, $0.15 per second for 1080p.","usd":0.1,"currency":"USD","unit":"per_second","source":"partner"}'::jsonb,
    updated_at = now()
WHERE id = 'wan/v2.6/text-to-video'
  AND credits = 10
  AND pricing_text = '$0.1 / seconds USD (partner)'
  AND pricing = '{"raw":"$0.1 / seconds USD (partner)","note":"Your request will cost $0.10 per second for 720p, $0.15 per second for 1080p.","usd":0.1,"currency":"USD","unit":"seconds","source":"partner"}'::jsonb;

COMMIT;
