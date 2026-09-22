import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import type { MotionSplatEngineState } from '../engine/types';

const engine = {
  load: vi.fn(),
  play: vi.fn(async () => {}),
  pause: vi.fn(),
  togglePlay: vi.fn(),
  seek: vi.fn(async () => {}),
  stepKeyframe: vi.fn(),
  stepFrame: vi.fn(),
  setLoop: vi.fn(),
  setSpeed: vi.fn(),
  resetCamera: vi.fn(),
  captureFrame: vi.fn(() => 'data:image/png;base64,x'),
};

let state: MotionSplatEngineState;

vi.mock('../useMotionSplatEngine', () => ({
  useMotionSplatEngine: () => ({ engine, state }),
}));

import { MotionSplatViewer } from '../MotionSplatViewer';

const manifest = {
  version: 1 as const,
  id: 'm',
  title: 'Fish',
  createdAt: 'x',
  provider: 'depth-anything-video' as const,
  source: { videoUrl: 'https://cdn/rgb.mp4' },
  duration: 4,
  fps: 24,
  width: 640,
  height: 360,
  camera: { fovDeg: 50, near: 1, far: 3 },
  track: { kind: 'rgbd' as const, depthVideoUrl: 'https://cdn/depth.mp4', depthEncoding: 'inverse-gray8' as const, grid: { cols: 64, rows: 36 }, keyframeCount: 8 },
};

function makeState(overrides: Partial<MotionSplatEngineState>): MotionSplatEngineState {
  return {
    status: 'ready',
    progress: null,
    error: null,
    backend: 'gpu',
    time: 1,
    duration: 4,
    playing: false,
    loop: true,
    speed: 1,
    keyframeTimes: new Float32Array([0, 1, 2, 3]),
    splatCount: 100,
    ...overrides,
  };
}

beforeEach(() => {
  Object.values(engine).forEach((fn) => fn.mockClear());
});

describe('MotionSplatViewer', () => {
  it('shows the decoding progress overlay while loading', () => {
    state = makeState({ status: 'decoding', progress: { value: 0.4, label: 'Sampling depth frames' } });
    render(<MotionSplatViewer manifest={manifest} />);
    expect(screen.getByTestId('motion-splat-progress').textContent).toContain('Sampling depth frames');
    expect(screen.getByTestId('motion-splat-progress').textContent).toContain('40%');
    expect(screen.getByRole('button', { name: 'Play (Space)' })).toBeDisabled();
  });

  it('falls back to the source video without WebGL2', () => {
    state = makeState({ status: 'unsupported', error: 'WebGL2 is not available' });
    render(<MotionSplatViewer manifest={manifest} />);
    const fallback = screen.getByTestId('motion-splat-fallback');
    expect(fallback.querySelector('video')?.getAttribute('src')).toBe('https://cdn/rgb.mp4');
    expect(screen.queryByTestId('motion-splat-transport')).toBeNull();
  });

  it('offers a retry on error and reports it', () => {
    state = makeState({ status: 'error', error: 'Depth video failed' });
    const onError = vi.fn();
    render(<MotionSplatViewer manifest={manifest} onError={onError} />);
    expect(screen.getByRole('alert').textContent).toContain('Depth video failed');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(engine.load).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('Depth video failed');
  });

  it('routes keyboard shortcuts from the stage to the engine', () => {
    state = makeState({});
    const onReady = vi.fn();
    render(<MotionSplatViewer manifest={manifest} onReady={onReady} />);
    expect(onReady).toHaveBeenCalledTimes(1);
    const stage = screen.getByTestId('motion-splat-stage');
    fireEvent.keyDown(stage, { key: ' ' });
    expect(engine.togglePlay).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(stage, { key: 'k' });
    expect(engine.stepKeyframe).toHaveBeenCalledWith(1);
    fireEvent.keyDown(stage, { key: 'l' });
    expect(engine.setLoop).toHaveBeenCalledWith(false);
    fireEvent.keyDown(stage, { key: 'r' });
    expect(engine.resetCamera).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(stage, { key: 'ArrowRight' });
    expect(engine.stepFrame).toHaveBeenCalledWith(1);
    fireEvent.keyDown(stage, { key: 'End' });
    expect(engine.seek).toHaveBeenCalledWith(4);
  });

  it('hides the transport in cinematic mode and exposes an imperative handle', () => {
    state = makeState({});
    const ref = { current: null as null | { captureFrame: () => string | null; play: () => void } };
    render(<MotionSplatViewer manifest={manifest} mode="cinematic" ref={ref as never} />);
    expect(screen.queryByTestId('motion-splat-transport')).toBeNull();
    expect(ref.current?.captureFrame()).toBe('data:image/png;base64,x');
    ref.current?.play();
    expect(engine.play).toHaveBeenCalledTimes(1);
  });
});

describe('error reporting', () => {
  it('reports an error raised after a successful load, and only once', () => {
    const onError = vi.fn();
    state = makeState({ status: 'ready', error: null });
    const { rerender } = render(<MotionSplatViewer manifest={manifest} onError={onError} />);
    expect(onError).not.toHaveBeenCalled();

    // Autoplay blocked mid-run: status stays ready, but the error must surface.
    state = makeState({ status: 'ready', error: 'Playback was blocked', playing: false });
    rerender(<MotionSplatViewer manifest={manifest} onError={onError} />);
    expect(onError).toHaveBeenCalledWith('Playback was blocked');

    state = makeState({ status: 'ready', error: 'Playback was blocked', playing: false, time: 2 });
    rerender(<MotionSplatViewer manifest={manifest} onError={onError} />);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
