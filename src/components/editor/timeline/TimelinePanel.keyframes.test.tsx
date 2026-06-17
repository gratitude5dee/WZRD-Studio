import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Clip } from '@/store/videoEditorStore';
import { useVideoEditorStore } from '@/store/videoEditorStore';
import TimelinePanel from './TimelinePanel';

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
  startTime: 1000,
  duration: 2000,
  endTime: 3000,
  trackIndex: 0,
  layer: 0,
  transforms: {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    opacity: 1,
  },
  ...overrides,
});

describe('TimelinePanel keyframe markers', () => {
  beforeEach(() => {
    const store = useVideoEditorStore.getState();
    store.reset();
    store.setTimelineZoom(100);
    store.addClip(createClip());
    store.addKeyframe({
      id: 'keyframe-1',
      targetId: 'clip-1',
      targetType: 'clip',
      time: 1500,
      propertyPath: 'transforms.position',
      easing: 'easeInOut',
      properties: {
        transforms: {
          position: { x: 12, y: 24 },
        },
      },
    });
  });

  it('renders keyframes inside their target element and selects/seeks when clicked', () => {
    render(<TimelinePanel />);

    const marker = screen.getByTestId('editor-timeline-keyframe-keyframe-1');
    expect(marker).toHaveStyle({ left: '50px' });
    expect(marker).toHaveAttribute('aria-label', 'Select keyframe transforms.position for Opening shot at 00:01.500');

    fireEvent.click(marker);

    expect(useVideoEditorStore.getState().selectedKeyframeIds).toEqual(['keyframe-1']);
    expect(useVideoEditorStore.getState().playback.currentTime).toBe(1500);
  });
});
