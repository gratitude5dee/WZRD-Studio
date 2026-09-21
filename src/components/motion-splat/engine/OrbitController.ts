// ---------------------------------------------------------------------------
// OrbitController — pointer / wheel / touch orbit with inertia. It only
// mutates an OrbitState; whoever renders reads it every frame.
// ---------------------------------------------------------------------------

import type { OrbitState, Vec3 } from '@/lib/motion-splat/gl/mat4';

export interface OrbitLimits {
  minPhi: number;
  maxPhi: number;
  minRadius: number;
  maxRadius: number;
}

export interface OrbitControllerOptions {
  element: HTMLElement;
  orbit: OrbitState;
  limits?: Partial<OrbitLimits>;
  /** Called whenever the user interacts (used to pause idle drift). */
  onInteract?: () => void;
  enabled?: boolean;
}

const DEFAULT_LIMITS: OrbitLimits = {
  minPhi: -0.35,
  maxPhi: 1.1,
  minRadius: 0.6,
  maxRadius: 40,
};

export class OrbitController {
  readonly orbit: OrbitState;
  private readonly element: HTMLElement;
  private readonly limits: OrbitLimits;
  private readonly onInteract?: () => void;
  private pointers = new Map<number, { x: number; y: number }>();
  private lastPinch = 0;
  private velocityTheta = 0;
  private velocityPhi = 0;
  private lastMove = 0;
  private dragging = false;
  enabled: boolean;
  /** Home position used by `reset()`. */
  home: OrbitState;

  constructor(options: OrbitControllerOptions) {
    this.element = options.element;
    this.orbit = options.orbit;
    this.limits = { ...DEFAULT_LIMITS, ...(options.limits ?? {}) };
    this.onInteract = options.onInteract;
    this.enabled = options.enabled ?? true;
    this.home = cloneOrbit(options.orbit);
    this.element.addEventListener('pointerdown', this.onPointerDown);
    this.element.addEventListener('pointermove', this.onPointerMove);
    this.element.addEventListener('pointerup', this.onPointerUp);
    this.element.addEventListener('pointercancel', this.onPointerUp);
    this.element.addEventListener('pointerleave', this.onPointerUp);
    this.element.addEventListener('wheel', this.onWheel, { passive: false });
    this.element.addEventListener('dblclick', this.onDoubleClick);
  }

  setHome(orbit: OrbitState): void {
    this.home = cloneOrbit(orbit);
  }

  reset(): void {
    this.orbit.theta = this.home.theta;
    this.orbit.phi = this.home.phi;
    this.orbit.radius = this.home.radius;
    this.orbit.target = [...this.home.target] as Vec3;
    this.velocityTheta = 0;
    this.velocityPhi = 0;
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  /** Apply inertia; call once per frame. Returns true when the camera moved. */
  update(deltaSeconds: number): boolean {
    if (this.dragging) return true;
    const damping = Math.pow(0.001, deltaSeconds); // strong friction
    let moved = false;
    if (Math.abs(this.velocityTheta) > 1e-4 || Math.abs(this.velocityPhi) > 1e-4) {
      this.orbit.theta += this.velocityTheta * deltaSeconds;
      this.orbit.phi = clamp(this.orbit.phi + this.velocityPhi * deltaSeconds, this.limits.minPhi, this.limits.maxPhi);
      this.velocityTheta *= damping;
      this.velocityPhi *= damping;
      moved = true;
    } else {
      this.velocityTheta = 0;
      this.velocityPhi = 0;
    }
    return moved;
  }

  /** Slow azimuth drift for idle / cinematic states. */
  drift(deltaSeconds: number, radiansPerSecond: number): void {
    this.orbit.theta += radiansPerSecond * deltaSeconds;
  }

  zoom(factor: number): void {
    this.orbit.radius = clamp(this.orbit.radius * factor, this.limits.minRadius, this.limits.maxRadius);
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.enabled) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    this.element.setPointerCapture?.(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.dragging = true;
    this.velocityTheta = 0;
    this.velocityPhi = 0;
    this.lastMove = performance.now();
    if (this.pointers.size === 2) this.lastPinch = this.pinchDistance();
    this.onInteract?.();
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.enabled || !this.pointers.has(event.pointerId)) return;
    const previous = this.pointers.get(event.pointerId)!;
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const now = performance.now();
    const dt = Math.max(1, now - this.lastMove) / 1000;
    this.lastMove = now;

    if (this.pointers.size >= 2) {
      const pinch = this.pinchDistance();
      if (this.lastPinch > 0 && pinch > 0) this.zoom(this.lastPinch / pinch);
      this.lastPinch = pinch;
      return;
    }

    const width = Math.max(1, this.element.clientWidth);
    const dTheta = -(dx / width) * Math.PI * 1.4;
    const dPhi = (dy / width) * Math.PI * 1.4;
    this.orbit.theta += dTheta;
    this.orbit.phi = clamp(this.orbit.phi + dPhi, this.limits.minPhi, this.limits.maxPhi);
    this.velocityTheta = dTheta / dt;
    this.velocityPhi = dPhi / dt;
    this.onInteract?.();
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.delete(event.pointerId);
    this.element.releasePointerCapture?.(event.pointerId);
    if (this.pointers.size === 0) {
      this.dragging = false;
      // Drop inertia if the pointer paused before release.
      if (performance.now() - this.lastMove > 80) {
        this.velocityTheta = 0;
        this.velocityPhi = 0;
      } else {
        this.velocityTheta = clamp(this.velocityTheta, -6, 6);
        this.velocityPhi = clamp(this.velocityPhi, -6, 6);
      }
    }
  };

  private onWheel = (event: WheelEvent): void => {
    if (!this.enabled) return;
    event.preventDefault();
    const factor = Math.exp(event.deltaY * 0.0012);
    this.zoom(factor);
    this.onInteract?.();
  };

  private onDoubleClick = (): void => {
    if (!this.enabled) return;
    this.reset();
    this.onInteract?.();
  };

  private pinchDistance(): number {
    const points = Array.from(this.pointers.values());
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointercancel', this.onPointerUp);
    this.element.removeEventListener('pointerleave', this.onPointerUp);
    this.element.removeEventListener('wheel', this.onWheel);
    this.element.removeEventListener('dblclick', this.onDoubleClick);
    this.pointers.clear();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function cloneOrbit(orbit: OrbitState): OrbitState {
  return { theta: orbit.theta, phi: orbit.phi, radius: orbit.radius, target: [...orbit.target] as Vec3 };
}
