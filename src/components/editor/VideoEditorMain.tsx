import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useVideoEditorStore, Clip, ClipEffect, ClipGraphicElement, ClipTransition, AudioTrack } from '@/store/videoEditorStore';
import { useComputeFlowSync } from '@/hooks/useComputeFlowSync';
import { useRealtimeTimelineSync } from '@/hooks/useRealtimeTimelineSync';
import { useEditorShortcuts } from '@/hooks/useEditorShortcuts';
import { useEditorPlaybackClock } from '@/hooks/editor/useEditorPlaybackClock';
import { usePropertySync } from '@/hooks/editor/usePropertySync';
import { EditorHeader } from './EditorHeader';
import { EditorIconBar, EditorTab } from './EditorIconBar';
import { EditorMediaPanel } from './EditorMediaPanel';
import { EditframeWorkbenchCanvas } from './EditframeWorkbenchCanvas';
import PropertiesPanel from './properties/PropertiesPanel';
import { editorTheme } from '@/lib/editor/theme';
import { toast } from 'sonner';
import { getDesktopBridge } from '@/lib/desktop';
import { prepareEditorMediaForPlayback } from '@/lib/editor/mediaPlayback';
import { runExportRequest } from '@/hooks/useExport';
import { buildOpenCutProjectSnapshot } from '@/features/editor-opencut/openCutAdapter';

