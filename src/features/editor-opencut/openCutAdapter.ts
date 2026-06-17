import type {
  AudioTrack,
  Clip,
  CompositionSettings,
  EditorBookmark,
  Keyframe,
  TrackControlState,
} from '@/store/videoEditorStore';
import type {
  OpenCutElement,
  OpenCutElementType,
  OpenCutProjectSnapshot,
  OpenCutTrack,
  OpenCutTrackType,
} from './openCutTypes';

interface BuildOpenCutSnapshotInput {
  projectId: string | null;
  projectName: string;
  clips: Clip[];
  audioTracks: AudioTrack[];
  composition: CompositionSettings;
  selectedClipIds: string[];
  selectedAudioTrackIds: string[];
  selectedKeyframeIds?: string[];
  keyframes?: Keyframe[];
  bookmarks?: EditorBookmark[];
  trackControls?: Record<string, TrackControlState>;
}

const getClipEndMs = (clip: Pick<Clip, 'startTime' | 'duration' | 'endTime'>) =>
  clip.endTime ?? (clip.startTime ?? 0) + (clip.duration ?? 0);

const getAudioEndMs = (track: Pick<AudioTrack, 'startTime' | 'duration' | 'endTime'>) =>
  track.endTime ?? (track.startTime ?? 0) + (track.duration ?? 0);

function clipElementType(clip: Clip): OpenCutElementType {
  if (clip.type === 'element') return 'graphic';
  return clip.type;
}

function clipTrackType(clip: Clip): OpenCutTrackType {
  if (clip.type === 'text') return 'text';
  if (clip.type === 'element') return 'graphic';
  return 'video';
}

function pushTrack(map: Map<string, OpenCutTrack>, track: Omit<OpenCutTrack, 'elements'>) {
  if (!map.has(track.id)) {
    map.set(track.id, { ...track, elements: [] });
  }
  return map.get(track.id)!;
}

function applyTrackControls(
  track: Omit<OpenCutTrack, 'elements'>,
  controls?: Record<string, TrackControlState>
): Omit<OpenCutTrack, 'elements'> {
  const control = controls?.[track.id];
  if (!control) return track;
  return {
    ...track,
    locked: control.locked,
    visible: control.visible,
    muted: track.type === 'audio' ? control.muted : track.muted,
  };
}

function buildScenes({
  projectName,
  durationMs,
  bookmarks,
}: {
  projectName: string;
  durationMs: number;
  bookmarks: EditorBookmark[];
}) {
  const sorted = [...bookmarks]
    .filter((bookmark) => bookmark.time > 0 && bookmark.time < durationMs)
    .sort((a, b) => a.time - b.time);

  if (!sorted.length) {
    return [
      {
        id: 'scene-1',
        name: projectName || 'Scene 1',
        startMs: 0,
        durationMs,
        endMs: durationMs,
      },
    ];
  }

  const boundaries = [0, ...sorted.map((bookmark) => bookmark.time), durationMs];
  return boundaries.slice(0, -1).map((startMs, index) => {
    const endMs = boundaries[index + 1];
    const bookmark = sorted[index - 1];
    return {
      id: bookmark ? `scene-${bookmark.id}` : 'scene-1',
      name: bookmark?.name ?? (projectName || 'Scene 1'),
      startMs,
      durationMs: Math.max(0, endMs - startMs),
      endMs,
    };
  });
}

