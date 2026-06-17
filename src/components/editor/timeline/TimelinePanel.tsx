import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useVideoEditorStore, type AudioTrack, type Clip, type LibraryMediaItem } from '@/store/videoEditorStore';
import { TimelineTrack } from './TimelineTrack';
import { TimelineRuler } from './TimelineRuler';
import TimelinePlayhead from '../TimelinePlayhead';
import { useDrop } from '@/lib/react-dnd';
import { timeToX } from '@/lib/editor/timelineZoom';
import { resolveTimelineSelectionBox, type TimelineSelectionRectangle } from './selectionBox';
import { buildTimelineDropMedia, timeFromTimelineDropX } from './timelineDrop';

const SELECTION_DRAG_THRESHOLD_PX = 4;

interface TimelinePoint {
  x: number;
  y: number;
}

interface SelectionDragState {
  origin: TimelinePoint;
  current: TimelinePoint;
  active: boolean;
}

const getDragDistance = (origin: TimelinePoint, current: TimelinePoint) =>
  Math.hypot(current.x - origin.x, current.y - origin.y);

const toSelectionRectangle = (origin: TimelinePoint, current: TimelinePoint): TimelineSelectionRectangle => ({
  left: origin.x,
  top: origin.y,
  right: current.x,
  bottom: current.y,
});

const toSelectionOverlayStyle = (origin: TimelinePoint, current: TimelinePoint) => ({
  left: `${Math.min(origin.x, current.x)}px`,
  top: `${Math.min(origin.y, current.y)}px`,
  width: `${Math.abs(current.x - origin.x)}px`,
  height: `${Math.abs(current.y - origin.y)}px`,
});

