// ---------------------------------------------------------------------------
// SparkBackend — true 3D Gaussian splatting via @sparkjsdev/spark + three.
//
// RGB-D tracks: N keyframes are decoded from the colour/depth videos into
// per-cell splats; scrubbing interpolates neighbouring keyframes on the CPU and
// writes straight into Spark's packed texture (verified update sequence:
// mutate packedArray → packedSplats.needsUpdate = true → mesh.needsUpdate = true).
// Splat-keyframe tracks (TripoSplat PLYs) are Morton-aligned and morphed the
// same way. Splat sequences crossfade one SplatMesh per frame.
// ---------------------------------------------------------------------------

import type * as THREE from 'three';
import type * as Spark from '@sparkjsdev/spark';

import type { MotionSplatManifest, MotionSplatQuality } from '@/types/motionSplat';
import type { OrbitState } from '@/lib/motion-splat/gl/mat4';
import { orbitEye } from '@/lib/motion-splat/gl/mat4';
import { manifestKeyframeTimes } from '@/lib/motion-splat/manifest';
import { alignSplatSets } from '@/lib/motion-splat/morton';
import { clearPackedRange, createSplatSet, packRgbdBlend, packSplatSetBlend, type SplatSet } from '@/lib/motion-splat/pack';
import { resolveBlend } from '@/lib/motion-splat/timeline';
import {
  FRUSTUM_EDGE_INDICES,
  FRUSTUM_FACE_INDICES,
  type RgbdFrame,
  frustumCorners,
  frustumTangents,
  resolveGrid,
} from '@/lib/motion-splat/unproject';
import { extractRgbdKeyframes } from '@/lib/motion-splat/videoFrames';
import { DEFAULT_MAX_KEYFRAME_SPLATS } from '@/lib/motion-splat/constants';
import type { BackendLoadResult, BackendProgress, MotionSplatBackend } from '../types';

type ThreeModule = typeof THREE;
type SparkModule = typeof Spark;

export interface SparkBackendOptions {
  canvas: HTMLCanvasElement;
  manifest: MotionSplatManifest;
  quality: Exclude<MotionSplatQuality, 'auto'>;
}

interface SparkRuntime {
  three: ThreeModule;
  spark: SparkModule;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sparkRenderer: Spark.SparkRenderer;
}

const BOX_EDGE_ALPHA = 0.35;
const BOX_FACE_ALPHA = 0.05;

/** Loads three + spark lazily; throws when Spark is stubbed or unavailable. */
export async function loadSparkRuntime(): Promise<{ three: ThreeModule; spark: SparkModule }> {
  const [three, spark] = await Promise.all([import('three'), import('@sparkjsdev/spark')]);
  const candidate = spark as Partial<SparkModule>;
  if (typeof candidate.SparkRenderer !== 'function' || typeof candidate.PackedSplats !== 'function' || !candidate.utils) {
    throw new Error('SparkJS runtime is unavailable in this build');
  }
  return { three, spark };
}

export class SparkBackend implements MotionSplatBackend {
  readonly kind = 'spark' as const;
  readonly ownsClock = false;
  private readonly options: SparkBackendOptions;
  private runtime: SparkRuntime | null = null;
  private corners: Float32Array;
  private keyframeTimes: Float32Array = new Float32Array(0);
  private packed: Spark.PackedSplats | null = null;
  private mesh: Spark.SplatMesh | null = null;
  private rgbdFrames: RgbdFrame[] = [];
  private splatSets: SplatSet[] = [];
  private sequenceMeshes: Spark.SplatMesh[] = [];
  private packOptions: { rows: number; tanY: number } | null = null;
  private lastPacked: { index: number; next: number; mix: number } | null = null;
  private dirty = true;
  private disposables: Array<() => void> = [];

  constructor(options: SparkBackendOptions) {
    this.options = options;
    const aspect = options.manifest.width / Math.max(1, options.manifest.height);
    this.corners = frustumCorners(options.manifest.camera, aspect);
  }

