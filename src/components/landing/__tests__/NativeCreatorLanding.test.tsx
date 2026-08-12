import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import CreatorOSRebuild from '@/components/landing/CreatorOSRebuild';

describe('CreatorOSRebuild', () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('renders the Creator OS hero without the legacy iframe or intro gate', () => {
    const { container } = render(<CreatorOSRebuild />);

    expect(screen.getByRole('heading', { level: 1, name: /wzrd.tech creator os/i })).toBeInTheDocument();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
    expect(screen.getByText('Creative', { exact: true })).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /make the next signal/i })).toHaveAttribute('href', '/login?next=%2Fkanvas');
  });

  it('opens and closes the focus-managed Creator OS menu', () => {
    render(<CreatorOSRebuild />);

    const menu = screen.getByRole('button', { name: /open navigation/i });
    fireEvent.click(menu);
    expect(screen.getByRole('dialog', { name: /creator os navigation/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'enter studio' })).toHaveAttribute('href', '/login?next=%2Fkanvas');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /creator os navigation/i })).not.toBeInTheDocument();
  });

  it('keeps the Earth wheel operable with arrow keys', () => {
    const { container } = render(<CreatorOSRebuild />);
    const wheel = screen.getByRole('region', { name: /creative universe/i });
    const firstRole = container.querySelector('[class*="earthRole"]') as HTMLElement;
    const before = firstRole.style.getPropertyValue('--earth-angle');

    fireEvent.keyDown(wheel, { key: 'ArrowRight' });

    expect(firstRole.style.getPropertyValue('--earth-angle')).not.toBe(before);
  });

  it('persists the three-state motion setting for the session', () => {
    render(<CreatorOSRebuild />);

    const toggle = screen.getByRole('button', { name: /atmosphere: motion/i });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /atmosphere: calm/i })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: /atmosphere: calm/i }));

    expect(screen.getByRole('button', { name: /atmosphere: still/i })).toHaveAttribute('aria-pressed', 'false');
    expect(window.sessionStorage.getItem('wzrd:creator-os-motion')).toBe('off');
  });

  it('restores the motion preference after mount without changing semantic content', async () => {
    window.sessionStorage.setItem('wzrd:creator-os-motion', 'off');
    render(<CreatorOSRebuild />);

    await waitFor(() => expect(screen.getByRole('button', { name: /atmosphere: still/i })).toHaveAttribute('aria-pressed', 'false'));
    expect(screen.getByRole('heading', { level: 1, name: /wzrd.tech creator os/i })).toBeInTheDocument();
  });
});
