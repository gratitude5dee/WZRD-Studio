import type { AudioTrack, Clip, LibraryMediaItem, TimelineState } from '@/store/videoEditorStore';
import { buildSnapPoints, snapValue } from './snapping';

type TimelineDropTarget = {
  type: 'video' | 'audio' | 'auto';
  trackIndex?: number;
};

interface BuildTimelineDropMediaInput {
  mediaItem: LibraryMediaItem;
  target: TimelineDropTarget;
  startTimeMs: number;
  clips: Clip[];
  audioTracks: AudioTrack[];
  timeline: TimelineState;
  idFactory?: () => string;
}

export type TimelineDropMediaResult =
  | { kind: 'clip'; clip: Clip }
  | { kind: 'audio'; audioTrack: AudioTrack }
  | null;

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const normalizeDurationMs = (durationSeconds?: number) => {
  const durationMs = (durationSeconds ?? 5) * 1000;
  return Math.max(1000, Number.isFinite(durationMs) ? Math.round(durationMs) : 5000);
};

const maxAudioTrackIndex = (audioTracks: AudioTrack[]) =>
  audioTracks.reduce((max, track) => Math.max(max, track.trackIndex ?? 0), -1);

const normalizeStartMs = ({
  startTimeMs,
  clips,
  audioTracks,
  timeline,
}: Pick<BuildTimelineDropMediaInput, 'startTimeMs' | 'clips' | 'audioTracks' | 'timeline'>) => {
  const rawStart = Math.max(0, Number.isFinite(startTimeMs) ? startTimeMs : 0);
  return snapValue(rawStart, buildSnapPoints(clips, audioTracks), {
    snapToGrid: timeline.snapToGrid,
    gridSize: timeline.gridSize,
  });
};

export function timeFromTimelineDropX({
  clientX,
  containerLeft,
  scrollOffset = 0,
  zoom,
}: {
  clientX: number;
  containerLeft: number;
  scrollOffset?: number;
  zoom: number;
}) {
  if (!Number.isFinite(clientX) || !Number.isFinite(containerLeft) || !Number.isFinite(zoom) || zoom <= 0) {
    return null;
  }
  return Math.max(0, ((clientX - containerLeft + scrollOffset) / zoom) * 1000);
}

export function buildTimelineDropMedia(input: BuildTimelineDropMediaInput): TimelineDropMediaResult {
  const { mediaItem, target, clips, audioTracks, timeline, idFactory = createId } = input;
  if (!mediaItem.url) return null;

  const targetType = target.type === 'auto'
    ? mediaItem.mediaType === 'audio' ? 'audio' : 'video'
    : target.type;
  if (targetType === 'audio' && mediaItem.mediaType !== 'audio') return null;
  if (targetType === 'video' && mediaItem.mediaType === 'audio') return null;

  const startTime = normalizeStartMs({
    startTimeMs: input.startTimeMs,
    clips,
    audioTracks,
    timeline,
  });
  const duration = normalizeDurationMs(mediaItem.durationSeconds);
  const trackIndex = target.trackIndex ?? (targetType === 'audio' ? maxAudioTrackIndex(audioTracks) + 1 : 0);

  if (targetType === 'audio') {
    return {
      kind: 'audio',
      audioTrack: {
        id: idFactory(),
        mediaItemId: mediaItem.id,
        type: 'audio',
        name: mediaItem.name,
        url: mediaItem.url,
        startTime,
        duration,
        endTime: startTime + duration,
        volume: 1,
        isMuted: false,
        trackIndex,
      },
    };
  }

  return {
    kind: 'clip',
    clip: {
      id: idFactory(),
      mediaItemId: mediaItem.id,
      type: mediaItem.mediaType === 'image' ? 'image' : 'video',
      name: mediaItem.name,
      url: mediaItem.url,
      startTime,
      duration,
      endTime: startTime + duration,
      layer: trackIndex,
      trackIndex,
      transforms: {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        opacity: 1,
      },
    },
  };
}
