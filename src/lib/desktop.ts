import { sanitizeNextPath } from '@/lib/routes';
import type {
  DesktopFfmpegProgress,
  DesktopFfmpegStatus,
  DesktopFileSelection,
  DesktopYoutubeDownloaderStatus,
  DesktopYoutubeDownloadProgress,
  DesktopYoutubeDownloadResult,
  DesktopVideoMetadata,
  RepresentativeFrameInput,
} from '@/features/clip-studio/types';
import type { LocalTimelineRenderPlan } from '@/features/local-media/timelineRenderPlan';

export const DESKTOP_THIRDWEB_AUTH_NEXT_STORAGE_KEY = 'wzrd.desktop.thirdwebAuth.next';

export interface WzrdDesktopBridge {
  isDesktop: true;
  platform: NodeJS.Platform | string;
  openExternal: (url: string) => Promise<boolean>;
  getDeepLink: (path: string) => string;
  selectVideoFile?: () => Promise<DesktopFileSelection | null>;
  selectLogoFile?: () => Promise<DesktopFileSelection | null>;
  selectImageFiles?: () => Promise<DesktopFileSelection[]>;
  selectExportFolder?: () => Promise<string | null>;
  revealInFinder?: (path: string) => Promise<boolean>;
  resolveMediaFileUrl?: (params: { filePath: string }) => Promise<string>;
  cacheRemoteMedia?: (params: {
    operationId: string;
    url: string;
    name?: string;
  }) => Promise<{ name: string; path: string; size?: number; mimeType?: string; mediaUrl?: string }>;
  validateFfmpegAvailable?: (params?: { ffmpegPath?: string }) => Promise<DesktopFfmpegStatus>;
  getVideoMetadata?: (params: { filePath: string; ffmpegPath?: string }) => Promise<DesktopVideoMetadata>;
  cutClip?: (params: {
    operationId: string;
    sourcePath: string;
    outputPath: string;
    startSeconds: number;
    durationSeconds: number;
    clipTitle?: string;
    ffmpegPath?: string;
  }) => Promise<{ outputPath: string }>;
  exportVerticalClip?: (params: {
    operationId: string;
    sourcePath: string;
    outputPath: string;
    startSeconds: number;
    durationSeconds: number;
    clipTitle?: string;
    captionsPath?: string;
    logoPath?: string;
    logoOpacity?: number;
    logoIntroSeconds?: number;
    ffmpegPath?: string;
  }) => Promise<{ outputPath: string }>;
  generateThumbnail?: (params: {
    operationId: string;
    sourcePath: string;
    outputPath: string;
    atSeconds: number;
    ffmpegPath?: string;
  }) => Promise<{ outputPath: string }>;
  validateMediaToolchain?: (params?: { ffmpegPath?: string }) => Promise<DesktopFfmpegStatus>;
  probeMedia?: (params: { filePath: string; ffmpegPath?: string }) => Promise<DesktopVideoMetadata>;
  cutMedia?: (params: {
    operationId: string;
    sourcePath: string;
    outputPath: string;
    startMs: number;
    durationMs: number;
    ffmpegPath?: string;
  }) => Promise<{ outputPath: string }>;
  extractThumbnail?: (params: {
    operationId: string;
    sourcePath: string;
    outputPath: string;
    atMs: number;
    ffmpegPath?: string;
  }) => Promise<{ outputPath: string }>;
  extractWaveformPeaks?: (params: {
    operationId: string;
    sourcePath: string;
    outputPath?: string;
    resolution?: number;
    sampleRate?: number;
    ffmpegPath?: string;
  }) => Promise<{ sourcePath: string; outputPath?: string; resolution: number; sampleRate: number; peaks: number[] }>;
  renderPreviewProxy?: (params: {
    operationId: string;
    sourcePath: string;
    outputPath: string;
    maxWidth?: number;
    maxHeight?: number;
    ffmpegPath?: string;
  }) => Promise<{ outputPath: string }>;
  renderTimeline?: (params: {
    operationId: string;
    projectId?: string;
    timeline: LocalTimelineRenderPlan;
    outputPath: string;
    ffmpegPath?: string;
  }) => Promise<{ outputPath: string }>;
  runStudioMediaAction?: (params: {
    operationId: string;
    actionId: string;
    inputs?: Record<string, unknown>;
    params?: Record<string, unknown>;
    outputFolder: string;
    ffmpegPath?: string;
  }) => Promise<{
    outputPath?: string;
    outputs?: Array<{ type: string; path?: string; url?: string; data?: unknown; name?: string }>;
    metadata?: unknown;
  }>;
  validateYoutubeDownloaderAvailable?: (params?: { downloaderPath?: string }) => Promise<DesktopYoutubeDownloaderStatus>;
  downloadYoutubeVideo?: (params: {
    operationId: string;
    url: string;
    downloaderPath?: string;
    ffmpegPath?: string;
  }) => Promise<DesktopYoutubeDownloadResult>;
  extractRepresentativeFrames?: (params: {
    operationId: string;
    sourcePath: string;
    durationSeconds: number;
    ffmpegPath?: string;
    timestamps?: number[];
  }) => Promise<RepresentativeFrameInput[]>;
  onFfmpegProgress?: (callback: (progress: DesktopFfmpegProgress) => void) => () => void;
  onMediaProgress?: (callback: (progress: DesktopFfmpegProgress) => void) => () => void;
  onYoutubeDownloadProgress?: (callback: (progress: DesktopYoutubeDownloadProgress) => void) => () => void;
}