  async load(onProgress: (progress: BackendProgress) => void, signal: AbortSignal): Promise<BackendLoadResult> {
    const { three, spark } = await loadSparkRuntime();
    const renderer = new three.WebGLRenderer({
      canvas: this.options.canvas,
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    renderer.setClearColor(0x000000, 1);
    const scene = new three.Scene();
    const camera = new three.PerspectiveCamera(42, 16 / 9, 0.05, 200);
    const sparkRenderer = new spark.SparkRenderer({ renderer, preUpdate: true });
    scene.add(sparkRenderer);
    this.runtime = { three, spark, renderer, scene, camera, sparkRenderer };

    const { manifest } = this.options;
    let splatCount = 0;
    if (manifest.track.kind === 'rgbd') {
      splatCount = await this.loadRgbd(onProgress, signal);
    } else if (manifest.track.kind === 'splat-keyframes') {
      splatCount = await this.loadSplatKeyframes(onProgress, signal);
    } else {
      splatCount = await this.loadSplatSequence(onProgress, signal);
    }
    this.buildBox();
    // Warm the shader pipeline so the first visible frame does not stall.
    this.render(0);
    onProgress({ value: 1, label: 'Ready' });
    return { duration: manifest.duration, keyframeTimes: this.keyframeTimes, splatCount };
  }

  private allocatePacked(count: number): Spark.PackedSplats {
    const { spark } = this.runtime!;
    const maxSplats = spark.utils.getTextureSize(Math.max(1, count)).maxSplats;
    const packedArray = new Uint32Array(maxSplats * 4);
    const packed = new spark.PackedSplats({ packedArray, numSplats: count });
    const mesh = new spark.SplatMesh({ packedSplats: packed });
    this.runtime!.scene.add(mesh);
    this.packed = packed;
    this.mesh = mesh;
    return packed;
  }

  private async loadRgbd(onProgress: (progress: BackendProgress) => void, signal: AbortSignal): Promise<number> {
    const { manifest, quality } = this.options;
    if (manifest.track.kind !== 'rgbd') return 0;
    const track = manifest.track;
    const aspect = manifest.width / Math.max(1, manifest.height);
    const preset = resolveGrid(quality, aspect);
    const grid = { cols: Math.min(track.grid.cols, preset.cols), rows: Math.min(track.grid.rows, preset.rows) };
    this.keyframeTimes = manifestKeyframeTimes(manifest);
    const extracted = await extractRgbdKeyframes({
      videoUrl: manifest.source.videoUrl,
      depthVideoUrl: track.depthVideoUrl,
      times: this.keyframeTimes,
      grid,
      camera: manifest.camera,
      encoding: track.depthEncoding,
      signal,
      onProgress: (p) => onProgress({ value: 0.05 + p.value * 0.85, label: p.label }),
    });
    this.rgbdFrames = extracted.frames;
    const { tanY } = frustumTangents(manifest.camera.fovDeg, grid.cols / grid.rows);
    this.packOptions = { rows: grid.rows, tanY };
    const count = grid.cols * grid.rows;
    this.allocatePacked(count);
    this.dirty = true;
    return count;
  }

  private async loadSplatKeyframes(onProgress: (progress: BackendProgress) => void, signal: AbortSignal): Promise<number> {
    const { manifest } = this.options;
    if (manifest.track.kind !== 'splat-keyframes') return 0;
    const { spark } = this.runtime!;
    const keyframes = [...manifest.track.keyframes].sort((a, b) => a.time - b.time);
    this.keyframeTimes = Float32Array.from(keyframes.map((k) => k.time));
    const sets: SplatSet[] = [];
    for (let i = 0; i < keyframes.length; i++) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      onProgress({ value: 0.05 + (i / keyframes.length) * 0.8, label: `Loading splat ${i + 1} of ${keyframes.length}` });
      const packed = await new spark.SplatLoader().loadAsync(keyframes[i].url);
      sets.push(packedToSplatSet(packed));
      packed.dispose();
    }
    onProgress({ value: 0.9, label: 'Aligning keyframes' });
    this.splatSets = alignSplatSets(sets, manifest.track.maxSplats ?? DEFAULT_MAX_KEYFRAME_SPLATS);
    const count = this.splatSets[0]?.count ?? 0;
    this.allocatePacked(count);
    // 3DGS files are usually Y-down / Z-forward; flip like the existing viewer.
    if (this.mesh) this.mesh.rotation.x = Math.PI;
    this.corners = boundsCorners(this.splatSets, true);
    this.dirty = true;
    return count;
  }

  private async loadSplatSequence(onProgress: (progress: BackendProgress) => void, signal: AbortSignal): Promise<number> {
    const { manifest } = this.options;
    if (manifest.track.kind !== 'splat-sequence') return 0;
    const { spark, scene } = this.runtime!;
    const frames = [...manifest.track.frames].sort((a, b) => a.time - b.time);
    this.keyframeTimes = Float32Array.from(frames.map((f) => f.time));
    let count = 0;
    for (let i = 0; i < frames.length; i++) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      onProgress({ value: 0.05 + (i / frames.length) * 0.9, label: `Loading frame ${i + 1} of ${frames.length}` });
      const packed = await new spark.SplatLoader().loadAsync(frames[i].url);
      const mesh = new spark.SplatMesh({ packedSplats: packed });
      mesh.rotation.x = Math.PI;
      mesh.visible = i === 0;
      scene.add(mesh);
      this.sequenceMeshes.push(mesh);
      count = Math.max(count, packed.numSplats);
    }
    this.dirty = true;
    return count;
  }

