import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import IntroVideo from '@/components/creator-os/IntroVideo';

describe('IntroVideo', () => {
  const play = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const pause = vi.fn();

  beforeEach(() => {
    window.sessionStorage.clear();
    Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: play });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: pause });
  });

  afterEach(() => {
    play.mockClear();
    pause.mockClear();
  });

  it('attempts sound-on autoplay and provides shiny mute and skip controls', async () => {
    render(<IntroVideo />);

    const video = screen.getByRole('dialog', { name: 'WZRD.tech introduction' }).querySelector('video');
    expect(video).toHaveAttribute('src', '/creator-os/assets/universe-teeming-intro.mp4');
    expect(video).toHaveAttribute('autoplay');
    expect(screen.queryByRole('button', { name: 'Enter with sound' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mute' })).toBeInTheDocument();

    await waitFor(() => expect(play).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Skip intro' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'WZRD.tech introduction' })).not.toBeInTheDocument());
    expect(window.sessionStorage.getItem('wzrd:intro-dismissed')).toBe('true');
  });
});
