// ---------------------------------------------------------------------------
// motionSplatService — client wrapper around the `motion-splat` edge function
// plus the direct-to-storage uploads the studio needs. Every call surfaces
// insufficient-credit responses through the global billing dialog.
// ---------------------------------------------------------------------------

import { supabase } from '@/integrations/supabase/client';
import { extractInsufficientCreditsError, routeToBillingTopUp } from '@/lib/billing-errors';
import {
  MOTION_SPLAT_EDGE_FUNCTION,
  MOTION_SPLAT_STORAGE_BUCKET,
  MOTION_SPLAT_STORAGE_PREFIX,
} from '@/lib/motion-splat/constants';
import { parseMotionSplatManifest, resolveManifestUrls } from '@/lib/motion-splat/manifest';
import type { MotionSplatJobSummary, MotionSplatManifest } from '@/types/motionSplat';

export type MotionSplatStage = 'video' | 'depth' | 'triposplat';

export interface SubmitStageResponse {
  jobId: string;
  stage: MotionSplatStage;
  status: 'processing';
  progress: number;
  requestId?: string;
  credits?: number;
}

export interface MotionSplatOutputFile {
  kind: 'video' | 'splat' | 'image';
  url: string;
  path: string;
  contentType: string;
  size: number;
}

export interface MotionSplatJobOutputs {
  files: MotionSplatOutputFile[];
  primary_url: string;
  num_gaussians?: number;
  seed?: number;
}

export interface JobStatusResponse {
  jobId: string;
  stage: MotionSplatStage;
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  queuePosition?: number | null;
  outputs?: MotionSplatJobOutputs;
  error?: string;
}

export interface UploadedFile {
  url: string;
  path: string;
}

export interface PollOptions {
  signal?: AbortSignal;
  intervalMs?: number;
  /** Give up after this many milliseconds (default 15 minutes). */
  timeoutMs?: number;
  onProgress?: (progress: number, status: JobStatusResponse) => void;
}

export class MotionSplatServiceError extends Error {
  readonly code: string;
  constructor(message: string, code = 'motion_splat_error') {
    super(message);
    this.name = 'MotionSplatServiceError';
    this.code = code;
  }
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(MOTION_SPLAT_EDGE_FUNCTION, { body });
  if (error) {
    const insufficient = await extractInsufficientCreditsError(error);
    if (insufficient) {
      routeToBillingTopUp(insufficient);
      throw new MotionSplatServiceError('Insufficient credits', 'insufficient_credits');
    }
    const message = await describeFunctionError(error);
    throw new MotionSplatServiceError(message);
  }
  const payloadInsufficient = await extractInsufficientCreditsError(data);
  if (payloadInsufficient) {
    routeToBillingTopUp(payloadInsufficient);
    throw new MotionSplatServiceError('Insufficient credits', 'insufficient_credits');
  }
  if (data && typeof data === 'object' && 'error' in data && typeof (data as { error?: unknown }).error === 'string' && !('status' in data)) {
    throw new MotionSplatServiceError((data as { error: string }).error);
  }
  return data as T;
}

async function describeFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      const json = await context.clone().json();
      if (json && typeof json.error === 'string') return json.error;
    } catch {
      /* not JSON */
    }
  }
  return error instanceof Error && error.message ? error.message : 'Motion splat request failed';
}

