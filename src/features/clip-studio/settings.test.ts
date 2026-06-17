import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GMI_GEMINI_SETTINGS,
  loadClipStudioSettings,
  normalizeGmiGeminiSettings,
  redactGmiSettings,
  saveClipStudioSettings,
} from './settings';

class MemoryStorage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe('Clip Studio settings', () => {
  it('keeps required GMI defaults and clamps unsafe numeric inputs', () => {
    const settings = normalizeGmiGeminiSettings({
      baseUrl: ' ',
      model: ' ',
      maxTokens: 1,
      temperature: 9,
      timeoutMs: 1,
    });

    expect(settings).toMatchObject({
      baseUrl: 'https://api.gmi-serving.com/v1/chat/completions',
      model: 'google/gemini-3.5-flash',
      maxTokens: 256,
      temperature: 2,
      timeoutMs: 5000,
    });
  });

  it('keeps a default editable viral finder prompt and preserves custom prompt text', () => {
    expect(DEFAULT_GMI_GEMINI_SETTINGS.analysisPrompt).toMatch(/viral/i);
    expect(DEFAULT_GMI_GEMINI_SETTINGS.analysisPrompt).toMatch(/JSON/i);

    const customPrompt = 'Custom viral rules. Return JSON only.';
    expect(normalizeGmiGeminiSettings({ analysisPrompt: customPrompt } as never).analysisPrompt).toBe(customPrompt);
    expect(normalizeGmiGeminiSettings({ analysisPrompt: '   ' } as never).analysisPrompt).toBe(DEFAULT_GMI_GEMINI_SETTINGS.analysisPrompt);
  });

  it('persists local settings metadata without dropping Clipper defaults', () => {
    const storage = new MemoryStorage();
    const saved = saveClipStudioSettings(
      {
        ...DEFAULT_GMI_GEMINI_SETTINGS,
        apiKey: 'secret',
        exportFolder: '/tmp/clips',
        youtubeDownloaderPathOverride: '/opt/homebrew/bin/yt-dlp',
        brandLogoPath: '/tmp/logo.png',
        defaultMode: 'auto',
        defaultPlatformPreset: 'tiktok',
        captionsDefault: false,
      },
      storage,
    );

    expect(saved.defaultMode).toBe('auto');
    expect(loadClipStudioSettings(storage)).toMatchObject({
      apiKey: 'secret',
      exportFolder: '/tmp/clips',
      youtubeDownloaderPathOverride: '/opt/homebrew/bin/yt-dlp',
      brandLogoPath: '/tmp/logo.png',
      brandLogoOpacity: 0.5,
      brandLogoIntroSeconds: 3,
      defaultMode: 'auto',
      defaultPlatformPreset: 'tiktok',
      captionsDefault: false,
    });
  });

  it('redacts API keys for debug-safe settings output', () => {
    expect(redactGmiSettings({ ...DEFAULT_GMI_GEMINI_SETTINGS, apiKey: 'secret' }).apiKey).toBe('[redacted]');
  });
});
