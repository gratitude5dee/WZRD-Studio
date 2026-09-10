import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SplinePartnerHero from '@/components/creator-os/SplinePartnerHero';
import { MotionPreferenceProvider } from '@/components/creator-os/MotionPreference';
import { getSplineZoom } from '@/components/creator-os/splineZoom';

const runtimeMocks = vi.hoisted(() => ({ instances: [] as Array<Record<string, ReturnType<typeof vi.fn>>> }));
const iosSafariMock = vi.hoisted(() => vi.fn<() => boolean | null>());

vi.mock('@/components/creator-os/iosSafari', () => ({
  useIOSSafari: iosSafariMock,
}));

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
  beforeEach(() => {
    iosSafariMock.mockReturnValue(false);
    runtimeMocks.instances.length = 0;
  });

  it('keeps desktop and portrait zoom within the aspect-aware framing range', () => {
    expect(getSplineZoom(390, 617)).toBeGreaterThanOrEqual(1.58);
    expect(getSplineZoom(390, 617)).toBeLessThanOrEqual(1.72);
    expect(getSplineZoom(390, 801)).toBe(1.72);
    expect(getSplineZoom(844, 390)).toBe(1);
    expect(getSplineZoom(1280, 720)).toBeCloseTo(1.29, 2);
    expect(getSplineZoom(1920, 900)).toBe(1.32);
  });

  it('uses the introduction film as the only visible hero content before the Spline scene', async () => {
    render(<MotionPreferenceProvider><SplinePartnerHero /></MotionPreferenceProvider>);

    expect(screen.getByRole('heading', { name: 'WZRD.tech Creator OS' })).toBeInTheDocument();
    expect(screen.queryByText('Creative infrastructure for what comes next.')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Explore Air' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('region', { name: 'WZRD.tech introduction film' })).toBeInTheDocument());
    expect(document.querySelector('img[src="/creator-os/wzrd-ios-hero-landscape.webp"]')).toBeInTheDocument();
  });

  it('renders a complete static hero on iOS Safari without starting video or Spline', () => {
    iosSafariMock.mockReturnValue(true);
    render(<MotionPreferenceProvider><SplinePartnerHero /></MotionPreferenceProvider>);

    expect(screen.getByRole('link', { name: 'Explore Air' })).toHaveAttribute('href', 'https://air.wzrd.tech/');
    expect(screen.getByRole('region', { name: 'Technology ecosystem' })).toBeInTheDocument();
    expect(document.querySelector('img[src="/creator-os/wzrd-ios-hero-landscape.webp"]')).toBeInTheDocument();
    expect(document.querySelector('video')).not.toBeInTheDocument();
    expect(document.querySelector('canvas')).not.toBeInTheDocument();
    expect(runtimeMocks.instances).toHaveLength(0);
  });

  it('reveals the Air action when video playback fails', async () => {
    const { unmount } = render(<MotionPreferenceProvider><SplinePartnerHero /></MotionPreferenceProvider>);

    await waitFor(() => expect(document.querySelector('video[aria-label="WZRD.tech introduction film"]')).toBeInTheDocument());
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
