import type {
  AudioTrack,
  Clip,
  ClipEffect,
  ClipMask,
  EditorBookmark,
  Keyframe,
  OpenCutClipboard,
  VideoEditorState,
} from '@/store/videoEditorStore';
import { useVideoEditorStore } from '@/store/videoEditorStore';
import { videoEditorService } from '@/services/videoEditorService';

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const getClipEndMs = (clip: Pick<Clip, 'startTime' | 'duration' | 'endTime'>) =>
  clip.endTime ?? (clip.startTime ?? 0) + (clip.duration ?? 0);

const getAudioEndMs = (track: Pick<AudioTrack, 'startTime' | 'duration' | 'endTime'>) =>
  track.endTime ?? (track.startTime ?? 0) + (track.duration ?? 0);

const MIN_SNAP_THRESHOLD_MS = 50;

function selectedClips(state: VideoEditorState) {
  return state.clips.filter((clip) => state.selectedClipIds.includes(clip.id));
}

function selectedAudioTracks(state: VideoEditorState) {
  return state.audioTracks.filter((track) => state.selectedAudioTrackIds.includes(track.id));
}

function getVisualTrackId(clip: Pick<Clip, 'trackIndex' | 'layer'>) {
  return `visual-${clip.trackIndex ?? clip.layer ?? 0}`;
}

function getAudioTrackId(track: Pick<AudioTrack, 'trackIndex'>) {
  return `audio-${track.trackIndex ?? 0}`;
}

function isClipTrackLocked(state: VideoEditorState, clip: Pick<Clip, 'trackIndex' | 'layer'>) {
  return state.trackControls[getVisualTrackId(clip)]?.locked === true;
}

function isAudioTrackLocked(state: VideoEditorState, track: Pick<AudioTrack, 'trackIndex'>) {
  return state.trackControls[getAudioTrackId(track)]?.locked === true;
}

function isClipTrackSelectable(state: VideoEditorState, clip: Pick<Clip, 'trackIndex' | 'layer'>) {
  const control = state.trackControls[getVisualTrackId(clip)];
  return control?.locked !== true && control?.visible !== false;
}

function isAudioTrackSelectable(state: VideoEditorState, track: Pick<AudioTrack, 'trackIndex'>) {
  const control = state.trackControls[getAudioTrackId(track)];
  return control?.locked !== true && control?.visible !== false;
}

function getKeyframeTargetBounds(state: VideoEditorState, keyframe: Keyframe) {
  if (keyframe.targetType === 'audio') {
    const track = state.audioTracks.find((item) => item.id === keyframe.targetId);
    if (track) return { start: track.startTime ?? 0, end: getAudioEndMs(track) };
  }

  if (keyframe.targetType === 'clip') {
    const clip = state.clips.find((item) => item.id === keyframe.targetId);
    if (clip) return { start: clip.startTime ?? 0, end: getClipEndMs(clip) };
  }

  const duration = Math.max(state.composition.duration ?? 0, state.project.duration ?? 0, keyframe.time);
  return { start: 0, end: duration };
}

function getElementDuration(element: Pick<Clip | AudioTrack, 'duration' | 'startTime' | 'endTime'>) {
  return element.duration ?? Math.max(0, (element.endTime ?? 0) - (element.startTime ?? 0));
}

const clampTrackIndex = (trackIndex: number, trackDelta: number) =>
  Math.max(0, trackIndex + trackDelta);

const collectMoveSnapPoints = (state: VideoEditorState, excludedIds: Set<string>) => {
  const points = new Set<number>();
  const addPoint = (value: number | undefined) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      points.add(Math.max(0, Math.round(value)));
    }
  };

  state.clips.forEach((clip) => {
    if (excludedIds.has(clip.id)) return;
    addPoint(clip.startTime);
    addPoint(getClipEndMs(clip));
  });
  state.audioTracks.forEach((track) => {
    if (excludedIds.has(track.id)) return;
    addPoint(track.startTime);
    addPoint(getAudioEndMs(track));
  });

  return Array.from(points).sort((left, right) => left - right);
};

const findNearestSnapPoint = (points: number[], target: number) => {
  if (!points.length) return null;
  let best = points[0];
  let bestDistance = Math.abs(best - target);

  for (const point of points.slice(1)) {
    const distance = Math.abs(point - target);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }

  return { point: best, distance: bestDistance };
};

