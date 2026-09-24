// ---------------------------------------------------------------------------
// VideoSplatRenderer — a dependency-free WebGL2 renderer for RGB-D motion
// splats. Every grid cell is an isotropic Gaussian billboard whose position is
// unprojected on the GPU from the depth video, so time is simply the videos'
// currentTime and motion runs at the clip's native frame rate.
//
// Rendering: two passes — opaque Gaussian cores (depth write) then soft edges
// (blended, no depth write) — which gives clean silhouettes without a global
// sort. The camera-frustum glass box from the reference viewer is drawn last.
//
// Used by the landing intro (Spark/three are not available in the Next bundle)
// and as the studio viewer's fallback backend.
// ---------------------------------------------------------------------------

import type { DepthEncoding, MotionSplatCamera, MotionSplatGrid } from '@/types/motionSplat';
import { EDGE_ALPHA, EDGE_DEPTH_THRESHOLD, FOOTPRINT_SCALE } from '../constants';
import { FRUSTUM_EDGE_INDICES, FRUSTUM_FACE_INDICES, frustumCorners, frustumTangents } from '../unproject';
import { type Mat4, type OrbitState, type Vec3, mat4LookAt, mat4Multiply, mat4Perspective, orbitEye } from './mat4';
import { LINE_FRAGMENT_SHADER, LINE_VERTEX_SHADER, SPLAT_FRAGMENT_SHADER, SPLAT_VERTEX_SHADER } from './shaders';

export interface VideoSplatRendererOptions {
  canvas: HTMLCanvasElement;
  grid: MotionSplatGrid;
  camera: MotionSplatCamera;
  encoding: DepthEncoding;
  /** Video aspect (width / height) used for the frustum; defaults to grid aspect. */
  aspect?: number;
  edgeThreshold?: number;
  edgeAlpha?: number;
  footprintScale?: number;
  /** Clear colour, default pure black. */
  background?: [number, number, number, number];
  boxEdgeAlpha?: number;
  boxFaceAlpha?: number;
  showBox?: boolean;
  /** Called when the browser takes the GPU context away (driver reset, tab evicted). */
  onContextLost?: (error: Error) => void;
}

export interface VideoSplatViewOptions {
  fovDeg: number;
  near: number;
  far: number;
}

type TextureSource = TexImageSource;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Could not create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown error';
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

