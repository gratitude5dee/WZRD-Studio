import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentType, HTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AudioTrack, Clip, CompositionSettings, Keyframe } from '@/store/videoEditorStore';
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

class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;

  constructor(type: string, eventInitDict: PointerEventInit = {}) {
    super(type, eventInitDict);
    this.pointerId = eventInitDict.pointerId ?? 1;
    this.pointerType = eventInitDict.pointerType ?? 'mouse';
  }
}

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

const keyframe: Keyframe = {
  id: 'keyframe-1',
  targetId: 'clip-1',
  targetType: 'clip',
  propertyPath: 'transforms',
  time: 2_500,
  easing: 'linear',
  properties: {
    transforms: clip.transforms,
  },
};

const audioTrack: AudioTrack = {
  id: 'audio-1',
  type: 'audio',
  name: 'Stem',
  url: '/stem.wav',
  startTime: 0,
  duration: 5_000,
  endTime: 5_000,
  volume: 0.8,
  isMuted: false,
  trackIndex: 0,
};

describe('EditframeWorkbenchCanvas keyframes', () => {
  beforeEach(() => {
    vi.stubGlobal('PointerEvent', TestPointerEvent);
    useVideoEditorStore.getState().reset();
    useVideoEditorStore.setState({ keyframes: [keyframe] });
  });

  it('renders selectable keyframe markers on the active editor timeline', () => {
    render(<EditframeWorkbenchCanvas clips={[clip]} audioTracks={[]} composition={composition} />);

    fireEvent.click(screen.getByRole('button', { name: /select keyframe transforms for scene at 00:02\.500/i }));

    const state = useVideoEditorStore.getState();
    expect(state.selectedKeyframeIds).toEqual(['keyframe-1']);
    expect(state.playback.currentTime).toBe(2_500);
  });

  it('clears stale media selection when selecting a keyframe directly', () => {
    useVideoEditorStore.getState().selectClip('clip-1');

    render(<EditframeWorkbenchCanvas clips={[clip]} audioTracks={[]} composition={composition} />);

    fireEvent.click(screen.getByRole('button', { name: /select keyframe transforms for scene at 00:02\.500/i }));

    const state = useVideoEditorStore.getState();
    expect(state.selectedClipIds).toEqual([]);
    expect(state.selectedAudioTrackIds).toEqual([]);
    expect(state.selectedKeyframeIds).toEqual(['keyframe-1']);
  });

  it('renders selectable audio volume keyframe markers on the active editor timeline', () => {
    useVideoEditorStore.setState({
      keyframes: [
        {
          id: 'audio-keyframe-1',
          targetId: 'audio-1',
          targetType: 'audio',
          propertyPath: 'volume',
          time: 1_500,
          easing: 'linear',
          properties: { volume: 0.4 },
        },
      ],
    });

    render(<EditframeWorkbenchCanvas clips={[]} audioTracks={[audioTrack]} composition={composition} />);

    fireEvent.click(screen.getByRole('button', { name: /select keyframe volume for stem at 00:01\.500/i }));

    const state = useVideoEditorStore.getState();
    expect(state.selectedAudioTrackIds).toEqual([]);
    expect(state.selectedKeyframeIds).toEqual(['audio-keyframe-1']);
    expect(state.playback.currentTime).toBe(1_500);
  });

  it('drags a selected keyframe marker on the active editor timeline', () => {
    useVideoEditorStore.setState({ clips: [clip] });
    render(<EditframeWorkbenchCanvas clips={[clip]} audioTracks={[]} composition={composition} />);

    const marker = screen.getByTestId('editframe-timeline-keyframe-keyframe-1');
    const historyLengthBeforeDrag = useVideoEditorStore.getState().history.past.length;

    fireEvent.pointerDown(marker, { button: 0, clientX: 100, clientY: 120 });
    fireEvent.pointerMove(document, { clientX: 170, clientY: 120 });
    fireEvent.pointerUp(document, { clientX: 170, clientY: 120 });

    const state = useVideoEditorStore.getState();
    expect(state.history.past).toHaveLength(historyLengthBeforeDrag + 1);
    expect(state.selectedKeyframeIds).toEqual(['keyframe-1']);
    expect(state.keyframes.find((item) => item.id === 'keyframe-1')?.time).toBe(3_500);
    expect(state.playback.currentTime).toBe(3_500);
  });

  it('applies transform keyframes to the active preview at the current playhead time', () => {
    useVideoEditorStore.getState().setCurrentTime(2_000);
    useVideoEditorStore.setState({
      keyframes: [
        {
          id: 'preview-start',
          targetId: 'clip-1',
          targetType: 'clip',
          propertyPath: 'transforms',
          time: 1_000,
          easing: 'linear',
          properties: {
            transforms: {
              position: { x: 0, y: 0 },
              scale: { x: 1, y: 1 },
              rotation: 0,
              opacity: 1,
            },
          },
        },
        {
          id: 'preview-end',
          targetId: 'clip-1',
          targetType: 'clip',
          propertyPath: 'transforms',
          time: 3_000,
          easing: 'linear',
          properties: {
            transforms: {
              position: { x: 200, y: -100 },
              scale: { x: 2, y: 0.5 },
              rotation: 90,
              opacity: 0.25,
            },
          },
        },
      ],
    });

    const { container } = render(<EditframeWorkbenchCanvas clips={[clip]} audioTracks={[]} composition={composition} />);

    const previewVideo = container.querySelector('[src="/scene.mp4"]');
    expect(previewVideo).not.toBeNull();
    expect(previewVideo?.getAttribute('style')).toContain('translate(100px, -50px) scale(1.5, 0.75) rotate(45deg)');
    expect(previewVideo).toHaveStyle({ opacity: '0.625' });
  });
});
