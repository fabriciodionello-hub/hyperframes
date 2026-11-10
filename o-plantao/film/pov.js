// Diego, seen only from his own eyes: two gloved hands with jointed fingers, teal sleeves,
// and - when he looks down - his chest with the badge, the radio on his hip, legs and clogs.
// His head never exists.
import * as THREE from "three";
import { PAL } from "./kit.js";
import { clamp } from "./util.js";

export const EYE = 1.62;

// built as a right hand (thumb on -X, back of the hand towards +Z, fingers along +Y); the left is mirrored
const FINGERS = [
  { x: -0.036, y: 0.104, l1: 0.044, l2: 0.038, r: 0.0165, fan: 0.1 }, // index
  { x: -0.012, y: 0.112, l1: 0.048, l2: 0.041, r: 0.017, fan: 0.03 }, // middle
  { x: 0.012, y: 0.108, l1: 0.045, l2: 0.038, r: 0.0165, fan: -0.04 }, // ring
  { x: 0.035, y: 0.096, l1: 0.037, l2: 0.032, r: 0.0155, fan: -0.12 }, // little
];

function makeHand(kit, side) {
  const { mat, geo, add, grp } = kit;
  const tag = side > 0 ? "handR" : "handL";
  const set = (color, cuffColor) => ({
    palm: mat(color, { group: tag + color + ":palm", zone: 3, ink: 0.8, shade: 0.7 }),
    fingers: FINGERS.map(() => mat(color, { zone: 3, ink: 0.8, shade: 0.7 })),
    cuff: mat(cuffColor, { zone: 3, ink: 0.8, shade: 0.7 }),
  });
  const gloveSet = set(PAL.glove, PAL.gloveCuff);
  const skinSet = set(PAL.skinA, PAL.skinA);

  const hand = grp(null);
  const inner = grp(hand);
  inner.scale.x = side;
  const palmMeshes = [];
  palmMeshes.push(add(inner, geo.sph(1, 20, 14), gloveSet.palm, [0, 0.058, 0], null, [0.054, 0.064, 0.027]));
  const fingers = FINGERS.map((f, i) => {
    const base = grp(inner, [f.x, f.y, 0], [0, 0, f.fan]);
    const a = add(base, geo.cap(f.r, f.l1, 10), gloveSet.fingers[i], [0, f.l1 / 2, 0]);
    const mid = grp(base, [0, f.l1, 0]);
    const b = add(mid, geo.cap(f.r * 0.97, f.l2, 10), gloveSet.fingers[i], [0, f.l2 / 2, 0]);
    return { base, mid, meshes: [a, b], fan: f.fan };
  });
  const tb = grp(inner, [-0.046, 0.036, -0.006], [0, 0, 0.9]);
  palmMeshes.push(add(tb, geo.cap(0.0195, 0.042, 10), gloveSet.palm, [0, 0.021, 0]));
  const tm = grp(tb, [0, 0.042, 0]);
  palmMeshes.push(add(tm, geo.cap(0.0185, 0.034, 10), gloveSet.palm, [0, 0.017, 0]));
  const cuff = add(inner, geo.cyl(0.042, 0.046, 0.05, 16), gloveSet.cuff, [0, -0.02, 0]);
  const roll = add(inner, geo.torus(0.046, 0.0075, Math.PI * 2, 20), gloveSet.cuff, [0, -0.045, 0], [Math.PI / 2, 0, 0]);

  let bare = false;
  /** Glove on (blue) or off (skin). */
  function setBare(b) {
    if (b === bare) return;
    bare = b;
    const s = b ? skinSet : gloveSet;
    for (const m of palmMeshes) m.material = s.palm;
    fingers.forEach((f, i) => f.meshes.forEach((m) => (m.material = s.fingers[i])));
    cuff.visible = !b;
    roll.visible = !b;
  }
  return { hand, inner, fingers, thumb: { base: tb, mid: tm }, setBare, side };
}

