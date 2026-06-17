import { useCallback, useState } from 'react';
import { useVideoEditorStore, Clip, AudioTrack, CompositionSettings, Keyframe } from '@/store/videoEditorStore';
import { getDesktopBridge, type WzrdDesktopBridge } from '@/lib/desktop';
import {
  buildLocalTimelineRenderPlan,
  type LocalTimelineExportFormat,
  type LocalTimelineExportQuality,
} from '@/features/local-media/timelineRenderPlan';

interface ExportOptions {
  format: 'mp4' | 'webm';
  quality: 'low' | 'medium' | 'high' | '4k';
}

const SUPPORTED_FORMATS: ExportOptions['format'][] = ['mp4', 'webm'];
const SUPPORTED_QUALITIES: ExportOptions['quality'][] = ['low', 'medium', 'high', '4k'];

interface ExportContext {
  projectId: string | null;
  clips: Clip[];
  audioTracks: AudioTrack[];
  keyframes?: Keyframe[];
  composition: CompositionSettings;
}

interface ExportDependencies {
  invoke?: unknown;
  desktop?: Pick<WzrdDesktopBridge, 'selectExportFolder' | 'renderTimeline'> | null;
  now?: () => number;
}

export interface ExportResult {
  url?: string;
  path?: string;
  error?: string;
}

const validateRequest = (context: ExportContext, options: ExportOptions): string | null => {
  if (!context.projectId) {
    return 'Save the project before exporting.';
  }
  if (!SUPPORTED_FORMATS.includes(options.format)) {
    return 'Unsupported export format. Choose MP4 or WebM.';
  }
  if (!SUPPORTED_QUALITIES.includes(options.quality)) {
    return 'Unsupported quality preset.';
  }
  if (context.clips.length === 0 && context.audioTracks.length === 0) {
    return 'Add at least one clip or audio track before exporting.';
  }
  return null;
};

function slugPart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'project';
}

function joinPath(directory: string, filename: string) {
  return `${directory.replace(/\/+$/, '')}/${filename}`;
}

function fileUrlFromPath(filePath: string) {
  return `file://${filePath
    .split('/')
    .map((part, index) => (index === 0 ? '' : encodeURIComponent(part)))
    .join('/')}`;
}

export const runExportRequest = async (
  deps: ExportDependencies,
  context: ExportContext,
  options: ExportOptions
): Promise<ExportResult> => {
  const validationError = validateRequest(context, options);
  if (validationError) {
    return { error: validationError };
  }

  const desktop = deps.desktop ?? getDesktopBridge();
  if (!desktop?.renderTimeline || !desktop.selectExportFolder) {
    return { error: 'Open the Electron desktop app to export this timeline with local FFmpeg.' };
  }

  try {
    const exportFolder = await desktop.selectExportFolder();
    if (!exportFolder) {
      return { error: 'Choose an export folder before rendering.' };
    }

    const timestamp = deps.now?.() ?? Date.now();
    const extension = options.format === 'webm' ? 'webm' : 'mp4';
    const outputPath = joinPath(exportFolder, `wzrd-${slugPart(context.projectId!)}-${timestamp}.${extension}`);
    const timeline = buildLocalTimelineRenderPlan({
      projectId: context.projectId,
      clips: context.clips,
      audioTracks: context.audioTracks,
      keyframes: context.keyframes ?? [],
      composition: context.composition,
      outputPath,
      format: options.format as LocalTimelineExportFormat,
      quality: options.quality as LocalTimelineExportQuality,
    });
    const operationId = `editor-export-${slugPart(context.projectId!)}-${timestamp}`;
    const result = await desktop.renderTimeline({ operationId, projectId: context.projectId ?? undefined, timeline, outputPath });

    return { path: result.outputPath, url: fileUrlFromPath(result.outputPath) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Failed to export video. Please try again.',
    };
  }
};

export function useExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const resetExportState = useCallback(() => {
    setIsExporting(false);
    setProgress(0);
    setError(null);
    setDownloadUrl(null);
  }, []);

  const exportVideo = useCallback(async ({ format, quality }: ExportOptions) => {
    const { project, clips, audioTracks, keyframes, composition } = useVideoEditorStore.getState();
    const context: ExportContext = { projectId: project.id, clips, audioTracks, keyframes, composition };

    setIsExporting(true);
    setProgress(10);
    setError(null);
    setDownloadUrl(null);

    const result = await runExportRequest({ desktop: getDesktopBridge() }, context, { format, quality });

    if (result.error) {
      setError(result.error);
      setIsExporting(false);
      return;
    }

    setProgress(100);
    setDownloadUrl(result.url ?? null);
    setIsExporting(false);
  }, []);

  return { exportVideo, isExporting, progress, error, downloadUrl, resetExportState };
}
