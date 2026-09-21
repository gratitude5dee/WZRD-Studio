// ---------------------------------------------------------------------------
// Pure helpers for the motion-splat edge function: model ids, credit prices,
// fal payload builders, storage paths and fal-result parsing. No I/O so the
// module can be covered by `deno test` without network access.
// ---------------------------------------------------------------------------

export const MOTION_SPLAT_MODELS = {
  depth: 'fal-ai/depth-anything-video',
  splat: 'tripo3d/triposplat',
  defaultVideo: 'fal-ai/kling-video/o3/standard/image-to-video',
} as const;

export type MotionSplatStage = 'video' | 'depth' | 'triposplat';

export const MOTION_SPLAT_STAGES: readonly MotionSplatStage[] = ['video', 'depth', 'triposplat'];

/**
 * Credits per call. These ids are not in the canonical fal catalog, so the
 * shared cost resolver would silently price a fallback model; keep a local
 * table instead. Mirrors src/lib/motion-splat/constants.ts.
 */
export const MOTION_SPLAT_COSTS: Record<MotionSplatStage, number> = {
  video: 24,
  depth: 10,
  triposplat: 12,
};

export const MOTION_SPLAT_JOB_KIND = 'motion_splat';
export const MOTION_SPLAT_BUCKET = 'workflow-media';
export const MOTION_SPLAT_MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;

export function isMotionSplatStage(value: unknown): value is MotionSplatStage {
  return typeof value === 'string' && (MOTION_SPLAT_STAGES as readonly string[]).includes(value);
}

export interface VideoInputParams {
  imageUrl: string;
  prompt?: string;
  /** Seconds; kling accepts 5 or 10. */
  duration?: number;
  generateAudio?: boolean;
}

/** Kling o3 image-to-video payload (duration is a string enum, no aspect_ratio). */
export function buildKlingImageToVideoInputs(params: VideoInputParams): Record<string, unknown> {
  const seconds = params.duration && params.duration >= 8 ? '10' : '5';
  return {
    prompt: (params.prompt ?? '').trim() || 'Natural motion, cinematic camera, coherent scene',
    image_url: params.imageUrl,
    duration: seconds,
    generate_audio: params.generateAudio ?? false,
  };
}

/** Generic image-to-video payload for other canonical fal models. */
export function buildGenericImageToVideoInputs(params: VideoInputParams): Record<string, unknown> {
  const seconds = Math.max(1, Math.round(params.duration ?? 5));
  return {
    prompt: (params.prompt ?? '').trim() || 'Natural motion, cinematic camera, coherent scene',
    image_url: params.imageUrl,
    duration: String(seconds),
    duration_seconds: seconds,
  };
}

export function buildDepthInputs(videoUrl: string, extra?: Record<string, unknown>): Record<string, unknown> {
  return { video_url: videoUrl, ...(extra ?? {}) };
}

export function buildTriposplatInputs(imageUrl: string, seed?: number): Record<string, unknown> {
  return { image_url: imageUrl, ...(typeof seed === 'number' && Number.isFinite(seed) ? { seed: Math.floor(seed) } : {}) };
}

/** Parse the optional JSON blob operators can set to tune depth-model inputs. */
export function parseExtraInputs(raw: string | undefined | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function sanitizeFileName(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 80) : 'file';
}

export function buildStoragePath(userId: string, jobId: string, fileName: string): string {
  return `motion-splat/${userId}/${jobId}/${sanitizeFileName(fileName)}`;
}

export function buildManifestPath(userId: string, manifestId: string): string {
  return `motion-splat/${userId}/manifests/${sanitizeFileName(manifestId)}.json`;
}

export interface FalFileRef {
  url: string;
  contentType?: string;
  fileName?: string;
  fileSize?: number;
  /** JSON path where the file was found, for logging. */
  path: string;
}

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|$)/i;
const SPLAT_EXT = /\.(ply|spz|splat)(\?|$)/i;
const IMAGE_EXT = /\.(png|jpe?g|webp)(\?|$)/i;

function looksLike(kind: 'video' | 'splat' | 'image', ref: FalFileRef): boolean {
  const ct = (ref.contentType ?? '').toLowerCase();
  const name = `${ref.fileName ?? ''} ${ref.url}`;
  if (kind === 'video') return ct.startsWith('video/') || VIDEO_EXT.test(name);
  if (kind === 'splat') return ct.includes('ply') || ct.includes('octet-stream') || SPLAT_EXT.test(name);
  return ct.startsWith('image/') || IMAGE_EXT.test(name);
}

