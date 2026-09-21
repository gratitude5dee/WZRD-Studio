import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
const storageUpload = vi.fn();
const storageGetPublicUrl = vi.fn();
const fromSelect = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => storageUpload(...args),
        getPublicUrl: (...args: unknown[]) => storageGetPublicUrl(...args),
      }),
    },
    from: () => ({
      select: () => {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        Object.assign(chain, { eq: self, order: self, limit: (...args: unknown[]) => fromSelect(...args) });
        return chain;
      },
    }),
  },
}));

const routeToBillingTopUp = vi.fn();
vi.mock('@/lib/billing-errors', () => ({
  extractInsufficientCreditsError: async (input: unknown) => {
    const payload = input as { code?: string } | null;
    return payload && typeof payload === 'object' && payload.code === 'insufficient_credits' ? payload : null;
  },
  routeToBillingTopUp: (...args: unknown[]) => routeToBillingTopUp(...args),
}));

import { MotionSplatServiceError, motionSplatService } from '@/services/motionSplatService';

beforeEach(() => {
  invoke.mockReset();
  storageUpload.mockReset();
  storageGetPublicUrl.mockReset();
  fromSelect.mockReset();
  routeToBillingTopUp.mockReset();
});

describe('motionSplatService', () => {
  it('uploads to a user-scoped path in workflow-media and returns the public URL', async () => {
    storageUpload.mockResolvedValue({ error: null });
    storageGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn/x.png' } });
    const result = await motionSplatService.uploadFile(new Blob(['x'], { type: 'image/png' }), 'My Photo.PNG', 'user-1');
    expect(result.url).toBe('https://cdn/x.png');
    expect(result.path).toMatch(/^motion-splat\/user-1\/uploads\/\d+-my-photo\.png$/);
    expect(storageUpload).toHaveBeenCalledWith(result.path, expect.any(Blob), { upsert: true, contentType: 'image/png' });
  });

  it('submits a stage through the edge function', async () => {
    invoke.mockResolvedValue({ data: { jobId: 'j1', stage: 'video', status: 'processing', progress: 10 }, error: null });
    const result = await motionSplatService.submitStage('video', { imageUrl: 'https://cdn/a.png' }, 'req-1');
    expect(result.jobId).toBe('j1');
    expect(invoke).toHaveBeenCalledWith('motion-splat', {
      body: { action: 'submit', stage: 'video', input: { imageUrl: 'https://cdn/a.png' }, clientRequestId: 'req-1' },
    });
  });

  it('polls until completion and reports progress', async () => {
    invoke
      .mockResolvedValueOnce({ data: { jobId: 'j1', stage: 'depth', status: 'processing', progress: 20, queuePosition: 2 }, error: null })
      .mockResolvedValueOnce({ data: { jobId: 'j1', stage: 'depth', status: 'completed', progress: 100, outputs: { files: [{ kind: 'video', url: 'https://cdn/d.mp4', path: 'p', contentType: 'video/mp4', size: 1 }], primary_url: 'https://cdn/d.mp4' } }, error: null });
    const progress: number[] = [];
    const outputs = await motionSplatService.waitForJob('j1', { intervalMs: 1, onProgress: (p) => progress.push(p) });
    expect(outputs.primary_url).toBe('https://cdn/d.mp4');
    expect(progress).toEqual([20, 100]);
  });

  it('throws when a job fails', async () => {
    invoke.mockResolvedValue({ data: { jobId: 'j1', stage: 'depth', status: 'failed', progress: 100, error: 'upstream broke' }, error: null });
    await expect(motionSplatService.waitForJob('j1', { intervalMs: 1 })).rejects.toThrow('upstream broke');
  });

  it('routes insufficient-credit responses to the billing dialog', async () => {
    invoke.mockResolvedValue({ data: { code: 'insufficient_credits', required: 24, available: 3 }, error: null });
    await expect(motionSplatService.submitStage('video', { imageUrl: 'https://cdn/a.png' })).rejects.toBeInstanceOf(MotionSplatServiceError);
    expect(routeToBillingTopUp).toHaveBeenCalledTimes(1);
  });

  it('surfaces the edge function error message', async () => {
    invoke.mockResolvedValue({ data: null, error: Object.assign(new Error('boom'), { context: new Response(JSON.stringify({ error: 'stage must be video, depth or triposplat' }), { status: 400 }) }) });
    await expect(motionSplatService.submitStage('video', {})).rejects.toThrow('stage must be video, depth or triposplat');
  });

  it('lists saved manifests from generation_jobs rows', async () => {
    fromSelect.mockResolvedValue({
      data: [
        { id: 'a', status: 'completed', created_at: '2026-02-01T00:00:00Z', result_url: 'https://cdn/a.json', result_payload: { title: 'Fish', provider: 'triposplat', track_kind: 'splat-keyframes', duration: 5 } },
        { id: 'b', status: 'completed', created_at: '2026-02-02T00:00:00Z', result_url: null, result_payload: {} },
      ],
      error: null,
    });
    const items = await motionSplatService.listManifests();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'a', title: 'Fish', trackKind: 'splat-keyframes', duration: 5 });
  });

  it('fetches and resolves a manifest', async () => {
    const manifest = {
      version: 1, id: 'm', title: 'T', createdAt: 'x', provider: 'depth-anything-video',
      source: { videoUrl: 'rgb.mp4' }, duration: 3, fps: 24, width: 640, height: 360,
      camera: { fovDeg: 50, near: 1, far: 3 },
      track: { kind: 'rgbd', depthVideoUrl: 'depth.mp4', depthEncoding: 'inverse-gray8', grid: { cols: 64, rows: 36 }, keyframeCount: 8 },
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(manifest), { status: 200 })));
    const resolved = await motionSplatService.fetchManifest('https://cdn/motion/m.json');
    expect(resolved.source.videoUrl).toBe('https://cdn/motion/rgb.mp4');
    vi.unstubAllGlobals();
  });
});