const snapMoveAnchor = ({
  anchor,
  gridSize,
  snapPoints,
}: {
  anchor: number;
  gridSize: number;
  snapPoints: number[];
}) => {
  const snappedToGrid = gridSize > 0 ? Math.round(anchor / gridSize) * gridSize : anchor;
  const nearest = findNearestSnapPoint(snapPoints, snappedToGrid);
  if (!nearest) return snappedToGrid;
  const threshold = Math.max(gridSize || 0, MIN_SNAP_THRESHOLD_MS);
  return nearest.distance <= threshold ? nearest.point : snappedToGrid;
};

const normalizeMoveDelta = ({
  deltaMs,
  earliestStart,
  gridSize,
  snapToGrid,
  snapPoints = [],
}: {
  deltaMs: number;
  earliestStart: number;
  gridSize: number;
  snapToGrid: boolean;
  snapPoints?: number[];
}) => {
  const rawDelta = Number.isFinite(deltaMs) ? deltaMs : 0;
  if (!rawDelta) return 0;
  const rawAnchor = earliestStart + rawDelta;
  const snappedAnchor = snapToGrid
    ? snapMoveAnchor({ anchor: rawAnchor, gridSize, snapPoints })
    : rawAnchor;
  return Math.max(-earliestStart, snappedAnchor - earliestStart);
};

function createEffect(effectId: string, params: Record<string, number> = {}): ClipEffect {
  const overlayEffects = new Set(['vignette', 'grain', 'light-leak']);
  const adjustmentEffects = new Set(['brightness', 'contrast', 'saturation', 'exposure']);
  return {
    id: effectId,
    name: effectId,
    type: overlayEffects.has(effectId) ? 'overlay' : adjustmentEffects.has(effectId) ? 'adjustment' : 'filter',
    params,
  };
}

