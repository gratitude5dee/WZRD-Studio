import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EditorPreviewStage } from './EditorPreviewStage';
import type { Clip, CompositionSettings } from '@/store/videoEditorStore';

const composition: CompositionSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  aspectRatio: '16:9',
  duration: 5_000,
  backgroundColor: '#000000',
};

const videoClip: Clip = {
  id: 'clip-1',
  type: 'video',
  name: 'Proxy shot',
  url: 'https://cdn.example.com/source.mp4',
  playbackUrl: 'wzrd://media/?file=proxy',
  proxyUrl: 'wzrd://media/?file=proxy',
  startTime: 0,
  duration: 5_000,
  endTime: 5_000,
  trackIndex: 0,
  layer: 0,
  transforms: {
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    opacity: 1,
  },
};

describe('EditorPreviewStage', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  it('renders active video clips from the prepared playback url', () => {
    render(
      <EditorPreviewStage
        clips={[videoClip]}
        audioTracks={[]}
        composition={composition}
        currentTimeMs={1_000}
        isPlaying
        volume={0.75}
        selectedClipIds={['clip-1']}
        lockedTrackIds={new Set()}
        onSelectClip={vi.fn()}
      />,
    );

    const video = screen.getByTestId('editor-preview-video-clip-1');
    expect(video).toHaveAttribute('src', 'wzrd://media/?file=proxy');
    expect(video).toHaveStyle({ opacity: '1' });
    expect(screen.queryByText(/unable to preview/i)).not.toBeInTheDocument();
  });

  it('shows an actionable preview error instead of a silent black frame', () => {
    render(
      <EditorPreviewStage
        clips={[videoClip]}
        audioTracks={[]}
        composition={composition}
        currentTimeMs={1_000}
        isPlaying={false}
        volume={1}
        selectedClipIds={[]}
        lockedTrackIds={new Set()}
        onSelectClip={vi.fn()}
      />,
    );

    fireEvent.error(screen.getByTestId('editor-preview-video-clip-1'));

    expect(screen.getByText('Unable to preview Proxy shot')).toBeInTheDocument();
    expect(screen.getByText(/Use a local file or regenerate the preview proxy/i)).toBeInTheDocument();
  });
});
