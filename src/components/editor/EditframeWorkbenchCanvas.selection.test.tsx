import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentType, HTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AudioTrack, Clip, CompositionSettings, Keyframe } from '@/store/videoEditorStore';
import { useVideoEditorStore } from '@/store/videoEditorStore';
import { EditframeWorkbenchCanvas } from './EditframeWorkbenchCanvas';

const mockTrimHandleChange = vi.hoisted(() => ({
  value: { startMs: 1_250, endMs: 1_850 },
}));
const mockAudioProps = vi.hoisted(() => [] as Array<Record<string, unknown>>);

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
  const TrimHandlesMock = ({
    elementId,
    intrinsicDurationMs: _intrinsicDurationMs,
    mode: _mode,
    onTrimChangeEnd,
    pixelsPerMs: _pixelsPerMs,
    value: _value,
    ...props
  }: EditframeMockProps) => (
    <div
      {...props}
      data-testid={`trim-handles-${String(elementId)}`}
      onClick={() =>
        typeof onTrimChangeEnd === 'function'
          ? onTrimChangeEnd(new CustomEvent('trimchangeend', { detail: { value: mockTrimHandleChange.value } }))
          : undefined
      }
    />
  );

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

  const AudioMock = ({
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
  }: EditframeMockProps) => {
    mockAudioProps.push(props);
    return <div {...props} data-testid="editframe-audio">{Component ? <Component /> : children}</div>;
  };

  return {
    Audio: AudioMock,
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
    TrimHandles: TrimHandlesMock,
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

const createClip = (overrides: Partial<Clip> = {}): Clip => ({
  id: 'clip-1',
  type: 'video',
  name: 'Scene',
  url: '/scene.mp4',
  startTime: 1_000,
  duration: 1_000,
  endTime: 2_000,
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

const createAudioTrack = (overrides: Partial<AudioTrack> = {}): AudioTrack => ({
  id: 'audio-1',
  type: 'audio',
  name: 'Stem',
  url: '/stem.wav',
  startTime: 2_500,
  duration: 1_000,
  endTime: 3_500,
  volume: 1,
  isMuted: false,
  trackIndex: 0,
  ...overrides,
});

describe('EditframeWorkbenchCanvas marquee selection', () => {
  beforeEach(() => {
    vi.stubGlobal('PointerEvent', TestPointerEvent);
    mockAudioProps.length = 0;
    useVideoEditorStore.getState().reset();
  });

  it('selects active timeline clips and audio intersecting a drag marquee', () => {
    render(
      <EditframeWorkbenchCanvas
        clips={[
          createClip({ id: 'clip-1', startTime: 1_000, duration: 1_000, endTime: 2_000 }),
          createClip({ id: 'clip-2', startTime: 5_000, duration: 1_000, endTime: 6_000 }),
        ]}
        audioTracks={[createAudioTrack({ id: 'audio-1', startTime: 2_500, duration: 1_000, endTime: 3_500 })]}
        composition={composition}
      />
    );

    const timeline = screen.getByLabelText('Editor timeline');
    vi.spyOn(timeline, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 900,
      bottom: 300,
      width: 900,
      height: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(timeline, { button: 0, clientX: 60, clientY: 34 });
    fireEvent.pointerMove(document, { clientX: 260, clientY: 220 });
    expect(screen.getByTestId('editframe-timeline-selection-box')).toBeInTheDocument();
    fireEvent.pointerUp(document, { clientX: 260, clientY: 220 });

    const state = useVideoEditorStore.getState();
    expect(state.selectedClipIds).toEqual(['clip-1']);
    expect(state.selectedAudioTrackIds).toEqual(['audio-1']);
  });

  it('moves a clip and its keyframes when dragging the active timeline item', () => {
    const movingClip = createClip({ id: 'clip-1', startTime: 1_000, duration: 1_000, endTime: 2_000 });
    const keyframe: Keyframe = {
      id: 'keyframe-1',
      targetId: movingClip.id,
      targetType: 'clip',
      propertyPath: 'transforms',
      time: 1_500,
      easing: 'linear',
      properties: { transforms: movingClip.transforms },
    };
    useVideoEditorStore.setState({ clips: [movingClip], keyframes: [keyframe] });

    render(<EditframeWorkbenchCanvas clips={[movingClip]} audioTracks={[]} composition={composition} />);

    const clipButton = screen.getByRole('button', { name: /scene 0:01/i });
    fireEvent.pointerDown(clipButton, { button: 0, clientX: 70, clientY: 56 });
    fireEvent.pointerMove(document, { clientX: 210, clientY: 56 });
    fireEvent.pointerUp(document, { clientX: 210, clientY: 56 });

    const state = useVideoEditorStore.getState();
    expect(state.clips[0]).toMatchObject({ startTime: 3_000, endTime: 4_000, layer: 0, trackIndex: 0 });
    expect(state.keyframes[0]).toMatchObject({ time: 3_500 });
  });

  it('preserves source trim metadata when the active timeline trim handle changes clip edges', () => {
    const clip = createClip({
      id: 'clip-1',
      startTime: 1_000,
      duration: 1_000,
      endTime: 2_000,
      trimStart: 0,
      trimEnd: 1_000,
    });
    useVideoEditorStore.setState({ clips: [clip], selectedClipIds: [clip.id] });

    render(<EditframeWorkbenchCanvas clips={[clip]} audioTracks={[]} composition={composition} />);

    fireEvent.click(screen.getByTestId('trim-handles-clip-1'));

    const state = useVideoEditorStore.getState();
    expect(state.clips[0]).toMatchObject({
      startTime: 1_250,
      duration: 600,
      endTime: 1_850,
      trimStart: 250,
      trimEnd: 850,
    });
  });

  it('labels separated source audio with its linked source clip in the active timeline', () => {
    const clip = createClip({ id: 'clip-1', name: 'Scene' });
    const sourceAudio = createAudioTrack({
      id: 'audio-1',
      name: 'Scene source audio',
      sourceId: clip.id,
      startTime: clip.startTime,
      duration: clip.duration,
      endTime: clip.endTime,
    });

    render(<EditframeWorkbenchCanvas clips={[clip]} audioTracks={[sourceAudio]} composition={composition} />);

    expect(screen.getByRole('button', { name: /linked source audio from scene/i })).toBeInTheDocument();
  });

  it('previews separated source audio from its source trim range', () => {
    const sourceAudio = createAudioTrack({
      id: 'audio-1',
      name: 'Scene source audio',
      url: '/scene.mp4',
      startTime: 1_000,
      duration: 2_000,
      endTime: 3_000,
      trimStart: 750,
      trimEnd: 2_750,
      fadeInDuration: 125,
    });
    useVideoEditorStore.setState((state) => ({
      playback: { ...state.playback, currentTime: 1_000 },
    }));

    render(<EditframeWorkbenchCanvas clips={[]} audioTracks={[sourceAudio]} composition={composition} />);

    const audio = screen.getByTestId('editor-preview-audio-audio-1') as HTMLAudioElement;
    expect(audio).toHaveAttribute('src', '/scene.mp4');
    expect(audio.currentTime).toBeCloseTo(0.75, 2);
  });
});
