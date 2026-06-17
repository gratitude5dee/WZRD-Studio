export type TimecodeMode = 'clock' | 'frames';

const safeFps = (fps?: number) => (typeof fps === 'number' && Number.isFinite(fps) && fps > 0 ? fps : 30);

export function msToSeconds(ms: number): number {
  return Math.max(0, ms) / 1000;
}

export function secondsToMs(seconds: number): number {
  return Math.max(0, Math.round(seconds * 1000));
}

export function msToFrame(ms: number, fps = 30): number {
  return Math.round(msToSeconds(ms) * safeFps(fps));
}

export function frameToMs(frame: number, fps = 30): number {
  return Math.round((Math.max(0, frame) / safeFps(fps)) * 1000);
}

export function snapMsToFrame(ms: number, fps = 30): number {
  return frameToMs(msToFrame(ms, fps), fps);
}

export function formatTimecode(ms: number, fps = 30, mode: TimecodeMode = 'clock'): string {
  const safeMs = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (mode === 'frames') {
    const frame = msToFrame(safeMs % 1000, fps);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frame
      .toString()
      .padStart(2, '0')}`;
  }

  const centiseconds = Math.floor((safeMs % 1000) / 10);
  const base = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds
    .toString()
    .padStart(2, '0')}`;
  if (hours <= 0) return base;
  return `${hours.toString().padStart(2, '0')}:${base}`;
}