export default function TimelinePanel() {
  const clips = useVideoEditorStore((state) => state.clips);
  const audioTracks = useVideoEditorStore((state) => state.audioTracks);
  const zoom = useVideoEditorStore((state) => state.timeline.zoom);
  const timeline = useVideoEditorStore((state) => state.timeline);
  const scrollOffset = useVideoEditorStore((state) => state.timeline.scrollOffset);
  const setTimelineScroll = useVideoEditorStore((state) => state.setTimelineScroll);
  const composition = useVideoEditorStore((state) => state.composition);
  const selectClip = useVideoEditorStore((state) => state.selectClip);
  const selectAudioTrack = useVideoEditorStore((state) => state.selectAudioTrack);
  const clearClipSelection = useVideoEditorStore((state) => state.clearClipSelection);
  const clearAudioSelection = useVideoEditorStore((state) => state.clearAudioTrackSelection);
  const clearKeyframeSelection = useVideoEditorStore((state) => state.clearKeyframeSelection);
  const selectedClipIds = useVideoEditorStore((state) => state.selectedClipIds);
  const selectedAudioTrackIds = useVideoEditorStore((state) => state.selectedAudioTrackIds);
  const playback = useVideoEditorStore((state) => state.playback);
  const setCurrentTime = useVideoEditorStore((state) => state.setCurrentTime);
  const addClip = useVideoEditorStore((state) => state.addClip);
  const addAudioTrack = useVideoEditorStore((state) => state.addAudioTrack);
  const trackControls = useVideoEditorStore((state) => state.trackControls);
  const bookmarks = useVideoEditorStore((state) => state.bookmarks);
  const scrollRef = useRef<HTMLDivElement>(null);
  const suppressNextClickRef = useRef(false);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const [selectionDrag, setSelectionDrag] = useState<SelectionDragState | null>(null);

  const videoTracks = useMemo(() => groupByTrack(clips), [clips]);
  const audioTrackRows = useMemo(() => orderAudioTracks(audioTracks), [audioTracks]);
  const hiddenTrackIds = useMemo(
    () =>
      new Set(
        Object.entries(trackControls)
          .filter(([, control]) => control.visible === false)
          .map(([trackId]) => trackId)
      ),
    [trackControls]
  );

  const durationMs = useMemo(() => {
    const clipDuration = clips.reduce((max, clip) => {
      const start = clip.startTime ?? 0;
      const end = start + (clip.duration ?? 0);
      return Math.max(max, end);
    }, 0);

    const audioDuration = audioTracks.reduce((max, track) => {
      const start = track.startTime ?? 0;
      const end = start + (track.duration ?? 0);
      return Math.max(max, end);
    }, 0);

    return Math.max(composition.duration, clipDuration, audioDuration);
  }, [audioTracks, clips, composition.duration]);

  useEffect(() => {
    if (scrollRef.current && Math.abs(scrollRef.current.scrollLeft - scrollOffset) > 2) {
      scrollRef.current.scrollLeft = scrollOffset;
    }
  }, [scrollOffset]);

  // Auto-scroll timeline during playback
  useEffect(() => {
    if (playback.isPlaying && scrollRef.current) {
      const playheadPosition = timeToX(playback.currentTime, zoom);
      const viewportWidth = scrollRef.current.clientWidth;
      const scrollLeft = scrollRef.current.scrollLeft;
      
      // Auto-scroll if playhead is near right edge (within 100px) or past it
      if (playheadPosition > scrollLeft + viewportWidth - 100) {
        scrollRef.current.scrollTo({
          left: playheadPosition - 200,
          behavior: 'smooth'
        });
      }
    }
  }, [playback.currentTime, playback.isPlaying, zoom]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    setTimelineScroll(scrollRef.current.scrollLeft);
  };

  const handleEmptyClick = useCallback(() => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    clearClipSelection();
    clearAudioSelection();
    clearKeyframeSelection();
  }, [clearAudioSelection, clearClipSelection, clearKeyframeSelection]);

  const getContentPoint = useCallback((event: Pick<PointerEvent | ReactPointerEvent<HTMLDivElement>, 'clientX' | 'clientY'>) => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return null;
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return null;
    const rect = scrollElement.getBoundingClientRect();
    return {
      x: event.clientX - rect.left + scrollElement.scrollLeft,
      y: event.clientY - rect.top + scrollElement.scrollTop,
    };
  }, []);

  const applyMarqueeSelection = useCallback(
    (rectangle: TimelineSelectionRectangle) => {
      const result = resolveTimelineSelectionBox({
        clips,
        audioTracks,
        zoom,
        rectangle,
        hiddenTrackIds,
      });

      clearClipSelection();
      clearAudioSelection();
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
    [
      audioTracks,
      clearAudioSelection,
      clearClipSelection,
      clearKeyframeSelection,
      clips,
      hiddenTrackIds,
      selectAudioTrack,
      selectClip,
      zoom,
    ]
  );

  const handleSelectionPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button > 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, input, textarea, select, [data-timeline-interactive="true"]')) {
        return;
      }

      const origin = getContentPoint(event);
      if (!origin) return;

      event.preventDefault();
      dragCleanupRef.current?.();
      setSelectionDrag({ origin, current: origin, active: false });

      let latest = origin;

      const cleanup = () => {
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleUp);
        document.removeEventListener('pointercancel', handleUp);
        dragCleanupRef.current = null;
      };

      const handleMove = (moveEvent: PointerEvent) => {
        const point = getContentPoint(moveEvent);
        if (!point) return;
        latest = point;
        setSelectionDrag({
          origin,
          current: point,
          active: getDragDistance(origin, point) > SELECTION_DRAG_THRESHOLD_PX,
        });
      };

      const handleUp = (upEvent: PointerEvent) => {
        const point = getContentPoint(upEvent) ?? latest;
        const active = getDragDistance(origin, point) > SELECTION_DRAG_THRESHOLD_PX;
        cleanup();
        if (active) {
          applyMarqueeSelection(toSelectionRectangle(origin, point));
          suppressNextClickRef.current = true;
        }
        setSelectionDrag(null);
      };

      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleUp);
      document.addEventListener('pointercancel', handleUp);
      dragCleanupRef.current = cleanup;
    },
    [applyMarqueeSelection, getContentPoint]
  );

  useEffect(
    () => () => {
      dragCleanupRef.current?.();
    },
    []
  );

  // Drop zone for timeline panel (empty areas)
  const [{ isOverTimeline }, timelineDropRef] = useDrop({
    accept: 'MEDIA_ITEM',
    drop: (item: { mediaItem: LibraryMediaItem }, monitor) => {
      const offset = monitor.getClientOffset();
      if (!offset || !scrollRef.current) return;

      const rect = scrollRef.current.getBoundingClientRect();
      const startTimeMs = timeFromTimelineDropX({
        clientX: offset.x,
        containerLeft: rect.left,
        scrollOffset,
        zoom,
      });
      if (startTimeMs === null) return;

      const result = buildTimelineDropMedia({
        mediaItem: item.mediaItem,
        target: { type: 'auto' },
        startTimeMs,
        clips,
        audioTracks,
        timeline,
      });

      if (result?.kind === 'audio') {
        addAudioTrack(result.audioTrack);
      } else if (result?.kind === 'clip') {
        addClip(result.clip);
      }
    },
    collect: (monitor) => ({
      isOverTimeline: monitor.isOver(),
    }),
  });

  return (
    <div className="h-full bg-[rgba(15,15,20,0.6)] backdrop-blur-lg flex flex-col border-t border-white/[0.06] relative z-10">
      <TimelineRuler zoom={zoom} scrollOffset={scrollOffset} durationMs={durationMs} fps={composition.fps} />
      <div
        ref={(node) => {
          // Set both refs
          if (scrollRef.current !== node) {
            scrollRef.current = node;
          }
          timelineDropRef(node);
        }}
        className={`flex-1 overflow-auto bg-[rgba(10,10,15,0.4)] relative transition-colors ${
          isOverTimeline ? 'bg-purple-500/5' : ''
        }`}
        data-testid="editor-timeline-scroll"
        onScroll={handleScroll}
        onClick={handleEmptyClick}
        onPointerDown={handleSelectionPointerDown}
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(255,255,255,0.03) 19px, rgba(255,255,255,0.03) 20px)',
        }}
      >
        {selectionDrag?.active && (
          <div
            aria-hidden="true"
            data-testid="editor-timeline-selection-box"
            className="pointer-events-none absolute z-[120] rounded-sm border border-primary/70 bg-primary/10"
            style={toSelectionOverlayStyle(selectionDrag.origin, selectionDrag.current)}
          />
        )}
        {bookmarks.map((bookmark) => (
          <button
            key={bookmark.id}
            type="button"
            aria-label={`Seek to bookmark ${bookmark.name}`}
            className="absolute top-0 bottom-0 z-[90] w-0 border-l-2 text-left"
            data-testid={`editor-timeline-bookmark-${bookmark.id}`}
            data-timeline-interactive="true"
            onClick={(event) => {
              event.stopPropagation();
              setCurrentTime(bookmark.time);
            }}
            style={{
              left: `${timeToX(bookmark.time, zoom)}px`,
              borderColor: bookmark.color ?? '#f97316',
            }}
            title={bookmark.name}
          >
            <span
              className="absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm"
              style={{
                background: bookmark.color ?? '#f97316',
              }}
            >
              {bookmark.name}
            </span>
          </button>
        ))}
        {/* Playhead */}
        <TimelinePlayhead
          currentTimeMs={playback.currentTime}
          durationMs={durationMs}
          pixelsPerSecond={zoom}
          scrollOffset={scrollOffset}
          onSeekMs={setCurrentTime}
        />
        {videoTracks.length === 0 && audioTracks.length === 0 && (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Drop media files here to create timeline clips
          </div>
        )}
        {videoTracks.map((track) => (
          <TimelineTrack
            key={`video-${track.index}`}
            type="video"
            index={track.index}
            clips={track.clips}
            zoom={zoom}
            selectedIds={selectedClipIds}
            onSelect={(clipId, additive) => selectClip(clipId, additive)}
          />
        ))}
        {audioTrackRows.map(({ track, index }) => (
          <TimelineTrack
            key={`audio-${track.id}`}
            type="audio"
            index={index}
            audioTrack={track}
            zoom={zoom}
            selectedIds={selectedAudioTrackIds}
            onSelect={(trackId, additive) => selectAudioTrack(trackId, additive)}
          />
        ))}
      </div>
    </div>
  );
}

