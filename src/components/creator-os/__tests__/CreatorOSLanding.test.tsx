import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import CreatorOSLanding from '@/components/creator-os/CreatorOSLanding';

const canonicalSectionIds = ['creator-os', 'air', 'studio', 'zap', 'earth', 'coming-soon', 'enter'];

describe('CreatorOSLanding', () => {
  it('renders the cloud narrative natively, without the legacy iframe', () => {
    const { container } = render(<CreatorOSLanding />);

    expect(container.querySelector('iframe')).not.toBeInTheDocument();
    expect(screen.getByText('Creative', { exact: true })).toBeInTheDocument();
    expect(
      screen.getByText('A single operating system for the artists, studios, and intelligent tools shaping what comes next.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Your unified creative infrastructure to take action across models, applications, and integrations.')).toBeInTheDocument();
    expect(screen.queryByText('ALT +∞')).not.toBeInTheDocument();
  });

  it('keeps the canonical section order', () => {
    const { container } = render(<CreatorOSLanding />);

    const ids = Array.from(container.querySelectorAll('section[id]')).map((section) => section.id);
    expect(ids).toEqual(canonicalSectionIds);
  });

  it('keeps the specified destination map and opens the Air CTA in this tab', () => {
    render(<CreatorOSLanding />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle navigation' }));

    expect(screen.getByRole('link', { name: 'air' })).toHaveAttribute('href', 'https://air.wzrd.tech');
    expect(screen.getByRole('link', { name: 'studio' })).toHaveAttribute('href', '/about');
    expect(screen.getByRole('link', { name: 'enter studio' })).toHaveAttribute('href', 'https://studio.wzrd.tech');
    expect(screen.getByRole('link', { name: 'zap' })).toHaveAttribute('href', 'https://zap.wzrd.tech');
    expect(screen.getByRole('link', { name: /Make the next signal/ })).toHaveAttribute('href', 'https://studio.wzrd.tech');

    const airCta = screen.getByRole('link', { name: /Access Air via iMessage/ });
    expect(airCta).toHaveAttribute('href', 'https://air.wzrd.tech');
    expect(airCta).not.toHaveAttribute('target');
  });

  it('switches the atmosphere between full motion and off', () => {
    const { container } = render(<CreatorOSLanding />);

    const root = container.firstElementChild as HTMLElement;
    const toggle = screen.getByRole('button', { name: 'Toggle motion' });
    expect(toggle).toHaveTextContent('on');
    expect(root.dataset.fxMode).toBe('full');

    fireEvent.click(toggle);

    expect(toggle).toHaveTextContent('off');
    expect(root.dataset.fxMode).toBe('off');
  });

  it('keeps a still hero screenshot once motion is off', () => {
    const { container } = render(<CreatorOSLanding />);

    expect(container.querySelector('img[src="/creator-os/devices-trimmed.png"]')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle motion' }));

    expect(container.querySelector('img[src="/creator-os/devices-trimmed.png"]')).toBeInTheDocument();
  });

  it('closes the navigation overlay on Escape and returns focus to the hamburger', async () => {
    render(<CreatorOSLanding />);

    const hamburger = screen.getByRole('button', { name: 'Toggle navigation' });
    fireEvent.click(hamburger);

    const dialog = screen.getByRole('dialog', { name: 'Creator OS chapters' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await waitFor(() => expect(screen.getByRole('link', { name: 'air' })).toHaveFocus());

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(dialog).not.toHaveAttribute('aria-modal');
    expect(hamburger).toHaveFocus();
  });

  it('expands the Fire and Water disclosure cards on click and keyboard', () => {
    render(<CreatorOSLanding />);

    const card = screen.getByRole('button', { name: 'The DATA Foundation' });
    expect(card).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(card);
    expect(card).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(card, { key: 'Enter' });
    expect(card).toHaveAttribute('aria-expanded', 'false');
  });
});
