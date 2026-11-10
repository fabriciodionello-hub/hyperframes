// The cast: big-headed toon people built from capsules and spheres on a simple joint hierarchy.
// A character stands on its feet at the root origin, facing +Z. Pose it by rotating its joints.
import * as THREE from "three";
import { PAL } from "./kit.js";
import { hash1, clamp } from "./util.js";

const HEAD_R = 0.21;

/**
 * o = {
 *   name, skin, top, bottom, shoes, sleeves: "short" | "long",
 *   hair: { style: "bun" | "short" | "curly" | "bald" | "cap", color },
 *   glasses: hex, coat: bool, stethoscope: bool, collar: bool, moustache: hex,
 *   stripes: hex (reflective bands), mouthColor
 * }
 */
export function makeCharacter(kit, o) {
  const { mat, geo, add, grp } = kit;
  const id = o.name;
  const skin = mat(o.skin, { group: id + ":skin", shade: 0.5 });
  const skinFeature = mat(o.skin, { ink: 0.5, shade: 0.5 });
  const top = mat(o.top, { group: id + ":top", shade: 0.75 });
  const sleeve = o.sleeves === "long" ? top : skin;
  const bottom = mat(o.bottom, { group: id + ":bottom", shade: 0.75 });
  const shoes = mat(o.shoes ?? 0x2a2a2e, { group: id + ":shoes" });
  const hairM = mat(o.hair?.color ?? 0x111111, { group: id + ":hair", shade: 0.6 });
  const white = mat(0xffffff, { ink: 0.7, shade: 0.2 });
  const black = mat(0x15151a, { ink: 0 });
  const glint = mat(0xffffff, { ink: 0, unlit: true });
  const mouthM = mat(o.mouthColor ?? 0x4a1616, { ink: 0.45, shade: 0 });

  const root = grp(null);
  const hips = grp(root, [0, 0.62, 0]);
  const spine = grp(hips);
  const torso = add(spine, geo.cap(0.165, 0.28, 20), top, [0, 0.27, 0], null, [1.06, 1, 0.84]);
  const chest = grp(spine, [0, 0.5, 0]);
  const neckJ = grp(chest, [0, 0.05, 0]);
  add(neckJ, geo.cyl(0.06, 0.07, 0.1, 14), skin, [0, 0.03, 0]);
  const head = grp(neckJ, [0, 0.25, 0]);
  add(head, geo.sph(HEAD_R, 32, 24), skin);

  // ----- face -----
  const face = {};
  for (const s of [-1, 1]) {
    const eye = grp(head, [s * 0.084, 0.035, 0.158]);
    add(eye, geo.sph(0.066, 20, 14), white, null, null, [1, 1.08, 0.55]);
    const pupil = grp(eye, [0, 0, 0.034]);
    add(pupil, geo.sph(0.031, 16, 12), black, null, null, [1, 1, 0.5]);
    add(pupil, geo.sph(0.0105, 10, 8), glint, [0.012, 0.014, 0.012]);
    const brow = add(head, geo.cap(0.0125, 0.07, 8), hairM, [s * 0.084, 0.128, 0.172], [0, 0, Math.PI / 2]);
    add(head, geo.sph(0.046, 14, 10), skin, [s * 0.203, -0.005, 0], null, [0.6, 1, 0.8]);
    if (s < 0) Object.assign(face, { eyeL: eye, pupilL: pupil, browL: brow });
    else Object.assign(face, { eyeR: eye, pupilR: pupil, browR: brow });
  }
  add(head, geo.sph(0.034, 14, 10), skinFeature, [0, -0.022, 0.208]);
  face.mouth = add(head, geo.sph(0.05, 16, 12), mouthM, [0, -0.108, 0.176], null, [1, 0.14, 0.22]);
  face.smile = add(head, geo.torus(0.05, 0.0095, Math.PI, 16), mouthM, [0, -0.085, 0.182], [0.25, 0, Math.PI]);
  face.smile.visible = false;

  if (o.moustache) {
    const mm = mat(o.moustache, { ink: 0.4, shade: 0.4 });
    for (const s of [-1, 1]) add(head, geo.cap(0.016, 0.04, 8), mm, [s * 0.03, -0.068, 0.2], [0, 0, Math.PI / 2 + s * 0.35]);
  }

  // ----- hair -----
  const hs = o.hair?.style;
  if (hs === "bun" || hs === "short" || hs === "cap") {
    const theta = hs === "bun" ? 1.72 : hs === "cap" ? 1.5 : 1.62;
    const tilt = hs === "bun" ? -0.42 : -0.5;
    add(head, geo.hemi(HEAD_R + 0.014, theta, 28, 14), hairM, null, [tilt, 0, 0]);
    if (hs === "bun") add(head, geo.sph(0.088, 18, 12), hairM, [0, 0.15, -0.175]);
    if (hs === "short") {
      // a little volume on top so it does not read as a swim cap
      add(head, geo.sph(0.12, 16, 10), hairM, [0.03, 0.135, -0.02], null, [1.35, 0.55, 1.25]);
    }
    if (hs === "cap") add(head, geo.box(0.24, 0.02, 0.13), hairM, [0, 0.1, 0.22], [0.25, 0, 0]);
  } else if (hs === "curly") {
    let k = 0;
    for (let ring = 0; ring < 3; ring++) {
      const n = [1, 6, 9][ring];
      const el = [1.45, 0.95, 0.42][ring];
      for (let i = 0; i < n; i++) {
        const az = (i / n) * Math.PI * 2 + ring * 0.4;
        const r = HEAD_R + 0.02;
        const x = Math.cos(el) * Math.sin(az) * r;
        const y = Math.sin(el) * r;
        const z = Math.cos(el) * Math.cos(az) * r;
        if (ring === 2 && z > 0.07) continue; // keep the face clear
        add(head, geo.sph(0.085, 12, 9), hairM, [x, y, z - 0.02], null, 0.85 + 0.35 * hash1(k++));
      }
    }
  } else if (hs === "bald") {
    // a band of hair around the back of the head
    for (let i = 0; i < 7; i++) {
      const az = Math.PI + (i - 3) * 0.42;
      add(head, geo.sph(0.06, 10, 8), hairM, [Math.sin(az) * 0.2, -0.01, Math.cos(az) * 0.2], null, [1, 0.8, 0.5]);
    }
  }

  if (o.glasses) {
    const gm = mat(o.glasses, { group: id + ":glasses", ink: 0.55 });
    for (const s of [-1, 1]) {
      add(head, geo.torus(0.074, 0.012, Math.PI * 2, 24), gm, [s * 0.084, 0.035, 0.2]);
      add(head, geo.cap(0.009, 0.15, 6), gm, [s * 0.178, 0.04, 0.12], [Math.PI / 2, 0, 0]);
    }
    add(head, geo.cap(0.009, 0.02, 6), gm, [0, 0.045, 0.205], [0, 0, Math.PI / 2]);
  }

  // ----- body extras -----
  if (o.coat) {
    add(spine, geo.cyl(0.172, 0.2, 0.36, 20, true), top, [0, -0.07, 0], null, [1.06, 1, 0.86]).material.side = THREE.DoubleSide;
    const under = mat(o.coatUnder ?? 0x3d6fb0, { ink: 0 });
    add(spine, geo.cone(0.07, 0.16, 3), under, [0, 0.47, 0.128], [Math.PI, Math.PI / 6, 0], [1, 1, 0.2]);
    const btn = mat(0x8c96a0, { ink: 0 });
    for (let i = 0; i < 3; i++) add(spine, geo.sph(0.012, 8, 6), btn, [0.02, 0.3 - i * 0.1, 0.146]);
  }
  if (o.vneck) {
    add(spine, geo.cone(0.06, 0.12, 3), mat(o.skin, { ink: 0 }), [0, 0.49, 0.13], [Math.PI, Math.PI / 6, 0], [1, 1, 0.2]);
  }
  if (o.pocket) add(spine, geo.box(0.085, 0.08, 0.012), mat(o.pocket, { ink: 0.35 }), [-0.075, 0.33, 0.142]);
  if (o.stethoscope) {
    const sm = mat(0x2b2f36, { ink: 0.4 });
    kit.tube(
      chest,
      [
        [-0.1, 0.05, -0.02],
        [-0.115, -0.02, 0.09],
        [-0.07, -0.16, 0.15],
        [0, -0.24, 0.155],
        [0.07, -0.16, 0.15],
        [0.115, -0.02, 0.09],
        [0.1, 0.05, -0.02],
      ],
      0.011,
      sm,
      32,
    );
    add(chest, geo.cyl(0.028, 0.028, 0.014, 14), mat(0xc9d1d9, { ink: 0.4 }), [0, -0.26, 0.16], [Math.PI / 2, 0, 0]);
  }
  if (o.collar) {
    // cervical collar
    add(neckJ, geo.cyl(0.105, 0.115, 0.1, 18), mat(0xf1ece0, { ink: 0.6 }), [0, 0.035, 0.01]);
  }
  if (o.stripes) {
    const sm = mat(o.stripes, { ink: 0, unlit: false, shade: 0.2 });
    add(spine, geo.cyl(0.18, 0.18, 0.045, 20, true), sm, [0, 0.2, 0], null, [1.07, 1, 0.86]);
    add(spine, geo.cyl(0.18, 0.18, 0.045, 20, true), sm, [0, 0.36, 0], null, [1.07, 1, 0.86]);
  }

  // ----- arms -----
  // Each limb segment is a capsule whose round ends sit exactly on its two joints, so a straight limb
  // reads as one smooth tube and a bent one keeps a round elbow/knee instead of a seam.
  const arm = (s) => {
    const sh = grp(chest, [s * 0.215, -0.03, 0]);
    add(sh, geo.cap(0.054, 0.22, 12), top, [0, -0.11, 0]);
    const el = grp(sh, [0, -0.22, 0]);
    add(el, geo.cap(0.051, 0.2, 12), sleeve, [0, -0.1, 0]);
    if (o.sleeves !== "long") add(el, geo.sph(0.055, 12, 8), top); // sleeve hem covers the elbow
    if (o.stripes) add(el, geo.cyl(0.057, 0.057, 0.04, 12, true), mat(o.stripes, { ink: 0, shade: 0.2 }), [0, -0.1, 0]);
    const hand = grp(el, [0, -0.235, 0]);
    add(hand, geo.sph(0.064, 14, 10), skin);
    return { sh, el, hand };
  };
  // anatomical sides: facing +Z, the character's right is at -X
  const armR = arm(-1);
  const armL = arm(1);

  // ----- legs -----
  const leg = (s) => {
    const hip = grp(hips, [s * 0.088, 0, 0]);
    add(hip, geo.cap(0.072, 0.3, 12), bottom, [0, -0.15, 0]);
    const knee = grp(hip, [0, -0.3, 0]);
    add(knee, geo.cap(0.068, 0.25, 12), bottom, [0, -0.125, 0]);
    add(knee, geo.sph(0.075, 12, 8), shoes, [0, -0.285, 0.04], null, [1, 0.62, 1.6]);
    return { hip, knee };
  };
  const legR = leg(-1);
  const legL = leg(1);

  const ch = { name: id, root, hips, spine, torso, chest, neck: neckJ, head, face, armL, armR, legL, legR, o };
  ch.blinkSeed = (id.charCodeAt(0) * 7 + id.length * 13) % 97;
  return ch;
}

