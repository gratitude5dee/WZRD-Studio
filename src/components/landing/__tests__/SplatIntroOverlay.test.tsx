import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import type { MotionSplatEngineState } from '@/components/motion-splat/engine/types';

let lastProps: Record<string, unknown> = {};

vi.mock('@/components/motion-splat/MotionSplatViewer', () => ({
  MotionSplatViewer: (props: Record<string, unknown>) => {
    lastProps = props;
    return <div data-testid="viewer-stub" data-mode={String(props.mode)} data-backend={String(props.backend)} />;
  },
}));

import SplatIntroOverlay from '../SplatIntroOverlay';

const manifest = {
  version: 1 as const,
  id: 'intro',
  title: 'Intro',
  createdAt: 'x',
  provider: 'depth-anything-video' as const,
  source: { videoUrl: '/intro-splat/rgb.mp4' },
  duration: 6,
  fps: 24,
  width: 1280,
  height: 720,
  camera: { fovDeg: 50, near: 1, far: 3 },
  track: { kind: 'rgbd' as const, depthVideoUrl: '/intro-splat/depth.mp4', depthEncoding: 'inverse-gray8' as const, grid: { cols: 320, rows: 180 }, keyframeCount: 24 },
};

function readyState(): MotionSplatEngineState {
  return { status: 'ready', progress: null, error: null, backend: 'gpu', time: 0, duration: 6, playing: true, loop: false, speed: 1, keyframeTimes: new Float32Array(0), splatCount: 1 };
}

beforeEach(() => {
  vi.useFakeTimers();
  lastProps = {};
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SplatIntroOverlay', () => {
  it('runs the viewer in cinematic mode on the GPU backend', () => {
    render(<SplatIntroOverlay manifest={manifest} onComplete={vi.fn()} />);
    const stub = screen.getByTestId('viewer-stub');
    expect(stub.dataset.mode).toBe('cinematic');
    expect(stub.dataset.backend).toBe('gpu');
    expect(screen.getByTestId('splat-intro-overlay').dataset.phase).toBe('loading');
  });

  it('fades out and completes when the clip ends', () => {
    const onComplete = vi.fn();
    render(<SplatIntroOverlay manifest={manifest} onComplete={onComplete} />);
    act(() => {
      (lastProps.onStateChange as (s: MotionSplatEngineState) => void)(readyState());
    });
    expect(screen.getByTestId('splat-intro-overlay').dataset.phase).toBe('playing');
    act(() => {
      (lastProps.onComplete as () => void)();
    });
    expect(screen.getByTestId('splat-intro-overlay').dataset.phase).toBe('ending');
    expect(onComplete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('can be skipped with the button or Escape, only completing once', () => {
    const onComplete = vi.fn();
    render(<SplatIntroOverlay manifest={manifest} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip intro' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('completes immediately when the viewer errors and reports the reason', () => {
    const onComplete = vi.fn();
    const onError = vi.fn();
    render(<SplatIntroOverlay manifest={manifest} onComplete={onComplete} onError={onError} />);
    act(() => {
      (lastProps.onError as (m: string) => void)('no gpu');
    });
    expect(onError).toHaveBeenCalledWith('no gpu');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('never holds the page past the safety timeout', () => {
    const onComplete = vi.fn();
    render(<SplatIntroOverlay manifest={manifest} onComplete={onComplete} safetyTimeoutMs={2000} />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId('splat-intro-overlay').dataset.phase).toBe('ending');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
