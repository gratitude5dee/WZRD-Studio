// ---------------------------------------------------------------------------
// Shared gating for the motion-splat landing intro (Vite landing and Next
// landing). Pure helpers, safe to unit test; nothing here touches React.
// ---------------------------------------------------------------------------

import type { MotionSplatManifest } from '@/types/motionSplat';
import { DEFAULT_INTRO_MANIFEST_URL, SPLAT_INTRO_SEEN_KEY } from '@/lib/motion-splat/constants';
import { resolveManifestUrls, safeParseMotionSplatManifest } from '@/lib/motion-splat/manifest';
import { readPublicEnv } from '@/lib/env';

export { DEFAULT_INTRO_MANIFEST_URL, SPLAT_INTRO_SEEN_KEY };

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** The motion-splat shaders need WebGL2 (integer textures, instancing). */
export function isWebGL2Available(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Set for the session once a probe finds no intro asset, so later navigations
 * skip the gate entirely instead of shielding the page on every visit.
 */
export const SPLAT_INTRO_MISSING_KEY = 'wzrd-splat-intro-missing';

export function markSplatIntroMissing(): void {
  try {
    sessionStorage.setItem(SPLAT_INTRO_MISSING_KEY, 'true');
  } catch {
    /* storage unavailable */
  }
}

function introAssetKnownMissing(): boolean {
  try {
    return sessionStorage.getItem(SPLAT_INTRO_MISSING_KEY) === 'true';
  } catch {
    return false;
  }
}

function landingMotionDisabled(): boolean {
  try {
    return sessionStorage.getItem('wzrd:landing-motion') === 'off';
  } catch {
    return false;
  }
}

/**
 * Synchronous part of the decision. `?intro=1` forces a replay (QA),
 * `?intro=0` skips. Never call during SSR — only in effects or Vite state
 * initialisers.
 */
export function shouldShowSplatIntro(search?: string): boolean {
  if (typeof window === 'undefined') return false;
  // Reduced motion wins over everything, including the ?intro=1 QA override.
  if (prefersReducedMotion()) return false;
  const params = new URLSearchParams(search ?? window.location.search);
  const forced = params.get('intro');
  if (forced === '0') return false;
  if (forced === '1') return true;
  if (landingMotionDisabled() || introAssetKnownMissing()) return false;
  try {
    return sessionStorage.getItem(SPLAT_INTRO_SEEN_KEY) !== 'true';
  } catch {
    return false;
  }
}

export function markSplatIntroSeen(): void {
  try {
    sessionStorage.setItem(SPLAT_INTRO_SEEN_KEY, 'true');
  } catch {
    /* storage unavailable */
  }
}

/** Manifest URL from env (VITE_/NEXT_PUBLIC_ SPLAT_INTRO_MANIFEST_URL) or the default public asset. */
export function resolveIntroManifestUrl(explicit?: string): string {
  if (explicit) return explicit;
  const fromEnv = readPublicEnv('SPLAT_INTRO_MANIFEST_URL', ['VITE_SPLAT_INTRO_MANIFEST_URL']);
  return fromEnv && fromEnv.trim().length > 0 ? fromEnv.trim() : DEFAULT_INTRO_MANIFEST_URL;
}

/**
 * Availability probe: a small, uncached GET bounded by a timeout. Any
 * non-2xx, network or schema failure means "no intro" — the page must never
 * wait on this.
 */
export async function probeIntroManifest(url: string, timeoutMs = 1_500): Promise<MotionSplatManifest | null> {
  if (typeof fetch !== 'function') return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return null;
    const json: unknown = await response.json();
    const parsed = safeParseMotionSplatManifest(json);
    if (!parsed.success || !parsed.manifest) return null;
    const base = typeof window !== 'undefined' ? new URL(url, window.location.href).toString() : url;
    return resolveManifestUrls(parsed.manifest, base);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