// ---------- acting helpers ----------

/** Mouth: open 0..1 (0 = a line), or a smile. */
export function mouth(ch, open, smile = false) {
  const f = ch.face;
  f.smile.visible = smile && open < 0.08;
  f.mouth.visible = !f.smile.visible;
  f.mouth.scale.set(1 - 0.25 * clamp(open), 0.14 + 0.86 * clamp(open), 0.22);
}

/** Eyes: openness 0..1, gaze x/y in -1..1 (pupils slide inside the whites). */
export function eyes(ch, open = 1, gx = 0, gy = 0) {
  const f = ch.face;
  for (const e of [f.eyeL, f.eyeR]) e.scale.y = Math.max(0.07, open);
  for (const p of [f.pupilL, f.pupilR]) p.position.set(gx * 0.026, gy * 0.024, 0.034 - 0.006 * (gx * gx + gy * gy));
}

/** Brows: mood -1 (worried, inner ends up) .. +1 (angry, inner ends down); lift raises both. */
export function brows(ch, mood = 0, lift = 0) {
  const f = ch.face;
  f.browL.rotation.z = Math.PI / 2 - mood * 0.38;
  f.browR.rotation.z = Math.PI / 2 + mood * 0.38;
  f.browL.position.y = f.browR.position.y = 0.128 + lift * 0.03;
}

