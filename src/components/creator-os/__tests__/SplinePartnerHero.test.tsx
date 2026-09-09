import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SplinePartnerHero from '@/components/creator-os/SplinePartnerHero';
import { MotionPreferenceProvider } from '@/components/creator-os/MotionPreference';

vi.mock('@splinetool/react-spline/next', () => ({ default: () => <div data-testid="spline-scene" /> }));

describe('SplinePartnerHero', () => {
  it('uses the introduction film as the only visible hero content before the Spline scene', () => {
    render(<MotionPreferenceProvider><SplinePartnerHero /></MotionPreferenceProvider>);

    expect(screen.getByRole('heading', { name: 'WZRD.tech Creator OS' })).toBeInTheDocument();
    expect(screen.queryByText('Creative infrastructure for what comes next.')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Explore Air' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'WZRD.tech introduction film' })).toBeInTheDocument();
  });

  it('reveals the Air action when video playback fails', () => {
    render(<MotionPreferenceProvider><SplinePartnerHero /></MotionPreferenceProvider>);

    fireEvent.error(document.querySelector('video[aria-label="WZRD.tech introduction film"]')!);

    expect(screen.getByRole('link', { name: 'Explore Air' })).toHaveAttribute('href', 'https://air.wzrd.tech/');
    expect(screen.getByRole('button', { name: 'Replay introduction' })).toBeInTheDocument();
  });
});