  private buildBox(): void {
    const { three, scene } = this.runtime!;
    const points = Array.from({ length: 8 }, (_, i) =>
      new three.Vector3(this.corners[i * 3], this.corners[i * 3 + 1], this.corners[i * 3 + 2]),
    );
    const edges = new three.BufferGeometry().setFromPoints(FRUSTUM_EDGE_INDICES.map((i) => points[i]));
    const edgeMaterial = new three.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: BOX_EDGE_ALPHA, depthWrite: false });
    const faces = new three.BufferGeometry().setFromPoints(FRUSTUM_FACE_INDICES.map((i) => points[i]));
    const faceMaterial = new three.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: BOX_FACE_ALPHA,
      side: three.DoubleSide,
      depthWrite: false,
    });
    const lines = new three.LineSegments(edges, edgeMaterial);
    const glass = new three.Mesh(faces, faceMaterial);
    lines.renderOrder = 10;
    glass.renderOrder = 9;
    scene.add(glass);
    scene.add(lines);
    this.disposables.push(() => {
      scene.remove(lines);
      scene.remove(glass);
      edges.dispose();
      faces.dispose();
      edgeMaterial.dispose();
      faceMaterial.dispose();
    });
  }

  seek(): void {
    this.dirty = true;
  }

  setOrbit(orbit: OrbitState): void {
    if (!this.runtime) return;
    const eye = orbitEye(orbit);
    this.runtime.camera.position.set(eye[0], eye[1], eye[2]);
    this.runtime.camera.lookAt(orbit.target[0], orbit.target[1], orbit.target[2]);
  }

  setViewport(width: number, height: number, pixelRatio: number): void {
    if (!this.runtime) return;
    const { renderer, camera } = this.runtime;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  private packForTime(time: number): void {
    if (!this.packed || !this.mesh) return;
    const blend = resolveBlend(time, this.keyframeTimes);
    const last = this.lastPacked;
    if (!this.dirty && last && last.index === blend.index && last.next === blend.next && Math.abs(last.mix - blend.mix) < 1e-4) {
      return;
    }
    const target = this.packed.packedArray;
    if (!target) return;
    if (this.rgbdFrames.length && this.packOptions) {
      const a = this.rgbdFrames[blend.index];
      const b = this.rgbdFrames[blend.next] ?? null;
      packRgbdBlend(target, a, b, blend.mix, this.packOptions);
    } else if (this.splatSets.length) {
      const a = this.splatSets[blend.index];
      const b = this.splatSets[blend.next] ?? null;
      const written = packSplatSetBlend(target, a, b, blend.mix);
      clearPackedRange(target, written, this.packed.numSplats);
    }
    this.packed.needsUpdate = true;
    this.mesh.needsUpdate = true;
    this.lastPacked = blend;
    this.dirty = false;
  }

  private crossfadeForTime(time: number): void {
    if (!this.sequenceMeshes.length) return;
    const blend = resolveBlend(time, this.keyframeTimes);
    this.sequenceMeshes.forEach((mesh, i) => {
      const active = i === blend.index || i === blend.next;
      mesh.visible = active;
      if (i === blend.index) mesh.opacity = blend.index === blend.next ? 1 : 1 - blend.mix;
      else if (i === blend.next) mesh.opacity = blend.mix;
    });
  }

  render(time: number): void {
    if (!this.runtime) return;
    if (this.sequenceMeshes.length) this.crossfadeForTime(time);
    else this.packForTime(time);
    this.runtime.renderer.render(this.runtime.scene, this.runtime.camera);
  }

  captureFrame(): string | null {
    if (!this.runtime) return null;
    try {
      this.runtime.renderer.render(this.runtime.scene, this.runtime.camera);
      return this.runtime.renderer.domElement.toDataURL('image/png');
    } catch {
      return null;
    }
  }

  boxCorners(): Float32Array {
    return this.corners;
  }

  dispose(): void {
    const runtime = this.runtime;
    if (!runtime) return;
    this.runtime = null;
    const { scene, renderer, sparkRenderer } = runtime;
    for (const dispose of this.disposables) dispose();
    this.disposables = [];
    const pending = (sparkRenderer as unknown as { pendingUpdate?: { timeoutId?: number } }).pendingUpdate;
    if (pending?.timeoutId) clearTimeout(pending.timeoutId);
    for (const mesh of [this.mesh, ...this.sequenceMeshes]) {
      if (!mesh) continue;
      scene.remove(mesh);
      mesh.dispose();
    }
    this.mesh = null;
    this.packed = null;
    this.sequenceMeshes = [];
    this.rgbdFrames = [];
    this.splatSets = [];
    scene.remove(sparkRenderer);
    const internals = sparkRenderer as unknown as {
      defaultView?: { dispose?: () => void };
      active?: { splats?: { dispose?: () => void } };
      freeAccumulators?: Array<{ splats?: { dispose?: () => void } }>;
      material?: { dispose?: () => void };
    };
    internals.defaultView?.dispose?.();
    internals.active?.splats?.dispose?.();
    internals.freeAccumulators?.forEach((acc) => acc.splats?.dispose?.());
    internals.material?.dispose?.();
    renderer.dispose();
  }
}

