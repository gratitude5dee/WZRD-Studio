import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import VideoEditorMain from './VideoEditorMain';
import { useVideoEditorStore } from '@/store/videoEditorStore';

vi.mock('@/hooks/useComputeFlowSync', () => ({
  useComputeFlowSync: vi.fn(),
}));

vi.mock('@/hooks/useRealtimeTimelineSync', () => ({
  useRealtimeTimelineSync: vi.fn(),
}));

vi.mock('@/hooks/useEditorShortcuts', () => ({
  useEditorShortcuts: vi.fn(),
}));

vi.mock('@/hooks/editor/usePropertySync', () => ({
  usePropertySync: vi.fn(),
}));

vi.mock('@/services/videoEditorService', () => ({
  videoEditorService: {
    saveTimelineClip: vi.fn(),
    deleteTimelineClip: vi.fn(),
    saveAudioTrack: vi.fn(),
    deleteAudioTrack: vi.fn(),
    saveKeyframe: vi.fn(),
    deleteKeyframe: vi.fn(),
    updateComposition: vi.fn(),
    getTimelineClips: vi.fn(async () => []),
    getAudioTracks: vi.fn(async () => []),
    getComposition: vi.fn(async () => undefined),
    getKeyframes: vi.fn(async () => []),
    getMediaItems: vi.fn(async () => []),
  },
}));

vi.mock('./EditorHeader', () => ({
  EditorHeader: () => <div data-testid="editor-header" />,
}));

vi.mock('./EditframeWorkbenchCanvas', () => ({
  EditframeWorkbenchCanvas: () => <div data-testid="editor-canvas" />,
}));

vi.mock('./properties/PropertiesPanel', () => ({
  default: () => <aside data-testid="editor-properties" />,
}));

vi.mock('./tabs/ProjectAssetsTab', () => ({
  ProjectAssetsTab: () => <div>Project assets panel</div>,
}));

describe('VideoEditorMain OpenCut Core placement', () => {
  beforeEach(() => {
    const store = useVideoEditorStore.getState();
    store.reset();
    store.setProjectId('project-1');
    store.setProjectName('Demo Project');
  });

  it('removes the top OpenCut command bar and exposes OpenCut Core through the left nav', () => {
    render(
      <MemoryRouter>
        <VideoEditorMain />
      </MemoryRouter>
    );

    expect(screen.queryByText('OpenCut Core')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('OpenCut Core'));

    expect(screen.getByRole('heading', { name: 'OpenCut Core' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bookmark/i })).toBeInTheDocument();
  });
});