const _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** Orientation of a hand from where its fingers point and where the back of the hand faces. */
export function handQuat(dir, back, out = new THREE.Quaternion()) {
  _y.set(dir[0], dir[1], dir[2]).normalize();
  _z.set(back[0], back[1], back[2]);
  _z.addScaledVector(_y, -_z.dot(_y)).normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

const c4 = (c) => (Array.isArray(c) ? c : [c ?? 0.3, c ?? 0.3, c ?? 0.3, c ?? 0.3]);

/**
 * A hand pose, in POV space (x right, y up, z towards the viewer; the eye is the origin):
 *   pos   [x,y,z] wrist
 *   dir   [x,y,z] where the fingers point        back  [x,y,z] where the back of the hand faces
 *   curl  0..1 or [index, middle, ring, little]
 *   thumb [spread, curl]  spread 1 = wide open, 0 = alongside the palm
 *   elbow [x,y,z] where the forearm comes from
 * Poses blend: positions and curls linearly, orientation along the shortest arc.
 */
export function mixPose(a, b, k) {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const arr = (x, y) => x.map((v, i) => v + (y[i] - v) * k);
  const qa = a.quat ?? handQuat(a.dir, a.back, _qa);
  const qb = b.quat ?? handQuat(b.dir, b.back, _qb);
  return {
    pos: arr(a.pos, b.pos),
    quat: _q.copy(qa).slerp(qb, k).clone(),
    curl: arr(c4(a.curl), c4(b.curl)),
    thumb: arr(a.thumb ?? [0.6, 0.2], b.thumb ?? [0.6, 0.2]),
    elbow: arr(a.elbow, b.elbow),
  };
}

export function buildPov(kit) {
  const { mat, geo, add, grp } = kit;
  const rig = grp(null); // follows the eye exactly
  const body = grp(null); // follows the feet, turns with the hips only
  const handR = makeHand(kit, 1);
  const handL = makeHand(kit, -1);
  rig.add(handR.hand, handL.hand);

  const sleeveM = (tag) => mat(PAL.scrub, { zone: 3, shade: 0.8, group: tag });
  const foreR = add(rig, geo.cyl(0.039, 0.05, 1, 16), sleeveM("sleeveR"));
  const foreL = add(rig, geo.cyl(0.039, 0.05, 1, 16), sleeveM("sleeveL"));
  const _w = new THREE.Vector3();
  const _el = new THREE.Vector3();

  function apply(h, fore, pose) {
    h.hand.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    if (pose.quat) h.hand.quaternion.copy(pose.quat);
    else handQuat(pose.dir, pose.back, h.hand.quaternion);
    const curl = c4(pose.curl);
    h.fingers.forEach((f, i) => {
      const c = clamp(curl[i], 0, 1.15);
      f.base.rotation.set(-c * 1.35, 0, f.fan * (1 - 0.6 * c));
      f.mid.rotation.set(-c * 1.6, 0, 0);
    });
    const th = pose.thumb ?? [0.6, 0.2];
    h.thumb.base.rotation.set(-0.25 - th[1] * 0.5, -0.5 * (1 - th[0]) - th[1] * 0.4, 0.25 + th[0] * 0.75);
    h.thumb.mid.rotation.set(-th[1] * 1.1, 0, 0);
    // forearm from the wrist back to the elbow
    _w.set(0, -0.03, 0).applyQuaternion(h.hand.quaternion).add(h.hand.position);
    _el.set(pose.elbow[0], pose.elbow[1], pose.elbow[2]);
    const len = kit.aim(fore, _w, _el);
    fore.scale.set(1, len, 1);
  }

  // ---------- the body below the eyes ----------
  const scrub = mat(PAL.scrub, { zone: 3, group: "diego:top", shade: 0.8 });
  const pants = mat(PAL.scrubDark, { zone: 3, group: "diego:pants", shade: 0.8 });
  add(body, geo.cap(0.18, 0.3, 20), scrub, [0, 1.1, 0.2], null, [1.1, 1, 0.82]);
  // badge on a lanyard, resting on the belly. Like a nurse's fob watch it hangs "upside down",
  // so it reads the right way up to the one wearing it.
  const badge = grp(body, [0.03, 1.2, 0.0], [-1.02, 0, 0.05]);
  const badgeTex = kit.paint(512, 320, (ctx, w, h) => drawBadge(ctx, w, h, "DIEGO", "ENFERMEIRO", false));
  add(badge, geo.box(0.135, 0.086, 0.004), mat(0xffffff, { zone: 3, ink: 0.7, group: "diegoBadge" }));
  add(badge, geo.plane(0.133, 0.084), mat(0xffffff, { zone: 3, map: badgeTex, group: "diegoBadge", shade: 0 }), [0, 0, 0.0025]);
  add(badge, geo.box(0.032, 0.018, 0.008), mat(0x6b7480, { zone: 3, ink: 0.5 }), [0, -0.05, 0]);
  const lan = mat(0x24508f, { zone: 3, ink: 0.45 });
  kit.rod(body, [0.03, 1.168, 0.052], [0.085, 1.33, 0.13], 0.006, lan);
  kit.rod(body, [0.03, 1.168, 0.052], [-0.03, 1.33, 0.13], 0.006, lan);

  // radio clipped on the right hip
  const radio = makeRadio(kit, 3);
  const holster = grp(body, [0.215, 1.03, 0.05], [0, 0, 0.3]);
  radio.group.rotation.set(-1.05, 0, 0);
  radio.group.scale.setScalar(1.15);
  holster.add(radio.group);

  // ---------- things he holds ----------
  // phone, lying in the open right palm with the screen to his face
  const phone = grp(handR.hand, [-0.002, 0.128, -0.034], [0, Math.PI, 0]);
  add(phone, geo.box(0.082, 0.168, 0.011), mat(0x16171c, { zone: 3, group: "phone", ink: 0.9 }));
  const phoneScreen = add(phone, geo.plane(0.074, 0.158), mat(0xffffff, { unlit: true, group: "phone" }), [0, 0, 0.0062]);
  phone.visible = false;

  // syringe pinched in the right hand
  const syringe = grp(handR.hand, [-0.03, 0.105, -0.03], [1.35, 0, 0.35]);
  add(syringe, geo.cyl(0.0105, 0.0105, 0.085, 12), mat(0xe9f3f6, { zone: 3, ink: 0.6, shade: 0.3 }), [0, 0, 0]);
  add(syringe, geo.cyl(0.0085, 0.0085, 0.045, 10), mat(0xf5c518, { zone: 3, ink: 0, shade: 0.2 }), [0, -0.017, 0]);
  add(syringe, geo.cyl(0.0035, 0.0035, 0.04, 6), mat(0x9aa4ad, { zone: 3, ink: 0.35 }), [0, -0.062, 0]);
  add(syringe, geo.cyl(0.017, 0.017, 0.006, 12), mat(0xcfd9df, { zone: 3, ink: 0.5 }), [0, 0.044, 0]);
  const plunger = grp(syringe, [0, 0.085, 0]);
  add(plunger, geo.cyl(0.0045, 0.0045, 0.08, 8), mat(0xb9c4cc, { zone: 3, ink: 0.4 }), [0, -0.01, 0]);
  add(plunger, geo.cyl(0.016, 0.016, 0.006, 12), mat(0x2f6fb8, { zone: 3, ink: 0.5 }), [0, 0.03, 0]);
  syringe.visible = false;

  // IV line + injection port held in the left hand
  const iv = grp(handL.hand, [0.02, 0.1, -0.03]);
  const ivM = mat(0xdfeef2, { zone: 3, ink: 0.5, shade: 0.3 });
  kit.tube(iv, [[0.0, 0.0, 0.0], [0.05, 0.1, -0.02], [0.02, 0.28, -0.08], [-0.12, 0.5, -0.1], [-0.2, 0.9, -0.05]], 0.0055, ivM, 32);
  kit.tube(iv, [[0.0, 0.0, 0.0], [-0.06, -0.05, -0.03], [-0.16, -0.12, -0.12], [-0.3, -0.16, -0.25]], 0.0055, ivM, 24);
  add(iv, geo.cyl(0.012, 0.012, 0.03, 10), mat(0x3d8fd9, { zone: 3, ink: 0.5 }), [0, 0, 0], [0, 0, 0.6]);
  add(iv, geo.cyl(0.009, 0.009, 0.035, 10), mat(0xf2f2f2, { zone: 3, ink: 0.5 }), [0.018, 0.012, 0.0], [0, 0, -0.95]);
  iv.visible = false;

  // the glove he has just pulled off, dangling from the left hand
  const offGlove = grp(handL.hand, [0.0, 0.1, -0.035], [0.3, 0, 0.2]);
  const og = mat(PAL.glove, { zone: 3, ink: 0.8, group: "offglove", shade: 0.7 });
  add(offGlove, geo.sph(1, 14, 10), og, [0, -0.06, 0], null, [0.04, 0.062, 0.018]);
  for (let i = 0; i < 4; i++) add(offGlove, geo.cap(0.0125, 0.045, 8), og, [(i - 1.5) * 0.02, -0.135, 0], [0.12 * (i - 1.5), 0, 0.1 * (i - 1.5)]);
  add(offGlove, geo.cap(0.0135, 0.03, 8), og, [-0.045, -0.085, 0], [0, 0, -0.9]);
  offGlove.visible = false;

  return {
    rig,
    body,
    handR,
    handL,
    radio,
    badge,
    phone,
    phoneScreen,
    syringe,
    plunger,
    iv,
    offGlove,
    setHands(poseR, poseL) {
      apply(handR, foreR, poseR);
      apply(handL, foreL, poseL);
    },
    showHands(r, l) {
      handR.hand.visible = foreR.visible = r;
      handL.hand.visible = foreL.visible = l;
    },
  };
}

/** A staff badge: white card, teal band, name and role. `mud` smears it. Marcos's photo is never seen. */
export function drawBadge(ctx, w, h, name, role, mud) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#5fb3a6";
  ctx.fillRect(0, 0, w, h * 0.27);
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 ${h * 0.15}px Montserrat, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("UPA 24h", w * 0.06, h * 0.145);
  // photo box (a plain silhouette; for Marcos the mud covers it)
  ctx.fillStyle = "#cfd9df";
  ctx.fillRect(w * 0.06, h * 0.36, w * 0.25, h * 0.52);
  ctx.fillStyle = "#9aa7b0";
  ctx.beginPath();
  ctx.arc(w * 0.185, h * 0.53, h * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w * 0.185, h * 0.86, w * 0.1, h * 0.2, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#111111";
  let size = h * 0.2;
  ctx.font = `900 ${size}px Montserrat, sans-serif`;
  while (ctx.measureText(name).width > w * 0.58 && size > 10) {
    size -= 2;
    ctx.font = `900 ${size}px Montserrat, sans-serif`;
  }
  ctx.fillText(name, w * 0.36, h * 0.5);
  ctx.fillStyle = "#3d4a52";
  let s2 = h * 0.105;
  ctx.font = `800 ${s2}px Montserrat, sans-serif`;
  const lines = role.split("\n");
  while (Math.max(...lines.map((l) => ctx.measureText(l).width)) > w * 0.6 && s2 > 8) {
    s2 -= 1;
    ctx.font = `800 ${s2}px Montserrat, sans-serif`;
  }
  lines.forEach((l, i) => ctx.fillText(l, w * 0.36, h * 0.7 + i * s2 * 1.15));
  if (mud) {
    // mud: one big smear over the photo, splashes across the card
    const blob = (x, y, rx, ry, rot, c) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(x * w, y * h, rx * w, ry * h, rot, 0, Math.PI * 2);
      ctx.fill();
    };
    blob(0.17, 0.62, 0.17, 0.3, 0.3, "#5b3a22");
    blob(0.25, 0.8, 0.14, 0.16, -0.4, "#5b3a22");
    blob(0.1, 0.42, 0.09, 0.13, 0.8, "#6a4429");
    blob(0.86, 0.2, 0.07, 0.1, 0.2, "#5b3a22");
    blob(0.92, 0.82, 0.09, 0.12, -0.3, "#6a4429");
    blob(0.62, 0.93, 0.08, 0.06, 0, "#5b3a22");
    blob(0.47, 0.3, 0.025, 0.035, 0, "#6a4429");
    blob(0.74, 0.34, 0.02, 0.03, 0, "#5b3a22");
    blob(0.2, 0.55, 0.07, 0.1, 0.5, "#7a5333");
  }
}

