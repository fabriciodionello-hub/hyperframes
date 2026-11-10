// Screens drawn fresh for every frame from time alone: the cardiac monitor and the phone.
import { hash1, clamp } from "./util.js";

const GREEN = "#39ff7a";
const BG = "#0b1a12";

/** One heartbeat, x = 0..1 through the beat: a small P, a sharp QRS, a round T. Returns -1..1 (up positive). */
function beatShape(x) {
  const g = (c, w, a) => a * Math.exp(-((x - c) * (x - c)) / (2 * w * w));
  return g(0.16, 0.03, 0.12) - g(0.265, 0.012, 0.14) + g(0.3, 0.014, 1.0) - g(0.335, 0.014, 0.24) + g(0.52, 0.055, 0.26);
}

/**
 * ECG value at absolute film time `time`.
 * beats: sorted list of beat start times (the heart coming back); before the first, the line is flat.
 */
function ecgAt(time, beats) {
  let v = 0.012 * Math.sin(time * 9.0) + 0.01 * (hash1(Math.floor(time * 40)) - 0.5);
  for (let i = 0; i < beats.length; i++) {
    const t0 = beats[i];
    const len = Math.min(0.75, (beats[i + 1] ?? t0 + 0.85) - t0);
    if (time >= t0 && time < t0 + len) {
      v += beatShape((time - t0) / len);
      break;
    }
  }
  return v;
}

/**
 * state = { t, beats: [times], hr: number|null, flicker: 0..1, alarm: bool, warm: 0..1 }
 */