/** A natural blink pattern from time alone: 1 = open, dips to 0 for ~0.12 s every few seconds. */
export function blink(ch, t) {
  const period = 3.1 + (ch.blinkSeed % 7) * 0.23;
  const local = (t + ch.blinkSeed * 0.37) % period;
  if (local < 0.13) return 1 - Math.sin((local / 0.13) * Math.PI);
  return 1;
}

/** Reset every joint to the neutral standing pose. */
export function rest(ch) {
  for (const j of [ch.hips, ch.spine, ch.chest, ch.neck, ch.head, ch.armL.sh, ch.armL.el, ch.armR.sh, ch.armR.el, ch.legL.hip, ch.legL.knee, ch.legR.hip, ch.legR.knee, ch.armL.hand, ch.armR.hand])
    j.rotation.set(0, 0, 0);
  ch.hips.position.set(0, 0.62, 0);
  ch.armR.sh.rotation.z = -0.1;
  ch.armL.sh.rotation.z = 0.1;
  mouth(ch, 0);
  eyes(ch, 1, 0, 0);
  brows(ch, 0, 0);
}

// ---------- the people of this story ----------

export function buildCast(kit) {
  const fernanda = makeCharacter(kit, {
    name: "fernanda",
    skin: PAL.skinB,
    top: PAL.coat,
    bottom: 0x2f3a55,
    shoes: 0x25252b,
    sleeves: "long",
    hair: { style: "bun", color: 0x141418 },
    coat: true,
    stethoscope: true,
  });
  const cida = makeCharacter(kit, {
    name: "cida",
    skin: PAL.skinC,
    top: PAL.navy,
    bottom: PAL.navy,
    shoes: 0xf2f2f2,
    sleeves: "short",
    hair: { style: "short", color: 0xb9bcc2 },
    glasses: PAL.glasses,
    vneck: true,
    pocket: 0x2a3d73,
  });
  const vanderlei = makeCharacter(kit, {
    name: "vanderlei",
    skin: PAL.skinA,
    top: 0xbfe3f2,
    bottom: 0xbfe3f2,
    shoes: PAL.skinA,
    sleeves: "short",
    hair: { style: "bald", color: 0x9a9da3 },
    moustache: 0x9a9da3,
  });
  const juliana = makeCharacter(kit, {
    name: "juliana",
    skin: PAL.skinA,
    top: 0x3f6ea8,
    bottom: 0x2b2f3a,
    shoes: 0xe8e8e8,
    sleeves: "long",
    hair: { style: "curly", color: 0x2a1a12 },
    collar: true,
  });
  const paramedic = makeCharacter(kit, {
    name: "paramedic",
    skin: PAL.skinB,
    top: 0xf07a1a,
    bottom: 0xf07a1a,
    shoes: 0x1c1c20,
    sleeves: "long",
    hair: { style: "cap", color: 0x1d2b4f },
    stripes: 0xe9f05a,
  });
  const vulto = makeVulto(kit);
  return { fernanda, cida, vanderlei, juliana, paramedic, vulto };
}

