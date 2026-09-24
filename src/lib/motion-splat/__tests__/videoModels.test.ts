import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { MOTION_SPLAT_VIDEO_MODELS, DEFAULT_VIDEO_MODEL_ID, videoModelCost } from '@/lib/motion-splat/constants';
import { imageToVideoModels } from '@/components/motion-splat/panels/videoModels';
import { getModelById } from '@/lib/studio-model-constants';

const repoRoot = path.resolve(__dirname, '../../../..');
const sharedSource = readFileSync(path.join(repoRoot, 'supabase/functions/_shared/motion-splat.ts'), 'utf8');
const falCatalog = readFileSync(path.join(repoRoot, 'supabase/functions/_shared/falai-client.ts'), 'utf8');

/** The literal table the edge function prices and validates against. */
function serverTable(): Record<string, number> {
  const block = sharedSource.match(/MOTION_SPLAT_VIDEO_MODELS: Record<string, number> = \{([\s\S]*?)\};/);
  if (!block) throw new Error('MOTION_SPLAT_VIDEO_MODELS not found in the shared edge module');
  const table: Record<string, number> = {};
  for (const [, id, cost] of block[1].matchAll(/'([^']+)':\s*(\d+)/g)) table[id] = Number(cost);
  return table;
}

describe('motion splat video models', () => {
  it('prices every model identically on the client and the edge function', () => {
    expect(serverTable()).toEqual(MOTION_SPLAT_VIDEO_MODELS);
  });

  it('only offers models the shared fal catalog can resolve', () => {
    for (const id of Object.keys(MOTION_SPLAT_VIDEO_MODELS)) {
      expect(falCatalog.includes(`'${id}'`), `${id} is missing from the canonical fal catalog`).toBe(true);
    }
  });

  it('offers exactly the models the edge function accepts', () => {
    const offered = imageToVideoModels().map((model) => model.id);
    expect(offered.length).toBeGreaterThan(0);
    for (const id of offered) expect(MOTION_SPLAT_VIDEO_MODELS).toHaveProperty(id);
    expect(offered[0]).toBe(DEFAULT_VIDEO_MODEL_ID);
  });

  it('quotes the credits the catalog advertises for each offered model', () => {
    for (const model of imageToVideoModels()) {
      expect(videoModelCost(model.id), `${model.id} quote`).toBe(model.credits);
      expect(getModelById(model.id)?.credits).toBe(model.credits);
    }
  });

  it('falls back to the default model price for an unknown id', () => {
    expect(videoModelCost('fal-ai/not-a-model')).toBe(MOTION_SPLAT_VIDEO_MODELS[DEFAULT_VIDEO_MODEL_ID]);
    expect(videoModelCost(undefined)).toBe(MOTION_SPLAT_VIDEO_MODELS[DEFAULT_VIDEO_MODEL_ID]);
  });
});
