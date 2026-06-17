import type { AudioTrack, Clip } from '@/store/videoEditorStore';
import { timeToX } from '@/lib/editor/timelineZoom';
import { exactMeasurements } from '@/lib/editor/theme';

const TRACK_HEADER_HEIGHT = 40;
const TRACK_CONTENT_HEIGHT = exactMeasurements.timeline.trackHeight;
const TRACK_BLOCK_HEIGHT = TRACK_HEADER_HEIGHT + TRACK_CONTENT_HEIGHT;

export interface TimelineSelectionRectangle {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TimelineSelectionBoxResult {
  clipIds: string[];
  audioTrackIds: string[];
}

interface ResolveTimelineSelectionBoxInput {
  clips: Clip[];
  audioTracks: AudioTrack[];
  zoom: number;
  rectangle: TimelineSelectionRectangle;
  hiddenTrackIds?: Set<string>;
}

interface ElementBounds {
  id: string;
  kind: 'clip' | 'audio';
  trackId: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const getEndMs = (item: Pick<Clip | AudioTrack, 'startTime' | 'duration' | 'endTime'>) =>
  item.endTime ?? (item.startTime ?? 0) + (item.duration ?? 0);

const normalizeRectangle = (rectangle: TimelineSelectionRectangle): TimelineSelectionRectangle => ({
  left: Math.min(rectangle.left, rectangle.right),
  top: Math.min(rectangle.top, rectangle.bottom),
  right: Math.max(rectangle.left, rectangle.right),
  bottom: Math.max(rectangle.top, rectangle.bottom),
});

const intersects = (a: TimelineSelectionRectangle, b: TimelineSelectionRectangle) =>
  !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);

const normalizeTrackIndex = (value: number | undefined, fallback = 0) =>
  Number.isFinite(value) ? Math.max(0, Math.trunc(value as number)) : fallback;

const visualTrackIndex = (clip: Clip) => normalizeTrackIndex(clip.trackIndex ?? clip.layer);
const audioTrackIndex = (track: AudioTrack, fallback: number) => normalizeTrackIndex(track.trackIndex, fallback);

function buildVisualTrackOrder(clips: Clip[]) {
  return Array.from(new Set(clips.map(visualTrackIndex))).sort((a, b) => a - b);
}

function getClipBounds({
  clip,
  trackPosition,
  zoom,
}: {
  clip: Clip;
  trackPosition: number;
  zoom: number;
}): ElementBounds {
  const top = trackPosition * TRACK_BLOCK_HEIGHT + TRACK_HEADER_HEIGHT;
  return {
    id: clip.id,
    kind: 'clip',
    trackId: `visual-${visualTrackIndex(clip)}`,
    left: timeToX(clip.startTime ?? 0, zoom),
    right: timeToX(getEndMs(clip), zoom),
    top,
    bottom: top + TRACK_CONTENT_HEIGHT,
  };
}

function getAudioBounds({
  track,
  trackPosition,
  audioIndex,
  zoom,
}: {
  track: AudioTrack;
  trackPosition: number;
  audioIndex: number;
  zoom: number;
}): ElementBounds {
  const top = trackPosition * TRACK_BLOCK_HEIGHT + TRACK_HEADER_HEIGHT;
  return {
    id: track.id,
    kind: 'audio',
    trackId: `audio-${audioIndex}`,
    left: timeToX(track.startTime ?? 0, zoom),
    right: timeToX(getEndMs(track), zoom),
    top,
    bottom: top + TRACK_CONTENT_HEIGHT,
  };
}

export function resolveTimelineSelectionBox({
  clips,
  audioTracks,
  zoom,
  rectangle,
  hiddenTrackIds = new Set(),
}: ResolveTimelineSelectionBoxInput): TimelineSelectionBoxResult {
  const selection = normalizeRectangle(rectangle);
  const visualTrackOrder = buildVisualTrackOrder(clips);
  const visualTrackPositions = new Map(visualTrackOrder.map((trackIndex, position) => [trackIndex, position]));
  const audioTrackRows = audioTracks
    .map((track, position) => ({
      track,
      trackIndex: audioTrackIndex(track, position),
      position,
    }))
    .sort((left, right) =>
      left.trackIndex - right.trackIndex ||
      (left.track.startTime ?? 0) - (right.track.startTime ?? 0) ||
      left.position - right.position
    );
  const bounds: ElementBounds[] = [];

  clips.forEach((clip) => {
    const trackIndex = visualTrackIndex(clip);
    const trackPosition = visualTrackPositions.get(trackIndex);
    if (trackPosition === undefined) return;
    bounds.push(getClipBounds({ clip, trackPosition, zoom }));
  });

  audioTrackRows.forEach(({ track, trackIndex }, audioPosition) => {
    bounds.push(
      getAudioBounds({
        track,
        audioIndex: trackIndex,
        trackPosition: visualTrackOrder.length + audioPosition,
        zoom,
      })
    );
  });

  return bounds.reduce<TimelineSelectionBoxResult>(
    (result, item) => {
      if (hiddenTrackIds.has(item.trackId)) return result;
      if (!intersects(item, selection)) return result;
      if (item.kind === 'audio') {
        result.audioTrackIds.push(item.id);
      } else {
        result.clipIds.push(item.id);
      }
      return result;
    },
    { clipIds: [], audioTrackIds: [] }
  );
}
