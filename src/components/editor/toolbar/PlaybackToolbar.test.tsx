import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PlaybackToolbar from './PlaybackToolbar';
import { useVideoEditorStore } from '@/store/videoEditorStore';

vi.mock('./ExportDialog', () => ({
  ExportDialog: () => null,
}));

describe('PlaybackToolbar', () => {
  beforeEach(() => {
    useVideoEditorStore.getState().reset();
    useVideoEditorStore.setState({
      playback: {
        ...useVideoEditorStore.getState().playback,
        currentTime: 1_000,
      },
      composition: {
        ...useVideoEditorStore.getState().composition,
        fps: 24,
        duration: 10_000,
      },
    });
  });

  it('steps by the current composition frame duration in milliseconds', () => {
    render(<PlaybackToolbar />);

    fireEvent.click(screen.getByRole('button', { name: /next frame/i }));
    expect(useVideoEditorStore.getState().playback.currentTime).toBeCloseTo(1_000 + 1000 / 24, 5);

    fireEvent.click(screen.getByRole('button', { name: /previous frame/i }));
    expect(useVideoEditorStore.getState().playback.currentTime).toBeCloseTo(1_000, 5);
  });
});
