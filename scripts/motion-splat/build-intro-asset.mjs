#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Build the wzrd.tech intro asset from a video clip.
//
//   FAL_KEY=... node scripts/motion-splat/build-intro-asset.mjs \
//     --video public/introani.mp4 [--out public/intro-splat] [--title "WZRD"] \
//     [--fov 50] [--near 1] [--far 3] [--keyframes 24] [--grid 320x180] \
//     [--depth-url https://.../depth.mp4]   # skip fal, reuse an existing depth video
//
// Steps: (1) upload the clip to fal storage (or use an http(s) URL directly),
// (2) run fal-ai/depth-anything-video, (3) download rgb + depth into --out,
// (4) write manifest.json with relative media paths. The landing intro probes
// /intro-splat/manifest.json at runtime; nothing else needs to change.
// ---------------------------------------------------------------------------

import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';

const DEPTH_MODEL = 'fal-ai/depth-anything-video';

function parseArgs(argv) {
  const args = { out: 'public/intro-splat', title: 'WZRD intro', fov: 50, near: 1, far: 3, keyframes: 24, grid: '320x180', fps: 24 };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    args[name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  return args;
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

async function downloadTo(url, filePath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}) for ${url}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(filePath));
  const info = await stat(filePath);
  return info.size;
}

async function uploadToFal(filePath, falKey) {
  const bytes = await readFile(filePath);
  const fileName = path.basename(filePath);
  const contentType = fileName.endsWith('.webm') ? 'video/webm' : 'video/mp4';
  // fal storage: initiate → PUT → file_url
  const initiate = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate', {
    method: 'POST',
    headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_name: fileName, content_type: contentType }),
  });
  if (!initiate.ok) throw new Error(`fal storage initiate failed (${initiate.status}): ${await initiate.text()}`);
  const { upload_url: uploadUrl, file_url: fileUrl } = await initiate.json();
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: bytes });
  if (!put.ok) throw new Error(`fal storage upload failed (${put.status})`);
  return fileUrl;
}

async function runFalQueue(model, input, falKey, onStatus) {
  const submit = await fetch(`https://queue.fal.run/${model}`, {
    method: 'POST',
    headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!submit.ok) throw new Error(`fal submit failed (${submit.status}): ${await submit.text()}`);
  const { status_url: statusUrl, response_url: responseUrl } = await submit.json();
  for (let attempt = 0; attempt < 600; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const status = await fetch(`${statusUrl}?logs=0`, { headers: { Authorization: `Key ${falKey}` } });
    if (!status.ok) continue;
    const data = await status.json();
    onStatus?.(data.status, data.queue_position);
    if (data.status === 'COMPLETED') {
      const result = await fetch(responseUrl, { headers: { Authorization: `Key ${falKey}` } });
      if (!result.ok) throw new Error(`fal result fetch failed (${result.status})`);
      return await result.json();
    }
    if (data.status === 'FAILED') throw new Error('fal job failed');
  }
  throw new Error('fal job timed out');
}

function findVideoUrl(result) {
  const found = [];
  const walk = (value, keyPath) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach((v, i) => walk(v, `${keyPath}[${i}]`));
    if (typeof value.url === 'string') {
      const ct = String(value.content_type ?? '');
      if (ct.startsWith('video/') || /\.(mp4|webm|mov)(\?|$)/i.test(value.url)) found.push({ url: value.url, keyPath });
    }
    for (const [k, v] of Object.entries(value)) walk(v, `${keyPath}.${k}`);
  };
  walk(result, '$');
  found.sort((a, b) => score(b.keyPath) - score(a.keyPath));
  return found[0]?.url ?? null;
  function score(keyPath) {
    let s = 0;
    if (/depth_video|\.video$|\.output/.test(keyPath)) s += 10;
    if (/side_by_side|comparison|preview/.test(keyPath)) s -= 100;
    return s;
  }
}

