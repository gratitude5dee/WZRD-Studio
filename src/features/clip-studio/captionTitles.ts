import type { ClipCandidate, ExportedClip, VideoSource } from './types';

const MAX_CAPTION_TITLE_LENGTH = 140;
const FORBIDDEN_FILENAME_CHARS = /[<>:"/\\|?*]+/g;
const TRAILING_MEDIA_EXTENSION = /\.(mp4|mov|m4v|webm|jpg|jpeg|png)$/i;
const HASHTAG_PATTERN = /(^|\s)#[A-Za-z][A-Za-z0-9_]{1,29}\b/g;

export interface CaptionTitleSource {
  name?: string;
  creator?: string;
}

export interface CaptionTitleTarget {
  id: string;
  title: string;
}

export interface BuildUniqueClipCaptionTitlesInput {
  clips: CaptionTitleTarget[];
  source?: CaptionTitleSource;
  existingTitles?: string[];
  existingFilenames?: string[];
}

export interface UniqueClipCaptionTitle {
  id: string;
  title: string;
  filenameBase: string;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripMediaExtension(value: string): string {
  return value.replace(TRAILING_MEDIA_EXTENSION, '').trim();
}

function replaceUnsafeFilenameCharacters(value: string): string {
  return Array.from(value)
    .map((character) => (character.charCodeAt(0) < 32 ? ' ' : character))
    .join('')
    .replace(FORBIDDEN_FILENAME_CHARS, ' ');
}

function titleKey(value: string): string {
  return collapseWhitespace(replaceUnsafeFilenameCharacters(stripMediaExtension(value)))
    .toLocaleLowerCase();
}

function basenameFromPath(value: string): string {
  return value.split(/[\\/]/).filter(Boolean).at(-1) ?? value;
}

function toHashtag(value?: string): string | undefined {
  const normalized = (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(TRAILING_MEDIA_EXTENSION, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim();
  if (!normalized) return undefined;

  const words = normalized
    .split(/\s+/)
    .filter((word) => word.length > 1)
    .slice(0, 3);
  if (words.length === 0) return undefined;

  const tag = words
    .map((word) => {
      if (/^[A-Z0-9]+$/.test(word)) return word;
      return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join('')
    .slice(0, 28);

  return tag ? `#${tag}` : undefined;
}

function defaultHashtags(source?: CaptionTitleSource): string[] {
  const tags = [
    toHashtag(source?.creator),
    toHashtag(source?.name),
    '#ForYou',
  ].filter((tag): tag is string => Boolean(tag));
  return [...new Set(tags)].slice(0, 4);
}

function hasHashtag(value: string): boolean {
  return Boolean(value.match(HASHTAG_PATTERN));
}

function trimCaptionTitle(value: string, suffix = ''): string {
  const maxBaseLength = Math.max(12, MAX_CAPTION_TITLE_LENGTH - suffix.length);
  const trimmed = value.length > maxBaseLength ? value.slice(0, maxBaseLength).trimEnd() : value;
  return `${trimmed}${suffix}`.trim();
}

function appendPartSuffix(value: string, partNumber: number): string {
  return trimCaptionTitle(value, ` #Part${partNumber}`);
}

export function captionTitleToSafeFilename(value: string): string {
  const cleaned = collapseWhitespace(
    replaceUnsafeFilenameCharacters(stripMediaExtension(value)).replace(/\.+$/g, ''),
  );
  return trimCaptionTitle(cleaned || 'Viral clip');
}

export function ensureTikTokCaptionTitle(value: string, source?: CaptionTitleSource): string {
  const safeTitle = captionTitleToSafeFilename(value);
  if (hasHashtag(safeTitle)) return safeTitle;

  const hashtags = defaultHashtags(source);
  if (hashtags.length === 0) return safeTitle;
  return trimCaptionTitle(`${safeTitle} ${hashtags.join(' ')}`);
}

export function buildUniqueClipCaptionTitles(input: BuildUniqueClipCaptionTitlesInput): UniqueClipCaptionTitle[] {
  const used = new Set<string>();
  [...(input.existingTitles ?? []), ...(input.existingFilenames ?? [])].forEach((value) => {
    const key = titleKey(value);
    if (key) used.add(key);
  });

  return input.clips.map((clip) => {
    const baseTitle = ensureTikTokCaptionTitle(clip.title, input.source);
    let title = baseTitle;
    let partNumber = 2;
    while (used.has(titleKey(title))) {
      title = appendPartSuffix(baseTitle, partNumber);
      partNumber += 1;
    }
    used.add(titleKey(title));
    return {
      id: clip.id,
      title,
      filenameBase: captionTitleToSafeFilename(title),
    };
  });
}

export function buildExistingCaptionCollisionInputs(library: ExportedClip[]): {
  existingTitles: string[];
  existingFilenames: string[];
} {
  return {
    existingTitles: library.map((clip) => clip.title),
    existingFilenames: library.flatMap((clip) =>
      ([clip.exportPath, clip.thumbnailPath].filter(Boolean) as string[]).map(basenameFromPath),
    ),
  };
}

export function buildCaptionTitleTargets(candidates: ClipCandidate[]): CaptionTitleTarget[] {
  return candidates.map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
  }));
}

export function captionTitleSourceFromVideo(source: VideoSource | null | undefined): CaptionTitleSource | undefined {
  if (!source) return undefined;
  return {
    name: source.name,
    creator: source.creator,
  };
}
