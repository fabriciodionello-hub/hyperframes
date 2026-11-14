#!/usr/bin/env node
// Writes the caption clips into index.html from the timing table in film/narration.js.
// Each caption is a hard cut (no animation): on a beat before its first word, off when the
// next one starts or shortly after its last word.
//
//   node tools/build_captions.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CAPTIONS, T0, CARD_AT, DURATION } from "../film/narration.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "index.html");
const LEAD = 0.05; // shown this long before the word is spoken
const TAIL = 0.3; // held this long after the last word, unless the next caption arrives first
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const r2 = (x) => Math.round(x * 100) / 100;

const cues = CAPTIONS.map(([a, b, text, kind]) => ({ on: T0 + a - LEAD, off: T0 + b + TAIL, text, kind }));
for (let i = 0; i < cues.length; i++) {
  const next = i + 1 < cues.length ? cues[i + 1].on : CARD_AT;
  cues[i].off = Math.min(cues[i].off, next);
}

const lines = cues.map((c, i) => {
  const id = `cap-${String(i + 1).padStart(2, "0")}`;
  const cls = c.kind === "radio" ? "clip cap radio" : "clip cap";
  const body = c.kind === "radio" ? `<i>📻</i>${esc(c.text)}` : esc(c.text);
  return `        <div id="${id}" class="${cls}" data-start="${r2(c.on)}" data-duration="${r2(c.off - c.on)}" data-track-index="3"><span>${body}</span></div>`;
});

let html = fs.readFileSync(file, "utf8");
const a = html.indexOf("<!-- captions:start -->");
const b = html.indexOf("<!-- captions:end -->");
if (a < 0 || b < 0) throw new Error("caption markers not found in index.html");
html = html.slice(0, a) + "<!-- captions:start -->\n" + lines.join("\n") + "\n        " + html.slice(b);
// keep the composition length and the end card in step with the timing table
html = html.replace(/(id="root"[\s\S]*?data-duration=")[\d.]+(")/, `$1${DURATION}$2`);
html = html.replace(/(id="film"[^>]*data-duration=")[\d.]+(")/, `$1${DURATION}$2`);
html = html.replace(/(id="card"[^>]*data-start=")[\d.]+("\s+data-duration=")[\d.]+(")/, `$1${r2(CARD_AT)}$2${r2(DURATION - CARD_AT)}$3`);
html = html.replace(/const CARD = [\d.]+;/, `const CARD = ${r2(CARD_AT)};`).replace(/const END = [\d.]+;/, `const END = ${DURATION};`);
fs.writeFileSync(file, html);
console.log(`${cues.length} captions written; longest text ${Math.max(...cues.map((c) => c.text.length))} chars; card at ${r2(CARD_AT)} s; film ${DURATION} s`);
