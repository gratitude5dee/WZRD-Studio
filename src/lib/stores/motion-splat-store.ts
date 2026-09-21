import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import type {
  MotionSplatBuildMode,
  MotionSplatJobSummary,
  MotionSplatManifest,
  MotionSplatPipelineStep,
  MotionSplatQuality,
} from '@/types/motionSplat';
import { DEFAULT_KEYFRAME_COUNT, DEFAULT_VIDEO_MODEL_ID } from '@/lib/motion-splat/constants';

export interface MotionSplatSourceImage {
  url: string;
  path?: string;
  name: string;
  /** Local preview (object URL) while the upload is in flight. */
  previewUrl?: string;
}

export interface MotionSplatVideoAsset {
  url: string;
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  modelId?: string;
  jobId?: string;
}

export interface MotionSplatProgress {
  /** 0..1 */
  value: number;
  label: string;
}

export interface MotionSplatStoreState {
  step: MotionSplatPipelineStep;
  busy: boolean;
  error: string | null;
  progress: MotionSplatProgress | null;
  // Inputs
  sourceImage: MotionSplatSourceImage | null;
  prompt: string;
  videoModelId: string;
  videoDuration: 5 | 10;
  buildMode: MotionSplatBuildMode;
  keyframeCount: number;
  quality: MotionSplatQuality;
  title: string;
  // Outputs
  video: MotionSplatVideoAsset | null;
  manifest: MotionSplatManifest | null;
  manifestUrl: string | null;
  // Library
  library: MotionSplatJobSummary[];
  libraryLoading: boolean;
}

export interface MotionSplatStoreActions {
  setSourceImage: (image: MotionSplatSourceImage | null) => void;
  setPrompt: (prompt: string) => void;
  setVideoModelId: (modelId: string) => void;
  setVideoDuration: (duration: 5 | 10) => void;
  setBuildMode: (mode: MotionSplatBuildMode) => void;
  setKeyframeCount: (count: number) => void;
  setQuality: (quality: MotionSplatQuality) => void;
  setTitle: (title: string) => void;
  setVideo: (video: MotionSplatVideoAsset | null) => void;
  setManifest: (manifest: MotionSplatManifest | null, manifestUrl?: string | null) => void;
  setLibrary: (library: MotionSplatJobSummary[]) => void;
  setLibraryLoading: (loading: boolean) => void;
  addToLibrary: (item: MotionSplatJobSummary) => void;
  beginStep: (step: MotionSplatPipelineStep, label?: string) => void;
  setProgress: (progress: MotionSplatProgress | null) => void;
  finishStep: (step: MotionSplatPipelineStep) => void;
  fail: (error: string) => void;
  clearError: () => void;
  reset: () => void;
}

export const initialMotionSplatState: MotionSplatStoreState = {
  step: 'idle',
  busy: false,
  error: null,
  progress: null,
  sourceImage: null,
  prompt: '',
  videoModelId: DEFAULT_VIDEO_MODEL_ID,
  videoDuration: 5,
  buildMode: 'rgbd',
  keyframeCount: DEFAULT_KEYFRAME_COUNT,
  quality: 'auto',
  title: '',
  video: null,
  manifest: null,
  manifestUrl: null,
  library: [],
  libraryLoading: false,
};

const BUSY_STEPS: ReadonlySet<MotionSplatPipelineStep> = new Set(['uploading', 'generating-video', 'building-splat']);

export const useMotionSplatStore = create<MotionSplatStoreState & MotionSplatStoreActions>()(
  devtools(
    (set) => ({
      ...initialMotionSplatState,

      setSourceImage: (image) =>
        set(
          (state) => ({
            sourceImage: image,
            // A new source invalidates downstream outputs.
            video: image && image.url !== state.sourceImage?.url ? null : state.video,
            manifest: image && image.url !== state.sourceImage?.url ? null : state.manifest,
            manifestUrl: image && image.url !== state.sourceImage?.url ? null : state.manifestUrl,
            step: image ? (state.busy ? state.step : 'idle') : 'idle',
            error: null,
          }),
          false,
          'setSourceImage',
        ),
      setPrompt: (prompt) => set({ prompt }, false, 'setPrompt'),
      setVideoModelId: (videoModelId) => set({ videoModelId }, false, 'setVideoModelId'),
      setVideoDuration: (videoDuration) => set({ videoDuration }, false, 'setVideoDuration'),
      setBuildMode: (buildMode) => set({ buildMode }, false, 'setBuildMode'),
      setKeyframeCount: (count) => set({ keyframeCount: Math.max(2, Math.min(60, Math.round(count))) }, false, 'setKeyframeCount'),
      setQuality: (quality) => set({ quality }, false, 'setQuality'),
      setTitle: (title) => set({ title }, false, 'setTitle'),
      setVideo: (video) => set({ video }, false, 'setVideo'),
      setManifest: (manifest, manifestUrl = null) =>
        set({ manifest, manifestUrl, step: manifest ? 'ready' : 'idle' }, false, 'setManifest'),
      setLibrary: (library) => set({ library }, false, 'setLibrary'),
      setLibraryLoading: (libraryLoading) => set({ libraryLoading }, false, 'setLibraryLoading'),
      addToLibrary: (item) =>
        set((state) => ({ library: [item, ...state.library.filter((entry) => entry.id !== item.id)] }), false, 'addToLibrary'),
      beginStep: (step, label) =>
        set(
          { step, busy: BUSY_STEPS.has(step), error: null, progress: label ? { value: 0, label } : null },
          false,
          'beginStep',
        ),
      setProgress: (progress) => set({ progress }, false, 'setProgress'),
      finishStep: (step) => set({ step, busy: BUSY_STEPS.has(step), progress: null }, false, 'finishStep'),
      fail: (error) => set({ step: 'error', busy: false, error, progress: null }, false, 'fail'),
      clearError: () => set((state) => ({ error: null, step: state.step === 'error' ? 'idle' : state.step }), false, 'clearError'),
      reset: () => set({ ...initialMotionSplatState }, false, 'reset'),
    }),
    { name: 'motion-splat-store' },
  ),
);
