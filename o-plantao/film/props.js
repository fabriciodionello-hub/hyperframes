// Hospital furniture and equipment. Every builder returns a group standing on y = 0 at its own origin.
import * as THREE from "three";
import { PAL } from "./kit.js";

/** A wheeled stretcher (maca). Long axis = local X, head at +X. */
export function makeStretcher(kit, o = {}) {
  const { mat, geo, add, grp } = kit;
  const zone = o.zone ?? 0;
  const g = grp(null);
  const tag = "stretcher#" + (makeStretcher.n = (makeStretcher.n || 0) + 1);
  const metal = mat(0xc9d1d9, { zone, group: tag + "m", ink: 0.8 });
  const dark = mat(0x3a3f48, { zone, ink: 0.6 });
  const pad = mat(o.pad ?? 0x8fc7e8, { zone, group: tag + "p", shade: 0.6 });
  add(g, geo.box(1.95, 0.07, 0.68), metal, [0, 0.62, 0]);
  add(g, geo.box(1.9, 0.11, 0.64), pad, [0, 0.71, 0]);
  if (o.pillow !== false) add(g, geo.sph(1, 14, 10), mat(0xf4f6f8, { zone, shade: 0.5 }), [0.74, 0.8, 0], null, [0.19, 0.07, 0.26]);
  for (const sx of [-0.8, 0.8])
    for (const sz of [-0.28, 0.28]) {
      kit.rod(g, [sx, 0.6, sz], [sx, 0.12, sz], 0.022, metal, false);
      add(g, geo.cyl(0.075, 0.075, 0.045, 14), dark, [sx, 0.075, sz], [Math.PI / 2, 0, 0]);
    }
  kit.rod(g, [-0.8, 0.3, -0.28], [0.8, 0.3, -0.28], 0.018, metal, false);
  kit.rod(g, [-0.8, 0.3, 0.28], [0.8, 0.3, 0.28], 0.018, metal, false);
  // push bar at the foot end (-X)
  kit.rod(g, [-1.0, 0.64, -0.3], [-1.08, 0.98, -0.3], 0.02, metal, false);
  kit.rod(g, [-1.0, 0.64, 0.3], [-1.08, 0.98, 0.3], 0.02, metal, false);
  kit.rod(g, [-1.08, 0.98, -0.32], [-1.08, 0.98, 0.32], 0.024, metal, true);
  if (o.rails) {
    for (const sz of [-0.34, 0.34]) {
      kit.rod(g, [-0.5, 0.95, sz], [0.6, 0.95, sz], 0.016, metal, true);
      for (const sx of [-0.5, 0.05, 0.6]) kit.rod(g, [sx, 0.66, sz], [sx, 0.95, sz], 0.014, metal, false);
    }
  }
  return g;
}

/** Bedside monitor on a wall arm. Screen faces local +Z. Returns { group, screen } (screen is a live canvas). */
export function makeMonitor(kit, o = {}) {
  const { mat, geo, add, grp } = kit;
  const g = grp(null);
  const w = o.w ?? 0.78;
  const h = o.h ?? 0.56;
  const shell = mat(0xdfe5ea, { group: "monitorShell", ink: 0.85 });
  add(g, geo.box(w + 0.09, h + 0.09, 0.14), shell, [0, 0, -0.075]);
  const screen = kit.live(624, 448);
  add(g, geo.plane(w, h), mat(0xffffff, { unlit: true, map: screen.tex, group: "monitorShell" }), [0, 0, 0.002]);
  // knob + handle
  add(g, geo.cyl(0.03, 0.03, 0.03, 12), mat(0x8c96a0, { ink: 0.5 }), [w / 2 - 0.05, -h / 2 - 0.01, 0.0], [Math.PI / 2, 0, 0]);
  // arm back to the wall
  const arm = mat(0x9aa4ad, { ink: 0.6 });
  kit.rod(g, [0, 0, -0.14], [0, 0.05, -0.5], 0.03, arm, false);
  return { group: g, screen };
}

