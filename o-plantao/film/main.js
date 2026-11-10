// Entry point: builds the world once, then draws any moment of the film from its time alone.
// HyperFrames seeks frame by frame (and out of order), so renderAt(t) keeps no state between calls.
import * as THREE from "three";
import { createEngine } from "./engine.js";
import { createKit } from "./kit.js";
import { buildWorld } from "./world.js";
import { buildOutside } from "./outside.js";
import { buildCast } from "./cast.js";
import { buildPov } from "./pov.js";
import { createDirector } from "./direction.js";

const canvas = document.getElementById("film");
const q = new URLSearchParams(location.search);

async function build() {
  // canvas-drawn signs and screens need the faces loaded before the first draw
  await Promise.all(
    ["800 40px Montserrat", "900 40px Montserrat", "700 40px Montserrat"].map((f) => document.fonts.load(f, "ÁÉÍÓÚÃÕÇ abc 0123")),
  );
  const engine = createEngine(canvas, { scale: Number(q.get("scale") || 1) });
  const kit = createKit(engine);
  const scene = new THREE.Scene();
  const world = buildWorld(kit, scene);
  const outside = buildOutside(kit, scene);
  const cast = buildCast(kit);
  for (const ch of Object.values(cast)) scene.add(ch.root);
  const pov = buildPov(kit);
  scene.add(pov.rig, pov.body);
  const director = createDirector({ engine, kit, scene, world, outside, cast, pov });

  // ?cam=x,y,z,yaw°,pitch°,f  freezes the story and looks from there (for checking the sets)
  const cam = q.get("cam") ? q.get("cam").split(",").map(Number) : null;

  function renderAt(t) {
    director.apply(t);
    if (cam) {
      engine.pov.position.set(cam[0], cam[1], cam[2]);
      engine.pov.rotation.set(THREE.MathUtils.degToRad(cam[4] || 0), THREE.MathUtils.degToRad(cam[3] || 0), 0);
      engine.setLens(cam[5] || 0.66);
      director.syncPov(t, true);
    }
    engine.render(scene);
  }

  window.renderAt = renderAt;
  window.__film = { engine, director, world, outside, cast, pov, scene };
  window.addEventListener("hf-seek", (e) => renderAt(e.detail.time));
  renderAt(Number(q.get("t") || 0));
}

window.__hf = window.__hf || {};
window.__hf.buildReady = window.__hf.buildReady || {};
window.__hf.buildReady.film = build();
