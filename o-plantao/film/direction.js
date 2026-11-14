// The director. For any time t it decides where the eye is and what it looks at, what Diego's hands
// do, where everyone stands and how they act, and how the light falls. Nothing is remembered between
// calls: the same t always gives the same frame.
//
// Timing hangs off the narration (narration.js): S(i) / E(i) are the film times where spoken chunk i
// starts / ends, so every beat lands on the words that tell it.
import * as THREE from "three";
import { R, L } from "./poses.js";
import { rest, mouth, eyes, brows, blink } from "./cast.js";
import { EYE, mixPose, handQuat } from "./pov.js";
import { makePaddle } from "./props.js";
import { S, E, T0, DURATION, CARD_AT } from "./narration.js";
import { VOICE, VOICE_FPS } from "./voice.js";
import { drawMonitor, drawPhone } from "./screens.js";
import { clamp, lerp, inv, ramp, smooth, ease, track, pulse, noise1, hash1, TAU } from "./util.js";

const DEG = Math.PI / 180;
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// the beats themselves live in beats.js, shared with the sound build
import { FADE_OUT, DOORS_HIT, B2, B3, B4, SHOCK1, SHOCK2, PULSE_BACK, GLOVE_OFF, RED_WINDOW, RED_RATE, DOOR_PUSH, RED_STOPS, FREEZE, HEART } from "./beats.js";

/** How loud the narrator is at film time t (0..1): drives mouths and the radio lamp. */
function voice(t) {
  const i = Math.round((t - T0) * VOICE_FPS);
  return i >= 0 && i < VOICE.length ? VOICE[i] : 0;
}
const talk = (t, gain = 1) => clamp((voice(t) - 0.22) * 1.5 * gain);

// ---------------------------------------------------------------- camera takes
// key: { t, p:[x,y,z], look:[x,y,z] | yaw°/pitch°, f, roll°, e, turn (+1 left / -1 right), body° }
function buildTake(keys) {
  let prev = null;
  return keys.map((k) => {
    let yaw, pitch;
    if (k.look) {
      const dx = k.look[0] - k.p[0];
      const dy = k.look[1] - k.p[1];
      const dz = k.look[2] - k.p[2];
      yaw = Math.atan2(-dx, -dz);
      pitch = Math.atan2(dy, Math.hypot(dx, dz));
    } else {
      yaw = k.yaw * DEG;
      pitch = (k.pitch || 0) * DEG;
    }
    if (prev !== null) {
      while (yaw - prev > Math.PI) yaw -= TAU;
      while (yaw - prev < -Math.PI) yaw += TAU;
      if (k.turn === 1 && yaw < prev - 1e-6) yaw += TAU;
      if (k.turn === -1 && yaw > prev + 1e-6) yaw -= TAU;
    }
    prev = yaw;
    return { t: k.t, p: k.p, yaw, pitch, f: k.f ?? 0.66, roll: (k.roll || 0) * DEG, e: k.e || "inOut", body: k.body === undefined ? null : k.body * DEG };
  });
}

function sampleTake(keys, t) {
  if (t <= keys[0].t) return { ...keys[0], body: keys[0].body ?? keys[0].yaw };
  const last = keys[keys.length - 1];
  if (t >= last.t) return { ...last, body: last.body ?? last.yaw };
  let i = 1;
  while (keys[i].t < t) i++;
  const a = keys[i - 1];
  const b = keys[i];
  const k = ease[b.e]((t - a.t) / (b.t - a.t));
  return {
    p: [lerp(a.p[0], b.p[0], k), lerp(a.p[1], b.p[1], k), lerp(a.p[2], b.p[2], k)],
    yaw: lerp(a.yaw, b.yaw, k),
    pitch: lerp(a.pitch, b.pitch, k),
    f: Math.exp(lerp(Math.log(a.f), Math.log(b.f), k)),
    roll: lerp(a.roll, b.roll, k),
    body: lerp(a.body ?? a.yaw, b.body ?? b.yaw, k),
  };
}

// places that get looked at
const P0 = [6.6, EYE, 0.25];
const CLOCK = [4.1, 2.2, -1.42];
const RADIO = [6.3, 1.27, 1.72];
const A = [-14.35, EYE, -0.62]; // Diego's spot at the bedside
const A2 = [-14.28, 1.64, -0.72];
const A3 = [-14.55, 1.52, -0.5];
const HEAD_V = [-15.67, 1.03, 0.45];
const CHEST_V = [-15.3, 1.02, 0.45];
const MON = [-16.25, 2.0, 1.12];
const FER2 = [-16.42, 1.42, 0.45];
const CIDA2 = [-15.3, 1.4, 1.14];
const WORK = [-15.0, 0.98, -0.02]; // where his hands work, by the patient's arm
const ST = [7.25, EYE, 1.0]; // at the station counter
const SINK = [6.9, 1.42, 3.55];
const WINDOW = [9.4, 1.7, 4.4];
const J_STOP = 10.55; // where the stretcher stops beside him
const POV4 = [10.4, 1.62, -0.92];
const SZ = 0.38; // the stretcher's lane
const GRIP = [J_STOP + 0.2, 1.14, -0.3]; // where her hand finds his
const FER4 = [2.35, 1.45, -1.36];
const BACKDOOR = [2.0, 1.3, 6.0];
const BADGE = [2.14, 0.0, 6.86];
const THRESH = [2.0, EYE, 6.2]; // standing in the back doorway
const JAMB = [2.615, 1.3, 6.1]; // where his left hand holds the frame

