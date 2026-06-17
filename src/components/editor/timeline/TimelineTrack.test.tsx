import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useVideoEditorStore } from '@/store/videoEditorStore';
import { TimelineTrack } from './TimelineTrack';
import type { LibraryMediaItem } from '@/store/videoEditorStore';

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

describe('TimelineTrack controls', () => {
  beforeEach(() => {
    useVideoEditorStore.getState().reset();
  });

  function dropMediaOnTrack(track: Element, mediaItem: LibraryMediaItem, clientX = 125) {
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      x: 25,
      y: 0,
      width: 500,
      height: 80,
      top: 0,
      right: 525,
      bottom: 80,
      left: 25,
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

  it('exposes OpenCut-style lock and visibility controls for visual tracks', () => {
    render(<TimelineTrack type="video" index={0} clips={[]} zoom={50} selectedIds={[]} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /lock video track 1/i }));
    expect(useVideoEditorStore.getState().trackControls['visual-0']).toMatchObject({ locked: true });

    fireEvent.click(screen.getByRole('button', { name: /hide video track 1/i }));
    expect(useVideoEditorStore.getState().trackControls['visual-0']).toMatchObject({ visible: false });
    expect(screen.getByRole('button', { name: /show video track 1/i })).toBeInTheDocument();
  });

  it('exposes mute controls for audio tracks', () => {
    render(<TimelineTrack type="audio" index={0} zoom={50} selectedIds={[]} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /mute audio track 1/i }));
    expect(useVideoEditorStore.getState().trackControls['audio-0']).toMatchObject({ muted: true });
    expect(screen.getByRole('button', { name: /unmute audio track 1/i })).toBeInTheDocument();
  });

  it('drops visual media onto the requested video track instead of deriving a track from clip counts', () => {
    const mediaItem: LibraryMediaItem = {
      id: 'asset-video-1',
      projectId: 'project-1',
      mediaType: 'video',
      name: 'Opening shot',
      url: '/media/opening.mp4',
      durationSeconds: 4,
    };

    render(<TimelineTrack type="video" index={2} clips={[]} zoom={50} selectedIds={[]} onSelect={vi.fn()} />);
    const track = document.querySelector('[data-track-type="video-2"]');
    expect(track).not.toBeNull();

    dropMediaOnTrack(track!, mediaItem);

    expect(useVideoEditorStore.getState().clips[0]).toMatchObject({
      mediaItemId: 'asset-video-1',
      type: 'video',
      name: 'Opening shot',
      startTime: 2000,
      duration: 4000,
      endTime: 6000,
      trackIndex: 2,
      layer: 2,
    });
  });

  it('drops audio media onto the requested audio track instead of appending by current audio count', () => {
    const mediaItem: LibraryMediaItem = {
      id: 'asset-audio-1',
      projectId: 'project-1',
      mediaType: 'audio',
      name: 'Voiceover',
      url: '/media/voiceover.wav',
      durationSeconds: 6,
    };

    render(<TimelineTrack type="audio" index={3} zoom={50} selectedIds={[]} onSelect={vi.fn()} />);
    const track = document.querySelector('[data-track-type="audio-3"]');
    expect(track).not.toBeNull();

    dropMediaOnTrack(track!, mediaItem);

    expect(useVideoEditorStore.getState().audioTracks[0]).toMatchObject({
      mediaItemId: 'asset-audio-1',
      name: 'Voiceover',
      startTime: 2000,
      duration: 6000,
      endTime: 8000,
      trackIndex: 3,
    });
  });

  it('snaps dropped media to existing timeline edges on the requested track', () => {
    useVideoEditorStore.getState().addClip({
      id: 'existing-clip',
      mediaItemId: 'asset-existing',
      type: 'video',
      name: 'Existing clip',
      url: '/media/existing.mp4',
      startTime: 0,
      duration: 2000,
      endTime: 2000,
      layer: 0,
      trackIndex: 0,
      transforms: {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        opacity: 1,
      },
    });

    const mediaItem: LibraryMediaItem = {
      id: 'asset-image-1',
      projectId: 'project-1',
      mediaType: 'image',
      name: 'Reference frame',
      url: '/media/reference.png',
      durationSeconds: 5,
    };

    render(<TimelineTrack type="video" index={1} clips={[]} zoom={50} selectedIds={[]} onSelect={vi.fn()} />);
    const track = document.querySelector('[data-track-type="video-1"]');
    expect(track).not.toBeNull();

    dropMediaOnTrack(track!, mediaItem, 123);

    const droppedClip = useVideoEditorStore.getState().clips.find((clip) => clip.mediaItemId === 'asset-image-1');
    expect(droppedClip).toMatchObject({
      startTime: 2000,
      endTime: 7000,
      trackIndex: 1,
      layer: 1,
    });
  });
});
