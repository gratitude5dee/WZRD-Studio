// ---------------------------------------------------------------------------
// MotionSplatEngine — framework-free facade that owns the canvas, the clock,
// the orbit camera and the backend selection. React components subscribe to
// its state; nothing here touches React.
// ---------------------------------------------------------------------------

import type { MotionSplatQuality } from '@/types/motionSplat';
import type { OrbitState } from '@/lib/motion-splat/gl/mat4';
import { clampTime, stepKeyframe, wrapTime } from '@/lib/motion-splat/timeline';
import { OrbitController } from './OrbitController';
import { GpuBackend } from './backends/GpuBackend';
import { SparkBackend } from './backends/SparkBackend';
import { boxFrameFromCorners, cinematicOrbit, homeOrbitForFrame, preferredPixelRatio } from './cameraFraming';
import type {
  MotionSplatBackend,
  MotionSplatBackendKind,
  MotionSplatEngineListener,
  MotionSplatEngineOptions,
  MotionSplatEngineState,
} from './types';

const VIEW_FOV_DEG = 42;
const IDLE_DRIFT_DELAY_MS = 2_600;
const IDLE_DRIFT_RATE = 0.06; // rad/s
const CINEMATIC_DRIFT_RATE = 0.0; // camera path handles motion

export function isWebGL2Supported(): boolean {
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

function resolveQuality(quality: MotionSplatQuality | undefined): Exclude<MotionSplatQuality, 'auto'> {
  if (quality && quality !== 'auto') return quality;
  if (typeof window === 'undefined') return 'medium';
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (coarse) return 'low';
  return cores >= 8 ? 'high' : 'medium';
}

export class MotionSplatEngine {
  readonly container: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  private readonly options: MotionSplatEngineOptions;
  private readonly listeners = new Set<MotionSplatEngineListener>();
  private readonly abort = new AbortController();
  private backend: MotionSplatBackend | null = null;
  private orbitController: OrbitController | null = null;
  private orbit: OrbitState = { theta: 0.78, phi: 0.34, radius: 5, target: [0, 0, -2] };
  private homeOrbit: OrbitState = { theta: 0.78, phi: 0.34, radius: 5, target: [0, 0, -2] };
  private resizeObserver: ResizeObserver | null = null;
  private frameHandle = 0;
  private lastFrameTime = 0;
  private lastInteraction = 0;
  private cinematicStart = 0;
  private completed = false;
  private disposed = false;
  private pixelRatio = 1;
  private state: MotionSplatEngineState;

  constructor(container: HTMLElement, options: MotionSplatEngineOptions) {
    this.container = container;
    this.options = options;
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.touchAction = 'none';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.container.appendChild(this.canvas);
    this.state = {
      status: 'idle',
      progress: null,
      error: null,
      backend: null,
      time: 0,
      duration: options.manifest.duration,
      playing: false,
      loop: options.loop ?? true,
      speed: options.speed ?? 1,
      keyframeTimes: new Float32Array(0),
      splatCount: 0,
    };
  }

  getState(): MotionSplatEngineState {
    return this.state;
  }

  subscribe(listener: MotionSplatEngineListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private emit(patch: Partial<MotionSplatEngineState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  get mode() {
    return this.options.mode ?? 'interactive';
  }

  async load(): Promise<void> {
    if (this.disposed) return;
    if (!isWebGL2Supported()) {
      this.emit({ status: 'unsupported', error: 'WebGL2 is not available' });
      return;
    }
    this.emit({ status: 'loading', progress: { value: 0, label: 'Preparing' }, error: null });
    const quality = resolveQuality(this.options.quality);
    const preference = this.options.backend ?? 'auto';
    const attempts: MotionSplatBackendKind[] =
      preference === 'gpu' ? ['gpu'] : preference === 'spark' ? ['spark'] : ['spark', 'gpu'];
    // Only RGB-D tracks have a GPU path.
    const candidates = attempts.filter((kind) => kind === 'spark' || this.options.manifest.track.kind === 'rgbd');

    let lastError: Error | null = null;
    for (const kind of candidates) {
      if (this.disposed) return;
      const backend = this.createBackend(kind, quality);
      try {
        const result = await backend.load((progress) => {
          if (!this.disposed) this.emit({ status: 'decoding', progress });
        }, this.abort.signal);
        if (this.disposed) {
          backend.dispose();
          return;
        }
        this.backend = backend;
        this.emit({
          backend: kind,
          duration: result.duration || this.options.manifest.duration,
          keyframeTimes: result.keyframeTimes,
          splatCount: result.splatCount,
        });
        this.afterLoad();
        return;
      } catch (error) {
        backend.dispose();
        if ((error as DOMException)?.name === 'AbortError') return;
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`[motion-splat] ${kind} backend failed:`, lastError.message);
      }
    }
    this.emit({ status: 'error', error: lastError?.message ?? 'No rendering backend available', progress: null });
  }

  private createBackend(kind: MotionSplatBackendKind, quality: Exclude<MotionSplatQuality, 'auto'>): MotionSplatBackend {
    if (kind === 'spark') {
      return new SparkBackend({ canvas: this.canvas, manifest: this.options.manifest, quality });
    }
    return new GpuBackend({
      canvas: this.canvas,
      manifest: this.options.manifest,
      quality,
      loop: this.state.loop,
      speed: this.state.speed,
      onEnded: () => this.handleEnded(),
      onError: (error) => this.emit({ error: error.message }),
    });
  }

  private afterLoad(): void {
    const backend = this.backend!;
    const frame = boxFrameFromCorners(backend.boxCorners());
    this.homeOrbit = homeOrbitForFrame(frame, VIEW_FOV_DEG);
    this.orbit = { ...this.homeOrbit, target: [...this.homeOrbit.target] };
    this.orbitController = new OrbitController({
      element: this.canvas,
      orbit: this.orbit,
      limits: { minRadius: frame.radius * 0.6, maxRadius: frame.radius * 12 },
      enabled: this.mode === 'interactive',
      onInteract: () => {
        this.lastInteraction = performance.now();
      },
    });
    this.orbitController.setHome(this.homeOrbit);
    this.observeSize();
    backend.setLoop?.(this.state.loop);
    backend.setSpeed?.(this.state.speed);
    this.emit({ status: 'ready', progress: null, time: 0 });
    this.lastFrameTime = performance.now();
    this.lastInteraction = performance.now() - IDLE_DRIFT_DELAY_MS;
    this.cinematicStart = performance.now();
    this.startLoop();
    if (this.options.autoPlay ?? this.mode === 'cinematic') {
      void this.play();
    }
  }

  private observeSize(): void {
    const apply = () => {
      const rect = this.container.getBoundingClientRect();
      const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
      this.pixelRatio = preferredPixelRatio(window.devicePixelRatio, coarse);
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      this.backend?.setViewport(width, height, this.pixelRatio);
    };
    apply();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(apply);
      this.resizeObserver.observe(this.container);
    }
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;
      this.frameHandle = requestAnimationFrame(tick);
      this.step();
    };
    this.frameHandle = requestAnimationFrame(tick);
  }

  private step(): void {
    const backend = this.backend;
    if (!backend) return;
    const now = performance.now();
    const delta = Math.min(0.1, Math.max(0, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;

    // Clock
    let time = this.state.time;
    if (backend.ownsClock) {
      time = backend.currentTime?.() ?? time;
    } else if (this.state.playing) {
      const advanced = time + delta * this.state.speed;
      if (!this.state.loop && advanced >= this.state.duration) {
        time = this.state.duration;
        this.handleEnded();
      } else {
        time = wrapTime(advanced, this.state.duration, this.state.loop);
      }
    }

    // Camera
    if (this.mode === 'cinematic') {
      const progress = this.state.duration > 0 ? Math.min(1, time / this.state.duration) : 0;
      const target = cinematicOrbit(this.homeOrbit, progress);
      this.orbit.theta = target.theta;
      this.orbit.phi = target.phi;
      this.orbit.radius = target.radius;
      if (CINEMATIC_DRIFT_RATE) this.orbitController?.drift(delta, CINEMATIC_DRIFT_RATE);
    } else if (this.orbitController) {
      this.orbitController.update(delta);
      const idle = now - this.lastInteraction > IDLE_DRIFT_DELAY_MS && !this.orbitController.isDragging;
      if (idle && (this.options.autoRotate ?? true)) {
        this.orbitController.drift(delta, IDLE_DRIFT_RATE);
      }
    }
    backend.setOrbit(this.orbit);
    backend.render(time);
    if (Math.abs(time - this.state.time) > 1e-4) this.emit({ time });
  }

  private handleEnded(): void {
    if (this.state.loop) return;
    if (this.state.playing) this.emit({ playing: false });
    if (this.mode === 'cinematic' && !this.completed) {
      this.completed = true;
      this.options.onComplete?.();
    }
  }

  async play(): Promise<void> {
    if (!this.backend || this.state.status !== 'ready') return;
    if (!this.state.loop && this.state.time >= this.state.duration - 1e-3) {
      await this.seek(0);
    }
    this.emit({ playing: true });
    if (this.backend.ownsClock) await this.backend.play?.();
  }

  pause(): void {
    if (!this.backend) return;
    this.emit({ playing: false });
    if (this.backend.ownsClock) this.backend.pause?.();
  }

  togglePlay(): void {
    if (this.state.playing) this.pause();
    else void this.play();
  }

  async seek(time: number): Promise<void> {
    if (!this.backend) return;
    const clamped = clampTime(time, this.state.duration);
    this.emit({ time: clamped });
    await this.backend.seek(clamped);
    this.lastInteraction = performance.now();
  }

  stepKeyframe(direction: 1 | -1): void {
    const next = stepKeyframe(this.state.time, this.state.keyframeTimes, direction);
    void this.seek(next);
  }

  /** Nudge by one source frame. */
  stepFrame(direction: 1 | -1): void {
    const fps = this.options.manifest.fps > 0 ? this.options.manifest.fps : 24;
    void this.seek(this.state.time + direction / fps);
  }

  setLoop(loop: boolean): void {
    this.emit({ loop });
    this.backend?.setLoop?.(loop);
  }

  setSpeed(speed: number): void {
    const safe = Math.min(4, Math.max(0.1, speed));
    this.emit({ speed: safe });
    this.backend?.setSpeed?.(safe);
  }

  resetCamera(): void {
    this.orbitController?.reset();
    this.lastInteraction = performance.now();
  }

  zoom(factor: number): void {
    this.orbitController?.zoom(factor);
    this.lastInteraction = performance.now();
  }

  captureFrame(): string | null {
    return this.backend?.captureFrame() ?? null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    this.resizeObserver?.disconnect();
    this.orbitController?.dispose();
    this.backend?.dispose();
    this.backend = null;
    this.listeners.clear();
    if (this.canvas.parentNode === this.container) this.container.removeChild(this.canvas);
  }
}