function probeVideo(filePath) {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'json', filePath], { encoding: 'utf8' });
    const json = JSON.parse(out);
    const stream = json.streams?.[0] ?? {};
    const [num, den] = String(stream.r_frame_rate ?? '24/1').split('/').map(Number);
    return { width: stream.width, height: stream.height, fps: den ? num / den : 24, duration: Number(json.format?.duration ?? 0) };
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.video) fail('--video <path or https url> is required');
  const falKey = process.env.FAL_KEY;
  const outDir = path.resolve(args.out);
  await mkdir(outDir, { recursive: true });

  // 1. Source video → local rgb file + a URL fal can read.
  const rgbPath = path.join(outDir, 'rgb.mp4');
  let sourceUrl;
  if (/^https?:\/\//.test(args.video)) {
    sourceUrl = args.video;
    console.log('→ downloading source video');
    await downloadTo(sourceUrl, rgbPath);
  } else {
    await pipeline(Readable.from(await readFile(path.resolve(args.video))), createWriteStream(rgbPath));
    if (!args.depthUrl) {
      if (!falKey) fail('FAL_KEY is required to upload the clip and run depth estimation');
      console.log('→ uploading source video to fal storage');
      sourceUrl = await uploadToFal(rgbPath, falKey);
    }
  }

  // 2. Depth video.
  const depthPath = path.join(outDir, 'depth.mp4');
  let depthUrl = args.depthUrl;
  if (!depthUrl) {
    if (!falKey) fail('FAL_KEY is required to run depth estimation');
    const extra = process.env.MOTION_SPLAT_DEPTH_EXTRA_INPUT ? JSON.parse(process.env.MOTION_SPLAT_DEPTH_EXTRA_INPUT) : {};
    console.log(`→ running ${DEPTH_MODEL}`);
    const result = await runFalQueue(DEPTH_MODEL, { video_url: sourceUrl, ...extra }, falKey, (status, position) =>
      console.log(`   ${status}${typeof position === 'number' ? ` (queue ${position})` : ''}`),
    );
    depthUrl = findVideoUrl(result);
    if (!depthUrl) fail(`No depth video in the fal result: ${JSON.stringify(result).slice(0, 400)}`);
  }
  console.log('→ downloading depth video');
  await downloadTo(depthUrl, depthPath);

  // 3. Manifest.
  const probe = probeVideo(rgbPath);
  const [cols, rows] = String(args.grid).split('x').map(Number);
  const manifest = {
    version: 1,
    id: `intro-${Date.now().toString(36)}`,
    title: args.title,
    createdAt: new Date().toISOString(),
    provider: 'depth-anything-video',
    source: { videoUrl: 'rgb.mp4' },
    duration: Number(args.duration ?? probe?.duration ?? 6),
    fps: Number(args.fps ?? probe?.fps ?? 24),
    width: Number(args.width ?? probe?.width ?? 1280),
    height: Number(args.height ?? probe?.height ?? 720),
    camera: { fovDeg: Number(args.fov), near: Number(args.near), far: Number(args.far) },
    track: {
      kind: 'rgbd',
      depthVideoUrl: 'depth.mp4',
      depthEncoding: 'inverse-gray8',
      grid: { cols: cols || 320, rows: rows || 180 },
      keyframeCount: Number(args.keyframes),
      depthModel: DEPTH_MODEL,
    },
  };
  if (!probe) console.warn('   ffprobe not found — pass --width/--height/--duration/--fps to override the defaults');
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const rgbSize = (await stat(rgbPath)).size;
  const depthSize = (await stat(depthPath)).size;
  console.log(`\n✔ wrote ${path.relative(process.cwd(), outDir)}/{manifest.json, rgb.mp4 (${(rgbSize / 1e6).toFixed(1)} MB), depth.mp4 (${(depthSize / 1e6).toFixed(1)} MB)}`);
  console.log('  Keep the clip short (≤ 8 s, 720p) so the landing stays light; the intro is skipped automatically when the manifest is missing.');
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
