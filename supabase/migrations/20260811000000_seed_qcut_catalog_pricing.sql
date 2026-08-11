-- Generated from /home/ubuntu/qcut-credit-price-table.json.
-- Prices with unknown, NULL, or zero USD values are intentionally omitted.
-- Existing rows are updated only when their original pricing snapshot still matches; manual edits are preserved.
-- Non-per-request rates live in pricing JSON; credits is a minimum hold, not a flattened rate.
BEGIN;
INSERT INTO public.ai_model_catalog (id, endpoint_id, provider, provider_label, name, description, category, pricing_text, pricing, transport_type, media_type, workflow_type, ui_group, supports, payload_keys, requires_assets, defaults, controls, aliases, enabled, credits, time_label, sort_rank, studio_surfaces, kanvas_modes, raw_api_example, raw_payload, raw_source_block, is_default, default_rank) VALUES
('fal-ai/bytedance/omnihuman/v1.5', 'fal-ai/bytedance/omnihuman/v1.5', 'fal-ai', 'fal.ai', 'V1.5', 'QCut Fal catalog endpoint.', 'json', '$0.2 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.2,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'json', 'json', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/bytedance/omnihuman/v1.5']::text[], TRUE, 20, '~10s', 1000, ARRAY['studio:json']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/bytedance/seedance-2.0/image-to-video', 'fal-ai/bytedance/seedance-2.0/image-to-video', 'fal-ai', 'fal.ai', 'Image To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.5 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.5,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/bytedance/seedance-2.0/image-to-video']::text[], TRUE, 50, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/bytedance/seedance-2.0/reference-to-video', 'fal-ai/bytedance/seedance-2.0/reference-to-video', 'fal-ai', 'fal.ai', 'Reference To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.6 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.6,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/bytedance/seedance-2.0/reference-to-video']::text[], TRUE, 60, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/bytedance/seedance-2.0/text-to-video', 'fal-ai/bytedance/seedance-2.0/text-to-video', 'fal-ai', 'fal.ai', 'Text To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.3 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.3,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/bytedance/seedance-2.0/text-to-video']::text[], TRUE, 30, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/bytedance/seedance/v1/pro/fast/image-to-video', 'fal-ai/bytedance/seedance/v1/pro/fast/image-to-video', 'fal-ai', 'fal.ai', 'Image To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.24 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.24,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/bytedance/seedance/v1/pro/fast/image-to-video']::text[], TRUE, 24, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/bytedance/seedream/v3/text-to-image', 'fal-ai/bytedance/seedream/v3/text-to-image', 'fal-ai', 'fal.ai', 'Text To Image', 'QCut Fal catalog endpoint.', 'text-to-image', '$0.04 / per image USD (qcut catalog pricing)', '{"unit":"per_image","usd":0.04,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'image', 'text-to-image', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/bytedance/seedream/v3/text-to-image']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:image']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/bytedance/seedream/v4.5/edit', 'fal-ai/bytedance/seedream/v4.5/edit', 'fal-ai', 'fal.ai', 'Edit', 'QCut Fal catalog endpoint.', 'text-to-image', '$0.05 / per image USD (qcut catalog pricing)', '{"unit":"per_image","usd":0.05,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'image', 'text-to-image', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/bytedance/seedream/v4.5/edit']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:image']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/bytedance/seedream/v4.5/text-to-image', 'fal-ai/bytedance/seedream/v4.5/text-to-image', 'fal-ai', 'fal.ai', 'Text To Image', 'QCut Fal catalog endpoint.', 'text-to-image', '$0.05 / per image USD (qcut catalog pricing)', '{"unit":"per_image","usd":0.05,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'image', 'text-to-image', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/bytedance/seedream/v4.5/text-to-image']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:image']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/bytedance/seedream/v4/text-to-image', 'fal-ai/bytedance/seedream/v4/text-to-image', 'fal-ai', 'fal.ai', 'Text To Image', 'QCut Fal catalog endpoint.', 'text-to-image', '$0.05 / per image USD (qcut catalog pricing)', '{"unit":"per_image","usd":0.05,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'image', 'text-to-image', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/bytedance/seedream/v4/text-to-image']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:image']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/chatterbox/speech-to-speech', 'fal-ai/chatterbox/speech-to-speech', 'fal-ai', 'fal.ai', 'Speech To Speech', 'QCut Fal catalog endpoint.', 'text-to-speech', '$0.015 / per minute USD (qcut catalog pricing)', '{"unit":"per_minute","usd":0.015,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'audio', 'text-to-speech', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/chatterbox/speech-to-speech']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:audio']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/chatterbox/text-to-speech', 'fal-ai/chatterbox/text-to-speech', 'fal-ai', 'fal.ai', 'Text To Speech', 'QCut Fal catalog endpoint.', 'text-to-speech', '$0.025 / per 1k characters USD (qcut catalog pricing)', '{"unit":"per_1k_characters","usd":0.025,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'audio', 'text-to-speech', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/chatterbox/text-to-speech']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:audio']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/chatterbox/text-to-speech/turbo', 'fal-ai/chatterbox/text-to-speech/turbo', 'fal-ai', 'fal.ai', 'Turbo', 'QCut Fal catalog endpoint.', 'text-to-speech', '$0.02 / per 1k characters USD (qcut catalog pricing)', '{"unit":"per_1k_characters","usd":0.02,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'audio', 'text-to-speech', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/chatterbox/text-to-speech/turbo']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:audio']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/elevenlabs/tts/eleven-v3', 'fal-ai/elevenlabs/tts/eleven-v3', 'fal-ai', 'fal.ai', 'Eleven V3', 'QCut Fal catalog endpoint.', 'text-to-speech', '$0.1 / per 1k characters USD (qcut catalog pricing)', '{"unit":"per_1k_characters","usd":0.1,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'audio', 'text-to-speech', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/elevenlabs/tts/eleven-v3']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:audio']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/flux-2-flex', 'fal-ai/flux-2-flex', 'fal-ai', 'fal.ai', 'Flux 2 Flex', 'QCut Fal catalog endpoint.', 'text-to-image', '$0.06 / per image USD (qcut catalog pricing)', '{"unit":"per_image","usd":0.06,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'image', 'text-to-image', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/flux-2-flex']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:image']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/gemini-3-pro-image-preview', 'fal-ai/gemini-3-pro-image-preview', 'fal-ai', 'fal.ai', 'Gemini 3 Pro Image Preview', 'QCut Fal catalog endpoint.', 'json', '$0.15 / per image USD (qcut catalog pricing)', '{"unit":"per_image","usd":0.15,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'json', 'json', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/gemini-3-pro-image-preview']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:json']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/gpt-image-1.5', 'fal-ai/gpt-image-1.5', 'fal-ai', 'fal.ai', 'Gpt Image 1.5', 'QCut Fal catalog endpoint.', 'text-to-image', '$0.04 / per image USD (qcut catalog pricing)', '{"unit":"per_image","usd":0.04,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'image', 'text-to-image', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/gpt-image-1.5']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:image']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/imagen4/preview/ultra', 'fal-ai/imagen4/preview/ultra', 'fal-ai', 'fal.ai', 'Ultra', 'QCut Fal catalog endpoint.', 'text-to-image', '$0.1 / per image USD (qcut catalog pricing)', '{"unit":"per_image","usd":0.1,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'image', 'text-to-image', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/imagen4/preview/ultra']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:image']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/kling-video/ai-avatar/v2/pro', 'fal-ai/kling-video/ai-avatar/v2/pro', 'fal-ai', 'fal.ai', 'Pro', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.115 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.115,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/kling-video/ai-avatar/v2/pro']::text[], TRUE, 12, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/kling-video/ai-avatar/v2/standard', 'fal-ai/kling-video/ai-avatar/v2/standard', 'fal-ai', 'fal.ai', 'Standard', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.0562 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.0562,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/kling-video/ai-avatar/v2/standard']::text[], TRUE, 6, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/kling-video/o1/video-to-video/reference', 'fal-ai/kling-video/o1/video-to-video/reference', 'fal-ai', 'fal.ai', 'Reference', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.112 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.112,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/kling-video/o1/video-to-video/reference']::text[], TRUE, 11, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/kling-video/v1/pro/ai-avatar', 'fal-ai/kling-video/v1/pro/ai-avatar', 'fal-ai', 'fal.ai', 'Ai Avatar', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.25 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.25,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/kling-video/v1/pro/ai-avatar']::text[], TRUE, 25, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/kling-video/v1/standard/ai-avatar', 'fal-ai/kling-video/v1/standard/ai-avatar', 'fal-ai', 'fal.ai', 'Ai Avatar', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.15 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.15,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/kling-video/v1/standard/ai-avatar']::text[], TRUE, 15, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/kling-video/v2.5-turbo/pro/text-to-video', 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video', 'fal-ai', 'fal.ai', 'Text To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.18 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.18,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/kling-video/v2.5-turbo/pro/text-to-video']::text[], TRUE, 18, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/kling-video/v2.5-turbo/standard/text-to-video', 'fal-ai/kling-video/v2.5-turbo/standard/text-to-video', 'fal-ai', 'fal.ai', 'Text To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.1 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.1,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/kling-video/v2.5-turbo/standard/text-to-video']::text[], TRUE, 10, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/kling-video/v2.6/pro/image-to-video', 'fal-ai/kling-video/v2.6/pro/image-to-video', 'fal-ai', 'fal.ai', 'Image To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.7 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.7,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/kling-video/v2.6/pro/image-to-video']::text[], TRUE, 70, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/kling-video/v2.6/pro/text-to-video', 'fal-ai/kling-video/v2.6/pro/text-to-video', 'fal-ai', 'fal.ai', 'Text To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.7 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.7,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/kling-video/v2.6/pro/text-to-video']::text[], TRUE, 70, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/kling-video/v3/pro/text-to-video', 'fal-ai/kling-video/v3/pro/text-to-video', 'fal-ai', 'fal.ai', 'Text To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.336 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.336,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/kling-video/v3/pro/text-to-video']::text[], TRUE, 34, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/kling-video/v3/standard/image-to-video', 'fal-ai/kling-video/v3/standard/image-to-video', 'fal-ai', 'fal.ai', 'Image To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.252 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.252,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/kling-video/v3/standard/image-to-video']::text[], TRUE, 25, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/kling-video/v3/standard/text-to-video', 'fal-ai/kling-video/v3/standard/text-to-video', 'fal-ai', 'fal.ai', 'Text To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.252 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.252,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/kling-video/v3/standard/text-to-video']::text[], TRUE, 25, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/ltx-2.3/image-to-video/fast', 'fal-ai/ltx-2.3/image-to-video/fast', 'fal-ai', 'fal.ai', 'Fast', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.16 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.16,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/ltx-2.3/image-to-video/fast']::text[], TRUE, 16, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/ltx-2.3/text-to-video', 'fal-ai/ltx-2.3/text-to-video', 'fal-ai', 'fal.ai', 'Text To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.24 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.24,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/ltx-2.3/text-to-video']::text[], TRUE, 24, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/ltx-2.3/text-to-video/fast', 'fal-ai/ltx-2.3/text-to-video/fast', 'fal-ai', 'fal.ai', 'Fast', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.16 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.16,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/ltx-2.3/text-to-video/fast']::text[], TRUE, 16, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/ltxv-2/image-to-video', 'fal-ai/ltxv-2/image-to-video', 'fal-ai', 'fal.ai', 'Image To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.36 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.36,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/ltxv-2/image-to-video']::text[], TRUE, 36, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/ltxv-2/image-to-video/fast', 'fal-ai/ltxv-2/image-to-video/fast', 'fal-ai', 'fal.ai', 'Fast', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.16 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.16,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/ltxv-2/image-to-video/fast']::text[], TRUE, 16, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/ltxv-2/text-to-video', 'fal-ai/ltxv-2/text-to-video', 'fal-ai', 'fal.ai', 'Text To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.06 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.06,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/ltxv-2/text-to-video']::text[], TRUE, 6, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/ltxv-2/text-to-video/fast', 'fal-ai/ltxv-2/text-to-video/fast', 'fal-ai', 'fal.ai', 'Fast', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.16 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.16,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/ltxv-2/text-to-video/fast']::text[], TRUE, 16, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/minimax/hailuo-2.3-fast/pro/image-to-video', 'fal-ai/minimax/hailuo-2.3-fast/pro/image-to-video', 'fal-ai', 'fal.ai', 'Image To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.33 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.33,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/minimax/hailuo-2.3-fast/pro/image-to-video']::text[], TRUE, 33, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/minimax/hailuo-2.3/pro/image-to-video', 'fal-ai/minimax/hailuo-2.3/pro/image-to-video', 'fal-ai', 'fal.ai', 'Image To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.49 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.49,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/minimax/hailuo-2.3/pro/image-to-video']::text[], TRUE, 49, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/minimax/hailuo-2.3/pro/text-to-video', 'fal-ai/minimax/hailuo-2.3/pro/text-to-video', 'fal-ai', 'fal.ai', 'Text To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.49 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.49,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/minimax/hailuo-2.3/pro/text-to-video']::text[], TRUE, 49, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/minimax/hailuo-2.3/standard/image-to-video', 'fal-ai/minimax/hailuo-2.3/standard/image-to-video', 'fal-ai', 'fal.ai', 'Image To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.56 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.56,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/minimax/hailuo-2.3/standard/image-to-video']::text[], TRUE, 56, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/minimax/hailuo-2.3/standard/text-to-video', 'fal-ai/minimax/hailuo-2.3/standard/text-to-video', 'fal-ai', 'fal.ai', 'Text To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.56 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.56,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/minimax/hailuo-2.3/standard/text-to-video']::text[], TRUE, 56, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/nano-banana', 'fal-ai/nano-banana', 'fal-ai', 'fal.ai', 'Nano Banana', 'QCut Fal catalog endpoint.', 'text-to-image', '$0.039 / per image USD (qcut catalog pricing)', '{"unit":"per_image","usd":0.039,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'image', 'text-to-image', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/nano-banana']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:image']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/phota', 'fal-ai/phota', 'fal-ai', 'fal.ai', 'Phota', 'QCut Fal catalog endpoint.', 'text-to-image', '$0.05 / per image USD (qcut catalog pricing)', '{"unit":"per_image","usd":0.05,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'image', 'text-to-image', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/phota']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:image']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/pixverse/v6/image-to-video', 'fal-ai/pixverse/v6/image-to-video', 'fal-ai', 'fal.ai', 'Image To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.09 / per second USD (qcut catalog pricing)', '{"unit":"per_second","usd":0.09,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/pixverse/v6/image-to-video']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/qwen-3-tts/clone-voice/1.7b', 'fal-ai/qwen-3-tts/clone-voice/1.7b', 'fal-ai', 'fal.ai', '1.7B', 'QCut Fal catalog endpoint.', 'text-to-speech', '$0.0008 / per minute USD (qcut catalog pricing)', '{"unit":"per_minute","usd":0.0008,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'audio', 'text-to-speech', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/qwen-3-tts/clone-voice/1.7b']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:audio']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/qwen-3-tts/text-to-speech/1.7b', 'fal-ai/qwen-3-tts/text-to-speech/1.7b', 'fal-ai', 'fal.ai', '1.7B', 'QCut Fal catalog endpoint.', 'text-to-speech', '$0.09 / per 1k characters USD (qcut catalog pricing)', '{"unit":"per_1k_characters","usd":0.09,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'audio', 'text-to-speech', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/qwen-3-tts/text-to-speech/1.7b']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:audio']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/qwen-image', 'fal-ai/qwen-image', 'fal-ai', 'fal.ai', 'Qwen Image', 'QCut Fal catalog endpoint.', 'text-to-image', '$0.06 / per image USD (qcut catalog pricing)', '{"unit":"per_image","usd":0.06,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'image', 'text-to-image', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/qwen-image']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:image']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/reve/text-to-image', 'fal-ai/reve/text-to-image', 'fal-ai', 'fal.ai', 'Text To Image', 'QCut Fal catalog endpoint.', 'text-to-image', '$0.04 / per image USD (qcut catalog pricing)', '{"unit":"per_image","usd":0.04,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'image', 'text-to-image', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/reve/text-to-image']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:image']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/sora-2/image-to-video', 'fal-ai/sora-2/image-to-video', 'fal-ai', 'fal.ai', 'Image To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.1 / per second USD (qcut catalog pricing)', '{"unit":"per_second","usd":0.1,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/sora-2/image-to-video']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/sora-2/image-to-video/pro', 'fal-ai/sora-2/image-to-video/pro', 'fal-ai', 'fal.ai', 'Pro', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.5 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.5,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/sora-2/image-to-video/pro']::text[], TRUE, 50, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/sync-lipsync/react-1', 'fal-ai/sync-lipsync/react-1', 'fal-ai', 'fal.ai', 'React 1', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.1 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.1,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/sync-lipsync/react-1']::text[], TRUE, 10, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/veo3.1', 'fal-ai/veo3.1', 'fal-ai', 'fal.ai', 'Veo3.1', 'QCut Fal catalog endpoint.', 'text-to-video', '$3.2 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":3.2,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/veo3.1']::text[], TRUE, 320, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/veo3.1/extend-video', 'fal-ai/veo3.1/extend-video', 'fal-ai', 'fal.ai', 'Extend Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.4 / per second USD (qcut catalog pricing)', '{"unit":"per_second","usd":0.4,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/veo3.1/extend-video']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/veo3.1/fast', 'fal-ai/veo3.1/fast', 'fal-ai', 'fal.ai', 'Fast', 'QCut Fal catalog endpoint.', 'text-to-video', '$1.2 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":1.2,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/veo3.1/fast']::text[], TRUE, 120, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/veo3.1/fast/extend-video', 'fal-ai/veo3.1/fast/extend-video', 'fal-ai', 'fal.ai', 'Extend Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.15 / per second USD (qcut catalog pricing)', '{"unit":"per_second","usd":0.15,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/veo3.1/fast/extend-video']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/veo3.1/fast/first-last-frame-to-video', 'fal-ai/veo3.1/fast/first-last-frame-to-video', 'fal-ai', 'fal.ai', 'First Last Frame To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$1.2 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":1.2,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/veo3.1/fast/first-last-frame-to-video']::text[], TRUE, 120, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/veo3.1/fast/image-to-video', 'fal-ai/veo3.1/fast/image-to-video', 'fal-ai', 'fal.ai', 'Image To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$1.2 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":1.2,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/veo3.1/fast/image-to-video']::text[], TRUE, 120, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/veo3.1/first-last-frame-to-video', 'fal-ai/veo3.1/first-last-frame-to-video', 'fal-ai', 'fal.ai', 'First Last Frame To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$3.2 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":3.2,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/veo3.1/first-last-frame-to-video']::text[], TRUE, 320, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/veo3.1/image-to-video', 'fal-ai/veo3.1/image-to-video', 'fal-ai', 'fal.ai', 'Image To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$3.2 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":3.2,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/veo3.1/image-to-video']::text[], TRUE, 320, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/veo3.1/lite', 'fal-ai/veo3.1/lite', 'fal-ai', 'fal.ai', 'Lite', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.08 / per second USD (qcut catalog pricing)', '{"unit":"per_second","usd":0.08,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/veo3.1/lite']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/veo3.1/lite/first-last-frame-to-video', 'fal-ai/veo3.1/lite/first-last-frame-to-video', 'fal-ai', 'fal.ai', 'First Last Frame To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.08 / per second USD (qcut catalog pricing)', '{"unit":"per_second","usd":0.08,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/veo3.1/lite/first-last-frame-to-video']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/veo3.1/lite/image-to-video', 'fal-ai/veo3.1/lite/image-to-video', 'fal-ai', 'fal.ai', 'Image To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.08 / per second USD (qcut catalog pricing)', '{"unit":"per_second","usd":0.08,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/veo3.1/lite/image-to-video']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/vidu/q2/image-to-video/turbo', 'fal-ai/vidu/q2/image-to-video/turbo', 'fal-ai', 'fal.ai', 'Turbo', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.05 / per request USD (qcut catalog pricing)', '{"unit":"per_request","usd":0.05,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/vidu/q2/image-to-video/turbo']::text[], TRUE, 5, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/vidu/q3/image-to-video', 'fal-ai/vidu/q3/image-to-video', 'fal-ai', 'fal.ai', 'Image To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.154 / per second USD (qcut catalog pricing)', '{"unit":"per_second","usd":0.154,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/vidu/q3/image-to-video']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/vidu/q3/text-to-video', 'fal-ai/vidu/q3/text-to-video', 'fal-ai', 'fal.ai', 'Text To Video', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.154 / per second USD (qcut catalog pricing)', '{"unit":"per_second","usd":0.154,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/vidu/q3/text-to-video']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/wan/v2.2-a14b/text-to-image', 'fal-ai/wan/v2.2-a14b/text-to-image', 'fal-ai', 'fal.ai', 'Text To Image', 'QCut Fal catalog endpoint.', 'text-to-image', '$0.08 / per image USD (qcut catalog pricing)', '{"unit":"per_image","usd":0.08,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'image', 'text-to-image', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/wan/v2.2-a14b/text-to-image']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:image']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/wan/v2.7/edit', 'fal-ai/wan/v2.7/edit', 'fal-ai', 'fal.ai', 'Edit', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.05 / per image USD (qcut catalog pricing)', '{"unit":"per_image","usd":0.05,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/wan/v2.7/edit']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/wan/v2.7/pro/edit', 'fal-ai/wan/v2.7/pro/edit', 'fal-ai', 'fal.ai', 'Edit', 'QCut Fal catalog endpoint.', 'text-to-video', '$0.08 / per image USD (qcut catalog pricing)', '{"unit":"per_image","usd":0.08,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'video', 'text-to-video', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/wan/v2.7/pro/edit']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:video']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/wan/v2.7/pro/text-to-image', 'fal-ai/wan/v2.7/pro/text-to-image', 'fal-ai', 'fal.ai', 'Text To Image', 'QCut Fal catalog endpoint.', 'text-to-image', '$0.08 / per image USD (qcut catalog pricing)', '{"unit":"per_image","usd":0.08,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'image', 'text-to-image', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/wan/v2.7/pro/text-to-image']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:image']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/wan/v2.7/text-to-image', 'fal-ai/wan/v2.7/text-to-image', 'fal-ai', 'fal.ai', 'Text To Image', 'QCut Fal catalog endpoint.', 'text-to-image', '$0.05 / per image USD (qcut catalog pricing)', '{"unit":"per_image","usd":0.05,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'image', 'text-to-image', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/wan/v2.7/text-to-image']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:image']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('fal-ai/z-image/turbo', 'fal-ai/z-image/turbo', 'fal-ai', 'fal.ai', 'Turbo', 'QCut Fal catalog endpoint.', 'text-to-image', '$0.04 / per image USD (qcut catalog pricing)', '{"unit":"per_image","usd":0.04,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'image', 'text-to-image', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['fal-ai/z-image/turbo']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:image']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000),
('https://api.imarouter.com/v1/images/generations', 'https://api.imarouter.com/v1/images/generations', 'fal-ai', 'fal.ai', 'Generations', 'QCut Fal catalog endpoint.', 'json', '$0.042 / per image USD (qcut catalog pricing)', '{"unit":"per_image","usd":0.042,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb, 'fal_queue', 'json', 'json', 'generation', ARRAY['prompt']::text[], ARRAY['prompt']::text[], ARRAY[]::text[], '{}'::jsonb, '[]'::jsonb, ARRAY['https://api.imarouter.com/v1/images/generations']::text[], TRUE, 1, '~10s', 1000, ARRAY['studio:json']::text[], ARRAY[]::text[], '', '{"source":"qcut-credit-price-table"}'::jsonb, '', FALSE, 1000)
ON CONFLICT (id) DO NOTHING;
UPDATE public.ai_model_catalog
SET credits = 18,
    pricing_text = '$0.18 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.18,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'fal-ai/bytedance/seedance/v1/lite/text-to-video'
  AND credits = 1
  AND pricing_text = '0 credits'
  AND pricing = '{"raw":"0 credits","credits":0}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 1,
    pricing_text = '$0.07 / per image USD (qcut catalog pricing)',
    pricing = '{"unit":"per_image","usd":0.07,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'fal-ai/flux-pro/v1.1-ultra'
  AND credits = 1
  AND pricing_text = '0 credits'
  AND pricing = '{"raw":"0 credits","credits":0}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 11,
    pricing_text = '$0.112 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.112,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'fal-ai/kling-video/o1/image-to-video'
  AND credits = 1
  AND pricing_text = '0 credits'
  AND pricing = '{"raw":"0 credits","credits":0}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 11,
    pricing_text = '$0.112 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.112,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'fal-ai/kling-video/o1/reference-to-video'
  AND credits = 1
  AND pricing_text = '0 credits'
  AND pricing = '{"raw":"0 credits","credits":0}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 17,
    pricing_text = '$0.168 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.168,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'fal-ai/kling-video/o1/video-to-video/edit'
  AND credits = 1
  AND pricing_text = '0 credits'
  AND pricing = '{"raw":"0 credits","credits":0}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 35,
    pricing_text = '$0.35 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.35,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video'
  AND credits = 1
  AND pricing_text = '0 credits'
  AND pricing = '{"raw":"0 credits","credits":0}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 50,
    pricing_text = '$0.5 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.5,"provenance":"qcut","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'fal-ai/sora-2/text-to-video/pro'
  AND credits = 1
  AND pricing_text = '0 credits'
  AND pricing = '{"raw":"0 credits","credits":0}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 1,
    pricing_text = '$1e-06 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":1e-06,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/bria-fibo'
  AND credits = 0
  AND pricing_text = '$0.000001 per request (very low‑cost)'
  AND pricing = '{"raw":"$0.000001 per request (very low\u2011cost)","usd":1e-06,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 7,
    pricing_text = '$0.07 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.07,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/gemini-3.1-flash-image-preview'
  AND credits = 0
  AND pricing_text = '$0.07 per request'
  AND pricing = '{"raw":"$0.07 per request","usd":0.07,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 13,
    pricing_text = '$0.134 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.134,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/gemini-3-pro-image-preview'
  AND credits = 0
  AND pricing_text = '$0.134 per request'
  AND pricing = '{"raw":"$0.134 per request","usd":0.134,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 8,
    pricing_text = '$0.08 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.08,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/hunyuan-image-to-image'
  AND credits = 0
  AND pricing_text = '$0.08 per request'
  AND pricing = '{"raw":"$0.08 per request","usd":0.08,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 1,
    pricing_text = '$0.01 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.01,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/inworld-tts-1-5-max'
  AND credits = 0
  AND pricing_text = '$0.01 per request'
  AND pricing = '{"raw":"$0.01 per request","usd":0.01,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 1,
    pricing_text = '$0.005 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.005,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/inworld-tts-1-5-mini'
  AND credits = 0
  AND pricing_text = '$0.005 per request'
  AND pricing = '{"raw":"$0.005 per request","usd":0.005,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 28,
    pricing_text = '$0.28 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.28,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/kling-i2v-v2.1-master'
  AND credits = 0
  AND pricing_text = '$0.28 per request'
  AND pricing = '{"raw":"$0.28 per request","usd":0.28,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 28,
    pricing_text = '$0.28 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.28,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/kling-image2video-v2-1-pro'
  AND credits = 0
  AND pricing_text = '$0.28 per request (approx, similar to Master tier)'
  AND pricing = '{"raw":"$0.28 per request (approx, similar to Master tier)","usd":0.28,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 28,
    pricing_text = '$0.28 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.28,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/kling-text2video-v2-master'
  AND credits = 0
  AND pricing_text = '$0.28 per request'
  AND pricing = '{"raw":"$0.28 per request","usd":0.28,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 1,
    pricing_text = '$0.04 / per second USD (qcut catalog pricing)',
    pricing = '{"unit":"per_second","usd":0.04,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/ltx-fast-i2v'
  AND credits = 0
  AND pricing_text = '$0.04/sec (1080p)'
  AND pricing = '{"raw":"$0.04/sec","usd":0.04,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 3,
    pricing_text = '$0.032 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.032,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/minimax-hailuo-2.3'
  AND credits = 0
  AND pricing_text = '≈$0.032 per request'
  AND pricing = '{"raw":"\u2248$0.032 per request","usd":0.032,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 3,
    pricing_text = '$0.03 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.03,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/minimax-hailuo-2-6-fast'
  AND credits = 0
  AND pricing_text = '≈$0.03 per request (reported as $0.032 in blog posts)'
  AND pricing = '{"raw":"\u2248$0.03 per request (reported as $0.032 in blog posts)","usd":0.03,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 6,
    pricing_text = '$0.06 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.06,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/minimax-tts-speech-02-turbo'
  AND credits = 0
  AND pricing_text = '$0.06 per request'
  AND pricing = '{"raw":"$0.06 per request","usd":0.06,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 6,
    pricing_text = '$0.06 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.06,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/minimax-tts-speech-2-6-turbo'
  AND credits = 0
  AND pricing_text = '$0.06 per request'
  AND pricing = '{"raw":"$0.06 per request","usd":0.06,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 2,
    pricing_text = '$0.02 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.02,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/minime-talks-workflow'
  AND credits = 0
  AND pricing_text = '$0.02 per request'
  AND pricing = '{"raw":"$0.02 per request","usd":0.02,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 3,
    pricing_text = '$0.03 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.03,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/pixverse-v5-5-i2v'
  AND credits = 0
  AND pricing_text = '$0.03 per request'
  AND pricing = '{"raw":"$0.03 per request","usd":0.03,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 3,
    pricing_text = '$0.03 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.03,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/pixverse-v5-5-t2v'
  AND credits = 0
  AND pricing_text = '$0.03 per request'
  AND pricing = '{"raw":"$0.03 per request","usd":0.03,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 5,
    pricing_text = '$0.051 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.051,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/seedance-1-5-pro-251215'
  AND credits = 0
  AND pricing_text = '$0.051 per request'
  AND pricing = '{"raw":"$0.051 per request","usd":0.051,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 1,
    pricing_text = '$0.052 / per second USD (qcut catalog pricing)',
    pricing = '{"unit":"per_second","usd":0.052,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/seedance-2.0-fast-i2v'
  AND credits = 0
  AND pricing_text = '$0.052/sec (video length based pricing)'
  AND pricing = '{"raw":"$0.052/sec","usd":0.052,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 1,
    pricing_text = '$0.052 / per second USD (qcut catalog pricing)',
    pricing = '{"unit":"per_second","usd":0.052,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/seedance-2.0-fast-t2v'
  AND credits = 0
  AND pricing_text = '$0.052/sec (video length based pricing)'
  AND pricing = '{"raw":"$0.052/sec","usd":0.052,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 1,
    pricing_text = '$0.052 / per second USD (qcut catalog pricing)',
    pricing = '{"unit":"per_second","usd":0.052,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/seedance-2.0-i2v'
  AND credits = 0
  AND pricing_text = '$0.052/sec (video length based pricing)'
  AND pricing = '{"raw":"$0.052/sec","usd":0.052,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 1,
    pricing_text = '$0.052 / per second USD (qcut catalog pricing)',
    pricing = '{"unit":"per_second","usd":0.052,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/seedance-2.0-t2v'
  AND credits = 0
  AND pricing_text = '$0.052/sec (video length based pricing)'
  AND pricing = '{"raw":"$0.052/sec","usd":0.052,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 5,
    pricing_text = '$0.05 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.05,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/seedream-4-0-250828'
  AND credits = 0
  AND pricing_text = '$0.05 per request'
  AND pricing = '{"raw":"$0.05 per request","usd":0.05,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 4,
    pricing_text = '$0.035 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.035,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/seedream-5.0-lite'
  AND credits = 0
  AND pricing_text = '$0.035 per request'
  AND pricing = '{"raw":"$0.035 per request","usd":0.035,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 14,
    pricing_text = '$0.14 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.14,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/skyreels-v4-image-to-video'
  AND credits = 0
  AND pricing_text = '$0.14 per request'
  AND pricing = '{"raw":"$0.14 per request","usd":0.14,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 14,
    pricing_text = '$0.14 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.14,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/skyreels-v4-text-to-video'
  AND credits = 0
  AND pricing_text = '$0.14 per request'
  AND pricing = '{"raw":"$0.14 per request","usd":0.14,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 50,
    pricing_text = '$0.5 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.5,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/sora-2'
  AND credits = 0
  AND pricing_text = '$0.50 per request'
  AND pricing = '{"raw":"$0.50 per request","usd":0.5,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 50,
    pricing_text = '$0.5 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.5,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/sora-2-pro'
  AND credits = 0
  AND pricing_text = '$0.50 per request (premium tier)'
  AND pricing = '{"raw":"$0.50 per request (premium tier)","usd":0.5,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 40,
    pricing_text = '$0.4 / per request USD (qcut catalog pricing)',
    pricing = '{"unit":"per_request","usd":0.4,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/veo3'
  AND credits = 0
  AND pricing_text = '$0.40 per request'
  AND pricing = '{"raw":"$0.40 per request","usd":0.4,"credits":0,"currency":"USD"}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 1,
    pricing_text = '$0.05 / per second USD (qcut catalog pricing)',
    pricing = '{"unit":"per_second","usd":0.05,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/veo-3-1-lite-generate-001'
  AND credits = 0
  AND pricing_text = 'Input: 0.05 per second (720p video + audio) per 1M tokens; Output: 0.05 per second (720p) or 0.08 per second (1080p) per 1M tokens'
  AND pricing = '{"raw":"Input: 0.05 per second (720p video + audio) per 1M tokens; Output: 0.05 per second (720p) or 0.08 per second (1080p) per 1M tokens","credits":0}'::jsonb;
UPDATE public.ai_model_catalog
SET credits = 1,
    pricing_text = '$0.05 / per second USD (qcut catalog pricing)',
    pricing = '{"unit":"per_second","usd":0.05,"provenance":"db","source":"qcut-credit-price-table","minimum_credits":1}'::jsonb,
    updated_at = now()
WHERE id = 'gmi/veo-3-1-lite-generate-001-text-to-text'
  AND credits = 0
  AND pricing_text = '$0.05 per second for 720p video + audio; $0.03 per second for 720p video only; 1080p costs a bit more'
  AND pricing = '{"raw":"$0.05 per second for 720p video + audio; $0.03 per second for 720p video only; 1080p costs a bit more","usd":0.05,"credits":0,"currency":"USD"}'::jsonb;
COMMIT;
