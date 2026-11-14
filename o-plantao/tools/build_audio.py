#!/usr/bin/env python3
"""Builds the film's sound: the narration (treated), a synthetic tension bed and the effects.

Everything is placed from the same beat table the picture uses (film/beats.js via tools/timing.mjs),
so a flash and its thump cannot drift apart. Output, in assets/audio/:

    narracao.wav   the narration, levelled, with a radio treatment on the two radio calls
    trilha.wav     the bed: low drone + pad + heartbeat, following the tension curve
    efeitos.wav    monitor, radio static, defibrillator, siren, rain, door, pop ...
    mix.wav        the three summed and limited (reference master, about -14 LUFS)

usage: python3 tools/build_audio.py <narration.mp3>
"""
import json
import os
import re
import subprocess
import sys
import wave

import numpy as np
from scipy import signal
from scipy.ndimage import maximum_filter1d

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "audio")
SR = 44100

timing = json.loads(subprocess.check_output(["node", os.path.join(ROOT, "tools", "timing.mjs")]))
T0 = timing["T0"]
DUR = timing["DURATION"]
BT = timing["beats"]
CH = timing["CHUNKS"]
CARD = timing["CARD_AT"]
S = lambda i: T0 + CH[i][0]
E = lambda i: T0 + CH[i][1]
N = int(round(DUR * SR))
t = np.arange(N) / SR
rng = np.random.default_rng(20261109)
TAU = 2 * np.pi


def db(x):
    return 10.0 ** (x / 20.0)


def curve(points):
    """Piecewise-linear envelope over the whole film from (time, value) points."""
    xs, ys = zip(*points)
    return np.interp(t, xs, ys)


def sos(kind, freqs, order=2):
    return signal.butter(order, freqs, btype=kind, fs=SR, output="sos")


def bp(x, lo, hi, order=2):
    return signal.sosfilt(sos("bandpass", [lo, hi], order), x)


def lp(x, f, order=2):
    return signal.sosfilt(sos("lowpass", f, order), x)


def hp(x, f, order=2):
    return signal.sosfilt(sos("highpass", f, order), x)


def ramp(n, a=0.005, r=0.02):
    """Attack/release window of n samples."""
    w = np.ones(n)
    na, nr = min(n, int(a * SR)), min(n, int(r * SR))
    if na > 0:
        w[:na] = np.linspace(0, 1, na)
    if nr > 0:
        w[-nr:] *= np.linspace(1, 0, nr)
    return w


def place(buf, at, sig, gain=1.0, pan=0.0):
    """Add a mono (or stereo) signal into a stereo buffer at time `at` (s). pan -1..1, equal power."""
    i = int(round(at * SR))
    if sig.ndim == 1:
        a = (pan + 1) * np.pi / 4
        sig = np.stack([sig * np.cos(a), sig * np.sin(a)], axis=1) * np.sqrt(2) * 0.7071
    if i < 0:
        sig = sig[-i:]
        i = 0
    n = min(len(sig), len(buf) - i)
    if n > 0:
        buf[i : i + n] += sig[:n] * gain


def room(sig, rt=0.6, wet=0.3, seed=1):
    """A small diffuse reverb: convolve with decaying noise. Returns stereo."""
    r = np.random.default_rng(seed)
    n = int(rt * SR)
    env = np.exp(-6.9 * np.arange(n) / n)
    ir = np.stack([r.standard_normal(n) * env, r.standard_normal(n) * env], axis=1)
    ir = signal.sosfilt(sos("bandpass", [250, 5000]), ir, axis=0)
    ir /= np.sqrt((ir**2).sum(axis=0)) + 1e-9
    if sig.ndim == 1:
        sig = np.stack([sig, sig], axis=1)
    out = np.stack([signal.fftconvolve(sig[:, c], ir[:, c]) for c in range(2)], axis=1)
    dry = np.zeros_like(out)
    dry[: len(sig)] = sig
    return dry * (1 - wet) + out * wet


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767.0).astype("<i2").tobytes())


def loudness(path):
    """Integrated loudness (LUFS) and true peak (dBTP) of a file, measured by ffmpeg."""
    err = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
        capture_output=True,
        text=True,
    ).stderr
    tail = err[err.rfind("Summary:") :]
    i = float(re.search(r"I:\s+(-?[\d.]+) LUFS", tail).group(1))
    p = float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", tail).group(1))
    return i, p


