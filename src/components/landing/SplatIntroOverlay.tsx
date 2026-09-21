import { useCallback, useEffect, useRef, useState } from 'react';
import { SkipForward } from 'lucide-react';

import type { MotionSplatManifest } from '@/types/motionSplat';
import { MotionSplatViewer, type MotionSplatViewerHandle } from '@/components/motion-splat/MotionSplatViewer';
import type { MotionSplatEngineState } from '@/components/motion-splat/engine/types';
import { cn } from '@/lib/utils';

export interface SplatIntroOverlayProps {
  manifest: MotionSplatManifest;
  /** Fired after the fade-out completes (or immediately on failure). */
  onComplete: () => void;
  /** Fired when the intro could not run; the caller may fall back to a video intro. */
  onError?: (message: string) => void;
  wordmarkSrc?: string;
  /** Max time the overlay may hold the page, in ms. */
  safetyTimeoutMs?: number;
}

const FADE_OUT_MS = 900;
const WORDMARK_DELAY_MS = 900;
const DEFAULT_WORDMARK = '/creator-os/wzrd-wordmark-1600.png';

/**
 * Full-screen intro that plays the motion splat once in cinematic mode:
 * black stage, slow dolly-orbit, wordmark fade-in, then a fade to the page.
 * Runs on the dependency-free GPU backend so it ships without three/Spark.
 */
export default function SplatIntroOverlay({
  manifest,
  onComplete,
  onError,
  wordmarkSrc = DEFAULT_WORDMARK,
  safetyTimeoutMs,
}: SplatIntroOverlayProps) {
  const viewerRef = useRef<MotionSplatViewerHandle>(null);
  const [phase, setPhase] = useState<'loading' | 'playing' | 'ending' | 'done'>('loading');
  const [wordmarkVisible, setWordmarkVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    setPhase('done');
    onComplete();
  }, [onComplete]);

  const beginEnding = useCallback(() => {
    setPhase((current) => (current === 'ending' || current === 'done' ? current : 'ending'));
  }, []);

  // Fade out → complete.
  useEffect(() => {
    if (phase !== 'ending') return;
    const timer = setTimeout(finish, FADE_OUT_MS);
    return () => clearTimeout(timer);
  }, [phase, finish]);

  // Wordmark reveal shortly after playback starts.
  useEffect(() => {
    if (phase !== 'playing') return;
    const timer = setTimeout(() => setWordmarkVisible(true), WORDMARK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // Safety net: never hold the page hostage.
  useEffect(() => {
    const limit = safetyTimeoutMs ?? Math.min(20_000, manifest.duration * 1000 + 6_000);
    const timer = setTimeout(beginEnding, limit);
    return () => clearTimeout(timer);
  }, [beginEnding, manifest.duration, safetyTimeoutMs]);

  // Keyboard skip.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        beginEnding();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [beginEnding]);

  const handleState = useCallback((state: MotionSplatEngineState) => {
    if (state.status === 'ready') setPhase((current) => (current === 'loading' ? 'playing' : current));
    if (state.duration > 0) setProgress(Math.min(1, state.time / state.duration));
  }, []);

  const handleError = useCallback(
    (message: string) => {
      onError?.(message);
      finish();
    },
    [finish, onError],
  );

  return (
    <div
      className={cn(
        'fixed inset-0 z-[99999] bg-black transition-opacity duration-[900ms] ease-in-out motion-reduce:transition-none',
        phase === 'ending' || phase === 'done' ? 'opacity-0' : 'opacity-100',
      )}
      data-testid="splat-intro-overlay"
      data-phase={phase}
      aria-label="WZRD intro"
      role="dialog"
      aria-modal="true"
    >
      <MotionSplatViewer
        ref={viewerRef}
        manifest={manifest}
        mode="cinematic"
        backend="gpu"
        quality="auto"
        autoPlay
        loop={false}
        showTransport={false}
        className="absolute inset-0"
        onStateChange={handleState}
        onError={handleError}
        onComplete={beginEnding}
        fallback={<div className="absolute inset-0 bg-black" />}
      />

      {/* Vignette + grain-free edge darkening so the box floats in the void. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ boxShadow: 'inset 0 0 180px rgba(0,0,0,0.75)' }}
      />

      {/* Wordmark */}
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-[14vh] flex flex-col items-center gap-4 transition-opacity duration-[1200ms] ease-out motion-reduce:transition-none',
          wordmarkVisible ? 'opacity-100' : 'opacity-0',
        )}
      >
        <img src={wordmarkSrc} alt="" className="h-8 w-auto opacity-90 sm:h-10" draggable={false} />
        <p
          className="text-[11px] uppercase tracking-[0.32em] text-white/55"
          style={{ fontFamily: "'Azeret Mono', ui-monospace, Consolas, monospace" }}
        >
          Creator OS
        </p>
      </div>

      {/* Progress hairline (air accent) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/10">
        <div className="h-px bg-[#8cc8ff]/80" style={{ width: `${progress * 100}%` }} />
      </div>

      {/* Skip */}
      <button
        type="button"
        onClick={beginEnding}
        aria-label="Skip intro"
        style={{
          top: 'max(1.25rem, env(safe-area-inset-top))',
          right: 'max(1.25rem, env(safe-area-inset-right))',
        }}
        className={cn(
          'absolute z-10 flex h-11 items-center gap-2 rounded-md border border-white/[0.14] bg-black/40 px-4 text-xs uppercase tracking-[0.22em] text-white/85 backdrop-blur-sm',
          'transition-colors duration-wzrd-control hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f06a47]',
        )}
      >
        Skip
        <SkipForward className="h-4 w-4" />
      </button>
    </div>
  );
}
