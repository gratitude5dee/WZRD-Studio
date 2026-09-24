// ---------------------------------------------------------------------------
// Time helpers shared by the viewer, the transport bar and the intro.
// ---------------------------------------------------------------------------

import { KEYFRAME_END_MARGIN_SECONDS, MAX_KEYFRAME_COUNT, MIN_KEYFRAME_COUNT } from './constants';

/** Evenly spaced sample times in [0, duration - margin]. */
export function keyframeTimes(
  duration: number,
  count: number,
  endMargin: number = KEYFRAME_END_MARGIN_SECONDS,
): Float32Array {
  const n = Math.max(MIN_KEYFRAME_COUNT, Math.min(MAX_KEYFRAME_COUNT, Math.round(count)));
  const safeDuration = Math.max(0, duration);
  const last = Math.max(0, safeDuration - endMargin);
  const times = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    times[i] = (i / (n - 1)) * last;
  }
  return times;
}

export interface KeyframeBlend {
  /** Index of the keyframe at or before `t`. */
  index: number;
  /** Index of the next keyframe (equals `index` at the ends). */
  next: number;
  /** 0..1 weight of `next`. */
  mix: number;
}

/** Locate `t` between two keyframe times (sorted ascending). Clamps outside the range. */
export function resolveBlend(t: number, times: ArrayLike<number>): KeyframeBlend {
  const n = times.length;
  if (n === 0) return { index: 0, next: 0, mix: 0 };
  if (n === 1 || !(t > times[0])) return { index: 0, next: 0, mix: 0 };
  if (t >= times[n - 1]) return { index: n - 1, next: n - 1, mix: 0 };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  const span = times[hi] - times[lo];
  const mix = span > 0 ? (t - times[lo]) / span : 0;
  return { index: lo, next: hi, mix: Math.min(1, Math.max(0, mix)) };
}

/** Advance playback time; wraps when looping, clamps otherwise. */
export function wrapTime(t: number, duration: number, loop: boolean): number {
  if (!(duration > 0)) return 0;
  if (loop) {
    const wrapped = t % duration;
    return wrapped < 0 ? wrapped + duration : wrapped;
  }
  return Math.min(duration, Math.max(0, t));
}

export function clampTime(t: number, duration: number): number {
  if (!Number.isFinite(t)) return 0;
  return Math.min(Math.max(0, duration), Math.max(0, t));
}

/** `MM:SS:FF` timecode. */
export function formatTimecode(seconds: number, fps: number): string {
  const safeFps = fps > 0 ? fps : 30;
  const total = Math.max(0, seconds);
  const whole = Math.floor(total);
  const frames = Math.min(Math.round(safeFps) - 1, Math.floor((total - whole) * safeFps));
  const mm = Math.floor(whole / 60);
  const ss = whole % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

export function easeInOutCubic(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutQuint(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return 1 - Math.pow(1 - t, 5);
}

/** Step to the neighbouring keyframe time (used by ←/→). */
export function stepKeyframe(t: number, times: ArrayLike<number>, direction: 1 | -1): number {
  const n = times.length;
  if (n === 0) return t;
  const eps = 1e-4;
  if (direction > 0) {
    for (let i = 0; i < n; i++) if (times[i] > t + eps) return times[i];
    return times[n - 1];
  }
  for (let i = n - 1; i >= 0; i--) if (times[i] < t - eps) return times[i];
  return times[0];
}
