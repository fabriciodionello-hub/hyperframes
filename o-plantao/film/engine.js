// Toon renderer for "O Plantão".
//
// One frame:
//   1. scene -> five 90° cube faces (front, up, down, left, right) packed in one atlas, three RGBA8 targets:
//        colour | octahedral normal + 16-bit log distance | object id + ink weight
//      Only the part of each face the lens can see is rasterised (scissor).
//   2. lens  -> resample the atlas through a stereographic fisheye via a lookup texture and mark every
//               discontinuity (id / plane distance / crease) with the line radius it wants
//   3. ink   -> grow the marks into anti-aliased black outlines (separable: rows, then columns),
//               then fog, grade, rain, flash, fade
//
// Colours are authored as final sRGB hex values, so colour management is off: what the
// palette says is what lands on screen (times the light).
import * as THREE from "three";

THREE.ColorManagement.enabled = false;

export const N_ZONES = 4;
export const N_LIGHTS = 4;

const D_NEAR = 0.04;
const D_FAR = 600.0;
const D_LOG = Math.log2(D_FAR / D_NEAR);
const PAD = 2; // guard band in pixels around every cube face

const GLSL_COMMON = /* glsl */ `
vec2 octEncode(vec3 n) {
  n /= (abs(n.x) + abs(n.y) + abs(n.z));
  vec2 s = vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
  vec2 e = n.z >= 0.0 ? n.xy : (1.0 - abs(n.yx)) * s;
  return e * 0.5 + 0.5;
}
vec3 octDecode(vec2 f) {
  f = f * 2.0 - 1.0;
  vec3 n = vec3(f.x, f.y, 1.0 - abs(f.x) - abs(f.y));
  float t = clamp(-n.z, 0.0, 1.0);
  n.x += n.x >= 0.0 ? -t : t;
  n.y += n.y >= 0.0 ? -t : t;
  return normalize(n);
}
float distOf(vec2 ba) {
  return ${D_NEAR.toFixed(3)} * exp2((ba.x * 255.0 + ba.y) / 255.0 * ${D_LOG.toFixed(6)});
}
`;

const SCENE_VERT = /* glsl */ `
precision highp float;
in vec3 position;
in vec3 normal;
in vec2 uv;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
out vec3 vWorldPos;
out vec3 vViewPos;
out vec3 vWorldNormal;
out vec2 vUv;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec4 mv = viewMatrix * wp;
  vWorldPos = wp.xyz;
  vViewPos = mv.xyz;
  vec3 viewNormal = normalize(normalMatrix * normal);
  vWorldNormal = normalize((vec4(viewNormal, 0.0) * viewMatrix).xyz);
  vUv = uv;
  gl_Position = projectionMatrix * mv;
}`;

