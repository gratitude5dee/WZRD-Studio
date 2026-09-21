import { useEffect, useRef, useState, type RefObject } from 'react';

import { MotionSplatEngine } from './engine/MotionSplatEngine';
import type { MotionSplatEngineOptions, MotionSplatEngineState } from './engine/types';

const INITIAL_STATE: MotionSplatEngineState = {
  status: 'idle',
  progress: null,
  error: null,
  backend: null,
  time: 0,
  duration: 0,
  playing: false,
  loop: true,
  speed: 1,
  keyframeTimes: new Float32Array(0),
  splatCount: 0,
};

export interface UseMotionSplatEngineResult {
  engine: MotionSplatEngine | null;
  state: MotionSplatEngineState;
}

/**
 * Creates a MotionSplatEngine inside `containerRef` and mirrors its state into
 * React. The engine is rebuilt when the manifest, mode, quality or backend
 * preference changes; playback options are applied live.
 */
export function useMotionSplatEngine(
  containerRef: RefObject<HTMLElement | null>,
  options: MotionSplatEngineOptions,
): UseMotionSplatEngineResult {
  const [engine, setEngine] = useState<MotionSplatEngine | null>(null);
  const [state, setState] = useState<MotionSplatEngineState>(INITIAL_STATE);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const manifestId = options.manifest.id;
  const mode = options.mode ?? 'interactive';
  const quality = options.quality ?? 'auto';
  const backend = options.backend ?? 'auto';

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const current = optionsRef.current;
    const instance = new MotionSplatEngine(container, {
      ...current,
      onComplete: () => optionsRef.current.onComplete?.(),
    });
    const unsubscribe = instance.subscribe(setState);
    setEngine(instance);
    void instance.load();
    return () => {
      unsubscribe();
      instance.dispose();
      setEngine(null);
      setState(INITIAL_STATE);
    };
    // The engine is intentionally rebuilt only for identity-changing options.
  }, [containerRef, manifestId, mode, quality, backend]);

  useEffect(() => {
    if (!engine || options.loop === undefined) return;
    engine.setLoop(options.loop);
  }, [engine, options.loop]);

  useEffect(() => {
    if (!engine || options.speed === undefined) return;
    engine.setSpeed(options.speed);
  }, [engine, options.speed]);

  return { engine, state };
}
