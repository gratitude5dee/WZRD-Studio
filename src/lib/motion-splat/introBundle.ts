// ---------------------------------------------------------------------------
// Package a motion splat as the wzrd.tech intro asset: a zip with
// manifest.json (relative media paths) plus the media files, ready to unzip
// into public/intro-splat/.
// ---------------------------------------------------------------------------

import type { MotionSplatManifest } from '@/types/motionSplat';

export const INTRO_BUNDLE_RGB_NAME = 'rgb.mp4';
export const INTRO_BUNDLE_DEPTH_NAME = 'depth.mp4';

function extensionOf(url: string, fallback: string): string {
  const match = url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i);
  return match ? match[1].toLowerCase() : fallback;
}

/** The manifest rewritten so every media URL is relative to the bundle root. */
export function relativizeManifestForBundle(manifest: MotionSplatManifest): { manifest: MotionSplatManifest; files: Array<{ name: string; url: string }> } {
  const files: Array<{ name: string; url: string }> = [];
  const rgbName = `rgb.${extensionOf(manifest.source.videoUrl, 'mp4')}`;
  files.push({ name: rgbName, url: manifest.source.videoUrl });
  const source = { ...manifest.source, videoUrl: rgbName };
  delete (source as { imageUrl?: string }).imageUrl;
  let track = manifest.track;
  if (track.kind === 'rgbd') {
    const depthName = `depth.${extensionOf(track.depthVideoUrl, 'mp4')}`;
    files.push({ name: depthName, url: track.depthVideoUrl });
    track = { ...track, depthVideoUrl: depthName };
  } else if (track.kind === 'splat-keyframes') {
    track = {
      ...track,
      keyframes: track.keyframes.map((keyframe, index) => {
        const name = `keyframe-${index}.${extensionOf(keyframe.url, keyframe.format)}`;
        files.push({ name, url: keyframe.url });
        const { sourceImageUrl: _omit, ...rest } = keyframe;
        return { ...rest, url: name };
      }),
    };
  } else {
    track = {
      ...track,
      frames: track.frames.map((frame, index) => {
        const name = `frame-${index}.${extensionOf(frame.url, frame.format)}`;
        files.push({ name, url: frame.url });
        return { ...frame, url: name };
      }),
    };
  }
  let posterUrl: string | undefined;
  if (manifest.posterUrl) {
    posterUrl = `poster.${extensionOf(manifest.posterUrl, 'jpg')}`;
    files.push({ name: posterUrl, url: manifest.posterUrl });
  }
  const bundled: MotionSplatManifest = { ...manifest, source, track, ...(posterUrl ? { posterUrl } : {}) };
  if (!posterUrl) delete (bundled as { posterUrl?: string }).posterUrl;
  return { manifest: bundled, files };
}

/** Assemble the archive (manifest + media) without serialising it. */
export async function buildIntroBundleArchive(manifest: MotionSplatManifest, fetchImpl: typeof fetch = fetch) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const { manifest: bundled, files } = relativizeManifestForBundle(manifest);
  zip.file('manifest.json', JSON.stringify(bundled, null, 2));
  for (const file of files) {
    const response = await fetchImpl(file.url);
    if (!response.ok) throw new Error(`Could not download ${file.name} (${response.status})`);
    zip.file(file.name, await response.arrayBuffer());
  }
  return zip;
}

/** Build the zip in the browser (jszip is already a dependency). */
export async function buildIntroBundle(manifest: MotionSplatManifest, fetchImpl: typeof fetch = fetch): Promise<Blob> {
  const zip = await buildIntroBundleArchive(manifest, fetchImpl);
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}
