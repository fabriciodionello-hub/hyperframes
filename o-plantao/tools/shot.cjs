#!/usr/bin/env node
// Dev frame grabber: serves the project, drives it the way the HyperFrames runtime does
// (seek the registered GSAP timeline, toggle .clip visibility, fire hf-seek) and saves stills.
//
//   node tools/shot.cjs --at 1,2.5,10 [--out dir] [--page index.html] [--scale 0.5] [--sheet name.jpg] [--query a=b]
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[++i] : true;
}
const root = path.resolve(__dirname, "..");
const outDir = path.resolve(args.out || path.join(root, ".shots"));
const pageName = args.page || "index.html";
const times = String(args.at || "0").split(",").map(Number);
const scale = Number(args.scale || 1);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2", ".ttf": "font/ttf", ".png": "image/png", ".jpg": "image/jpeg", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".svg": "image/svg+xml" };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(req.url.split("?")[0]);
      const f = path.join(root, u === "/" ? "index.html" : u);
      if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        res.writeHead(404);
        return res.end("not found");
      }
      res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const srv = await serve();
  const port = srv.address().port;
  const browser = await chromium.launch(
    process.env.GLMODE === "llvmpipe"
      ? { channel: "chromium", args: ["--use-gl=angle", "--use-angle=gl", "--ignore-gpu-blocklist", "--no-sandbox"] }
      : { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  );
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") errors.push(`[${m.type()}] ${m.text()}`);
    else if (args.verbose) console.log("[page]", m.text());
  });
  page.on("pageerror", (e) => errors.push("[pageerror] " + e.message));
  await page.addInitScript(() => {
    window.__timelines = window.__timelines || {};
    window.__hf = window.__hf || {};
    window.__hf.buildReady = window.__hf.buildReady || {};
  });
  const q = args.query ? "?" + args.query : "";
  await page.goto(`http://127.0.0.1:${port}/${pageName}${q}`, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Object.values(window.__hf.buildReady || {}));
  });
  const files = [];
  for (const t of times) {
    const t0 = Date.now();
    const ms = await page.evaluate((t) => {
      const s = performance.now();
      for (const tl of Object.values(window.__timelines || {})) tl.seek && tl.seek(t, false);
      document.querySelectorAll("[data-start]").forEach((el) => {
        if (el.id === "root" || el.tagName === "AUDIO") return;
        const a = parseFloat(el.dataset.start);
        const d = parseFloat(el.dataset.duration);
        el.style.visibility = t >= a && t < a + d ? "visible" : "hidden";
      });
      window.dispatchEvent(new CustomEvent("hf-seek", { detail: { time: t, waitUntil() {} } }));
      const c = document.querySelector("canvas");
      if (c) {
        const gl = c.getContext("webgl2");
        if (gl) gl.finish();
      }
      return performance.now() - s;
    }, t);
    const name = `f_${t.toFixed(2).padStart(7, "0")}.png`;
    const file = path.join(outDir, name);
    await page.screenshot({ path: file });
    if (scale !== 1) {
      const small = file.replace(".png", ".jpg");
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-vf", `scale=iw*${scale}:-1:flags=lanczos`, "-q:v", "3", small]);
      fs.unlinkSync(file);
      files.push(small);
    } else files.push(file);
    console.log(`t=${t} draw=${ms.toFixed(0)}ms total=${Date.now() - t0}ms -> ${files[files.length - 1]}`);
  }
  if (args.sheet && files.length > 1) {
    const cols = Math.min(Number(args.cols || 4), files.length);
    const rows = Math.ceil(files.length / cols);
    const inputs = files.flatMap((f) => ["-i", f]);
    const tw = Number(args.tile || 360);
    const filt = files.map((_, i) => `[${i}:v]scale=${tw}:-1[s${i}]`).join(";") + ";" + files.map((_, i) => `[s${i}]`).join("") + `xstack=inputs=${files.length}:layout=` + files.map((_, i) => `${(i % cols) * tw}_${Math.floor(i / cols) * Math.round((tw * 1920) / 1080)}`).join("|") + ":fill=black[v]";
    const sheet = path.join(outDir, args.sheet);
    execFileSync("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", filt, "-map", "[v]", "-q:v", "3", sheet]);
    console.log("sheet ->", sheet, `${cols}x${rows}`);
  }
  if (errors.length) console.log("PAGE MESSAGES:\n" + [...new Set(errors)].slice(0, 30).join("\n"));
  await browser.close();
  srv.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
