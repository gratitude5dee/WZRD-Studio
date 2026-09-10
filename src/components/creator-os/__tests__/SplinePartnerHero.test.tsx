import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SplinePartnerHero from '@/components/creator-os/SplinePartnerHero';
import { MotionPreferenceProvider } from '@/components/creator-os/MotionPreference';
import { getSplineZoom } from '@/components/creator-os/splineZoom';

const runtimeMocks = vi.hoisted(() => ({ instances: [] as Array<Record<string, ReturnType<typeof vi.fn>>> }));

vi.mock('@splinetool/runtime', () => ({
  Application: vi.fn().mockImplementation(() => {
    const instance = {
      dispose: vi.fn(),
      load: vi.fn().mockResolvedValue(undefined),
      play: vi.fn(),
      setSize: vi.fn(),
      setZoom: vi.fn(),
      stop: vi.fn(),
    };
    runtimeMocks.instances.push(instance);
    return instance;
  }),
}));

describe('SplinePartnerHero', () => {
  it('keeps portrait zoom within the aspect-aware framing range', () => {
    expect(getSplineZoom(390, 617)).toBeGreaterThanOrEqual(1.58);
    expect(getSplineZoom(390, 617)).toBeLessThanOrEqual(1.72);
    expect(getSplineZoom(390, 801)).toBe(1.72);
    expect(getSplineZoom(1280, 720)).toBe(1);
  });

  it('uses the introduction film as the only visible hero content before the Spline scene', () => {
    render(<MotionPreferenceProvider><SplinePartnerHero /></MotionPreferenceProvider>);

    expect(screen.getByRole('heading', { name: 'WZRD.tech Creator OS' })).toBeInTheDocument();
    expect(screen.queryByText('Creative infrastructure for what comes next.')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Explore Air' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'WZRD.tech introduction film' })).toBeInTheDocument();
    expect(document.querySelector('img[src="/creator-os/spline-scene-still.svg"]')).toBeInTheDocument();
  });

  it('reveals the Air action when video playback fails', () => {
    const { unmount } = render(<MotionPreferenceProvider><SplinePartnerHero /></MotionPreferenceProvider>);

    fireEvent.error(document.querySelector('video[aria-label="WZRD.tech introduction film"]')!);

    const exploreAir = screen.getByRole('link', { name: 'Explore Air' });
    const partnerRail = screen.getByRole('region', { name: 'Technology ecosystem' });
    expect(exploreAir).toHaveAttribute('href', 'https://air.wzrd.tech/');
    expect(exploreAir.compareDocumentPosition(partnerRail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Replay introduction' })).not.toBeInTheDocument();
    expect(partnerRail).toBeInTheDocument();
    expect(document.querySelector('[class*="splineBadgeMask"]')).not.toBeInTheDocument();

    await waitFor(() => expect(runtimeMocks.instances).toHaveLength(1));
    expect(runtimeMocks.instances[0].load).toHaveBeenCalled();
    expect(runtimeMocks.instances[0].play).toHaveBeenCalled();
    unmount();
    expect(runtimeMocks.instances[0].stop).toHaveBeenCalled();
    expect(runtimeMocks.instances[0].dispose).toHaveBeenCalled();
  });
});