const SCENE_FRAG = /* glsl */ `
precision highp float;
precision highp int;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oNormDist;
layout(location = 2) out vec4 oId;
in vec3 vWorldPos;
in vec3 vViewPos;
in vec3 vWorldNormal;
in vec2 vUv;

uniform vec3 uColor;
uniform vec3 uId;
uniform float uInk;
uniform float uShade;
uniform float uGlow;
uniform int uZone;
#ifdef USE_MAP
uniform sampler2D uMap;
#endif

uniform mat3 uRefRot;
uniform vec3 uAmbient[${N_ZONES}];
uniform vec3 uKeyDir[${N_ZONES}];
uniform vec3 uShadeTint[${N_ZONES}];
uniform vec4 uPLPos[${N_LIGHTS}];
uniform vec4 uPLCol[${N_LIGHTS}];
${GLSL_COMMON}
void main() {
  vec3 N = normalize(vWorldNormal);
  if (!gl_FrontFacing) N = -N;

  vec3 base = uColor;
#ifdef USE_MAP
  vec4 tex = texture(uMap, vUv);
  if (tex.a < 0.5) discard;
  base *= tex.rgb;
#endif

#ifdef UNLIT
  vec3 col = base * uGlow;
#else
  float ndl = dot(N, uKeyDir[uZone]);
  float lit = smoothstep(-0.015, 0.015, ndl - 0.08);
  vec3 shade = mix(vec3(1.0), uShadeTint[uZone], uShade);
  vec3 col = base * uAmbient[uZone] * mix(shade, vec3(1.0), lit);
  for (int i = 0; i < ${N_LIGHTS}; i++) {
    vec3 Lv = uPLPos[i].xyz - vWorldPos;
    float d = length(Lv);
    float a = clamp(1.0 - d / max(uPLPos[i].w, 1e-3), 0.0, 1.0);
    float nl = dot(N, Lv / max(d, 1e-4));
    // two flat bands of light instead of a smooth falloff
    float band = step(-0.05, nl) * (step(0.001, a) * 0.42 + step(0.38, a) * 0.58);
    col += (base * 0.75 + 0.25) * uPLCol[i].rgb * (uPLCol[i].a * band);
  }
#endif
  oColor = vec4(col, 1.0);
  float dist = length(vViewPos);
  float dv = clamp(log2(max(dist, ${D_NEAR.toFixed(3)}) / ${D_NEAR.toFixed(3)}) / ${D_LOG.toFixed(6)}, 0.0, 0.99999);
  float hi = floor(dv * 255.0);
  oNormDist = vec4(octEncode(uRefRot * N), hi / 255.0, dv * 255.0 - hi);
  oId = vec4(uId, uInk);
}`;

