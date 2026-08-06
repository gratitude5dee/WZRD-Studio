import type { DitherColor } from '@/components/dither-kit';
import type { PixelBloom } from '@/components/dither-kit/pixel';

/**
 * App brand tokens (src/index.css) mapped onto the dither-kit palette so every
 * dithered surface reads in the same orange/coral family as the rest of the UI.
 *
 *   --primary        25 95% 53%   brand orange   -> "orange"
 *   --accent-purple  14 100% 64%  coral accent   -> "red"
 *   --accent-blue    217 91% 60%  neutral blue   -> "blue"
 */
export const ditherColors = {
  primary: 'orange',
  accent: 'red',
  secondary: 'purple',
  info: 'blue',
  success: 'green',
  muted: 'grey',
} as const satisfies Record<string, DitherColor>;

export type DitherRole = keyof typeof ditherColors;

/**
 * Bloom defaults by surface class: marketing surfaces can afford the full glow,
 * dense dashboards take a restrained one, and perf-sensitive areas (canvas,
 * timeline) get none.
 */
export const ditherBloom = {
  marketing: 'aura',
  dashboard: 'low',
  perf: 'off',
} as const satisfies Record<string, PixelBloom>;

export type DitherSurface = keyof typeof ditherBloom;
