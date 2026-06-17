import { fireEvent, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';

import { OpenCutCorePanel } from './OpenCutCorePanel';
import type { OpenCutProjectSnapshot } from './openCutTypes';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
  },
}));

const snapshot: OpenCutProjectSnapshot = {
  id: 'project-1',
  name: 'Demo',
  composition: {
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: '16:9',
    duration: 5000,
    backgroundColor: '#000000',
  },
  durationMs: 5000,
  tracks: [
    {
      id: 'visual-0',
      type: 'video',
      label: 'Video 1',
      index: 0,
      locked: false,
      visible: true,
      elements: [
        {
          id: 'clip-1',
          type: 'video',
          trackId: 'visual-0',
          sourceId: null,
          name: 'Shot',
          sourceUrl: '/shot.mp4',
          startMs: 0,
          durationMs: 5000,
          endMs: 5000,
          trimStartMs: 0,
          trimEndMs: 5000,
          layer: 0,
        },
      ],
    },
  ],
  scenes: [{ id: 'scene-1', name: 'Demo', startMs: 0, durationMs: 5000, endMs: 5000 }],
  bookmarks: [],
  selectedElementIds: ['clip-1'],
  selectedKeyframeIds: [],
};

describe('OpenCutCorePanel', () => {
  it('renders the OpenCut core command surface as grouped left-panel controls', () => {
    render(<OpenCutCorePanel snapshot={snapshot} />);

    expect(screen.getByRole('heading', { name: 'OpenCut Core' })).toBeInTheDocument();
    expect(screen.getByText(/1 tracks/i)).toBeInTheDocument();
    expect(screen.getByText(/1 elements/i)).toBeInTheDocument();
    expect(screen.getByText(/1 scenes/i)).toBeInTheDocument();
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
    expect(screen.getByText('Timing')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Enhance')).toBeInTheDocument();
    expect(screen.getByText('Selection')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /split/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /move left/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /move right/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /trim in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /trim out/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retime 2x/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /duplicate/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /effect/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mask/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bookmark/i })).toBeInTheDocument();
  });

  it('keeps keyframe selections enabled for clipboard and delete while media-only commands stay disabled', () => {
    const keyframeSnapshot = {
      ...snapshot,
      selectedElementIds: [],
      selectedKeyframeIds: ['keyframe-1'],
    };

    render(<OpenCutCorePanel snapshot={keyframeSnapshot} />);

    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /split/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /copy/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /delete/i })).not.toBeDisabled();
  });

  it('preserves command empty-state toast copy', () => {
    render(<OpenCutCorePanel snapshot={snapshot} />);

    fireEvent.click(screen.getByRole('button', { name: /keyframe/i }));

    expect(toast.info).toHaveBeenCalledWith('Select a visual clip or audio track to add a keyframe.');
  });
});
