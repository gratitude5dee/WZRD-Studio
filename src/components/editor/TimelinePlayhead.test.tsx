import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import TimelinePlayhead from './TimelinePlayhead';

describe('TimelinePlayhead', () => {
  it('positions and labels the playhead from canonical millisecond time', () => {
    render(
      <div>
        <TimelinePlayhead
          currentTimeMs={1_500}
          durationMs={5_000}
          pixelsPerSecond={100}
          scrollOffset={25}
          onSeekMs={vi.fn()}
        />
      </div>,
    );

    const handle = screen.getByTitle('00:01.50');
    expect(handle.parentElement).toHaveStyle({ left: '125px' });
    expect(screen.getByText('00:01.50')).toBeInTheDocument();
  });
});