export default function VideoEditorMain() {
  const { projectId } = useParams();
  const loadProject = useVideoEditorStore((state) => state.loadProject);
  const storeProjectId = useVideoEditorStore((state) => state.project.id);
  const selectedClipIds = useVideoEditorStore((state) => state.selectedClipIds);
  const selectedAudioTrackIds = useVideoEditorStore((state) => state.selectedAudioTrackIds);
  const selectedKeyframeIds = useVideoEditorStore((state) => state.selectedKeyframeIds);
  const projectName = useVideoEditorStore((state) => state.project.name);
  const clips = useVideoEditorStore((state) => state.clips);
  const audioTracks = useVideoEditorStore((state) => state.audioTracks);
  const keyframes = useVideoEditorStore((state) => state.keyframes);
  const bookmarks = useVideoEditorStore((state) => state.bookmarks);
  const trackControls = useVideoEditorStore((state) => state.trackControls);
  const composition = useVideoEditorStore((state) => state.composition);
  const history = useVideoEditorStore((state) => state.history);
  const addClip = useVideoEditorStore((state) => state.addClip);
  const addAudioTrack = useVideoEditorStore((state) => state.addAudioTrack);
  const updateClip = useVideoEditorStore((state) => state.updateClip);
  const selectClip = useVideoEditorStore((state) => state.selectClip);
  const selectAudioTrack = useVideoEditorStore((state) => state.selectAudioTrack);
  const undo = useVideoEditorStore((state) => state.undo);
  const redo = useVideoEditorStore((state) => state.redo);
  const openCutSnapshot = useMemo(
    () =>
      buildOpenCutProjectSnapshot({
        projectId: projectId ?? storeProjectId,
        projectName,
        clips,
        audioTracks,
        keyframes,
        bookmarks,
        trackControls,
        composition,
        selectedClipIds,
        selectedAudioTrackIds,
        selectedKeyframeIds,
      }),
    [audioTracks, bookmarks, clips, composition, keyframes, projectId, projectName, selectedAudioTrackIds, selectedClipIds, selectedKeyframeIds, storeProjectId, trackControls]
  );
  const visibleClips = useMemo(
    () =>
      clips.filter((clip) => {
        const trackId = `visual-${clip.trackIndex ?? clip.layer ?? 0}`;
        return trackControls[trackId]?.visible !== false;
      }),
    [clips, trackControls]
  );
  const audibleAudioTracks = useMemo(
    () =>
      audioTracks
        .filter((track) => trackControls[`audio-${track.trackIndex ?? 0}`]?.visible !== false)
        .map((track) => {
          const control = trackControls[`audio-${track.trackIndex ?? 0}`];
          return control?.muted ? { ...track, isMuted: true } : track;
        }),
    [audioTracks, trackControls]
  );

  const [activeMediaTab, setActiveMediaTab] = useState<EditorTab>('assets');
  const [isExporting, setIsExporting] = useState(false);
  const [exportState, setExportState] = useState<{
    status: 'idle' | 'processing' | 'completed' | 'failed';
    outputUrl?: string;
    outputPath?: string;
    message?: string;
    progress?: number;
  }>({ status: 'idle' });

  // Handler for applying transitions to selected clips
  const handleApplyTransition = useCallback(
    (transition: { type: string; duration: number; direction?: string }) => {
      if (selectedClipIds.length === 0) {
        toast.info('Select a clip to apply a transition');
        return;
      }
      const clipTransition: ClipTransition = {
        type: transition.type as ClipTransition['type'],
        duration: transition.duration,
        direction: transition.direction as ClipTransition['direction'],
      };
      selectedClipIds.forEach((id) => {
        updateClip(id, { transition: clipTransition });
      });
      toast.success(`Applied ${transition.type} transition`);
    },
    [selectedClipIds, updateClip]
  );

  const handleApplyEffect = useCallback(
    (effect: ClipEffect) => {
      if (selectedClipIds.length === 0) {
        toast.info('Select a clip to apply an effect');
        return;
      }
      selectedClipIds.forEach((id) => {
        const clip = clips.find((item) => item.id === id);
        if (!clip) return;
        const nextEffects = [...(clip.effects ?? []).filter((item) => item.id !== effect.id), effect];
        updateClip(id, { effects: nextEffects });
      });
      toast.success(`Applied ${effect.name}`);
    },
    [clips, selectedClipIds, updateClip]
  );

  const handleAddToTimeline = useCallback(
    async (item: any) => {
      const itemType = item.mediaType ?? item.type;
      const preparedItem = item.url && (itemType === 'video' || itemType === 'image' || itemType === 'audio')
        ? await prepareEditorMediaForPlayback(
            {
              id: item.id ?? uuidv4(),
              projectId: projectId ?? storeProjectId ?? 'local-editor',
              mediaType: itemType,
              name: item.name ?? 'Timeline media',
              url: item.url,
              durationSeconds: item.durationSeconds ?? item.duration,
              sourceType: item.sourceType,
              status: item.status,
              thumbnailUrl: item.thumbnailUrl,
              sourcePath: item.sourcePath,
              playbackUrl: item.playbackUrl,
              proxyUrl: item.proxyUrl,
              proxyPath: item.proxyPath,
              mediaStatus: item.mediaStatus,
              mediaError: item.mediaError,
            },
            {
              desktop: getDesktopBridge(),
              operationId: `editor-media-${item.id ?? Date.now()}`,
            },
          )
        : item;
      const visualStart = clips.reduce(
        (cursor, clip) => Math.max(cursor, clip.endTime ?? (clip.startTime ?? 0) + (clip.duration ?? 0)),
        0
      );
      const audioStart = audioTracks.reduce(
        (cursor, track) => Math.max(cursor, track.endTime ?? (track.startTime ?? 0) + (track.duration ?? 0)),
        0
      );
      const durationValue = preparedItem.durationSeconds ?? preparedItem.duration ?? 5;
      const durationMs = Math.max(1000, durationValue > 1000 ? durationValue : durationValue * 1000);

      if (itemType === 'audio') {
        const track: AudioTrack = {
          id: uuidv4(),
          mediaItemId: preparedItem.id,
          type: 'audio',
          name: preparedItem.name ?? 'Audio',
          url: preparedItem.url ?? '',
          sourcePath: preparedItem.sourcePath,
          playbackUrl: preparedItem.playbackUrl,
          proxyUrl: preparedItem.proxyUrl,
          proxyPath: preparedItem.proxyPath,
          mediaStatus: preparedItem.mediaStatus,
          mediaError: preparedItem.mediaError,
          startTime: audioStart,
          duration: durationMs,
          endTime: audioStart + durationMs,
          volume: 1,
          isMuted: false,
          trackIndex: 0,
          fadeInDuration: 0,
          fadeOutDuration: 0,
        };
        addAudioTrack(track);
        selectAudioTrack(track.id);
        return;
      }

      const graphicElement: ClipGraphicElement | undefined = item.type === 'element'
        ? {
            elementType: item.elementType === 'line' || item.elementType === 'icon' ? item.elementType : 'shape',
            shape: typeof item.shape === 'string' ? item.shape : 'rectangle',
            color: typeof item.color === 'string' ? item.color : '#FFFFFF',
            strokeWidth: typeof item.strokeWidth === 'number' ? item.strokeWidth : undefined,
          }
        : undefined;
      const clip: Clip = {
        id: uuidv4(),
        mediaItemId: preparedItem.id,
        type: item.type === 'text' ? 'text' : item.type === 'element' ? 'element' : itemType === 'image' ? 'image' : 'video',
        name: preparedItem.name ?? (item.text ? item.text.slice(0, 32) : 'Timeline clip'),
        url: preparedItem.url ?? '',
        sourcePath: preparedItem.sourcePath,
        playbackUrl: preparedItem.playbackUrl,
        proxyUrl: preparedItem.proxyUrl,
        proxyPath: preparedItem.proxyPath,
        mediaStatus: preparedItem.mediaStatus,
        mediaError: preparedItem.mediaError,
        text: item.text,
        style: item.style,
        element: graphicElement,
        startTime: visualStart,
        duration: durationMs,
        endTime: visualStart + durationMs,
        trackIndex: 0,
        layer: Math.max(0, clips.reduce((max, current) => Math.max(max, current.layer ?? 0), 0)),
        transforms: {
          position: item.position
            ? { x: Number(item.position.x ?? 0), y: Number(item.position.y ?? 0) }
            : { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          opacity: 1,
        },
        effects: item.effects ?? [],
      };
      addClip(clip);
      selectClip(clip.id);
    },
    [addAudioTrack, addClip, audioTracks, clips, projectId, selectAudioTrack, selectClip, storeProjectId]
  );

  useEffect(() => {
    if (projectId && projectId !== storeProjectId) {
      loadProject(projectId);
    }
  }, [loadProject, projectId, storeProjectId]);

  useComputeFlowSync(projectId ?? storeProjectId);
  useRealtimeTimelineSync(projectId ?? storeProjectId);
  useEditorPlaybackClock();
  usePropertySync();

  const handleTitleChange = (title: string) => {
    // Project name update logic here
    console.log('Update title:', title);
  };

  const handleExport = useCallback(async () => {
    const activeProjectId = projectId ?? storeProjectId;
    if (!activeProjectId) {
      toast.error('Open a project before exporting');
      return;
    }

    if (visibleClips.filter((clip) => clip.type === 'video' || clip.type === 'image').length === 0) {
      toast.error('Add at least one visual clip before exporting');
      return;
    }

    setIsExporting(true);
    const desktop = getDesktopBridge();
    const unsubscribe = desktop?.onMediaProgress?.((progress) => {
      setExportState((current) => ({
        ...current,
        status: current.status === 'completed' ? current.status : 'processing',
        message: progress.message ?? current.message,
        progress: progress.percent,
      }));
    });

    try {
      setExportState({ status: 'processing', message: 'Rendering locally with FFmpeg', progress: 0 });
      const result = await runExportRequest(
        { desktop },
        {
          projectId: activeProjectId,
          clips: visibleClips,
          audioTracks: audibleAudioTracks,
          keyframes,
          composition,
        },
        { format: 'mp4', quality: 'high' },
      );

      if (result.error) {
        setExportState({ status: 'failed', message: result.error, progress: 0 });
        toast.error(result.error);
        return;
      }

      setExportState({
        status: 'completed',
        outputUrl: result.url,
        outputPath: result.path,
        message: result.path ? `Saved to ${result.path}` : 'Local export complete',
        progress: 100,
      });
      toast.success('Editor export complete');
    } catch (error) {
      console.error('Editor export failed:', error);
      setExportState({
        status: 'failed',
        message: error instanceof Error ? error.message : 'Editor export failed',
      });
      toast.error(error instanceof Error ? error.message : 'Editor export failed');
    } finally {
      unsubscribe?.();
      setIsExporting(false);
    }
  }, [audibleAudioTracks, composition, keyframes, projectId, storeProjectId, visibleClips]);

  useEditorShortcuts({ onExport: isExporting ? undefined : handleExport });

  const handleShare = () => {
    console.log('Share clicked');
  };

  return (
    <div
      className="flex flex-col h-full relative overflow-hidden"
      style={{ background: editorTheme.bg.primary }}
    >
      {/* Ambient Glow Effects */}
      <div className="fixed top-[-20%] left-[-10%] w-[60%] h-[60%] bg-[radial-gradient(ellipse,rgba(255,107,74,0.08)_0%,transparent_70%)] pointer-events-none z-0" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-[radial-gradient(ellipse,rgba(234,88,12,0.06)_0%,transparent_70%)] pointer-events-none z-0" />
      {/* Header */}
      <EditorHeader
        projectTitle={projectName || 'Untitled video'}
        onTitleChange={handleTitleChange}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={undo}
        onRedo={redo}
        onShare={handleShare}
        onExport={isExporting ? () => undefined : handleExport}
      />

      {exportState.status !== 'idle' && (
        <div className="border-b border-white/10 bg-black/70 px-4 py-2 text-sm text-zinc-200">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="font-medium">
                {exportState.status === 'completed'
                  ? 'Local export complete'
                  : exportState.status === 'failed'
                    ? 'Local export failed'
                    : 'Local FFmpeg render processing'}
              </span>
              {exportState.message && <span className="ml-2 text-zinc-400">{exportState.message}</span>}
              {typeof exportState.progress === 'number' && exportState.status === 'processing' && (
                <span className="ml-2 text-zinc-500">{exportState.progress}%</span>
              )}
              {exportState.outputUrl && (
                <a className="ml-3 text-orange-300 underline" href={exportState.outputUrl} target="_blank" rel="noreferrer">
                  Open MP4
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="flex">
          <EditorIconBar
            activeTab={activeMediaTab}
            onTabChange={setActiveMediaTab}
          />
          <EditorMediaPanel
            activeTab={activeMediaTab}
            onAddToTimeline={handleAddToTimeline}
            onApplyTransition={handleApplyTransition}
            onApplyEffect={handleApplyEffect}
            openCutSnapshot={openCutSnapshot}
            projectId={projectId ?? storeProjectId ?? undefined}
          />
        </div>

        {/* Center - Canvas + Timeline */}
        <div className="flex-1 flex flex-col min-w-0">
          <EditframeWorkbenchCanvas
            clips={visibleClips}
            audioTracks={audibleAudioTracks}
            composition={composition}
          />
        </div>

        {/* Right Sidebar - Properties */}
        <PropertiesPanel
          selectedClipIds={selectedClipIds}
          selectedAudioTrackIds={selectedAudioTrackIds}
        />
      </div>
    </div>
  );
}
