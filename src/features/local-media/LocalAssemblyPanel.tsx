import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { HardDriveDownload, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { getDesktopBridge } from '@/lib/desktop';
import { fitProject, timeToX, xToTimeMs } from '@/lib/editor/timelineZoom';
import { formatTimecode } from '@/lib/editor/time';
import { cn } from '@/lib/utils';
import type { SceneDetails, ShotDetails } from '@/types/storyboardTypes';
import {
  buildStoryboardAssemblyRenderPlan,
  isRemoteMediaUrl,
  preferredMediaForShot,
  type StoryboardAssemblyItem,
} from './storyboardAssembly';
import {
  buildStoryboardAssemblyTimeline,
  createStoryboardAssemblyTimelineLayout,
} from './storyboardAssemblyTimeline';

type TimelineExportStatus = 'idle' | 'caching' | 'rendering' | 'completed' | 'failed';

interface LocalAssemblyPanelProps {
  projectId: string;
  projectTitle?: string | null;
  aspectRatio?: string | null;
  scenes?: Pick<SceneDetails, 'id' | 'scene_number'>[];
  className?: string;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

function safeExportName(value: string | null | undefined) {
  return (value || 'storyboard')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'storyboard';
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const update = () => setWidth(Math.max(0, element.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

const clampAssemblyPixelsPerSecond = (value: number) => Math.max(0.2, Math.min(900, value));

export function LocalAssemblyPanel({
  projectId,
  projectTitle,
  aspectRatio,
  scenes: providedScenes,
  className,
}: LocalAssemblyPanelProps) {
  const [projectMeta, setProjectMeta] = useState<{ title: string | null; aspectRatio: string | null }>({
    title: projectTitle ?? null,
    aspectRatio: aspectRatio ?? null,
  });
  const [scenes, setScenes] = useState<Pick<SceneDetails, 'id' | 'scene_number'>[]>(providedScenes ?? []);
  const [shots, setShots] = useState<ShotDetails[]>([]);
  const [isTimelineLoading, setIsTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(4);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [timelineRef, timelineWidth] = useElementWidth<HTMLDivElement>();
  const [exportStatus, setExportStatus] = useState<TimelineExportStatus>('idle');
  const [exportMessage, setExportMessage] = useState('Ready to assemble generated shot media locally.');
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportPath, setExportPath] = useState<string | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);

  useEffect(() => {
    setProjectMeta({
      title: projectTitle ?? null,
      aspectRatio: aspectRatio ?? null,
    });
  }, [aspectRatio, projectTitle]);

  const refreshTimeline = useCallback(async () => {
    if (!projectId) return null;
    setIsTimelineLoading(true);
    setTimelineError(null);
    try {
      const needsProjectMeta = !projectTitle || !aspectRatio;
      const [projectResult, scenesResult, shotsResult] = await Promise.all([
        needsProjectMeta
          ? supabase.from('projects').select('title, aspect_ratio').eq('id', projectId).single()
          : Promise.resolve({ data: null, error: null }),
        providedScenes
          ? Promise.resolve({ data: providedScenes, error: null })
          : supabase
              .from('scenes')
              .select('id, scene_number')
              .eq('project_id', projectId)
              .order('scene_number', { ascending: true }),
        supabase
          .from('shots')
          .select('*')
          .eq('project_id', projectId)
          .order('shot_number', { ascending: true }),
      ]);

      if (projectResult.error) throw projectResult.error;
      if (scenesResult.error) throw scenesResult.error;
      if (shotsResult.error) throw shotsResult.error;

      if (projectResult.data) {
        setProjectMeta({
          title: typeof projectResult.data.title === 'string' ? projectResult.data.title : null,
          aspectRatio: typeof projectResult.data.aspect_ratio === 'string' ? projectResult.data.aspect_ratio : null,
        });
      }
      const nextScenes = (scenesResult.data ?? []) as Pick<SceneDetails, 'id' | 'scene_number'>[];
      const nextShots = (shotsResult.data ?? []) as ShotDetails[];
      setScenes(nextScenes);
      setShots(nextShots);
      return { scenes: nextScenes, shots: nextShots };
    } catch (error) {
      const message = getErrorMessage(error);
      setTimelineError(message);
      return null;
    } finally {
      setIsTimelineLoading(false);
    }
  }, [aspectRatio, projectId, projectTitle, providedScenes]);

  useEffect(() => {
    void refreshTimeline();
  }, [refreshTimeline]);

  useEffect(() => {
    const desktop = getDesktopBridge();
    if (!desktop?.onMediaProgress) return undefined;
    return desktop.onMediaProgress((progress) => {
      if (!operationId || progress.operationId !== operationId) return;
      if (typeof progress.percent === 'number') {
        setExportProgress(progress.percent);
      }
      if (progress.message) {
        setExportMessage(progress.message);
      }
      if (progress.stage === 'failed') {
        setExportStatus('failed');
        setExportError(progress.detail || progress.message || 'Local timeline export failed.');
      }
      if (progress.stage === 'completed') {
        setExportProgress(100);
      }
    });
  }, [operationId]);

  const timeline = useMemo(
    () => buildStoryboardAssemblyTimeline({ shots, scenes }),
    [shots, scenes]
  );
  const layout = useMemo(
    () =>
      createStoryboardAssemblyTimelineLayout({
        timeline,
        pixelsPerSecond,
        viewportWidth: Math.max(1, timelineWidth),
        scrollLeft,
        fps: 30,
      }),
    [pixelsPerSecond, scrollLeft, timeline, timelineWidth]
  );
  const playheadX = timeToX(Math.min(playheadMs, Math.max(0, timeline.durationMs)), pixelsPerSecond);

  const setZoomPreset = useCallback((nextPixelsPerSecond: number) => {
    setPixelsPerSecond(clampAssemblyPixelsPerSecond(nextPixelsPerSecond));
    setScrollLeft(0);
  }, []);

  const handleFitTimeline = useCallback(() => {
    const nextPixelsPerSecond = fitProject(Math.max(1000, timeline.durationMs), Math.max(1, timelineWidth));
    setZoomPreset(nextPixelsPerSecond);
  }, [setZoomPreset, timeline.durationMs, timelineWidth]);

  const handleTimelinePointer = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const nextMs = Math.min(timeline.durationMs, xToTimeMs(x, pixelsPerSecond));
      setPlayheadMs(Math.max(0, nextMs));
    },
    [pixelsPerSecond, timeline.durationMs]
  );

  const handleLocalExport = useCallback(async () => {
    const desktop = getDesktopBridge();
    if (!desktop?.renderTimeline || !desktop.selectExportFolder) {
      const message = 'Open the Electron desktop app to assemble and export the storyboard locally.';
      setExportStatus('failed');
      setExportError(message);
      setExportMessage(message);
      toast.error(message);
      return;
    }

    const outputFolder = await desktop.selectExportFolder();
    if (!outputFolder) {
      setExportMessage('Local timeline export cancelled.');
      return;
    }

    const nextOperationId = `timeline-assembly-${projectId}-${Date.now()}`;
    setOperationId(nextOperationId);
    setExportStatus('caching');
    setExportProgress(0);
    setExportError(null);
    setExportPath(null);
    setExportMessage('Collecting generated shot media...');

    try {
      const loaded = await refreshTimeline();
      const exportScenes = loaded?.scenes ?? scenes;
      const exportShots = loaded?.shots ?? shots;
      const sceneNumberById = new Map(exportScenes.map((scene) => [scene.id, scene.scene_number]));
      const preferred = exportShots
        .map((shot) => preferredMediaForShot(shot, sceneNumberById.get(shot.scene_id)))
        .filter((media): media is NonNullable<ReturnType<typeof preferredMediaForShot>> => media !== null);

      if (preferred.length === 0) {
        throw new Error('Generate at least one shot image or video before local timeline export.');
      }
      if (preferred.some((media) => isRemoteMediaUrl(media.url)) && !desktop.cacheRemoteMedia) {
        throw new Error('This desktop build cannot cache remote shot media for local export. Update the desktop app and try again.');
      }

      const items: StoryboardAssemblyItem[] = [];
      for (const [index, media] of preferred.entries()) {
        setExportProgress(Math.round((index / preferred.length) * 35));
        setExportMessage(`Caching shot ${index + 1} of ${preferred.length} locally...`);
        const localMedia = isRemoteMediaUrl(media.url)
          ? await desktop.cacheRemoteMedia?.({
              operationId: `${nextOperationId}-cache-${media.shotId}`,
              url: media.url,
              name: media.name,
            })
          : { path: media.url };
        if (!localMedia?.path) {
          throw new Error(`Could not cache ${media.name}.`);
        }

        const localAudio = media.audioUrl && isRemoteMediaUrl(media.audioUrl)
          ? await desktop.cacheRemoteMedia?.({
              operationId: `${nextOperationId}-cache-audio-${media.shotId}`,
              url: media.audioUrl,
              name: `${media.name} audio`,
            })
          : media.audioUrl
            ? { path: media.audioUrl }
            : null;

        items.push({
          id: media.shotId,
          sceneId: media.sceneId,
          sceneNumber: sceneNumberById.get(media.sceneId),
          shotNumber: media.shotNumber,
          type: media.type,
          url: media.url,
          localPath: localMedia.path,
          audioLocalPath: localAudio?.path,
          name: media.name,
          durationMs: media.type === 'image' ? 4000 : 5000,
        });
      }

      const outputPath = `${outputFolder.replace(/\/+$/, '')}/${safeExportName(projectMeta.title)}-storyboard-${Date.now()}.mp4`;
      const plan = buildStoryboardAssemblyRenderPlan({
        projectId,
        items,
        outputPath,
        width: projectMeta.aspectRatio === '9:16' ? 1080 : 1920,
        height: projectMeta.aspectRatio === '9:16' ? 1920 : 1080,
      });

      setExportStatus('rendering');
      setExportProgress(35);
      setExportMessage('Rendering storyboard timeline locally with FFmpeg...');
      const result = await desktop.renderTimeline({
        operationId: nextOperationId,
        projectId,
        timeline: plan,
        outputPath,
      });
      setExportStatus('completed');
      setExportProgress(100);
      setExportPath(result.outputPath);
      setExportMessage('Local storyboard timeline export completed.');
      toast.success('Local storyboard timeline export completed');
    } catch (error) {
      const message = getErrorMessage(error);
      setExportStatus('failed');
      setExportError(message);
      setExportMessage(message);
      toast.error(message);
    }
  }, [projectId, projectMeta.aspectRatio, projectMeta.title, refreshTimeline, scenes, shots]);

  return (
    <div className={cn('rounded-2xl border border-zinc-700/60 bg-zinc-900/60 p-5', className)}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.2em] text-zinc-500">
            <HardDriveDownload className="h-4 w-4 text-orange-300" />
            Local Assembly
          </div>
          <h2 className="mt-2 text-base font-semibold text-zinc-100">Render storyboard timeline with local FFmpeg</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Caches generated shot images/videos into the desktop media cache, assembles them in scene order, then renders an MP4 through local FFmpeg.
          </p>
        </div>
        <Button
          onClick={handleLocalExport}
          disabled={exportStatus === 'caching' || exportStatus === 'rendering'}
          className="min-h-[40px] shrink-0 bg-orange-600 text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {exportStatus === 'caching' || exportStatus === 'rendering' ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <HardDriveDownload className="mr-2 h-4 w-4" />
          )}
          Render local FFmpeg MP4
        </Button>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-800/80 bg-black/25 p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-orange-300/25 bg-orange-400/10 text-orange-100">
                {timeline.availableMediaCount}/{timeline.totalShotCount} ready
              </Badge>
              <span className="text-xs text-zinc-500">{formatTimecode(timeline.durationMs)} assembled</span>
              <span className="text-xs text-zinc-600">{formatTimecode(playheadMs)} cursor</span>
            </div>
            {timelineError ? <p className="mt-2 text-xs text-red-300">{timelineError}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refreshTimeline}
              disabled={isTimelineLoading}
              className="h-8 border-zinc-700 bg-zinc-950/70 text-zinc-200 hover:bg-zinc-900"
            >
              {isTimelineLoading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
              Refresh
            </Button>
            {[
              ['Fit', null],
              ['Min', 0.5],
              ['Sec', 40],
              ['Frame', 650],
            ].map(([label, value]) => (
              <Button
                key={label}
                variant="outline"
                size="sm"
                onClick={() => {
                  if (typeof value === 'number') setZoomPreset(value);
                  else handleFitTimeline();
                }}
                className="h-8 border-zinc-700 bg-zinc-950/70 px-3 text-zinc-200 hover:bg-zinc-900"
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        <div
          ref={timelineRef}
          className="mt-3 overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950/80"
          onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
        >
          {timeline.items.length > 0 ? (
            <div
              className="relative h-24 min-w-full cursor-crosshair"
              style={{ width: `${layout.contentWidth}px` }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                handleTimelinePointer(event);
              }}
              onPointerMove={(event) => {
                if (event.buttons === 1) handleTimelinePointer(event);
              }}
            >
              <div className="absolute inset-x-0 top-0 h-8 border-b border-zinc-800/80">
                {layout.ticks.map((tick) => (
                  <div
                    key={`${tick.timeMs}-${tick.kind}`}
                    className={cn(
                      'absolute top-0 h-full border-l',
                      tick.kind === 'major' ? 'border-zinc-500/60' : tick.kind === 'frame' ? 'border-zinc-700/30' : 'border-zinc-700/50'
                    )}
                    style={{ left: `${timeToX(tick.timeMs, pixelsPerSecond)}px` }}
                  >
                    {tick.label ? <span className="ml-1 text-[10px] leading-6 text-zinc-500">{tick.label}</span> : null}
                  </div>
                ))}
              </div>
              <div
                className="absolute top-0 z-20 h-full w-px bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,.65)]"
                style={{ left: `${Math.min(layout.contentWidth, playheadX)}px` }}
              />
              <div className="absolute inset-x-0 bottom-2 top-10">
                {layout.segments.filter((segment) => segment.isVisible).map((segment) => (
                  <div
                    key={segment.id}
                    className={cn(
                      'absolute top-0 flex h-10 min-w-8 items-center overflow-hidden rounded-md border px-2 text-xs font-medium',
                      segment.mediaType === 'video'
                        ? 'border-orange-300/40 bg-orange-400/15 text-orange-50'
                        : 'border-cyan-300/30 bg-cyan-400/10 text-cyan-50'
                    )}
                    style={{ left: `${segment.left}px`, width: `${segment.width}px` }}
                    title={`${segment.label} ${segment.mediaType} ${formatTimecode(segment.startMs)}-${formatTimecode(segment.endMs)}`}
                  >
                    <span className="truncate">{segment.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center text-sm text-zinc-500">
              Generated shot media appears here before local export.
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
            <div
              className={cn('h-full rounded-full transition-all duration-300', exportStatus === 'failed' ? 'bg-red-400' : 'bg-orange-400')}
              style={{ width: `${Math.max(0, Math.min(100, exportProgress))}%` }}
            />
          </div>
          <p className={cn('mt-2 text-sm', exportStatus === 'failed' ? 'text-red-300' : 'text-zinc-400')}>
            {exportMessage}
          </p>
          {exportError ? (
            <p className="mt-2 rounded-lg border border-red-400/20 bg-red-950/20 px-3 py-2 text-xs text-red-200">
              {exportError}
            </p>
          ) : null}
        </div>
        <div className="text-left text-xs text-zinc-500 md:text-right">
          <div>{exportStatus === 'completed' ? 'Ready' : exportStatus}</div>
          {exportPath ? <div className="mt-1 max-w-[320px] truncate text-zinc-400">{exportPath}</div> : null}
        </div>
      </div>
    </div>
  );
}