export function buildOpenCutProjectSnapshot(input: BuildOpenCutSnapshotInput): OpenCutProjectSnapshot {
  const trackMap = new Map<string, OpenCutTrack>();
  const keyframesByTarget = new Map<string, Keyframe[]>();
  (input.keyframes ?? []).forEach((keyframe) => {
    const targetKeyframes = keyframesByTarget.get(keyframe.targetId) ?? [];
    targetKeyframes.push(keyframe);
    keyframesByTarget.set(keyframe.targetId, targetKeyframes);
  });

  [...input.clips]
    .sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0) || (a.startTime ?? 0) - (b.startTime ?? 0))
    .forEach((clip) => {
      const index = clip.trackIndex ?? clip.layer ?? 0;
      const type = clipTrackType(clip);
      const track = pushTrack(
        trackMap,
        applyTrackControls(
          {
            id: `visual-${index}`,
            type,
            label: type === 'text' ? `Text ${index + 1}` : type === 'graphic' ? `Graphic ${index + 1}` : `Video ${index + 1}`,
            index,
            locked: false,
            visible: true,
          },
          input.trackControls
        )
      );
      const startMs = Math.max(0, clip.startTime ?? 0);
      const durationMs = Math.max(0, clip.duration ?? getClipEndMs(clip) - startMs);
      const element: OpenCutElement = {
        id: clip.id,
        type: clipElementType(clip),
        trackId: track.id,
        sourceId: clip.sourceId ?? clip.mediaItemId ?? null,
        name: clip.name,
        sourceUrl: clip.url,
        startMs,
        durationMs,
        endMs: startMs + durationMs,
        trimStartMs: Math.max(0, clip.trimStart ?? 0),
        trimEndMs: Math.max(0, clip.trimEnd ?? durationMs),
        layer: clip.layer ?? index,
        playbackRate: clip.playbackRate ?? 1,
        effects: clip.effects ?? [],
        masks: clip.masks ?? [],
        graphicElement: clip.element,
        keyframes: keyframesByTarget.get(clip.id) ?? [],
        wzrdClip: clip,
      };
      track.elements.push(element);
    });

  [...input.audioTracks]
    .sort((a, b) => (a.trackIndex ?? 0) - (b.trackIndex ?? 0) || (a.startTime ?? 0) - (b.startTime ?? 0))
    .forEach((audioTrack) => {
      const index = audioTrack.trackIndex ?? 0;
      const track = pushTrack(
        trackMap,
        applyTrackControls(
          {
            id: `audio-${index}`,
            type: 'audio',
            label: `Audio ${index + 1}`,
            index,
            locked: false,
            visible: true,
            muted: audioTrack.isMuted,
          },
          input.trackControls
        )
      );
      const startMs = Math.max(0, audioTrack.startTime ?? 0);
      const durationMs = Math.max(0, audioTrack.duration ?? getAudioEndMs(audioTrack) - startMs);
      track.elements.push({
        id: audioTrack.id,
        type: 'audio',
        trackId: track.id,
        sourceId: audioTrack.sourceId ?? audioTrack.mediaItemId ?? null,
        name: audioTrack.name,
        sourceUrl: audioTrack.url,
        startMs,
        durationMs,
        endMs: startMs + durationMs,
        trimStartMs: Math.max(0, audioTrack.trimStart ?? 0),
        trimEndMs: Math.max(0, audioTrack.trimEnd ?? durationMs),
        layer: index,
        volume: audioTrack.volume,
        muted: audioTrack.isMuted,
        playbackRate: audioTrack.playbackRate ?? 1,
        keyframes: keyframesByTarget.get(audioTrack.id) ?? [],
        wzrdAudioTrack: audioTrack,
      });
    });

  const tracks = Array.from(trackMap.values()).sort((a, b) => {
    if (a.type === 'audio' && b.type !== 'audio') return 1;
    if (a.type !== 'audio' && b.type === 'audio') return -1;
    return a.index - b.index;
  });
  const elementEnd = tracks.flatMap((track) => track.elements).reduce((end, element) => Math.max(end, element.endMs), 0);
  const durationMs = Math.max(input.composition.duration, elementEnd);
  const bookmarks = [...(input.bookmarks ?? [])].sort((a, b) => a.time - b.time);

  return {
    id: input.projectId,
    name: input.projectName,
    composition: input.composition,
    durationMs,
    tracks,
    scenes: buildScenes({ projectName: input.projectName, durationMs, bookmarks }),
    bookmarks,
    selectedElementIds: [...input.selectedClipIds, ...input.selectedAudioTrackIds],
    selectedKeyframeIds: [...(input.selectedKeyframeIds ?? [])],
  };
}