/** The figure in the alley: hood up, face a hole of shadow, one hand in the pocket. */
function makeVulto(kit) {
  const { mat, geo, add, grp } = kit;
  const cloth = mat(0x2a3142, { group: "vulto:cloth", zone: 1, shade: 0.9 });
  const pants = mat(0x13151c, { group: "vulto:pants", zone: 1 });
  const voidM = mat(0x04050a, { ink: 0.3, unlit: true });
  const root = grp(null);
  const hips = grp(root, [0, 0.68, 0]);
  const spine = grp(hips);
  add(spine, geo.cap(0.19, 0.34, 20), cloth, [0, 0.3, 0], null, [1.1, 1, 0.86]);
  // hoodie pocket bulge
  add(spine, geo.sph(0.15, 14, 10), cloth, [0, 0.12, 0.11], null, [1.25, 0.6, 0.5]);
  const chest = grp(spine, [0, 0.56, 0]);
  const head = grp(chest, [0, 0.27, 0]);
  add(head, geo.sph(0.235, 28, 20), cloth, [0, 0.01, -0.02], null, [1, 1.06, 1.04]);
  add(head, geo.sph(0.18, 24, 16), voidM, [0, -0.015, 0.105], null, [0.92, 1.05, 0.5]);
  // hood rim
  add(head, geo.torus(0.168, 0.03, Math.PI * 2, 28), cloth, [0, -0.015, 0.15], null, [0.95, 1.08, 1]);
  const arm = (s, inPocket) => {
    const sh = grp(chest, [s * 0.24, -0.04, 0]);
    add(sh, geo.cap(0.062, 0.25, 12), cloth, [0, -0.125, 0]);
    const el = grp(sh, [0, -0.25, 0]);
    add(el, geo.cap(0.059, 0.23, 12), cloth, [0, -0.115, 0]);
    const hand = grp(el, [0, -0.27, 0]);
    if (!inPocket) add(hand, geo.sph(0.066, 12, 9), mat(0x3a3f4c, { ink: 0.7, zone: 1 }));
    return { sh, el, hand };
  };
  const armR = arm(-1, false);
  const armL = arm(1, true);
  // one hand buried in the pocket
  armL.sh.rotation.set(-0.25, 0, -0.18);
  armL.el.rotation.set(-1.15, 0, -0.5);
  armR.sh.rotation.z = -0.08;
  const leg = (s) => {
    const hip = grp(hips, [s * 0.1, 0, 0]);
    add(hip, geo.cap(0.078, 0.34, 12), pants, [0, -0.17, 0]);
    const knee = grp(hip, [0, -0.34, 0]);
    add(knee, geo.cap(0.073, 0.28, 12), pants, [0, -0.14, 0]);
    add(knee, geo.sph(0.08, 12, 8), mat(0x0c0d12, { ink: 0.7, zone: 1 }), [0, -0.3, 0.045], null, [1, 0.6, 1.65]);
    return { hip, knee };
  };
  const legR = leg(-1);
  const legL = leg(1);
  return { name: "vulto", root, hips, spine, chest, head, armL, armR, legL, legR };
}