# ====================================================================== narration
def build_narration(src):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", src, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True
    ).stdout
    x = np.frombuffer(raw, dtype="<f4").astype(np.float64)
    x = hp(x, 75)

    # the two radio calls: narrow band, a little grit, static underneath
    tn = np.arange(len(x)) / SR
    wet = np.tanh(bp(x, 380, 3100, 3) * 5.0) * 0.32
    hiss = bp(rng.standard_normal(len(x)), 1200, 4200) * 0.012
    mask = np.zeros(len(x))
    for i in (2, 24):
        a, b = CH[i][0] - 0.03, CH[i][1] + 0.06
        mask = np.maximum(mask, np.clip((tn - a) / 0.03, 0, 1) * np.clip((b - tn) / 0.04, 0, 1))
    x = x * (1 - 0.88 * mask) + (wet + hiss) * 0.88 * mask

    # gentle compression: 3:1 above -24 dBFS on a 12 ms level, smoothed gain
    win = int(0.012 * SR)
    level = np.sqrt(signal.fftconvolve(x**2, np.ones(win) / win, mode="same") + 1e-12)
    over = np.maximum(20 * np.log10(level) + 24.0, 0.0)
    red = -over * (1 - 1 / 3.0)
    k = np.exp(-1.0 / (0.06 * SR))
    red = signal.lfilter([1 - k], [1, -k], red)
    x = x * db(red)
    # presence for phone speakers
    b, a = signal.iirpeak(3400, 1.1, fs=SR)
    x = x + 0.22 * signal.lfilter(b, a, x)

    out = np.zeros((N, 2))
    place(out, T0, x)
    return out


# ====================================================================== tension
# 0 = calm, 1 = the peak before the badge. The bed's level and colour follow this.
TENSION = [
    (0, 0.22), (3.4, 0.3), (7.0, 0.42), (8.0, 0.6), (10.4, 0.66), (11.1, 0.36),
    (S(9), 0.42), (S(11), 0.55), (S(13), 0.52), (S(14), 0.62), (S(15), 0.5),
    (S(16) - 0.1, 0.16), (BT["PULSE_BACK"] - 0.1, 0.12), (BT["PULSE_BACK"] + 0.6, 0.26), (S(20), 0.24), (BT["B3"] - 0.4, 0.2),
    (BT["B3"], 0.38), (S(25), 0.42), (S(29), 0.5), (BT["RED_WINDOW"], 0.62), (BT["B4"] - 0.3, 0.58),
    (BT["B4"], 0.7), (S(37), 0.74), (S(38), 0.86), (S(40), 0.92), (S(42), 1.0), (S(43) - 0.06, 1.0),
    (S(43), 0.06), (S(45), 0.08), (S(46), 0.34), (S(47), 0.5), (S(49), 0.66), (S(51), 0.8), (S(53), 0.86),
    (S(55), 0.72), (CARD - 0.1, 0.62), (CARD + 0.4, 0.46), (DUR - 1.0, 0.44), (DUR - 0.05, 0.0),
]


def osc(freq, phase=0.0):
    return np.sin(TAU * freq * t + phase)


