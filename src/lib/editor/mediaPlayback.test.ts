import { describe, expect, it, vi } from 'vitest';

import { prepareEditorMediaForPlayback } from './mediaPlayback';
import type { LibraryMediaItem } from '@/store/videoEditorStore';
import type { WzrdDesktopBridge } from '@/lib/desktop';

const baseItem: LibraryMediaItem = {
  id: 'media-1',
  projectId: 'project-1',
  mediaType: 'video',
  name: 'Shot',
  url: 'https://cdn.example.com/shot.mp4',
  status: 'completed',
};

describe('prepareEditorMediaForPlayback', () => {
  it('caches remote desktop media and prefers a local preview proxy for playback', async () => {
    const desktop = {
      isDesktop: true,
      platform: 'darwin',
      cacheRemoteMedia: vi.fn(async () => ({
        name: 'shot.mp4',
        path: '/Users/me/Library/Application Support/WZRD/media-cache/shot.mp4',
        mediaUrl: 'wzrd://media/?file=source',
      })),
      renderPreviewProxy: vi.fn(async () => ({
        outputPath: '/Users/me/Library/Application Support/WZRD/media-cache/shot.mp4.preview.mp4',
      })),
      resolveMediaFileUrl: vi.fn(async ({ filePath }) => `wzrd://media/?file=${encodeURIComponent(filePath)}`),
    } as Partial<WzrdDesktopBridge> as WzrdDesktopBridge;

    const prepared = await prepareEditorMediaForPlayback(baseItem, {
      desktop,
      operationId: 'prepare-media-1',
    });

    expect(desktop.cacheRemoteMedia).toHaveBeenCalledWith({
      operationId: 'prepare-media-1-cache',
      url: baseItem.url,
      name: baseItem.name,
    });
    expect(desktop.renderPreviewProxy).toHaveBeenCalledWith({
      operationId: 'prepare-media-1-proxy',
      sourcePath: '/Users/me/Library/Application Support/WZRD/media-cache/shot.mp4',
      outputPath: '/Users/me/Library/Application Support/WZRD/media-cache/shot.mp4.preview.mp4',
      maxWidth: 1280,
      maxHeight: 720,
    });
    expect(prepared).toMatchObject({
      sourcePath: '/Users/me/Library/Application Support/WZRD/media-cache/shot.mp4',
      playbackUrl: 'wzrd://media/?file=%2FUsers%2Fme%2FLibrary%2FApplication%20Support%2FWZRD%2Fmedia-cache%2Fshot.mp4.preview.mp4',
      proxyPath: '/Users/me/Library/Application Support/WZRD/media-cache/shot.mp4.preview.mp4',
      proxyUrl: 'wzrd://media/?file=%2FUsers%2Fme%2FLibrary%2FApplication%20Support%2FWZRD%2Fmedia-cache%2Fshot.mp4.preview.mp4',
      mediaStatus: 'ready',
    });
  });

  it('falls back to source media when preview proxy generation fails', async () => {
    const desktop = {
      isDesktop: true,
      platform: 'darwin',
      cacheRemoteMedia: vi.fn(async () => ({
        name: 'shot.mp4',
        path: '/Users/me/cache/shot.mp4',
        mediaUrl: 'wzrd://media/?file=source',
      })),
      renderPreviewProxy: vi.fn(async () => {
        throw new Error('ffmpeg proxy failed');
      }),
    } as Partial<WzrdDesktopBridge> as WzrdDesktopBridge;

    const prepared = await prepareEditorMediaForPlayback(baseItem, {
      desktop,
      operationId: 'prepare-media-2',
    });

    expect(prepared).toMatchObject({
      sourcePath: '/Users/me/cache/shot.mp4',
      playbackUrl: 'wzrd://media/?file=source',
      mediaStatus: 'ready',
      mediaError: 'Preview proxy failed; using source media.',
    });
    expect(prepared.proxyUrl).toBeUndefined();
  });

  it('marks remote browser media as needing desktop cache when no bridge is available', async () => {
    const prepared = await prepareEditorMediaForPlayback(baseItem, {
      desktop: null,
      operationId: 'prepare-media-3',
    });

    expect(prepared).toMatchObject({
      playbackUrl: baseItem.url,
      mediaStatus: 'warning',
      mediaError: 'Remote media may not preview or export until opened in the desktop app.',
    });
    expect(prepared.sourcePath).toBeUndefined();
  });
});
