/**
 * Server-side timeline editing over the persisted QCut snapshot.
 *
 * The editor's own command layer (`src/qcut/bridge/agent-api.ts`) runs inside the
 * renderer against Zustand stores, so it cannot be reused from an Edge Function.
 * This module reimplements the four mutating commands an agent needs
 * (add/move/trim/delete) directly against `projects.qcut_project_json`, keeping
 * the store semantics that matter for a snapshot the renderer will later load:
 *
 *  - media/audio elements reuse the first track of their type, text always gets
 *    a fresh track at index 0 (mirrors `findOrCreateTrackOperation`);
 *  - `startTime` is clamped at 0 (mirrors `updateElementStartTime`);
 *  - trims must leave a positive visible duration;
 *  - elements on one track may not overlap, which the renderer would otherwise
 *    have to resolve on load.
 */
import { notFoundError, validationError } from './errors.ts';

export type TrackType = 'media' | 'text' | 'audio' | 'sticker' | 'captions' | 'remotion' | 'markdown';

export interface TimelineElement {
  id: string;
  type: string;
  name: string;
  duration: number;
  startTime: number;
  trimStart: number;
  trimEnd: number;
  [key: string]: unknown;
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: TrackType;
  elements: TimelineElement[];
  muted?: boolean;
  isMain?: boolean;
}

export interface QcutSnapshot {
  version: number;
  savedAt: string;
  qcutProjectId?: string;
  project?: unknown;
  timeline?: { tracks?: TimelineTrack[]; [key: string]: unknown };
  media?: { mediaItems?: Array<Record<string, unknown>>; [key: string]: unknown };
  [key: string]: unknown;
}

const DEFAULT_DURATION = 5;

function trackName(type: TrackType): string {
  switch (type) {
    case 'media': return 'Media Track';
    case 'text': return 'Text Track';
    case 'markdown': return 'Markdown Track';
    case 'audio': return 'Audio Track';
    case 'sticker': return 'Sticker Track';
    case 'captions': return 'Captions Track';
    case 'remotion': return 'Remotion Track';
    default: return 'Track';
  }
}

function createTrack(type: TrackType): TimelineTrack {
  return { id: crypto.randomUUID(), name: trackName(type), type, elements: [], muted: false };
}

function visibleSpan(element: TimelineElement): { start: number; end: number } {
  const visible = element.duration - element.trimStart - element.trimEnd;
  return { start: element.startTime, end: element.startTime + Math.max(0, visible) };
}

function assertNoOverlap(track: TimelineTrack, candidate: TimelineElement): void {
  const span = visibleSpan(candidate);
  for (const element of track.elements) {
    if (element.id === candidate.id) continue;
    const other = visibleSpan(element);
    if (span.start < other.end && other.start < span.end) {
      throw validationError(
        `Element would overlap "${element.name}" (${other.start}s–${other.end}s) on track ${track.id}. Move it or pick another track.`,
        { conflictingElementId: element.id, trackId: track.id },
      );
    }
  }
}

export function readTracks(snapshot: QcutSnapshot): TimelineTrack[] {
  const tracks = snapshot.timeline?.tracks;
  return Array.isArray(tracks) ? tracks : [];
}

function findTrack(tracks: TimelineTrack[], trackId: string): TimelineTrack {
  const track = tracks.find((candidate) => candidate.id === trackId);
  if (!track) throw notFoundError(`No timeline track ${trackId} in this project.`);
  return track;
}

function findElement(track: TimelineTrack, elementId: string): TimelineElement {
  const element = track.elements.find((candidate) => candidate.id === elementId);
  if (!element) throw notFoundError(`No element ${elementId} on track ${track.id}.`);
  return element;
}

export interface AddOperation {
  op: 'add';
  kind: 'media' | 'text';
  mediaId?: string;
  content?: string;
  name?: string;
  trackId?: string;
  startTime: number;
  duration?: number;
}

export interface MoveOperation {
  op: 'move';
  trackId: string;
  elementId: string;
  startTime: number;
  toTrackId?: string;
}

export interface TrimOperation {
  op: 'trim';
  trackId: string;
  elementId: string;
  trimStart?: number;
  trimEnd?: number;
}

export interface DeleteOperation {
  op: 'delete';
  trackId: string;
  elementId: string;
}

export type TimelineOperation = AddOperation | MoveOperation | TrimOperation | DeleteOperation;