/** Crash cart: red cabinet on wheels with the defibrillator on top. Front faces local +Z. */
export function makeCrashCart(kit) {
  const { mat, geo, add, grp } = kit;
  const g = grp(null);
  const red = mat(PAL.red, { group: "cart", ink: 0.85 });
  add(g, geo.box(0.62, 0.78, 0.46), red, [0, 0.52, 0]);
  const drawer = mat(0xb81f1f, { ink: 0.45 });
  const handle = mat(0xe9edf0, { ink: 0 });
  for (let i = 0; i < 4; i++) {
    add(g, geo.box(0.54, 0.15, 0.012), drawer, [0, 0.24 + i * 0.185, 0.236]);
    add(g, geo.box(0.2, 0.022, 0.02), handle, [0, 0.27 + i * 0.185, 0.25]);
  }
  add(g, geo.box(0.66, 0.035, 0.5), mat(0xdfe5ea, { ink: 0.7 }), [0, 0.93, 0]);
  for (const sx of [-0.26, 0.26]) for (const sz of [-0.18, 0.18]) add(g, geo.cyl(0.05, 0.05, 0.04, 12), mat(0x30343b, { ink: 0.5 }), [sx, 0.05, sz], [Math.PI / 2, 0, 0]);
  // defibrillator unit
  const unit = mat(0xf5c518, { group: "defib", ink: 0.8 });
  add(g, geo.box(0.42, 0.26, 0.3), unit, [0, 1.08, 0]);
  add(g, geo.box(0.2, 0.13, 0.01), mat(0x0b1a12, { unlit: true, ink: 0.4 }), [-0.07, 1.11, 0.153]);
  add(g, geo.cyl(0.035, 0.035, 0.02, 14), mat(PAL.red, { ink: 0.4 }), [0.13, 1.13, 0.155], [Math.PI / 2, 0, 0]);
  add(g, geo.cyl(0.022, 0.022, 0.02, 12), mat(0x2f9e4f, { ink: 0.3 }), [0.13, 1.04, 0.155], [Math.PI / 2, 0, 0]);
  return g;
}

/** One defibrillator paddle: handle up the local +Y, plate at y = 0 facing -Y. */
export function makePaddle(kit) {
  const { mat, geo, add, grp } = kit;
  const g = grp(null);
  add(g, geo.box(0.1, 0.022, 0.13), mat(0xc9d1d9, { ink: 0.7 }), [0, 0.011, 0]);
  add(g, geo.box(0.085, 0.05, 0.11), mat(0x23262d, { group: "paddle", ink: 0.8 }), [0, 0.047, 0]);
  add(g, geo.cap(0.021, 0.085, 10), mat(0x23262d, { group: "paddle", ink: 0.8 }), [0, 0.1, 0], [Math.PI / 2, 0, 0]);
  add(g, geo.cyl(0.012, 0.012, 0.012, 10), mat(PAL.red, { ink: 0.3 }), [0, 0.125, 0.045]);
  return g;
}

/** IV pole with a bag. */
export function makeIvPole(kit) {
  const { mat, geo, add, grp } = kit;
  const g = grp(null);
  const metal = mat(0xc9d1d9, { ink: 0.7 });
  kit.rod(g, [0, 0.05, 0], [0, 1.95, 0], 0.016, metal, false);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    kit.rod(g, [0, 0.07, 0], [Math.cos(a) * 0.26, 0.04, Math.sin(a) * 0.26], 0.014, metal, true);
  }
  kit.rod(g, [-0.14, 1.93, 0], [0.14, 1.93, 0], 0.012, metal, true);
  add(g, geo.sph(1, 12, 10), mat(0xe3f1f5, { ink: 0.7, shade: 0.4 }), [0.12, 1.7, 0], null, [0.07, 0.13, 0.035]);
  add(g, geo.box(0.07, 0.05, 0.005), mat(0x3d8fd9, { ink: 0 }), [0.12, 1.72, 0.036]);
  return g;
}