const TAKES = [
  // ---- 1 · the hook: corridor, the radio, the run ----
  {
    from: 0,
    keys: buildTake([
      { t: 0, p: P0, look: [-6, 1.22, 0], f: 0.66 },
      { t: 1.5, p: P0, look: [-6, 1.22, 0], f: 0.66 },
      { t: 2.3, p: P0, look: CLOCK, f: 1.0 },
      { t: 3.42, p: P0, look: CLOCK, f: 1.08 },
      { t: 3.78, p: [6.46, 1.52, 0.98], look: RADIO, f: 1.15, e: "whip" },
      { t: 4.7, p: [6.44, 1.48, 1.04], look: RADIO, f: 1.3 },
      { t: 6.8, p: [6.42, 1.46, 1.08], look: RADIO, f: 1.42 },
      { t: 7.22, p: [6.32, 1.62, 0.2], look: [-6, 1.3, 0], f: 0.72, e: "whip" },
      { t: 7.62, p: [6.16, 1.6, -0.18], look: [-8, 1.15, -0.2], f: 0.64 },
      { t: 8.35, p: [3.7, 1.6, -0.12], look: [-14, 1.2, 0], f: 0.6, e: "in" },
      { t: 10.45, p: [-9.4, 1.6, 0], look: [-22, 1.25, 0], f: 0.6, e: "linear" },
      { t: 11.1, p: [-11.9, 1.6, 0], look: [-24, 1.25, 0], f: 0.62, e: "out" },
    ]),
  },
  // ---- 2 · SALA 2 ----
  {
    from: B2,
    keys: buildTake([
      { t: B2, p: [-13.5, EYE, -0.42], look: HEAD_V, f: 0.72 },
      { t: S(7) + 1.2, p: A, look: HEAD_V, f: 0.88 },
      { t: E(8) + 0.05, p: A, look: HEAD_V, f: 0.95 },
      { t: S(9) + 0.12, p: A, look: MON, f: 1.3, e: "whip" },
      { t: E(9) + 0.35, p: A, look: MON, f: 1.42 },
      { t: S(10) + 0.3, p: A, look: FER2, f: 1.0 },
      { t: E(10) - 0.1, p: A, look: FER2, f: 1.06 },
      { t: S(11) - 0.05, p: A2, look: CHEST_V, f: 0.7 },
      { t: E(11) + 0.2, p: A2, look: CHEST_V, f: 0.7 },
      { t: S(12) + 0.15, p: A, look: CIDA2, f: 1.0 },
      { t: E(12), p: A, look: [-15.3, 1.3, 1.0], f: 1.06 },
      { t: S(13) + 0.25, p: A3, look: WORK, f: 1.05 },
      { t: E(13) + 0.05, p: A3, look: WORK, f: 1.18 },
      { t: S(14) + 0.1, p: A2, look: CHEST_V, f: 0.7 },
      { t: E(14) + 0.15, p: A2, look: CHEST_V, f: 0.72 },
      { t: S(15) + 0.1, p: A, look: MON, f: 1.36, e: "whip" },
      { t: S(16), p: A, look: MON, f: 1.5 },
      { t: PULSE_BACK - 0.2, p: A, look: MON, f: 1.85 },
      { t: E(18), p: A, look: MON, f: 1.75 },
      { t: E(19) + 0.2, p: A, look: MON, f: 1.45 },
      { t: S(20) + 0.25, p: A, look: [-15.3, 1.43, 1.2], f: 1.05 },
      { t: E(20), p: A, look: [-15.3, 1.43, 1.2], f: 1.12 },
      { t: S(21) + 0.2, p: A, look: FER2, f: 1.0 },
      { t: E(21), p: A, look: FER2, f: 1.03 },
      { t: S(22) + 0.2, p: A3, look: [-15.0, 1.0, -0.12], f: 1.05 },
      { t: B3, p: A3, look: [-15.0, 1.0, -0.12], f: 1.2 },
    ]),
  },
  // ---- 3 · the radio again, Marcos is gone ----
  {
    from: B3,
    keys: buildTake([
      { t: B3, p: [1.6, EYE, 0.1], yaw: -104, pitch: -60, f: 0.85, body: -90 },
      { t: S(24), p: [2.1, EYE, 0.12], yaw: -104, pitch: -61, f: 1.05, body: -90 },
      { t: E(24), p: [2.9, EYE, 0.15], yaw: -104, pitch: -61, f: 1.12, body: -90 },
      { t: S(25) + 0.1, p: [3.6, EYE, 0.2], yaw: -90, pitch: -3, f: 0.66, body: -90 },
      { t: S(25) + 0.75, p: [4.8, EYE, 0.3], look: [5.2, 1.4, -1.5], f: 0.66 },
      { t: S(25) + 1.5, p: [6.2, EYE, 0.55], look: [8.5, 0.85, 2.75], f: 0.8 },
      { t: E(25) + 0.05, p: [6.95, EYE, 0.85], look: [8.5, 0.85, 2.75], f: 0.92 },
      { t: S(26) + 0.2, p: ST, look: SINK, f: 1.5 },
      { t: E(26), p: ST, look: SINK, f: 1.62 },
      { t: S(27) + 0.12, p: [7.3, EYE, 1.0], look: WINDOW, f: 1.22 },
      { t: E(27) + 0.1, p: [7.3, EYE, 1.0], look: WINDOW, f: 1.38 },
      { t: S(28) + 0.25, p: [7.3, EYE, 1.0], yaw: 176, pitch: -34, f: 0.9 },
      { t: S(29) + 0.15, p: [7.3, EYE, 1.0], yaw: 176, pitch: -36, f: 1.6 },
      { t: E(30), p: [7.3, EYE, 1.0], yaw: 176, pitch: -36, f: 1.95 },
      { t: S(31) + 0.08, p: [7.3, EYE, 1.0], look: WINDOW, f: 0.95, e: "whip" },
      { t: E(31) + 0.25, p: [7.3, EYE, 1.0], look: WINDOW, f: 1.0 },
      { t: S(32) + 0.3, p: [7.25, EYE, 1.02], look: [7.25, 1.42, 2.6], f: 0.8 },
      { t: S(33), p: [7.25, EYE, 1.02], look: [7.25, 1.42, 2.6], f: 0.86 },
      { t: B4, p: [7.25, EYE, 1.02], look: [7.25, 1.42, 2.6], f: 0.92 },
    ]),
  },
  // ---- 4, 5, 6 · the ambulance, the back door, the alley: one unbroken take ----
  {
    from: B4,
    keys: buildTake([
      { t: B4, p: [11.2, EYE, -0.15], yaw: -90, pitch: -1, f: 0.66 },
      { t: E(35) - 0.3, p: [11.25, EYE, -0.15], look: [15.2, 1.4, 0], f: 0.72 },
      { t: S(36) + 0.45, p: [11.0, EYE, -0.5], look: [13.4, 1.25, SZ], f: 0.8 },
      { t: S(36) + 1.45, p: POV4, look: [J_STOP + 0.5, 1.2, SZ], f: 0.92 },
      { t: S(36) + 1.95, p: POV4, look: [J_STOP + 0.25, 1.2, SZ], f: 1.0 },
      { t: E(36) + 0.1, p: POV4, look: [J_STOP + 0.2, 1.18, SZ], f: 1.1 },
      { t: S(37) + 0.12, p: [10.42, 1.6, -0.9], look: GRIP, f: 1.5 },
      { t: S(37) + 1.1, p: [10.42, 1.6, -0.9], look: GRIP, f: 1.62 },
      { t: S(37) + 1.5, p: [10.42, 1.6, -0.9], look: [J_STOP + 0.62, 1.34, SZ], f: 1.35 },
      { t: E(37) + 0.1, p: [10.42, 1.6, -0.9], look: [J_STOP + 0.62, 1.34, SZ], f: 1.45 },
      { t: S(38) + 0.16, p: [10.3, EYE, -0.8], look: FER4, f: 2.3, e: "whip", turn: -1 },
      { t: S(39) - 0.1, p: [10.3, EYE, -0.8], look: FER4, f: 2.2 },
      { t: E(39) + 0.05, p: [4.3, EYE, -0.3], look: FER4, f: 0.95 },
      { t: E(40) - 0.3, p: [3.4, EYE, -0.15], look: BACKDOOR, f: 0.8, turn: 1 },
      { t: S(41) + 0.05, p: [2.2, 1.6, 3.9], look: [2.0, 1.25, 6.0], f: 0.8 },
      { t: S(42) + 0.2, p: [2.0, 1.55, 5.55], look: BADGE, f: 0.85 },
      { t: E(42) + 0.15, p: [2.0, 1.2, 5.62], look: BADGE, f: 1.8 },
      { t: S(43) + 0.38, p: [2.02, 0.98, 5.66], look: BADGE, f: 4.8, e: "out3" },
      { t: E(44) - 0.05, p: [2.02, 0.97, 5.66], look: BADGE, f: 5.2 },
      { t: S(45) + 0.05, p: [2.0, 1.55, 5.6], yaw: 180, pitch: -6, f: 0.66, e: "inOut5" },
      { t: S(45) + 0.95, p: [2.0, EYE, 6.12], yaw: 172, pitch: -9, f: 0.66 },
      { t: E(45) - 0.25, p: THRESH, yaw: 190, pitch: -10, f: 0.66 },
      { t: S(46) + 0.6, p: THRESH, look: [3.4, -0.2, 12.4], f: 0.8 },
      { t: E(46) - 0.1, p: THRESH, look: [2.0, -1, 13.2], f: 0.86 },
      { t: S(47) + 0.5, p: THRESH, look: [2.2, 0.55, 16], f: 1.5 },
      { t: E(47) + 0.05, p: THRESH, look: [2.2, 0.55, 16], f: 1.95 },
      { t: E(48), p: THRESH, look: [2.1, 0.6, 12.4], f: 1.5 },
      { t: S(49) + 0.2, p: [2.0, EYE, 6.14], look: [2.1, 0.68, 11.6], f: 1.5 },
      { t: E(50) - 0.05, p: [2.0, 1.63, 6.04], look: [2.1, 0.7, 10.9], f: 1.42 },
      { t: S(51) + 0.32, p: [2.0, EYE, 6.1], yaw: 164, pitch: -60, f: 1.0, body: 180 },
      { t: S(51) + 1.9, p: [2.0, EYE, 6.1], yaw: 164, pitch: -61, f: 1.1, body: 180 },
      { t: E(51) - 1.05, p: [2.0, EYE, 6.14], look: [2.05, 0.7, 10.2], f: 1.15, body: 180 },
      { t: E(51), p: [2.0, EYE, 6.14], look: [2.05, 0.7, 10.2], f: 1.2, body: 180 },
      { t: S(52) + 0.42, p: [2.0, EYE, 6.18], yaw: 325, pitch: -4, f: 0.7, turn: 1, body: 215 },
      { t: S(53) + 0.15, p: [2.0, EYE, 6.18], yaw: 332, pitch: -3, f: 0.9, body: 215 },
      { t: E(53), p: [2.0, EYE, 6.18], yaw: 334, pitch: -3, f: 1.0, body: 215 },
      { t: E(54), p: [2.0, EYE, 6.18], yaw: 312, pitch: -6, f: 0.82, body: 205 },
      { t: S(55) + 0.35, p: [2.0, EYE, 6.2], look: JAMB, f: 0.95, body: 200 },
      { t: E(55), p: [2.0, EYE, 6.2], look: JAMB, f: 1.08, body: 200 },
      { t: S(56) + 1.05, p: THRESH, look: [2.05, 0.2, 10.2], f: 0.8, turn: -1, body: 185 },
      { t: FREEZE, p: THRESH, look: [2.05, 0.2, 10.2], f: 0.84, body: 185 },
    ]),
  },
];

