/**
 * Canonical catalogue of project-setup selectable video styles and aspect ratios.
 *
 * Both the wizard UI and the asset-existence check (scripts/check-style-thumbnails.mjs)
 * read this list, so a style can never ship without a thumbnail.
 */

export type VideoStyleOption =
  | 'none'
  | 'cinematic'
  | 'scribble'
  | 'film-noir'
  | 'anime'
  | 'watercolor'
  | 'pixel-art'
  | 'cyberpunk'
  | 'fantasy'
  | 'documentary'
  | 'horror'
  | 'vintage';

export type AspectRatioOption = '16:9' | '1:1' | '9:16';

export interface VideoStyleDefinition {
  value: VideoStyleOption;
  label: string;
  description: string;
  /** Public path of the style thumbnail; verified at build time. */
  thumbnail: string;
}

export const STYLE_THUMBNAIL_DIR = '/style-thumbnails';

export const VIDEO_STYLES: readonly VideoStyleDefinition[] = [
  {
    value: 'none',
    label: 'None',
    description: 'No style applied — raw model output',
    thumbnail: `${STYLE_THUMBNAIL_DIR}/none.svg`,
  },
  {
    value: 'cinematic',
    label: 'Cinematic',
    description: 'Film-like color grading, lens flares, shallow depth of field',
    thumbnail: `${STYLE_THUMBNAIL_DIR}/cinematic.svg`,
  },
  {
    value: 'scribble',
    label: 'Scribble',
    description: 'Hand-drawn / sketch aesthetic',
    thumbnail: `${STYLE_THUMBNAIL_DIR}/scribble.svg`,
  },
  {
    value: 'film-noir',
    label: 'Film Noir',
    description: 'High contrast black & white with dramatic lighting',
    thumbnail: `${STYLE_THUMBNAIL_DIR}/film-noir.svg`,
  },
  {
    value: 'anime',
    label: 'Anime',
    description: 'Japanese animation style',
    thumbnail: `${STYLE_THUMBNAIL_DIR}/anime.svg`,
  },
  {
    value: 'watercolor',
    label: 'Watercolor',
    description: 'Soft, painterly watercolor look',
    thumbnail: `${STYLE_THUMBNAIL_DIR}/watercolor.svg`,
  },
  {
    value: 'pixel-art',
    label: 'Pixel Art',
    description: 'Retro pixel-style rendering',
    thumbnail: `${STYLE_THUMBNAIL_DIR}/pixel-art.svg`,
  },
  {
    value: 'cyberpunk',
    label: 'Cyberpunk',
    description: 'Neon-lit, futuristic dystopia',
    thumbnail: `${STYLE_THUMBNAIL_DIR}/cyberpunk.svg`,
  },
  {
    value: 'fantasy',
    label: 'Fantasy',
    description: 'Ethereal, magical atmosphere',
    thumbnail: `${STYLE_THUMBNAIL_DIR}/fantasy.svg`,
  },
  {
    value: 'documentary',
    label: 'Documentary',
    description: 'Realistic, natural lighting',
    thumbnail: `${STYLE_THUMBNAIL_DIR}/documentary.svg`,
  },
  {
    value: 'horror',
    label: 'Horror',
    description: 'Dark, desaturated, unsettling mood',
    thumbnail: `${STYLE_THUMBNAIL_DIR}/horror.svg`,
  },
  {
    value: 'vintage',
    label: 'Vintage',
    description: 'Aged film grain, warm tones, vignette',
    thumbnail: `${STYLE_THUMBNAIL_DIR}/vintage.svg`,
  },
];

/** Styles surfaced directly in the brief; the rest live behind "View all". */
export const FEATURED_VIDEO_STYLES: readonly VideoStyleOption[] = [
  'none',
  'cinematic',
  'scribble',
  'film-noir',
];

export const DEFAULT_VIDEO_STYLE: VideoStyleOption = 'cinematic';

export const ASPECT_RATIOS: readonly { value: AspectRatioOption; label: string }[] = [
  { value: '16:9', label: 'Landscape' },
  { value: '1:1', label: 'Square' },
  { value: '9:16', label: 'Vertical' },
];

export const DEFAULT_ASPECT_RATIO: AspectRatioOption = '16:9';

const styleByValue = new Map(VIDEO_STYLES.map((style) => [style.value, style]));

export function isVideoStyle(value: unknown): value is VideoStyleOption {
  return typeof value === 'string' && styleByValue.has(value as VideoStyleOption);
}

export function isAspectRatio(value: unknown): value is AspectRatioOption {
  return value === '16:9' || value === '1:1' || value === '9:16';
}

export function getVideoStyle(value: string | undefined): VideoStyleDefinition {
  return styleByValue.get(value as VideoStyleOption) ?? styleByValue.get(DEFAULT_VIDEO_STYLE)!;
}

export function getFeaturedVideoStyles(): VideoStyleDefinition[] {
  return FEATURED_VIDEO_STYLES.map((value) => styleByValue.get(value)!);
}