/** Wall clock showing a fixed time (digital, red digits). Faces local +Z. */
export function makeClock(kit, text) {
  const { mat, geo, add, grp } = kit;
  const g = grp(null);
  add(g, geo.box(0.62, 0.26, 0.06), mat(0x23262d, { group: "clock", ink: 0.85 }), [0, 0, -0.03]);
  const tex = kit.paint(512, 200, (ctx, w, h) => {
    ctx.fillStyle = "#12090a";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ff3b30";
    ctx.font = `900 ${h * 0.82}px "JetBrains Mono", "DejaVu Sans Mono", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h * 0.54);
  });
  add(g, geo.plane(0.54, 0.2), mat(0xffffff, { unlit: true, map: tex, group: "clock" }), [0, 0, 0.002]);
  return g;
}

/** Hanging ceiling sign, readable from both sides along its normal (local Z). */
export function makeHangingSign(kit, text, o = {}) {
  const { mat, geo, add, grp } = kit;
  const g = grp(null);
  const w = o.w ?? 1.5;
  const h = o.h ?? 0.36;
  const tex = kit.sign(text, { w: 1024, h: Math.round((1024 * h) / w), bg: o.bg ?? "#d62828", fg: o.fg ?? "#ffffff", size: o.size });
  const board = mat(o.board ?? 0xb81f1f, { group: "sign:" + text, ink: 0.85 });
  add(g, geo.box(w + 0.06, h + 0.06, 0.05), board);
  const face = mat(0xffffff, { map: tex, group: "sign:" + text, unlit: !!o.lit, shade: 0 });
  add(g, geo.plane(w, h), face, [0, 0, 0.027]);
  add(g, geo.plane(w, h), face, [0, 0, -0.027], [0, Math.PI, 0]);
  const wire = mat(0x8c96a0, { ink: 0.4 });
  for (const s of [-1, 1]) kit.rod(g, [s * w * 0.4, h / 2, 0], [s * w * 0.4, h / 2 + (o.drop ?? 0.3), 0], 0.008, wire, false);
  return g;
}

/** A flat wall sign (one face). Faces local +Z. */
export function makeWallSign(kit, text, o = {}) {
  const { mat, geo, add, grp } = kit;
  const g = grp(null);
  const w = o.w ?? 0.9;
  const h = o.h ?? 0.26;
  const tex = kit.sign(text, { w: 768, h: Math.round((768 * h) / w), bg: o.bg ?? "#ffffff", fg: o.fg ?? "#111111", size: o.size, border: o.border, borderWidth: o.borderWidth });
  add(g, geo.box(w + 0.04, h + 0.04, 0.03), mat(o.board ?? 0x8c96a0, { group: "wsign:" + text, ink: 0.75 }), [0, 0, 0.015]);
  add(g, geo.plane(w, h), mat(0xffffff, { map: tex, group: "wsign:" + text, unlit: !!o.lit, shade: 0, zone: o.zone ?? 0 }), [0, 0, 0.032]);
  return g;
}

/** Swing door leaf hinged at its local origin, extending along +X, facing ±Z. */
export function makeDoorLeaf(kit, o = {}) {
  const { mat, geo, add, grp } = kit;
  const w = o.w ?? 0.9;
  const h = o.h ?? 2.15;
  const hinge = grp(null);
  const tag = "door#" + (makeDoorLeaf.n = (makeDoorLeaf.n || 0) + 1);
  const body = mat(o.color ?? 0x9fb8c9, { group: tag, ink: 0.85, zone: o.zone ?? 0 });
  if (o.glass) {
    // frame only: stiles, rails and a low kick panel; the glass itself is just the view through
    const t = 0.09;
    add(hinge, geo.box(t, h, 0.05), body, [t / 2, h / 2, 0]);
    add(hinge, geo.box(t, h, 0.05), body, [w - t / 2, h / 2, 0]);
    add(hinge, geo.box(w, t, 0.05), body, [w / 2, h - t / 2, 0]);
    add(hinge, geo.box(w, 0.26, 0.05), body, [w / 2, 0.13, 0]);
    add(hinge, geo.box(w - 0.1, 0.06, 0.07), mat(0xc9d1d9, { ink: 0.6, zone: o.zone ?? 0 }), [w / 2, 1.02, 0]);
  } else {
    add(hinge, geo.box(w, h, 0.05), body, [w / 2, h / 2, 0]);
    add(hinge, geo.box(w - 0.06, 0.3, 0.012), mat(0xc9d1d9, { ink: 0.4 }), [w / 2, 0.19, 0.028]);
    add(hinge, geo.box(w - 0.06, 0.3, 0.012), mat(0xc9d1d9, { ink: 0.4 }), [w / 2, 0.19, -0.028]);
    if (o.porthole !== false) {
      const ring = mat(0xe9edf0, { ink: 0.5 });
      const dark = mat(0x2b3a46, { ink: 0, unlit: true });
      for (const s of [1, -1]) {
        add(hinge, geo.cyl(0.19, 0.19, 0.012, 24), ring, [w / 2, 1.5, s * 0.026], [Math.PI / 2, 0, 0]);
        add(hinge, geo.cyl(0.15, 0.15, 0.014, 24), dark, [w / 2, 1.5, s * 0.03], [Math.PI / 2, 0, 0]);
      }
    }
  }
  return hinge;
}

/** Sink with a faucet set in a short counter. Faces local +Z (the user stands at +Z). */
export function makeSink(kit) {
  const { mat, geo, add, grp } = kit;
  const g = grp(null);
  add(g, geo.box(1.3, 0.86, 0.55), mat(0xe9edf0, { group: "sinkCab", ink: 0.8 }), [0, 0.43, 0]);
  add(g, geo.box(1.36, 0.05, 0.6), mat(0xc2cbd2, { ink: 0.7 }), [0, 0.885, 0]);
  add(g, geo.box(0.56, 0.02, 0.36), mat(0x9aa7b0, { ink: 0.5 }), [0, 0.905, 0.02]);
  const metal = mat(0xb9c4cc, { ink: 0.6 });
  kit.tube(g, [[0, 0.9, -0.2], [0, 1.16, -0.2], [0, 1.2, -0.12], [0, 1.1, -0.04]], 0.02, metal, 16);
  add(g, geo.cyl(0.035, 0.04, 0.16, 12), mat(0xf5c518, { ink: 0.6 }), [0.45, 0.99, -0.16]);
  for (const s of [-1, 1]) add(g, geo.box(0.5, 0.6, 0.012), mat(0xd6dde2, { ink: 0.35 }), [s * 0.32, 0.43, 0.281]);
  return g;
}

/** Desktop computer (monitor + keyboard). Screen faces local +Z. */
export function makeComputer(kit) {
  const { mat, geo, add, grp } = kit;
  const g = grp(null);
  const dark = mat(0x2b2f36, { group: "pc", ink: 0.8 });
  add(g, geo.box(0.5, 0.32, 0.03), dark, [0, 0.3, 0]);
  add(g, geo.plane(0.45, 0.27), mat(0x8fd0e8, { unlit: true, ink: 0, group: "pc", glow: 0.9 }), [0, 0.3, 0.016]);
  add(g, geo.box(0.05, 0.14, 0.03), dark, [0, 0.08, -0.01]);
  add(g, geo.box(0.22, 0.015, 0.14), dark, [0, 0.008, 0]);
  add(g, geo.box(0.4, 0.015, 0.13), mat(0x3a3f48, { ink: 0.6 }), [0, 0.008, 0.24]);
  return g;
}

/** Office chair, seat towards local +Z. */
export function makeChair(kit, color = 0x2f6fb8) {
  const { mat, geo, add, grp } = kit;
  const g = grp(null);
  const fab = mat(color, { group: "chair" + color, ink: 0.8 });
  const metal = mat(0x3a3f48, { ink: 0.6 });
  add(g, geo.box(0.44, 0.07, 0.44), fab, [0, 0.47, 0]);
  add(g, geo.box(0.42, 0.42, 0.06), fab, [0, 0.82, -0.2]);
  kit.rod(g, [0, 0.08, 0], [0, 0.45, 0], 0.025, metal, false);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    kit.rod(g, [0, 0.08, 0], [Math.cos(a) * 0.25, 0.05, Math.sin(a) * 0.25], 0.018, metal, true);
  }
  return g;
}

/** A dark blob of shadow on the floor (same id as the floor, so no outline). */
export function shadowBlob(kit, parent, x, z, rx, rz, floorColor, group, y = 0.004, zone = 0) {
  const c = new THREE.Color(floorColor).multiplyScalar(0.78);
  const m = kit.add(parent, kit.geo.circle(1, 28), kit.mat(c, { group, offset: 2, zone }), [x, y, z], [-Math.PI / 2, 0, 0], [rx, rz, 1]);
  return m;
}
