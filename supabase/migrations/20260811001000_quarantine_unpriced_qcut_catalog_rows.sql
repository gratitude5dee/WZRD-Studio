-- Additive safety follow-up for 20260811000000_seed_qcut_catalog_pricing.sql.
-- The seed necessarily changed 38 pre-existing billing snapshots; this migration
-- intentionally undoes those changes so existing rows retain their prior credits
-- and pricing text, while preserving only an additive editor_billing marker.
-- New rows are quarantined from shared surfaces; existing availability is untouched.
-- Rate-priced rows cannot use the flat credits hold until rate-aware reserve exists.
BEGIN;
UPDATE public.ai_model_catalog
SET credits = 1,
    pricing_text = '0 credits',
    pricing = '{"raw":"0 credits","credits":0}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.18,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'fal-ai/bytedance/seedance/v1/lite/text-to-video'
  AND credits = 18
  AND pricing_text = '$0.18 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.18,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 1,
    pricing_text = '0 credits',
    pricing = '{"raw":"0 credits","credits":0}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_image","usd":0.07,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'fal-ai/flux-pro/v1.1-ultra'
  AND credits = 1
  AND pricing_text = '$0.07 / per image USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_image","usd":0.07,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 1,
    pricing_text = '0 credits',
    pricing = '{"raw":"0 credits","credits":0}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.112,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'fal-ai/kling-video/o1/image-to-video'
  AND credits = 11
  AND pricing_text = '$0.112 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.112,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 1,
    pricing_text = '0 credits',
    pricing = '{"raw":"0 credits","credits":0}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.112,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'fal-ai/kling-video/o1/reference-to-video'
  AND credits = 11
  AND pricing_text = '$0.112 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.112,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 1,
    pricing_text = '0 credits',
    pricing = '{"raw":"0 credits","credits":0}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.168,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'fal-ai/kling-video/o1/video-to-video/edit'
  AND credits = 17
  AND pricing_text = '$0.168 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.168,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 1,
    pricing_text = '0 credits',
    pricing = '{"raw":"0 credits","credits":0}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.35,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video'
  AND credits = 35
  AND pricing_text = '$0.35 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.35,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 1,
    pricing_text = '0 credits',
    pricing = '{"raw":"0 credits","credits":0}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.5,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'fal-ai/sora-2/text-to-video/pro'
  AND credits = 50
  AND pricing_text = '$0.5 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.5,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.000001 per request (very low‑cost)',
    pricing = '{"raw":"$0.000001 per request (very low\u2011cost)","usd":1e-06,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":1e-06,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/bria-fibo'
  AND credits = 1
  AND pricing_text = '$1e-06 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":1e-06,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.07 per request',
    pricing = '{"raw":"$0.07 per request","usd":0.07,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.07,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/gemini-3.1-flash-image-preview'
  AND credits = 7
  AND pricing_text = '$0.07 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.07,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.134 per request',
    pricing = '{"raw":"$0.134 per request","usd":0.134,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.134,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/gemini-3-pro-image-preview'
  AND credits = 13
  AND pricing_text = '$0.134 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.134,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.08 per request',
    pricing = '{"raw":"$0.08 per request","usd":0.08,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.08,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/hunyuan-image-to-image'
  AND credits = 8
  AND pricing_text = '$0.08 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.08,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.01 per request',
    pricing = '{"raw":"$0.01 per request","usd":0.01,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.01,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/inworld-tts-1-5-max'
  AND credits = 1
  AND pricing_text = '$0.01 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.01,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.005 per request',
    pricing = '{"raw":"$0.005 per request","usd":0.005,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.005,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/inworld-tts-1-5-mini'
  AND credits = 1
  AND pricing_text = '$0.005 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.005,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.28 per request',
    pricing = '{"raw":"$0.28 per request","usd":0.28,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.28,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/kling-i2v-v2.1-master'
  AND credits = 28
  AND pricing_text = '$0.28 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.28,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.28 per request (approx, similar to Master tier)',
    pricing = '{"raw":"$0.28 per request (approx, similar to Master tier)","usd":0.28,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.28,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/kling-image2video-v2-1-pro'
  AND credits = 28
  AND pricing_text = '$0.28 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.28,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.28 per request',
    pricing = '{"raw":"$0.28 per request","usd":0.28,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.28,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/kling-text2video-v2-master'
  AND credits = 28
  AND pricing_text = '$0.28 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.28,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.04/sec (1080p)',
    pricing = '{"raw":"$0.04/sec","usd":0.04,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_second","usd":0.04,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/ltx-fast-i2v'
  AND credits = 1
  AND pricing_text = '$0.04 / per second USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_second","usd":0.04,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '≈$0.032 per request',
    pricing = '{"raw":"\u2248$0.032 per request","usd":0.032,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.032,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/minimax-hailuo-2.3'
  AND credits = 3
  AND pricing_text = '$0.032 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.032,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '≈$0.03 per request (reported as $0.032 in blog posts)',
    pricing = '{"raw":"\u2248$0.03 per request (reported as $0.032 in blog posts)","usd":0.03,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.03,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/minimax-hailuo-2-6-fast'
  AND credits = 3
  AND pricing_text = '$0.03 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.03,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.06 per request',
    pricing = '{"raw":"$0.06 per request","usd":0.06,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.06,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/minimax-tts-speech-02-turbo'
  AND credits = 6
  AND pricing_text = '$0.06 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.06,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.06 per request',
    pricing = '{"raw":"$0.06 per request","usd":0.06,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.06,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/minimax-tts-speech-2-6-turbo'
  AND credits = 6
  AND pricing_text = '$0.06 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.06,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.02 per request',
    pricing = '{"raw":"$0.02 per request","usd":0.02,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.02,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/minime-talks-workflow'
  AND credits = 2
  AND pricing_text = '$0.02 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.02,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.03 per request',
    pricing = '{"raw":"$0.03 per request","usd":0.03,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.03,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/pixverse-v5-5-i2v'
  AND credits = 3
  AND pricing_text = '$0.03 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.03,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.03 per request',
    pricing = '{"raw":"$0.03 per request","usd":0.03,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.03,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/pixverse-v5-5-t2v'
  AND credits = 3
  AND pricing_text = '$0.03 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.03,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.051 per request',
    pricing = '{"raw":"$0.051 per request","usd":0.051,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.051,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/seedance-1-5-pro-251215'
  AND credits = 5
  AND pricing_text = '$0.051 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.051,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.052/sec (video length based pricing)',
    pricing = '{"raw":"$0.052/sec","usd":0.052,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_second","usd":0.052,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/seedance-2.0-fast-i2v'
  AND credits = 1
  AND pricing_text = '$0.052 / per second USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_second","usd":0.052,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.052/sec (video length based pricing)',
    pricing = '{"raw":"$0.052/sec","usd":0.052,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_second","usd":0.052,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/seedance-2.0-fast-t2v'
  AND credits = 1
  AND pricing_text = '$0.052 / per second USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_second","usd":0.052,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.052/sec (video length based pricing)',
    pricing = '{"raw":"$0.052/sec","usd":0.052,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_second","usd":0.052,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/seedance-2.0-i2v'
  AND credits = 1
  AND pricing_text = '$0.052 / per second USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_second","usd":0.052,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.052/sec (video length based pricing)',
    pricing = '{"raw":"$0.052/sec","usd":0.052,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_second","usd":0.052,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/seedance-2.0-t2v'
  AND credits = 1
  AND pricing_text = '$0.052 / per second USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_second","usd":0.052,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.05 per request',
    pricing = '{"raw":"$0.05 per request","usd":0.05,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.05,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/seedream-4-0-250828'
  AND credits = 5
  AND pricing_text = '$0.05 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.05,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.035 per request',
    pricing = '{"raw":"$0.035 per request","usd":0.035,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.035,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/seedream-5.0-lite'
  AND credits = 4
  AND pricing_text = '$0.035 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.035,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.14 per request',
    pricing = '{"raw":"$0.14 per request","usd":0.14,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.14,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/skyreels-v4-image-to-video'
  AND credits = 14
  AND pricing_text = '$0.14 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.14,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.14 per request',
    pricing = '{"raw":"$0.14 per request","usd":0.14,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.14,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/skyreels-v4-text-to-video'
  AND credits = 14
  AND pricing_text = '$0.14 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.14,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.50 per request',
    pricing = '{"raw":"$0.50 per request","usd":0.5,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.5,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/sora-2'
  AND credits = 50
  AND pricing_text = '$0.5 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.5,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.50 per request (premium tier)',
    pricing = '{"raw":"$0.50 per request (premium tier)","usd":0.5,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.5,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/sora-2-pro'
  AND credits = 50
  AND pricing_text = '$0.5 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.5,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.40 per request',
    pricing = '{"raw":"$0.40 per request","usd":0.4,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_request","usd":0.4,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/veo3'
  AND credits = 40
  AND pricing_text = '$0.4 / per request USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_request","usd":0.4,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = 'Input: 0.05 per second (720p video + audio) per 1M tokens; Output: 0.05 per second (720p) or 0.08 per second (1080p) per 1M tokens',
    pricing = '{"raw":"Input: 0.05 per second (720p video + audio) per 1M tokens; Output: 0.05 per second (720p) or 0.08 per second (1080p) per 1M tokens","credits":0}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_second","usd":0.05,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/veo-3-1-lite-generate-001'
  AND credits = 1
  AND pricing_text = '$0.05 / per second USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_second","usd":0.05,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    pricing_text = '$0.05 per second for 720p video + audio; $0.03 per second for 720p video only; 1080p costs a bit more',
    pricing = '{"raw":"$0.05 per second for 720p video + audio; $0.03 per second for 720p video only; 1080p costs a bit more","usd":0.05,"credits":0,"currency":"USD"}'::jsonb || jsonb_build_object('editor_billing', '{"unit":"per_second","usd":0.05,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb),
    updated_at = now()
WHERE id = 'gmi/veo-3-1-lite-generate-001-text-to-text'
  AND credits = 1
  AND pricing_text = '$0.05 / per second USD (qcut catalog pricing)'
  AND pricing = '{"unit":"per_second","usd":0.05,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 0,
    enabled = FALSE,
    studio_surfaces = ARRAY[]::text[],
    kanvas_modes = ARRAY[]::text[],
    supports = ARRAY[]::text[],
    payload_keys = ARRAY[]::text[],
    requires_assets = ARRAY[]::text[],
    time_label = '',
    pricing = pricing || '{"billable":false,"billing_status":"rate_pending"}'::jsonb,
    updated_at = now()
WHERE provider = 'fal-ai'
  AND description = 'QCut Fal catalog endpoint.'
  AND pricing->>'source' = 'qcut-credit-price-table'
  AND pricing->>'unit' <> 'per_request'
  AND pricing->>'minimum_credits' = '1'
  AND credits = 1;
UPDATE public.ai_model_catalog
SET enabled = FALSE,
    name = id,
    description = '',
    category = '',
    workflow_type = '',
    supports = ARRAY[]::text[],
    payload_keys = ARRAY[]::text[],
    requires_assets = ARRAY[]::text[],
    time_label = '',
    studio_surfaces = ARRAY[]::text[],
    kanvas_modes = ARRAY[]::text[],
    aliases = ARRAY[]::text[],
    updated_at = now()
WHERE provider = 'fal-ai'
  AND description = 'QCut Fal catalog endpoint.'
  AND pricing->>'source' = 'qcut-credit-price-table'
  AND enabled = TRUE;
COMMIT;
