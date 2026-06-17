import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useEditorPlaybackClock } from './useEditorPlaybackClock';
import { useVideoEditorStore } from '@/store/videoEditorStore';

function Harness() {
  useEditorPlaybackClock();
  return null;
}

describe('useEditorPlaybackClock', () => {
  let callbacks: FrameRequestCallback[];

  beforeEach(() => {
    callbacks = [];
    useVideoEditorStore.getState().reset();
    useVideoEditorStore.setState((state) => ({
      composition: { ...state.composition, fps: 30, duration: 1_000 },
      playback: { ...state.playback, currentTime: 0, playbackRate: 1, isLooping: false },
    }));
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callbacks.push(callback);
        return callbacks.length;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const runFrame = (time: number) => {
    const callback = callbacks.shift();
    expect(callback).toBeDefined();
    act(() => {
      callback?.(time);
    });
  };

  it('advances canonical store time while playback is active', () => {
    render(<Harness />);

    act(() => {
      useVideoEditorStore.getState().play();
    });

    runFrame(0);
    runFrame(500);

    expect(useVideoEditorStore.getState().playback.currentTime).toBe(500);
    expect(useVideoEditorStore.getState().playback.isPlaying).toBe(true);
  });

  it('pauses at the project duration when looping is off', () => {
    render(<Harness />);

    act(() => {
      useVideoEditorStore.setState((state) => ({
        playback: { ...state.playback, currentTime: 900, isPlaying: true },
      }));
    });

    runFrame(0);
    runFrame(200);

    expect(useVideoEditorStore.getState().playback.currentTime).toBe(1_000);
    expect(useVideoEditorStore.getState().playback.isPlaying).toBe(false);
  });

  it('wraps to the in point when looping is enabled', () => {
    render(<Harness />);

    act(() => {
      useVideoEditorStore.setState((state) => ({
        playback: {
          ...state.playback,
          currentTime: 900,
          inPoint: 100,
          outPoint: 1_000,
          isLooping: true,
          isPlaying: true,
        },
      }));
    });

    runFrame(0);
    runFrame(250);

    expect(useVideoEditorStore.getState().playback.currentTime).toBe(250);
    expect(useVideoEditorStore.getState().playback.isPlaying).toBe(true);
  });

  it('respects playback rate while advancing', () => {
    render(<Harness />);

    act(() => {
      useVideoEditorStore.setState((state) => ({
        playback: { ...state.playback, currentTime: 100, playbackRate: 2, isPlaying: true },
      }));
    });

    runFrame(0);
    runFrame(125);

    expect(useVideoEditorStore.getState().playback.currentTime).toBe(350);
  });
});
