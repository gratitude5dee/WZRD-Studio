import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ChevronsLeft, ChevronsRight, Pause, Play, Repeat, RotateCcw } from 'lucide-react';

import { KanvasIconButton } from '@/components/kanvas/primitives';
import { formatTimecode } from '@/lib/motion-splat/timeline';
import { cn } from '@/lib/utils';

const SPEED_STEPS = [0.25, 0.5, 1, 2] as const;

export interface TransportBarProps {
  time: number;
  duration: number;
  fps: number;
  playing: boolean;
  loop: boolean;
  speed: number;
  keyframeTimes: ArrayLike<number>;
  disabled?: boolean;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  onToggleLoop: () => void;
  onSpeedChange: (speed: number) => void;
  onStepKeyframe: (direction: 1 | -1) => void;
  onStepFrame: (direction: 1 | -1) => void;
  onResetCamera?: () => void;
  className?: string;
}

/**
 * The scrub bar from the reference viewer: a hairline track with keyframe
 * ticks, a draggable playhead, hover timecode, transport buttons and a
 * monospace timecode readout. The track is a keyboard slider.
 */
export function TransportBar({
  time,
  duration,
  fps,
  playing,
  loop,
  speed,
  keyframeTimes,
  disabled = false,
  onSeek,
  onTogglePlay,
  onToggleLoop,
  onSpeedChange,
  onStepKeyframe,
  onStepFrame,
  onResetCamera,
  className,
}: TransportBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const pendingSeek = useRef<number | null>(null);
  const frameRef = useRef(0);

  const safeDuration = duration > 0 ? duration : 1;
  const ratio = Math.min(1, Math.max(0, time / safeDuration));

  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < keyframeTimes.length; i++) out.push(Math.min(1, Math.max(0, keyframeTimes[i] / safeDuration)));
    return out;
  }, [keyframeTimes, safeDuration]);

  const ratioFromEvent = useCallback((event: { clientX: number }): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  }, []);

  const flushSeek = useCallback(() => {
    frameRef.current = 0;
    if (pendingSeek.current !== null) {
      onSeek(pendingSeek.current);
      pendingSeek.current = null;
    }
  }, [onSeek]);

  const queueSeek = useCallback(
    (nextRatio: number) => {
      pendingSeek.current = nextRatio * safeDuration;
      if (!frameRef.current) frameRef.current = requestAnimationFrame(flushSeek);
    },
    [flushSeek, safeDuration],
  );

  useEffect(() => () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    // preventDefault suppresses the implicit focus, so the slider's arrow keys
    // would only work after tabbing to it.
    event.currentTarget.focus?.();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setScrubbing(true);
    queueSeek(ratioFromEvent(event));
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const next = ratioFromEvent(event);
    setHoverRatio(next);
    if (scrubbing) queueSeek(next);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!scrubbing) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setScrubbing(false);
    queueSeek(ratioFromEvent(event));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        if (event.shiftKey) onStepKeyframe(-1);
        else onStepFrame(-1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (event.shiftKey) onStepKeyframe(1);
        else onStepFrame(1);
        break;
      case 'Home':
        event.preventDefault();
        onSeek(0);
        break;
      case 'End':
        event.preventDefault();
        onSeek(duration);
        break;
      case ' ':
      case 'Enter':
        event.preventDefault();
        onTogglePlay();
        break;
      default:
        break;
    }
  };

  const cycleSpeed = () => {
    const index = SPEED_STEPS.findIndex((s) => Math.abs(s - speed) < 1e-6);
    const next = SPEED_STEPS[(index + 1 + SPEED_STEPS.length) % SPEED_STEPS.length] ?? 1;
    onSpeedChange(next);
  };

  const timecode = formatTimecode(time, fps);
  const total = formatTimecode(duration, fps);
  const hoverTime = hoverRatio !== null ? hoverRatio * safeDuration : null;

  return (
    <div
      className={cn(
        'flex w-full items-center gap-2 border-t border-kanvas-border-subtle bg-kanvas-bg/90 px-3 py-2 backdrop-blur-sm',
        className,
      )}
      role="group"
      aria-label="Motion splat playback"
      data-testid="motion-splat-transport"
    >
      <KanvasIconButton
        tone="ghost"
        size="sm"
        label="Previous keyframe (J)"
        icon={<ChevronsLeft className="h-4 w-4" />}
        onClick={() => onStepKeyframe(-1)}
        disabled={disabled}
      />
      <KanvasIconButton
        tone={playing ? 'accent' : 'subtle'}
        size="sm"
        label={playing ? 'Pause (Space)' : 'Play (Space)'}
        icon={playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        onClick={onTogglePlay}
        disabled={disabled}
        data-testid="motion-splat-play"
      />
      <KanvasIconButton
        tone="ghost"
        size="sm"
        label="Next keyframe (K)"
        icon={<ChevronsRight className="h-4 w-4" />}
        onClick={() => onStepKeyframe(1)}
        disabled={disabled}
      />

      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Timeline"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration * 1000) / 1000}
        aria-valuenow={Math.round(time * 1000) / 1000}
        aria-valuetext={timecode}
        aria-disabled={disabled}
        className={cn(
          'group relative mx-2 h-11 min-w-0 flex-1 cursor-pointer touch-none select-none outline-none',
          'focus-visible:ring-2 focus-visible:ring-kanvas-accent focus-visible:ring-offset-2 focus-visible:ring-offset-kanvas-bg rounded-md',
          disabled && 'cursor-default opacity-50',
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => {
          setHoverRatio(null);
        }}
        onKeyDown={handleKeyDown}
        data-testid="motion-splat-timeline"
      >
        {/* Track */}
        <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-white/15" />
        {/* Played range */}
        <div
          className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-kanvas-accent"
          style={{ width: `${ratio * 100}%` }}
        />
        {/* Keyframe ticks */}
        {ticks.map((tick, index) => (
          <span
            key={index}
            aria-hidden="true"
            className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-white/25"
            style={{ left: `${tick * 100}%` }}
          />
        ))}
        {/* Hover preview */}
        {hoverTime !== null && !disabled && (
          <>
            <span
              aria-hidden="true"
              className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-white/50"
              style={{ left: `${(hoverRatio ?? 0) * 100}%` }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-1 -translate-x-1/2 -translate-y-full rounded-md border border-kanvas-border-default bg-kanvas-surface-2 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-kanvas-text-secondary"
              style={{ left: `${(hoverRatio ?? 0) * 100}%` }}
            >
              {formatTimecode(hoverTime, fps)}
            </span>
          </>
        )}
        {/* Playhead */}
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-kanvas-accent bg-kanvas-bg',
            'transition-transform duration-wzrd-control group-hover:scale-110',
            scrubbing && 'scale-125',
          )}
          style={{ left: `${ratio * 100}%` }}
        />
      </div>

      <span
        className="hidden min-w-[9.5rem] text-right font-mono text-xs tabular-nums text-kanvas-text-secondary sm:block"
        data-testid="motion-splat-timecode"
      >
        {timecode} <span className="text-kanvas-text-faint">/ {total}</span>
      </span>

      <button
        type="button"
        onClick={cycleSpeed}
        disabled={disabled}
        className="h-9 min-w-[3rem] rounded-md border border-kanvas-border-default px-2 font-mono text-xs text-kanvas-text-secondary transition-colors hover:bg-white/10 disabled:opacity-30 [@media(pointer:coarse)]:h-11"
        aria-label={`Playback speed ${speed}x`}
      >
        {speed}x
      </button>
      <KanvasIconButton
        tone={loop ? 'accent' : 'ghost'}
        size="sm"
        label={loop ? 'Loop on (L)' : 'Loop off (L)'}
        icon={<Repeat className="h-4 w-4" />}
        onClick={onToggleLoop}
        disabled={disabled}
        aria-pressed={loop}
      />
      {onResetCamera && (
        <KanvasIconButton
          tone="ghost"
          size="sm"
          label="Reset camera (R)"
          icon={<RotateCcw className="h-4 w-4" />}
          onClick={onResetCamera}
          disabled={disabled}
        />
      )}
    </div>
  );
}

export default TransportBar;