function sanitizeName(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'file';
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

export const motionSplatService = {
  /** Upload a source file straight to the public workflow-media bucket. */
  async uploadFile(file: Blob, name: string, ownerId: string): Promise<UploadedFile> {
    const path = `${MOTION_SPLAT_STORAGE_PREFIX}/${ownerId}/uploads/${Date.now()}-${sanitizeName(name)}`;
    const { error } = await supabase.storage.from(MOTION_SPLAT_STORAGE_BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type || undefined,
    });
    if (error) throw new MotionSplatServiceError(error.message || 'Upload failed', 'upload_failed');
    const { data } = supabase.storage.from(MOTION_SPLAT_STORAGE_BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, path };
  },

  async submitStage(stage: MotionSplatStage, input: Record<string, unknown>, clientRequestId?: string): Promise<SubmitStageResponse> {
    return invoke<SubmitStageResponse>({ action: 'submit', stage, input, clientRequestId });
  },

  async getJobStatus(jobId: string): Promise<JobStatusResponse> {
    return invoke<JobStatusResponse>({ action: 'status', jobId });
  },

  /** Poll a job until it completes; resolves with its outputs or throws. */
  async waitForJob(jobId: string, options: PollOptions = {}): Promise<MotionSplatJobOutputs> {
    const interval = options.intervalMs ?? 2_500;
    const deadline = Date.now() + (options.timeoutMs ?? 15 * 60 * 1000);
    let consecutiveErrors = 0;
    while (Date.now() < deadline) {
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      let status: JobStatusResponse;
      try {
        status = await this.getJobStatus(jobId);
        consecutiveErrors = 0;
      } catch (error) {
        if (error instanceof MotionSplatServiceError && error.code === 'insufficient_credits') throw error;
        consecutiveErrors += 1;
        if (consecutiveErrors >= 5) throw error;
        await delay(interval, options.signal);
        continue;
      }
      options.onProgress?.(status.progress, status);
      if (status.status === 'completed' && status.outputs) return status.outputs;
      if (status.status === 'failed') throw new MotionSplatServiceError(status.error ?? 'Generation failed', 'job_failed');
      await delay(interval, options.signal);
    }
    throw new MotionSplatServiceError('Timed out waiting for the generation', 'timeout');
  },

  async runStage(stage: MotionSplatStage, input: Record<string, unknown>, options: PollOptions & { clientRequestId?: string } = {}): Promise<MotionSplatJobOutputs & { jobId: string }> {
    const submitted = await this.submitStage(stage, input, options.clientRequestId);
    const outputs = await this.waitForJob(submitted.jobId, options);
    return { ...outputs, jobId: submitted.jobId };
  },

  async saveManifest(manifest: MotionSplatManifest): Promise<{ manifestUrl: string; jobId: string }> {
    return invoke<{ manifestUrl: string; jobId: string }>({ action: 'manifest', manifest });
  },

  /** The caller's saved motion splats, newest first (RLS-scoped read). */
  async listManifests(limit = 40): Promise<MotionSplatJobSummary[]> {
    const { data, error } = await supabase
      .from('generation_jobs')
      .select('id, status, created_at, result_url, result_payload, config')
      .eq('config->>kind', 'motion_splat')
      .eq('config->>stage', 'manifest')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new MotionSplatServiceError(error.message || 'Failed to load motion splats');
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return rows
      .map((row): MotionSplatJobSummary | null => {
        const payload = (row.result_payload ?? {}) as Record<string, unknown>;
        if (typeof row.result_url !== 'string') return null;
        return {
          id: String(row.id),
          title: typeof payload.title === 'string' ? payload.title : 'Untitled motion splat',
          createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(0).toISOString(),
          manifestUrl: row.result_url,
          posterUrl: typeof payload.poster_url === 'string' ? payload.poster_url : undefined,
          provider: (typeof payload.provider === 'string' ? payload.provider : 'depth-anything-video') as MotionSplatJobSummary['provider'],
          trackKind: (typeof payload.track_kind === 'string' ? payload.track_kind : 'rgbd') as MotionSplatJobSummary['trackKind'],
          duration: typeof payload.duration === 'number' ? payload.duration : 0,
        };
      })
      .filter((item): item is MotionSplatJobSummary => item !== null);
  },

  async fetchManifest(url: string, signal?: AbortSignal): Promise<MotionSplatManifest> {
    const response = await fetch(url, { cache: 'no-store', signal });
    if (!response.ok) throw new MotionSplatServiceError(`Could not load manifest (${response.status})`);
    const manifest = parseMotionSplatManifest(await response.json());
    return resolveManifestUrls(manifest, url);
  },
};

export type MotionSplatService = typeof motionSplatService;
