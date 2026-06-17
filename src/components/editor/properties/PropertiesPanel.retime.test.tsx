import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AudioTrack, Clip } from '@/store/videoEditorStore';
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
  duration: 4000,
  endTime: 5000,
  trackIndex: 0,
  layer: 0,
  playbackRate: 1,
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
  name: 'Voiceover',
  url: '/voice.wav',
  startTime: 500,
  duration: 6000,
  endTime: 6500,
  volume: 1,
  isMuted: false,
  trackIndex: 0,
  playbackRate: 1,
  ...overrides,
});

describe('PropertiesPanel retime editing', () => {
  beforeEach(() => {
    useVideoEditorStore.getState().reset();
  });

  it('retimes the selected clip from the playback rate field', () => {
    const store = useVideoEditorStore.getState();
    store.addClip(createClip());
    store.selectClip('clip-1');

    render(<PropertiesPanel selectedClipIds={['clip-1']} selectedAudioTrackIds={[]} />);

    const rateInput = screen.getByRole('spinbutton', { name: 'Playback rate' });
    expect(rateInput).toHaveValue(1);

    fireEvent.change(rateInput, { target: { value: '2' } });

    expect(useVideoEditorStore.getState().clips[0]).toMatchObject({
      playbackRate: 2,
      duration: 2000,
      endTime: 3000,
    });
  });

  it('retimes the selected audio track from the playback rate field', () => {
    const store = useVideoEditorStore.getState();
    store.addAudioTrack(createAudioTrack());
    store.selectAudioTrack('audio-1');

    render(<PropertiesPanel selectedClipIds={[]} selectedAudioTrackIds={['audio-1']} />);

    const rateInput = screen.getByRole('spinbutton', { name: 'Playback rate' });
    expect(rateInput).toHaveValue(1);

    fireEvent.change(rateInput, { target: { value: '0.5' } });

    expect(useVideoEditorStore.getState().audioTracks[0]).toMatchObject({
      playbackRate: 0.5,
      duration: 12000,
      endTime: 12500,
    });
  });

  it('edits selected audio source trim fields from the properties panel', () => {
    const store = useVideoEditorStore.getState();
    store.addAudioTrack(createAudioTrack({ trimStart: 500, trimEnd: 4500 }));
    store.selectAudioTrack('audio-1');

    render(<PropertiesPanel selectedClipIds={[]} selectedAudioTrackIds={['audio-1']} />);

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Source In' }), { target: { value: '750' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Source Out' }), { target: { value: '4250' } });

    expect(useVideoEditorStore.getState().audioTracks[0]).toMatchObject({
      trimStart: 750,
      trimEnd: 4250,
    });
  });
});
