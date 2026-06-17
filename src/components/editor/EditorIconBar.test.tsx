import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EditorIconBar } from './EditorIconBar';

describe('EditorIconBar', () => {
  it('renders OpenCut Core as the first left-nav tool and emits its tab id', () => {
    const onTabChange = vi.fn();

    render(<EditorIconBar activeTab="assets" onTabChange={onTabChange} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveAttribute('title', 'OpenCut Core');

    fireEvent.click(screen.getByTitle('OpenCut Core'));

    expect(onTabChange).toHaveBeenCalledWith('opencut-core');
  });
});