def build_bed(duck):
    ten = curve(TENSION)
    slow = lambda rate, ph: 0.5 + 0.5 * np.sin(TAU * rate * t + ph)

    def voice(side):
        d = 0.18 * side  # the two ears are tuned a hair apart: width without phase tricks
        sub = 0.5 * osc(55.0) + 0.34 * osc(55.33 + d) + 0.36 * osc(82.41 - d) * slow(0.07, 1) + 0.3 * osc(110.0 + d) * slow(0.05, 2)
        pad = np.zeros(N)
        # dark pad: partials of A2 + E3 + A3, brighter as the tension rises (so it survives a phone speaker)
        for f0, w in ((110.0, 1.0), (164.81, 0.7), (220.0, 0.55)):
            for k in range(1, 9):
                cut = np.clip((0.25 + ten * 1.25) * 9 - k, 0, 1)
                pad += w / k**1.45 * cut * slow(0.03 + 0.011 * k, k * 1.7 + f0) * np.sin(TAU * (f0 * k * (1 + 0.0009 * k * side)) * t + k)
        # the wrong notes that creep in above half tension: a minor second and a tritone
        sour = np.zeros(N)
        g = np.clip((ten - 0.5) * 2.2, 0, 1)
        for f0, w in ((116.54, 1.0), (233.08, 0.6), (311.13, 0.5)):
            for k in range(1, 6):
                sour += w / k**1.3 * slow(0.045 * k, f0) * np.sin(TAU * (f0 * k + d * 2) * t)
        air = bp(np.random.default_rng(17 + int(side * 10)).standard_normal(N), 650, 2600) * slow(0.11, side) * (0.25 + 0.75 * ten)
        return sub * 0.5 + pad * 0.17 + sour * 0.075 * g + air * 0.03

    bed = np.stack([voice(-1), voice(1)], axis=1)
    bed *= db(-17 + 14 * ten)[:, None]

    # heartbeat: lub-dub, faster with the tension. Silent through the drop and under the end card.
    beats = []
    x = 0.4
    while x < CARD - 0.2:
        k = np.interp(x, [p[0] for p in TENSION], [p[1] for p in TENSION])
        beats.append((x, k))
        x += 60.0 / (56 + 46 * k)
    hb = np.zeros((N, 2))
    n1 = int(0.2 * SR)
    tt = np.arange(n1) / SR
    lub = np.sin(TAU * 58 * tt) * np.exp(-tt / 0.045) * ramp(n1, 0.004, 0.05)
    dub = np.sin(TAU * 72 * tt) * np.exp(-tt / 0.035) * ramp(n1, 0.004, 0.05)
    tick = bp(np.random.default_rng(3).standard_normal(n1), 500, 1300) * np.exp(-tt / 0.012)  # so a phone can hear it
    for x, k in beats:
        if k < 0.2:
            continue
        g = db(-18 + 9 * k)
        place(hb, x, lub + 0.5 * tick, g)
        place(hb, x + 0.26 - 0.06 * k, dub * 0.7 + 0.3 * tick, g)
    bed += hb

    # riser into the badge, then the floor falls away
    a, b = S(40) + 0.3, S(43) - 0.04
    m = (t >= a) & (t < b)
    x = (t[m] - a) / (b - a)
    f = 180 * (2200 / 180) ** x
    ph = TAU * np.cumsum(f) / SR
    rise = (np.sin(ph) + 0.4 * np.sin(2 * ph)) * 0.18 + bp(np.random.default_rng(5).standard_normal(m.sum()), 400, 5000) * 0.25
    rise *= x**2.2 * db(-15)
    bed[m] += rise[:, None]
    nb = int(1.1 * SR)
    tb = np.arange(nb) / SR
    boom = np.sin(TAU * (46 - 8 * tb) * tb) * np.exp(-tb / 0.32) * ramp(nb, 0.003, 0.2)
    place(bed, S(43) - 0.02, boom, db(-9))

    # the low tone that holds under the end card
    m = t >= CARD
    x = t[m] - CARD
    hold = (0.6 * np.sin(TAU * 55 * x) + 0.4 * np.sin(TAU * 110.2 * x) + 0.22 * np.sin(TAU * 164.8 * x) + 0.1 * np.sin(TAU * 220.3 * x))
    hold *= np.clip(x / 0.35, 0, 1) * np.clip((DUR - CARD - x) / 0.9, 0, 1) * db(-14)
    bed[m] += hold[:, None]

    # the bed sits well under the voice: about -35 LUFS at the start, -24 at its peak
    return bed * duck[:, None] * db(-10.5)


