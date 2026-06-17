import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FinalExportPanel } from './FinalExportPanel';
import { useVideoEditorStore } from '@/store/videoEditorStore';

const hookMocks = vi.hoisted(() => ({
  createFinalAsset: vi.fn(async () => '/Users/me/Desktop/final.mp4'),
  loadAssets: vi.fn(async () => undefined),
  removeAsset: vi.fn(async () => true),
  saveTimelineToFinal: vi.fn(async () => true),
}));

vi.mock('@/hooks/useFinalProjectAssets', () => ({
  useFinalProjectAssets: () => ({
    assets: [],
    isLoading: false,
    isSaving: false,
    isExporting: false,
    exportProgress: 0,
    loadAssets: hookMocks.loadAssets,
    saveTimelineToFinal: hookMocks.saveTimelineToFinal,
    removeAsset: hookMocks.removeAsset,
    createFinalAsset: hookMocks.createFinalAsset,
  }),
}));

vi.mock('@/components/ip-vault/FinalizeAssetDialog', () => ({
  FinalizeAssetDialog: () => null,
}));

const renderPanel = () =>
  render(
    <MemoryRouter initialEntries={['/projects/project-1/editor']}>
      <Routes>
        <Route path="/projects/:projectId/editor" element={<FinalExportPanel />} />
      </Routes>
    </MemoryRouter>,
  );

describe('FinalExportPanel', () => {
  beforeEach(() => {
    hookMocks.createFinalAsset.mockClear();
    hookMocks.loadAssets.mockClear();
    hookMocks.removeAsset.mockClear();
    hookMocks.saveTimelineToFinal.mockClear();
    useVideoEditorStore.getState().reset();
    useVideoEditorStore.setState({
      clips: [
        {
          id: 'clip-1',
          type: 'video',
          name: 'Local source',
          url: 'file:///Users/me/source.mp4',
          startTime: 0,
          duration: 5_000,
          endTime: 5_000,
          layer: 0,
          transforms: {
            position: { x: 0, y: 0 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            opacity: 1,
          },
        },
      ],
      audioTracks: [],
    });
    vi.stubGlobal('open', vi.fn());
    vi.stubGlobal('scrollTo', vi.fn());
  });

  it('allows local timeline rendering without requiring saved final assets', async () => {
    renderPanel();

    fireEvent.click(screen.getByText('Local Export'));
    const renderButton = await screen.findByRole('button', { name: /render local video/i });

    expect(renderButton).toBeEnabled();
    fireEvent.click(renderButton);

    await waitFor(() => expect(hookMocks.createFinalAsset).toHaveBeenCalledWith());
  });
});
