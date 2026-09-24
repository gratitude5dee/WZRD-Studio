// GLSL ES 3.00 sources for the dependency-free video-splat renderer.

export const SPLAT_VERTEX_SHADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

in vec2 aCorner;

uniform sampler2D uRgb;
uniform sampler2D uDepth;
uniform ivec2 uGrid;
uniform vec2 uTan;          // tan(fov/2) * aspect, tan(fov/2)
uniform vec2 uNearFar;
uniform int uEncoding;      // 0 = inverse-gray8, 1 = linear-gray8
uniform mat4 uView;
uniform mat4 uProj;
uniform float uFootprint;   // 2 * tanY * scale / rows  (radius per unit depth)
uniform float uEdgeThreshold;
uniform float uEdgeAlpha;
uniform float uOpacity;
uniform float uRadiusScale; // quad half-extent in sigma units

out vec3 vColor;
out float vAlpha;
out vec2 vCorner;

float decodeDepth(float g) {
  g = clamp(g, 0.0, 1.0);
  if (uEncoding == 1) {
    return uNearFar.x + (1.0 - g) * (uNearFar.y - uNearFar.x);
  }
  return 1.0 / ((1.0 / uNearFar.x) * g + (1.0 / uNearFar.y) * (1.0 - g));
}

float depthAt(ivec2 cell) {
  cell = clamp(cell, ivec2(0), uGrid - ivec2(1));
  vec2 uv = (vec2(cell) + 0.5) / vec2(uGrid);
  return decodeDepth(dot(texture(uDepth, uv).rgb, vec3(0.2126, 0.7152, 0.0722)));
}

void main() {
  int id = gl_InstanceID;
  ivec2 cell = ivec2(id % uGrid.x, id / uGrid.x);
  vec2 uv = (vec2(cell) + 0.5) / vec2(uGrid);
  float z = depthAt(cell);
  vec3 p = vec3((uv.x * 2.0 - 1.0) * uTan.x * z, (1.0 - uv.y * 2.0) * uTan.y * z, -z);

  float grad = max(
    max(abs(depthAt(cell + ivec2(-1, 0)) - z), abs(depthAt(cell + ivec2(1, 0)) - z)),
    max(abs(depthAt(cell + ivec2(0, -1)) - z), abs(depthAt(cell + ivec2(0, 1)) - z))
  ) / z;
  float alpha = grad > uEdgeThreshold ? uEdgeAlpha : 1.0;

  vec4 viewPos = uView * vec4(p, 1.0);
  float radius = z * uFootprint * uRadiusScale;
  viewPos.xy += aCorner * radius;
  gl_Position = uProj * viewPos;

  vColor = texture(uRgb, uv).rgb;
  vAlpha = alpha * uOpacity;
  vCorner = aCorner;
}
`;

export const SPLAT_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec3 vColor;
in float vAlpha;
in vec2 vCorner;

uniform float uCutoffLow;   // discard below
uniform float uCutoffHigh;  // discard at or above (edge pass) — set > 1 to disable
uniform float uFalloff;     // gaussian sharpness in sigma units

out vec4 fragColor;

void main() {
  float r2 = dot(vCorner, vCorner);
  float w = exp(-uFalloff * r2);
  float a = vAlpha * w;
  if (a < uCutoffLow || a >= uCutoffHigh) discard;
  fragColor = vec4(vColor * a, a);
}
`;

export const LINE_VERTEX_SHADER = /* glsl */ `#version 300 es
precision highp float;
in vec3 aPosition;
uniform mat4 uViewProj;
void main() {
  gl_Position = uViewProj * vec4(aPosition, 1.0);
}
`;

export const LINE_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 fragColor;
void main() {
  fragColor = vec4(uColor.rgb * uColor.a, uColor.a);
}
`;
