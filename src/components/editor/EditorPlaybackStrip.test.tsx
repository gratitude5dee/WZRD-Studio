import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { EditorPlaybackStrip } from './EditorPlaybackStrip';
import { useVideoEditorStore } from '@/store/videoEditorStore';

describe('EditorPlaybackStrip', () => {
  beforeEach(() => {
    useVideoEditorStore.getState().reset();
    useVideoEditorStore.setState((state) => ({
      composition: { ...state.composition, fps: 25, duration: 5_000 },
      playback: { ...state.playback, currentTime: 1_000 },
    }));
  });

  it('uses the canonical store controls for play, seek, and frame stepping', () => {
    render(<EditorPlaybackStrip durationMs={5_000} fps={25} />);

    fireEvent.click(screen.getByRole('button', { name: /play timeline/i }));
    expect(useVideoEditorStore.getState().playback.isPlaying).toBe(true);

    fireEvent.change(screen.getByRole('slider', { name: /timeline scrubber/i }), {
      target: { value: '2000' },
    });
    expect(useVideoEditorStore.getState().playback.currentTime).toBe(2_000);

    fireEvent.click(screen.getByRole('button', { name: /next frame/i }));
    expect(useVideoEditorStore.getState().playback.currentTime).toBe(2_040);

    fireEvent.click(screen.getByRole('button', { name: /previous frame/i }));
    expect(useVideoEditorStore.getState().playback.currentTime).toBe(2_000);
  });
});
