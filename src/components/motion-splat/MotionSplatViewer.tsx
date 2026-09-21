import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { AlertCircle } from 'lucide-react';

import type { MotionSplatManifest, MotionSplatQuality, MotionSplatViewerMode } from '@/types/motionSplat';
import { cn } from '@/lib/utils';
import { TransportBar } from './TransportBar';
import type { MotionSplatEngine } from './engine/MotionSplatEngine';
import type { BackendPreference, MotionSplatEngineState } from './engine/types';
import { useMotionSplatEngine } from './useMotionSplatEngine';

export interface MotionSplatViewerProps {
  manifest: MotionSplatManifest;
  mode?: MotionSplatViewerMode;
  quality?: MotionSplatQuality;
  backend?: BackendPreference;
  autoPlay?: boolean;
  loop?: boolean;
  speed?: number;
  autoRotate?: boolean;
  /** Show the scrub bar (interactive mode only). */
  showTransport?: boolean;
  className?: string;
  /** Rendered instead of the canvas when WebGL2 is unavailable. */
  fallback?: ReactNode;
  onStateChange?: (state: MotionSplatEngineState) => void;
  onReady?: () => void;
  onError?: (message: string) => void;
  /** Cinematic mode: the clip finished playing once. */
  onComplete?: () => void;
  children?: ReactNode;
}

export interface MotionSplatViewerHandle {
  engine: MotionSplatEngine | null;
  captureFrame: () => string | null;
  seek: (time: number) => void;
  play: () => void;
  pause: () => void;
  resetCamera: () => void;
}

/**
 * The motion splat stage: a black canvas with the splat inside its frustum
 * box, orbit controls, keyboard shortcuts and (in interactive mode) the
 * transport bar. Rendering is delegated to MotionSplatEngine.
 */
export const MotionSplatViewer = forwardRef<MotionSplatViewerHandle, MotionSplatViewerProps>(function MotionSplatViewer(
  {
    manifest,
    mode = 'interactive',
    quality = 'auto',
    backend = 'auto',
    autoPlay,
    loop,
    speed,
    autoRotate,
    showTransport = mode === 'interactive',
    className,
    fallback,
    onStateChange,
    onReady,
    onError,
    onComplete,
    children,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { engine, state } = useMotionSplatEngine(containerRef, {
    manifest,
    mode,
    quality,
    backend,
    autoPlay,
    loop,
    speed,
    autoRotate,
    onComplete,
  });

  const readyNotified = useRef(false);
  useEffect(() => {
    onStateChange?.(state);
    if (state.status === 'ready' && !readyNotified.current) {
      readyNotified.current = true;
      onReady?.();
    }
    if (state.status === 'error' && state.error) onError?.(state.error);
    if (state.status !== 'ready') readyNotified.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useImperativeHandle(
    ref,
    () => ({
      engine,
      captureFrame: () => engine?.captureFrame() ?? null,
      seek: (time: number) => void engine?.seek(time),
      play: () => void engine?.play(),
      pause: () => engine?.pause(),
      resetCamera: () => engine?.resetCamera(),
    }),
    [engine],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!engine || state.status !== 'ready' || mode !== 'interactive') return;
      const target = event.target as HTMLElement | null;
      if (target && target.getAttribute('role') === 'slider') return; // the timeline handles its own keys
      const key = event.key;
      const lower = key.toLowerCase();
      if (key === ' ') {
        event.preventDefault();
        engine.togglePlay();
      } else if (lower === 'j') {
        event.preventDefault();
        engine.stepKeyframe(-1);
      } else if (lower === 'k') {
        event.preventDefault();
        engine.stepKeyframe(1);
      } else if (lower === 'l') {
        event.preventDefault();
        engine.setLoop(!state.loop);
      } else if (lower === 'r') {
        event.preventDefault();
        engine.resetCamera();
      } else if (key === 'ArrowLeft') {
        event.preventDefault();
        if (event.shiftKey) engine.stepKeyframe(-1);
        else engine.stepFrame(-1);
      } else if (key === 'ArrowRight') {
        event.preventDefault();
        if (event.shiftKey) engine.stepKeyframe(1);
        else engine.stepFrame(1);
      } else if (key === 'Home') {
        event.preventDefault();
        void engine.seek(0);
      } else if (key === 'End') {
        event.preventDefault();
        void engine.seek(state.duration);
      }
    },
    [engine, mode, state.duration, state.loop, state.status],
  );

  const unsupported = state.status === 'unsupported';
  const showOverlay = state.status === 'loading' || state.status === 'decoding';
  const progressValue = state.progress ? Math.round(state.progress.value * 100) : 0;

  return (
    <div
      className={cn('relative flex h-full w-full flex-col bg-black text-white', className)}
      data-testid="motion-splat-viewer"
      data-status={state.status}
      data-backend={state.backend ?? ''}
    >
      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 overflow-hidden bg-black outline-none"
        tabIndex={mode === 'interactive' ? 0 : -1}
        role={mode === 'interactive' ? 'application' : undefined}
        aria-label={mode === 'interactive' ? `Motion splat: ${manifest.title}` : undefined}
        aria-roledescription={mode === 'interactive' ? '3D viewer' : undefined}
        onKeyDown={handleKeyDown}
        data-testid="motion-splat-stage"
      >
        {unsupported && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black" data-testid="motion-splat-fallback">
            {fallback ?? (
              <video
                src={manifest.source.videoUrl}
                poster={manifest.posterUrl}
                controls
                playsInline
                muted
                loop
                className="h-full w-full object-contain"
              />
            )}
          </div>
        )}

        {showOverlay && (
          <div
            className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center bg-black/40 p-6"
            role="status"
            aria-live="polite"
            data-testid="motion-splat-progress"
          >
            <div className="w-full max-w-sm">
              <div className="mb-2 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.18em] text-kanvas-text-secondary">
                <span>{state.progress?.label ?? 'Loading'}</span>
                <span className="tabular-nums">{progressValue}%</span>
              </div>
              <div className="h-px w-full bg-white/15">
                <div className="h-px bg-kanvas-accent transition-[width] duration-wzrd-control" style={{ width: `${progressValue}%` }} />
              </div>
            </div>
          </div>
        )}

        {state.status === 'error' && (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center"
            role="alert"
            data-testid="motion-splat-error"
          >
            <AlertCircle className="h-6 w-6 text-kanvas-accent" />
            <p className="max-w-sm text-sm text-kanvas-text-secondary">{state.error ?? 'The motion splat could not be rendered.'}</p>
            <button
              type="button"
              onClick={() => void engine?.load()}
              className="h-11 rounded-md border border-kanvas-border-default px-4 font-mono text-xs uppercase tracking-[0.18em] text-kanvas-text-primary transition-colors hover:bg-white/10"
            >
              Retry
            </button>
          </div>
        )}

        {children}
      </div>

      {showTransport && !unsupported && (
        <TransportBar
          time={state.time}
          duration={state.duration}
          fps={manifest.fps}
          playing={state.playing}
          loop={state.loop}
          speed={state.speed}
          keyframeTimes={state.keyframeTimes}
          disabled={state.status !== 'ready'}
          onSeek={(t) => void engine?.seek(t)}
          onTogglePlay={() => engine?.togglePlay()}
          onToggleLoop={() => engine?.setLoop(!state.loop)}
          onSpeedChange={(s) => engine?.setSpeed(s)}
          onStepKeyframe={(d) => engine?.stepKeyframe(d)}
          onStepFrame={(d) => engine?.stepFrame(d)}
          onResetCamera={() => engine?.resetCamera()}
        />
      )}
    </div>
  );
});

export default MotionSplatViewer;
