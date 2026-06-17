import React, { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@editframe/elements/styles.css';
import {
  Audio,
  Controls,
  Filmstrip,
  FitScale,
  Image as EfImage,
  PanZoom,
  Scrubber,
  Text as EfText,
  TimeDisplay,
  Timegroup,
  TimelineRoot,
  ToggleLoop,
  TogglePlay,
  TransformHandles,
  TrimHandles,
  Video,
  Workbench,
} from '@editframe/react';
import { Eye, EyeOff, Film, Layers, Link2, Lock, Music, Type, Unlock, Volume2, VolumeX } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { AudioTrack, Clip, CompositionSettings, Keyframe, LibraryMediaItem, useVideoEditorStore } from '@/store/videoEditorStore';
import { editorTheme, typography } from '@/lib/editor/theme';
import { useDrop } from '@/lib/react-dnd';
import { formatTimecode } from '@/lib/editor/time';
import {
  EDITOR_TIMELINE_DEFAULT_PIXELS_PER_SECOND,
  buildEditorTimelineMetrics,
  clampEditorTimelinePixelsPerSecond,
  editorTimeToX,
  editorXToTimeMs,
  fitEditorProject,
  fitEditorSelection,
} from './editorTimelineLayout';
import { moveSelectedKeyframes, moveSelection, trimSelectionEdges } from '@/features/editor-opencut/openCutCommands';
import { evaluateOpenCutAudioAtTime, evaluateOpenCutClipAtTime } from '@/features/editor-opencut/openCutKeyframes';
import { prepareEditorMediaForPlayback } from '@/lib/editor/mediaPlayback';
import { EditorPlaybackStrip } from './EditorPlaybackStrip';
import { EditorPreviewStage } from './EditorPreviewStage';

interface EditframeWorkbenchCanvasProps {
  clips: Clip[];
  audioTracks: AudioTrack[];
  composition: CompositionSettings;
}

const TIMELINE_RULER_HEIGHT = 28;
const VISUAL_TRACK_HEIGHT = 54;
const AUDIO_TRACK_HEIGHT = 42;
const SELECTION_DRAG_THRESHOLD_PX = 4;

interface TimelinePoint {
  x: number;
  y: number;
}

interface TimelineSelectionRectangle {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface TimelineSelectionDragState {
  origin: TimelinePoint;
  current: TimelinePoint;
  active: boolean;
}

interface TimelineItemDragInput {
  id: string;
  kind: 'clip' | 'audio';
  rowHeight: number;
}

const msToSeconds = (ms: number | null | undefined) => `${Math.max(0, ms ?? 0) / 1000}s`;

const clampDurationMs = (value: number | null | undefined, fallbackSeconds = 5) => {
  if (!Number.isFinite(value ?? NaN) || !value) return fallbackSeconds * 1000;
  return value > 1000 ? Math.max(100, value) : Math.max(100, value * 1000);
};

const getEndTime = (item: { startTime?: number; duration?: number; endTime?: number }) =>
  item.endTime ?? (item.startTime ?? 0) + (item.duration ?? 0);

const formatTime = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const formatTimelineKeyframeTime = (timeMs: number) => {
  const safeTime = Math.max(0, Math.round(timeMs));
  const minutes = Math.floor(safeTime / 60000);
  const seconds = Math.floor((safeTime % 60000) / 1000);
  const millis = safeTime % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
};

const getDragDistance = (origin: TimelinePoint, current: TimelinePoint) =>
  Math.hypot(current.x - origin.x, current.y - origin.y);

const normalizeRectangle = (rectangle: TimelineSelectionRectangle): TimelineSelectionRectangle => ({
  left: Math.min(rectangle.left, rectangle.right),
  top: Math.min(rectangle.top, rectangle.bottom),
  right: Math.max(rectangle.left, rectangle.right),
  bottom: Math.max(rectangle.top, rectangle.bottom),
});

const rectanglesIntersect = (a: TimelineSelectionRectangle, b: TimelineSelectionRectangle) =>
  !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);

const toSelectionRectangle = (origin: TimelinePoint, current: TimelinePoint): TimelineSelectionRectangle => ({
  left: origin.x,
  top: origin.y,
  right: current.x,
  bottom: current.y,
});

const toSelectionOverlayStyle = (origin: TimelinePoint, current: TimelinePoint): CSSProperties => ({
  left: Math.min(origin.x, current.x),
  top: Math.min(origin.y, current.y),
  width: Math.abs(current.x - origin.x),
  height: Math.abs(current.y - origin.y),
});

const getTargetKeyframes = (targetId: string, start: number, end: number, keyframes: Keyframe[]) => {
  return keyframes
    .filter((keyframe) => keyframe.targetId === targetId && keyframe.time >= start && keyframe.time <= end)
    .sort((a, b) => a.time - b.time);
};

function TimelineKeyframeMarker({
  keyframe,
  targetName,
  selected,
  locked,
  pixelsPerSecond,
  onSelect,
  onPointerDown,
}: {
  keyframe: Keyframe;
  targetName: string;
  selected: boolean;
  locked: boolean;
  pixelsPerSecond: number;
  onSelect: (keyframe: Keyframe, event: React.MouseEvent<HTMLButtonElement>) => void;
  onPointerDown: (keyframe: Keyframe, event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const propertyLabel = keyframe.propertyPath ?? 'keyframe';

  return (
    <button
      type="button"
      aria-label={`Select keyframe ${propertyLabel} for ${targetName || 'Unnamed'} at ${formatTimelineKeyframeTime(keyframe.time)}`}
      aria-pressed={selected}
      disabled={locked}
      className="absolute z-20 h-3 w-3 border transition-colors focus:outline-none focus:ring-2 focus:ring-white/80"
      data-testid={`editframe-timeline-keyframe-${keyframe.id}`}
      data-editframe-timeline-interactive="true"
      onPointerDown={(event) => onPointerDown(keyframe, event)}
      onClick={(event) => onSelect(keyframe, event)}
      style={{
        left: editorTimeToX(keyframe.time, pixelsPerSecond),
        top: '50%',
        transform: 'translate(-50%, -50%) rotate(45deg)',
        borderRadius: 2,
        borderColor: selected ? '#facc15' : 'rgba(255, 255, 255, 0.85)',
        background: selected ? '#facc15' : '#111827',
        boxShadow: selected
          ? '0 0 0 2px rgba(250, 204, 21, 0.3)'
          : '0 1px 3px rgba(0, 0, 0, 0.4)',
        cursor: locked ? 'not-allowed' : 'pointer',
        opacity: locked ? 0.45 : 1,
      }}
    />
  );
}

function useElementWidth(node: HTMLElement | null) {
  const [width, setWidth] = useState(920);

  useEffect(() => {
    if (!node) return;

    const update = () => setWidth(Math.max(1, Math.round(node.clientWidth || 920)));
    update();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return width;
}

function clipTransformStyle(clip: Clip): CSSProperties {
  const transform = clip.transforms;
  return {
    transform: `translate(${transform.position.x}px, ${transform.position.y}px) scale(${transform.scale.x}, ${transform.scale.y}) rotate(${transform.rotation}deg)`,
    opacity: transform.opacity,
    filter: buildFilter(clip),
  };
}

function buildFilter(clip: Clip): string | undefined {
  if (!clip.effects?.length) return undefined;
  const factor = (value: number | undefined, fallback: number) =>
    value === undefined ? String(fallback) : value > 10 ? `${value}%` : String(value);
  const parts = clip.effects.flatMap((effect) => {
    const params = effect.params ?? {};
    const name = (effect.id || effect.name || '').toLowerCase();
    if (name === 'blur') return [`blur(${params.amount ?? params.radius ?? 4}px)`];
    if (name === 'brightness') return [`brightness(${factor(params.amount ?? params.value, 1.1)})`];
    if (name === 'contrast') return [`contrast(${factor(params.amount ?? params.value, 1.1)})`];
    if (name === 'saturation') return [`saturate(${factor(params.amount ?? params.value, 1.2)})`];
    if (name === 'grayscale') return [`grayscale(${params.amount ?? params.value ?? 1})`];
    if (name === 'sepia') return [`sepia(${params.amount ?? params.value ?? 1})`];
    if (name === 'invert') return [`invert(${params.amount ?? params.value ?? 1})`];
    return [];
  });
  return parts.length ? parts.join(' ') : undefined;
}

function textStyle(clip: Clip): CSSProperties {
  return {
    ...clipTransformStyle(clip),
    color: clip.style?.color ?? '#ffffff',
    fontFamily: clip.style?.fontFamily ?? 'Inter, sans-serif',
    fontSize: clip.style?.fontSize ?? 72,
    fontWeight: clip.style?.fontWeight ?? 700,
    textAlign: clip.style?.textAlign ?? 'center',
    backgroundColor: clip.style?.backgroundColor ?? 'transparent',
    padding: clip.style?.backgroundColor ? '12px 18px' : 0,
  };
}

function graphicElementStyle(clip: Clip): CSSProperties {
  const element = clip.element;
  const transform = clip.transforms;
  const isLine = element?.elementType === 'line';
  const shape = element?.shape ?? 'rectangle';
  const color = element?.color ?? '#ffffff';
  const width = isLine ? 360 : 320;
  const height = isLine ? Math.max(2, element?.strokeWidth ?? 4) : 180;

  return {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width,
    height,
    backgroundColor: color,
    borderRadius: shape === 'circle' ? '9999px' : shape === 'rectangle' ? '8px' : '4px',
    clipPath: shape === 'triangle' ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : undefined,
    transform: `translate(calc(-50% + ${transform.position.x}px), calc(-50% + ${transform.position.y}px)) scale(${transform.scale.x}, ${transform.scale.y}) rotate(${transform.rotation}deg)`,
    opacity: transform.opacity,
    filter: buildFilter(clip),
  };
}

function SceneClip({
  clip,
  locked,
  selected,
  onSelect,
  onTransform,
  onRotate,
}: {
  clip: Clip;
  locked: boolean;
  selected: boolean;
  onSelect: (clipId: string, event?: React.MouseEvent) => void;
  onTransform: (bounds: { x: number; y: number; width: number; height: number }) => void;
  onRotate: (rotation: number) => void;
}) {
  const duration = Math.max(1, clip.duration ?? 5000);
  const sourceIn = clip.trimStart ? msToSeconds(clip.trimStart) : undefined;
  const sourceOut = clip.trimEnd ? msToSeconds(clip.trimEnd) : undefined;
  const baseStyle = clipTransformStyle(clip);
  const selectedBounds = {
    x: 320 + clip.transforms.position.x,
    y: 180 + clip.transforms.position.y,
    width: Math.max(96, 1280 * clip.transforms.scale.x),
    height: Math.max(54, 720 * clip.transforms.scale.y),
    rotation: clip.transforms.rotation,
  };

  return (
    <Timegroup
      id={clip.id}
      mode="fixed"
      offset={msToSeconds(clip.startTime)}
      duration={msToSeconds(duration)}
      className="absolute inset-0 h-full w-full overflow-hidden"
      data-clip-id={clip.id}
      data-element-id={clip.id}
      onClick={(event: React.MouseEvent) => {
        if (locked) {
          event.stopPropagation();
          return;
        }
        onSelect(clip.id, event);
      }}
      style={{ zIndex: clip.layer ?? 0, pointerEvents: locked ? 'none' : undefined }}
    >
      {clip.type === 'text' ? (
        <EfText
          duration={msToSeconds(duration)}
          className="absolute left-1/2 top-1/2 max-w-[86%] -translate-x-1/2 -translate-y-1/2 whitespace-pre-wrap leading-tight"
          style={textStyle(clip)}
        >
          {clip.text || clip.name || 'Text'}
        </EfText>
      ) : clip.type === 'element' ? (
        <div
          role="img"
          aria-label={clip.name || 'Graphic element'}
          data-editor-graphic-element={clip.element?.shape ?? 'rectangle'}
          style={graphicElementStyle(clip)}
        />
      ) : clip.type === 'image' ? (
        <EfImage
          src={clip.url}
          duration={msToSeconds(duration)}
          className="absolute inset-0 size-full object-cover"
          style={baseStyle}
        />
      ) : (
        <Video
          src={clip.url}
          sourcein={sourceIn}
          sourceout={sourceOut}
          className="absolute inset-0 size-full object-cover"
          style={baseStyle}
        />
      )}
      {selected && !locked ? (
        <TransformHandles
          bounds={selectedBounds}
          enableResize
          enableRotation
          enableDrag
          lockAspectRatio
          onBoundsChange={(event: CustomEvent<{ bounds: { x: number; y: number; width: number; height: number } }>) =>
            onTransform(event.detail.bounds)
          }
          onRotationChange={(event: CustomEvent<{ rotation: number }>) => onRotate(event.detail.rotation)}
        />
      ) : null}
    </Timegroup>
  );
}

function AudioLayer({ track }: { track: AudioTrack }) {
  const duration = Math.max(1, track.duration ?? 5000);
  const sourceIn = track.trimStart ? msToSeconds(track.trimStart) : undefined;
  const sourceOut = track.trimEnd ? msToSeconds(track.trimEnd) : undefined;

  return (
    <Timegroup mode="fixed" offset={msToSeconds(track.startTime)} duration={msToSeconds(duration)} data-audio-id={track.id}>
      <Audio
        src={track.url}
        volume={track.isMuted ? 0 : track.volume ?? 1}
        sourcein={sourceIn}
        sourceout={sourceOut}
      />
    </Timegroup>
  );
}

function TimelineTrackControls({
  trackId,
  label,
  type,
}: {
  trackId: string;
  label: string;
  type: 'visual' | 'audio';
}) {
  const trackControl = useVideoEditorStore((state) => state.trackControls[trackId]);
  const toggleTrackLocked = useVideoEditorStore((state) => state.toggleTrackLocked);
  const toggleTrackVisible = useVideoEditorStore((state) => state.toggleTrackVisible);
  const toggleTrackMuted = useVideoEditorStore((state) => state.toggleTrackMuted);
  const locked = trackControl?.locked ?? false;
  const visible = trackControl?.visible ?? true;
  const muted = trackControl?.muted ?? false;
  const buttonClass = 'inline-flex h-6 w-6 items-center justify-center rounded text-zinc-500 transition hover:bg-white/10 hover:text-white';

  return (
    <div className="ml-auto flex items-center gap-0.5">
      <button
        type="button"
        className={buttonClass}
        aria-label={`${locked ? 'Unlock' : 'Lock'} ${label}`}
        title={`${locked ? 'Unlock' : 'Lock'} ${label}`}
        onClick={(event) => {
          event.stopPropagation();
          toggleTrackLocked(trackId);
        }}
      >
        {locked ? <Lock size={13} /> : <Unlock size={13} />}
      </button>
      <button
        type="button"
        className={buttonClass}
        aria-label={`${visible ? 'Hide' : 'Show'} ${label}`}
        title={`${visible ? 'Hide' : 'Show'} ${label}`}
        onClick={(event) => {
          event.stopPropagation();
          toggleTrackVisible(trackId);
        }}
      >
        {visible ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>
      {type === 'audio' ? (
        <button
          type="button"
          className={buttonClass}
          aria-label={`${muted ? 'Unmute' : 'Mute'} ${label}`}
          title={`${muted ? 'Unmute' : 'Mute'} ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            toggleTrackMuted(trackId);
          }}
        >
          {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>
      ) : null}
    </div>
  );
}

function buildTimelineComponent(
  compositionId: string,
  clips: Clip[],
  audioTracks: AudioTrack[],
  composition: CompositionSettings,
  selectedClipIds: string[],
  lockedTrackIds: Set<string>,
  onSelectClip: (clipId: string, event?: React.MouseEvent) => void,
  onTransformClip: (clip: Clip, bounds: { x: number; y: number; width: number; height: number }) => void,
  onRotateClip: (clip: Clip, rotation: number) => void
) {
  return function EditframeTimeline() {
    const sortedClips = [...clips].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0) || (a.startTime ?? 0) - (b.startTime ?? 0));

    return (
      <Timegroup
        id={compositionId}
        mode="contain"
        duration={msToSeconds(composition.duration || 5000)}
        fps={composition.fps}
        className="relative overflow-hidden"
        style={{
          width: composition.width,
          height: composition.height,
          background: composition.backgroundColor || '#000',
        }}
      >
        {sortedClips.length === 0 ? (
          <Timegroup mode="fixed" duration="5s" className="absolute inset-0 h-full w-full bg-black" />
        ) : null}
        {sortedClips.map((clip) => (
          <SceneClip
            key={clip.id}
            clip={clip}
            locked={lockedTrackIds.has(`visual-${clip.layer ?? clip.trackIndex ?? 0}`)}
            selected={selectedClipIds.includes(clip.id)}
            onSelect={onSelectClip}
            onTransform={(bounds) => onTransformClip(clip, bounds)}
            onRotate={(rotation) => onRotateClip(clip, rotation)}
          />
        ))}
        {audioTracks.map((track) => (
          <AudioLayer key={track.id} track={track} />
        ))}
      </Timegroup>
    );
  };
}

export function EditframeWorkbenchCanvas({
  clips,
  audioTracks,
  composition,
}: EditframeWorkbenchCanvasProps) {
  const compositionId = 'wzrd-editor-composition';
  const canvasId = 'wzrd-editor-canvas';
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [timelineNode, setTimelineNode] = useState<HTMLDivElement | null>(null);
  const canvasDropRef = useRef<HTMLDivElement | null>(null);
  const suppressNextTimelineClickRef = useRef(false);
  const suppressNextTimelineItemClickRef = useRef(false);
  const selectionDragCleanupRef = useRef<(() => void) | null>(null);
  const itemDragCleanupRef = useRef<(() => void) | null>(null);
  const [selectionDrag, setSelectionDrag] = useState<TimelineSelectionDragState | null>(null);
  const timelineViewportWidth = useElementWidth(timelineNode);
  const addClip = useVideoEditorStore((state) => state.addClip);
  const addAudioTrack = useVideoEditorStore((state) => state.addAudioTrack);
  const updateClip = useVideoEditorStore((state) => state.updateClip);
  const selectClip = useVideoEditorStore((state) => state.selectClip);
  const selectAudioTrack = useVideoEditorStore((state) => state.selectAudioTrack);
  const clearClipSelection = useVideoEditorStore((state) => state.clearClipSelection);
  const clearAudioTrackSelection = useVideoEditorStore((state) => state.clearAudioTrackSelection);
  const clearKeyframeSelection = useVideoEditorStore((state) => state.clearKeyframeSelection);
  const selectedClipIds = useVideoEditorStore((state) => state.selectedClipIds);
  const keyframes = useVideoEditorStore((state) => state.keyframes);
  const selectedKeyframeIds = useVideoEditorStore((state) => state.selectedKeyframeIds);
  const selectKeyframe = useVideoEditorStore((state) => state.selectKeyframe);
  const bookmarks = useVideoEditorStore((state) => state.bookmarks);
  const setCurrentTime = useVideoEditorStore((state) => state.setCurrentTime);
  const trackControls = useVideoEditorStore((state) => state.trackControls);
  const playback = useVideoEditorStore((state) => state.playback);
  const [timelinePixelsPerSecond, setTimelinePixelsPerSecond] = useState(EDITOR_TIMELINE_DEFAULT_PIXELS_PER_SECOND);
  const [timelineScrollLeft, setTimelineScrollLeft] = useState(0);

  const timelineClips = useMemo(
    () =>
      clips.filter((clip) => {
        const trackId = `visual-${clip.layer ?? clip.trackIndex ?? 0}`;
        return trackControls[trackId]?.visible !== false;
      }),
    [clips, trackControls]
  );
  const timelineAudioTracks = useMemo(
    () =>
      audioTracks
        .filter((track) => trackControls[`audio-${track.trackIndex ?? 0}`]?.visible !== false)
        .map((track) => {
          const control = trackControls[`audio-${track.trackIndex ?? 0}`];
          return control?.muted ? { ...track, isMuted: true } : track;
        }),
    [audioTracks, trackControls]
  );
  const previewClips = useMemo(
    () => timelineClips.map((clip) => evaluateOpenCutClipAtTime(clip, keyframes, playback.currentTime)),
    [keyframes, playback.currentTime, timelineClips]
  );
  const previewAudioTracks = useMemo(
    () => timelineAudioTracks.map((track) => evaluateOpenCutAudioAtTime(track, keyframes, playback.currentTime)),
    [keyframes, playback.currentTime, timelineAudioTracks]
  );
  const lockedTrackIds = useMemo(
    () =>
      new Set(
        Object.entries(trackControls)
          .filter(([, control]) => control.locked)
          .map(([trackId]) => trackId)
      ),
    [trackControls]
  );

  const compositionDuration = useMemo(() => {
    const visualEnd = timelineClips.reduce((cursor, clip) => Math.max(cursor, getEndTime(clip)), 0);
    const audioEnd = timelineAudioTracks.reduce((cursor, track) => Math.max(cursor, getEndTime(track)), 0);
    return Math.max(composition.duration || 0, visualEnd, audioEnd, 5000);
  }, [composition.duration, timelineAudioTracks, timelineClips]);

  const timelineMetrics = useMemo(
    () =>
      buildEditorTimelineMetrics({
        durationMs: compositionDuration,
        fps: composition.fps,
        pixelsPerSecond: timelinePixelsPerSecond,
        scrollLeft: timelineScrollLeft,
        viewportWidth: timelineViewportWidth,
      }),
    [composition.fps, compositionDuration, timelinePixelsPerSecond, timelineScrollLeft, timelineViewportWidth]
  );

  const selectedRange = useMemo(() => {
    const selected = timelineClips.filter((clip) => selectedClipIds.includes(clip.id));
    if (selected.length === 0) return null;
    const startMs = Math.min(...selected.map((clip) => clip.startTime ?? 0));
    const endMs = Math.max(...selected.map((clip) => getEndTime(clip)));
    return { startMs, endMs };
  }, [selectedClipIds, timelineClips]);

  const setTimelineZoomPreset = useCallback((mode: 'fit' | 'minutes' | 'seconds' | 'frames' | 'selection') => {
    setTimelinePixelsPerSecond((current) => {
      if (mode === 'fit') return fitEditorProject(compositionDuration, timelineViewportWidth);
      if (mode === 'selection' && selectedRange) {
        return fitEditorSelection(selectedRange.startMs, selectedRange.endMs, timelineViewportWidth);
      }
      if (mode === 'minutes') return 1;
      if (mode === 'seconds') return 80;
      if (mode === 'frames') return 900;
      return current;
    });
  }, [compositionDuration, selectedRange, timelineViewportWidth]);

  const zoomTimelineBy = useCallback((factor: number) => {
    setTimelinePixelsPerSecond((current) => clampEditorTimelinePixelsPerSecond(current * factor));
  }, []);

  const handleTimelineKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomTimelineBy(1.25);
      return;
    }
    if (event.key === '-') {
      event.preventDefault();
      zoomTimelineBy(0.8);
      return;
    }
    if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      setTimelineZoomPreset(event.shiftKey || !selectedRange ? 'fit' : 'selection');
    }
  }, [selectedRange, setTimelineZoomPreset, zoomTimelineBy]);

  const appendMedia = useCallback(
    async (item: LibraryMediaItem, options?: { startTime?: number; layer?: number; position?: { x: number; y: number } }) => {
      if (!item.url) return;
      const preparedItem = await prepareEditorMediaForPlayback(item, {
        operationId: `editor-drag-${item.id}-${Date.now()}`,
      });
      const durationMs = clampDurationMs(item.durationSeconds, item.mediaType === 'image' ? 5 : 6);
      const startTime = options?.startTime ?? (item.mediaType === 'audio'
        ? audioTracks.reduce((cursor, track) => Math.max(cursor, getEndTime(track)), 0)
        : timelineClips.reduce((cursor, clip) => Math.max(cursor, getEndTime(clip)), 0));

      if (item.mediaType === 'audio') {
        const track: AudioTrack = {
          id: uuidv4(),
          mediaItemId: preparedItem.id,
          type: 'audio',
          name: preparedItem.name,
          url: preparedItem.url ?? '',
          sourcePath: preparedItem.sourcePath,
          playbackUrl: preparedItem.playbackUrl,
          proxyUrl: preparedItem.proxyUrl,
          proxyPath: preparedItem.proxyPath,
          mediaStatus: preparedItem.mediaStatus,
          mediaError: preparedItem.mediaError,
          startTime,
          duration: durationMs,
          endTime: startTime + durationMs,
          volume: 1,
          isMuted: false,
          trackIndex: options?.layer ?? 0,
          fadeInDuration: 0,
          fadeOutDuration: 0,
        };
        addAudioTrack(track);
        selectAudioTrack(track.id);
        return;
      }

      const clip: Clip = {
        id: uuidv4(),
        mediaItemId: preparedItem.id,
        type: item.mediaType === 'image' ? 'image' : 'video',
        name: preparedItem.name,
        url: preparedItem.url ?? '',
        sourcePath: preparedItem.sourcePath,
        playbackUrl: preparedItem.playbackUrl,
        proxyUrl: preparedItem.proxyUrl,
        proxyPath: preparedItem.proxyPath,
        mediaStatus: preparedItem.mediaStatus,
        mediaError: preparedItem.mediaError,
        startTime,
        duration: durationMs,
        endTime: startTime + durationMs,
        trackIndex: options?.layer ?? 0,
        layer: options?.layer ?? 0,
        transforms: {
          position: options?.position ?? { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          opacity: 1,
        },
      };
      addClip(clip);
      selectClip(clip.id);
    },
    [addAudioTrack, addClip, audioTracks, timelineClips, selectAudioTrack, selectClip]
  );

  const handleSelectClip = useCallback(
    (clipId: string, event?: React.MouseEvent) => {
      event?.stopPropagation();
      selectClip(clipId, event?.shiftKey);
    },
    [selectClip]
  );

  const handleTransformClip = useCallback(
    (clip: Clip, bounds: { x: number; y: number; width: number; height: number }) => {
      updateClip(
        clip.id,
        {
          transforms: {
            ...clip.transforms,
            position: {
              x: bounds.x - 320,
              y: bounds.y - 180,
            },
            scale: {
              x: Math.max(0.05, bounds.width / 1280),
              y: Math.max(0.05, bounds.height / 720),
            },
          },
        },
        { skipHistory: true }
      );
    },
    [updateClip]
  );

  const handleRotateClip = useCallback(
    (clip: Clip, rotation: number) => {
      updateClip(clip.id, { transforms: { ...clip.transforms, rotation } }, { skipHistory: true });
    },
    [updateClip]
  );

  const handleTimelineClipTrimEnd = useCallback(
    (clip: Clip, event: CustomEvent<{ value: { startMs: number; endMs: number } }>) => {
      event.stopPropagation();
      const startTime = Math.max(0, event.detail.value.startMs);
      const endTime = Math.max(startTime + 100, event.detail.value.endMs);
      const startDeltaMs = startTime - (clip.startTime ?? 0);
      const endDeltaMs = endTime - getEndTime(clip);

      if (!useVideoEditorStore.getState().selectedClipIds.includes(clip.id)) {
        selectClip(clip.id);
      }

      trimSelectionEdges({ startDeltaMs, endDeltaMs });
    },
    [selectClip]
  );

  const handleSelectTimelineKeyframe = useCallback(
    (keyframe: Keyframe, event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (suppressNextTimelineItemClickRef.current) {
        suppressNextTimelineItemClickRef.current = false;
        return;
      }
      selectKeyframe(keyframe.id, event.shiftKey);
      setCurrentTime(keyframe.time);
    },
    [selectKeyframe, setCurrentTime]
  );

  const handleTimelineKeyframePointerDown = useCallback(
    (keyframe: Keyframe, event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button > 0) return;

      event.preventDefault();
      event.stopPropagation();
      itemDragCleanupRef.current?.();
      selectKeyframe(keyframe.id, event.shiftKey);

      const origin = { x: event.clientX, y: event.clientY };
      let latest = origin;

      const cleanup = () => {
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleUp);
        document.removeEventListener('pointercancel', handleUp);
        itemDragCleanupRef.current = null;
      };

      const handleMove = (moveEvent: PointerEvent) => {
        latest = { x: moveEvent.clientX, y: moveEvent.clientY };
      };

      const handleUp = (upEvent: PointerEvent) => {
        const point = Number.isFinite(upEvent.clientX) && Number.isFinite(upEvent.clientY)
          ? { x: upEvent.clientX, y: upEvent.clientY }
          : latest;
        const active = getDragDistance(origin, point) > SELECTION_DRAG_THRESHOLD_PX;
        cleanup();
        if (!active) return;

        const deltaMs = editorXToTimeMs(point.x - origin.x, timelineMetrics.pixelsPerSecond);
        moveSelectedKeyframes({ deltaMs, snapToGrid: true });
        suppressNextTimelineClickRef.current = true;
        suppressNextTimelineItemClickRef.current = true;
      };

      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleUp);
      document.addEventListener('pointercancel', handleUp);
      itemDragCleanupRef.current = cleanup;
    },
    [selectKeyframe, timelineMetrics.pixelsPerSecond]
  );

  const TimelineComponent = useMemo(
    () =>
      buildTimelineComponent(
        compositionId,
        previewClips,
        previewAudioTracks,
        { ...composition, duration: compositionDuration },
        selectedClipIds,
        lockedTrackIds,
        handleSelectClip,
        handleTransformClip,
        handleRotateClip
      ),
    [composition, compositionDuration, handleRotateClip, handleSelectClip, handleTransformClip, lockedTrackIds, previewAudioTracks, previewClips, selectedClipIds]
  );

  const [{ isOver: isOverTimeline }, attachTimelineDrop] = useDrop<{ mediaItem: LibraryMediaItem }>({
    accept: 'MEDIA_ITEM',
    drop: (dragItem, monitor) => {
      const offset = monitor.getClientOffset();
      const rect = timelineRef.current?.getBoundingClientRect();
      const mediaItem = dragItem?.mediaItem;
      if (!offset || !rect || !mediaItem) return;
      const x = Math.max(0, offset.x - rect.left + (timelineRef.current?.scrollLeft ?? 0));
      const y = Math.max(0, offset.y - rect.top - TIMELINE_RULER_HEIGHT);
      const startTime = Math.round(editorXToTimeMs(x, timelineMetrics.pixelsPerSecond) / 100) * 100;
      const layer = mediaItem.mediaType === 'audio'
        ? Math.max(0, Math.floor((y - VISUAL_TRACK_HEIGHT * 3) / AUDIO_TRACK_HEIGHT))
        : Math.max(0, Math.floor(y / VISUAL_TRACK_HEIGHT));
      const trackId = mediaItem.mediaType === 'audio' ? `audio-${layer}` : `visual-${layer}`;
      if (lockedTrackIds.has(trackId)) return;
      void appendMedia(mediaItem, { startTime, layer });
    },
    collect: (monitor) => ({ isOver: monitor.isOver(), canDrop: monitor.canDrop() }),
  });

  const [{ isOver: isOverCanvas }, attachCanvasDrop] = useDrop<{ mediaItem: LibraryMediaItem }>({
    accept: 'MEDIA_ITEM',
    drop: (dragItem, monitor) => {
      const offset = monitor.getClientOffset();
      const rect = canvasDropRef.current?.getBoundingClientRect();
      const mediaItem = dragItem?.mediaItem;
      if (!offset || !rect || !mediaItem) return;
      const relativeX = ((offset.x - rect.left) / Math.max(1, rect.width) - 0.5) * composition.width;
      const relativeY = ((offset.y - rect.top) / Math.max(1, rect.height) - 0.5) * composition.height;
      void appendMedia(mediaItem, {
        startTime: playback.currentTime,
        layer: mediaItem.mediaType === 'audio' ? 0 : Math.max(0, clips.length),
        position: { x: Math.round(relativeX), y: Math.round(relativeY) },
      });
    },
    collect: (monitor) => ({ isOver: monitor.isOver(), canDrop: monitor.canDrop() }),
  });

  const setTimelineDropRef = useCallback(
    (node: HTMLDivElement | null) => {
      timelineRef.current = node;
      setTimelineNode((current) => (current === node ? current : node));
      attachTimelineDrop(node);
    },
    [attachTimelineDrop]
  );

  const setCanvasDropRef = useCallback(
    (node: HTMLDivElement | null) => {
      canvasDropRef.current = node;
      attachCanvasDrop(node);
    },
    [attachCanvasDrop]
  );

  const hasContent = clips.length > 0 || audioTracks.length > 0;
  const visualLayers = useMemo(() => {
    const maxLayer = clips.reduce((max, clip) => Math.max(max, clip.layer ?? 0), 0);
    return Array.from({ length: Math.max(3, maxLayer + 1) }, (_, index) => index);
  }, [clips]);
  const audioLayers = useMemo(() => {
    const maxLayer = audioTracks.reduce((max, track) => Math.max(max, track.trackIndex ?? 0), 0);
    return Array.from({ length: Math.max(2, maxLayer + 1) }, (_, index) => index);
  }, [audioTracks]);

  const getTimelineContentPoint = useCallback((event: Pick<PointerEvent | React.PointerEvent<HTMLDivElement>, 'clientX' | 'clientY'>) => {
    const scrollElement = timelineRef.current;
    if (!scrollElement) return null;
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return null;
    const rect = scrollElement.getBoundingClientRect();
    return {
      x: event.clientX - rect.left + scrollElement.scrollLeft,
      y: event.clientY - rect.top + scrollElement.scrollTop,
    };
  }, []);

  const resolveMarqueeSelection = useCallback(
    (rectangle: TimelineSelectionRectangle) => {
      const selection = normalizeRectangle(rectangle);
      const clipIds: string[] = [];
      const audioTrackIds: string[] = [];

      timelineClips.forEach((clip) => {
        const layer = clip.layer ?? clip.trackIndex ?? 0;
        const trackId = `visual-${layer}`;
        if (lockedTrackIds.has(trackId)) return;
        const bounds = {
          left: editorTimeToX(clip.startTime ?? 0, timelineMetrics.pixelsPerSecond),
          right: editorTimeToX(getEndTime(clip), timelineMetrics.pixelsPerSecond),
          top: TIMELINE_RULER_HEIGHT + layer * VISUAL_TRACK_HEIGHT,
          bottom: TIMELINE_RULER_HEIGHT + (layer + 1) * VISUAL_TRACK_HEIGHT,
        };
        if (rectanglesIntersect(selection, bounds)) {
          clipIds.push(clip.id);
        }
      });

      timelineAudioTracks.forEach((track) => {
        const layer = track.trackIndex ?? 0;
        const trackId = `audio-${layer}`;
        if (lockedTrackIds.has(trackId)) return;
        const rowTop = TIMELINE_RULER_HEIGHT + visualLayers.length * VISUAL_TRACK_HEIGHT + layer * AUDIO_TRACK_HEIGHT;
        const bounds = {
          left: editorTimeToX(track.startTime ?? 0, timelineMetrics.pixelsPerSecond),
          right: editorTimeToX(getEndTime(track), timelineMetrics.pixelsPerSecond),
          top: rowTop,
          bottom: rowTop + AUDIO_TRACK_HEIGHT,
        };
        if (rectanglesIntersect(selection, bounds)) {
          audioTrackIds.push(track.id);
        }
      });

      return { clipIds, audioTrackIds };
    },
    [lockedTrackIds, timelineAudioTracks, timelineClips, timelineMetrics.pixelsPerSecond, visualLayers.length]
  );

  const applyMarqueeSelection = useCallback(
    (rectangle: TimelineSelectionRectangle) => {
      const result = resolveMarqueeSelection(rectangle);
      clearClipSelection();
      clearAudioTrackSelection();
      clearKeyframeSelection();

      let additive = false;
      result.clipIds.forEach((clipId) => {
        selectClip(clipId, additive);
        additive = true;
      });
      result.audioTrackIds.forEach((trackId) => {
        selectAudioTrack(trackId, additive);
        additive = true;
      });
    },
    [clearAudioTrackSelection, clearClipSelection, clearKeyframeSelection, resolveMarqueeSelection, selectAudioTrack, selectClip]
  );

  const handleTimelineEmptyClick = useCallback(() => {
    if (suppressNextTimelineClickRef.current) {
      suppressNextTimelineClickRef.current = false;
      return;
    }
    clearClipSelection();
    clearAudioTrackSelection();
    clearKeyframeSelection();
  }, [clearAudioTrackSelection, clearClipSelection, clearKeyframeSelection]);

  const handleTimelineSelectionPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button > 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, input, textarea, select, [data-editframe-timeline-interactive="true"]')) {
        return;
      }

      const origin = getTimelineContentPoint(event);
      if (!origin) return;

      event.preventDefault();
      selectionDragCleanupRef.current?.();
      setSelectionDrag({ origin, current: origin, active: false });

      let latest = origin;

      const cleanup = () => {
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleUp);
        document.removeEventListener('pointercancel', handleUp);
        selectionDragCleanupRef.current = null;
      };

      const handleMove = (moveEvent: PointerEvent) => {
        const point = getTimelineContentPoint(moveEvent);
        if (!point) return;
        latest = point;
        setSelectionDrag({
          origin,
          current: point,
          active: getDragDistance(origin, point) > SELECTION_DRAG_THRESHOLD_PX,
        });
      };

      const handleUp = (upEvent: PointerEvent) => {
        const point = getTimelineContentPoint(upEvent) ?? latest;
        const active = getDragDistance(origin, point) > SELECTION_DRAG_THRESHOLD_PX;
        cleanup();
        if (active) {
          applyMarqueeSelection(toSelectionRectangle(origin, point));
          suppressNextTimelineClickRef.current = true;
        } else if (origin.y <= TIMELINE_RULER_HEIGHT) {
          setCurrentTime(Math.max(0, Math.min(compositionDuration, editorXToTimeMs(origin.x, timelineMetrics.pixelsPerSecond))));
          suppressNextTimelineClickRef.current = true;
        }
        setSelectionDrag(null);
      };

      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleUp);
      document.addEventListener('pointercancel', handleUp);
      selectionDragCleanupRef.current = cleanup;
    },
    [applyMarqueeSelection, compositionDuration, getTimelineContentPoint, setCurrentTime, timelineMetrics.pixelsPerSecond]
  );

  const handleTimelineItemPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, item: TimelineItemDragInput) => {
      if (event.button > 0) return;

      event.preventDefault();
      event.stopPropagation();
      itemDragCleanupRef.current?.();

      const state = useVideoEditorStore.getState();
      if (item.kind === 'clip' && !state.selectedClipIds.includes(item.id)) {
        selectClip(item.id, event.shiftKey);
      }
      if (item.kind === 'audio' && !state.selectedAudioTrackIds.includes(item.id)) {
        selectAudioTrack(item.id, event.shiftKey);
      }

      const origin = { x: event.clientX, y: event.clientY };
      let latest = origin;

      const cleanup = () => {
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleUp);
        document.removeEventListener('pointercancel', handleUp);
        itemDragCleanupRef.current = null;
      };

      const handleMove = (moveEvent: PointerEvent) => {
        latest = { x: moveEvent.clientX, y: moveEvent.clientY };
      };

      const handleUp = (upEvent: PointerEvent) => {
        const point = Number.isFinite(upEvent.clientX) && Number.isFinite(upEvent.clientY)
          ? { x: upEvent.clientX, y: upEvent.clientY }
          : latest;
        const active = getDragDistance(origin, point) > SELECTION_DRAG_THRESHOLD_PX;
        cleanup();
        if (!active) return;

        const deltaMs = editorXToTimeMs(point.x - origin.x, timelineMetrics.pixelsPerSecond);
        const trackDelta = Math.round((point.y - origin.y) / item.rowHeight);
        moveSelection({ deltaMs, trackDelta, snapToGrid: true });
        suppressNextTimelineClickRef.current = true;
        suppressNextTimelineItemClickRef.current = true;
      };

      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleUp);
      document.addEventListener('pointercancel', handleUp);
      itemDragCleanupRef.current = cleanup;
    },
    [selectAudioTrack, selectClip, timelineMetrics.pixelsPerSecond]
  );

  useEffect(
    () => () => {
      selectionDragCleanupRef.current?.();
      itemDragCleanupRef.current?.();
    },
    []
  );

  if (!hasContent) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" style={{ background: editorTheme.bg.primary }}>
        <div className="flex flex-1 items-center justify-center p-8">
          <div
            className="flex aspect-video w-full max-w-[884px] flex-col items-center justify-center gap-3 rounded-lg border"
            style={{
              background: editorTheme.bg.secondary,
              borderColor: editorTheme.border.subtle,
              color: editorTheme.text.tertiary,
            }}
          >
            <Film size={48} strokeWidth={1} style={{ opacity: 0.4 }} />
            <span style={{ fontSize: typography.fontSize.md }}>Add media to the timeline to preview</span>
            <span style={{ fontSize: typography.fontSize.sm, color: editorTheme.text.disabled }}>
              Click an asset, drag to canvas, or drag to a timeline track
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ background: editorTheme.bg.primary }}>
      <div
        ref={setCanvasDropRef}
        className={`relative flex min-h-[280px] flex-1 items-center justify-center overflow-hidden border-b border-white/10 bg-black/85 p-6 ${isOverCanvas ? 'ring-2 ring-orange-400' : ''}`}
        onClick={() => {
          const state = useVideoEditorStore.getState();
          state.clearClipSelection();
          state.clearAudioTrackSelection();
          state.clearKeyframeSelection();
        }}
      >
        <EditorPreviewStage
          clips={previewClips}
          audioTracks={previewAudioTracks}
          composition={{ ...composition, duration: compositionDuration }}
          currentTimeMs={playback.currentTime}
          isPlaying={playback.isPlaying}
          volume={playback.volume}
          selectedClipIds={selectedClipIds}
          lockedTrackIds={lockedTrackIds}
          onSelectClip={handleSelectClip}
        />
      </div>

      <div className="flex h-[286px] min-h-[240px] flex-col border-t border-white/10 bg-[#101010]">
          <EditorPlaybackStrip durationMs={compositionDuration} fps={composition.fps} />
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/25 px-3 py-1.5 text-xs text-zinc-400">
            <span className="font-medium uppercase tracking-wide text-zinc-500">Timeline</span>
            <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 p-1">
              <button
                type="button"
                className="rounded px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/10"
                onClick={() => setTimelineZoomPreset('fit')}
              >
                Fit
              </button>
              <button
                type="button"
                className="rounded px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/10"
                onClick={() => setTimelineZoomPreset('minutes')}
              >
                Min
              </button>
              <button
                type="button"
                className="rounded px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/10"
                onClick={() => setTimelineZoomPreset('seconds')}
              >
                Sec
              </button>
              <button
                type="button"
                className="rounded px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/10"
                onClick={() => setTimelineZoomPreset('frames')}
              >
                Frame
              </button>
            </div>
            <span className="hidden text-[10px] uppercase tracking-wide text-zinc-500 lg:inline">
              {timelineMetrics.mode}
            </span>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[168px_1fr]">
            <div className="border-r border-white/10 bg-black/20 text-xs text-zinc-400">
              <div className="flex h-7 items-center px-3 text-[11px] uppercase tracking-wide text-zinc-500">Layers</div>
              {visualLayers.map((layer) => {
                const label = `Visual ${layer + 1}`;
                return (
                  <div key={`visual-label-${layer}`} className="flex items-center gap-2 border-t border-white/5 px-3" style={{ height: VISUAL_TRACK_HEIGHT }}>
                    <Layers size={14} />
                    <span>{label}</span>
                    <TimelineTrackControls trackId={`visual-${layer}`} label={label} type="visual" />
                  </div>
                );
              })}
              {audioLayers.map((layer) => {
                const label = `Audio ${layer + 1}`;
                return (
                  <div key={`audio-label-${layer}`} className="flex items-center gap-2 border-t border-white/5 px-3" style={{ height: AUDIO_TRACK_HEIGHT }}>
                    <Music size={14} />
                    <span>{label}</span>
                    <TimelineTrackControls trackId={`audio-${layer}`} label={label} type="audio" />
                  </div>
                );
              })}
            </div>

            <div
              ref={setTimelineDropRef}
              className={`relative min-h-0 overflow-auto ${isOverTimeline ? 'bg-orange-500/10' : ''}`}
              tabIndex={0}
              onKeyDown={handleTimelineKeyDown}
              onClick={handleTimelineEmptyClick}
              onPointerDown={handleTimelineSelectionPointerDown}
              onScroll={(event) => setTimelineScrollLeft(event.currentTarget.scrollLeft)}
              aria-label="Editor timeline"
            >
              {selectionDrag?.active ? (
                <div
                  aria-hidden="true"
                  data-testid="editframe-timeline-selection-box"
                  className="pointer-events-none absolute z-[120] rounded-sm border border-orange-300/80 bg-orange-400/15"
                  style={toSelectionOverlayStyle(selectionDrag.origin, selectionDrag.current)}
                />
              ) : null}
              <div
                className="relative"
                style={{ width: timelineMetrics.timelineWidth, minHeight: 28 + visualLayers.length * VISUAL_TRACK_HEIGHT + audioLayers.length * AUDIO_TRACK_HEIGHT }}
              >
                <div className="relative h-7 select-none border-b border-white/10 bg-black/30 font-mono text-[10px] text-zinc-500">
                  {timelineMetrics.ticks.map((tick) => (
                    <div
                      key={`${tick.timeMs}-${tick.kind}`}
                      className="absolute bottom-0 flex h-full flex-col items-center justify-end"
                      style={{ left: tick.contentX }}
                    >
                      {tick.label ? (
                        <span className="mb-1 tabular-nums text-zinc-400">{tick.label}</span>
                      ) : null}
                      <span
                        className={tick.kind === 'frame' ? 'h-[3px] w-px bg-white/15' : tick.kind === 'major' ? 'h-2 w-px bg-white/35' : 'h-1 w-px bg-white/20'}
                      />
                    </div>
                  ))}
                </div>
                <div
                  aria-hidden="true"
                  data-testid="editor-timeline-playhead"
                  className="pointer-events-none absolute bottom-0 top-0 z-[95] w-px bg-orange-400 shadow-[0_0_10px_rgba(251,146,60,0.75)]"
                  style={{ left: editorTimeToX(playback.currentTime, timelineMetrics.pixelsPerSecond) }}
                >
                  <span className="absolute -left-1.5 top-0 h-3 w-3 rounded-full border border-white/80 bg-orange-400" />
                </div>
                {bookmarks.map((bookmark) => (
                  <button
                    key={bookmark.id}
                    type="button"
                    aria-label={`Seek to bookmark ${bookmark.name}`}
                    className="absolute bottom-0 top-0 z-[90] w-0 border-l-2 text-left focus:outline-none focus:ring-2 focus:ring-white/80"
                    data-editframe-timeline-interactive="true"
                    data-testid={`editframe-timeline-bookmark-${bookmark.id}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setCurrentTime(bookmark.time);
                    }}
                    style={{
                      left: editorTimeToX(bookmark.time, timelineMetrics.pixelsPerSecond),
                      borderColor: bookmark.color ?? '#f97316',
                    }}
                    title={bookmark.name}
                  >
                    <span
                      className="absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-white shadow"
                      style={{ background: bookmark.color ?? '#f97316' }}
                    >
                      {bookmark.name}
                    </span>
                  </button>
                ))}

                <div className="relative">
                  {visualLayers.map((layer) => (
                    <div key={`visual-${layer}`} className="relative border-t border-white/5" style={{ height: VISUAL_TRACK_HEIGHT }}>
                      {timelineClips.filter((clip) => (clip.layer ?? 0) === layer).map((clip) => {
                        const selected = selectedClipIds.includes(clip.id);
                        const locked = lockedTrackIds.has(`visual-${layer}`);
                        return (
                          <button
                            key={clip.id}
                            type="button"
                            aria-disabled={locked}
                            disabled={locked}
                            className="absolute top-2 flex h-10 items-center gap-2 overflow-hidden rounded border px-2 text-left text-xs transition"
                            style={{
                              left: editorTimeToX(clip.startTime ?? 0, timelineMetrics.pixelsPerSecond),
                              width: Math.max(54, editorTimeToX(clip.duration ?? 1000, timelineMetrics.pixelsPerSecond)),
                              borderColor: selected ? editorTheme.accent.primary : 'rgba(255,255,255,.12)',
                              background: selected ? 'rgba(255,107,74,.25)' : 'rgba(255,255,255,.08)',
                              color: editorTheme.text.primary,
                              cursor: locked ? 'not-allowed' : 'pointer',
                              opacity: locked ? 0.5 : 1,
                            }}
                            onPointerDown={(event) => {
                              if (locked) return;
                              handleTimelineItemPointerDown(event, {
                                id: clip.id,
                                kind: 'clip',
                                rowHeight: VISUAL_TRACK_HEIGHT,
                              });
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (suppressNextTimelineItemClickRef.current) {
                                suppressNextTimelineItemClickRef.current = false;
                                return;
                              }
                              if (locked) return;
                              selectClip(clip.id, event.shiftKey);
                            }}
                          >
                            {clip.type === 'text' ? <Type size={14} /> : clip.type === 'image' ? <Film size={14} /> : <Film size={14} />}
                            <span className="truncate">{clip.name}</span>
                            <span className="ml-auto text-[10px] text-zinc-400">{formatTime(clip.duration ?? 0)}</span>
                            <TrimHandles
                              mode="standalone"
                              elementId={clip.id}
                              pixelsPerMs={timelineMetrics.pixelsPerMs}
                              value={{ startMs: clip.startTime ?? 0, endMs: getEndTime(clip) }}
                              intrinsicDurationMs={(clip.trimEnd ?? clip.duration ?? 0) + (clip.trimStart ?? 0)}
                              onTrimChangeEnd={(event: CustomEvent<{ value: { startMs: number; endMs: number } }>) =>
                                handleTimelineClipTrimEnd(clip, event)
                              }
                            />
                          </button>
                        );
                      })}
                      {timelineClips.filter((clip) => (clip.layer ?? 0) === layer).flatMap((clip) => {
                        const locked = lockedTrackIds.has(`visual-${layer}`);
                        return getTargetKeyframes(clip.id, clip.startTime ?? 0, getEndTime(clip), keyframes).map((keyframe) => (
                          <TimelineKeyframeMarker
                            key={keyframe.id}
                            keyframe={keyframe}
                            targetName={clip.name}
                            selected={selectedKeyframeIds.includes(keyframe.id)}
                            locked={locked}
                            pixelsPerSecond={timelineMetrics.pixelsPerSecond}
                            onSelect={handleSelectTimelineKeyframe}
                            onPointerDown={handleTimelineKeyframePointerDown}
                          />
                        ));
                      })}
                    </div>
                  ))}

                  {audioLayers.map((layer) => (
                    <div key={`audio-${layer}`} className="relative border-t border-white/5" style={{ height: AUDIO_TRACK_HEIGHT }}>
                      {timelineAudioTracks.filter((track) => (track.trackIndex ?? 0) === layer).map((track) => {
                        const locked = lockedTrackIds.has(`audio-${layer}`);
                        const sourceClip = track.sourceId ? clips.find((clip) => clip.id === track.sourceId) : undefined;
                        const sourceAudioLabel = sourceClip
                          ? `Linked source audio from ${sourceClip.name || 'source clip'}`
                          : null;
                        return (
                          <React.Fragment key={track.id}>
                            <button
                              type="button"
                              aria-label={sourceAudioLabel ? `${track.name}. ${sourceAudioLabel}` : track.name}
                              aria-disabled={locked}
                              disabled={locked}
                              title={sourceAudioLabel ?? track.name}
                              className="absolute top-2 flex h-7 items-center gap-2 overflow-hidden rounded border border-emerald-400/30 bg-emerald-400/10 px-2 text-left text-xs text-emerald-50"
                              style={{
                                left: editorTimeToX(track.startTime ?? 0, timelineMetrics.pixelsPerSecond),
                                width: Math.max(54, editorTimeToX(track.duration ?? 1000, timelineMetrics.pixelsPerSecond)),
                                cursor: locked ? 'not-allowed' : 'pointer',
                                opacity: locked ? 0.5 : 1,
                              }}
                              onPointerDown={(event) => {
                                if (locked) return;
                                handleTimelineItemPointerDown(event, {
                                  id: track.id,
                                  kind: 'audio',
                                  rowHeight: AUDIO_TRACK_HEIGHT,
                                });
                              }}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (suppressNextTimelineItemClickRef.current) {
                                  suppressNextTimelineItemClickRef.current = false;
                                  return;
                                }
                                if (locked) return;
                                selectAudioTrack(track.id, event.shiftKey);
                              }}
                            >
                              {sourceClip ? <Link2 size={13} /> : <Music size={13} />}
                              <span className="truncate">{track.name}</span>
                            </button>
                            {getTargetKeyframes(track.id, track.startTime ?? 0, getEndTime(track), keyframes).map((keyframe) => (
                              <TimelineKeyframeMarker
                                key={keyframe.id}
                                keyframe={keyframe}
                                targetName={track.name}
                                selected={selectedKeyframeIds.includes(keyframe.id)}
                                locked={locked}
                                pixelsPerSecond={timelineMetrics.pixelsPerSecond}
                                onSelect={handleSelectTimelineKeyframe}
                                onPointerDown={handleTimelineKeyframePointerDown}
                              />
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  ))}
                </div>

              </div>
            </div>
          </div>
        </div>
    </div>
  );
}

export default EditframeWorkbenchCanvas;
