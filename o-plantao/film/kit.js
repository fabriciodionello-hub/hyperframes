// Modelling kit: cached primitives, quick mesh placement, and canvas-drawn textures
// (signs, labels, screens). Everything in the film is built from these.
import * as THREE from "three";

export const PAL = {
  ink: 0x111111,
  skinA: 0xc68642,
  skinB: 0x8d5524,
  skinC: 0xe0ac69,
  scrub: 0x5fb3a6,
  scrubDark: 0x4a968b,
  glove: 0x3a7bd5,
  gloveCuff: 0x5a93e0,
  coat: 0xf4f4f4,
  glasses: 0xd62828,
  wall: 0xdde3e6,
  tile: 0xa9c6c9,
  floor: 0xb7bdb8,
  ceiling: 0xeef2f4,
  radio: 0x3fe0ff,
  monitorLine: 0x39ff7a,
  monitorBg: 0x0b1a12,
  navy: 0x1f2f5c,
  red: 0xd62828,
  yellow: 0xf5c518,
};

export function createKit(engine) {
  const { mat } = engine;
  const cache = new Map();
  const g = (key, make) => {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key);
  };

  const geo = {
    box: (w, h, d) => g(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d)),
    sph: (r, ws = 24, hs = 16) => g(`s${r}|${ws}|${hs}`, () => new THREE.SphereGeometry(r, ws, hs)),
    hemi: (r, theta = Math.PI / 2, ws = 24, hs = 12) =>
      g(`h${r}|${theta}|${ws}|${hs}`, () => new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, theta)),
    cyl: (rt, rb, h, seg = 20, open = false) =>
      g(`c${rt}|${rb}|${h}|${seg}|${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)),
    cap: (r, len, seg = 16) => g(`k${r}|${len}|${seg}`, () => new THREE.CapsuleGeometry(r, len, 6, seg)),
    plane: (w, h, sx = 1, sy = 1) => g(`p${w}|${h}|${sx}|${sy}`, () => new THREE.PlaneGeometry(w, h, sx, sy)),
    circle: (r, seg = 32) => g(`o${r}|${seg}`, () => new THREE.CircleGeometry(r, seg)),
    torus: (r, tube, arc = Math.PI * 2, seg = 28) =>
      g(`t${r}|${tube}|${arc}|${seg}`, () => new THREE.TorusGeometry(r, tube, 8, seg, arc)),
    cone: (r, h, seg = 20) => g(`n${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  };

  /** Place a mesh. p = [x,y,z], r = [rx,ry,rz] (radians), s = number | [sx,sy,sz] */
  function add(parent, geometry, material, p, r, s) {
    const m = new THREE.Mesh(geometry, material);
    if (p) m.position.set(p[0], p[1], p[2]);
    if (r) m.rotation.set(r[0], r[1], r[2]);
    if (s !== undefined) {
      if (typeof s === "number") m.scale.setScalar(s);
      else m.scale.set(s[0], s[1], s[2]);
    }
    if (parent) parent.add(m);
    return m;
  }

  function grp(parent, p, r) {
    const o = new THREE.Group();
    if (p) o.position.set(p[0], p[1], p[2]);
    if (r) o.rotation.set(r[0], r[1], r[2]);
    if (parent) parent.add(o);
    return o;
  }

  /** A capsule/cylinder stretched between two points (limbs, cables, rails). */
  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  function rod(parent, a, b, radius, material, round = true) {
    _a.set(a[0], a[1], a[2]);
    _b.set(b[0], b[1], b[2]);
    const len = _a.distanceTo(_b);
    const m = new THREE.Mesh(round ? new THREE.CapsuleGeometry(radius, len, 4, 12) : new THREE.CylinderGeometry(radius, radius, len, 12), material);
    m.position.copy(_a).add(_b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(_up, _b.clone().sub(_a).normalize());
    if (parent) parent.add(m);
    return m;
  }

  /** Re-aim an existing unit-length capsule between two points (animated limbs). */
  function aim(mesh, a, b) {
    _a.copy(a);
    _b.copy(b);
    mesh.position.copy(_a).add(_b).multiplyScalar(0.5);
    const d = _b.sub(_a);
    const len = d.length();
    mesh.quaternion.setFromUnitVectors(_up, d.normalize());
    return len;
  }

  /** A smooth tube through points (cables, IV lines, stethoscope). */
  function tube(parent, pts, radius, material, seg = 40) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, radius, 8, false), material);
    if (parent) parent.add(m);
    return m;
  }

  // ---------- canvas textures ----------
  function finish(canvas) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.NoColorSpace;
    tex.anisotropy = 8;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  function canvas(w, h, draw) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    draw(ctx, w, h);
    return c;
  }

  /** Draw once, get a texture. */
  function paint(w, h, draw) {
    return finish(canvas(w, h, draw));
  }

  /** A canvas you redraw every frame (monitor, phone). Call .update() after drawing. */
  function live(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.NoColorSpace;
    tex.anisotropy = 4;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return { canvas: c, ctx: c.getContext("2d"), tex, update: () => (tex.needsUpdate = true) };
  }

  /** A flat sign: text on a coloured board. Returns a texture. */
  function sign(text, o = {}) {
    const w = o.w ?? 512;
    const h = o.h ?? 128;
    return paint(w, h, (ctx) => {
      ctx.fillStyle = o.bg ?? "#ffffff";
      ctx.fillRect(0, 0, w, h);
      if (o.border) {
        ctx.strokeStyle = o.border;
        ctx.lineWidth = o.borderWidth ?? 10;
        ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
      }
      ctx.fillStyle = o.fg ?? "#111111";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let size = o.size ?? Math.round(h * 0.6);
      const weight = o.weight ?? 900;
      const lines = String(text).split("\n");
      const fit = () => {
        ctx.font = `${weight} ${size}px Montserrat, sans-serif`;
        return Math.max(...lines.map((l) => ctx.measureText(l).width));
      };
      while (fit() > w * 0.9 && size > 8) size -= 2;
      const lh = size * 1.12;
      lines.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * lh + size * 0.04));
    });
  }

  return { mat, geo, add, grp, rod, aim, tube, paint, live, sign, canvas };
}
