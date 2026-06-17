import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AudioTrack, Clip, LibraryMediaItem } from '@/store/videoEditorStore';
import { useVideoEditorStore } from '@/store/videoEditorStore';
import TimelinePanel from './TimelinePanel';

class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;

  constructor(type: string, eventInitDict: PointerEventInit = {}) {
    super(type, eventInitDict);
    this.pointerId = eventInitDict.pointerId ?? 1;
    this.pointerType = eventInitDict.pointerType ?? 'mouse';
  }
}

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
  name: 'Shot',
  url: '/shot.mp4',
  startTime: 1000,
  duration: 1000,
  endTime: 2000,
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
  startTime: 2500,
  duration: 1000,
  endTime: 3500,
  volume: 1,
  isMuted: false,
  trackIndex: 0,
  ...overrides,
});

describe('TimelinePanel marquee selection', () => {
  beforeEach(() => {
    vi.stubGlobal('PointerEvent', TestPointerEvent);
    const store = useVideoEditorStore.getState();
    store.reset();
    store.setTimelineZoom(100);
    store.addClip(createClip({ id: 'clip-1', startTime: 1000, duration: 1000, endTime: 2000 }));
    store.addClip(createClip({ id: 'clip-2', startTime: 4000, duration: 1000, endTime: 5000 }));
    store.addAudioTrack(createAudioTrack({ id: 'audio-1', startTime: 2500, duration: 1000, endTime: 3500 }));
  });

  it('selects all timeline elements intersecting a drag marquee', () => {
    render(<TimelinePanel />);

    const scroll = screen.getByTestId('editor-timeline-scroll');
    vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 800,
      bottom: 300,
      width: 800,
      height: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(scroll, { button: 0, clientX: 90, clientY: 36 });
    fireEvent.pointerMove(document, { clientX: 360, clientY: 208 });
    fireEvent.pointerUp(document, { clientX: 360, clientY: 208 });

    expect(useVideoEditorStore.getState().selectedClipIds).toEqual(['clip-1']);
    expect(useVideoEditorStore.getState().selectedAudioTrackIds).toEqual(['audio-1']);
  });
});

describe('TimelinePanel sparse track rendering', () => {
  beforeEach(() => {
    const store = useVideoEditorStore.getState();
    store.reset();
    store.setTimelineZoom(50);
  });

  function dropMedia(track: Element, mediaItem: LibraryMediaItem, clientX = 125) {
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 25,
      top: 0,
      right: 525,
      bottom: 80,
      width: 500,
      height: 80,
      x: 25,
      y: 0,
      toJSON: () => ({}),
    });

    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clientX', { value: clientX });
    Object.defineProperty(event, 'clientY', { value: 24 });
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        getData: (type: string) => type === 'application/json' ? JSON.stringify({ mediaItem }) : '',
      },
    });
    fireEvent(track, event);
  }

  it('preserves sparse visual track indices in rendered labels and drop targets', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip({ id: 'clip-track-2', trackIndex: 2, layer: 2 }));

    render(<TimelinePanel />);

    expect(screen.getByText('Video Track 3')).toBeInTheDocument();
    expect(document.querySelector('[data-track-type="video-2"]')).not.toBeNull();
    expect(document.querySelector('[data-track-type="video-0"]')).toBeNull();
  });

  it('drops media on a sparse rendered video track using the real track index', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip({ id: 'clip-track-2', trackIndex: 2, layer: 2 }));
    const mediaItem: LibraryMediaItem = {
      id: 'asset-video-sparse',
      projectId: 'project-1',
      mediaType: 'video',
      name: 'Sparse track shot',
      url: '/media/sparse.mp4',
      durationSeconds: 3,
    };

    render(<TimelinePanel />);
    const track = document.querySelector('[data-track-type="video-2"]');
    expect(track).not.toBeNull();

    dropMedia(track!, mediaItem);

    const dropped = useVideoEditorStore.getState().clips.find((clip) => clip.mediaItemId === 'asset-video-sparse');
    expect(dropped).toMatchObject({
      startTime: 2000,
      duration: 3000,
      endTime: 5000,
      trackIndex: 2,
      layer: 2,
    });
  });

  it('preserves sparse audio track indices in rendered labels and drop targets', () => {
    const store = useVideoEditorStore.getState();
    store.addAudioTrack(createAudioTrack({ id: 'audio-track-3', trackIndex: 3 }));

    render(<TimelinePanel />);

    expect(screen.getByText('Audio Track 4')).toBeInTheDocument();
    expect(document.querySelector('[data-track-type="audio-3"]')).not.toBeNull();
    expect(document.querySelector('[data-track-type="audio-0"]')).toBeNull();
  });
});
