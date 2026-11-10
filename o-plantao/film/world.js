// The UPA, inside. One long corridor (x from -12 to 12) with:
//   west end   double doors into SALA 2 (the resus bay)
//   north side SALA 1
//   south side the back hall with the glass back door, and the nurses' station
//   east end   the ambulance entrance
// Units are metres, y is up. Zone 0 = interior light.
import * as THREE from "three";
import { PAL } from "./kit.js";
import {
  makeStretcher,
  makeMonitor,
  makeCrashCart,
  makeIvPole,
  makeClock,
  makeHangingSign,
  makeWallSign,
  makeDoorLeaf,
  makeSink,
  makeComputer,
  makeChair,
  shadowBlob,
} from "./props.js";
import { makeRadio } from "./pov.js";

export const H = 2.9;
const T = 0.14; // wall thickness
const TILE_H = 1.25;

export function buildWorld(kit, scene) {
  const { mat, geo, add, grp } = kit;
  const refs = {};
  const root = grp(scene);
  refs.interior = root;

  const floorM = mat(PAL.floor, { group: "floor", shade: 0.3 });
  const wallM = mat(PAL.wall, { group: "wall" });
  const tileM = mat(PAL.tile, { group: "tile" });
  const ceilM = mat(PAL.ceiling, { group: "ceil", shade: 0.55 });
  const frameM = mat(0x7f8c97, { group: "frame", ink: 0.8 });

  /** A box from its bounds. */
  const slab = (parent, x0, x1, y0, y1, z0, z1, m) =>
    add(parent, new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]);

  /** A wall running along X at z = `at`, or along Z at x = `at`. Tiled to mid height. */
  const wall = (parent, axis, at, a, b, o = {}) => {
    const y0 = o.y0 ?? 0;
    const y1 = o.y1 ?? H;
    const split = o.tile === false ? y0 : Math.min(TILE_H, y1);
    const put = (ya, yb, m) => {
      if (yb - ya < 0.001) return;
      if (axis === "x") slab(parent, a, b, ya, yb, at - T / 2, at + T / 2, m);
      else slab(parent, at - T / 2, at + T / 2, ya, yb, a, b, m);
    };
    if (y0 < split) put(y0, split, o.tileM ?? tileM);
    put(Math.max(y0, split), y1, o.wallM ?? wallM);
  };

  /** A ceiling light panel; returns its material so the director can dim / flicker it. */
  refs.lamps = [];
  const lamp = (parent, x, z, w = 1.2, d = 0.36, y = H - 0.02) => {
    const m = mat(0xffffff, { unlit: true, ink: 0.6 });
    add(parent, geo.box(w, 0.04, d), m, [x, y, z]);
    add(parent, geo.box(w + 0.08, 0.02, d + 0.08), mat(0xb9c4cc, { ink: 0.5 }), [x, y + 0.02, z]);
    refs.lamps.push(m);
    return m;
  };

  // ---------------------------------------------------------------- corridor
  const cor = grp(root);
  refs.corridor = cor;
  add(cor, geo.plane(24, 3), floorM, [0, 0, 0], [-Math.PI / 2, 0, 0]);
  add(cor, geo.plane(24, 3), ceilM, [0, H, 0], [Math.PI / 2, 0, 0]);
  // north wall, with SALA 1's doorway
  wall(cor, "x", -1.5, -12, 1.2);
  wall(cor, "x", -1.5, 2.8, 12);
  wall(cor, "x", -1.5, 1.2, 2.8, { y0: 2.15, tile: false });
  // south wall, with the back hall and the station opening
  wall(cor, "x", 1.5, -12, 1.0);
  wall(cor, "x", 1.5, 3.0, 5.0);
  wall(cor, "x", 1.5, 1.0, 3.0, { y0: 2.4, tile: false });
  wall(cor, "x", 1.5, 5.0, 10.5, { y0: 2.4, tile: false });
  wall(cor, "x", 1.5, 10.5, 12);
  // west end with the double doors, east end with the entrance
  wall(cor, "z", -12, -3.3, -0.9);
  wall(cor, "z", -12, 0.9, 3.3);
  wall(cor, "z", -12, -0.9, 0.9, { y0: 2.2, tile: false });
  wall(cor, "z", 12, -1.5, -1.2);
  wall(cor, "z", 12, 1.2, 1.5);
  wall(cor, "z", 12, -1.2, 1.2, { y0: 2.5, tile: false });
  for (let x = -10.5; x <= 10.6; x += 3) lamp(cor, x, 0);

  // wayfinding stripes on the floor, leading to the emergency doors
  const stripe = (z, color) =>
    add(cor, geo.plane(23.6, 0.1), mat(color, { ink: 0.2, shade: 0, offset: 1 }), [-0.1, 0.003, z], [-Math.PI / 2, 0, 0]);
  stripe(0.95, 0xd62828);
  stripe(1.12, 0x2f6fb8);

  // handrail along the north wall
  const wood = mat(0xa07c52, { group: "rail", ink: 0.6 });
  for (const [a, b] of [[-11.6, 0.9], [3.2, 11.6]]) {
    kit.rod(cor, [a, 0.92, -1.36], [b, 0.92, -1.36], 0.028, wood, true);
    for (let x = a + 0.3; x < b; x += 1.6) kit.rod(cor, [x, 0.92, -1.36], [x, 0.92, -1.44], 0.012, frameM, false);
  }

  // signs, clock, posters
  const emerg = makeHangingSign(kit, "EMERGÊNCIA", { w: 1.7, h: 0.34 });
  emerg.position.set(-2.2, 2.42, 0);
  emerg.rotation.y = Math.PI / 2;
  cor.add(emerg);
  // the corridor clock moves on between the chapters of the night
  refs.clocks = ["02:40", "02:52", "02:58"].map((txt) => {
    const c = makeClock(kit, txt);
    c.position.set(4.1, 2.2, -1.42);
    cor.add(c);
    return c;
  });
  const poster = (title, bg, x, z, ry, body) => {
    const tex = kit.paint(256, 360, (ctx, w, h) => {
      ctx.fillStyle = "#f7f7f2";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h * 0.3);
      ctx.fillStyle = "#fff";
      ctx.font = "900 34px Montserrat, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      title.split("\n").forEach((l, i, arr) => ctx.fillText(l, w / 2, h * 0.15 + (i - (arr.length - 1) / 2) * 36));
      body(ctx, w, h);
    });
    add(cor, geo.plane(0.5, 0.7), mat(0xffffff, { map: tex, ink: 0.7, shade: 0 }), [x, 1.75, z], [0, ry, 0]);
  };
  poster("LAVE\nAS MÃOS", "#2f6fb8", -5.2, -1.425, 0, (ctx, w, h) => {
    ctx.fillStyle = "#8fc7e8";
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.68, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2f6fb8";
    ctx.beginPath();
    ctx.moveTo(w / 2, h * 0.5);
    ctx.quadraticCurveTo(w / 2 + 44, h * 0.7, w / 2, h * 0.8);
    ctx.quadraticCurveTo(w / 2 - 44, h * 0.7, w / 2, h * 0.5);
    ctx.fill();
  });
  poster("SILÊNCIO", "#d62828", -8.6, 1.425, Math.PI, (ctx, w, h) => {
    ctx.strokeStyle = "#d62828";
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.66, 62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w / 2 - 44, h * 0.66 + 44);
    ctx.lineTo(w / 2 + 44, h * 0.66 - 44);
    ctx.stroke();
  });
  poster("UPA 24h", "#5fb3a6", 9.2, -1.425, 0, (ctx, w, h) => {
    ctx.fillStyle = "#5fb3a6";
    ctx.fillRect(w / 2 - 20, h * 0.48, 40, 130);
    ctx.fillRect(w / 2 - 65, h * 0.48 + 45, 130, 40);
  });
  // fire extinguisher
  const ext = grp(cor, [-0.4, 0, -1.3]);
  add(ext, geo.cyl(0.075, 0.075, 0.42, 14), mat(PAL.red, { group: "ext", ink: 0.8 }), [0, 0.9, 0]);
  add(ext, geo.sph(0.075, 12, 8), mat(PAL.red, { group: "ext" }), [0, 1.11, 0]);
  add(ext, geo.cyl(0.02, 0.02, 0.1, 8), mat(0x23262d, { ink: 0.5 }), [0, 1.2, 0]);

  // stretchers parked along the walls
  const parked = makeStretcher(kit, { rails: true });
  parked.position.set(-4.4, 0, -0.98);
  cor.add(parked);
  shadowBlob(kit, cor, -4.4, -0.98, 1.05, 0.42, PAL.floor, "floor");
  const parked2 = makeStretcher(kit, { pad: 0x9bd3c4 });
  parked2.position.set(-8.3, 0, 1.0);
  parked2.rotation.y = Math.PI;
  cor.add(parked2);
  shadowBlob(kit, cor, -8.3, 1.0, 1.05, 0.42, PAL.floor, "floor");
  // waiting chairs by the entrance
  for (let i = 0; i < 3; i++) {
    const c = makeChair(kit, 0x5fb3a6);
    c.position.set(8.9 + i * 0.62, 0, -1.12);
    cor.add(c);
  }
  // the stretcher Diego grabs and runs with
  refs.runStretcher = makeStretcher(kit, { rails: true, pad: 0x8fc7e8 });
  refs.runStretcher.rotation.order = "YXZ";
  cor.add(refs.runStretcher);

  // west end: double doors into SALA 2
  const doorColor = 0x8fb4c9;
  const dA = makeDoorLeaf(kit, { w: 0.9, h: 2.2, color: doorColor });
  dA.position.set(-12, 0, -0.9);
  const dB = makeDoorLeaf(kit, { w: 0.9, h: 2.2, color: doorColor });
  dB.position.set(-12, 0, 0.9);
  cor.add(dA, dB);
  /** 0 = shut, 1 = flung open into the room */
  refs.setSala2Doors = (k) => {
    dA.rotation.y = -Math.PI / 2 - k * 1.75;
    dB.rotation.y = Math.PI / 2 + k * 1.75;
  };
  refs.setSala2Doors(0);
  const s2 = makeWallSign(kit, "SALA 2", { w: 1.1, h: 0.3, bg: "#d62828", fg: "#ffffff", board: 0xb81f1f });
  s2.position.set(-11.93, 2.5, 0);
  s2.rotation.y = Math.PI / 2;
  cor.add(s2);
  for (const z of [-0.94, 0.94]) slab(cor, -12.09, -11.91, 0, 2.2, z - 0.04, z + 0.04, frameM);

  // ---------------------------------------------------------------- SALA 2
  const s2g = grp(root);
  refs.sala2 = s2g;
  add(s2g, geo.plane(6.5, 6.6), floorM, [-15.25, 0, 0], [-Math.PI / 2, 0, 0]);
  add(s2g, geo.plane(6.5, 6.6), ceilM, [-15.25, H, 0], [Math.PI / 2, 0, 0]);
  wall(s2g, "z", -18.5, -3.3, 3.3);
  wall(s2g, "x", -3.3, -18.5, -12);
  wall(s2g, "x", 3.3, -18.5, -12);
  lamp(s2g, -15.3, 0.45, 1.5, 0.9);
  lamp(s2g, -13.4, -1.4, 1.1, 0.5);

  const bed = makeStretcher(kit, { pad: 0xd9eaf2 });
  bed.position.set(-15.0, 0, 0.45);
  bed.rotation.y = Math.PI; // head towards -x
  s2g.add(bed);
  refs.bed = bed;
  shadowBlob(kit, s2g, -15.0, 0.45, 1.15, 0.5, PAL.floor, "floor");
  // sheet over the legs
  refs.sheet = add(s2g, geo.sph(1, 16, 10), mat(0xf4f6f8, { ink: 0.8, shade: 0.5 }), [-14.52, 0.84, 0.45], null, [0.6, 0.15, 0.33]);

  const mon = makeMonitor(kit);
  mon.group.position.set(-16.25, 2.0, 1.12);
  mon.group.rotation.order = "YXZ";
  mon.group.rotation.set(0.16, 2.42, 0);
  s2g.add(mon.group);
  refs.monitor = mon;

  const cart = makeCrashCart(kit);
  cart.position.set(-16.95, 0, 1.75);
  cart.rotation.y = 2.2;
  s2g.add(cart);
  refs.cart = cart;
  shadowBlob(kit, s2g, -16.95, 1.75, 0.45, 0.4, PAL.floor, "floor");
  const pole = makeIvPole(kit);
  pole.position.set(-15.85, 0, -0.42);
  s2g.add(pole);
  // IV line from the bag to the patient's arm
  kit.tube(s2g, [[-15.73, 1.58, -0.42], [-15.7, 1.25, -0.3], [-15.55, 1.0, -0.05], [-15.3, 0.9, 0.08]], 0.007, mat(0xdfeef2, { ink: 0.4 }), 24);

  // gas / socket rail on the wall behind the bed head
  slab(s2g, -18.43, -18.36, 1.32, 1.52, -1.2, 2.1, mat(0xe9edf0, { ink: 0.7 }));
  const knobs = [0x2f9e4f, 0xf5c518, 0x2f6fb8, 0xd62828, 0xe9edf0];
  knobs.forEach((c, i) => add(s2g, geo.cyl(0.045, 0.045, 0.04, 12), mat(c, { ink: 0.4 }), [-18.33, 1.42, -0.9 + i * 0.62], [0, 0, Math.PI / 2]));
  // cabinets on the south wall, a stool
  slab(s2g, -17.8, -15.2, 0, 0.9, 2.75, 3.22, mat(0xe9edf0, { group: "cab2", ink: 0.8 }));
  slab(s2g, -17.85, -15.15, 0.9, 0.95, 2.7, 3.24, mat(0xc2cbd2, { ink: 0.6 }));
  for (let i = 0; i < 4; i++) slab(s2g, -17.72 + i * 0.64, -17.16 + i * 0.64, 0.12, 0.78, 2.735, 2.75, mat(0xd6dde2, { ink: 0.35 }));
  slab(s2g, -17.6, -15.5, 1.5, 2.2, 2.9, 3.22, mat(0xe9edf0, { group: "cab2b", ink: 0.8 }));
  const stool = grp(s2g, [-13.6, 0, 2.2]);
  add(stool, geo.cyl(0.19, 0.19, 0.06, 16), mat(0x2f6fb8, { ink: 0.8 }), [0, 0.5, 0]);
  kit.rod(stool, [0, 0.05, 0], [0, 0.48, 0], 0.025, frameM, false);
  // wall clock in the room
  const clock2 = makeClock(kit, "02:41");
  clock2.position.set(-18.42, 2.3, -1.6);
  clock2.rotation.y = Math.PI / 2;
  s2g.add(clock2);

  // ---------------------------------------------------------------- SALA 1 (seen through its door)
  const s1g = grp(root);
  refs.sala1 = s1g;
  add(s1g, geo.plane(7, 5.4), floorM, [2, 0, -4.2], [-Math.PI / 2, 0, 0]);
  add(s1g, geo.plane(7, 5.4), ceilM, [2, H, -4.2], [Math.PI / 2, 0, 0]);
  wall(s1g, "x", -6.9, -1.5, 5.5);
  wall(s1g, "z", -1.5, -6.9, -1.5);
  wall(s1g, "z", 5.5, -6.9, -1.5);
  lamp(s1g, 2.0, -4.0, 1.4, 0.8);
  const d1 = makeDoorLeaf(kit, { w: 1.6, h: 2.15, color: doorColor });
  d1.position.set(1.2, 0, -1.5);
  d1.rotation.y = 1.85;
  s1g.add(d1);
  for (const x of [1.16, 2.84]) slab(cor, x - 0.04, x + 0.04, 0, 2.15, -1.59, -1.41, frameM);
  const s1 = makeWallSign(kit, "SALA 1", { w: 1.0, h: 0.28, bg: "#2f6fb8", fg: "#ffffff", board: 0x24508f });
  s1.position.set(2.0, 2.45, -1.43);
  cor.add(s1);
  const bed1 = makeStretcher(kit, { pad: 0xd9eaf2, rails: true });
  bed1.position.set(2.5, 0, -4.4);
  bed1.rotation.y = 0.5;
  s1g.add(bed1);
  // the brother: a body under a sheet that shakes
  const bro = grp(s1g, [2.5, 0.84, -4.4], [0, 0.5, 0]);
  add(bro, geo.sph(1, 14, 10), mat(0xf4f6f8, { ink: 0.8, shade: 0.5 }), [-0.2, 0.04, 0], null, [0.75, 0.16, 0.3]);
  add(bro, geo.sph(0.19, 16, 12), mat(PAL.skinA, { group: "bro", shade: 0.5 }), [0.78, 0.12, 0]);
  add(bro, geo.hemi(0.2, 1.5, 16, 8), mat(0x2a1a12, { group: "broHair" }), [0.78, 0.13, 0], [0, 0, -1.2]);
  refs.brother = bro;
  const mon1 = grp(s1g, [3.9, 1.9, -6.75]);
  add(mon1, geo.box(0.7, 0.5, 0.12), mat(0xdfe5ea, { ink: 0.8 }));
  refs.mon1Screen = mat(0x39ff7a, { unlit: true, ink: 0, glow: 0.5 });
  add(mon1, geo.plane(0.6, 0.4), refs.mon1Screen, [0, 0, 0.065]);

  // ---------------------------------------------------------------- nurses' station
  const st = grp(root);
  refs.station = st;
  add(st, geo.plane(5.5, 2.9), floorM, [7.75, 0, 2.95], [-Math.PI / 2, 0, 0]);
  add(st, geo.plane(5.5, 2.9), ceilM, [7.75, H, 2.95], [Math.PI / 2, 0, 0]);
  wall(st, "z", 5.0, 1.5, 4.4);
  wall(st, "z", 10.5, 1.5, 4.4);
  // back wall with the window to the yard behind
  wall(st, "x", 4.4, 5.0, 8.7);
  wall(st, "x", 4.4, 10.1, 10.5);
  wall(st, "x", 4.4, 8.7, 10.1, { y1: 1.15 });
  wall(st, "x", 4.4, 8.7, 10.1, { y0: 2.2, tile: false });
  lamp(st, 7.75, 3.0, 1.4, 0.5);
  // counter
  const counterFront = mat(0x5fb3a6, { group: "counter", ink: 0.85 });
  slab(st, 5.25, 10.25, 0, 1.0, 1.52, 2.0, counterFront);
  slab(st, 5.2, 10.3, 1.0, 1.06, 1.44, 2.08, mat(0xf4f6f8, { ink: 0.8 }));
  slab(st, 5.25, 10.25, 0.1, 0.9, 1.5, 1.52, mat(0x4fa193, { ink: 0.3 }));
  const posto = makeWallSign(kit, "POSTO DE ENFERMAGEM", { w: 2.6, h: 0.3, bg: "#5fb3a6", fg: "#ffffff", board: 0x4a968b });
  posto.position.set(7.75, 2.65, 1.43);
  posto.rotation.y = Math.PI;
  st.add(posto);
  // the radio on the counter
  refs.deskRadio = makeRadio(kit, 0);
  refs.deskRadio.group.position.set(6.3, 1.06 + 0.115, 1.72);
  refs.deskRadio.group.rotation.set(0, Math.PI - 0.25, 0);
  refs.deskRadio.group.scale.setScalar(1.75);
  st.add(refs.deskRadio.group);
  const pc = makeComputer(kit);
  pc.position.set(8.5, 1.06, 1.86);
  st.add(pc);
  // clipboard, papers, mug
  add(st, geo.box(0.24, 0.015, 0.33), mat(0x9c7a55, { ink: 0.6 }), [7.2, 1.068, 1.76], [0, 0.3, 0]);
  add(st, geo.box(0.21, 0.006, 0.29), mat(0xfafafa, { ink: 0.3 }), [7.2, 1.079, 1.76], [0, 0.3, 0]);
  add(st, geo.box(0.3, 0.03, 0.22), mat(0xfafafa, { ink: 0.6 }), [9.5, 1.075, 1.75], [0, -0.2, 0]);
  add(st, geo.cyl(0.045, 0.04, 0.1, 12), mat(0xd62828, { ink: 0.7 }), [5.75, 1.11, 1.8]);
  const ch1 = makeChair(kit);
  ch1.position.set(8.5, 0, 2.75);
  ch1.rotation.y = Math.PI;
  st.add(ch1);
  // sink on the back wall
  const sink = makeSink(kit);
  sink.position.set(6.9, 0, 4.03);
  sink.rotation.y = Math.PI;
  st.add(sink);
  add(st, geo.box(0.28, 0.36, 0.14), mat(0xf4f6f8, { ink: 0.8 }), [6.2, 1.55, 4.26]);
  add(st, geo.box(0.12, 0.2, 0.1), mat(0x8fc7e8, { ink: 0.7 }), [7.55, 1.4, 4.28]);
  // medicine shelves on the east wall, notice board on the west wall
  slab(st, 10.12, 10.43, 0, 2.1, 2.4, 4.0, mat(0xe9edf0, { group: "shelf", ink: 0.8 }));
  const boxColors = [0xd62828, 0x2f6fb8, 0xf5c518, 0x5fb3a6, 0xf4f4f4, 0xf07a1a];
  for (let r = 0; r < 4; r++) {
    slab(st, 10.08, 10.14, 0.42 + r * 0.45, 0.45 + r * 0.45, 2.42, 3.98, mat(0xb9c4cc, { ink: 0.5 }));
    for (let i = 0; i < 5; i++) {
      const c = boxColors[(r * 3 + i * 5) % boxColors.length];
      slab(st, 10.0, 10.12, 0.46 + r * 0.45, 0.62 + r * 0.45 + ((i * 7 + r) % 3) * 0.05, 2.5 + i * 0.3, 2.72 + i * 0.3, mat(c, { ink: 0.5 }));
    }
  }
  slab(st, 5.07, 5.1, 1.3, 2.1, 2.3, 3.7, mat(0xb08a5a, { ink: 0.8 }));
  [[0xfafafa, 2.45, 1.75], [0xf5c518, 2.9, 1.8], [0xfafafa, 3.3, 1.7], [0x8fc7e8, 2.6, 1.42], [0xfafafa, 3.1, 1.45]].forEach(([c, z, y]) =>
    slab(st, 5.1, 5.105, y, y + 0.26, z, z + 0.2, mat(c, { ink: 0.4 })),
  );
  // the window: frame, mullion, and the dark yard beyond with a light that can pulse red
  const winFrame = mat(0xe9edf0, { group: "winFrame", ink: 0.8 });
  slab(st, 8.66, 10.14, 1.11, 1.17, 4.3, 4.5, winFrame);
  slab(st, 8.66, 10.14, 2.18, 2.24, 4.3, 4.5, winFrame);
  slab(st, 8.66, 8.72, 1.11, 2.24, 4.3, 4.5, winFrame);
  slab(st, 10.08, 10.14, 1.11, 2.24, 4.3, 4.5, winFrame);
  slab(st, 9.37, 9.43, 1.17, 2.18, 4.36, 4.44, winFrame);
  refs.windowDark = mat(0x0e1a2b, { unlit: true, ink: 0 });
  add(st, geo.plane(3, 2.2), refs.windowDark, [9.4, 1.7, 5.3], [0, Math.PI, 0]);
  // silhouettes of the yard wall and a far lamp, so the window is not a flat rectangle
  add(st, geo.plane(3, 0.75), mat(0x070c16, { unlit: true, ink: 0.3 }), [9.4, 1.3, 5.25], [0, Math.PI, 0]);
  refs.windowGlow = mat(0xff2e2e, { unlit: true, ink: 0, glow: 0 });
  add(st, geo.circle(0.26, 24), refs.windowGlow, [9.75, 1.72, 5.2], [0, Math.PI, 0]);

  // ---------------------------------------------------------------- back hall + back door
  const bh = grp(root);
  refs.backHall = bh;
  add(bh, geo.plane(2, 4.5), floorM, [2, 0, 3.75], [-Math.PI / 2, 0, 0]);
  add(bh, geo.plane(2, 4.5), ceilM, [2, 2.6, 3.75], [Math.PI / 2, 0, 0]);
  wall(bh, "z", 1.0, 1.5, 6.0, { y1: 2.6 });
  wall(bh, "z", 3.0, 1.5, 6.0, { y1: 2.6 });
  wall(bh, "x", 6.0, 1.0, 1.3, { y1: 2.6 });
  wall(bh, "x", 6.0, 2.7, 3.0, { y1: 2.6 });
  wall(bh, "x", 6.0, 1.3, 2.7, { y0: 2.2, y1: 2.6, tile: false });
  refs.hallLamp = lamp(bh, 2.0, 3.6, 0.9, 0.3, 2.58);
  for (const x of [1.3, 2.7]) slab(bh, x - 0.05, x + 0.05, 0, 2.2, 5.9, 6.1, frameM);
  slab(bh, 1.25, 2.75, 2.2, 2.28, 5.9, 6.1, frameM);
  const saida = makeWallSign(kit, "SAÍDA", { w: 0.62, h: 0.22, bg: "#1f9d55", fg: "#ffffff", board: 0x14693a, lit: true });
  saida.position.set(2.0, 2.42, 5.9);
  saida.rotation.y = Math.PI;
  bh.add(saida);
  // a cleaning trolley and boxes, so the hall reads as a service passage
  slab(bh, 2.45, 2.9, 0, 0.7, 2.3, 3.0, mat(0xf5c518, { group: "trolley", ink: 0.8 }));
  slab(bh, 2.5, 2.85, 0.7, 0.95, 2.4, 2.7, mat(0x2f6fb8, { ink: 0.7 }));
  kit.rod(bh, [2.68, 0.7, 2.9], [2.68, 1.45, 2.95], 0.018, wood, true);
  slab(bh, 1.1, 1.55, 0, 0.4, 4.5, 5.0, mat(0xb08a5a, { ink: 0.8 }));
  slab(bh, 1.12, 1.5, 0.4, 0.72, 4.55, 4.95, mat(0xa07c52, { ink: 0.8 }));

  // the back door: a glass door hinged on the west jamb, opening outwards
  const back = makeDoorLeaf(kit, { w: 1.4, h: 2.2, glass: true, color: 0x6f7c87 });
  back.position.set(1.3, 0, 6.0);
  bh.add(back);
  // grime and reflections on the glass (opaque streaks: the pane is only suggested)
  const grime = mat(0x8a8f8a, { ink: 0, shade: 0, unlit: false });
  const glint = mat(0xcfe3ee, { ink: 0, shade: 0, unlit: true, glow: 0.55 });
  [[0.34, 1.75, 0.2, 0.05, 0.5], [0.5, 1.62, 0.26, 0.04, 0.5], [1.05, 0.62, 0.16, 0.035, 0.5]].forEach(([x, y, w, h, r]) =>
    add(back, geo.plane(w, h), glint, [x, y, -0.012], [0, Math.PI, r]),
  );
  [[0.95, 1.5, 0.11, 0.07], [1.12, 1.32, 0.07, 0.05], [0.3, 0.72, 0.13, 0.06], [0.72, 0.42, 0.2, 0.05], [1.18, 0.5, 0.06, 0.09]].forEach(([x, y, rx, ry]) =>
    add(back, geo.circle(1, 14), grime, [x, y, -0.011], [0, Math.PI, 0], [rx, ry, 1]),
  );
  /** 0 = shut, 1 = pushed wide open */
  refs.setBackDoor = (k) => {
    back.rotation.y = -k * 1.78;
  };
  refs.setBackDoor(0);
  refs.backDoor = back;

  // ---------------------------------------------------------------- east entrance
  const ent = grp(root);
  refs.entrance = ent;
  const glassFrame = mat(0x6f7c87, { group: "entFrame", ink: 0.8 });
  for (const s of [-1, 1]) {
    // sliding glass panels, parked open against the wall
    slab(ent, 11.86, 11.92, 0, 2.5, s * 1.2, s * 1.2 + s * 0.06, glassFrame);
    slab(ent, 11.8, 11.86, 0, 2.5, s * 1.47, s * 1.47 + s * 0.02, glassFrame);
  }
  slab(ent, 11.9, 12.1, 2.5, 2.6, -1.25, 1.25, glassFrame);
  const amb = makeWallSign(kit, "ENTRADA DE AMBULÂNCIAS", { w: 2.0, h: 0.26, bg: "#d62828", fg: "#ffffff", board: 0xb81f1f });
  amb.position.set(11.92, 2.72, 0);
  amb.rotation.y = -Math.PI / 2;
  ent.add(amb);

  refs.floorM = floorM;
  return refs;
}
