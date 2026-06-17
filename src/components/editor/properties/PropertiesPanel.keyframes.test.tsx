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

describe('PropertiesPanel keyframe editing', () => {
  beforeEach(() => {
    const store = useVideoEditorStore.getState();
    store.reset();
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
    store.selectKeyframe('keyframe-1');
  });

  it('shows the selected keyframe and edits its time from the properties panel', () => {
    render(<PropertiesPanel selectedClipIds={[]} selectedAudioTrackIds={[]} />);

    expect(screen.getByText('Keyframe')).toBeInTheDocument();
    expect(screen.getByText('Opening shot')).toBeInTheDocument();
    expect(screen.getByText('transforms.position')).toBeInTheDocument();

    const timeInput = screen.getByRole('spinbutton', { name: 'Keyframe time' });
    expect(timeInput).toHaveValue(1500);

    fireEvent.change(timeInput, { target: { value: '1800' } });

    expect(useVideoEditorStore.getState().keyframes[0].time).toBe(1800);
  });

  it('edits numeric keyframe property values from the properties panel', () => {
    render(<PropertiesPanel selectedClipIds={[]} selectedAudioTrackIds={[]} />);

    const xInput = screen.getByRole('spinbutton', { name: 'Keyframe transforms.position.x' });
    expect(xInput).toHaveValue(12);

    fireEvent.change(xInput, { target: { value: '42' } });

    expect(useVideoEditorStore.getState().keyframes[0].properties).toEqual({
      transforms: {
        position: { x: 42, y: 24 },
      },
    });
  });

  it('shows keyframe properties after switching from a clip selection to a keyframe selection', () => {
    const store = useVideoEditorStore.getState();
    store.selectClip('clip-1');
    store.selectKeyframe('keyframe-1');

    render(
      <PropertiesPanel
        selectedClipIds={useVideoEditorStore.getState().selectedClipIds}
        selectedAudioTrackIds={useVideoEditorStore.getState().selectedAudioTrackIds}
      />
    );

    expect(screen.getByText('Keyframe')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Keyframe time' })).toHaveValue(1500);
  });
});
