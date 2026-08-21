import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SplinePartnerHero from '@/components/creator-os/SplinePartnerHero';

vi.mock('@splinetool/react-spline/next', () => ({
  default: () => <div data-testid="spline-scene" />,
}));

describe('SplinePartnerHero', () => {
  it('uses the Spline scene as a visual arrival without duplicate hero copy', () => {
    render(<SplinePartnerHero />);

    expect(screen.getByRole('heading', { level: 1, name: 'WZRD.tech' })).toBeInTheDocument();
    expect(screen.getByTestId('spline-scene')).toBeInTheDocument();
    expect(screen.getByText('Built across the AI ecosystem')).toBeInTheDocument();
    expect(screen.getByText('Anthropic')).toBeInTheDocument();
    expect(screen.queryByText('Creative infrastructure for the next signal.')).not.toBeInTheDocument();
    expect(
      screen.queryByText('A single operating system for the artists, studios, and intelligent tools shaping what comes next.'),
    ).not.toBeInTheDocument();
  });
});
