import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import NativeCreatorLanding from '@/components/landing/NativeCreatorLanding';

describe('NativeCreatorLanding', () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('renders semantic hero content without the legacy iframe or intro gate', () => {
    const { container } = render(<NativeCreatorLanding />);

    expect(screen.getByRole('heading', { level: 1, name: /build the world around the record/i })).toBeInTheDocument();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
    expect(container.querySelector('video')).not.toBeInTheDocument();

    const studioLinks = screen.getAllByRole('link', { name: /enter studio/i });
    expect(studioLinks[0]).toHaveAttribute('href', '/login?next=%2Fkanvas');
  });

  it('supports keyboard navigation through the product tour', () => {
    render(<NativeCreatorLanding />);

    const firstTab = screen.getByRole('tab', { name: /anchor the world/i });
    const secondTab = screen.getByRole('tab', { name: /branch the treatment/i });
    expect(firstTab).toHaveAttribute('aria-selected', 'true');

    firstTab.focus();
    fireEvent.keyDown(firstTab, { key: 'ArrowRight' });

    expect(secondTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'tour-tab-treatment');
  });

  it('shows a useful fallback when a product capture cannot load', () => {
    render(<NativeCreatorLanding />);

    fireEvent.error(screen.getByAltText(/settings and cast workspace/i));

    expect(screen.getByRole('status')).toHaveTextContent('Preview unavailable');
    expect(screen.getByRole('status')).toHaveTextContent('/kanvas?studio=cinema');
  });

  it('persists the visible motion control for the session', () => {
    render(<NativeCreatorLanding />);

    const toggle = screen.getByRole('button', { name: /motion on/i });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: /motion off/i })).toHaveAttribute('aria-pressed', 'false');
    expect(window.sessionStorage.getItem('wzrd:landing-motion')).toBe('off');
  });

  it('restores the motion preference before the first interactive paint', () => {
    window.sessionStorage.setItem('wzrd:landing-motion', 'off');
    render(<NativeCreatorLanding />);

    expect(screen.getByRole('button', { name: /motion off/i })).toHaveAttribute('aria-pressed', 'false');
  });
});