/** Depth-first walk collecting every `{ url }` object in a fal result. */
export function collectFileRefs(value: unknown, path = '$', out: FalFileRef[] = []): FalFileRef[] {
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectFileRefs(item, `${path}[${index}]`, out));
    return out;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.url === 'string' && /^https?:\/\//.test(record.url)) {
    out.push({
      url: record.url,
      contentType: typeof record.content_type === 'string' ? record.content_type : undefined,
      fileName: typeof record.file_name === 'string' ? record.file_name : undefined,
      fileSize: typeof record.file_size === 'number' ? record.file_size : undefined,
      path,
    });
  }
  for (const [key, child] of Object.entries(record)) {
    if (child && typeof child === 'object') collectFileRefs(child, `${path}.${key}`, out);
  }
  return out;
}

const PREFERRED_KEYS: Record<'video' | 'splat' | 'image', string[]> = {
  video: ['depth_video', 'video', 'output', 'result'],
  splat: ['model_mesh', 'model', 'splat', 'ply', 'output'],
  image: ['preprocessed_image', 'image', 'images'],
};

/** Pick the most plausible output file of a kind from a fal result. */
export function pickOutputFile(result: unknown, kind: 'video' | 'splat' | 'image'): FalFileRef | null {
  const refs = collectFileRefs(result).filter((ref) => looksLike(kind, ref));
  if (refs.length === 0) return null;
  // Prefer well-known keys; avoid side-by-side / comparison renders for video.
  const scored = refs.map((ref) => {
    let score = 0;
    const lowerPath = ref.path.toLowerCase();
    PREFERRED_KEYS[kind].forEach((key, index) => {
      if (lowerPath.includes(`.${key}`)) score += 100 - index * 10;
    });
    if (kind === 'video' && /side_by_side|comparison|preview/.test(lowerPath)) score -= 200;
    if (kind === 'video' && /npz|raw/.test(lowerPath)) score -= 300;
    return { ref, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].ref;
}

export function extensionFor(kind: 'video' | 'splat' | 'image', ref: FalFileRef): string {
  const name = ref.fileName ?? ref.url.split('?')[0];
  const match = name.match(/\.([a-z0-9]{2,5})$/i);
  if (match) return match[1].toLowerCase();
  if (kind === 'video') return 'mp4';
  if (kind === 'splat') return 'ply';
  return 'png';
}

export function contentTypeFor(kind: 'video' | 'splat' | 'image', ref: FalFileRef, headerType?: string | null): string {
  const header = (headerType ?? '').split(';')[0].trim();
  if (header && header !== 'application/octet-stream' && header !== 'binary/octet-stream') return header;
  if (ref.contentType) return ref.contentType;
  if (kind === 'video') return 'video/mp4';
  if (kind === 'splat') return 'application/octet-stream';
  return 'image/png';
}

export interface MotionSplatJobRow {
  id: string;
  status: string;
  created_at?: string;
  completed_at?: string | null;
  result_url?: string | null;
  error_message?: string | null;
  config?: Record<string, unknown> | null;
  result_payload?: Record<string, unknown> | null;
  external_request_id?: string | null;
  model_id?: string | null;
}

export interface MotionSplatJobSummary {
  id: string;
  title: string;
  createdAt: string;
  manifestUrl: string;
  posterUrl?: string;
  provider: string;
  trackKind: string;
  duration: number;
}

/** Map a completed manifest job row to the client summary shape. */
export function toJobSummary(row: MotionSplatJobRow): MotionSplatJobSummary | null {
  if (!row.result_url) return null;
  const payload = (row.result_payload ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    title: typeof payload.title === 'string' ? payload.title : 'Untitled motion splat',
    createdAt: row.created_at ?? new Date(0).toISOString(),
    manifestUrl: row.result_url,
    posterUrl: typeof payload.poster_url === 'string' ? payload.poster_url : undefined,
    provider: typeof payload.provider === 'string' ? payload.provider : 'depth-anything-video',
    trackKind: typeof payload.track_kind === 'string' ? payload.track_kind : 'rgbd',
    duration: typeof payload.duration === 'number' ? payload.duration : 0,
  };
}

/** Normalised fal queue status. */
export type FalQueueState = 'queued' | 'processing' | 'completed' | 'failed';

export function normalizeFalStatus(status: unknown): FalQueueState {
  const value = String(status ?? '').toUpperCase();
  if (value === 'COMPLETED') return 'completed';
  if (value === 'FAILED' || value === 'CANCELLED' || value === 'ERROR') return 'failed';
  if (value === 'IN_QUEUE') return 'queued';
  return 'processing';
}

export function progressForState(state: FalQueueState, queuePosition?: number): number {
  if (state === 'completed') return 100;
  if (state === 'failed') return 100;
  if (state === 'queued') return typeof queuePosition === 'number' ? Math.max(5, Math.min(30, 30 - queuePosition)) : 10;
  return 60;
}