export function drawMonitor(screen, state) {
  const { ctx, canvas } = screen;
  const w = canvas.width;
  const h = canvas.height;
  const t = state.t;
  // power glitch: the whole screen blinks out for a few frames
  const fl = state.flicker ?? 0;
  const dark = fl > 0 && hash1(Math.floor(t * 30) * 1.7) < fl * 0.75;
  ctx.fillStyle = dark ? "#020604" : BG;
  ctx.fillRect(0, 0, w, h);
  if (dark) {
    ctx.fillStyle = "rgba(57,255,122,0.25)";
    ctx.fillRect(0, h * (0.2 + 0.6 * hash1(Math.floor(t * 30))), w, 3);
    screen.update();
    return;
  }
  // grid
  ctx.strokeStyle = "rgba(57,255,122,0.10)";
  ctx.lineWidth = 2;
  for (let x = 0; x <= w; x += 52) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += 52) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  // trace: a sweep that rewrites the screen every `period` seconds
  const traceW = w * 0.68;
  const x0 = 18;
  const period = 3.2;
  const head = ((t % period) / period) * traceW;
  const base = h * 0.5;
  const amp = h * 0.3;
  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 7;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowColor = GREEN;
  ctx.shadowBlur = 14;
  const gap = 26;
  const draw = (xa, xb) => {
    ctx.beginPath();
    let first = true;
    for (let x = xa; x <= xb; x += 2) {
      // how long ago this column was written
      const age = (((head - x) % traceW) + traceW) % traceW;
      const tx = t - (age / traceW) * period;
      const y = base - ecgAt(tx, state.beats) * amp;
      if (first) {
        ctx.moveTo(x0 + x, y);
        first = false;
      } else ctx.lineTo(x0 + x, y);
    }
    ctx.stroke();
  };
  draw(0, Math.max(0, head));
  if (head + gap < traceW) draw(head + gap, traceW);
  ctx.shadowBlur = 0;
  // write head dot
  ctx.fillStyle = "#d8ffe6";
  ctx.beginPath();
  ctx.arc(x0 + head, base - ecgAt(t, state.beats) * amp, 9, 0, Math.PI * 2);
  ctx.fill();

  // side panel: heart rate, saturation
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = GREEN;
  ctx.font = "800 30px Montserrat, sans-serif";
  ctx.fillText("ECG II", 22, 44);
  ctx.fillText("FC", w * 0.745, 60);
  const flat = state.hr == null;
  const blinkOn = Math.floor(t * 2.5) % 2 === 0;
  ctx.font = "900 132px Montserrat, sans-serif";
  ctx.fillStyle = flat ? "#ff3b30" : GREEN;
  ctx.textAlign = "center";
  ctx.fillText(flat ? "0" : String(Math.round(state.hr)), w * 0.86, 185);
  ctx.textAlign = "left";
  ctx.font = "800 30px Montserrat, sans-serif";
  ctx.fillStyle = "#3fe0ff";
  ctx.fillText("SpO₂", w * 0.745, 262);
  ctx.font = "900 78px Montserrat, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(flat ? "--" : String(Math.round(state.spo2 ?? 90)), w * 0.86, 345);
  // heart icon beats with the pulse
  if (!flat) {
    const last = state.beats.filter((b) => b <= t).pop();
    const k = last === undefined ? 0 : clamp(1 - (t - last) / 0.25);
    const s = 16 + 9 * k;
    ctx.fillStyle = "#ff3b30";
    const cx = w * 0.955;
    const cy = 50;
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.9);
    ctx.bezierCurveTo(cx - s * 1.6, cy - s * 0.2, cx - s * 0.6, cy - s * 1.3, cx, cy - s * 0.4);
    ctx.bezierCurveTo(cx + s * 0.6, cy - s * 1.3, cx + s * 1.6, cy - s * 0.2, cx, cy + s * 0.9);
    ctx.fill();
  }
  // alarm banner
  if (state.alarm && blinkOn) {
    ctx.fillStyle = "#ff3b30";
    ctx.fillRect(18, h - 86, traceW - 8, 64);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 44px Montserrat, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ASSISTOLIA", 18 + (traceW - 8) / 2, h - 39);
  } else if (!flat) {
    ctx.fillStyle = "rgba(57,255,122,0.9)";
    ctx.font = "800 34px Montserrat, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("RITMO SINUSAL", 22, h - 40);
  }
  screen.update();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx, text, maxW) {
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  for (const wd of words) {
    const next = cur ? cur + " " + wd : wd;
    if (ctx.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = wd;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * The chat with Marcos. Static content; `pulse` (0..1) makes the last message glow as it is read.
 */
export function drawPhone(screen, state) {
  const { ctx, canvas } = screen;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#ece5dd";
  ctx.fillRect(0, 0, w, h);
  // status bar + header
  ctx.fillStyle = "#054d44";
  ctx.fillRect(0, 0, w, 62);
  ctx.fillStyle = "#075e54";
  ctx.fillRect(0, 62, w, 150);
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 34px Montserrat, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("02:52", 28, 33);
  // signal: empty bars with a cross = no connection
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(w - 150 + i * 16, 44 - i * 7, 10, 8 + i * 7);
  }
  ctx.strokeStyle = "#ff5a4f";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(w - 156, 14);
  ctx.lineTo(w - 86, 52);
  ctx.stroke();
  // battery
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 4;
  ctx.strokeRect(w - 70, 20, 44, 24);
  ctx.fillStyle = "#fff";
  ctx.fillRect(w - 66, 24, 22, 16);
  // back arrow, avatar (a silhouette: Marcos is never seen), name, status
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(48, 118);
  ctx.lineTo(24, 137);
  ctx.lineTo(48, 156);
  ctx.stroke();
  ctx.fillStyle = "#cfd9df";
  ctx.beginPath();
  ctx.arc(118, 137, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(118, 137, 46, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#8d9aa3";
  ctx.beginPath();
  ctx.arc(118, 124, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(118, 176, 34, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#fff";
  ctx.font = "900 52px Montserrat, sans-serif";
  ctx.fillText("Marcos", 186, 118);
  ctx.fillStyle = "#ff8a80";
  ctx.font = "800 34px Montserrat, sans-serif";
  ctx.fillText("sem conexão", 186, 168);

  // day chip
  ctx.fillStyle = "#d4eaf4";
  roundRect(ctx, w / 2 - 70, 236, 140, 48, 14);
  ctx.fill();
  ctx.fillStyle = "#4a5a63";
  ctx.font = "800 28px Montserrat, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("HOJE", w / 2, 261);

  // his last message
  const pulse = state.pulse ?? 0;
  ctx.font = "800 47px Montserrat, sans-serif";
  ctx.textAlign = "left";
  const msg = "Dieg, tem um carro de luz apagada lá no fundo. Vou dar uma olhada.";
  const maxW = w * 0.74;
  const lines = wrap(ctx, msg, maxW - 56);
  const lh = 60;
  const bh = lines.length * lh + 86;
  const by = 312;
  if (pulse > 0) {
    ctx.fillStyle = `rgba(245,197,24,${0.55 * pulse})`;
    roundRect(ctx, 14, by - 10, maxW + 20, bh + 20, 30);
    ctx.fill();
  }
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 24, by, maxW, bh, 24);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(24, by + 4);
  ctx.lineTo(2, by + 2);
  ctx.lineTo(30, by + 34);
  ctx.fill();
  ctx.fillStyle = "#111b21";
  lines.forEach((l, i) => ctx.fillText(l, 52, by + 52 + i * lh));
  ctx.fillStyle = "#7b8a93";
  ctx.font = "700 28px Montserrat, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("02:11", 24 + maxW - 26, by + bh - 30);

  // Diego's replies: one tick, never delivered
  const out = (text, time, y, pending) => {
    ctx.font = "800 44px Montserrat, sans-serif";
    ctx.textAlign = "left";
    const tw = ctx.measureText(text).width;
    const bw = tw + 190;
    const x = w - 24 - bw;
    ctx.fillStyle = "#dcf8c6";
    roundRect(ctx, x, y, bw, 96, 24);
    ctx.fill();
    ctx.fillStyle = "#111b21";
    ctx.fillText(text, x + 28, y + 50);
    ctx.fillStyle = "#7b8a93";
    ctx.font = "700 26px Montserrat, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(time, x + bw - 62, y + 66);
    ctx.strokeStyle = "#7b8a93";
    ctx.lineWidth = 5;
    ctx.beginPath();
    if (pending) {
      ctx.arc(x + bw - 34, y + 62, 13, 0, Math.PI * 2);
      ctx.moveTo(x + bw - 34, y + 54);
      ctx.lineTo(x + bw - 34, y + 62);
      ctx.lineTo(x + bw - 27, y + 66);
    } else {
      ctx.moveTo(x + bw - 46, y + 62);
      ctx.lineTo(x + bw - 38, y + 70);
      ctx.lineTo(x + bw - 22, y + 52);
    }
    ctx.stroke();
  };
  out("Marcos??", "02:41", by + bh + 34, false);
  out("Cadê você?", "02:50", by + bh + 150, true);

  // input bar
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 20, h - 108, w - 150, 84, 42);
  ctx.fill();
  ctx.fillStyle = "#9aa7b0";
  ctx.font = "700 36px Montserrat, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Mensagem", 56, h - 64);
  ctx.fillStyle = "#075e54";
  ctx.beginPath();
  ctx.arc(w - 66, h - 66, 44, 0, Math.PI * 2);
  ctx.fill();
  screen.update();
}