export function getDesktopBridge(): WzrdDesktopBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = window.wzrdDesktop;
  return bridge?.isDesktop ? bridge : null;
}

export function isDesktopRuntime(): boolean {
  return getDesktopBridge() !== null;
}

export function getDesktopDeepLink(path: string): string | null {
  return getDesktopBridge()?.getDeepLink(path) ?? null;
}

export function getDesktopBillingReturnUrls() {
  const successUrl = getDesktopDeepLink('/billing/success');
  const cancelUrl = getDesktopDeepLink('/billing/cancel');

  if (!successUrl || !cancelUrl) {
    return {};
  }

  return {
    success_url: successUrl,
    cancel_url: cancelUrl,
  };
}

export function getDesktopThirdwebAuthReturnUrl(_next?: string | null): string | null {
  const returnUrl = getDesktopDeepLink('/auth/thirdweb');
  if (!returnUrl) {
    return null;
  }

  return returnUrl;
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function clearDesktopThirdwebAuthNext() {
  try {
    getStorage()?.removeItem(DESKTOP_THIRDWEB_AUTH_NEXT_STORAGE_KEY);
  } catch {
    // Ignore unavailable or blocked storage.
  }
}

export function rememberDesktopThirdwebAuthNext(next?: string | null): string | null {
  const sanitizedNext = sanitizeNextPath(next);
  if (!sanitizedNext) {
    clearDesktopThirdwebAuthNext();
    return null;
  }

  try {
    getStorage()?.setItem(DESKTOP_THIRDWEB_AUTH_NEXT_STORAGE_KEY, sanitizedNext);
    return sanitizedNext;
  } catch {
    return null;
  }
}

export function getStoredDesktopThirdwebAuthNext(): string | null {
  try {
    return sanitizeNextPath(getStorage()?.getItem(DESKTOP_THIRDWEB_AUTH_NEXT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function consumeDesktopThirdwebAuthNext(): string | null {
  const next = getStoredDesktopThirdwebAuthNext();
  clearDesktopThirdwebAuthNext();
  return next;
}

export async function openExternalUrl(url: string): Promise<boolean> {
  const bridge = getDesktopBridge();
  if (bridge) {
    return bridge.openExternal(url);
  }

  window.location.assign(url);
  return true;
}
