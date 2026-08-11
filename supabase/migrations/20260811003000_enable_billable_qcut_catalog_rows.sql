-- Re-enable QCut Fal catalog rows now that strict rate billing is available.
-- Keep these rows out of Studio/Kanvas pickers by requiring empty surfaces and
-- preserve hand-edited rows by matching the imported pricing source exactly.
BEGIN;

UPDATE public.ai_model_catalog
SET enabled = TRUE,
    pricing = pricing || '{"editor_only":true}'::jsonb,
    updated_at = now()
WHERE provider = 'fal-ai'
  AND enabled = FALSE
  AND studio_surfaces = ARRAY[]::text[]
  AND kanvas_modes = ARRAY[]::text[]
  AND NOT (pricing ? 'editor_only')
  AND (
    (
      pricing->>'source' = 'qcut-credit-price-table'
      AND pricing->>'unit' IN (
        'per_request',
        'per_image',
        'per_second',
        'per_minute',
        'per_1k_characters'
      )
    )
    OR (
      pricing->'editor_billing'->>'source' = 'qcut-credit-price-table'
      AND pricing->'editor_billing'->>'unit' IN (
        'per_request',
        'per_image',
        'per_second',
        'per_minute',
        'per_1k_characters'
      )
    )
  );

COMMIT;
