import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Clip } from '@/store/videoEditorStore';
import { useVideoEditorStore } from '@/store/videoEditorStore';
import PropertiesPanel from './PropertiesPanel';

vi.mock('@/services/videoEditorService', () => ({
  videoEditorService: {
    saveTimelineClip: vi.fn(),
    deleteTimelineClip: vi.fn(),
    saveAudioTrack: vi.fn(),
    deleteAudioTrack: vi.fn(),
    saveKeyframe: vi.fn(),
    deleteKeyframe: vi.fn(),
    updateComposition: vi.fn(),
    getTimelineClips: vi.fn(async () => []),
    getAudioTracks: vi.fn(async () => []),
    getComposition: vi.fn(async () => undefined),
    getKeyframes: vi.fn(async () => []),
    getMediaItems: vi.fn(async () => []),
  },
}));

const createClip = (overrides: Partial<Clip> = {}): Clip => ({
  id: 'clip-1',
  type: 'video',
  name: 'Opening shot',
  url: '/shot.mp4',
  startTime: 0,
  duration: 2000,
  endTime: 2000,
  trackIndex: 0,
  layer: 0,
  transforms: {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    opacity: 1,
  },
  effects: [{ id: 'blur', name: 'Blur', type: 'filter', params: { amount: 4 } }],
  ...overrides,
});

describe('PropertiesPanel effect editing', () => {
  beforeEach(() => {
    const store = useVideoEditorStore.getState();
    store.reset();
    store.addClip(createClip());
    store.selectClip('clip-1');
  });

  it('edits selected clip effect parameters without removing the effect', () => {
    render(<PropertiesPanel selectedClipIds={['clip-1']} selectedAudioTrackIds={[]} />);

    const amountInput = screen.getByRole('spinbutton', { name: 'Blur amount' });
    expect(amountInput).toHaveValue(4);

    fireEvent.change(amountInput, { target: { value: '9' } });

    expect(useVideoEditorStore.getState().clips[0].effects).toEqual([
      { id: 'blur', name: 'Blur', type: 'filter', params: { amount: 9 } },
    ]);
  });
});
