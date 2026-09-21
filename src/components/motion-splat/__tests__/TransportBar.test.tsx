import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { TransportBar } from '../TransportBar';

// jsdom has no PointerEvent; give fireEvent.pointer* real client coordinates.
class PolyfilledPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
    this.pointerType = init.pointerType ?? 'mouse';
  }
}
if (typeof window.PointerEvent === 'undefined') {
  (window as unknown as { PointerEvent: typeof PolyfilledPointerEvent }).PointerEvent = PolyfilledPointerEvent;
}

function renderBar(overrides: Partial<Parameters<typeof TransportBar>[0]> = {}) {
  const handlers = {
    onSeek: vi.fn(),
    onTogglePlay: vi.fn(),
    onToggleLoop: vi.fn(),
    onSpeedChange: vi.fn(),
    onStepKeyframe: vi.fn(),
    onStepFrame: vi.fn(),
    onResetCamera: vi.fn(),
  };
  const utils = render(
    <TransportBar
      time={1}
      duration={4}
      fps={24}
      playing={false}
      loop
      speed={1}
      keyframeTimes={[0, 1, 2, 3]}
      {...handlers}
      {...overrides}
    />,
  );
  return { ...utils, handlers };
}

describe('TransportBar', () => {
  it('renders the timecode and an accessible slider', () => {
    renderBar();
    expect(screen.getByTestId('motion-splat-timecode').textContent).toContain('00:01:00');
    const slider = screen.getByRole('slider', { name: 'Timeline' });
    expect(slider).toHaveAttribute('aria-valuemax', '4');
    expect(slider).toHaveAttribute('aria-valuenow', '1');
  });

  it('wires the transport buttons', () => {
    const { handlers } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Play (Space)' }));
    expect(handlers.onTogglePlay).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /next keyframe/i }));
    expect(handlers.onStepKeyframe).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: /loop on/i }));
    expect(handlers.onToggleLoop).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /playback speed/i }));
    expect(handlers.onSpeedChange).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole('button', { name: /reset camera/i }));
    expect(handlers.onResetCamera).toHaveBeenCalledTimes(1);
  });

  it('steps with the keyboard on the slider', () => {
    const { handlers } = renderBar();
    const slider = screen.getByRole('slider', { name: 'Timeline' });
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(handlers.onStepFrame).toHaveBeenCalledWith(1);
    fireEvent.keyDown(slider, { key: 'ArrowLeft', shiftKey: true });
    expect(handlers.onStepKeyframe).toHaveBeenCalledWith(-1);
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(handlers.onSeek).toHaveBeenCalledWith(0);
    fireEvent.keyDown(slider, { key: 'End' });
    expect(handlers.onSeek).toHaveBeenCalledWith(4);
    fireEvent.keyDown(slider, { key: ' ' });
    expect(handlers.onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('seeks where the pointer lands on the track', async () => {
    const { handlers } = renderBar();
    const slider = screen.getByRole('slider', { name: 'Timeline' });
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({ left: 100, width: 200, top: 0, height: 44, right: 300, bottom: 44, x: 100, y: 0, toJSON: () => ({}) });
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    fireEvent.pointerDown(slider, { clientX: 150, pointerId: 1 });
    expect(handlers.onSeek).toHaveBeenLastCalledWith(1);
    fireEvent.pointerMove(slider, { clientX: 300, pointerId: 1 });
    expect(handlers.onSeek).toHaveBeenLastCalledWith(4);
    fireEvent.pointerUp(slider, { clientX: 200, pointerId: 1 });
    expect(handlers.onSeek).toHaveBeenLastCalledWith(2);
    raf.mockRestore();
  });

  it('disables controls while not ready', () => {
    renderBar({ disabled: true });
    expect(screen.getByRole('button', { name: 'Play (Space)' })).toBeDisabled();
    expect(screen.getByRole('slider', { name: 'Timeline' })).toHaveAttribute('aria-disabled', 'true');
  });
});