# ====================================================================== effects
def build_sfx(duck):
    fx = np.zeros((N, 2))

    def beep(dur=0.075, f=985.0):
        n = int(dur * SR)
        x = np.arange(n) / SR
        return (np.sin(TAU * f * x) + 0.18 * np.sin(TAU * 2 * f * x)) * ramp(n, 0.004, 0.012)

    # --- cardiac monitors: far down the corridor at first; then SALA 2's flatline; then the pulse ---
    far = np.zeros(N)
    x = 0.3
    while x < 7.2:
        i = int(x * SR)
        b = beep()
        far[i : i + len(b)] += b
        x += 1.04
    place(fx, 0, room(lp(far, 2600), 0.9, 0.55, 11)[:N], db(-31), 0)
    a, b = BT["B2"] + 0.12, BT["PULSE_BACK"] - 0.02
    m = (t >= a) & (t < b)
    flat = (np.sin(TAU * 985 * t[m]) + 0.15 * np.sin(TAU * 1970 * t[m])) * np.clip((t[m] - a) / 0.3, 0, 1) * np.clip((b - t[m]) / 0.02, 0, 1)
    fx[m] += (flat * db(-33))[:, None]
    for h in BT["HEART"]:
        if h < BT["B3"]:
            place(fx, h + 0.02, beep(0.085), db(-25))

    # --- radio: a burst of static before each call, hiss under it, a squelch tail after ---
    def static(dur, seed):
        n = int(dur * SR)
        x = bp(np.random.default_rng(seed).standard_normal(n), 900, 5200)
        crackle = 0.6 + 0.4 * (np.random.default_rng(seed + 1).standard_normal(n) > 1.2)
        return x * crackle * ramp(n, 0.006, 0.03)

    for i, (burst_at, call) in enumerate(((S(1) - 0.2, 2), (S(23) - 0.08, 24), (S(51) - 0.1, None))):
        place(fx, burst_at, static(0.42, 20 + i), db(-23))
        if call is not None:
            place(fx, S(call) - 0.05, static(E(call) - S(call) + 0.1, 40 + i), db(-37))
            place(fx, E(call) + 0.06, static(0.11, 60 + i), db(-24))
        else:
            place(fx, S(51) + 0.4, static(E(51) - S(51) - 0.4, 44), db(-39))

    # --- defibrillator: the charge whine, the discharge, the body landing ---
    def defib():
        n = int(1.35 * SR)
        x = np.arange(n) / SR
        f = 520 * (2500 / 520) ** (x / 1.35)
        ph = TAU * np.cumsum(f) / SR
        whine = (np.sin(ph) + 0.25 * np.sin(2 * ph)) * (x / 1.35) ** 1.6 * ramp(n, 0.02, 0.01) * db(-27)
        k = int(0.45 * SR)
        y = np.arange(k) / SR
        thunk = np.sin(TAU * (62 - 30 * y) * y) * np.exp(-y / 0.09) * db(-8)
        snap = bp(np.random.default_rng(9).standard_normal(k), 250, 3500) * np.exp(-y / 0.018) * db(-13)
        land = np.concatenate([np.zeros(int(0.09 * SR)), np.sin(TAU * 92 * y) * np.exp(-y / 0.05) * db(-17)])
        out = np.zeros(n + len(land))
        out[:n] += whine
        out[n : n + k] += thunk + snap
        out[n : n + len(land)] += land
        return out, 1.35

    for sh in (BT["SHOCK1"], BT["SHOCK2"]):
        d, lead = defib()
        place(fx, sh - lead, d, 1.0)

    # --- the run: feet, the rattle of the stretcher, the doors ---
    x = 7.7
    side = 1
    n = int(0.09 * SR)
    y = np.arange(n) / SR
    step = np.sin(TAU * 84 * y) * np.exp(-y / 0.022) + 0.3 * bp(np.random.default_rng(13).standard_normal(n), 700, 2400) * np.exp(-y / 0.01)
    while x < BT["DOORS_HIT"]:
        place(fx, x, step, db(-21), 0.25 * side)
        side = -side
        x += 1 / 6.0
    a, b = 7.6, BT["DOORS_HIT"] + 0.25
    m = (t >= a) & (t < b)
    rattle = bp(np.random.default_rng(17).standard_normal(m.sum()), 1500, 5200) * (0.55 + 0.45 * np.sin(TAU * 23 * t[m])) * (0.6 + 0.4 * np.abs(np.sin(TAU * 3 * t[m])))
    rattle *= np.clip((t[m] - a) / 0.4, 0, 1) * np.clip((b - t[m]) / 0.2, 0, 1) * db(-33)
    fx[m] += rattle[:, None]
    k = int(0.5 * SR)
    y = np.arange(k) / SR
    bang = np.sin(TAU * 70 * y) * np.exp(-y / 0.1) * db(-9) + bp(np.random.default_rng(19).standard_normal(k), 800, 3200) * np.exp(-y / 0.02) * db(-15)
    place(fx, BT["DOORS_HIT"], bang, 1.0)

    # --- whip pans: a breath of air ---
    def whoosh(dur=0.3, seed=1):
        n = int(dur * SR)
        y = np.arange(n) / n
        x = np.random.default_rng(seed).standard_normal(n)
        lo = lp(x, 900) * (1 - y) + bp(x, 900, 3800) * np.sin(np.pi * y) + hp(x, 3800) * y * 0.4
        return lo * np.sin(np.pi * y) ** 1.5

    for i, at in enumerate((3.5, 6.92, S(9) - 0.05, S(15) - 0.05, S(31) - 0.1, S(38) - 0.05, S(45) - 0.3)):
        place(fx, at, whoosh(0.34, 70 + i), db(-27), 0.3 if i % 2 else -0.3)

    # --- the glove coming off ---
    k = int(0.06 * SR)
    y = np.arange(k) / SR
    snap = bp(np.random.default_rng(23).standard_normal(k), 1800, 7500) * np.exp(-y / 0.008) + 0.6 * np.sin(TAU * 190 * y) * np.exp(-y / 0.015)
    place(fx, BT["GLOVE_OFF"] + 0.22, snap, db(-19), 0.15)

    # --- the red light outside has a pulse of its own ---
    k = int(0.55 * SR)
    y = np.arange(k) / SR
    throb = np.sin(TAU * (50 - 10 * y) * y) * np.exp(-y / 0.16) * ramp(k, 0.02, 0.1) + 0.12 * bp(np.random.default_rng(29).standard_normal(k), 300, 900) * np.exp(-y / 0.05)
    x = BT["RED_WINDOW"] + 0.5 / BT["RED_RATE"]
    while x < BT["RED_STOPS"] + 0.2:
        inside_bay = BT["B4"] <= x < S(40)
        if not inside_bay:
            place(fx, x - 0.03, throb, db(-17 if x < S(45) else -14))
        x += 1 / BT["RED_RATE"]

    # --- ambulance: door clunks, the stretcher rolling in, a siren somewhere far off ---
    k = int(0.3 * SR)
    y = np.arange(k) / SR
    clunk = np.sin(TAU * 95 * y) * np.exp(-y / 0.05) + 0.35 * np.sin(TAU * 1180 * y) * np.exp(-y / 0.03) + 0.3 * bp(np.random.default_rng(31).standard_normal(k), 600, 2500) * np.exp(-y / 0.015)
    place(fx, BT["B4"] + 0.2, clunk, db(-17), 0.2)
    place(fx, BT["B4"] + 0.98, clunk, db(-19), -0.2)
    a, b = E(35) - 0.45, S(36) + 1.6
    m = (t >= a) & (t < b)
    roll = bp(np.random.default_rng(37).standard_normal(m.sum()), 500, 3200) * (0.6 + 0.4 * np.sin(TAU * 17 * t[m])) * np.clip((t[m] - a) / 0.3, 0, 1) * np.clip((b - t[m]) / 0.4, 0, 1) * db(-33)
    fx[m] += roll[:, None]
    a, b = BT["B4"] - 0.0, S(42)
    m = (t >= a) & (t < b)
    x = t[m] - a
    f = 900 * 1.42 ** np.sin(TAU * x / 4.4)
    ph = TAU * np.cumsum(f) / SR
    siren = lp(np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.15 * np.sin(3 * ph), 2100)
    siren *= np.clip(x / 1.2, 0, 1) * np.interp(t[m], [a, S(38), S(40), b], [1, 1, 0.55, 0])
    place(fx, a, room(siren, 1.3, 0.6, 41)[: m.sum()], db(-33), 0.35)

    # --- rain: through the open entrance, then full when the back door opens ---
    def rain(seed):
        x = np.random.default_rng(seed).standard_normal(N)
        body = bp(x, 450, 9000) * 0.6 + lp(x, 450) * 0.25
        # droplets: sparse sharp ticks
        ticks = np.zeros(N)
        r = np.random.default_rng(seed + 100)
        idx = r.integers(0, N - 400, int(DUR * 55))
        ticks[idx] = r.uniform(0.3, 1.0, len(idx))
        drops = bp(signal.fftconvolve(ticks, np.exp(-np.arange(300) / 40.0), mode="same"), 1800, 7000)
        slow = 0.85 + 0.15 * np.sin(TAU * 0.13 * t + seed)
        return (body * 0.5 + drops * 0.9) * slow

    level = curve([
        (0, 0), (BT["B4"] - 0.01, 0), (BT["B4"] + 0.4, db(-33)), (S(38), db(-33)), (E(39), db(-47)), (S(41), db(-41)),
        (S(43), db(-36)), (BT["DOOR_PUSH"], db(-36)), (BT["DOOR_PUSH"] + 0.9, db(-26)), (S(52), db(-26)),
        (S(53), db(-30)), (S(55), db(-29)), (CARD, db(-28)), (DUR - 0.9, db(-31)), (DUR, 0),
    ])
    fx += np.stack([rain(51), rain(52)], axis=1) * level[:, None]

    # --- the back door ---
    n = int(0.85 * SR)
    y = np.arange(n) / SR
    f = 210 + 160 * np.sin(TAU * 0.9 * y) ** 2 + 30 * np.sin(TAU * 7 * y)
    ph = TAU * np.cumsum(f) / SR
    saw = signal.sawtooth(ph)
    stick = 0.5 + 0.5 * np.sign(np.sin(TAU * (26 + 14 * y) * y))
    creak = bp(saw * stick, 280, 2600) * np.sin(np.pi * np.clip(y / 0.85, 0, 1)) ** 0.7
    place(fx, BT["DOOR_PUSH"] + 0.12, room(creak, 0.5, 0.25, 53)[:n], db(-21), -0.2)

    # --- his steps in the wet ---
    k = int(0.16 * SR)
    y = np.arange(k) / SR
    splash = lp(np.random.default_rng(59).standard_normal(k), 2400) * np.exp(-y / 0.04) * ramp(k, 0.01, 0.05)
    x = S(48) + 0.25
    while x < E(50) - 0.3:
        place(fx, x, splash, db(-27), 0.1)
        x += 0.56

    # --- the end card lands with a pop ---
    k = int(0.16 * SR)
    y = np.arange(k) / SR
    f = 520 * (1250 / 520) ** np.clip(y / 0.05, 0, 1)
    pop = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-y / 0.035) * ramp(k, 0.002, 0.03)
    low = np.sin(TAU * 110 * y) * np.exp(-y / 0.05)
    place(fx, CARD, pop + 0.5 * low, db(-13))
    for i in range(2):
        place(fx, CARD + 0.24 + 0.1 * i, pop * 0.5, db(-19), 0.2 - 0.4 * i)

    return fx * duck[:, None]


