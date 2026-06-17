import type { GmiGeminiSettings } from './types';

export const CLIP_STUDIO_SETTINGS_STORAGE_KEY = 'wzrd.clipStudio.settings.v1';

export const DEFAULT_CLIPPER_ANALYSIS_PROMPT = [
  'You are a senior short-form video editor, retention analyst, and viral moment finder.',
  'Find the strongest 9:16-ready moments from the provided metadata, structured YouTube viewmap peaks, deterministic candidate seeds, transcript/captions, timestamp notes, heatmap screenshots, and representative frames.',
  'Use the candidate seeds as the primary search surface; refine weak boundaries, preserve evidence labels, and only invent a new range if the provided signals clearly support it.',
  'Favor clips with an immediate hook, visible payoff, crowd or creator reaction, transition, drop, conflict, reveal, quotable line, or loopable ending.',
  'Start each clip slightly before the moment so viewers understand context, then end immediately after the payoff.',
  'Do not return overlapping variants from the same moment; choose the strongest representative window for each unique viral beat.',
  'Title every candidate as a unique viral TikTok caption with readable casing, no filename extension, and 2 to 4 short ASCII hashtags so it can be copied directly as the post caption and exported MP4 filename.',
  'Avoid weak filler, long intros, dead air, repeated moments, and sections that need the full video to make sense.',
  'Return JSON only, with no markdown fences or commentary.',
  'Every clip candidate should be 15 to 60 seconds unless the context clearly supports a shorter warning.',
].join(' ');

export const DEFAULT_GMI_GEMINI_SETTINGS: GmiGeminiSettings = {
  apiKey: '',
  baseUrl: 'https://api.gmi-serving.com/v1/chat/completions',
  model: 'google/gemini-3.5-flash',
  maxTokens: 8192,
  temperature: 0,
  timeoutMs: 90000,
  analysisPrompt: DEFAULT_CLIPPER_ANALYSIS_PROMPT,
  redactedDebugLogging: false,
  exportFolder: '',
  defaultMode: 'viral',
  defaultPlatformPreset: 'shorts',
  captionsDefault: true,
  ffmpegPathOverride: '',
  youtubeDownloaderPathOverride: '',
  brandLogoPath: '',
  brandLogoOpacity: 0.5,
  brandLogoIntroSeconds: 3,
};

export const DEFAULT_AI_ANALYSIS_SETTINGS = DEFAULT_GMI_GEMINI_SETTINGS;

function isStorageAvailable(storage?: Storage): storage is Storage {
  return typeof storage !== 'undefined' && storage !== null;
}

export function redactGmiSettings(settings: GmiGeminiSettings): Omit<GmiGeminiSettings, 'apiKey'> & { apiKey: string } {
  return {
    ...settings,
    apiKey: settings.apiKey ? '[redacted]' : '',
  };
}

export function normalizeGmiGeminiSettings(partial: Partial<GmiGeminiSettings> = {}): GmiGeminiSettings {
  return {
    ...DEFAULT_GMI_GEMINI_SETTINGS,
    ...partial,
    baseUrl: partial.baseUrl?.trim() || DEFAULT_GMI_GEMINI_SETTINGS.baseUrl,
    model: partial.model?.trim() || DEFAULT_GMI_GEMINI_SETTINGS.model,
    maxTokens: Math.max(256, Math.min(32768, Number(partial.maxTokens) || DEFAULT_GMI_GEMINI_SETTINGS.maxTokens)),
    temperature: Math.max(0, Math.min(2, Number(partial.temperature) || 0)),
    timeoutMs: Math.max(5000, Math.min(300000, Number(partial.timeoutMs) || DEFAULT_GMI_GEMINI_SETTINGS.timeoutMs)),
    analysisPrompt: partial.analysisPrompt?.trim() || DEFAULT_GMI_GEMINI_SETTINGS.analysisPrompt,
    ffmpegPathOverride: partial.ffmpegPathOverride?.trim() || '',
    youtubeDownloaderPathOverride: partial.youtubeDownloaderPathOverride?.trim() || '',
    brandLogoPath: partial.brandLogoPath?.trim() || '',
    brandLogoOpacity: Math.max(0, Math.min(1, Number(partial.brandLogoOpacity) || DEFAULT_GMI_GEMINI_SETTINGS.brandLogoOpacity)),
    brandLogoIntroSeconds: Math.max(0.5, Math.min(10, Number(partial.brandLogoIntroSeconds) || DEFAULT_GMI_GEMINI_SETTINGS.brandLogoIntroSeconds)),
    exportFolder: partial.exportFolder?.trim() || '',
  };
}

export function loadClipStudioSettings(storage: Storage | undefined = globalThis.localStorage): GmiGeminiSettings {
  if (!isStorageAvailable(storage)) {
    return DEFAULT_GMI_GEMINI_SETTINGS;
  }

  try {
    const raw = storage.getItem(CLIP_STUDIO_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_GMI_GEMINI_SETTINGS;
    }
    return normalizeGmiGeminiSettings(JSON.parse(raw) as Partial<GmiGeminiSettings>);
  } catch {
    return DEFAULT_GMI_GEMINI_SETTINGS;
  }
}

export function saveClipStudioSettings(
  settings: GmiGeminiSettings,
  storage: Storage | undefined = globalThis.localStorage,
): GmiGeminiSettings {
  const normalized = normalizeGmiGeminiSettings(settings);
  if (!isStorageAvailable(storage)) {
    return normalized;
  }

  storage.setItem(CLIP_STUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}