function applyAdd(snapshot: QcutSnapshot, tracks: TimelineTrack[], operation: AddOperation) {
  const startTime = Math.max(0, operation.startTime);

  if (operation.kind === 'media') {
    if (!operation.mediaId) {
      throw validationError('operations[].mediaId is required when kind is "media".');
    }
    const mediaItems = snapshot.media?.mediaItems ?? [];
    const item = mediaItems.find((candidate) => candidate.id === operation.mediaId);
    if (!item) {
      throw notFoundError(
        `Media ${operation.mediaId} is not in this project's library. Import it in the editor first.`,
      );
    }

    const itemType = typeof item.type === 'string' ? item.type : 'video';
    const trackType: TrackType = itemType === 'audio' ? 'audio' : 'media';
    let track = operation.trackId
      ? findTrack(tracks, operation.trackId)
      : tracks.find((candidate) => candidate.type === trackType);
    if (!track) {
      track = createTrack(trackType);
      tracks.push(track);
    }

    const itemDuration = typeof item.duration === 'number' ? item.duration : undefined;
    const element: TimelineElement = {
      id: crypto.randomUUID(),
      type: 'media',
      mediaId: String(operation.mediaId),
      name: operation.name ?? (typeof item.name === 'string' ? item.name : 'Clip'),
      duration: operation.duration ?? itemDuration ?? DEFAULT_DURATION,
      startTime,
      trimStart: 0,
      trimEnd: 0,
    };
    assertNoOverlap(track, element);
    track.elements.push(element);
    return { trackId: track.id, elementId: element.id };
  }

  if (!operation.content) {
    throw validationError('operations[].content is required when kind is "text".');
  }

  // Text overlays always get their own track, at the top of the stack.
  const track = operation.trackId ? findTrack(tracks, operation.trackId) : createTrack('text');
  if (!operation.trackId) tracks.unshift(track);

  const element: TimelineElement = {
    id: crypto.randomUUID(),
    type: 'text',
    name: operation.name ?? 'Title',
    content: operation.content,
    duration: operation.duration ?? DEFAULT_DURATION,
    startTime,
    trimStart: 0,
    trimEnd: 0,
    fontSize: 48,
    fontFamily: 'Arial',
    color: '#ffffff',
    backgroundColor: 'transparent',
    textAlign: 'center',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textDecoration: 'none',
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
  };
  assertNoOverlap(track, element);
  track.elements.push(element);
  return { trackId: track.id, elementId: element.id };
}

function applyMove(tracks: TimelineTrack[], operation: MoveOperation) {
  const source = findTrack(tracks, operation.trackId);
  const element = findElement(source, operation.elementId);
  const target = operation.toTrackId ? findTrack(tracks, operation.toTrackId) : source;
  const moved = { ...element, startTime: Math.max(0, operation.startTime) };

  assertNoOverlap(target, moved);
  source.elements = source.elements.filter((candidate) => candidate.id !== element.id);
  target.elements.push(moved);
  return { trackId: target.id, elementId: moved.id };
}

function applyTrim(tracks: TimelineTrack[], operation: TrimOperation) {
  const track = findTrack(tracks, operation.trackId);
  const element = findElement(track, operation.elementId);
  const trimStart = Math.max(0, operation.trimStart ?? element.trimStart);
  const trimEnd = Math.max(0, operation.trimEnd ?? element.trimEnd);

  if (element.duration - trimStart - trimEnd <= 0) {
    throw validationError(
      `Trim leaves no visible duration for ${element.id} (duration ${element.duration}s, trimStart ${trimStart}s, trimEnd ${trimEnd}s).`,
    );
  }

  const trimmed = { ...element, trimStart, trimEnd };
  assertNoOverlap(track, trimmed);
  track.elements = track.elements.map((candidate) => (candidate.id === element.id ? trimmed : candidate));
  return { trackId: track.id, elementId: element.id };
}

function applyDelete(tracks: TimelineTrack[], operation: DeleteOperation) {
  const track = findTrack(tracks, operation.trackId);
  const element = findElement(track, operation.elementId);
  track.elements = track.elements.filter((candidate) => candidate.id !== element.id);
  return { trackId: track.id, elementId: element.id };
}

export interface TimelineSummary {
  duration: number;
  tracks: Array<{
    id: string;
    name: string;
    type: TrackType;
    muted: boolean;
    elements: Array<{
      id: string;
      type: string;
      name: string;
      startTime: number;
      duration: number;
      trimStart: number;
      trimEnd: number;
      visibleDuration: number;
      mediaId?: string;
      content?: string;
    }>;
  }>;
}

export function summarizeTimeline(tracks: TimelineTrack[]): TimelineSummary {
  let duration = 0;
  const summary = tracks.map((track) => ({
    id: track.id,
    name: track.name,
    type: track.type,
    muted: track.muted === true,
    elements: (track.elements ?? []).map((element) => {
      const span = visibleSpan(element);
      duration = Math.max(duration, span.end);
      return {
        id: element.id,
        type: element.type,
        name: element.name,
        startTime: element.startTime,
        duration: element.duration,
        trimStart: element.trimStart,
        trimEnd: element.trimEnd,
        visibleDuration: Math.max(0, span.end - span.start),
        mediaId: typeof element.mediaId === 'string' ? element.mediaId : undefined,
        content: typeof element.content === 'string' ? element.content : undefined,
      };
    }),
  }));
  return { duration, tracks: summary };
}

export interface ApplyResult {
  snapshot: QcutSnapshot;
  timeline: TimelineSummary;
  applied: Array<{ op: string; trackId: string; elementId: string }>;
}

/** Apply operations in order; the first failure aborts without persisting. */
export function applyTimelineOperations(
  snapshot: QcutSnapshot,
  operations: TimelineOperation[],
): ApplyResult {
  const next = structuredClone(snapshot) as QcutSnapshot;
  const tracks = readTracks(next);
  const applied: Array<{ op: string; trackId: string; elementId: string }> = [];

  for (const operation of operations) {
    switch (operation.op) {
      case 'add':
        applied.push({ op: 'add', ...applyAdd(next, tracks, operation) });
        break;
      case 'move':
        applied.push({ op: 'move', ...applyMove(tracks, operation) });
        break;
      case 'trim':
        applied.push({ op: 'trim', ...applyTrim(tracks, operation) });
        break;
      case 'delete':
        applied.push({ op: 'delete', ...applyDelete(tracks, operation) });
        break;
      default:
        throw validationError(`Unsupported timeline operation: ${(operation as { op: string }).op}`);
    }
  }

  next.timeline = { ...(next.timeline ?? {}), tracks };
  next.savedAt = new Date().toISOString();

  return { snapshot: next, timeline: summarizeTimeline(tracks), applied };
}
