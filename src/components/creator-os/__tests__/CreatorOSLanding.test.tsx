import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import CreatorOSLanding from '@/components/creator-os/CreatorOSLanding';

const canonicalSectionIds = ['top', 'studio', 'zap', 'earth', 'air', 'coming-soon', 'enter'];

describe('CreatorOSLanding', () => {
  it('renders the canonical hero natively, without the legacy iframe', () => {
    const { container } = render(<CreatorOSLanding />);

    expect(screen.getByRole('heading', { level: 1, name: 'WZRD.tech' })).toBeInTheDocument();
    expect(container.querySelector('iframe')).not.toBeInTheDocument();
    expect(screen.getByText('A creator operating system')).toBeInTheDocument();
    expect(screen.getByText('Creative', { exact: true })).toBeInTheDocument();
  });

  it('keeps the canonical section order', () => {
    const { container } = render(<CreatorOSLanding />);

    const ids = Array.from(container.querySelectorAll('section[id]')).map((section) => section.id);
    expect(ids).toEqual(canonicalSectionIds);
  });

  it('routes studio entry in-app and zap to its own subdomain', () => {
    render(<CreatorOSLanding />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle navigation' }));

    expect(screen.getByRole('link', { name: 'enter studio' })).toHaveAttribute('href', '/login?next=%2Fkanvas');
    expect(screen.getByRole('link', { name: 'zap' })).toHaveAttribute('href', 'https://zap.wzrd.tech');
    expect(screen.getByRole('link', { name: /Make the next signal/ })).toHaveAttribute('href', '/login?next=%2Fkanvas');
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
