import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import IntroVideo from '@/components/creator-os/IntroVideo';

describe('IntroVideo', () => {
  const play = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const pause = vi.fn();
  const getVideo = () => document.querySelector<HTMLVideoElement>('video[aria-label="WZRD.tech introduction film"]')!;

  beforeEach(() => {
    Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: play });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({
        addEventListener: vi.fn(),
        matches: false,
        removeEventListener: vi.fn(),
      }),
    });
  });

  afterEach(() => {
    play.mockClear();
    pause.mockClear();
  });

  it('keeps the introduction as a non-modal hero film with an inline pause control', async () => {
    render(<IntroVideo />);

    const film = screen.getByRole('region', { name: 'WZRD.tech introduction film' });
    const video = getVideo();
    expect(video).toHaveAttribute('src', '/creator-os/assets/universe-teeming-intro.mp4');
    expect(video).toHaveAttribute('autoplay');
    expect(video).toHaveAttribute('muted');
    expect(screen.queryByRole('dialog', { name: /introduction/i })).not.toBeInTheDocument();
    expect(film).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause introduction' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Pause introduction' }));
    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Play introduction' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Play introduction' }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
  });

  it('dissolves into the Spline hero when the film cannot load', async () => {
    vi.useFakeTimers();
    render(<IntroVideo />);

    fireEvent.error(getVideo());

    expect(screen.getByRole('region', { name: 'WZRD.tech introduction film' })).toHaveAttribute('data-exiting', 'true');
    expect(pause).toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(700));
    expect(screen.queryByRole('region', { name: 'WZRD.tech introduction film' })).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('shows the static Spline hero immediately when the visitor asks for reduced motion', async () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      addEventListener: vi.fn(),
      matches: true,
      removeEventListener: vi.fn(),
    } as MediaQueryList);

    render(<IntroVideo />);

    await waitFor(() => expect(screen.queryByRole('region', { name: 'WZRD.tech introduction film' })).not.toBeInTheDocument());
  });
});
