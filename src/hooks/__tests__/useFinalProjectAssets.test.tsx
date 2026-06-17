import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useFinalProjectAssets } from '../useFinalProjectAssets';
import { useVideoEditorStore } from '@/store/videoEditorStore';

const mocks = vi.hoisted(() => ({
  desktop: {
    onMediaProgress: vi.fn(() => vi.fn()),
  },
  getDesktopBridge: vi.fn(),
  invoke: vi.fn(),
  runExportRequest: vi.fn(),
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/lib/desktop', () => ({
  getDesktopBridge: mocks.getDesktopBridge,
}));

vi.mock('@/hooks/useExport', () => ({
  runExportRequest: mocks.runExportRequest,
}));

vi.mock('sonner', () => ({
  toast: mocks.toast,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
    },
    from: vi.fn(() => ({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn(async () => ({ data: null, error: null })),
      update: vi.fn().mockReturnThis(),
    })),
    functions: {
      invoke: mocks.invoke,
    },
  },
}));

describe('useFinalProjectAssets', () => {
  beforeEach(() => {
    mocks.getDesktopBridge.mockReturnValue(mocks.desktop);
    mocks.invoke.mockReset();
    mocks.runExportRequest.mockReset();
    mocks.runExportRequest.mockResolvedValue({
      path: '/Users/me/Desktop/final.mp4',
      url: 'file:///Users/me/Desktop/final.mp4',
    });
    mocks.toast.error.mockClear();
    mocks.toast.info.mockClear();
    mocks.toast.success.mockClear();
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
  });

  it('renders the current timeline locally by default instead of invoking create-final-asset', async () => {
    const { result } = renderHook(() => useFinalProjectAssets('project-1'));

    let output: string | null = null;
    await act(async () => {
      output = await result.current.createFinalAsset();
    });

    expect(output).toBe('file:///Users/me/Desktop/final.mp4');
    expect(mocks.invoke).not.toHaveBeenCalledWith('create-final-asset', expect.anything());
    expect(mocks.runExportRequest).toHaveBeenCalledWith(
      { desktop: mocks.desktop },
      expect.objectContaining({
        projectId: 'project-1',
        clips: expect.arrayContaining([expect.objectContaining({ id: 'clip-1' })]),
      }),
      { format: 'mp4', quality: 'high' },
    );
  });

  it('keeps editor final render local even when a cloud provider override is supplied', async () => {
    const { result } = renderHook(() => useFinalProjectAssets('project-1'));

    let output: string | null = null;
    await act(async () => {
      output = await result.current.createFinalAsset({ provider: 'editframe', format: 'webm', quality: 'medium' });
    });

    expect(output).toBe('file:///Users/me/Desktop/final.mp4');
    expect(mocks.invoke).not.toHaveBeenCalledWith('create-final-asset', expect.anything());
    expect(mocks.runExportRequest).toHaveBeenCalledWith(
      { desktop: mocks.desktop },
      expect.objectContaining({ projectId: 'project-1' }),
      { format: 'webm', quality: 'medium' },
    );
  });
});
