// Small deterministic helpers: everything on screen is a pure function of time.
export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, x) => clamp((x - a) / (b - a));
export const smooth = (x) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
export const smoother = (x) => {
  x = clamp(x);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
/** 0 before a, 1 after b, smooth in between */
export const ramp = (a, b, x) => smooth(inv(a, b, x));
/** 1 inside [a,b] with soft shoulders of width w */
export const window_ = (a, b, x, w = 0.25) => ramp(a - w, a, x) * (1 - ramp(b, b + w, x));

export const ease = {
  linear: (x) => clamp(x),
  in: (x) => clamp(x) ** 2,
  out: (x) => 1 - (1 - clamp(x)) ** 2,
  inOut: smooth,
  inOut5: smoother,
  out3: (x) => 1 - (1 - clamp(x)) ** 3,
  out5: (x) => 1 - (1 - clamp(x)) ** 5,
  in3: (x) => clamp(x) ** 3,
  outBack: (x) => {
    x = clamp(x);
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
  },
  // fast whip: slow start, very fast middle, soft landing with a small overshoot
  whip: (x) => {
    x = clamp(x);
    const s = x * x * x * (x * (x * 6 - 15) + 10);
    return s + Math.sin(s * Math.PI) * 0.035 * (1 - x) * 4 * x;
  },
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 0..1 hash of a number */
export function hash1(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/** Smooth value noise in 1D, -1..1 */
export function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash1(i), hash1(i + 1), u) * 2 - 1;
}

/**
 * Piecewise track. keys: [[t, value, easeName?], ...] sorted by t.
 * The ease named on a key shapes the segment that ARRIVES at that key.
 * value may be a number or an array of numbers.
 */
export function track(keys) {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    const last = keys[keys.length - 1];
    if (t >= last[0]) return last[1];
    let i = 1;
    while (keys[i][0] < t) i++;
    const a = keys[i - 1];
    const b = keys[i];
    const e = ease[b[2] || "inOut"];
    const k = e((t - a[0]) / (b[0] - a[0]));
    if (Array.isArray(a[1])) return a[1].map((v, j) => v + (b[1][j] - v) * k);
    return a[1] + (b[1] - a[1]) * k;
  };
}

/** Step track: value holds until the next key. keys: [[t, value], ...] */
export function steps(keys) {
  return (t) => {
    let v = keys[0][1];
    for (const k of keys) {
      if (t >= k[0]) v = k[1];
      else break;
    }
    return v;
  };
}

/** A short pulse that starts at t0: fast attack, exponential decay. */
export function pulse(t, t0, attack = 0.03, decay = 0.25) {
  if (t < t0) return 0;
  const x = t - t0;
  if (x < attack) return x / attack;
  return Math.exp(-(x - attack) / decay);
}