// how fast he is moving on foot: 0 still, 1 walk, 2 run
const gait = track([
  [0, 0],
  [7.3, 0],
  [7.8, 2, "in"],
  [10.6, 2],
  [11.1, 1.2],
  [B2, 0.5],
  [B2 + 1.1, 0],
  [B3 - 0.01, 0],
  [B3, 0.7],
  [E(24), 0.6],
  [S(25) + 0.3, 1.15],
  [E(25), 0.9],
  [S(26) + 0.3, 0],
  [B4, 0],
  [S(36) + 0.3, 0.6],
  [S(36) + 1.5, 0],
  [S(39) - 0.1, 0],
  [S(39) + 0.5, 1.7],
  [E(39) - 0.3, 1.5],
  [E(39) + 0.4, 0.5],
  [E(40) - 0.2, 0.7],
  [S(41) - 0.1, 1.0],
  [S(42) + 0.1, 0],
  [S(45) + 0.2, 0],
  [S(45) + 0.6, 0.7],
  [S(45) + 1.0, 0],
  [DURATION, 0],
]);

// ---------------------------------------------------------------- the director
export function createDirector({ engine, kit, scene, world, outside, cast, pov }) {
  const { fernanda, cida, vanderlei, juliana, paramedic, vulto } = cast;
  const { post, zones, lights } = engine;
  let lookOut = 1;
  const tmpQ = new THREE.Quaternion();
  const tmpV = new THREE.Vector3();
  const invQ = new THREE.Quaternion();

  // --- free arms for contact (hands on a chest, a rail, another hand) ---
  function makeArmRig(ch) {
    const o = ch.o;
    const id = ch.name;
    const top = kit.mat(o.top, { group: id + ":top", shade: 0.75 });
    const skin = kit.mat(o.skin, { group: id + ":skin", shade: 0.5 });
    const sleeve = o.sleeves === "long" ? top : skin;
    const g = kit.grp(scene);
    const side = () => ({
      upper: kit.add(g, kit.geo.cyl(0.054, 0.054, 1, 12), top),
      elbow: kit.add(g, kit.geo.sph(0.055, 12, 8), o.sleeves === "long" ? top : top),
      fore: kit.add(g, kit.geo.cyl(0.051, 0.051, 1, 12), sleeve),
      hand: kit.add(g, kit.geo.sph(0.064, 14, 10), skin),
      shoulder: kit.add(g, kit.geo.sph(0.054, 12, 8), top),
    });
    return { g, L: side(), R: side() };
  }
  for (const ch of [fernanda, cida, juliana, paramedic]) ch.rig = makeArmRig(ch);

  const _s = new THREE.Vector3();
  const _t = new THREE.Vector3();
  const _d = new THREE.Vector3();
  const _p = new THREE.Vector3();
  const _el = new THREE.Vector3();
  /** Put a character's arm so the hand lands on a world point; `pole` says which way the elbow goes. */
  function reach(ch, sideKey, target, pole) {
    const fk = sideKey === "L" ? ch.armL : ch.armR;
    const rig = ch.rig[sideKey];
    fk.sh.visible = false;
    for (const m of Object.values(rig)) m.visible = true;
    fk.sh.getWorldPosition(_s);
    _t.set(target[0], target[1], target[2]);
    const l1 = 0.22;
    const l2 = 0.235;
    _d.copy(_t).sub(_s);
    let dist = _d.length();
    const max = l1 + l2 - 0.004;
    if (dist > max) {
      _d.multiplyScalar(max / dist);
      dist = max;
      _t.copy(_s).add(_d);
    }
    _d.normalize();
    const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    _p.set(pole[0], pole[1], pole[2]);
    _p.addScaledVector(_d, -_p.dot(_d)).normalize();
    _el.copy(_s).addScaledVector(_d, a).addScaledVector(_p, h);
    rig.upper.scale.set(1, kit.aim(rig.upper, _s, _el), 1);
    rig.fore.scale.set(1, kit.aim(rig.fore, _el, _t), 1);
    rig.elbow.position.copy(_el);
    rig.hand.position.copy(_t);
    rig.shoulder.position.copy(_s);
  }
  function noReach(ch) {
    if (!ch.rig) return;
    for (const k of ["L", "R"]) for (const m of Object.values(ch.rig[k])) m.visible = false;
    ch.armL.sh.visible = ch.armR.sh.visible = true;
  }

  // --- defibrillator paddles (in Fernanda's hands) ---
  const paddleL = makePaddle(kit);
  const paddleR = makePaddle(kit);
  scene.add(paddleL, paddleR);

  // --- Juliana's backrest on the ambulance stretcher ---
  const backrest = kit.add(outside.ambStretcher, kit.geo.box(0.7, 0.1, 0.6), kit.mat(0xf2f2f2, { ink: 0.8, shade: 0.5 }), [-0.5, 1.0, 0], [0, 0, -0.7]);

  // --- the air splint on Juliana's left forearm: the arm is plainly wrong inside it ---
  kit.add(juliana.armL.el, kit.geo.cap(0.075, 0.13, 12), kit.mat(0xf5c518, { ink: 0.8, shade: 0.5 }), [0, -0.11, 0]);
  for (const y of [-0.05, -0.17]) kit.add(juliana.armL.el, kit.geo.torus(0.076, 0.012, Math.PI * 2, 16), kit.mat(0x2b2f36, { ink: 0 }), [0, y, 0], [Math.PI / 2, 0, 0]);

  // --- little helpers for placing people ---
  function place(ch, x, y, z, heading) {
    ch.root.visible = true;
    ch.root.rotation.order = "YXZ";
    ch.root.position.set(x, y, z);
    ch.root.rotation.set(0, heading, 0);
  }
  /** Turn the head (and eyes) to a world point. */
  function lookAt(ch, target, k = 1) {
    const h = ch.root.rotation.y;
    const px = ch.root.position.x;
    const pz = ch.root.position.z;
    const dx = target[0] - px;
    const dy = target[1] - (ch.root.position.y + 1.42);
    const dz = target[2] - pz;
    let rel = Math.atan2(dx, dz) - h;
    while (rel > Math.PI) rel -= TAU;
    while (rel < -Math.PI) rel += TAU;
    const used = clamp(rel, -1.25, 1.25) * k;
    const pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.6, 0.6) * k;
    ch.head.rotation.y = used * 0.82;
    ch.neck.rotation.y = used * 0.18;
    ch.head.rotation.x = -pitch;
    return { gx: clamp((rel - used) * 1.4, -1, 1), gy: 0 };
  }
  const liveEyes = (ch, t, gx = 0, gy = 0, wide = 1) => eyes(ch, blink(ch, t) * wide, gx, gy);

  // ================================================================ light and grade
  function light(t) {
    const amb = zones.ambient;
    const flashR = outside.flashR.uniforms.uGlow;
    const flashB = outside.flashB.uniforms.uGlow;
    for (let i = 0; i < 4; i++) {
      lights.pos[i].set(0, 0, 0, 0.001);
      lights.col[i].set(0, 0, 0, 0);
    }
    // defaults
    zones.key[0].set(0.3, 0.86, 0.42).normalize();
    zones.shade[0].set(0.8, 0.85, 0.93);
    zones.key[1].set(-0.25, 0.75, -0.55).normalize();
    zones.shade[1].set(0.6, 0.66, 0.86);
    zones.key[2].set(-0.5, 0.75, 0.3).normalize();
    zones.shade[2].set(0.6, 0.66, 0.86);
    amb[1].set(0.3, 0.38, 0.6);
    amb[2].set(0.36, 0.42, 0.6);
    post.uFogDensity.value = 0;
    post.uRain.value = 0;
    post.uWash.value.set(0, 0, 0, 0);
    post.uFlash.value.set(1, 1, 1, 0);
    post.uFade.value = 0;
    post.uDim.value = 0;
    post.uTint.value.set(1, 1, 1);
    post.uLift.value.set(0, 0, 0);
    post.uSaturation.value = 1.04;
    post.uContrast.value = 1.03;
    post.uBrightness.value = 1.0;
    post.uVignette.value = 0.2;
    flashR.value = flashB.value = 0.15;
    outside.tailM.uniforms.uGlow.value = 0.15;
    outside.puddleGlow.uniforms.uGlow.value = 0;
    world.windowGlow.uniforms.uGlow.value = 1;
    world.windowGlow.uniforms.uColor.value.set(0x0e1a2b);
    let lampGlow = 1;

    if (t < B3) {
      // blocks 1-2: cold white, bright. A touch warmer once the heart is back.
      const warm = ramp(PULSE_BACK + 1.2, PULSE_BACK + 3.5, t);
      amb[0].set(lerp(0.91, 1.0, warm), lerp(0.957, 0.965, warm), lerp(1.0, 0.92, warm));
      post.uBrightness.value = 1.06;
    } else if (t < B4) {
      // block 3: tired fluorescent yellow, dimmer; one tube flickers
      amb[0].set(0.95, 0.89, 0.63);
      zones.shade[0].set(0.8, 0.76, 0.66);
      post.uBrightness.value = 0.93;
      post.uVignette.value = 0.3;
      lampGlow = 0.96 - 0.1 * (noise1(t * 11) > 0.55 ? 1 : 0);
    } else {
      // block 4 on: the ward goes grey-blue and the flashers take over
      amb[0].set(0.3, 0.33, 0.43);
      zones.shade[0].set(0.66, 0.7, 0.86);
      post.uBrightness.value = 1.0;
      post.uVignette.value = 0.3;
      lampGlow = 0.8;
    }
    for (const m of world.lamps) m.uniforms.uGlow.value = lampGlow;
    if (t >= B4) world.hallLamp.uniforms.uGlow.value = 0.55 + 0.25 * (noise1(t * 13) > 0.3 ? 1 : 0);

    // ---- block 4: giroflex, red then blue, half a second each ----
    if (t >= B4 && t < S(45)) {
      const ph = ((t - B4) % 1 + 1) % 1;
      const red = ph < 0.5 ? smooth(inv(0, 0.06, ph)) * (1 - smooth(inv(0.42, 0.5, ph))) : 0;
      const blue = ph >= 0.5 ? smooth(inv(0.5, 0.56, ph)) * (1 - smooth(inv(0.92, 1.0, ph))) : 0;
      const reachIn = 1 - 0.55 * ramp(S(41), S(43), t); // weaker deep in the back hall
      lights.pos[1].set(14.3, 2.7, -0.75, 19);
      lights.col[1].set(1.0, 0.16, 0.16, 0.62 * red * reachIn);
      lights.pos[2].set(14.3, 2.7, 0.75, 19);
      lights.col[2].set(0.16, 0.4, 1.0, 0.62 * blue * reachIn);
      flashR.value = 0.2 + 1.1 * red;
      flashB.value = 0.2 + 1.1 * blue;
      post.uWash.value.set(red * 1.0 + blue * 0.18, red * 0.18 + blue * 0.42, red * 0.18 + blue * 1.0, 0.045 * reachIn);
      // rain seen through the open entrance
      post.uRain.value = 0.42 * (1 - ramp(S(39), E(39), t));
      if (t < S(40)) {
        // SALA 1's light spilling into the corridor, so the doctor in its doorway reads
        lights.pos[3].set(2.0, 2.1, -2.3, 4.6);
        lights.col[3].set(1.0, 0.97, 0.9, 0.55);
      }
    }

    // ---- the red light outside: station window (block 3), back door glass (4), the alley (5) ----
    const redOn = t >= RED_WINDOW && t < RED_STOPS + 0.5;
    if (redOn) {
      const beat = 0.5 + 0.5 * Math.sin((t - RED_WINDOW) * TAU * RED_RATE - Math.PI / 2);
      const k = smooth(beat) * ramp(RED_WINDOW, RED_WINDOW + 0.35, t) * (1 - ramp(RED_STOPS, RED_STOPS + 0.5, t));
      outside.tailM.uniforms.uGlow.value = 0.2 + 1.0 * k;
      outside.puddleGlow.uniforms.uGlow.value = 0.85 * k;
      if (t < B4) {
        world.windowGlow.uniforms.uColor.value.set(0xff2e2e);
        world.windowGlow.uniforms.uGlow.value = 0.25 + 0.95 * k;
        lights.pos[1].set(9.5, 1.75, 4.2, 4.3);
        lights.col[1].set(1.0, 0.16, 0.16, 0.5 * k);
        post.uWash.value.set(1, 0.15, 0.15, 0.03 * k);
      } else if (t >= S(40)) {
        const strong = 1 + 0.5 * ramp(S(51), S(51) + 0.6, t);
        lights.pos[3].set(2.2, 1.2, 33, 42);
        lights.col[3].set(1.0, 0.14, 0.14, 0.62 * k * strong);
        if (t >= S(45)) post.uWash.value.set(1, 0.12, 0.12, 0.05 * k * strong);
      }
    }

    // ---- blocks 5-6: the alley ----
    if (t >= S(40)) {
      const out = ramp(S(45), S(45) + 0.9, t); // 0 inside, 1 in the doorway
      post.uFogColor.value.setRGB(0.105, 0.155, 0.25);
      post.uFogStart.value = 3.0;
      post.uFogDensity.value = 0.055 * ramp(S(41), S(43), t);
      post.uRain.value = Math.max(post.uRain.value, 0.2 * ramp(S(42), S(43), t) + 0.55 * out) * lerp(0.12, 1, lookOut);
      // warm spill from the doorway behind him, and the lamp at the end
      lights.pos[2].set(2.0, 2.1, 5.3, 8.2);
      lights.col[2].set(1.0, 0.86, 0.62, 0.5);
      if (t >= S(45)) {
        // the street lamp behind the figure
        lights.pos[1].set(1.6, 3.6, 24.5, 15);
        lights.col[1].set(1.0, 0.86, 0.6, 0.34);
      }
      // night falls on the picture: -30 % by the end
      const night = ramp(S(54), FREEZE, t);
      post.uBrightness.value = lerp(1.0, 0.72, night) * lerp(1, 0.96, out);
      post.uTint.value.set(lerp(1, 0.82, night), lerp(1, 0.9, night), lerp(1, 1.08, night));
      post.uVignette.value = lerp(0.3, 0.46, Math.max(out, night));
      amb[1].set(lerp(0.3, 0.22, night), lerp(0.38, 0.3, night), lerp(0.6, 0.52, night));
    }

    // ---- flashes and fades ----
    const shock = Math.max(pulse(t, SHOCK1, 0.02, 0.1), pulse(t, SHOCK2, 0.02, 0.1));
    if (shock > 0.01) {
      post.uFlash.value.set(0.94, 0.98, 1, 0.92 * shock);
      lights.pos[3].set(-15.3, 1.5, 0.45, 4);
      lights.col[3].set(0.8, 0.9, 1, 1.2 * shock);
    }
    if (t < B2) post.uFade.value = ramp(FADE_OUT[0], FADE_OUT[1], t);
    else if (t < B2 + 0.4) post.uFade.value = 1 - ramp(B2 + 0.06, B2 + 0.3, t);
    if (t >= FREEZE) post.uDim.value = 0.42 * ramp(FREEZE, FREEZE + 0.3, t);

    // Diego's own hands and body take the light of wherever he is standing
    const z = t >= S(45) ? 1 : 0;
    const k = t >= S(45) ? ramp(S(45), S(45) + 0.9, t) : 0;
    amb[3].copy(amb[0]).lerp(tmpV.copy(amb[1]).multiplyScalar(1.5), k);
    zones.key[3].copy(zones.key[z]);
    zones.shade[3].copy(zones.shade[0]).lerp(zones.shade[1], k);
  }

  // ================================================================ radios
  function radios(t) {
    // the desk radio: a burst of static, then the call
    let desk = 0;
    if (t < B2) {
      const burst = pulse(t, S(1) - 0.18, 0.03, 0.2) * (0.55 + 0.45 * hash1(Math.floor(t * 30)));
      const call = t >= S(2) - 0.05 && t <= E(2) + 0.12 ? 0.35 + 0.65 * voice(t) : 0;
      desk = clamp(Math.max(burst, call));
      world.deskRadio.setLamp(desk);
      if (desk > 0.02) {
        lights.pos[0].set(6.28, 1.4, 1.55, 1.7);
        lights.col[0].set(0.25, 0.88, 1.0, 0.6 * desk);
      }
    }
    // the radio on his hip
    let hip = 0;
    if (t >= B3 && t < B4) {
      const burst = pulse(t, S(23) - 0.05, 0.03, 0.22) * (0.55 + 0.45 * hash1(Math.floor(t * 30)));
      const call = t >= S(24) - 0.05 && t <= E(24) + 0.12 ? 0.35 + 0.65 * voice(t) : 0;
      hip = clamp(Math.max(burst, call));
    } else if (t >= S(51) - 0.1 && t < E(51) + 0.15) {
      const burst = pulse(t, S(51) - 0.08, 0.03, 0.22) * (0.55 + 0.45 * hash1(Math.floor(t * 30)));
      hip = clamp(Math.max(burst, 0.35 + 0.65 * voice(t)));
    }
    pov.radio.setLamp(hip);
    if (hip > 0.02) {
      pov.radio.group.getWorldPosition(tmpV);
      lights.pos[0].set(tmpV.x, tmpV.y + 0.12, tmpV.z, 1.6);
      lights.col[0].set(0.25, 0.88, 1.0, 0.8 * hip);
    }
  }

  // ================================================================ block 1 · corridor
  function block1(t, cam) {
    // the stretcher: parked, grabbed, then shoved ahead of him at a run
    const st = world.runStretcher;
    const parked = [4.57, -0.2];
    const grab = ramp(7.3, 7.62, t);
    const sx = lerp(parked[0], cam.p[0] - 1.6, grab);
    const sz = lerp(parked[1], cam.p[2] - 0.02, grab);
    const run = gait(t) / 2;
    st.position.set(sx, 0.012 * run * Math.abs(Math.sin(t * TAU * 6.5)), sz);
    st.rotation.set(0.006 * run * Math.sin(t * TAU * 5.3), Math.PI + 0.02 * run * Math.sin(t * TAU * 1.5), 0.012 * run * Math.sin(t * TAU * 4.1));
    // the doors fly open when the stretcher hits them
    world.setSala2Doors(ease.outBack(inv(DOORS_HIT, DOORS_HIT + 0.32, t)) * (1 - 0.06 * pulse(t, DOORS_HIT + 0.32, 0.02, 0.2)));
  }

  // ================================================================ block 2 · SALA 2
  const beats = HEART;
  const compress = (t) => 0.5 - 0.5 * Math.cos(t * TAU * 1.9); // 0 up .. 1 down, ~114 per minute

  function block2(t) {
    const jolt = Math.max(pulse(t, SHOCK1 + 0.01, 0.03, 0.13), pulse(t, SHOCK2 + 0.01, 0.03, 0.13));
    const alive = ramp(PULSE_BACK, PULSE_BACK + 2.5, t);

    // --- Seu Vanderlei, on the bed, head to the west ---
    const v = vanderlei;
    v.root.visible = true;
    v.root.rotation.order = "YXZ";
    v.root.position.set(-14.25, 0.905 + 0.1 * jolt + 0.006 * alive * Math.sin(t * TAU * 0.3), 0.45);
    v.root.rotation.set(-Math.PI / 2 - 0.12 * jolt, Math.PI / 2, 0);
    v.spine.rotation.x = -0.22 * jolt;
    v.head.rotation.set(0.42 - 0.3 * jolt, 0.4, 0);
    v.armR.sh.rotation.set(0.05 - 0.5 * jolt, 0, -0.32 - 0.25 * jolt);
    v.armL.sh.rotation.set(0.05 - 0.5 * jolt, 0, 0.32 + 0.25 * jolt);
    v.armL.el.rotation.x = v.armR.el.rotation.x = -0.12;
    eyes(v, 0.07);
    mouth(v, 0.22);
    brows(v, -0.2, 0);

    // who has their hands off the patient, and when
    const clear1 = ramp(S(10) + 0.5, S(10) + 0.9, t) * (1 - ramp(SHOCK1 + 0.45, SHOCK1 + 0.8, t));
    const clear2 = ramp(S(14) - 0.35, S(14) + 0.02, t) * (1 - ramp(SHOCK2 + 0.5, SHOCK2 + 0.9, t));
    const cpr = (1 - Math.max(clear1, clear2)) * (1 - ramp(SHOCK2 - 0.4, SHOCK2 - 0.1, t));
    const watching = ramp(SHOCK2 + 0.6, SHOCK2 + 1.0, t);
    const relief = ramp(E(19), S(20) + 0.5, t);

    // --- Dona Cida: compressions, hands off for the shocks, then "graças a Deus" ---
    const c = cida;
    const back = Math.max(clear1, clear2);
    place(c, -15.3, 0, 1.14 + 0.2 * back, Math.PI);
    const push = compress(t) * cpr;
    c.spine.rotation.x = lerp(0.1, 0.5 + 0.1 * push, cpr) * (1 - 0.6 * watching);
    c.hips.position.y = 0.62 - 0.025 * push;
    const cidaLook = t < SHOCK2 + 0.6 ? CHEST_V : relief > 0.5 ? [-15.3, 3.2, 0.3] : MON;
    // while she pumps she keeps glancing up at the monitor
    const cg = lookAt(c, t > S(21) ? FER2 : cpr > 0.5 ? (Math.sin(t * 1.9) > -0.2 ? MON : CHEST_V) : cidaLook, cpr > 0.5 ? 0.75 : 1);
    // counting out loud while she pushes; then the breath she lets go
    const count = cpr > 0.5 ? 0.15 + 0.55 * (compress(t + 0.07) > 0.55 ? 1 : 0) : 0;
    const pray = relief * (1 - ramp(S(21) - 0.2, S(21) + 0.3, t));
    liveEyes(c, t, cg.gx, 0, pray > 0.6 ? 0.12 : 1);
    brows(c, lerp(-0.75, -0.2, relief), lerp(0.2, 0.55, watching * (1 - relief)));
    mouth(c, pray > 0.3 && t < E(20) ? talk(t, 0.9) * 0.6 : count, relief > 0.85 && voice(t) < 0.3);
    c.root.updateMatrixWorld(true);
    if (pray > 0.02 || relief > 0.02) {
      // hands come together at her chest
      const k = Math.max(pray, relief * 0.7);
      reach(c, "L", [lerp(-15.5, -15.34, k), lerp(1.0, 1.08, k), lerp(0.95, 0.94, k)], [-1, -0.4, 0.3]);
      reach(c, "R", [lerp(-15.1, -15.26, k), lerp(1.0, 1.08, k), lerp(0.95, 0.94, k)], [1, -0.4, 0.3]);
    } else if (cpr > 0.02) {
      const y = 1.075 - 0.045 * push;
      const up = 1 - cpr;
      reach(c, "L", [-15.36, y + 0.42 * up, 0.47 + 0.4 * up], [-1, 0.2, 0.3]);
      reach(c, "R", [-15.28, y + 0.42 * up, 0.44 + 0.4 * up], [1, 0.2, 0.3]);
    } else {
      // "afastado": palms up, away from the bed
      reach(c, "L", [-15.62, 1.5, 1.02 + 0.2 * back], [-1, -0.6, 0.2]);
      reach(c, "R", [-14.98, 1.5, 1.02 + 0.2 * back], [1, -0.6, 0.2]);
    }

    // --- Dra. Fernanda at the head of the bed with the paddles ---
    const f = fernanda;
    const s1 = ramp(SHOCK1 - 0.55, SHOCK1 - 0.12, t) * (1 - ramp(SHOCK1 + 0.3, SHOCK1 + 0.75, t));
    const s2 = ramp(SHOCK2 - 0.55, SHOCK2 - 0.12, t) * (1 - ramp(SHOCK2 + 0.3, SHOCK2 + 0.75, t));
    const lean = Math.max(s1, s2);
    const shout = ramp(S(10) + 0.25, S(10) + 0.45, t) * (1 - ramp(E(10) - 0.2, E(10) + 0.1, t));
    const order = ramp(S(21), S(21) + 0.3, t) * (1 - ramp(E(21), E(21) + 0.3, t));
    place(f, -16.42 + 0.2 * lean, 0, 0.45, Math.PI / 2);
    f.spine.rotation.x = 0.08 + 0.42 * lean + 0.05 * jolt;
    f.hips.position.y = 0.62 - 0.03 * lean;
    const ferLook = lean > 0.3 ? CHEST_V : shout > 0.4 ? (Math.sin(t * 3.1) > 0 ? CIDA2 : A) : order > 0.3 || t > S(20) ? A : t > SHOCK2 + 0.5 ? MON : CHEST_V;
    const fg = lookAt(f, ferLook);
    liveEyes(f, t, fg.gx, 0, 1);
    brows(f, lerp(0.75, 0.1, relief), 0.1 * shout);
    mouth(f, Math.max(shout * (0.55 + 0.45 * Math.abs(Math.sin(t * 9))), order * talk(t, 1.1)), relief > 0.9 && order < 0.1 && t > E(21));
    f.root.updateMatrixWorld(true);
    const hasPaddles = t < S(20) - 0.4;
    paddleL.visible = paddleR.visible = hasPaddles;
    if (hasPaddles) {
      // ready at her chest, rubbed together while they charge, then down on the patient
      const rub = 0.03 * Math.sin(t * TAU * 2.2) * (1 - lean) * (t < SHOCK1 ? 1 : 0.3);
      const tl = [lerp(-16.0, -15.5, lean), lerp(1.12, 1.075 + 0.02 * jolt, lean), lerp(0.3 + rub, 0.34, lean)];
      const tr = [lerp(-16.0, -15.2, lean), lerp(1.12, 1.075 + 0.02 * jolt, lean), lerp(0.6 - rub, 0.6, lean)];
      reach(f, "L", [tl[0], tl[1] + 0.11, tl[2]], [-0.2, -0.3, -1]);
      reach(f, "R", [tr[0], tr[1] + 0.11, tr[2]], [-0.2, -0.3, 1]);
      paddleL.position.set(tl[0], tl[1], tl[2]);
      paddleR.position.set(tr[0], tr[1], tr[2]);
      const tilt = (1 - lean) * 1.1;
      paddleL.rotation.set(0.5 * tilt, 0, -tilt);
      paddleR.rotation.set(-0.5 * tilt, 0, -tilt);
    } else {
      // pointing him to the door: "leva ele pra UTI"
      noReach(f);
      f.armR.sh.rotation.set(-0.15, 0, -0.14);
      f.armL.sh.rotation.set(lerp(-0.1, -1.25, order), 0, lerp(0.12, 0.4, order));
      f.armL.el.rotation.x = lerp(-0.1, -0.25, order);
    }

    // --- the monitor ---
    const flick = t >= SHOCK2 + 0.05 && t < E(15) ? ramp(SHOCK2 + 0.05, SHOCK2 + 0.2, t) * (1 - ramp(E(15) - 0.35, E(15), t)) : pulse(t, SHOCK1 + 0.03, 0.02, 0.18);
    const hrT = clamp((t - (PULSE_BACK + 1.6)) / 5);
    drawMonitor(world.monitor.screen, {
      t,
      beats,
      hr: t < PULSE_BACK + 1.6 ? null : lerp(38, 74, smooth(hrT)) + 1.5 * Math.sin(t * 1.7),
      spo2: lerp(82, 97, smooth(hrT)),
      flicker: flick,
      alarm: t < PULSE_BACK + 0.4,
    });
  }

  // ================================================================ block 3 · the station
  function block3(t) {
    const c = cida;
    // at the sink with her back to him; looks over her shoulder; walks to the counter for her line
    const turn = ramp(S(26) - 0.25, S(26) + 0.35, t);
    const walk = ramp(S(31) + 0.3, S(32) + 0.25, t);
    const x = lerp(6.9, 7.25, walk);
    const z = lerp(3.5, 2.58, walk);
    const heading = lerp(lerp(0, 1.35, turn), Math.PI, walk);
    place(c, x, 0, z, heading);
    const step = Math.sin(t * TAU * 2.1) * walk * (1 - walk) * 4;
    c.legL.hip.rotation.x = 0.4 * step;
    c.legR.hip.rotation.x = -0.4 * step;
    c.hips.position.y = 0.62 - 0.015 * Math.abs(step);
    const said = ramp(S(26), S(26) + 0.2, t) * (1 - ramp(E(26), E(26) + 0.2, t));
    const point = ramp(S(26) + 1.45, S(26) + 1.8, t) * (1 - ramp(E(27), E(27) + 0.5, t));
    const line = ramp(S(33) - 0.05, S(33) + 0.1, t);
    const target = walk > 0.5 ? ST : t > E(26) + 0.1 && t < S(31) + 0.2 ? WINDOW : turn > 0.2 ? ST : [6.9, 1.0, 4.2];
    const g = lookAt(c, target);
    liveEyes(c, t, g.gx, 0, t > RED_WINDOW && walk < 0.5 ? 1.15 : 1);
    brows(c, t > RED_WINDOW ? -0.55 : -0.15, t > RED_WINDOW ? 0.4 : 0);
    mouth(c, Math.max(said * talk(t, 1.0), line * talk(t, 1.15)));
    c.spine.rotation.x = 0.06;
    c.root.updateMatrixWorld(true);
    if (walk < 0.02) {
      // washing: hands in the basin, rubbing; one hand flicks to the window on "lá fora"
      const rub = 0.035 * Math.sin(t * TAU * 2.4) * (1 - turn * 0.6);
      reach(c, "R", [6.78 - rub, 1.0, 3.92], [-1, -0.3, -0.2]);
      if (point > 0.02) reach(c, "L", [lerp(7.02, 7.42, point), lerp(1.0, 1.36, point), lerp(3.92, 3.75, point)], [0.4, -1, -0.2]);
      else reach(c, "L", [7.02 + rub, 1.0, 3.92], [1, -0.3, -0.2]);
    } else {
      noReach(c);
      // "Vai, menino." - a flick of the hand towards the entrance; "eu seguro a sala dois" - thumb at herself
      const go = ramp(S(33), S(33) + 0.2, t) * (1 - ramp(E(33) + 0.1, S(34) + 0.1, t));
      const mine = ramp(S(34) + 0.05, S(34) + 0.3, t) * (1 - ramp(E(34) + 0.1, E(34) + 0.5, t));
      c.armR.sh.rotation.set(lerp(-0.05, -0.75, go), 0, lerp(-0.1, -1.15, go));
      c.armR.el.rotation.x = lerp(-0.15, -0.5 - 0.25 * Math.sin(t * 14), go);
      c.armL.sh.rotation.set(lerp(-0.05, -0.55, mine), 0, lerp(0.1, -0.25, mine));
      c.armL.el.rotation.x = lerp(-0.15, -2.2, mine);
      c.head.rotation.x += 0.12 * go * Math.sin(t * 10) + 0.08 * mine;
    }
    // the phone
    drawPhone(phoneScreen, { pulse: ramp(S(30) - 0.1, S(30) + 0.25, t) * (0.65 + 0.35 * Math.sin(t * TAU * 1.3)) });
  }

  // ================================================================ block 4 · the ambulance
  const stretcherX = track([
    [B4, 16.3],
    [E(35) - 0.45, 16.3],
    [S(36) - 0.05, 14.3, "in"],
    [S(36) + 1.5, J_STOP, "out"],
  ]);
  function block4(t) {
    outside.setAmbDoors(ease.out3(inv(B4 + 0.18, B4 + 1.0, t)));
    const sx = stretcherX(t);
    const sz = SZ;
    const drop = 1 - ramp(E(35) - 0.3, S(36) + 0.15, t);
    const st = outside.ambStretcher;
    st.visible = true;
    st.position.set(sx, 0.6 * drop, sz);
    st.rotation.set(0, Math.PI, 0);
    const rolling = ramp(E(35) - 0.45, E(35) - 0.2, t) * (1 - ramp(S(36) + 1.2, S(36) + 1.55, t));

    // --- Juliana: head to the east, propped up, left arm wrong ---
    const j = juliana;
    j.root.visible = true;
    j.root.rotation.order = "YXZ";
    j.root.position.set(sx - 0.72, 0.905 + 0.6 * drop, sz);
    j.root.rotation.set(-Math.PI / 2, -Math.PI / 2, 0);
    j.spine.rotation.x = 0.7;
    const speaking = ramp(S(37) + 1.2, S(37) + 1.4, t) * (1 - ramp(E(37), E(37) + 0.2, t));
    const grab = ramp(S(37) - 0.12, S(37) + 0.12, t);
    // she looks at him (he is to her right, the north side)
    j.head.rotation.set(-0.1, -1.05 * ramp(S(36) + 0.9, S(36) + 1.5, t), 0);
    liveEyes(j, t, -0.5 * (1 - ramp(S(36) + 0.9, S(36) + 1.5, t)), 0.1, 1.1);
    brows(j, -0.95, 0.5);
    mouth(j, Math.max(0.16, speaking * talk(t, 1.15)));
    // the twisted arm: bent where no arm bends, held against her
    j.armL.sh.rotation.set(-0.7, 0, -0.3);
    j.armL.el.rotation.set(-1.25, 0, -1.1);
    j.root.updateMatrixWorld(true);
    // her right hand: at her side, then clamped onto his
    const G = GRIP;
    const side = [sx + 0.1, 1.04, sz - 0.3];
    const squeeze = 0.008 * Math.sin(t * TAU * 3) * grab;
    reach(j, "R", [lerp(side[0], G[0], grab), lerp(side[1], G[1] + 0.035 + squeeze, grab), lerp(side[2], G[2] + 0.015, grab)], [0, 0.4, -1]);
    j.armL.sh.visible = true;
    for (const m of Object.values(j.rig.L)) m.visible = false;

    // --- the paramedic, pushing from the head end ---
    const p = paramedic;
    place(p, sx + 1.52, 0.6 * drop, sz, -Math.PI / 2);
    p.spine.rotation.x = 0.26;
    const stride = Math.sin(t * TAU * 1.9) * rolling;
    p.legL.hip.rotation.x = 0.55 * stride;
    p.legR.hip.rotation.x = -0.55 * stride;
    p.legL.knee.rotation.x = 0.4 * Math.max(0, -stride);
    p.legR.knee.rotation.x = 0.4 * Math.max(0, stride);
    p.hips.position.y = 0.62 - 0.02 * Math.abs(stride);
    const pg = lookAt(p, t > S(38) ? FER4 : [sx - 0.6, 1.1, sz - 0.2]);
    liveEyes(p, t, pg.gx, 0, 1);
    brows(p, 0.35, 0);
    mouth(p, 0.12);
    p.root.updateMatrixWorld(true);
    reach(p, "L", [sx + 1.08, 0.98 + 0.6 * drop, sz + 0.26], [0, -1, 0.4]);
    reach(p, "R", [sx + 1.08, 0.98 + 0.6 * drop, sz - 0.26], [0, -1, -0.4]);

    // --- Dra. Fernanda, leaning out of SALA 1 and waving him in ---
    const f = fernanda;
    place(f, 2.32, 0, -1.3, 1.2);
    paddleL.visible = paddleR.visible = false;
    noReach(f);
    const yell = ramp(S(38) + 0.1, S(38) + 0.3, t) * (1 - ramp(E(39), E(39) + 0.3, t));
    f.spine.rotation.set(0.14, 0.2, 0);
    const fg = lookAt(f, [engine.pov.position.x, 1.6, engine.pov.position.z]);
    liveEyes(f, t, fg.gx, 0, 1.15);
    brows(f, 0.85, 0.15);
    mouth(f, yell * (0.45 + 0.55 * talk(t, 1.2)));
    const wave = Math.sin(t * TAU * 2.6);
    f.armR.sh.rotation.set(-2.3 - 0.25 * wave, 0, -0.5);
    f.armR.el.rotation.x = -0.7 - 0.5 * wave;
    f.armL.sh.rotation.set(-1.2, 0, 1.15);
    f.armL.el.rotation.x = -0.25;
    // her patient, convulsing behind her
    world.brother.rotation.z = 0.07 * Math.sin(t * TAU * 7.3);
    world.brother.position.y = 0.84 + 0.02 * Math.abs(Math.sin(t * TAU * 6.1));
    world.mon1Screen.uniforms.uColor.value.set(Math.floor(t * 4) % 2 ? 0xff3b30 : 0x39ff7a);
  }

  // ================================================================ blocks 5-6 · the alley
  const vultoZ = track([
    [S(47), 16.2],
    [S(48) + 0.1, 16.2],
    [E(48), 12.8, "inOut"],
    [E(50), 11.3, "out"],
    [S(51) + 0.3, 11.1],
    [E(51) - 0.3, 9.75, "inOut"],
    [DURATION, 9.75],
  ]);
  function block5(t) {
    world.setBackDoor(ease.out3(inv(DOOR_PUSH + 0.15, DOOR_PUSH + 0.95, t)));
    const z = vultoZ(t);
    const moving = (t > S(48) + 0.1 && t < E(50)) || (t > S(51) + 0.3 && t < E(51) - 0.3) ? 1 : 0;
    const v = vulto;
    v.root.visible = t >= S(46) - 0.5;
    v.root.position.set(2.15 + 0.06 * Math.sin(z * 2.2), -1, z);
    v.root.rotation.set(0, Math.PI, 0);
    const step = Math.sin(z * 4.4) * moving;
    v.legL.hip.rotation.x = 0.42 * step;
    v.legR.hip.rotation.x = -0.42 * step;
    v.legL.knee.rotation.x = 0.35 * Math.max(0, -step);
    v.legR.knee.rotation.x = 0.35 * Math.max(0, step);
    v.hips.position.y = 0.68 - 0.02 * Math.abs(step);
    v.armR.sh.rotation.x = -0.3 * step;
    v.spine.rotation.x = 0.07;
    // the hood tips up at him; a small cock of the head as he "speaks"
    const say = ramp(S(49), S(49) + 0.2, t) * (1 - ramp(E(50), E(50) + 0.4, t));
    v.head.rotation.set(-0.2 - 0.1 * ramp(E(48) - 1, E(50), t), 0.1 * say * Math.sin(t * 2.4), 0.14 * say);

    // Dra. Fernanda, small and far down the hall behind him, calling
    const f = fernanda;
    if (t > S(52) - 0.2) {
      place(f, 2.0, 0, 1.35, 0);
      paddleL.visible = paddleR.visible = false;
      noReach(f);
      const call = ramp(S(53) - 0.05, S(53) + 0.15, t) * (1 - ramp(E(53), E(53) + 0.3, t));
      const fg = lookAt(f, THRESH);
      liveEyes(f, t, fg.gx, 0, 1.1);
      brows(f, 0.8, 0.2);
      mouth(f, Math.max(0.3 * ramp(S(52), S(52) + 0.3, t), call * (0.4 + 0.6 * talk(t, 1.2))));
      const w = Math.sin(t * TAU * 2.4);
      f.armR.sh.rotation.set(-2.5 - 0.2 * w, 0, -0.45);
      f.armR.el.rotation.x = -0.6 - 0.5 * w;
      f.armL.sh.rotation.set(-2.5 + 0.2 * w, 0, 0.45);
      f.armL.el.rotation.x = -0.6 + 0.5 * w;
    }
  }

  // ================================================================ hands
  const phoneScreen = kit.live(540, 1150);
  pov.phoneScreen.material = kit.mat(0xffffff, { unlit: true, map: phoneScreen.tex, group: "phone" });
  drawPhone(phoneScreen, {});

  // poses for looking down at his own hands (near the optical axis, above the caption band)
  const W = {
    syringe: { ...R.syringe, pos: [0.1, -0.15, -0.42] },
    port: { ...L.port, pos: [-0.1, -0.18, -0.43] },
    strip: { ...R.strip, pos: [0.1, -0.17, -0.42] },
    pinch: { ...L.pinch, pos: [0.0, -0.14, -0.4] },
    pulled: { ...L.pulled, pos: [-0.23, -0.13, -0.4] },
    bare: { ...R.bare, pos: [0.13, -0.14, -0.42] },
    phone: { ...R.phone, pos: [0.03, -0.085, -0.27], elbow: [0.3, -0.55, 0.05] },
    phoneUp: { ...R.phone, pos: [0.05, -0.3, -0.33] },
    radioL: { ...L.low, pos: [-0.2, -0.3, -0.36] },
  };
  /** A pose given in world space, turned into POV space for this frame. */
  function fromWorld(pos, dir, back, extra) {
    const e = engine.pov;
    invQ.copy(e.quaternion).invert();
    const p = tmpV.set(pos[0], pos[1], pos[2]).sub(e.position).applyQuaternion(invQ).toArray();
    const d = tmpV.set(dir[0], dir[1], dir[2]).applyQuaternion(invQ).toArray();
    const b = tmpV.set(back[0], back[1], back[2]).applyQuaternion(invQ).toArray();
    const out = { pos: p, dir: d, back: b, ...extra };
    if (extra && extra.elbowWorld) out.elbow = tmpV.set(extra.elbowWorld[0], extra.elbowWorld[1], extra.elbowWorld[2]).sub(e.position).applyQuaternion(invQ).toArray();
    return out;
  }
  const onBar = (t, side) => {
    // fists on the stretcher's push bar while he runs
    const st = world.runStretcher.position;
    return fromWorld([st.x + 1.1, 0.985 + st.y, st.z + (side > 0 ? -0.2 : 0.2)], [-1, -0.25, 0], [0, 1, -0.05 * side], {
      curl: 0.95,
      thumb: [0.1, 0.8],
      elbow: [side * 0.3, -0.62, 0.02],
    });
  };
  // left hand on the door frame: back of the glove to the eye, fingers hooked round the post
  const onJamb = () =>
    fromWorld(JAMB, [0.12, 0.96, -0.12], [-1, 0.1, 0.25], { curl: [0.6, 0.62, 0.64, 0.7], thumb: [0.7, 0.25], elbowWorld: [2.4, 1.14, 6.26] });
  const heldBy = () =>
    fromWorld(GRIP, [0.25, -0.2, 1], [0.1, -1, -0.1], { curl: 0.5, thumb: [0.65, 0.3], elbow: [0.3, -0.55, 0.1] });
  const onDoor = (t) => {
    const k = ramp(DOOR_PUSH, DOOR_PUSH + 0.55, t);
    return { ...R.door, pos: [0.14, -0.16, lerp(-0.4, -0.56, k)] };
  };

  // [time, right hand, left hand, ease]: poses may be objects or functions of time
  const HANDS = [
    [0, R.show, L.low],
    [1.75, R.show, L.low],
    [2.5, R.low, L.low],
    [7.25, R.low, L.low],
    [7.6, (t) => onBar(t, 1), (t) => onBar(t, -1), "out"],
    [B2 - 0.01, (t) => onBar(t, 1), (t) => onBar(t, -1)],
    [B2, R.low, L.low],
    [S(10) + 0.55, R.low, L.low],
    [S(10) + 0.95, R.clear, L.clear, "out"],
    [SHOCK1 + 0.45, R.clear, L.clear],
    [SHOCK1 + 0.95, R.low, L.low],
    [S(13) - 0.1, R.low, L.low],
    [S(13) + 0.35, W.syringe, W.port, "out"],
    [E(13) + 0.1, W.syringe, W.port],
    [S(14) + 0.05, R.clear, L.clear, "out"],
    [SHOCK2 + 0.5, R.clear, L.clear],
    [SHOCK2 + 1.0, R.low, L.low],
    [S(22) - 0.1, R.low, L.low],
    [S(22) + 0.3, W.strip, W.pinch, "out"],
    [GLOVE_OFF - 0.1, W.strip, W.pinch],
    [GLOVE_OFF + 0.45, W.bare, W.pulled, "out"],
    [B3 - 0.01, W.bare, W.pulled],
    [B3, R.low, W.radioL],
    [E(24), R.low, W.radioL],
    [S(25) + 0.2, R.low, L.low],
    [S(28) - 0.05, R.low, L.low],
    [S(28) + 0.4, W.phoneUp, L.low, "out"],
    [S(29) + 0.2, W.phone, L.low],
    [E(30), W.phone, L.low],
    [S(31) + 0.1, R.low, L.low, "out"],
    [B4 - 0.01, R.low, L.low],
    [B4, R.low, L.low],
    [S(37) - 0.2, R.low, L.low],
    [S(37) + 0.1, heldBy, L.low, "out"],
    [E(37) + 0.2, heldBy, L.low],
    [S(38) + 0.25, R.low, L.low],
    [DOOR_PUSH - 0.2, R.low, L.low],
    [DOOR_PUSH + 0.1, onDoor, L.low, "out"],
    [DOOR_PUSH + 0.7, onDoor, L.low],
    [DOOR_PUSH + 0.95, R.low, onJamb, "out"],
    [DURATION, R.low, onJamb],
  ];
  const poseOf = (p, t) => (typeof p === "function" ? p(t) : p);
  function hands(t, g) {
    let i = 1;
    while (i < HANDS.length - 1 && HANDS[i][0] < t) i++;
    const a = HANDS[i - 1];
    const b = HANDS[i];
    const k = t <= a[0] ? 0 : t >= b[0] ? 1 : ease[b[3] || "inOut"]((t - a[0]) / (b[0] - a[0]));
    let pr = mixPose(poseOf(a[1], t), poseOf(b[1], t), k);
    let pl = mixPose(poseOf(a[2], t), poseOf(b[2], t), k);
    // loose hands swing with his step; anchored ones stay where they hold
    const free = (p) => p === R.low || p === L.low;
    const swing = Math.min(g, 1.4);
    const bobR = free(a[1]) && free(b[1]) ? swing : 0;
    const bobL = free(a[2]) && free(b[2]) ? swing : 0;
    const ph = t * TAU * (g > 1.3 ? 1.5 : 0.9);
    if (bobR > 0) pr = { ...pr, pos: [pr.pos[0], pr.pos[1] + 0.03 * bobR * Math.sin(ph), pr.pos[2] - 0.035 * bobR * Math.sin(ph)] };
    if (bobL > 0) pl = { ...pl, pos: [pl.pos[0], pl.pos[1] - 0.03 * bobL * Math.sin(ph), pl.pos[2] + 0.035 * bobL * Math.sin(ph)] };
    // the title shot: fingers flex once in the raised glove
    if (t < 1.75) {
      const flex = 0.5 - 0.5 * Math.cos(clamp(t / 1.3) * TAU);
      pr = { ...pr, curl: [0.2 + 0.5 * flex, 0.28 + 0.5 * flex, 0.36 + 0.45 * flex, 0.45 + 0.4 * flex] };
    }
    pov.setHands(pr, pl);

    // what he is holding
    pov.handR.setBare(t >= GLOVE_OFF && t < B4);
    pov.offGlove.visible = t >= GLOVE_OFF && t < B3;
    pov.syringe.visible = pov.iv.visible = t >= S(13) + 0.05 && t < S(14) + 0.05;
    pov.plunger.position.y = lerp(0.085, 0.05, ramp(S(13) + 1.15, S(13) + 1.85, t));
    pov.phone.visible = t >= S(28) && t < S(31) + 0.12;
  }

  // ================================================================ the frame
  function syncPov(t, debug) {
    pov.rig.position.copy(engine.pov.position);
    pov.rig.quaternion.copy(engine.pov.quaternion);
    if (debug) {
      pov.body.position.set(engine.pov.position.x, engine.pov.position.y - EYE, engine.pov.position.z);
      pov.body.rotation.y = engine.pov.rotation.y;
      pov.setHands(R.low, L.low);
    }
  }

  function apply(time) {
    const t = Math.min(time, FREEZE + 0.001); // under the end card the picture holds still
    let take = TAKES[0];
    for (const tk of TAKES) if (t >= tk.from) take = tk;
    const cam = sampleTake(take.keys, t);
    const g = gait(t);

    // ---- the eye: keyed move + breath + footfall + jolts ----
    const walk = Math.min(g, 1);
    const runK = clamp(g - 1);
    const still = 1 - 0.85 * ramp(S(31) + 0.1, S(31) + 0.3, t) * (1 - ramp(E(31) + 0.2, E(31) + 0.5, t)); // "Eu travei."
    let y = cam.p[1] + 0.003 * Math.sin(t * TAU * 0.27) * still;
    let pitch = cam.pitch + 0.0035 * Math.sin(t * TAU * 0.27 + 0.8) * still;
    let yaw = cam.yaw + 0.0018 * Math.sin(t * TAU * 0.19) * still;
    let roll = cam.roll;
    // walking: +-6 px at 1.8 Hz; running: +-14 px at 3 Hz with +-1.5 degrees of roll
    y += walk * 0.02 * Math.sin(t * TAU * 1.8) + runK * 0.028 * Math.sin(t * TAU * 3.0);
    pitch += walk * 0.007 * Math.sin(t * TAU * 1.8 + 0.6) + runK * 0.017 * Math.sin(t * TAU * 3.0 + 0.5);
    roll += walk * 0.005 * Math.sin(t * TAU * 0.9) + runK * 0.026 * Math.sin(t * TAU * 1.5);
    yaw += walk * 0.004 * Math.sin(t * TAU * 0.9 + 1.0) + runK * 0.012 * Math.sin(t * TAU * 1.5 + 0.7);
    // jolts: the two shocks, the doors, the small tremor when the radio speaks in the alley
    const shock = Math.max(pulse(t, SHOCK1, 0.015, 0.075), pulse(t, SHOCK2, 0.015, 0.075));
    const bang = pulse(t, DOORS_HIT, 0.02, 0.1);
    const tremor = 0.22 * ramp(S(51), S(51) + 0.2, t) * (1 - ramp(E(51) - 0.3, E(51), t));
    const j = shock * 1.0 + bang * 0.7 + tremor;
    if (j > 0.002) {
      yaw += 0.03 * j * Math.sin(t * TAU * 19);
      pitch += 0.034 * j * Math.sin(t * TAU * 23 + 1);
      roll += 0.022 * j * Math.sin(t * TAU * 17 + 2);
    }
    // a long lens shows the hand that holds it
    const hold = clamp((cam.f - 1.2) / 3.5);
    yaw += 0.0011 * hold * noise1(t * 3.1);
    pitch += 0.0011 * hold * noise1(t * 2.7 + 9);

    lookOut = t >= S(45) ? 0.5 - 0.5 * Math.cos(yaw) : 1; // 1 facing the alley (+z), 0 facing back inside
    engine.pov.position.set(cam.p[0], y, cam.p[2]);
    engine.pov.rotation.set(pitch, yaw, roll);
    engine.setLens(cam.f);
    engine.pov.updateMatrixWorld(true);
    post.uTime.value = t;

    // ---- his body follows the feet, not the glance ----
    pov.rig.position.copy(engine.pov.position);
    pov.rig.quaternion.copy(engine.pov.quaternion);
    pov.body.position.set(cam.p[0], y - EYE, cam.p[2]);
    pov.body.rotation.y = cam.body;
    pov.body.updateMatrixWorld(true);

    // ---- sets: only what this moment can see ----
    const inS2 = t >= B2 && t < B3;
    world.sala2.visible = t < B3;
    world.corridor.visible = world.station.visible = world.backHall.visible = world.entrance.visible = !inS2;
    world.sala1.visible = t >= B3;
    outside.alley.visible = t >= B4;
    outside.bay.visible = t >= B4 && t < S(43);
    outside.ambStretcher.visible = false;
    backrest.visible = true;
    world.runStretcher.visible = t < B2;
    world.clocks.forEach((c, i) => (c.visible = i === (t < B3 ? 0 : t < B4 ? 1 : 2)));
    world.setSala2Doors(0);
    world.setBackDoor(0);
    outside.setAmbDoors(0);

    // ---- cast: everyone back to neutral, then this moment's acting ----
    for (const ch of [fernanda, cida, vanderlei, juliana, paramedic]) {
      rest(ch);
      noReach(ch);
      ch.root.visible = false;
    }
    vulto.root.visible = false;
    paddleL.visible = paddleR.visible = false;

    light(t);
    if (t < B2) block1(t, cam);
    else if (t < B3) block2(t);
    else if (t < B4) block3(t);
    else {
      if (t < S(43)) block4(t);
      if (t >= S(40)) block5(t);
    }
    radios(t);
    hands(t, g);
  }

  return { apply, syncPov };
}