const FS_VERT = /* glsl */ `
precision highp float;
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// lens lookup: for every output pixel, the atlas uv it looks at (rg) and its ray direction (ba = dir.xy)
const LUT_FRAG = /* glsl */ `
precision highp float;
layout(location = 0) out vec4 oLut;
in vec2 vUv;
uniform float uF;
uniform float uAspect;
uniform float uFace;   // face size in px (without guard)
uniform float uTile;   // tile size in px (with guard)
uniform vec2 uAtlas;   // atlas size in px
uniform float uRect;   // 1 = one rectilinear view (long lenses), 0 = cube faces (wide lenses)
uniform vec2 uRectHalf;
uniform vec2 uRectSize;
void main() {
  vec2 p = (vUv - 0.5) * 2.0 * vec2(uAspect, 1.0);
  float r = length(p);
  float theta = 2.0 * atan(r / (2.0 * uF));
  vec2 az = r > 1e-6 ? p / r : vec2(0.0, 1.0);
  vec3 d = vec3(az * sin(theta), -cos(theta));
  vec2 px;
  if (uRect > 0.5) {
    vec2 s = d.xy / -d.z / uRectHalf;
    px = (0.5 + 0.5 * s) * uRectSize;
  } else {
    float ax = abs(d.x), ay = abs(d.y);
    vec2 s;
    vec2 tile;
    if (-d.z >= ax && -d.z >= ay) { s = d.xy / -d.z; tile = vec2(0.0, 0.0); }
    else if (ay >= ax) {
      if (d.y > 0.0) { s = vec2(d.x, d.z) / d.y; tile = vec2(1.0, 0.0); }
      else { s = vec2(d.x, -d.z) / -d.y; tile = vec2(2.0, 0.0); }
    } else {
      if (d.x < 0.0) { s = vec2(-d.z, d.y) / -d.x; tile = vec2(0.0, 1.0); }
      else { s = vec2(d.z, d.y) / d.x; tile = vec2(1.0, 1.0); }
    }
    px = tile * uTile + 0.5 * uTile + s * (0.5 * uFace);
  }
  oLut = vec4(px / uAtlas, d.xy);
}`;

const LENS_FRAG = /* glsl */ `
precision highp float;
precision highp int;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oEdge;
uniform sampler2D tLut;
uniform sampler2D tColor;
uniform sampler2D tND;
uniform sampler2D tId;
uniform vec2 uAtlas;
uniform vec2 uOutSize;
uniform float uInkRefDepth;
uniform float uInkMinScale;
uniform float uCrease;
${GLSL_COMMON}
vec3 dirOf(vec2 xy) {
  return vec3(xy, -sqrt(max(0.0, 1.0 - dot(xy, xy))));
}
void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  ivec2 lim = ivec2(uOutSize) - 1;
  vec4 l0 = texelFetch(tLut, ip, 0);
  ivec2 t0 = ivec2(l0.rg * uAtlas);
  vec3 col = texture(tColor, l0.rg).rgb;
  vec4 nd0 = texelFetch(tND, t0, 0);
  vec4 id0 = texelFetch(tId, t0, 0);
  float d0 = distOf(nd0.ba);
  vec3 n0 = octDecode(nd0.rg);
  vec3 P0 = dirOf(l0.ba) * d0;

  float edge = 0.0;
  for (int k = 0; k < 4; k++) {
    ivec2 o = k == 0 ? ivec2(1, 0) : k == 1 ? ivec2(-1, 0) : k == 2 ? ivec2(0, 1) : ivec2(0, -1);
    vec4 lk = texelFetch(tLut, clamp(ip + o, ivec2(0), lim), 0);
    ivec2 tk = ivec2(lk.rg * uAtlas);
    vec4 ndk = texelFetch(tND, tk, 0);
    vec4 idk = texelFetch(tId, tk, 0);
    float dk = distOf(ndk.ba);
    vec3 nk = octDecode(ndk.rg);
    vec3 Pk = dirOf(lk.ba) * dk;
    float dmin = min(d0, dk);
    bool idE = any(greaterThan(abs(id0.rgb - idk.rgb), vec3(0.002)));
    float planeD = max(abs(dot(n0, Pk - P0)), abs(dot(nk, P0 - Pk)));
    bool depthE = planeD > (0.02 + 0.03 * dmin);
    bool normE = dot(n0, nk) < 0.72;
    if (idE || depthE || normE) {
      float dd = d0 - dk;
      float ink;
      if (abs(dd) > 0.012 + 0.012 * dmin) ink = dd < 0.0 ? id0.a : idk.a;
      else ink = max(id0.a, idk.a);
      float w = ink * ((idE || depthE) ? 1.0 : uCrease);
      float scale = clamp(uInkRefDepth / max(dmin, 0.05), uInkMinScale, 1.0);
      edge = max(edge, w * scale);
    }
  }
  oColor = vec4(col, 1.0);
  // edge radius code | 16-bit distance passthrough for the fog
  oEdge = vec4(edge, 0.0, nd0.b, nd0.a);
}`;

// rows: for each pixel, the most influential mark on its own row (radius code, |dx|)
const INKH_FRAG = /* glsl */ `
precision highp float;
precision highp int;
layout(location = 0) out vec4 oRow;
uniform sampler2D tEdge;
uniform vec2 uOutSize;
uniform float uRmax;
#define R 5
void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  int lim = int(uOutSize.x) - 1;
  float best = -1.0;
  float bm = 0.0;
  float bx = 0.0;
  for (int x = -R; x <= R; x++) {
    float m = texelFetch(tEdge, ivec2(clamp(ip.x + x, 0, lim), ip.y), 0).r;
    float s = m * uRmax - abs(float(x));
    if (m > 0.0 && s > best) { best = s; bm = m; bx = abs(float(x)); }
  }
  oRow = vec4(bm, bx / float(R), 0.0, 1.0);
}`;

const INK_FRAG = /* glsl */ `
precision highp float;
precision highp int;
layout(location = 0) out vec4 oColor;
in vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tEdge;
uniform sampler2D tRow;
uniform vec2 uOutSize;
uniform float uRmax;
uniform vec3 uInkColor;
uniform float uAspect;

uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFogStart;

uniform vec3 uTint;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform vec3 uLift;

