// Outside the UPA, at night:
//   the back alley beyond the glass door (zone 1) - stairs, dumpster, puddle, the lamp at the far end
//   the ambulance bay beyond the east entrance (zone 2) - the ambulance with its doors and flashers
import * as THREE from "three";
import { PAL } from "./kit.js";
import { makeStretcher, makeDoorLeaf } from "./props.js";
import { drawBadge } from "./pov.js";

export function buildOutside(kit, scene) {
  const { mat, geo, add, grp } = kit;
  const refs = {};
  const slab = (parent, x0, x1, y0, y1, z0, z1, m) =>
    add(parent, new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]);

  // night sky: every ray that hits nothing lands here
  refs.skyM = mat(0x0a1220, { unlit: true, side: THREE.BackSide, ink: 0 });
  const sky = add(scene, geo.sph(260, 16, 8), refs.skyM);
  sky.renderOrder = 999;

  // ================================================================ the alley
  const al = grp(scene);
  refs.alley = al;
  const Z1 = { zone: 1 };
  const ground = mat(0x4b525c, { ...Z1, group: "alleyGround", shade: 0.2 });
  add(al, geo.plane(40, 40), ground, [2, -1, 26], [-Math.PI / 2, 0, 0]);
  const backWall = mat(0x8d989e, { ...Z1, group: "backWall" });
  slab(al, -6, 1.3, -1, 7.5, 5.86, 6.0, backWall);
  slab(al, 2.7, 10, -1, 7.5, 5.86, 6.0, backWall);
  slab(al, 1.3, 2.7, 2.2, 7.5, 5.86, 6.0, backWall);
  // the red band every UPA wears
  slab(al, -6, 10, 3.2, 3.5, 6.0, 6.02, mat(0xb81f1f, { ...Z1, ink: 0.4 }));
  // landing and steps down to the alley
  const concrete = mat(0x9a9f9a, { ...Z1, group: "steps" });
  slab(al, 1.0, 3.0, -1, 0, 6.0, 7.2, concrete);
  for (let i = 0; i < 5; i++) slab(al, 1.0, 3.0, -1, -0.2 * (i + 1), 7.2 + 0.32 * i, 7.2 + 0.32 * (i + 1), concrete);
  const railM = mat(0x5d666e, { ...Z1, group: "rail1", ink: 0.7 });
  kit.rod(al, [1.08, 0.95, 6.1], [1.08, 0.95, 7.2], 0.025, railM, true);
  kit.rod(al, [1.08, 0.95, 7.2], [1.08, -0.05, 8.8], 0.025, railM, true);
  for (const [z, y] of [[6.15, 0], [7.2, 0], [8.0, -0.5], [8.8, -1]]) kit.rod(al, [1.08, y, z], [1.08, y + 0.95, z], 0.02, railM, false);

  // side walls: old brick on one side, stained concrete on the other
  const brick = mat(0x7a5a4e, { ...Z1, group: "brick" });
  const conc = mat(0x6e7780, { ...Z1, group: "conc" });
  slab(al, -0.6, -0.4, -1, 8, 6, 31, brick);
  slab(al, 4.4, 4.6, -1, 8, 6, 31, conc);
  // courses of brick as flat bands (no outline) so the wall has grain without noise
  const brickDark = mat(0x6c4f45, { ...Z1, ink: 0, shade: 1 });
  for (let i = 0; i < 9; i++) slab(al, -0.4, -0.395, -0.6 + i * 0.85, -0.42 + i * 0.85, 6.4 + ((i * 37) % 9), 12 + ((i * 53) % 17), brickDark);
  const stain = mat(0x5f6870, { ...Z1, ink: 0, shade: 1 });
  [[9, 2.2, 3.5, 1.4], [15, 0.2, 2.2, 2.6], [21, 3, 4, 1.2], [26, 1, 3, 3]].forEach(([z, y, w, h]) => slab(al, 4.395, 4.4, y, y + h, z, z + w, stain));
  // pipes, a boarded window, an air-conditioning box
  const pipeM = mat(0x47505a, { ...Z1, ink: 0.6 });
  kit.rod(al, [4.3, -1, 9.2], [4.3, 7.5, 9.2], 0.06, pipeM, false);
  kit.rod(al, [-0.3, -1, 15.5], [-0.3, 7.5, 15.5], 0.05, pipeM, false);
  slab(al, -0.4, -0.34, 1.6, 2.9, 10.6, 12.0, mat(0x2a2f36, { ...Z1, ink: 0.7 }));
  for (let i = 0; i < 3; i++) slab(al, -0.34, -0.31, 1.75 + i * 0.4, 1.93 + i * 0.4, 10.5, 12.1, mat(0x8a6a48, { ...Z1, ink: 0.5 }));
  slab(al, 3.9, 4.4, 2.4, 3.0, 17, 17.9, mat(0xb9c4cc, { ...Z1, ink: 0.7 }));

  // the dumpster
  const dump = grp(al, [3.5, -1, 12.4]);
  const green = mat(0x2f8f4e, { ...Z1, group: "dumpster", ink: 0.9 });
  add(dump, geo.box(1.25, 1.05, 1.9), green, [0, 0.62, 0]);
  add(dump, geo.box(1.33, 0.08, 1.98), mat(0x267a41, { ...Z1, ink: 0.7 }), [0, 1.18, 0], [0, 0, 0.12]);
  add(dump, geo.box(0.02, 0.5, 1.2), mat(0x267a41, { ...Z1, ink: 0.35 }), [-0.635, 0.6, 0]);
  for (const sz of [-0.75, 0.75]) add(dump, geo.cyl(0.09, 0.09, 0.06, 12), mat(0x1c1f24, { ...Z1, ink: 0.5 }), [-0.45, 0.09, sz], [0, 0, Math.PI / 2]);
  // rubbish bags
  const bag = mat(0x1f2329, { ...Z1, group: "bags", ink: 0.8 });
  add(al, geo.sph(0.34, 14, 10), bag, [2.75, -0.76, 13.75], null, [1.1, 0.75, 1]);
  add(al, geo.sph(0.28, 14, 10), bag, [3.15, -0.8, 14.2], null, [1, 0.75, 1.2]);
  add(al, geo.sph(0.3, 14, 10), bag, [3.3, -0.78, 10.95], null, [1, 0.8, 1]);
  // the drum and a jerry can
  const drum = grp(al, [0.2, -1, 10.6]);
  add(drum, geo.cyl(0.3, 0.3, 0.88, 18), mat(0x2f6fb8, { ...Z1, group: "drum", ink: 0.9 }), [0, 0.44, 0]);
  for (const y of [0.25, 0.63]) add(drum, geo.torus(0.305, 0.018, Math.PI * 2, 20), mat(0x24508f, { ...Z1, ink: 0.3 }), [0, y, 0], [Math.PI / 2, 0, 0]);
  add(al, geo.box(0.32, 0.42, 0.18), mat(0xe9edf0, { ...Z1, ink: 0.8 }), [0.75, -0.79, 10.2], [0, 0.4, 0]);
  add(al, geo.cyl(0.035, 0.035, 0.07, 10), mat(0xd62828, { ...Z1, ink: 0.5 }), [0.7, -0.55, 10.24]);

  // puddles; the big one mirrors the red light
  const puddle = mat(0x2e3a4e, { ...Z1, ink: 0.35, shade: 0, group: "puddle" });
  add(al, geo.circle(1, 28), puddle, [1.95, -0.994, 12.7], [-Math.PI / 2, 0, 0.3], [1.25, 2.1, 1]);
  add(al, geo.circle(1, 20), puddle, [0.9, -0.994, 17.5], [-Math.PI / 2, 0, 0.8], [0.6, 1.1, 1]);
  add(al, geo.circle(1, 20), puddle, [3.0, -0.994, 20], [-Math.PI / 2, 0, 0.2], [0.7, 1.5, 1]);
  refs.puddleGlow = mat(0xff2e2e, { unlit: true, ink: 0, glow: 0, group: "puddle" });
  add(al, geo.circle(1, 24), refs.puddleGlow, [2.0, -0.992, 13.2], [-Math.PI / 2, 0, 0.25], [0.5, 1.35, 1]);
  add(al, geo.circle(1, 16), refs.puddleGlow, [0.95, -0.992, 17.7], [-Math.PI / 2, 0, 0.8], [0.22, 0.6, 1]);

  // the lamp at the far end, and the street beyond with the parked car
  const post = grp(al, [0.15, -1, 25.5]);
  kit.rod(post, [0, 0, 0], [0, 5.2, 0], 0.07, mat(0x39414a, { ...Z1, group: "post", ink: 0.8 }), false);
  kit.rod(post, [0, 5.2, 0], [1.25, 5.5, 0], 0.05, mat(0x39414a, { ...Z1, group: "post", ink: 0.8 }), true);
  refs.lampM = mat(0xffe9b0, { unlit: true, ink: 0.5, glow: 1 });
  add(post, geo.sph(0.2, 14, 10), refs.lampM, [1.3, 5.38, 0], null, [1.3, 0.6, 1]);
  // pool of light under it (same id as the ground: a shape, not an object)
  refs.poolM = mat(0x77808c, { ...Z1, group: "alleyGround", offset: 2, shade: 0 });
  add(al, geo.circle(1, 28), refs.poolM, [1.5, -0.996, 25.6], [-Math.PI / 2, 0, 0], [1.9, 2.4, 1]);
  // far buildings closing the view
  slab(al, -14, 18, -1, 12, 44, 45, mat(0x3d4550, { ...Z1, group: "far" }));
  const lit = mat(0xf2d27a, { unlit: true, ink: 0, glow: 0.8 });
  [[-3, 5], [4.5, 7], [7, 3.5], [-6.5, 8], [1.2, 9.2]].forEach(([x, y]) => slab(al, x, x + 0.9, y, y + 1.1, 43.95, 44, lit));
  // the car with its lights off, across the mouth of the alley
  const car = grp(al, [2.4, -1, 34.5]);
  const carM = mat(0x23262d, { ...Z1, group: "car", ink: 0.9 });
  add(car, geo.box(4.2, 0.75, 1.75), carM, [0, 0.62, 0]);
  add(car, geo.box(2.2, 0.62, 1.6), carM, [-0.2, 1.28, 0]);
  add(car, geo.box(2.0, 0.42, 1.62), mat(0x10131a, { ...Z1, ink: 0.3 }), [-0.2, 1.3, 0]);
  for (const sx of [-1.35, 1.35]) add(car, geo.cyl(0.36, 0.36, 0.3, 16), mat(0x0c0d12, { ...Z1, ink: 0.7 }), [sx, 0.36, -0.9], [Math.PI / 2, 0, 0]);
  refs.tailM = mat(0xff2e2e, { unlit: true, ink: 0.3, glow: 0.15 });
  add(car, geo.box(0.34, 0.16, 0.05), refs.tailM, [1.75, 0.72, -0.885]);
  add(car, geo.box(0.34, 0.16, 0.05), refs.tailM, [-1.75, 0.72, -0.885]);

  // Marcos's badge, where it fell at the top of the steps
  const badge = grp(al, [2.14, 0.006, 6.86], [-Math.PI / 2, 0, Math.PI + 0.38]);
  const tex = kit.paint(640, 400, (ctx, w, h) => drawBadge(ctx, w, h, "MARCOS", "TÉC. DE\nENFERMAGEM", true));
  add(badge, geo.box(0.16, 0.1, 0.006), mat(0xffffff, { ...Z1, group: "marcosBadge", ink: 0.8 }));
  add(badge, geo.plane(0.158, 0.098), mat(0xffffff, { ...Z1, map: tex, group: "marcosBadge", shade: 0 }), [0, 0, 0.004]);
  add(badge, geo.box(0.04, 0.02, 0.012), mat(0x6b7480, { ...Z1, ink: 0.5 }), [0, 0.058, 0]);
  refs.badge = badge;
  // its lanyard, snapped, snaking off the edge of the step
  kit.tube(al, [[2.16, 0.012, 6.92], [2.3, 0.012, 7.02], [2.25, 0.012, 7.14], [2.42, 0.01, 7.2], [2.5, -0.19, 7.3]], 0.008, mat(0x24508f, { ...Z1, ink: 0.5 }), 24);
  // mud tracked across the landing
  const mud = mat(0x5b3a22, { ...Z1, ink: 0, shade: 0, group: "steps" });
  [[1.85, 6.72, 0.13, 0.07, 0.4], [2.35, 6.62, 0.09, 0.05, 1.2], [1.6, 7.0, 0.1, 0.05, 0.2], [2.5, 7.05, 0.07, 0.11, 0.6], [2.02, 7.08, 0.05, 0.04, 0]].forEach(([x, z, rx, rz, r]) =>
    add(al, geo.circle(1, 14), mud, [x, 0.004, z], [-Math.PI / 2, 0, r], [rx, rz, 1]),
  );
  // wet sheen on the landing so it reads as rained on
  add(al, geo.circle(1, 20), mat(0xa9b0ad, { ...Z1, ink: 0, shade: 0, group: "steps" }), [1.5, 0.003, 6.5], [-Math.PI / 2, 0, 0.3], [0.3, 0.2, 1]);

  // ================================================================ the ambulance bay
  const bay = grp(scene);
  refs.bay = bay;
  const Z2 = { zone: 2 };
  add(bay, geo.plane(40, 40), mat(0x4b525c, { ...Z2, group: "bayGround", shade: 0.2 }), [32, -0.001, 0], [-Math.PI / 2, 0, 0]);
  const facade = mat(0xcfd6da, { ...Z2, group: "facade" });
  slab(bay, 12.07, 12.2, 0, 6, -14, -1.5, facade);
  slab(bay, 12.07, 12.2, 0, 6, 1.5, 14, facade);
  slab(bay, 12.07, 12.2, 2.6, 6, -1.5, 1.5, facade);
  // canopy over the entrance
  slab(bay, 12.2, 15.2, 3.1, 3.3, -3.2, 3.2, mat(0xb81f1f, { ...Z2, ink: 0.8 }));
  for (const z of [-3.0, 3.0]) kit.rod(bay, [15.0, 0, z], [15.0, 3.1, z], 0.09, mat(0x9aa4ad, { ...Z2, ink: 0.7 }), false);
  // lines painted on the wet ground
  const paint = mat(0xe9d24a, { ...Z2, ink: 0, shade: 0, group: "bayGround", offset: 2 });
  for (const z of [-1.6, 1.6]) add(bay, geo.plane(9, 0.14), paint, [17, 0.002, z], [-Math.PI / 2, 0, 0]);
  // the city across the road
  slab(bay, 34, 36, 0, 14, -22, 22, mat(0x343c47, { ...Z2, group: "city" }));
  const win = mat(0xf2d27a, { unlit: true, ink: 0, glow: 0.75 });
  for (let i = 0; i < 16; i++) {
    const z = -12 + ((i * 7.3) % 24);
    const y = 2.5 + ((i * 3.1) % 9);
    slab(bay, 33.95, 34, y, y + 1.0, z, z + 0.8, win);
  }
  // a street lamp, off to one side
  kit.rod(bay, [22, 0, -6.5], [22, 6, -6.5], 0.08, mat(0x39414a, { ...Z2, ink: 0.8 }), false);
  add(bay, geo.sph(0.26, 12, 8), mat(0xffe9b0, { unlit: true, ink: 0.5 }), [21.6, 6.0, -6.3]);

  // ---- the ambulance: origin at the middle of the rear bumper on the ground, body along +x ----
  const amb = grp(bay, [14.1, 0, 0]);
  refs.ambulance = amb;
  const body = mat(0xf4f6f8, { ...Z2, group: "ambBody", ink: 0.9 });
  const inner = mat(0xd3dbe0, { ...Z2, group: "ambInner", shade: 0.4 });
  // shell as panels, so the open rear shows the inside
  slab(amb, 0, 5.2, 0.5, 0.6, -1.02, 1.02, inner); // floor
  slab(amb, 0, 5.2, 2.6, 2.72, -1.05, 1.05, body); // roof
  slab(amb, 0, 5.2, 0.5, 2.6, -1.05, -0.97, body);
  slab(amb, 0, 5.2, 0.5, 2.6, 0.97, 1.05, body);
  slab(amb, 3.3, 3.4, 0.6, 2.6, -0.97, 0.97, inner); // bulkhead
  slab(amb, 0.02, 3.3, 0.6, 2.58, -0.972, -0.965, inner);
  slab(amb, 0.02, 3.3, 0.6, 2.58, 0.965, 0.972, inner);
  slab(amb, 0.02, 3.3, 2.56, 2.6, -0.97, 0.97, inner);
  // cab
  slab(amb, 3.4, 5.9, 0.5, 2.1, -1.0, 1.0, body);
  // the orange stripe along the flanks
  for (const s of [-1, 1]) slab(amb, 0.05, 5.85, 1.25, 1.55, s * 1.05, s * 1.056, mat(0xf07a1a, { ...Z2, ink: 0.3, shade: 0 }));
  // rear frame, bumper/step
  slab(amb, -0.02, 0.05, 2.5, 2.62, -1.05, 1.05, body);
  slab(amb, -0.28, 0.02, 0.36, 0.5, -1.0, 1.0, mat(0x30343b, { ...Z2, ink: 0.8 }));
  for (const sx of [1.0, 4.6]) for (const sz of [-0.98, 0.98]) add(amb, geo.cyl(0.42, 0.42, 0.26, 18), mat(0x16181d, { ...Z2, ink: 0.8 }), [sx, 0.42, sz], [Math.PI / 2, 0, 0]);
  // inside: bench, cabinets, a ceiling light
  slab(amb, 0.5, 3.2, 0.6, 1.05, 0.5, 0.96, mat(0x2f6fb8, { ...Z2, ink: 0.7 }));
  slab(amb, 0.3, 3.25, 1.75, 2.5, -0.96, -0.62, mat(0xe9edf0, { ...Z2, ink: 0.7 }));
  refs.ambLightM = mat(0xfff3d1, { unlit: true, ink: 0.4, glow: 1 });
  slab(amb, 0.9, 2.3, 2.52, 2.56, -0.3, 0.3, refs.ambLightM);
  // rear doors
  const doorTex = (flip) =>
    kit.paint(256, 512, (ctx, w, h) => {
      ctx.fillStyle = "#f4f6f8";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#2b3a46";
      ctx.fillRect(w * 0.14, h * 0.06, w * 0.72, h * 0.3);
      // medical star
      ctx.save();
      ctx.translate(w / 2, h * 0.56);
      ctx.fillStyle = "#2f6fb8";
      for (let i = 0; i < 3; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.fillRect(-13, -52, 26, 104);
      }
      ctx.restore();
      // chevrons
      const cw = 46;
      for (let i = -1; i < 8; i++) {
        ctx.fillStyle = i % 2 ? "#e9d24a" : "#d62828";
        ctx.beginPath();
        const x = i * cw;
        const d = flip ? -1 : 1;
        ctx.moveTo(x, h);
        ctx.lineTo(x + cw, h);
        ctx.lineTo(x + cw + d * 60, h * 0.82);
        ctx.lineTo(x + d * 60, h * 0.82);
        ctx.fill();
      }
    });
  const leaf = (z, flip) => {
    const hinge = grp(amb, [0, 0.6, z]);
    const m = mat(0xf4f6f8, { ...Z2, group: "ambDoor" + z, ink: 0.9 });
    add(hinge, geo.box(1.0, 1.95, 0.05), m, [0.5, 0.975, 0]);
    const t = mat(0xffffff, { ...Z2, map: doorTex(flip), group: "ambDoor" + z, shade: 0 });
    add(hinge, geo.plane(0.98, 1.93), t, [0.5, 0.975, 0.027]);
    add(hinge, geo.plane(0.98, 1.93), mat(0xe1e7eb, { ...Z2, group: "ambDoor" + z }), [0.5, 0.975, -0.027], [0, Math.PI, 0]);
    return hinge;
  };
  const la = leaf(-1.0, false);
  const lb = leaf(1.0, true);
  /** 0 = shut, 1 = swung wide open */
  refs.setAmbDoors = (k) => {
    la.rotation.y = -Math.PI / 2 - k * 1.95;
    lb.rotation.y = Math.PI / 2 + k * 1.95;
  };
  refs.setAmbDoors(0);
  // flashers: red and blue on the rear corners and on the roof bar
  refs.flashR = mat(0xff2e2e, { unlit: true, ink: 0.5, glow: 0.2 });
  refs.flashB = mat(0x2e6bff, { unlit: true, ink: 0.5, glow: 0.2 });
  slab(amb, -0.03, 0.06, 2.62, 2.8, -0.95, -0.5, refs.flashR);
  slab(amb, -0.03, 0.06, 2.62, 2.8, 0.5, 0.95, refs.flashB);
  slab(amb, 3.6, 3.95, 2.72, 2.9, -0.9, -0.05, refs.flashR);
  slab(amb, 3.6, 3.95, 2.72, 2.9, 0.05, 0.9, refs.flashB);
  // tail lights
  for (const s of [-1, 1]) slab(amb, -0.03, 0.02, 0.75, 1.0, s * 1.04 - 0.05, s * 1.04 + 0.05, mat(0xb81f1f, { unlit: true, ink: 0.3, glow: 0.7 }));

  // the stretcher that comes out of it (placed by the director)
  refs.ambStretcher = makeStretcher(kit, { rails: true, pad: 0xf07a1a });
  scene.add(refs.ambStretcher);

  return refs;
}