/** Handheld radio: black body, antenna, speaker grille, a lamp that flashes cyan when it talks. */
let radioCount = 0;
export function makeRadio(kit, zone = 0) {
  const { mat, geo, add, grp } = kit;
  const group = grp(null);
  const bodyM = mat(0x23262d, { zone, group: "radio#" + radioCount++, ink: 0.85 });
  add(group, geo.box(0.07, 0.13, 0.04), bodyM);
  add(group, geo.cyl(0.008, 0.01, 0.1, 8), bodyM, [-0.022, 0.115, 0]);
  add(group, geo.cyl(0.011, 0.011, 0.02, 10), mat(0x3a3f48, { zone, ink: 0.4 }), [0.02, 0.075, 0]);
  const grille = mat(0x3a3f48, { zone, ink: 0 });
  for (let i = 0; i < 4; i++) add(group, geo.box(0.045, 0.006, 0.004), grille, [0, -0.035 + i * 0.015, 0.021]);
  const lampM = mat(PAL.radio, { unlit: true, ink: 0.4, glow: 0.25 });
  const lamp = add(group, geo.box(0.05, 0.024, 0.005), lampM, [0, 0.04, 0.021]);
  /** on 0..1: how brightly the lamp is lit */
  const setLamp = (on) => {
    lampM.uniforms.uGlow.value = 0.22 + 0.9 * on;
  };
  return { group, lamp, setLamp };
}