uniform vec4 uWash;      // rgb + amount: additive coloured wash (pulses)
uniform vec4 uFlash;     // rgb + amount: mix towards colour (defib flash)
uniform float uFade;     // 0..1 to black
uniform float uVignette;
uniform float uRain;     // 0..1
uniform float uTime;
uniform float uDim;      // dims the picture under the end card
${GLSL_COMMON}
#define R 5

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// streaks of rain: three layers of slanted dashes that fall with time
float rain(vec2 uv, float t) {
  float acc = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float scale = 14.0 + fi * 9.0;
    float speed = 2.6 + fi * 0.9;
    vec2 p = uv * vec2(uAspect, 1.0);
    p.x += p.y * 0.12;
    vec2 g = vec2(p.x * scale, p.y * (2.2 + fi * 0.6) + t * speed);
    vec2 cell = floor(g);
    vec2 f = fract(g);
    float h = hash(cell + fi * 17.0);
    float x0 = 0.15 + 0.7 * hash(cell * 1.7 + 3.1 + fi);
    float len = 0.25 + 0.45 * h;
    float y0 = hash(cell * 2.3 + 9.7) * (1.0 - len);
    float width = 0.05 + 0.03 * fi;
    float dx = abs(f.x - x0);
    float dy = f.y - y0;
    float inY = step(0.0, dy) * step(dy, len);
    float m = smoothstep(width, width * 0.4, dx) * inY * step(0.45, h);
    acc = max(acc, m * (0.55 - fi * 0.12));
  }
  return acc;
}

void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  int lim = int(uOutSize.y) - 1;
  vec3 col = texelFetch(tColor, ip, 0).rgb;
  float depth = distOf(texelFetch(tEdge, ip, 0).ba);

  float a = 0.0;
  for (int y = -R; y <= R; y++) {
    vec2 row = texelFetch(tRow, ivec2(ip.x, clamp(ip.y + y, 0, lim)), 0).rg;
    if (row.r > 0.0) {
      float dx = row.g * float(R);
      float d = sqrt(dx * dx + float(y * y));
      a = max(a, clamp(row.r * uRmax + 0.5 - d, 0.0, 1.0));
    }
  }
  col = mix(col, uInkColor, a);

  float fog = 1.0 - exp(-uFogDensity * max(depth - uFogStart, 0.0));
  col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));

  // grade
  col = col * uTint * uBrightness;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSaturation);
  col = (col - 0.5) * uContrast + 0.5;
  col = col + uLift * (1.0 - col);
  col += uWash.rgb * uWash.a;

  if (uRain > 0.0) {
    float rn = rain(vUv, uTime);
    col = mix(col, vec3(0.80, 0.88, 1.0), rn * uRain);
  }

  vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0) * 2.0;
  float v = smoothstep(0.6, 1.3, length(q));
  col *= 1.0 - uVignette * v;

  col = mix(col, uFlash.rgb, uFlash.a);
  col *= (1.0 - uDim);
  col *= (1.0 - uFade);
  oColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

let idCounter = 1;
function hashId(n) {
  // spread ids over rgb so neighbours never collide
  const r = (n * 97) % 251;
  const g = (n * 57 + 31) % 241;
  const b = (n * 151 + 7) % 239;
  return new THREE.Vector3((r + 2) / 255, (g + 2) / 255, (b + 2) / 255);
}

// cube faces as rotations of the POV camera, and their tile in the atlas
const FACES = [
  { name: "front", tile: [0, 0], q: new THREE.Quaternion() },
  { name: "up", tile: [1, 0], q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2) },
  { name: "down", tile: [2, 0], q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2) },
  { name: "left", tile: [0, 1], q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2) },
  { name: "right", tile: [1, 1], q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2) },
];

/**
 * opts.scale    output scale (1 = 1080x1920; 0.5 for quick previews)
 * opts.f        stereographic focal length in half-frame-heights (smaller = wider, curvier)
 * opts.face     cube face size in px at scale 1
 */
