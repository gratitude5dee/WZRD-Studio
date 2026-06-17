import type { DesktopYoutubeDownloadResult, Transcript, VideoSource } from './types';
import { createClipStudioId } from './segmentation';

export interface YoutubeImportResult {
  source: VideoSource;
  canAnalyzeMetadataOnly: boolean;
  message: string;
}

export function isLikelyYoutubeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /(^|\.)youtube\.com$/i.test(url.hostname) || /(^|\.)youtu\.be$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export function createUnsupportedYoutubeSource(url: string): YoutubeImportResult {
  return {
    source: {
      id: createClipStudioId('youtube'),
      type: 'youtube',
      name: 'YouTube source',
      url,
      importedAt: new Date().toISOString(),
      status: 'unsupported',
      warning:
        'YouTube download is not configured in this desktop build. Add yt-dlp or a signed downloader bridge to import the file locally; metadata-only GMI analysis can still use notes, heatmaps, transcript, and timestamps.',
    },
    canAnalyzeMetadataOnly: true,
    message:
      'Downloader abstraction created: this build accepts YouTube URLs but does not download them until a local downloader such as yt-dlp is configured.',
  };
}

export function createDownloadedYoutubeSource(download: DesktopYoutubeDownloadResult): VideoSource {
  return {
    id: download.id || createClipStudioId('youtube'),
    type: 'youtube',
    name: download.title || 'YouTube video',
    url: download.url,
    localPath: download.localPath,
    creator: download.uploader,
    importedAt: new Date().toISOString(),
    durationSeconds: download.durationSeconds,
    width: download.width,
    height: download.height,
    fps: download.fps,
    subtitlePath: download.subtitlePath,
    viewmap: download.viewmap,
    viewmapStatus: download.viewmapStatus,
    viewmapWarning: download.viewmapWarning,
    status: 'ready',
    warning: download.subtitlePath
      ? undefined
      : 'Downloaded locally. YouTube captions were unavailable, so GMI will rely on metadata, frames, heatmaps, timestamps, and notes.',
  };
}

function parseVttTime(value: string): number {
  const normalized = value.trim().replace(',', '.');
  const parts = normalized.split(':');
  const seconds = Number(parts.pop());
  const minutes = Number(parts.pop() ?? 0);
  const hours = Number(parts.pop() ?? 0);
  if (![hours, minutes, seconds].every(Number.isFinite)) {
    return Number.NaN;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function stripCueText(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseVttTranscript(vtt: string): Transcript {
  const blocks = vtt
    .replace(/^\uFEFF/, '')
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const segments: Transcript['segments'] = [];

  for (const block of blocks) {
    if (/^(WEBVTT|NOTE|STYLE|REGION)(\s|$)/i.test(block)) {
      continue;
    }
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex < 0) continue;

    const [startRaw, endWithSettings] = lines[timingIndex].split('-->');
    const endRaw = endWithSettings?.trim().split(/\s+/)[0];
    const startSeconds = parseVttTime(startRaw);
    const endSeconds = parseVttTime(endRaw ?? '');
    const text = stripCueText(lines.slice(timingIndex + 1).join(' '));
    if (!text || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) {
      continue;
    }
    segments.push({
      id: `vtt-${segments.length}`,
      startSeconds,
      endSeconds,
      text,
    });
  }

  return { segments };
}

function secondsToClock(seconds: number): string {
  const safe = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.round((safe % 1) * 10);
  const base = hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
  return tenths > 0 ? `${base}.${tenths}` : base;
}

export function formatTranscriptForEditor(transcript: Transcript): string {
  return transcript.segments
    .map((segment) => `[${secondsToClock(segment.startSeconds)}-${secondsToClock(segment.endSeconds)}] ${segment.text}`)
    .join('\n');
}
