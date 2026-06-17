import { getDesktopBridge, type WzrdDesktopBridge } from '@/lib/desktop';
import type { LibraryMediaItem } from '@/store/videoEditorStore';

interface PrepareEditorMediaOptions {
  desktop?: Pick<WzrdDesktopBridge, 'cacheRemoteMedia' | 'resolveMediaFileUrl' | 'renderPreviewProxy'> | null;
  operationId: string;
}

const REMOTE_URL_PATTERN = /^https?:\/\//i;
const DESKTOP_MEDIA_URL_PATTERN = /^wzrd:\/\//i;
const FILE_URL_PATTERN = /^file:\/\//i;
const ABSOLUTE_PATH_PATTERN = /^(\/|[A-Za-z]:[\\/])/;

function isRemoteUrl(value: string) {
  return REMOTE_URL_PATTERN.test(value);
}

function isLocalFileReference(value: string) {
  return FILE_URL_PATTERN.test(value) || ABSOLUTE_PATH_PATTERN.test(value);
}

function fileUrlToPath(value: string) {
  if (!FILE_URL_PATTERN.test(value)) return value;
  try {
    return decodeURIComponent(new URL(value).pathname);
  } catch {
    return value;
  }
}

function previewProxyPath(sourcePath: string) {
  return `${sourcePath}.preview.mp4`;
}

async function resolvePlaybackUrl(
  desktop: PrepareEditorMediaOptions['desktop'],
  sourcePath: string,
  fallbackUrl: string,
) {
  if (!desktop?.resolveMediaFileUrl) return fallbackUrl;
  try {
    return await desktop.resolveMediaFileUrl({ filePath: sourcePath });
  } catch {
    return fallbackUrl;
  }
}

export async function prepareEditorMediaForPlayback(
  item: LibraryMediaItem,
  options: PrepareEditorMediaOptions,
): Promise<LibraryMediaItem> {
  const url = item.url ?? '';
  const desktop = options.desktop === undefined ? getDesktopBridge() : options.desktop;

  if (!url) {
    return {
      ...item,
      mediaStatus: 'failed',
      mediaError: 'This media item is missing a playable URL.',
    };
  }

  if (DESKTOP_MEDIA_URL_PATTERN.test(url)) {
    return {
      ...item,
      playbackUrl: item.playbackUrl ?? url,
      mediaStatus: item.mediaStatus ?? 'ready',
    };
  }

  if (isRemoteUrl(url)) {
    if (!desktop?.cacheRemoteMedia) {
      return {
        ...item,
        playbackUrl: url,
        mediaStatus: 'warning',
        mediaError: 'Remote media may not preview or export until opened in the desktop app.',
      };
    }

    const cached = await desktop.cacheRemoteMedia({
      operationId: `${options.operationId}-cache`,
      url,
      name: item.name,
    });
    const sourcePath = cached.path;
    const sourcePlaybackUrl = cached.mediaUrl ?? await resolvePlaybackUrl(desktop, sourcePath, url);

    if (item.mediaType !== 'video' || !desktop.renderPreviewProxy) {
      return {
        ...item,
        sourcePath,
        playbackUrl: sourcePlaybackUrl,
        mediaStatus: 'ready',
      };
    }

    try {
      const proxyPath = previewProxyPath(sourcePath);
      const proxy = await desktop.renderPreviewProxy({
        operationId: `${options.operationId}-proxy`,
        sourcePath,
        outputPath: proxyPath,
        maxWidth: 1280,
        maxHeight: 720,
      });
      const proxyUrl = await resolvePlaybackUrl(desktop, proxy.outputPath, proxy.outputPath);
      return {
        ...item,
        sourcePath,
        playbackUrl: proxyUrl,
        proxyPath: proxy.outputPath,
        proxyUrl,
        mediaStatus: 'ready',
      };
    } catch {
      return {
        ...item,
        sourcePath,
        playbackUrl: sourcePlaybackUrl,
        mediaStatus: 'ready',
        mediaError: 'Preview proxy failed; using source media.',
      };
    }
  }

  if (isLocalFileReference(url)) {
    const sourcePath = fileUrlToPath(url);
    const playbackUrl = await resolvePlaybackUrl(desktop, sourcePath, url);
    if (item.mediaType === 'video' && desktop?.renderPreviewProxy) {
      try {
        const proxyPath = previewProxyPath(sourcePath);
        const proxy = await desktop.renderPreviewProxy({
          operationId: `${options.operationId}-proxy`,
          sourcePath,
          outputPath: proxyPath,
          maxWidth: 1280,
          maxHeight: 720,
        });
        const proxyUrl = await resolvePlaybackUrl(desktop, proxy.outputPath, proxy.outputPath);
        return {
          ...item,
          sourcePath,
          playbackUrl: proxyUrl,
          proxyPath: proxy.outputPath,
          proxyUrl,
          mediaStatus: 'ready',
        };
      } catch {
        return {
          ...item,
          sourcePath,
          playbackUrl,
          mediaStatus: 'ready',
          mediaError: 'Preview proxy failed; using source media.',
        };
      }
    }
    return {
      ...item,
      sourcePath,
      playbackUrl,
      mediaStatus: 'ready',
    };
  }

  return {
    ...item,
    playbackUrl: item.playbackUrl ?? url,
    mediaStatus: item.mediaStatus ?? 'ready',
  };
}

export function getEditorMediaPlaybackUrl(media: { proxyUrl?: string; playbackUrl?: string; url?: string | null }) {
  return media.proxyUrl ?? media.playbackUrl ?? media.url ?? '';
}
