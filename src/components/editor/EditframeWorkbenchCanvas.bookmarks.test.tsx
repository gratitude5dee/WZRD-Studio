import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentType, HTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Clip, CompositionSettings, EditorBookmark } from '@/store/videoEditorStore';
import { useVideoEditorStore } from '@/store/videoEditorStore';
import { EditframeWorkbenchCanvas } from './EditframeWorkbenchCanvas';

type EditframeMockProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
  component?: ComponentType;
  elementId?: unknown;
  enableDrag?: unknown;
  enableResize?: unknown;
  enableRotation?: unknown;
  intrinsicDurationMs?: unknown;
  lockAspectRatio?: unknown;
  onBoundsChange?: unknown;
  onRotationChange?: unknown;
  onTrimChangeEnd?: unknown;
  pixelsPerMs?: unknown;
};

vi.mock('@editframe/react', () => {
  const Passthrough = ({
    children,
    component: Component,
    elementId: _elementId,
    enableDrag: _enableDrag,
    enableResize: _enableResize,
    enableRotation: _enableRotation,
    intrinsicDurationMs: _intrinsicDurationMs,
    lockAspectRatio: _lockAspectRatio,
    onBoundsChange: _onBoundsChange,
    onRotationChange: _onRotationChange,
    onTrimChangeEnd: _onTrimChangeEnd,
    pixelsPerMs: _pixelsPerMs,
    ...props
  }: EditframeMockProps) => <div {...props}>{Component ? <Component /> : children}</div>;

  return {
    Audio: Passthrough,
    Controls: Passthrough,
    Filmstrip: Passthrough,
    FitScale: Passthrough,
    Image: Passthrough,
    PanZoom: Passthrough,
    Scrubber: Passthrough,
    Text: Passthrough,
    TimeDisplay: Passthrough,
    Timegroup: Passthrough,
    TimelineRoot: Passthrough,
    ToggleLoop: Passthrough,
    TogglePlay: Passthrough,
    TransformHandles: Passthrough,
    TrimHandles: Passthrough,
    Video: Passthrough,
    Workbench: Passthrough,
  };
});

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

const composition: CompositionSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  aspectRatio: '16:9',
  duration: 10_000,
  backgroundColor: '#000000',
};

const clip: Clip = {
  id: 'clip-1',
  type: 'video',
  name: 'Scene',
  url: '/scene.mp4',
  startTime: 0,
  duration: 5_000,
  endTime: 5_000,
  trackIndex: 0,
  layer: 0,
  transforms: {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    opacity: 1,
  },
};

const bookmark: EditorBookmark = {
  id: 'bookmark-1',
  name: 'Beat drop',
  time: 2_500,
  color: '#f97316',
};

describe('EditframeWorkbenchCanvas bookmarks', () => {
  beforeEach(() => {
    useVideoEditorStore.getState().reset();
    useVideoEditorStore.setState({ bookmarks: [bookmark] });
  });

  it('renders timeline bookmark markers that seek the active editor playhead', () => {
    render(<EditframeWorkbenchCanvas clips={[clip]} audioTracks={[]} composition={composition} />);

    fireEvent.click(screen.getByRole('button', { name: /seek to bookmark beat drop/i }));

    expect(useVideoEditorStore.getState().playback.currentTime).toBe(2_500);
  });
});