function linkProgram(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('Could not create program');
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertex);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown error';
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${log}`);
  }
  return program;
}

export function createWebGL2Context(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  try {
    return canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
  } catch {
    return null;
  }
}

export class VideoSplatRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  private readonly splatProgram: WebGLProgram;
  private readonly lineProgram: WebGLProgram;
  private readonly quadVao: WebGLVertexArrayObject;
  private readonly boxVao: WebGLVertexArrayObject;
  private readonly boxEdgeCount: number;
  private readonly boxFaceCount: number;
  private readonly boxFaceOffset: number;
  private readonly rgbTexture: WebGLTexture;
  private readonly depthTexture: WebGLTexture;
  private readonly uniforms: Record<string, WebGLUniformLocation | null> = {};
  private readonly lineUniforms: Record<string, WebGLUniformLocation | null> = {};
  private grid: MotionSplatGrid;
  private camera: MotionSplatCamera;
  private encoding: DepthEncoding;
  private aspect: number;
  private hasFrame = false;
  private disposed = false;
  private contextLost = false;
  private readonly onContextLost?: (error: Error) => void;
  private readonly handleContextLost: (event: Event) => void;
  private readonly view: Mat4 = new Float32Array(16);
  private readonly proj: Mat4 = new Float32Array(16);
  private readonly viewProj: Mat4 = new Float32Array(16);
  private readonly background: [number, number, number, number];

  edgeThreshold: number;
  edgeAlpha: number;
  footprintScale: number;
  opacity = 1;
  showBox: boolean;
  boxEdgeAlpha: number;
  boxFaceAlpha: number;
  viewOptions: VideoSplatViewOptions = { fovDeg: 42, near: 0.05, far: 100 };
  orbit: OrbitState;

  constructor(options: VideoSplatRendererOptions) {
    this.canvas = options.canvas;
    const gl = createWebGL2Context(options.canvas);
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.grid = options.grid;
    this.camera = options.camera;
    this.encoding = options.encoding;
    this.aspect = options.aspect ?? options.grid.cols / options.grid.rows;
    this.edgeThreshold = options.edgeThreshold ?? EDGE_DEPTH_THRESHOLD;
    this.edgeAlpha = options.edgeAlpha ?? EDGE_ALPHA;
    this.footprintScale = options.footprintScale ?? FOOTPRINT_SCALE;
    this.background = options.background ?? [0, 0, 0, 1];
    this.showBox = options.showBox ?? true;
    this.boxEdgeAlpha = options.boxEdgeAlpha ?? 0.35;
    this.boxFaceAlpha = options.boxFaceAlpha ?? 0.05;
    this.orbit = { theta: 0.72, phi: 0.36, radius: 4.6, target: [0, 0, -(this.camera.near + this.camera.far) / 2] };
    // A lost context makes every later GL call a no-op; stop drawing and say so
    // rather than painting a frozen canvas.
    this.onContextLost = options.onContextLost;
    this.handleContextLost = (event: Event) => {
      event.preventDefault();
      this.contextLost = true;
      this.onContextLost?.(new Error('The WebGL context was lost'));
    };
    this.canvas.addEventListener('webglcontextlost', this.handleContextLost);

    this.splatProgram = linkProgram(gl, SPLAT_VERTEX_SHADER, SPLAT_FRAGMENT_SHADER);
    this.lineProgram = linkProgram(gl, LINE_VERTEX_SHADER, LINE_FRAGMENT_SHADER);
    for (const name of [
      'uRgb', 'uDepth', 'uGrid', 'uTan', 'uNearFar', 'uEncoding', 'uView', 'uProj', 'uFootprint',
      'uEdgeThreshold', 'uEdgeAlpha', 'uOpacity', 'uRadiusScale', 'uCutoffLow', 'uCutoffHigh', 'uFalloff',
    ]) {
      this.uniforms[name] = gl.getUniformLocation(this.splatProgram, name);
    }
    for (const name of ['uViewProj', 'uColor']) {
      this.lineUniforms[name] = gl.getUniformLocation(this.lineProgram, name);
    }

    // Quad geometry (two triangles), instanced per grid cell via gl_InstanceID.
    const quadVao = gl.createVertexArray();
    if (!quadVao) throw new Error('Could not create VAO');
    this.quadVao = quadVao;
    gl.bindVertexArray(quadVao);
    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const cornerLoc = gl.getAttribLocation(this.splatProgram, 'aCorner');
    gl.enableVertexAttribArray(cornerLoc);
    gl.vertexAttribPointer(cornerLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Frustum box geometry.
    const boxVao = gl.createVertexArray();
    if (!boxVao) throw new Error('Could not create VAO');
    this.boxVao = boxVao;
    const corners = frustumCorners(this.camera, this.aspect);
    gl.bindVertexArray(boxVao);
    const boxBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, boxBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(this.lineProgram, 'aPosition');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    const indices = new Uint16Array([...FRUSTUM_EDGE_INDICES, ...FRUSTUM_FACE_INDICES]);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    this.boxEdgeCount = FRUSTUM_EDGE_INDICES.length;
    this.boxFaceOffset = FRUSTUM_EDGE_INDICES.length * 2;
    this.boxFaceCount = FRUSTUM_FACE_INDICES.length;
    gl.bindVertexArray(null);

    this.rgbTexture = this.createTexture();
    this.depthTexture = this.createTexture();
  }

  private createTexture(): WebGLTexture {
    const { gl } = this;
    const texture = gl.createTexture();
    if (!texture) throw new Error('Could not create texture');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // 1x1 black placeholder so the first draw is valid.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
  }

  /** Upload the current frames of both sources (videos, images or canvases). */
  uploadFrames(rgb: TextureSource, depth: TextureSource): void {
    if (this.disposed) return;
    const { gl } = this;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.bindTexture(gl.TEXTURE_2D, this.rgbTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, rgb);
    gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, depth);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.hasFrame = true;
  }

  setGrid(grid: MotionSplatGrid): void {
    this.grid = grid;
  }

  getGrid(): MotionSplatGrid {
    return this.grid;
  }

  getCamera(): MotionSplatCamera {
    return this.camera;
  }

  getAspect(): number {
    return this.aspect;
  }

  /** Resize the drawing buffer (CSS pixels × device pixel ratio). */
  resize(width: number, height: number, pixelRatio = 1): void {
    const w = Math.max(1, Math.round(width * pixelRatio));
    const h = Math.max(1, Math.round(height * pixelRatio));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** Eye position for the current orbit state. */
  eye(): Vec3 {
    return orbitEye(this.orbit);
  }

  private updateMatrices(): void {
    const { canvas } = this;
    const aspect = canvas.width / Math.max(1, canvas.height);
    mat4Perspective(this.proj, (this.viewOptions.fovDeg * Math.PI) / 180, aspect, this.viewOptions.near, this.viewOptions.far);
    mat4LookAt(this.view, orbitEye(this.orbit), this.orbit.target);
    mat4Multiply(this.viewProj, this.proj, this.view);
  }

  render(): void {
    if (this.disposed || this.contextLost) return;
    const { gl } = this;
    this.updateMatrices();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(this.background[0], this.background[1], this.background[2], this.background[3]);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);

    if (this.hasFrame) {
      const { tanX, tanY } = frustumTangents(this.camera.fovDeg, this.aspect);
      gl.useProgram(this.splatProgram);
      gl.bindVertexArray(this.quadVao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.rgbTexture);
      gl.uniform1i(this.uniforms.uRgb, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
      gl.uniform1i(this.uniforms.uDepth, 1);
      gl.uniform2i(this.uniforms.uGrid, this.grid.cols, this.grid.rows);
      gl.uniform2f(this.uniforms.uTan, tanX, tanY);
      gl.uniform2f(this.uniforms.uNearFar, this.camera.near, this.camera.far);
      gl.uniform1i(this.uniforms.uEncoding, this.encoding === 'linear-gray8' ? 1 : 0);
      gl.uniformMatrix4fv(this.uniforms.uView, false, this.view);
      gl.uniformMatrix4fv(this.uniforms.uProj, false, this.proj);
      gl.uniform1f(this.uniforms.uFootprint, (2 * tanY * this.footprintScale) / this.grid.rows);
      gl.uniform1f(this.uniforms.uEdgeThreshold, this.edgeThreshold);
      gl.uniform1f(this.uniforms.uEdgeAlpha, this.edgeAlpha);
      gl.uniform1f(this.uniforms.uOpacity, this.opacity);
      gl.uniform1f(this.uniforms.uRadiusScale, 2.2);
      gl.uniform1f(this.uniforms.uFalloff, 2.0);
      const count = this.grid.cols * this.grid.rows;

      // Pass 1: opaque cores.
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      gl.uniform1f(this.uniforms.uCutoffLow, 0.5);
      gl.uniform1f(this.uniforms.uCutoffHigh, 2.0);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);

      // Pass 2: soft edges, premultiplied alpha, no depth write.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.uniform1f(this.uniforms.uCutoffLow, 0.01);
      gl.uniform1f(this.uniforms.uCutoffHigh, 0.5);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      gl.bindVertexArray(null);
    }

    if (this.showBox) {
      gl.useProgram(this.lineProgram);
      gl.bindVertexArray(this.boxVao);
      gl.uniformMatrix4fv(this.lineUniforms.uViewProj, false, this.viewProj);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.uniform4f(this.lineUniforms.uColor, 1, 1, 1, this.boxFaceAlpha);
      gl.drawElements(gl.TRIANGLES, this.boxFaceCount, gl.UNSIGNED_SHORT, this.boxFaceOffset);
      gl.disable(gl.DEPTH_TEST);
      gl.uniform4f(this.lineUniforms.uColor, 1, 1, 1, this.boxEdgeAlpha);
      gl.drawElements(gl.LINES, this.boxEdgeCount, gl.UNSIGNED_SHORT, 0);
      gl.enable(gl.DEPTH_TEST);
      gl.bindVertexArray(null);
    }

    gl.depthMask(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    const { gl } = this;
    gl.deleteTexture(this.rgbTexture);
    gl.deleteTexture(this.depthTexture);
    gl.deleteVertexArray(this.quadVao);
    gl.deleteVertexArray(this.boxVao);
    gl.deleteProgram(this.splatProgram);
    gl.deleteProgram(this.lineProgram);
    const lose = gl.getExtension('WEBGL_lose_context');
    lose?.loseContext();
  }
}
