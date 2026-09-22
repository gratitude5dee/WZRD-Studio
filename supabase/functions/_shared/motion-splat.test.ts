import {
  MOTION_SPLAT_CLAIM_LEASE_MS,
  buildClaimToken,
  buildDepthInputs,
  buildKlingImageToVideoInputs,
  buildManifestPath,
  buildStoragePath,
  buildTriposplatInputs,
  clampListLimit,
  collectFileRefs,
  contentTypeFor,
  extensionFor,
  isClaimExpired,
  normalizeFalStatus,
  parseExtraInputs,
  pickOutputFile,
  toJobSummary,
  videoModelCost,
} from './motion-splat.ts';

function assertEquals<T>(actual: T, expected: T, message = 'assertion failed') {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test('kling inputs use the string duration enum and no aspect ratio', () => {
  const inputs = buildKlingImageToVideoInputs({ imageUrl: 'https://x/y.png', prompt: 'orbit', duration: 10 });
  assertEquals(inputs.duration, '10', 'duration must be "5" | "10"');
  assertEquals('aspect_ratio' in inputs, false, 'kling o3 i2v does not accept aspect_ratio');
  assertEquals(buildKlingImageToVideoInputs({ imageUrl: 'u', duration: 4 }).duration, '5', 'short clips map to 5');
  assert(String(buildKlingImageToVideoInputs({ imageUrl: 'u' }).prompt).length > 0, 'a default prompt is supplied');
});

Deno.test('depth and triposplat payloads', () => {
  const depth = buildDepthInputs('https://v/rgb.mp4', { colormap: 'gray' });
  assertEquals(depth.video_url, 'https://v/rgb.mp4', 'video_url');
  assertEquals(depth.colormap, 'gray', 'extra inputs are merged');
  const splat = buildTriposplatInputs('https://v/kf.png', 42.7);
  assertEquals(splat.image_url, 'https://v/kf.png', 'image_url');
  assertEquals(splat.seed, 42, 'seed is floored');
  assertEquals('seed' in buildTriposplatInputs('u'), false, 'seed omitted when absent');
});

Deno.test('parseExtraInputs tolerates bad JSON', () => {
  assertEquals(Object.keys(parseExtraInputs(undefined)).length, 0, 'undefined → {}');
  assertEquals(Object.keys(parseExtraInputs('nope')).length, 0, 'invalid → {}');
  assertEquals(parseExtraInputs('{"model_size":"large"}').model_size, 'large', 'valid JSON parses');
});

Deno.test('storage paths are user and job scoped', () => {
  assertEquals(buildStoragePath('u1', 'j1', 'RGB Video.MP4'), 'motion-splat/u1/j1/rgb-video.mp4', 'sanitised name');
  assertEquals(buildManifestPath('u1', 'abc'), 'motion-splat/u1/manifests/abc.json', 'manifest path');
});

Deno.test('pickOutputFile prefers the depth video over side-by-side previews', () => {
  const result = {
    side_by_side: { url: 'https://f/sbs.mp4', content_type: 'video/mp4' },
    depth_video: { url: 'https://f/depth.mp4', content_type: 'video/mp4' },
    raw_depth: { url: 'https://f/depth.npz', content_type: 'application/octet-stream' },
  };
  assertEquals(pickOutputFile(result, 'video')?.url, 'https://f/depth.mp4', 'depth video wins');
  const splat = { model_mesh: { url: 'https://f/output.ply', content_type: 'application/octet-stream', file_name: 'output.ply' }, preprocessed_image: { url: 'https://f/p.png', content_type: 'image/png' } };
  assertEquals(pickOutputFile(splat, 'splat')?.url, 'https://f/output.ply', 'ply wins');
  assertEquals(pickOutputFile(splat, 'image')?.url, 'https://f/p.png', 'image found');
  assertEquals(pickOutputFile({ nothing: true }, 'video'), null, 'no file → null');
  assertEquals(collectFileRefs({ a: [{ url: 'https://f/1.mp4' }, { url: 'not-a-url' }] }).length, 1, 'only http(s) urls');
});

Deno.test('extension and content type resolution', () => {
  const ref = { url: 'https://f/output.ply?sig=1', path: '$' };
  assertEquals(extensionFor('splat', ref), 'ply', 'extension from url');
  assertEquals(extensionFor('video', { url: 'https://f/x', path: '$' }), 'mp4', 'video fallback');
  assertEquals(contentTypeFor('video', { url: 'u', path: '$' }, 'video/mp4; charset=binary'), 'video/mp4', 'header wins');
  assertEquals(contentTypeFor('splat', { url: 'u', path: '$' }, 'application/octet-stream'), 'application/octet-stream', 'octet fallback');
});

Deno.test('job summaries and fal status normalisation', () => {
  const summary = toJobSummary({
    id: 'j', status: 'completed', created_at: '2026-01-01T00:00:00Z', result_url: 'https://s/m.json',
    result_payload: { title: 'Fish', provider: 'triposplat', track_kind: 'splat-keyframes', duration: 4.5 },
  });
  assertEquals(summary?.title, 'Fish', 'title');
  assertEquals(summary?.trackKind, 'splat-keyframes', 'track kind');
  assertEquals(toJobSummary({ id: 'x', status: 'completed', result_url: null }), null, 'no manifest url → null');
  assertEquals(normalizeFalStatus('IN_QUEUE'), 'queued', 'queued');
  assertEquals(normalizeFalStatus('COMPLETED'), 'completed', 'completed');
  assertEquals(normalizeFalStatus('FAILED'), 'failed', 'failed');
  assertEquals(normalizeFalStatus('IN_PROGRESS'), 'processing', 'processing');
});

Deno.test('videoModelCost only prices offered models', () => {
  assertEquals(videoModelCost('fal-ai/kling-video/o3/standard/image-to-video'), 24);
  assertEquals(videoModelCost('fal-ai/kling-video/o3/pro/image-to-video'), 32);
  assertEquals(videoModelCost('fal-ai/veo3.1/image-to-video'), null);
  assertEquals(videoModelCost(''), null);
});

Deno.test('claim tokens expire so a dead worker cannot wedge a job', () => {
  const now = 1_000_000;
  const token = buildClaimToken(now, 'worker-a');
  assertEquals(isClaimExpired(token, now + 1_000), false);
  assertEquals(isClaimExpired(token, now + MOTION_SPLAT_CLAIM_LEASE_MS + 1), true);
  // A claim written before the lease existed carries no timestamp: let it go.
  assertEquals(isClaimExpired('legacy-uuid', now), true);
  assertEquals(isClaimExpired(null, now), false);
  assertEquals(isClaimExpired('worker-b@nonsense', now), true);
});

Deno.test('clampListLimit keeps PostgREST away from NaN', () => {
  assertEquals(clampListLimit(undefined), 40);
  assertEquals(clampListLimit('abc'), 40);
  assertEquals(clampListLimit(Number.NaN), 40);
  assertEquals(clampListLimit(0), 1);
  assertEquals(clampListLimit(7.9), 7);
  assertEquals(clampListLimit(1_000), 100);
  assertEquals(clampListLimit('12'), 12);
});