function packedToSplatSet(packed: Spark.PackedSplats): SplatSet {
  const set = createSplatSet(packed.numSplats);
  packed.forEachSplat((index, center, scales, quaternion, opacity, color) => {
    set.positions[index * 3] = center.x;
    set.positions[index * 3 + 1] = center.y;
    set.positions[index * 3 + 2] = center.z;
    set.scales[index * 3] = scales.x;
    set.scales[index * 3 + 1] = scales.y;
    set.scales[index * 3 + 2] = scales.z;
    set.quaternions[index * 4] = quaternion.x;
    set.quaternions[index * 4 + 1] = quaternion.y;
    set.quaternions[index * 4 + 2] = quaternion.z;
    set.quaternions[index * 4 + 3] = quaternion.w;
    set.colors[index * 3] = Math.round(color.r * 255);
    set.colors[index * 3 + 1] = Math.round(color.g * 255);
    set.colors[index * 3 + 2] = Math.round(color.b * 255);
    set.alphas[index] = Math.round(opacity * 255);
  });
  return set;
}

/** Axis-aligned box corners around all sets (optionally after the Y-down → Y-up flip). */
function boundsCorners(sets: SplatSet[], flipYZ: boolean): Float32Array {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const set of sets) {
    for (let p = 0; p < set.count; p++) {
      const x = set.positions[p * 3];
      const y = flipYZ ? -set.positions[p * 3 + 1] : set.positions[p * 3 + 1];
      const z = flipYZ ? -set.positions[p * 3 + 2] : set.positions[p * 3 + 2];
      if (x < min[0]) min[0] = x;
      if (y < min[1]) min[1] = y;
      if (z < min[2]) min[2] = z;
      if (x > max[0]) max[0] = x;
      if (y > max[1]) max[1] = y;
      if (z > max[2]) max[2] = z;
    }
  }
  if (!Number.isFinite(min[0])) return new Float32Array(24);
  // Same corner order as frustumCorners: near face (max z) then far face (min z).
  const out = new Float32Array(24);
  const faces = [max[2], min[2]];
  const signs = [
    [min[0], max[1]],
    [max[0], max[1]],
    [max[0], min[1]],
    [min[0], min[1]],
  ];
  let k = 0;
  for (const z of faces) {
    for (const [x, y] of signs) {
      out[k++] = x;
      out[k++] = y;
      out[k++] = z;
    }
  }
  return out;
}
