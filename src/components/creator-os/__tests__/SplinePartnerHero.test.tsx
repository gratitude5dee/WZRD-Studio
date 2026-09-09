import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SplinePartnerHero from '@/components/creator-os/SplinePartnerHero';

vi.mock('@splinetool/react-spline/next', () => ({ default: () => <div data-testid="spline-scene" /> }));

describe('SplinePartnerHero', () => {
  it('makes the purpose and primary actions available before the optional introduction film', () => {
    render(<SplinePartnerHero />);

    expect(screen.getByRole('heading', { name: 'Creative infrastructure for what comes next.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Explore Creator OS/ })).toHaveAttribute('href', '#creator-os');
    expect(screen.getByRole('link', { name: /Enter Studio/ })).toHaveAttribute('href', 'https://studio.wzrd.tech');
    expect(screen.getByRole('region', { name: 'WZRD.tech introduction film' })).toBeInTheDocument();
  });
});