interface TimelineTrackGroup {
  index: number;
  clips: Clip[];
}

interface TimelineAudioTrackRow {
  index: number;
  track: AudioTrack;
}

function visualTrackIndex(clip: Pick<Clip, 'trackIndex' | 'layer'>) {
  const value = clip.trackIndex ?? clip.layer ?? 0;
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function audioTrackIndex(track: Pick<AudioTrack, 'trackIndex'>, fallback: number) {
  const value = track.trackIndex ?? fallback;
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback;
}

function groupByTrack(clips: Clip[]): TimelineTrackGroup[] {
  const tracks = new Map<number, Clip[]>();
  clips.forEach((clip) => {
    const trackIndex = visualTrackIndex(clip);
    if (!tracks.has(trackIndex)) {
      tracks.set(trackIndex, []);
    }
    tracks.get(trackIndex)!.push(clip);
  });
  return Array.from(tracks.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([index, value]) => ({ index, clips: value }));
}

function orderAudioTracks(audioTracks: AudioTrack[]): TimelineAudioTrackRow[] {
  return audioTracks
    .map((track, position) => ({ index: audioTrackIndex(track, position), position, track }))
    .sort((left, right) =>
      left.index - right.index ||
      (left.track.startTime ?? 0) - (right.track.startTime ?? 0) ||
      left.position - right.position
    )
    .map(({ index, track }) => ({ index, track }));
}