export function createEngine(canvas, opts = {}) {
  const scale = opts.scale ?? 1;
  const W = Math.round(1080 * scale);
  const H = Math.round(1920 * scale);
  const ASPECT = W / H;
  const FACE = Math.round((opts.face ?? 1536) * scale);
  const TILE = FACE + 2 * PAD;
  const ATLAS_W = TILE * 3;
  const ATLAS_H = TILE * 2;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.autoClear = true;
  renderer.setClearColor(0x000000, 1);

  const rt = (w, h, o = {}) =>
    new THREE.WebGLRenderTarget(w, h, {
      count: o.count ?? 1,
      type: o.type ?? THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: o.depth ?? false,
      generateMipmaps: false,
    });

  const gbuf = rt(ATLAS_W, ATLAS_H, { count: 3, depth: true });
  gbuf.textures[0].minFilter = THREE.LinearFilter;
  gbuf.textures[0].magFilter = THREE.LinearFilter;
  gbuf.scissorTest = true;
  const lutRT = rt(W, H, { type: THREE.FloatType });
  const lensRT = rt(W, H, { count: 2 });
  const rowRT = rt(W, H);

  // shared (global) uniforms: every scene material points at these same objects
  const zoneAmbient = [];
  const zoneKey = [];
  const zoneShade = [];
  for (let i = 0; i < N_ZONES; i++) {
    zoneAmbient.push(new THREE.Vector3(1, 1, 1));
    zoneKey.push(new THREE.Vector3(0.35, 0.85, 0.4).normalize());
    zoneShade.push(new THREE.Vector3(0.78, 0.82, 0.9));
  }
  const plPos = [];
  const plCol = [];
  for (let i = 0; i < N_LIGHTS; i++) {
    plPos.push(new THREE.Vector4(0, 0, 0, 0));
    plCol.push(new THREE.Vector4(0, 0, 0, 0));
  }
  const refRot = new THREE.Matrix3();
  const shared = {
    uRefRot: { value: refRot },
    uAmbient: { value: zoneAmbient },
    uKeyDir: { value: zoneKey },
    uShadeTint: { value: zoneShade },
    uPLPos: { value: plPos },
    uPLCol: { value: plCol },
  };

  /**
   * Flat toon material.
   *  color  hex | THREE.Color     flat colour
   *  unlit  boolean               screens, lamps: ignore the light
   *  map    THREE.Texture         optional texture (alpha < .5 is cut out)
   *  ink    0..1                  outline weight this surface owns (0 = no outline)
   *  shade  0..1                  how strongly it takes the shadow tone
   *  zone   0..3                  which ambient light it lives in
   *  group  any                   surfaces sharing a group never ink against each other
   */
  const groups = new Map();
  function mat(color, o = {}) {
    let id;
    if (o.group !== undefined) {
      if (!groups.has(o.group)) groups.set(o.group, idCounter++);
      id = groups.get(o.group);
    } else {
      id = idCounter++;
    }
    const defines = {};
    if (o.map) defines.USE_MAP = 1;
    if (o.unlit) defines.UNLIT = 1;
    const uniforms = {
      ...shared,
      uColor: { value: new THREE.Color(color) },
      uId: { value: hashId(id) },
      uInk: { value: o.ink ?? 1 },
      uShade: { value: o.shade ?? 1 },
      uGlow: { value: o.glow ?? 1 },
      uZone: { value: o.zone ?? 0 },
    };
    if (o.map) uniforms.uMap = { value: o.map };
    const m = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: SCENE_VERT,
      fragmentShader: SCENE_FRAG,
      side: o.side ?? THREE.FrontSide,
      defines,
      uniforms,
    });
    if (o.offset) {
      m.polygonOffset = true;
      m.polygonOffsetFactor = -o.offset;
      m.polygonOffsetUnits = -o.offset;
    }
    return m;
  }

  const fsGeo = new THREE.BufferGeometry();
  fsGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const pass = (fragmentShader, uniforms) => {
    const m = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FS_VERT,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
      uniforms,
    });
    const q = new THREE.Mesh(fsGeo, m);
    q.frustumCulled = false;
    const s = new THREE.Scene();
    s.add(q);
    return { scene: s, u: m.uniforms };
  };

  const outSize = new THREE.Vector2(W, H);
  const atlasSize = new THREE.Vector2(ATLAS_W, ATLAS_H);
  const rmax = { value: 4.4 * scale };
  const lut = pass(LUT_FRAG, {
    uF: { value: 0.7 },
    uAspect: { value: ASPECT },
    uFace: { value: FACE },
    uTile: { value: TILE },
    uAtlas: { value: atlasSize },
    uRect: { value: 0 },
    uRectHalf: { value: new THREE.Vector2(1, 1) },
    uRectSize: { value: new THREE.Vector2(1, 1) },
  });
  const lens = pass(LENS_FRAG, {
    tLut: { value: lutRT.texture },
    tColor: { value: gbuf.textures[0] },
    tND: { value: gbuf.textures[1] },
    tId: { value: gbuf.textures[2] },
    uAtlas: { value: atlasSize },
    uOutSize: { value: outSize },
    uInkRefDepth: { value: 1.25 },
    uInkMinScale: { value: 0.3 },
    uCrease: { value: 0.62 },
  });
  const inkH = pass(INKH_FRAG, {
    tEdge: { value: lensRT.textures[1] },
    uOutSize: { value: outSize },
    uRmax: rmax,
  });
  const ink = pass(INK_FRAG, {
    tColor: { value: lensRT.textures[0] },
    tEdge: { value: lensRT.textures[1] },
    tRow: { value: rowRT.texture },
    uOutSize: { value: outSize },
    uRmax: rmax,
    uInkColor: { value: new THREE.Color(0x111111) },
    uAspect: { value: ASPECT },
    uFogColor: { value: new THREE.Color(0x0e1a2b) },
    uFogDensity: { value: 0 },
    uFogStart: { value: 0 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uBrightness: { value: 1 },
    uContrast: { value: 1 },
    uSaturation: { value: 1 },
    uLift: { value: new THREE.Vector3(0, 0, 0) },
    uWash: { value: new THREE.Vector4(0, 0, 0, 0) },
    uFlash: { value: new THREE.Vector4(1, 1, 1, 0) },
    uFade: { value: 0 },
    uVignette: { value: 0.2 },
    uRain: { value: 0 },
    uTime: { value: 0 },
    uDim: { value: 0 },
  });

  // The POV: position + orientation of the viewer. Set these, the cube cameras follow.
  const pov = new THREE.PerspectiveCamera(90, 1, 0.05, 400);
  pov.rotation.order = "YXZ";
  const faceCam = new THREE.PerspectiveCamera(90, 1, 0.05, 400);
  const RECT_H = ATLAS_H;
  const RECT_W = Math.round(RECT_H * ASPECT);

  // which rectangle of each face the lens can actually see
  const boxes = FACES.map(() => null);
  let lensF = -1;
  let rectMode = false;
  /**
   * Set the lens. f is the stereographic focal length in half-frame-heights:
   * 0.66 is the wide POV fisheye, 1.5+ is a tight close-up. Wide lenses are assembled from cube
   * faces; long lenses fit inside one rectilinear view, which keeps close-ups sharp.
   */
  function setLens(f) {
    if (Math.abs(f - lensF) < 1e-6) return;
    lensF = f;
    lut.u.uF.value = f;
    lens.u.uInkRefDepth.value = 1.9 * f;
    const rCorner = Math.hypot(ASPECT, 1);
    const thetaCorner = 2 * Math.atan(rCorner / (2 * f));
    rectMode = f >= 0.9;
    lut.u.uRect.value = rectMode ? 1 : 0;
    if (rectMode) {
      const halfH = (Math.tan(thetaCorner) / rCorner) * 1.015;
      lut.u.uRectHalf.value.set(halfH * ASPECT, halfH);
      lut.u.uRectSize.value.set(RECT_W, RECT_H);
      faceCam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(halfH));
      faceCam.aspect = RECT_W / RECT_H;
      faceCam.updateProjectionMatrix();
      boxes[0] = [0, 0, RECT_W, RECT_H];
      for (let i = 1; i < FACES.length; i++) boxes[i] = null;
    } else {
      faceCam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(TILE / FACE));
      faceCam.aspect = 1;
      faceCam.updateProjectionMatrix();
      const bb = FACES.map(() => [Infinity, Infinity, -Infinity, -Infinity]);
      const stepPx = 6;
      for (let y = 0; y <= H; y += stepPx) {
        for (let x = 0; x <= W; x += stepPx) {
          const px = (x / W - 0.5) * 2 * ASPECT;
          const py = (y / H - 0.5) * 2;
          const r = Math.hypot(px, py);
          const theta = 2 * Math.atan(r / (2 * f));
          const sn = r > 1e-6 ? Math.sin(theta) / r : 0;
          const d = [px * sn, py * sn, -Math.cos(theta)];
          const ax = Math.abs(d[0]);
          const ay = Math.abs(d[1]);
          let fi, sx, sy;
          if (-d[2] >= ax && -d[2] >= ay) { fi = 0; sx = d[0] / -d[2]; sy = d[1] / -d[2]; }
          else if (ay >= ax) {
            if (d[1] > 0) { fi = 1; sx = d[0] / d[1]; sy = d[2] / d[1]; }
            else { fi = 2; sx = d[0] / -d[1]; sy = -d[2] / -d[1]; }
          } else if (d[0] < 0) { fi = 3; sx = -d[2] / -d[0]; sy = d[1] / -d[0]; }
          else { fi = 4; sx = d[2] / d[0]; sy = d[1] / d[0]; }
          const tx = TILE / 2 + sx * (FACE / 2);
          const ty = TILE / 2 + sy * (FACE / 2);
          const b = bb[fi];
          b[0] = Math.min(b[0], tx); b[1] = Math.min(b[1], ty);
          b[2] = Math.max(b[2], tx); b[3] = Math.max(b[3], ty);
        }
      }
      const m = stepPx + 4;
      FACES.forEach((face, i) => {
        const b = bb[i];
        if (b[0] === Infinity) { boxes[i] = null; return; }
        const x0 = Math.max(0, Math.floor(b[0] - m));
        const y0 = Math.max(0, Math.floor(b[1] - m));
        const x1 = Math.min(TILE, Math.ceil(b[2] + m));
        const y1 = Math.min(TILE, Math.ceil(b[3] + m));
        boxes[i] = [x0, y0, x1 - x0, y1 - y0];
      });
    }
    renderer.setRenderTarget(lutRT);
    renderer.render(lut.scene, fsCam);
    renderer.setRenderTarget(null);
  }
  setLens(opts.f ?? 0.66);

  const _m4 = new THREE.Matrix4();
  function render(scene) {
    pov.updateMatrixWorld(true);
    _m4.copy(pov.matrixWorld).invert();
    refRot.setFromMatrix4(_m4);
    faceCam.position.copy(pov.position);
    for (let i = 0; i < FACES.length; i++) {
      const box = boxes[i];
      if (!box) continue;
      const face = FACES[i];
      faceCam.quaternion.copy(pov.quaternion).multiply(face.q);
      if (rectMode) {
        gbuf.viewport.set(0, 0, RECT_W, RECT_H);
        gbuf.scissor.set(0, 0, RECT_W, RECT_H);
      } else {
        const ox = face.tile[0] * TILE;
        const oy = face.tile[1] * TILE;
        gbuf.viewport.set(ox, oy, TILE, TILE);
        gbuf.scissor.set(ox + box[0], oy + box[1], box[2], box[3]);
      }
      renderer.setRenderTarget(gbuf);
      renderer.render(scene, faceCam);
    }
    renderer.setRenderTarget(lensRT);
    renderer.render(lens.scene, fsCam);
    renderer.setRenderTarget(rowRT);
    renderer.render(inkH.scene, fsCam);
    renderer.setRenderTarget(null);
    renderer.render(ink.scene, fsCam);
  }

  function coverage() {
    let px = 0;
    for (const b of boxes) if (b) px += b[2] * b[3];
    return { faces: boxes, megapixels: px / 1e6 };
  }

  return {
    renderer,
    pov,
    mat,
    render,
    setLens,
    coverage,
    post: ink.u,
    lens: lens.u,
    rmax,
    scale,
    W,
    H,
    zones: { ambient: zoneAmbient, key: zoneKey, shade: zoneShade },
    lights: { pos: plPos, col: plCol },
  };
}
