import { describe, expect, it } from 'vitest';

import { FFMPEG_PALETTE_ITEMS } from './StudioNodePalette';
import { getMediaActionById } from '@/lib/studio/mediaActionRegistry';

describe('StudioNodePalette FFmpeg items', () => {
  it('seeds local registry action ids instead of Fal FFmpeg model ids', () => {
    expect(FFMPEG_PALETTE_ITEMS.length).toBeGreaterThan(0);

    for (const item of FFMPEG_PALETTE_ITEMS) {
      const params = item.seed?.params ?? {};
      const actionId = params.actionId;

      expect(actionId, item.label).toEqual(expect.any(String));
      expect(JSON.stringify(params), item.label).not.toContain('fal-ai/');

      const action = getMediaActionById(actionId as string);
      expect(action, item.label).toBeTruthy();
      expect(action?.executor, item.label).toBe('ffmpeg');
      expect(action?.providerPreference, item.label).toContain('local');
      expect(action?.costEstimate, item.label).toBe(0);
    }
  });
});
