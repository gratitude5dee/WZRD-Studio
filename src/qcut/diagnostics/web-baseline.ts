/**
 * Editor web-runtime baseline diagnostics.
 *
 * Runs once per editor mount and records the facts a browser-export bug report
 * always needs: cross-origin isolation posture, the resolved platform adapter,
 * every platform capability flag, the export factory's browser-capability
 * detection, and whether a WebCodecs H.264 encoder actually drains frames.
 *
 * The snapshot is logged once and parked on `window.__wzrdQcutWebBaseline` so
 * e2e/diagnostic harnesses and support can read it without re-deriving it.
 */

import { platform, PlatformCapability } from "@qcut/platform-core";
import {
  ExportEngineFactory,
  type BrowserCapabilities,
} from "@qcut-app/lib/export/export-engine-factory";
import { getFfmpegWasmFallbackState } from "@/lib/ffmpeg-web";

export interface WebBaselineSnapshot {
  collectedAt: string;
  userAgent: string;
  crossOriginIsolated: boolean;
  sharedArrayBuffer: string;
  platform: string;
  isElectron: boolean;
  capabilities: Record<string, boolean>;
  browserCapabilities: BrowserCapabilities | { error: string };
  webCodecsProbe: boolean;
  ffmpegWasmFallback: Awaited<ReturnType<typeof getFfmpegWasmFallbackState>>;
  gracefulStubCalls: string[];
}

export const WEB_BASELINE_GLOBAL = "__wzrdQcutWebBaseline";

function readCapabilities(): Record<string, boolean> {
  const api = platform();
  const result: Record<string, boolean> = {};
  for (const capability of Object.values(PlatformCapability)) {
    try {
      result[capability] = api.hasCapability(capability);
    } catch {
      result[capability] = false;
    }
  }
  return result;
}

function readGracefulStubCalls(): string[] {
  const calls = (globalThis as Record<string, unknown>)
    .__wzrdQcutGracefulStubCalls;
  return Array.isArray(calls) ? [...(calls as string[])] : [];
}

let collected: Promise<WebBaselineSnapshot> | null = null;

/**
 * The baseline runs a real encode probe, so it is opt-in outside development:
 * append `?wzrdBaseline=1` to the editor URL to collect it on a deployment.
 */
export function isWebBaselineEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof location === "undefined") return false;
  return new URLSearchParams(location.search).get("wzrdBaseline") === "1";
}

/**
 * Collect the baseline once per page. Repeat calls return the same snapshot.
 */
export function collectWebBaseline(): Promise<WebBaselineSnapshot> {
  if (collected) return collected;

  collected = (async (): Promise<WebBaselineSnapshot> => {
    const factory = ExportEngineFactory.getInstance();

    let browserCapabilities: BrowserCapabilities | { error: string };
    try {
      browserCapabilities = await factory.detectCapabilities();
    } catch (error) {
      browserCapabilities = {
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const api = platform();
    const snapshot: WebBaselineSnapshot = {
      collectedAt: new Date().toISOString(),
      userAgent:
        typeof navigator === "undefined" ? "unknown" : navigator.userAgent,
      crossOriginIsolated: globalThis.crossOriginIsolated === true,
      sharedArrayBuffer: typeof SharedArrayBuffer,
      platform: api.platform,
      isElectron: api.isElectron,
      capabilities: readCapabilities(),
      browserCapabilities,
      webCodecsProbe: await factory.probeWebCodecsEncoderForDiagnostics(),
      ffmpegWasmFallback: await getFfmpegWasmFallbackState(),
      gracefulStubCalls: readGracefulStubCalls(),
    };

    (globalThis as Record<string, unknown>)[WEB_BASELINE_GLOBAL] = snapshot;
    console.info("[WZRD/QCut] web runtime baseline", snapshot);
    return snapshot;
  })();

  return collected;
}
