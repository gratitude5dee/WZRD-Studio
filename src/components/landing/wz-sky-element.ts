const ELEMENT_NAME = 'wz-sky';

const VERTEX_SHADER = `
attribute vec2 p;
void main() {
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uProgress;
uniform float uRays;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amplitude = 0.56;
  mat2 rotation = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    sum += amplitude * noise(p);
    p = rotation * p * 2.03 + 9.7;
    amplitude *= 0.52;
  }
  return sum;
}

float rayStrength(vec2 source, vec2 direction, vec2 coordinate, float seedA, float seedB, float speed) {
  vec2 toCoordinate = coordinate - source;
  float distanceToSource = length(toCoordinate);
  vec2 normalizedDirection = toCoordinate / max(distanceToSource, 0.0001);
  float cosine = dot(normalizedDirection, direction);
  float distorted = cosine + 0.04 * sin(uTime * 1.4 + distanceToSource * 3.0);
  float spread = pow(max(distorted, 0.0), 2.4);
  float lengthFalloff = clamp((1.7 - distanceToSource) / 1.7, 0.0, 1.0);
  float base = clamp(
    (0.45 + 0.15 * sin(distorted * seedA + uTime * speed)) +
    (0.3 + 0.2 * cos(-distorted * seedB + uTime * speed)),
    0.0,
    1.0
  );
  return base * lengthFalloff * spread;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float journey = clamp(uProgress, 0.0, 1.0);
  vec2 drift = vec2(-journey * 0.46 - uTime * 0.006, journey * 0.11 + uTime * 0.0018);

  float horizon = smoothstep(0.0, 0.72, uv.y);
  vec3 sky = mix(vec3(0.015, 0.045, 0.12), vec3(0.08, 0.30, 0.62), horizon);

  float fieldA = fbm(uv * vec2(2.1, 3.2) + drift);
  float fieldB = fbm(uv * vec2(4.8, 2.3) - drift * 0.65);
  float cloud = smoothstep(0.42, 0.78, fieldA * 0.72 + fieldB * 0.38 + uv.y * 0.12);
  float mist = smoothstep(0.18, 0.92, fbm(uv * vec2(1.15, 2.1) + drift * 0.4));

  vec3 cloudColor = mix(
    vec3(0.21, 0.36, 0.56),
    vec3(0.86, 0.93, 1.0),
    smoothstep(0.42, 1.0, fieldB + uv.y * 0.24)
  );
  sky = mix(sky, cloudColor, cloud * (0.78 - journey * 0.22));
  sky += mist * 0.055 * vec3(0.42, 0.65, 1.0);

  vec2 sunPosition = vec2(0.73, 0.64);
  float sun = smoothstep(0.28, 0.0, distance(uv, sunPosition));
  sky += sun * vec3(0.3, 0.42, 0.56) * (1.0 - journey * 0.58);

  vec2 aspect = vec2(uRes.x / uRes.y, 1.0);
  vec2 rayCoordinate = uv * aspect;
  vec2 raySource = sunPosition * aspect;
  vec2 rayDirection = normalize(vec2(-0.34, -1.0));
  float rayA = rayStrength(raySource, rayDirection, rayCoordinate, 36.2214, 21.11349, 1.1);
  float rayB = rayStrength(raySource, rayDirection, rayCoordinate, 22.3991, 18.0234, 0.8);
  float rays = (rayA * 0.5 + rayB * 0.4) * uRays * (1.0 - journey * 0.55);
  sky += rays * vec3(0.72, 0.86, 1.0) * (0.55 + 0.45 * cloud);

  sky += (hash(gl_FragCoord.xy + uTime) * 2.0 - 1.0) * 0.012;
  float veil = smoothstep(0.52, 1.0, journey);
  sky = mix(sky, vec3(0.02, 0.035, 0.07), veil * 0.84);
  sky *= 0.85 + 0.15 * smoothstep(0.0, 0.45, uv.y);
  gl_FragColor = vec4(sky, 1.0);
}`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'Unknown shader error';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext) {
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to create WebGL program');
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'Unable to link WebGL program');
  }
  return program;
}

