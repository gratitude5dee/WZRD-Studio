import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EditorMediaPanel } from '../EditorMediaPanel';
import type { OpenCutProjectSnapshot } from '@/features/editor-opencut/openCutTypes';

const openCutSnapshot: OpenCutProjectSnapshot = {
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

describe('EditorMediaPanel elements', () => {
  it('emits a stable graphic element payload when a shape is selected', () => {
    const addToTimeline = vi.fn();

    render(<EditorMediaPanel activeTab="elements" onAddToTimeline={addToTimeline} />);

    fireEvent.click(screen.getByRole('button', { name: /rectangle/i }));

    expect(addToTimeline).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'element',
        elementType: 'shape',
        name: 'Rectangle',
        shape: 'rectangle',
        color: '#FF6B4A',
      }),
    );
  });

  it('renders OpenCut Core controls inside the existing left media panel', () => {
    render(<EditorMediaPanel activeTab="opencut-core" openCutSnapshot={openCutSnapshot} />);

    expect(screen.getByRole('heading', { name: 'OpenCut Core' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /split/i })).toBeInTheDocument();
    expect(screen.getByText(/1 tracks/i)).toBeInTheDocument();
  });
});