# ====================================================================== main
def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    os.makedirs(OUT, exist_ok=True)
    narr = build_narration(sys.argv[1])

    # level the narration first: about -15 LUFS on its own, so the finished mix lands near -14
    tmp = os.path.join(OUT, "_narr.wav")
    write_wav(tmp, narr * 0.5)
    i, _ = loudness(tmp)
    narr *= 0.5 * db(-15.4 - i)
    narr = np.tanh(narr / 0.84) * 0.84  # soft ceiling at about -1.5 dBFS
    os.remove(tmp)

    # everything else steps back a little while he speaks
    mono = np.abs(narr[:, 0])
    k = np.exp(-1.0 / (0.12 * SR))
    act = signal.lfilter([1 - k], [1, -k], mono)
    act = np.clip(act / (np.percentile(act, 92) + 1e-9), 0, 1)
    duck = 1 - 0.34 * act

    bed = build_bed(duck)
    sfx = build_sfx(duck)

    mix = narr + bed + sfx
    write_wav(os.path.join(OUT, "_mix.wav"), mix * 0.7)
    i, p = loudness(os.path.join(OUT, "_mix.wav"))
    os.remove(os.path.join(OUT, "_mix.wav"))
    g = db(-14.0 - i) * 0.7
    narr, bed, sfx = narr * g, bed * g, sfx * g
    mix = narr + bed + sfx
    peak = np.abs(mix).max()
    print(f"pre-limit: gain {20*np.log10(g):+.1f} dB, sample peak {20*np.log10(peak):+.2f} dBFS")
    lim = 0.8  # -1.9 dBFS on samples, which keeps the true peak under -1 dBTP
    if peak > lim:
        # look-ahead limiter: hold the overshoot for a few ms either side, smooth it, divide it out.
        # The same gain goes on every stem, so the stems still sum to the mix.
        over = np.maximum(np.abs(mix).max(axis=1) / lim, 1.0)
        w = int(0.005 * SR)
        over = maximum_filter1d(over, size=4 * w + 1)
        win = np.hanning(2 * w + 1)
        over = signal.fftconvolve(over, win / win.sum(), mode="same")
        gain = 1.0 / np.maximum(over, 1.0)
        narr, bed, sfx = narr * gain[:, None], bed * gain[:, None], sfx * gain[:, None]
        mix = narr + bed + sfx
    write_wav(os.path.join(OUT, "narracao.wav"), narr)
    write_wav(os.path.join(OUT, "trilha.wav"), bed)
    write_wav(os.path.join(OUT, "efeitos.wav"), sfx)
    write_wav(os.path.join(OUT, "mix.wav"), mix)
    for name in ("narracao", "trilha", "efeitos", "mix"):
        i, p = loudness(os.path.join(OUT, name + ".wav"))
        print(f"{name:9s} {i:6.1f} LUFS  true peak {p:+.1f} dBFS")


if __name__ == "__main__":
    main()
