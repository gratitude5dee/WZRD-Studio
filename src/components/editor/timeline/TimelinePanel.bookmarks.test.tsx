import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('TimelinePanel bookmark markers', () => {
  beforeEach(() => {
    const store = useVideoEditorStore.getState();
    store.reset();
    store.setTimelineZoom(100);
    store.addBookmark({
      id: 'bookmark-1',
      name: 'Scene A',
      time: 2500,
      color: '#22c55e',
    });
  });

  it('renders scene bookmarks on the timeline and seeks when selected', () => {
    render(<TimelinePanel />);

    const marker = screen.getByTestId('editor-timeline-bookmark-bookmark-1');
    expect(marker).toHaveStyle({ left: '250px' });
    expect(marker).toHaveAttribute('aria-label', 'Seek to bookmark Scene A');

    fireEvent.click(marker);

    expect(useVideoEditorStore.getState().playback.currentTime).toBe(2500);
  });
});