class WzSkyElement extends HTMLElement {
  static observedAttributes = ['mode', 'rays'];

  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private animationFrame = 0;
  private releaseTimer = 0;
  private visible = false;
  private startedAt = performance.now();
  private progressValue = 0;
  private contextLost = false;
  private intentionallyReleased = false;
  private uniforms = new Map<string, WebGLUniformLocation | null>();

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
      canvas { display: block; width: 100%; height: 100%; }
    `;
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    shadow.append(style, this.canvas);
  }

  get mode() {
    return this.getAttribute('mode') === 'off' ? 'off' : 'full';
  }

  get progress() {
    return this.progressValue;
  }

  set progress(value: number) {
    this.progressValue = Math.max(0, Math.min(1, Number(value) || 0));
    if (!this.animationFrame) this.draw(performance.now());
  }

  connectedCallback() {
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this);
    } else {
      window.addEventListener('resize', this.onWindowResize);
    }

    if (typeof IntersectionObserver !== 'undefined') {
      this.intersectionObserver = new IntersectionObserver(
        entries => {
          this.visible = entries.some(entry => entry.isIntersecting);
          if (this.visible) {
            window.clearTimeout(this.releaseTimer);
            this.releaseTimer = 0;
            if (this.intentionallyReleased) this.recreateAfterRelease();
          } else {
            this.scheduleRelease();
          }
          this.syncAnimation();
        },
        { rootMargin: '120px' },
      );
      this.intersectionObserver.observe(this);
    } else {
      this.visible = true;
    }

    document.addEventListener('visibilitychange', this.syncAnimation);
    this.initialize();
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    window.clearTimeout(this.releaseTimer);
    this.releaseTimer = 0;
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    window.removeEventListener('resize', this.onWindowResize);
    document.removeEventListener('visibilitychange', this.syncAnimation);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
    this.program = null;
  }

  attributeChangedCallback() {
    this.syncAnimation();
  }

  private initialize() {
    try {
      this.style.display = '';
      this.startedAt = performance.now();
      this.uniforms.clear();
      const gl = this.canvas.getContext('webgl', {
        alpha: true,
        antialias: false,
        depth: false,
        premultipliedAlpha: false,
        stencil: false,
      });
      if (!gl) throw new Error('WebGL unavailable');
      this.gl = gl;
      this.program = createProgram(gl);
      gl.useProgram(this.program);

      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(this.program, 'p');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      this.resize();
      this.draw(performance.now());
      this.syncAnimation();
      this.dispatchEvent(new CustomEvent('wz-sky-ready', { bubbles: true }));
    } catch {
      this.dispatchEvent(new CustomEvent('wz-sky-error', { bubbles: true }));
      this.style.display = 'none';
    }
  }

  private resize() {
    if (!this.gl) return;
    const width = Math.max(1, this.clientWidth);
    const height = Math.max(1, this.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    const nextWidth = Math.round(width * dpr);
    const nextHeight = Math.round(height * dpr);
    if (this.canvas.width !== nextWidth) this.canvas.width = nextWidth;
    if (this.canvas.height !== nextHeight) this.canvas.height = nextHeight;
    this.gl.viewport(0, 0, nextWidth, nextHeight);
    this.draw(performance.now());
  }

  private onWindowResize = () => this.resize();

  private scheduleRelease() {
    window.clearTimeout(this.releaseTimer);
    if (!this.gl || this.contextLost) return;
    this.releaseTimer = window.setTimeout(() => {
      this.releaseTimer = 0;
      if (this.visible || !this.gl || this.contextLost) return;
      const extension = this.gl.getExtension('WEBGL_lose_context');
      if (!extension) return;
      this.intentionallyReleased = true;
      extension.loseContext();
      this.gl = null;
      this.program = null;
      this.uniforms.clear();
      this.contextLost = true;
    }, 5000);
  }

  private recreateAfterRelease() {
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    const nextCanvas = document.createElement('canvas');
    nextCanvas.setAttribute('aria-hidden', 'true');
    this.canvas.replaceWith(nextCanvas);
    this.canvas = nextCanvas;
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    this.gl = null;
    this.program = null;
    this.contextLost = false;
    this.intentionallyReleased = false;
    this.initialize();
  }

  private syncAnimation = () => {
    const shouldRun = this.visible && !document.hidden && this.mode !== 'off' && !this.contextLost;
    if (!shouldRun) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
      this.draw(performance.now());
      return;
    }
    if (!this.animationFrame) this.animationFrame = requestAnimationFrame(this.tick);
  };

  private tick = (timestamp: number) => {
    this.animationFrame = 0;
    if (!this.visible || document.hidden || this.mode === 'off' || this.contextLost) return;
    this.draw(timestamp);
    this.animationFrame = requestAnimationFrame(this.tick);
  };

  private uniform(name: string) {
    if (!this.uniforms.has(name)) {
      this.uniforms.set(name, this.gl && this.program ? this.gl.getUniformLocation(this.program, name) : null);
    }
    return this.uniforms.get(name) ?? null;
  }

  private draw(timestamp: number) {
    const gl = this.gl;
    if (!gl || !this.program || this.contextLost || this.mode === 'off') return;
    gl.useProgram(this.program);
    gl.uniform2f(this.uniform('uRes'), this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uniform('uTime'), (timestamp - this.startedAt) * 0.001);
    gl.uniform1f(this.uniform('uProgress'), this.progressValue);
    gl.uniform1f(this.uniform('uRays'), Number.parseFloat(this.getAttribute('rays') ?? '0.9') || 0.9);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private onContextLost = (event: Event) => {
    event.preventDefault();
    this.contextLost = true;
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    if (!this.intentionallyReleased) {
      this.dispatchEvent(new CustomEvent('wz-sky-error', { bubbles: true }));
    }
  };

  private onContextRestored = () => {
    if (this.intentionallyReleased) return;
    this.contextLost = false;
    this.uniforms.clear();
    this.initialize();
  };
}

export function registerWzSkyElement() {
  if (!customElements.get(ELEMENT_NAME)) {
    customElements.define(ELEMENT_NAME, WzSkyElement);
  }
}
