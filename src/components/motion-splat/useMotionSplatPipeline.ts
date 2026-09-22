// ---------------------------------------------------------------------------
// useMotionSplatPipeline — orchestrates upload → video → 4D splat → manifest
// against the store and the service. Each stage is resumable on its own so a
// user can regenerate the video without re-uploading, or rebuild the splat
// without regenerating the video.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { useAuth } from '@/providers/AuthProvider';
import { useCredits } from '@/hooks/useCredits';
import { useMotionSplatStore } from '@/lib/stores/motion-splat-store';
import { motionSplatService, MotionSplatServiceError, type MotionSplatOutputFile } from '@/services/motionSplatService';
import {
  DEFAULT_CAMERA,
  DEPTH_CREDIT_COST,
  DEPTH_MODEL_ID,
  MOTION_SPLAT_GRID_PRESETS,
  TRIPOSPLAT_CREDIT_COST,
  videoModelCost,
} from '@/lib/motion-splat/constants';
import { createRgbdManifest, createSplatKeyframesManifest, generateManifestId } from '@/lib/motion-splat/manifest';
import { keyframeTimes } from '@/lib/motion-splat/timeline';
import { resolveGrid } from '@/lib/motion-splat/unproject';
import { captureVideoStills, loadVideoElement } from '@/lib/motion-splat/videoFrames';
import type { MotionSplatManifest } from '@/types/motionSplat';

const TRIPOSPLAT_KEYFRAMES = 6;

export interface MotionSplatPipelineApi {
  uploadImage: (file: File) => Promise<void>;
  generateVideo: () => Promise<void>;
  buildSplat: () => Promise<void>;
  runAll: () => Promise<void>;
  cancel: () => void;
  refreshLibrary: () => Promise<void>;
  openFromLibrary: (manifestUrl: string) => Promise<void>;
  useUploadedVideo: (file: File) => Promise<void>;
  estimateCredits: () => { video: number; splat: number; total: number };
}

