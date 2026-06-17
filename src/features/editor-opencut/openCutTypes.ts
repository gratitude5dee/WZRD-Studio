import type { AudioTrack, Clip, ClipEffect, ClipGraphicElement, ClipMask, CompositionSettings, EditorBookmark, Keyframe } from '@/store/videoEditorStore';

export type OpenCutTrackType = 'video' | 'text' | 'audio' | 'graphic' | 'effect';
export type OpenCutElementType = 'video' | 'image' | 'text' | 'audio' | 'graphic' | 'effect';

export interface OpenCutElement {
  id: string;
  type: OpenCutElementType;
  trackId: string;
  sourceId: string | null;
  name: string;
  sourceUrl: string;
  startMs: number;
  durationMs: number;
  endMs: number;
  trimStartMs: number;
  trimEndMs: number;
  layer: number;
  volume?: number;
  muted?: boolean;
  playbackRate?: number;
  effects?: ClipEffect[];
  masks?: ClipMask[];
  graphicElement?: ClipGraphicElement;
  keyframes?: Keyframe[];
  wzrdClip?: Clip;
  wzrdAudioTrack?: AudioTrack;
}

export interface OpenCutTrack {
  id: string;
  type: OpenCutTrackType;
  label: string;
  index: number;
  locked: boolean;
  visible: boolean;
  muted?: boolean;
  elements: OpenCutElement[];
}

export interface OpenCutScene {
  id: string;
  name: string;
  startMs: number;
  durationMs: number;
  endMs: number;
}

export interface OpenCutProjectSnapshot {
  id: string | null;
  name: string;
  composition: CompositionSettings;
  durationMs: number;
  tracks: OpenCutTrack[];
  scenes: OpenCutScene[];
  bookmarks: EditorBookmark[];
  selectedElementIds: string[];
  selectedKeyframeIds: string[];
}
