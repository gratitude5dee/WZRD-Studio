import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SplinePartnerHero from '@/components/creator-os/SplinePartnerHero';

vi.mock('@splinetool/react-spline/next', () => ({ default: () => <div data-testid="spline-scene" /> }));

describe('SplinePartnerHero', () => {
  it('uses the introduction film as the only visible hero content before the Spline scene', () => {
    render(<SplinePartnerHero />);

    expect(screen.getByRole('heading', { name: 'WZRD.tech Creator OS' })).toBeInTheDocument();
    expect(screen.queryByText('Creative infrastructure for what comes next.')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Explore Creator OS/ })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'WZRD.tech introduction film' })).toBeInTheDocument();
  });
});
