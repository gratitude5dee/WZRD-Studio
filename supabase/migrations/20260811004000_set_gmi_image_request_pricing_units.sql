update public.ai_model_catalog
set pricing = pricing || jsonb_build_object('unit', 'per_request')
where provider = 'gmi-cloud'
  and id in (
    'gmi/gemini-3-pro-image-preview',
    'gmi/gemini-3.1-flash-image-preview'
  )
  and pricing_text in ('$0.134 per request', '$0.07 per request')
  and pricing->>'raw' = pricing_text
  and (pricing->>'usd')::numeric > 0
  and pricing->>'currency' = 'USD'
  and pricing->>'credits' = '0'
  and not (pricing ? 'unit');