function createMask(type: ClipMask['type']): ClipMask {
  return {
    id: createId(),
    type,
    inverted: false,
    feather: 0,
    opacity: 1,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function splitSelectedAtPlayhead(): number {
  const state = useVideoEditorStore.getState();
  const playheadMs = state.playback.currentTime;
  const splitClips = selectedClips(state)
    .map((clip) => {
      const startMs = clip.startTime ?? 0;
      const endMs = getClipEndMs(clip);
      if (playheadMs <= startMs + 100 || playheadMs >= endMs - 100) return null;
      const leftDuration = playheadMs - startMs;
      const rightDuration = endMs - playheadMs;
      const trimBoundary = (clip.trimStart ?? 0) + leftDuration;
      const leftClip: Clip = {
        ...clip,
        duration: leftDuration,
        endTime: playheadMs,
        trimEnd: trimBoundary,
      };
      const rightClip: Clip = {
        ...clone(clip),
        id: createId(),
        name: `${clip.name} split`,
        startTime: playheadMs,
        duration: rightDuration,
        endTime: playheadMs + rightDuration,
        trimStart: trimBoundary,
      };
      return { originalId: clip.id, leftClip, rightClip };
    })
    .filter((split): split is { originalId: string; leftClip: Clip; rightClip: Clip } => Boolean(split));

  const splitAudioTracks = selectedAudioTracks(state)
    .map((track) => {
      const startMs = track.startTime ?? 0;
      const endMs = getAudioEndMs(track);
      if (playheadMs <= startMs + 100 || playheadMs >= endMs - 100) return null;
      const leftDuration = playheadMs - startMs;
      const rightDuration = endMs - playheadMs;
      const trimBoundary = (track.trimStart ?? 0) + leftDuration;
      const leftTrack: AudioTrack = {
        ...track,
        duration: leftDuration,
        endTime: playheadMs,
        trimEnd: trimBoundary,
      };
      const rightTrack: AudioTrack = {
        ...clone(track),
        id: createId(),
        name: `${track.name} split`,
        startTime: playheadMs,
        duration: rightDuration,
        endTime: playheadMs + rightDuration,
        trimStart: trimBoundary,
      };
      return { originalId: track.id, leftTrack, rightTrack };
    })
    .filter(
      (split): split is { originalId: string; leftTrack: AudioTrack; rightTrack: AudioTrack } => Boolean(split)
    );

  if (!splitClips.length && !splitAudioTracks.length) {
    return 0;
  }

  const clipUpdates = new Map(splitClips.map((split) => [split.originalId, split.leftClip]));
  const audioUpdates = new Map(splitAudioTracks.map((split) => [split.originalId, split.leftTrack]));
  const rightClipIdsByOriginalId = new Map(splitClips.map((split) => [split.originalId, split.rightClip.id]));
  const rightAudioIdsByOriginalId = new Map(splitAudioTracks.map((split) => [split.originalId, split.rightTrack.id]));
  const newClips = splitClips.map((split) => split.rightClip);
  const newAudioTracks = splitAudioTracks.map((split) => split.rightTrack);

  const retargetedKeyframes = state.keyframes
    .filter((keyframe) => keyframe.time >= playheadMs)
    .map((keyframe) => {
      const targetId =
        rightClipIdsByOriginalId.get(keyframe.targetId) ?? rightAudioIdsByOriginalId.get(keyframe.targetId);
      return targetId ? { ...keyframe, targetId } : null;
    })
    .filter((keyframe): keyframe is Keyframe => Boolean(keyframe));
  const retargetedKeyframeById = new Map(retargetedKeyframes.map((keyframe) => [keyframe.id, keyframe]));

  state.pushHistory();
  useVideoEditorStore.setState((current) => ({
    clips: [
      ...current.clips.map((clip) => clipUpdates.get(clip.id) ?? clip),
      ...newClips,
    ],
    audioTracks: [
      ...current.audioTracks.map((track) => audioUpdates.get(track.id) ?? track),
      ...newAudioTracks,
    ],
    keyframes: current.keyframes.map((keyframe) => retargetedKeyframeById.get(keyframe.id) ?? keyframe),
    selectedClipIds: newClips.map((clip) => clip.id),
    selectedAudioTrackIds: newAudioTracks.map((track) => track.id),
  }));

  const projectId = state.project.id;
  if (projectId) {
    splitClips.forEach(({ leftClip, rightClip }) => {
      videoEditorService.saveTimelineClip(projectId, leftClip);
      videoEditorService.saveTimelineClip(projectId, rightClip);
    });
    splitAudioTracks.forEach(({ leftTrack, rightTrack }) => {
      videoEditorService.saveAudioTrack(projectId, leftTrack);
      videoEditorService.saveAudioTrack(projectId, rightTrack);
    });
    retargetedKeyframes.forEach((keyframe) => videoEditorService.saveKeyframe(projectId, keyframe));
  }

  return splitClips.length + splitAudioTracks.length;
}

export function trimSelectionEdges({
  startDeltaMs = 0,
  endDeltaMs = 0,
}: {
  startDeltaMs?: number;
  endDeltaMs?: number;
}): number {
  const state = useVideoEditorStore.getState();
  const minimumDuration = 100;
  const clips = selectedClips(state);
  const audioTracks = selectedAudioTracks(state);

  if (!clips.length && !audioTracks.length) {
    return 0;
  }

  const clipUpdates = new Map<string, Clip>();
  const audioUpdates = new Map<string, AudioTrack>();

  clips.forEach((clip) => {
    const startMs = clip.startTime ?? 0;
    const endMs = getClipEndMs(clip);
    const nextStart = Math.max(0, Math.min(startMs + startDeltaMs, endMs - minimumDuration));
    const nextEnd = Math.max(nextStart + minimumDuration, endMs + endDeltaMs);
    const nextDuration = nextEnd - nextStart;
    const trimStart = Math.max(0, (clip.trimStart ?? 0) + (nextStart - startMs));
    const trimEnd = Math.max(trimStart + minimumDuration, (clip.trimEnd ?? getElementDuration(clip)) + endDeltaMs);

    clipUpdates.set(clip.id, {
      ...clip,
      startTime: nextStart,
      duration: nextDuration,
      endTime: nextEnd,
      trimStart,
      trimEnd,
    });
  });

  audioTracks.forEach((track) => {
    const startMs = track.startTime ?? 0;
    const endMs = getAudioEndMs(track);
    const nextStart = Math.max(0, Math.min(startMs + startDeltaMs, endMs - minimumDuration));
    const nextEnd = Math.max(nextStart + minimumDuration, endMs + endDeltaMs);
    const trimStart = Math.max(0, (track.trimStart ?? 0) + (nextStart - startMs));
    const trimEnd = Math.max(trimStart + minimumDuration, (track.trimEnd ?? getElementDuration(track)) + endDeltaMs);

    audioUpdates.set(track.id, {
      ...track,
      startTime: nextStart,
      duration: nextEnd - nextStart,
      endTime: nextEnd,
      trimStart,
      trimEnd,
    });
  });

  state.pushHistory();
  useVideoEditorStore.setState((current) => ({
    clips: current.clips.map((clip) => clipUpdates.get(clip.id) ?? clip),
    audioTracks: current.audioTracks.map((track) => audioUpdates.get(track.id) ?? track),
  }));

  const projectId = state.project.id;
  if (projectId) {
    clipUpdates.forEach((clip) => videoEditorService.saveTimelineClip(projectId, clip));
    audioUpdates.forEach((track) => videoEditorService.saveAudioTrack(projectId, track));
  }

  return clipUpdates.size + audioUpdates.size;
}

export function retimeSelection(playbackRate: number): number {
  if (!Number.isFinite(playbackRate) || playbackRate <= 0) return 0;

  const state = useVideoEditorStore.getState();
  const clips = selectedClips(state);
  const audioTracks = selectedAudioTracks(state);

  if (!clips.length && !audioTracks.length) {
    return 0;
  }

  const clipUpdates = new Map<string, Clip>();
  const audioUpdates = new Map<string, AudioTrack>();

  clips.forEach((clip) => {
    const sourceDuration = getElementDuration(clip);
    const duration = Math.max(100, Math.round(sourceDuration / playbackRate));
    clipUpdates.set(clip.id, {
      ...clip,
      duration,
      endTime: (clip.startTime ?? 0) + duration,
      playbackRate,
    });
  });

  audioTracks.forEach((track) => {
    const sourceDuration = getElementDuration(track);
    const duration = Math.max(100, Math.round(sourceDuration / playbackRate));
    audioUpdates.set(track.id, {
      ...track,
      duration,
      endTime: (track.startTime ?? 0) + duration,
      playbackRate,
    });
  });

  state.pushHistory();
  useVideoEditorStore.setState((current) => ({
    clips: current.clips.map((clip) => clipUpdates.get(clip.id) ?? clip),
    audioTracks: current.audioTracks.map((track) => audioUpdates.get(track.id) ?? track),
  }));

  const projectId = state.project.id;
  if (projectId) {
    clipUpdates.forEach((clip) => videoEditorService.saveTimelineClip(projectId, clip));
    audioUpdates.forEach((track) => videoEditorService.saveAudioTrack(projectId, track));
  }

  return clipUpdates.size + audioUpdates.size;
}

export function applyEffectToSelection(effectId: string, params: Record<string, number> = {}): number {
  const state = useVideoEditorStore.getState();
  const effect = createEffect(effectId, params);
  const clips = selectedClips(state);

  if (!clips.length) {
    return 0;
  }

  const clipUpdates = new Map<string, Clip>();
  clips.forEach((clip) => {
    clipUpdates.set(clip.id, {
      ...clip,
      effects: [...(clip.effects ?? []).filter((item) => item.id !== effect.id), effect],
    });
  });

  state.pushHistory();
  useVideoEditorStore.setState((current) => ({
    clips: current.clips.map((clip) => clipUpdates.get(clip.id) ?? clip),
  }));

  const projectId = state.project.id;
  if (projectId) {
    clipUpdates.forEach((clip) => videoEditorService.saveTimelineClip(projectId, clip));
  }

  return clipUpdates.size;
}

export function toggleMaskOnSelection(maskType: ClipMask['type'] = 'rectangle'): number {
  const state = useVideoEditorStore.getState();
  const clips = selectedClips(state);

  if (!clips.length) {
    return 0;
  }

  const clipUpdates = new Map<string, Clip>();
  clips.forEach((clip) => {
    const masks = clip.masks ?? [];
    const existing = masks.find((mask) => mask.type === maskType);
    clipUpdates.set(clip.id, {
      ...clip,
      masks: existing ? masks.filter((mask) => mask.id !== existing.id) : [...masks, createMask(maskType)],
    });
  });

  state.pushHistory();
  useVideoEditorStore.setState((current) => ({
    clips: current.clips.map((clip) => clipUpdates.get(clip.id) ?? clip),
  }));

  const projectId = state.project.id;
  if (projectId) {
    clipUpdates.forEach((clip) => videoEditorService.saveTimelineClip(projectId, clip));
  }

  return clipUpdates.size;
}

export function deleteSelection(): number {
  const state = useVideoEditorStore.getState();
  const clipIds = [...state.selectedClipIds];
  const audioIds = [...state.selectedAudioTrackIds];
  const selectedTargetIds = new Set([...clipIds, ...audioIds]);
  const keyframeIds = state.keyframes
    .filter((keyframe) => selectedTargetIds.has(keyframe.targetId) || state.selectedKeyframeIds.includes(keyframe.id))
    .map((keyframe) => keyframe.id);
  if (!clipIds.length && !audioIds.length && !keyframeIds.length) {
    return 0;
  }

  state.pushHistory();
  useVideoEditorStore.setState((current) => ({
    clips: current.clips.filter((clip) => !clipIds.includes(clip.id)),
    audioTracks: current.audioTracks.filter((track) => !audioIds.includes(track.id)),
    clipConnections: current.clipConnections.filter(
      (connection) => !selectedTargetIds.has(connection.sourceId) && !selectedTargetIds.has(connection.targetId)
    ),
    keyframes: current.keyframes.filter((keyframe) => !keyframeIds.includes(keyframe.id)),
    selectedClipIds: current.selectedClipIds.filter((clipId) => !clipIds.includes(clipId)),
    selectedAudioTrackIds: current.selectedAudioTrackIds.filter((trackId) => !audioIds.includes(trackId)),
    selectedKeyframeIds: current.selectedKeyframeIds.filter((keyframeId) => !keyframeIds.includes(keyframeId)),
  }));

  clipIds.forEach((id) => videoEditorService.deleteTimelineClip(id));
  audioIds.forEach((id) => videoEditorService.deleteAudioTrack(id));
  keyframeIds.forEach((id) => videoEditorService.deleteKeyframe(id));

  return clipIds.length + audioIds.length || keyframeIds.length;
}

export function duplicateSelection(offsetMs?: number): number {
  const state = useVideoEditorStore.getState();
  const offset = offsetMs ?? Math.max(100, state.timeline.gridSize || 500);
  const clips = selectedClips(state);
  const audioTracks = selectedAudioTracks(state);

  if (!clips.length && !audioTracks.length) {
    return 0;
  }

  const clipIdMap = new Map<string, string>();
  const audioIdMap = new Map<string, string>();

  const newClips = clips.map((clip) => {
    const startTime = (clip.startTime ?? 0) + offset;
    const duplicate: Clip = {
      ...clone(clip),
      id: createId(),
      name: `${clip.name} copy`,
      startTime,
      endTime: startTime + (clip.duration ?? 0),
    };
    clipIdMap.set(clip.id, duplicate.id);
    return duplicate;
  });

  const newAudioTracks = audioTracks.map((track) => {
    const startTime = (track.startTime ?? 0) + offset;
    const duplicate: AudioTrack = {
      ...clone(track),
      id: createId(),
      name: `${track.name} copy`,
      startTime,
      endTime: startTime + (track.duration ?? 0),
    };
    audioIdMap.set(track.id, duplicate.id);
    return duplicate;
  });

  const newKeyframes = state.keyframes
    .map((keyframe) => {
      const targetId = clipIdMap.get(keyframe.targetId) ?? audioIdMap.get(keyframe.targetId);
      if (!targetId) return null;
      return {
        ...clone(keyframe),
        id: createId(),
        targetId,
        time: keyframe.time + offset,
      };
    })
    .filter((keyframe): keyframe is Keyframe => Boolean(keyframe));

  state.pushHistory();
  useVideoEditorStore.setState((current) => ({
    clips: [...current.clips, ...newClips],
    audioTracks: [...current.audioTracks, ...newAudioTracks],
    keyframes: [...current.keyframes, ...newKeyframes],
    selectedClipIds: newClips.map((clip) => clip.id),
    selectedAudioTrackIds: newAudioTracks.map((track) => track.id),
    selectedKeyframeIds: newKeyframes.map((keyframe) => keyframe.id),
  }));

  const projectId = state.project.id;
  if (projectId) {
    newClips.forEach((clip) => videoEditorService.saveTimelineClip(projectId, clip));
    newAudioTracks.forEach((track) => videoEditorService.saveAudioTrack(projectId, track));
    newKeyframes.forEach((keyframe) => videoEditorService.saveKeyframe(projectId, keyframe));
  }

  return newClips.length + newAudioTracks.length;
}

export function moveSelection({
  deltaMs = 0,
  trackDelta = 0,
  snapToGrid = false,
}: {
  deltaMs?: number;
  trackDelta?: number;
  snapToGrid?: boolean;
}): number {
  const state = useVideoEditorStore.getState();
  const clips = selectedClips(state).filter((clip) => !isClipTrackLocked(state, clip));
  const audioTracks = selectedAudioTracks(state).filter((track) => !isAudioTrackLocked(state, track));

  if (!clips.length && !audioTracks.length) {
    return 0;
  }

  const selectedTargetIds = new Set([...clips.map((clip) => clip.id), ...audioTracks.map((track) => track.id)]);
  const earliestStart = [...clips, ...audioTracks].reduce(
    (earliest, item) => Math.min(earliest, item.startTime ?? 0),
    Number.POSITIVE_INFINITY
  );
  const snapPoints = collectMoveSnapPoints(state, selectedTargetIds);
  const appliedDelta = normalizeMoveDelta({
    deltaMs,
    earliestStart: Number.isFinite(earliestStart) ? earliestStart : 0,
    gridSize: state.timeline.gridSize,
    snapToGrid: snapToGrid && state.timeline.snapToGrid,
    snapPoints,
  });
  const appliedTrackDelta = Number.isFinite(trackDelta) ? Math.trunc(trackDelta) : 0;

  if (!appliedDelta && !appliedTrackDelta) {
    return 0;
  }

  const selectedClipIds = new Set(clips.map((clip) => clip.id));
  const selectedAudioTrackIds = new Set(audioTracks.map((track) => track.id));
  state.pushHistory();

  useVideoEditorStore.setState((current) => ({
    clips: current.clips.map((clip) => {
      if (!selectedClipIds.has(clip.id)) return clip;
      const startTime = Math.max(0, (clip.startTime ?? 0) + appliedDelta);
      const duration = getElementDuration(clip);
      const trackIndex = clampTrackIndex(clip.trackIndex ?? clip.layer ?? 0, appliedTrackDelta);
      return {
        ...clip,
        startTime,
        duration,
        endTime: startTime + duration,
        trackIndex,
        layer: trackIndex,
      };
    }),
    audioTracks: current.audioTracks.map((track) => {
      if (!selectedAudioTrackIds.has(track.id)) return track;
      const startTime = Math.max(0, (track.startTime ?? 0) + appliedDelta);
      const duration = getElementDuration(track);
      return {
        ...track,
        startTime,
        duration,
        endTime: startTime + duration,
        trackIndex: clampTrackIndex(track.trackIndex ?? 0, appliedTrackDelta),
      };
    }),
    keyframes: current.keyframes.map((keyframe) =>
      selectedTargetIds.has(keyframe.targetId)
        ? {
            ...keyframe,
            time: Math.max(0, keyframe.time + appliedDelta),
          }
        : keyframe
    ),
  }));

  const updated = useVideoEditorStore.getState();
  const projectId = updated.project.id;
  if (projectId) {
    updated.clips
      .filter((clip) => selectedClipIds.has(clip.id))
      .forEach((clip) => videoEditorService.saveTimelineClip(projectId, clip));
    updated.audioTracks
      .filter((track) => selectedAudioTrackIds.has(track.id))
      .forEach((track) => videoEditorService.saveAudioTrack(projectId, track));
    updated.keyframes
      .filter((keyframe) => selectedTargetIds.has(keyframe.targetId))
      .forEach((keyframe) => videoEditorService.saveKeyframe(projectId, keyframe));
  }

  return clips.length + audioTracks.length;
}

export function toggleBookmarkAtPlayhead(name?: string): number {
  const state = useVideoEditorStore.getState();
  const time = state.playback.currentTime;
  const existing = state.bookmarks.find((bookmark) => Math.abs(bookmark.time - time) <= 1);

  if (existing) {
    state.removeBookmark(existing.id);
    return 1;
  }

  const bookmark: EditorBookmark = {
    id: createId(),
    name: name?.trim() || `Bookmark ${state.bookmarks.length + 1}`,
    time,
    color: '#f97316',
  };
  state.addBookmark(bookmark);
  return 1;
}

export function addKeyframeAtPlayhead(): number {
  const state = useVideoEditorStore.getState();
  const playheadMs = state.playback.currentTime;
  const keyframes: Keyframe[] = [
    ...selectedClips(state).map((clip) => ({
      id: createId(),
      targetId: clip.id,
      targetType: 'clip' as const,
      time: playheadMs,
      propertyPath: 'transforms',
      easing: 'linear',
      properties: {
        transforms: clip.transforms,
      },
    })),
    ...selectedAudioTracks(state).map((track) => ({
      id: createId(),
      targetId: track.id,
      targetType: 'audio' as const,
      time: playheadMs,
      propertyPath: 'volume',
      easing: 'linear',
      properties: {
        volume: track.volume,
        isMuted: track.isMuted,
      },
    })),
  ];

  if (!keyframes.length) {
    return 0;
  }

  state.pushHistory();
  useVideoEditorStore.setState((current) => ({
    keyframes: [...current.keyframes, ...keyframes],
    selectedKeyframeIds: keyframes.map((keyframe) => keyframe.id),
  }));

  const projectId = state.project.id;
  if (projectId) {
    keyframes.forEach((keyframe) => videoEditorService.saveKeyframe(projectId, keyframe));
  }

  return keyframes.length;
}

export function selectAllOpenCutElements(): number {
  const state = useVideoEditorStore.getState();
  const clipIds = state.clips
    .filter((clip) => isClipTrackSelectable(state, clip))
    .map((clip) => clip.id);
  const audioTrackIds = state.audioTracks
    .filter((track) => isAudioTrackSelectable(state, track))
    .map((track) => track.id);
  const selectableTargetIds = new Set([...clipIds, ...audioTrackIds]);
  const keyframeIds = state.keyframes
    .filter((keyframe) => selectableTargetIds.has(keyframe.targetId))
    .map((keyframe) => keyframe.id);

  useVideoEditorStore.setState({
    selectedClipIds: clipIds,
    selectedAudioTrackIds: audioTrackIds,
    selectedKeyframeIds: keyframeIds,
  });

  return clipIds.length + audioTrackIds.length + keyframeIds.length;
}

export function clearOpenCutSelection(): number {
  const state = useVideoEditorStore.getState();
  const count = state.selectedClipIds.length + state.selectedAudioTrackIds.length + state.selectedKeyframeIds.length;

  if (count > 0) {
    useVideoEditorStore.setState({
      selectedClipIds: [],
      selectedAudioTrackIds: [],
      selectedKeyframeIds: [],
    });
  }

  return count;
}

export function moveSelectedKeyframes({
  deltaMs = 0,
  snapToGrid = false,
}: {
  deltaMs?: number;
  snapToGrid?: boolean;
}): number {
  const state = useVideoEditorStore.getState();
  const selectedIds = new Set(state.selectedKeyframeIds);
  const selected = state.keyframes.filter((keyframe) => selectedIds.has(keyframe.id));

  if (!selected.length || !Number.isFinite(deltaMs) || deltaMs === 0) {
    return 0;
  }

  const earliestTime = selected.reduce((earliest, keyframe) => Math.min(earliest, keyframe.time), Number.POSITIVE_INFINITY);
  let appliedDelta = deltaMs;
  if (snapToGrid && state.timeline.snapToGrid && state.timeline.gridSize > 0 && Number.isFinite(earliestTime)) {
    const snappedAnchor = Math.round((earliestTime + deltaMs) / state.timeline.gridSize) * state.timeline.gridSize;
    appliedDelta = snappedAnchor - earliestTime;
  }

  const limits = selected.map((keyframe) => {
    const bounds = getKeyframeTargetBounds(state, keyframe);
    return {
      backward: Math.max(0, keyframe.time - bounds.start),
      forward: Math.max(0, bounds.end - keyframe.time),
    };
  });
  const maxBackward = Math.min(...limits.map((limit) => limit.backward));
  const maxForward = Math.min(...limits.map((limit) => limit.forward));
  appliedDelta = Math.max(-maxBackward, Math.min(maxForward, appliedDelta));

  if (!appliedDelta) {
    return 0;
  }

  state.pushHistory();
  let firstMovedTime: number | null = null;
  useVideoEditorStore.setState((current) => ({
    keyframes: current.keyframes.map((keyframe) => {
      if (!selectedIds.has(keyframe.id)) return keyframe;
      const nextTime = Math.max(0, keyframe.time + appliedDelta);
      firstMovedTime ??= nextTime;
      return {
        ...keyframe,
        time: nextTime,
      };
    }),
    playback: firstMovedTime === null
      ? current.playback
      : {
          ...current.playback,
          currentTime: firstMovedTime,
        },
  }));

  const projectId = state.project.id;
  if (projectId) {
    useVideoEditorStore.getState().keyframes
      .filter((keyframe) => selectedIds.has(keyframe.id))
      .forEach((keyframe) => videoEditorService.saveKeyframe(projectId, keyframe));
  }

  return selected.length;
}

export function copyOpenCutSelection(): number {
  const state = useVideoEditorStore.getState();
  const clips = selectedClips(state);
  const audioTracks = selectedAudioTracks(state);
  const selectedTargetIds = new Set([...clips.map((clip) => clip.id), ...audioTracks.map((track) => track.id)]);
  const keyframes = state.keyframes.filter(
    (keyframe) => state.selectedKeyframeIds.includes(keyframe.id) || selectedTargetIds.has(keyframe.targetId)
  );
  const clipboard: OpenCutClipboard = {
    clips,
    audioTracks,
    keyframes,
  };
  state.setOpenCutClipboard(clipboard);
  return clips.length + audioTracks.length + keyframes.length;
}

export function pasteOpenCutClipboard(offsetMs?: number): number {
  const state = useVideoEditorStore.getState();
  const clipboard = state.openCutClipboard;
  const offset = offsetMs ?? Math.max(100, state.timeline.gridSize || 500);

  if (!clipboard.clips.length && !clipboard.audioTracks.length && !clipboard.keyframes.length) {
    return 0;
  }

  const clipIdMap = new Map<string, string>();
  const audioIdMap = new Map<string, string>();
  const existingTargetIds = new Set([
    ...state.clips.map((clip) => clip.id),
    ...state.audioTracks.map((track) => track.id),
  ]);

  const newClips = clipboard.clips.map((clip) => {
    const startTime = (clip.startTime ?? 0) + offset;
    const duplicate = {
      ...clone(clip),
      id: createId(),
      name: `${clip.name} copy`,
      startTime,
      endTime: startTime + (clip.duration ?? 0),
    };
    clipIdMap.set(clip.id, duplicate.id);
    return duplicate;
  });

  const newAudioTracks = clipboard.audioTracks.map((track) => {
    const startTime = (track.startTime ?? 0) + offset;
    const duplicate = {
      ...clone(track),
      id: createId(),
      name: `${track.name} copy`,
      startTime,
      endTime: startTime + (track.duration ?? 0),
    };
    audioIdMap.set(track.id, duplicate.id);
    return duplicate;
  });

  const newKeyframes = clipboard.keyframes
    .map((keyframe) => {
      const targetId = clipIdMap.get(keyframe.targetId) ?? audioIdMap.get(keyframe.targetId);
      const canReuseExistingTarget = keyframe.targetType === 'composition' || existingTargetIds.has(keyframe.targetId);
      if (!targetId && !canReuseExistingTarget) return null;
      return {
        ...clone(keyframe),
        id: createId(),
        targetId: targetId ?? keyframe.targetId,
        time: keyframe.time + offset,
      };
    })
    .filter((keyframe): keyframe is Keyframe => Boolean(keyframe));

  state.pushHistory();
  useVideoEditorStore.setState((current) => ({
    clips: [...current.clips, ...newClips],
    audioTracks: [...current.audioTracks, ...newAudioTracks],
    keyframes: [...current.keyframes, ...newKeyframes],
    selectedClipIds: newClips.map((clip) => clip.id),
    selectedAudioTrackIds: newAudioTracks.map((track) => track.id),
    selectedKeyframeIds: newKeyframes.map((keyframe) => keyframe.id),
  }));

  const projectId = state.project.id;
  if (projectId) {
    newClips.forEach((clip) => videoEditorService.saveTimelineClip(projectId, clip));
    newAudioTracks.forEach((track) => videoEditorService.saveAudioTrack(projectId, track));
    newKeyframes.forEach((keyframe) => videoEditorService.saveKeyframe(projectId, keyframe));
  }

  return newClips.length + newAudioTracks.length + newKeyframes.length;
}

export function separateSelectedSourceAudio(): number {
  const state = useVideoEditorStore.getState();
  const nextTrackIndex = state.audioTracks.reduce((max, track) => Math.max(max, track.trackIndex ?? 0), -1) + 1;
  const separatedSourceIds = new Set(state.audioTracks.map((track) => track.sourceId).filter(Boolean));
  const audioTracks = selectedClips(state)
    .filter((clip) => clip.type === 'video' && Boolean(clip.url) && !separatedSourceIds.has(clip.id))
    .map((clip, index) => {
      const audioTrack: AudioTrack = {
        id: createId(),
        mediaItemId: clip.mediaItemId,
        sourceId: clip.id,
        type: 'audio',
        name: `${clip.name} source audio`,
        url: clip.url,
        startTime: clip.startTime,
        duration: clip.duration,
        endTime: getClipEndMs(clip),
        trimStart: clip.trimStart,
        trimEnd: clip.trimEnd,
        volume: 1,
        isMuted: false,
        trackIndex: nextTrackIndex + index,
        fadeInDuration: 0,
        fadeOutDuration: 0,
        playbackRate: clip.playbackRate,
      };
      return audioTrack;
    });

  if (!audioTracks.length) {
    return 0;
  }

  state.pushHistory();
  useVideoEditorStore.setState((current) => ({
    audioTracks: [...current.audioTracks, ...audioTracks],
    selectedClipIds: [],
    selectedAudioTrackIds: audioTracks.map((track) => track.id),
  }));

  const projectId = state.project.id;
  if (projectId) {
    audioTracks.forEach((track) => videoEditorService.saveAudioTrack(projectId, track));
  }

  return audioTracks.length;
}