function describeError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'Cancelled';
  if (error instanceof MotionSplatServiceError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

function primaryFile(files: MotionSplatOutputFile[], kind: MotionSplatOutputFile['kind']): MotionSplatOutputFile | undefined {
  return files.find((file) => file.kind === kind);
}

async function probeVideo(url: string): Promise<{ duration: number; width: number; height: number }> {
  const video = await loadVideoElement(url, { timeoutMs: 20_000 });
  const meta = { duration: video.duration || 0, width: video.videoWidth || 0, height: video.videoHeight || 0 };
  video.removeAttribute('src');
  video.load();
  return meta;
}

export function useMotionSplatPipeline(): MotionSplatPipelineApi {
  const { user } = useAuth();
  const { refreshCredits } = useCredits();
  const abortRef = useRef<AbortController | null>(null);
  /** Jobs submitted by the current run, so cancelling refunds their holds. */
  const liveJobsRef = useRef<Set<string>>(new Set());

  /** Abandon every job this run started; the credit hold is released server-side. */
  const releaseLiveJobs = useCallback(() => {
    const jobs = [...liveJobsRef.current];
    liveJobsRef.current.clear();
    for (const jobId of jobs) {
      void motionSplatService.cancelJob(jobId).catch(() => {
        /* a job that already finished cannot be cancelled; nothing to undo */
      });
    }
  }, []);

  const ownerId = user?.id ?? 'anonymous';

  const trackJob = useCallback((jobId: string) => {
    liveJobsRef.current.add(jobId);
  }, []);

  const startRun = useCallback(() => {
    abortRef.current?.abort();
    liveJobsRef.current.clear();
    const controller = new AbortController();
    abortRef.current = controller;
    return controller;
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    releaseLiveJobs();
    const store = useMotionSplatStore.getState();
    if (store.busy) store.fail('Cancelled');
  }, [releaseLiveJobs]);

  // Leaving the page mid-run must not strand the store busy or leak a hold.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      releaseLiveJobs();
      const store = useMotionSplatStore.getState();
      if (store.busy) store.fail('Cancelled');
    },
    [releaseLiveJobs],
  );

  const uploadImage = useCallback(
    async (file: File) => {
      const store = useMotionSplatStore.getState();
      const previewUrl = URL.createObjectURL(file);
      store.setSourceImage({ url: previewUrl, name: file.name, previewUrl });
      store.beginStep('uploading', 'Uploading image');
      try {
        const uploaded = await motionSplatService.uploadFile(file, file.name, ownerId);
        useMotionSplatStore.getState().setSourceImage({ url: uploaded.url, path: uploaded.path, name: file.name, previewUrl });
        useMotionSplatStore.getState().finishStep('idle');
      } catch (error) {
        useMotionSplatStore.getState().fail(describeError(error));
        toast.error(describeError(error));
      }
    },
    [ownerId],
  );

  const useUploadedVideo = useCallback(
    async (file: File) => {
      const store = useMotionSplatStore.getState();
      store.beginStep('uploading', 'Uploading video');
      try {
        const uploaded = await motionSplatService.uploadFile(file, file.name, ownerId);
        const meta = await probeVideo(uploaded.url);
        useMotionSplatStore.getState().setVideo({ url: uploaded.url, ...meta });
        useMotionSplatStore.getState().finishStep('idle');
      } catch (error) {
        useMotionSplatStore.getState().fail(describeError(error));
        toast.error(describeError(error));
      }
    },
    [ownerId],
  );

  const generateVideoInternal = useCallback(
    async (signal: AbortSignal) => {
      const store = useMotionSplatStore.getState();
      if (!store.sourceImage || store.sourceImage.previewUrl === store.sourceImage.url) {
        throw new MotionSplatServiceError('Upload an image first');
      }
      store.beginStep('generating-video', 'Submitting video generation');
      const clientRequestId = generateManifestId();
      const result = await motionSplatService.runStage(
        'video',
        { imageUrl: store.sourceImage.url, prompt: store.prompt, modelId: store.videoModelId, duration: store.videoDuration },
        {
          signal,
          clientRequestId,
          onJob: trackJob,
          onProgress: (progress, status) =>
            useMotionSplatStore.getState().setProgress({
              value: progress / 100,
              label:
                status.status === 'processing' && status.queuePosition != null && status.queuePosition > 0
                  ? `Queued (${status.queuePosition} ahead)`
                  : 'Generating video',
            }),
        },
      );
      const videoFile = primaryFile(result.files, 'video');
      if (!videoFile) throw new MotionSplatServiceError('The video generation returned no video');
      const meta = await probeVideo(videoFile.url);
      useMotionSplatStore.getState().setVideo({ url: videoFile.url, ...meta, modelId: store.videoModelId, jobId: result.jobId });
      useMotionSplatStore.getState().finishStep('idle');
      void refreshCredits();
    },
    [refreshCredits, trackJob],
  );

  const buildSplatInternal = useCallback(
    async (signal: AbortSignal) => {
      const store = useMotionSplatStore.getState();
      const video = store.video;
      if (!video) throw new MotionSplatServiceError('Generate or upload a video first');
      store.beginStep('building-splat', store.buildMode === 'rgbd' ? 'Estimating depth' : 'Capturing keyframes');
      const meta = video.duration && video.width && video.height ? { duration: video.duration, width: video.width, height: video.height } : await probeVideo(video.url);
      const aspect = meta.width / Math.max(1, meta.height);
      const title = store.title.trim() || (store.sourceImage?.name ?? 'Motion splat').replace(/\.[a-z0-9]+$/i, '');
      const source = {
        videoUrl: video.url,
        imageUrl: store.sourceImage?.url && store.sourceImage.url !== store.sourceImage.previewUrl ? store.sourceImage.url : undefined,
        prompt: store.prompt || undefined,
        videoModel: video.modelId,
      };
      let manifest: MotionSplatManifest;

      if (store.buildMode === 'rgbd') {
        const result = await motionSplatService.runStage(
          'depth',
          { videoUrl: video.url },
          {
            signal,
            clientRequestId: generateManifestId(),
            onJob: trackJob,
            onProgress: (progress) => useMotionSplatStore.getState().setProgress({ value: progress / 100, label: 'Estimating depth' }),
          },
        );
        const depthFile = primaryFile(result.files, 'video');
        if (!depthFile) throw new MotionSplatServiceError('The depth model returned no video');
        const grid = resolveGrid('high', aspect);
        manifest = createRgbdManifest({
          title,
          provider: 'depth-anything-video',
          source,
          duration: meta.duration,
          fps: video.fps ?? 24,
          width: meta.width,
          height: meta.height,
          camera: DEFAULT_CAMERA,
          depthVideoUrl: depthFile.url,
          depthEncoding: 'inverse-gray8',
          grid: { cols: Math.max(grid.cols, MOTION_SPLAT_GRID_PRESETS.high.cols), rows: Math.max(grid.rows, MOTION_SPLAT_GRID_PRESETS.high.rows) },
          keyframeCount: store.keyframeCount,
          depthModel: DEPTH_MODEL_ID,
          posterUrl: source.imageUrl,
          credits: { splat: DEPTH_CREDIT_COST },
        });
      } else {
        const times = keyframeTimes(meta.duration, TRIPOSPLAT_KEYFRAMES);
        const element = await loadVideoElement(video.url, { signal });
        const stills = await captureVideoStills(element, times, {
          maxWidth: 1024,
          signal,
          onProgress: (p) => useMotionSplatStore.getState().setProgress({ value: p.value * 0.15, label: 'Capturing keyframes' }),
        });
        element.removeAttribute('src');
        element.load();
        const uploads = await Promise.all(
          stills.map((blob, index) => motionSplatService.uploadFile(blob, `keyframe-${index}.png`, ownerId)),
        );
        let completed = 0;
        const runs = await Promise.all(
          uploads.map((upload, index) =>
            motionSplatService
              .runStage(
                'triposplat',
                { imageUrl: upload.url, time: times[index] },
                { signal, clientRequestId: generateManifestId(), onJob: trackJob },
              )
              .then((result) => {
                completed += 1;
                useMotionSplatStore.getState().setProgress({
                  value: 0.15 + (completed / uploads.length) * 0.8,
                  label: `Reconstructing keyframe ${completed} of ${uploads.length}`,
                });
                return { result, index };
              }),
          ),
        );
        const keyframes = runs
          .map(({ result, index }) => {
            const splat = primaryFile(result.files, 'splat');
            if (!splat) throw new MotionSplatServiceError('A keyframe reconstruction returned no splat');
            return { time: times[index], url: splat.url, format: 'ply' as const, sourceImageUrl: uploads[index].url };
          })
          .sort((a, b) => a.time - b.time);
        manifest = createSplatKeyframesManifest({
          title,
          provider: 'triposplat',
          source,
          duration: meta.duration,
          fps: video.fps ?? 24,
          width: meta.width,
          height: meta.height,
          camera: DEFAULT_CAMERA,
          keyframes,
          posterUrl: source.imageUrl,
          credits: { splat: TRIPOSPLAT_CREDIT_COST * keyframes.length },
        });
      }

      useMotionSplatStore.getState().setProgress({ value: 0.97, label: 'Saving motion splat' });
      const saved = await motionSplatService.saveManifest(manifest);
      const current = useMotionSplatStore.getState();
      current.setManifest(manifest, saved.manifestUrl);
      current.addToLibrary({
        id: saved.jobId,
        title: manifest.title,
        createdAt: manifest.createdAt,
        manifestUrl: saved.manifestUrl,
        posterUrl: manifest.posterUrl,
        provider: manifest.provider,
        trackKind: manifest.track.kind,
        duration: manifest.duration,
      });
      current.finishStep('ready');
      void refreshCredits();
    },
    [ownerId, refreshCredits, trackJob],
  );

  const generateVideo = useCallback(async () => {
    const controller = startRun();
    try {
      await generateVideoInternal(controller.signal);
      toast.success('Video ready');
    } catch (error) {
      if (!controller.signal.aborted) {
        useMotionSplatStore.getState().fail(describeError(error));
        toast.error(describeError(error));
      }
    }
  }, [generateVideoInternal, startRun]);

  const buildSplat = useCallback(async () => {
    const controller = startRun();
    try {
      await buildSplatInternal(controller.signal);
      toast.success('Motion splat ready — scrub through time');
    } catch (error) {
      if (!controller.signal.aborted) {
        useMotionSplatStore.getState().fail(describeError(error));
        toast.error(describeError(error));
      }
    }
  }, [buildSplatInternal, startRun]);

  const runAll = useCallback(async () => {
    const controller = startRun();
    try {
      if (!useMotionSplatStore.getState().video) await generateVideoInternal(controller.signal);
      await buildSplatInternal(controller.signal);
      toast.success('Motion splat ready — scrub through time');
    } catch (error) {
      if (!controller.signal.aborted) {
        useMotionSplatStore.getState().fail(describeError(error));
        toast.error(describeError(error));
      }
    }
  }, [buildSplatInternal, generateVideoInternal, startRun]);

  const refreshLibrary = useCallback(async () => {
    const store = useMotionSplatStore.getState();
    store.setLibraryLoading(true);
    try {
      const items = await motionSplatService.listManifests();
      useMotionSplatStore.getState().setLibrary(items);
    } catch (error) {
      console.warn('[motion-splat] library load failed', error);
    } finally {
      useMotionSplatStore.getState().setLibraryLoading(false);
    }
  }, []);

  const openFromLibrary = useCallback(async (manifestUrl: string) => {
    try {
      const manifest = await motionSplatService.fetchManifest(manifestUrl);
      const store = useMotionSplatStore.getState();
      // Order matters: a new source image clears the video and manifest.
      if (manifest.source.imageUrl) store.setSourceImage({ url: manifest.source.imageUrl, name: manifest.title });
      store.setVideo({ url: manifest.source.videoUrl, duration: manifest.duration, width: manifest.width, height: manifest.height, fps: manifest.fps, modelId: manifest.source.videoModel });
      store.setTitle(manifest.title);
      store.setManifest(manifest, manifestUrl);
    } catch (error) {
      toast.error(describeError(error));
    }
  }, []);

  const estimateCredits = useCallback(() => {
    const store = useMotionSplatStore.getState();
    // Quote from the same table the edge function reserves against.
    const video = store.video ? 0 : videoModelCost(store.videoModelId);
    const splat = store.buildMode === 'rgbd' ? DEPTH_CREDIT_COST : TRIPOSPLAT_CREDIT_COST * TRIPOSPLAT_KEYFRAMES;
    return { video, splat, total: video + splat };
  }, []);

  return { uploadImage, generateVideo, buildSplat, runAll, cancel, refreshLibrary, openFromLibrary, useUploadedVideo, estimateCredits };
}
