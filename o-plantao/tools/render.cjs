#!/usr/bin/env node
// Frame-accurate local render, for machines without a GPU.
//
// Drives index.html exactly the way the HyperFrames runtime does (seek the registered timeline, show
// the clips whose time has come, fire hf-seek), screenshots every frame and pipes them to FFmpeg.
// Chrome runs on Mesa llvmpipe through tools/x.sh, which is several times faster than SwiftShader here.
// `npx hyperframes render` renders the same project; this is simply the quick path on a CPU-only box.
//
//   tools/x.sh tools/render.cjs --out renders/parte1_o_plantao.mp4 [--start 0] [--end 109] [--workers 3]
//                               [--fps 30] [--crf 20] [--audio assets/audio/mix.wav] [--scale 1]
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn, execFileSync } = require("child_process");
const { chromium } = require("playwright");

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[++i] : true;
}
const root = path.resolve(__dirname, "..");
const fps = Number(args.fps || 30);
const start = Number(args.start || 0);
const scale = Number(args.scale || 1);
const crf = String(args.crf || 20);
const out = path.resolve(root, args.out || "renders/out.mp4");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".woff2": "font/woff2", ".ttf": "font/ttf", ".png": "image/png", ".wav": "audio/wav", ".mp3": "audio/mpeg" };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const f = path.join(root, decodeURIComponent(req.url.split("?")[0]));
      if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        res.writeHead(404);
        return res.end();
      }
      // media is muxed by FFmpeg, the page never needs to play it
      if (/\.(wav|mp3|m4a)$/.test(f)) {
        res.writeHead(204);
        return res.end();
      }
      res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

async function duration(page) {
  return page.evaluate(() => parseFloat(document.getElementById("root").dataset.duration));
}

/** Render frames [f0, f1) to a video-only file. */
async function renderSegment(f0, f1, file, label) {
  const srv = await serve();
  const browser = await chromium.launch(
    process.env.GLMODE === "llvmpipe"
      ? { channel: "chromium", args: ["--use-gl=angle", "--use-angle=gl", "--ignore-gpu-blocklist", "--no-sandbox"] }
      : { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
  );
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error(`[${label}] pageerror`, e.message));
  await page.addInitScript(() => {
    window.__timelines = window.__timelines || {};
    window.__hf = window.__hf || {};
    window.__hf.buildReady = window.__hf.buildReady || {};
  });
  await page.goto(`http://127.0.0.1:${srv.address().port}/index.html${scale !== 1 ? "?scale=" + scale : ""}`, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Object.values(window.__hf.buildReady || {}));
  });
  const W = Math.round(1080 * scale);
  const H = Math.round(1920 * scale);
  const ff = spawn(
    "ffmpeg",
    [
      "-v", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
      "-vf", `scale=${W}:${H}:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", crf, "-pix_fmt", "yuv420p",
      "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
      "-an", file,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const done = new Promise((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg exited " + c)))));
  const t0 = Date.now();
  for (let f = f0; f < f1; f++) {
    const t = f / fps;
    await page.evaluate((t) => {
      for (const tl of Object.values(window.__timelines || {})) tl.seek && tl.seek(t, false);
      document.querySelectorAll("[data-start]").forEach((el) => {
        if (el.id === "root" || el.tagName === "AUDIO") return;
        const a = parseFloat(el.dataset.start);
        const d = parseFloat(el.dataset.duration);
        el.style.visibility = t >= a && t < a + d ? "visible" : "hidden";
      });
      window.dispatchEvent(new CustomEvent("hf-seek", { detail: { time: t, waitUntil() {} } }));
    }, t);
    const png = await page.screenshot({ type: "png" });
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
    const n = f - f0 + 1;
    if (n % 150 === 0 || f === f1 - 1) {
      const el = (Date.now() - t0) / 1000;
      console.log(`[${label}] ${n}/${f1 - f0} frames  ${(n / el).toFixed(2)} fps  eta ${Math.round(((f1 - f0 - n) / n) * el)} s`);
    }
  }
  ff.stdin.end();
  await done;
  await browser.close();
  srv.close();
}

(async () => {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (args.segment) {
    // worker mode: --segment f0,f1 --file path
    const [f0, f1] = args.segment.split(",").map(Number);
    await renderSegment(f0, f1, args.file, args.label || "w");
    return;
  }
  // find the film length from the composition itself
  const srv = await serve();
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html`, { waitUntil: "domcontentloaded" });
  const total = await duration(p);
  await b.close();
  srv.close();
  const end = Math.min(Number(args.end || total), total);
  const f0 = Math.round(start * fps);
  const f1 = Math.round(end * fps);
  const workers = Math.max(1, Math.min(Number(args.workers || 3), f1 - f0));
  const tmp = path.join(path.dirname(out), ".seg-" + path.basename(out, ".mp4"));
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const per = Math.ceil((f1 - f0) / workers);
  const files = [];
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: workers }, (_, i) => {
      const a = f0 + i * per;
      const z = Math.min(f1, a + per);
      if (a >= z) return null;
      const file = path.join(tmp, `seg${String(i).padStart(2, "0")}.mp4`);
      files.push(file);
      return new Promise((res, rej) => {
        const c = spawn(process.execPath, [__filename, "--segment", `${a},${z}`, "--file", file, "--label", `w${i}`, "--fps", String(fps), "--crf", crf, "--scale", String(scale)], {
          stdio: "inherit",
          env: { ...process.env, LP_NUM_THREADS: String(Math.max(1, Math.floor(4 / workers))) },
        });
        c.on("close", (code) => (code === 0 ? res() : rej(new Error(`worker ${i} exited ${code}`))));
      });
    }),
  );
  const list = path.join(tmp, "list.txt");
  fs.writeFileSync(list, files.sort().map((f) => `file '${f}'`).join("\n"));
  const audio = args.audio === "none" ? null : path.resolve(root, args.audio || "assets/audio/mix.wav");
  const cmd = ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list];
  if (audio && fs.existsSync(audio)) {
    cmd.push("-ss", String(start), "-t", String(end - start), "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2", "-shortest");
  } else cmd.push("-c", "copy");
  cmd.push("-movflags", "+faststart", out);
  execFileSync("ffmpeg", cmd, { stdio: "inherit" });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`done: ${out}  (${f1 - f0} frames in ${Math.round((Date.now() - t0) / 1000)} s)`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
