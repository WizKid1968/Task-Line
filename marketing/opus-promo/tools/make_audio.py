"""Builds the promo's music bed and sound effects from scratch (no samples, no licences).

Run: python3 -I tools/make_audio.py   (from marketing/opus-promo)
Writes assets/audio/music.wav and assets/audio/sfx.wav (44.1 kHz stereo, 42 s).
Scene timings here must match index.html (120 BPM: one bar = 2 s).
"""
import math
import wave
from pathlib import Path

import numpy as np

SR = 44100
DUR = 42.0
N = int(SR * DUR)
BEAT = 0.5  # 120 BPM
OUT = Path(__file__).resolve().parent.parent / "assets" / "audio"
rng = np.random.default_rng(7)  # seeded, so every build is identical


def t_axis(n):
    return np.arange(n) / SR


def env_adsr(n, a, d, s, r):
    e = np.ones(n) * s
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na = min(na, n)
    e[:na] = np.linspace(0, 1, na, endpoint=False)
    nd = min(nd, n - na)
    e[na:na + nd] = np.linspace(1, s, nd, endpoint=False)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def lowpass(x, cutoff):
    """One-pole low-pass; cutoff may be a number or an array (sweeps)."""
    c = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    a = np.exp(-2 * math.pi * c / SR)
    y = np.empty_like(x)
    prev = 0.0
    for i in range(len(x)):
        prev = (1 - a[i]) * x[i] + a[i] * prev
        y[i] = prev
    return y


def saw(freq, n, detune=0.0):
    t = t_axis(n)
    out = np.zeros(n)
    for d in (-detune, 0.0, detune):
        f = freq * (1 + d)
        out += 2 * ((t * f) % 1.0) - 1
    return out / 3


def place(buf, sig, at, gain=1.0):
    i = int(at * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * gain


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


music = np.zeros(N)

# Chords (A minor feel), one per bar: Am, F, Dm, E
chords = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]]
bass_roots = [45, 41, 38, 40]

# Pad: whole piece, slow attack, filter opens with the arc
pad = np.zeros(N)
for bar in range(int(DUR / 2)):
    ch = chords[bar % 4]
    n = int(2.2 * SR)
    seg = sum(saw(midi(m), n, 0.004) for m in ch) / 3
    seg *= env_adsr(n, 0.6, 0.4, 0.8, 0.6)
    place(pad, seg, bar * 2.0)
t = t_axis(N)
cut = np.interp(t, [0, 8, 22, 28, 36, 42], [500, 900, 1400, 900, 2200, 600])
pad_gain = np.interp(t, [0, 7.8, 8.2, 35.8, 36.2, 42], [0.85, 0.85, 0.34, 0.34, 0.6, 0.6])
music += lowpass(pad, cut) * pad_gain

# Sub bass on eighths, 8 s to 36 s (softer from 22 s to 28 s for tension)
for k in range(int(8 / (BEAT / 2)), int(36 / (BEAT / 2))):
    at = k * BEAT / 2
    bar = int(at // 2)
    f = midi(bass_roots[bar % 4] - 12)
    n = int(0.22 * SR)
    s = np.sin(2 * math.pi * f * t_axis(n)) + 0.3 * np.sin(4 * math.pi * f * t_axis(n))
    g = 0.18 if 22 <= at < 28 else 0.34
    place(music, s * env_adsr(n, 0.005, 0.08, 0.5, 0.1), at, g)

# Kick on quarters: 8-22 and 28-36; half-time in the 22-28 tension section
def kick():
    n = int(0.35 * SR)
    tt = t_axis(n)
    f = 45 + 110 * np.exp(-tt * 28)
    ph = 2 * math.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-tt * 9)

K = kick()
for k in range(int(8 / BEAT), int(36 / BEAT)):
    at = k * BEAT
    if 22 <= at < 28 and k % 2:
        continue
    place(music, K, at, 0.55)

# Hats on off-beats from 14 s to 36 s
def hat():
    n = int(0.05 * SR)
    noise = rng.standard_normal(n)
    hp = noise - lowpass(noise, 6000)
    return hp * np.exp(-t_axis(n) * 70)

for k in range(int(14 / BEAT), int(36 / BEAT)):
    place(music, hat(), k * BEAT + BEAT / 2, 0.16)

# Arp: sixteenth plucks of chord tones, 14-22 and 28-36
def pluck(f):
    n = int(0.18 * SR)
    s = saw(f, n, 0.002)
    return lowpass(s, 3200) * np.exp(-t_axis(n) * 16)

pattern = [0, 1, 2, 1, 2, 0, 1, 2]
for k in range(int(14 / (BEAT / 2)), int(36 / (BEAT / 2))):
    at = k * BEAT / 2
    if 22 <= at < 28:
        continue
    bar = int(at // 2)
    note = chords[bar % 4][pattern[k % 8]] + 12
    place(music, pluck(midi(note)), at, 0.10)

# Riser into the 36 s logo hit
n = int(4 * SR)
noise = rng.standard_normal(n)
sweep = np.linspace(400, 9000, n)
riser = (noise - lowpass(noise, sweep)) * np.linspace(0, 1, n) ** 2
place(music, riser, 32.0, 0.10)

# Outro: final chord ring from 36 s, then fade 40-42
n = int(6 * SR)
final = sum(saw(midi(m), n, 0.005) for m in [45, 57, 60, 64]) / 4
music_end = lowpass(final * env_adsr(n, 0.02, 1.5, 0.5, 3.0), 1800) * 0.8
place(music, music_end, 36.0)
fade = np.ones(N)
i40 = int(40 * SR)
fade[i40:] = np.linspace(1, 0, N - i40)
music *= fade
fade_in = np.minimum(1, t / 0.4)
music *= fade_in

# ---------------- Sound effects ----------------
sfx = np.zeros(N)


def impact():
    n = int(1.6 * SR)
    tt = t_axis(n)
    f = 38 + 70 * np.exp(-tt * 10)
    boom = np.sin(2 * math.pi * np.cumsum(f) / SR) * np.exp(-tt * 3)
    noise = rng.standard_normal(n)
    crack = lowpass(noise, 2500) * np.exp(-tt * 18)
    return boom * 0.9 + crack * 0.5


def whoosh(length=0.6, up=True):
    n = int(length * SR)
    noise = rng.standard_normal(n)
    sweep = np.linspace(300, 5000, n) if up else np.linspace(5000, 300, n)
    body = lowpass(noise, sweep)
    shape = np.sin(np.linspace(0, math.pi, n)) ** 2
    return body * shape


def blip(freq=1320, length=0.09):
    n = int(length * SR)
    tt = t_axis(n)
    return np.sin(2 * math.pi * freq * tt) * np.exp(-tt * 40)


def chime():
    n = int(1.0 * SR)
    tt = t_axis(n)
    s = sum(np.sin(2 * math.pi * midi(m) * tt) * np.exp(-tt * (3 + i)) for i, m in enumerate([76, 83, 88]))
    return s / 3


def click():
    n = int(0.06 * SR)
    tt = t_axis(n)
    noise = rng.standard_normal(n)
    return (noise - lowpass(noise, 3000)) * np.exp(-tt * 120) + np.sin(2 * math.pi * 180 * tt) * np.exp(-tt * 60)


def bubble(up=True):
    n = int(0.12 * SR)
    tt = t_axis(n)
    f = np.linspace(700, 1400, n) if up else np.linspace(1200, 800, n)
    return np.sin(2 * math.pi * np.cumsum(f) / SR) * np.exp(-tt * 25)


# S1 boot
place(sfx, impact(), 0.05, 0.55)
for k, at in enumerate([0.5, 0.75, 1.0, 1.25]):
    place(sfx, blip(880 + 220 * k, 0.06), at, 0.22)
place(sfx, impact(), 2.5, 0.75)
# Scene changes
for at in [3.75, 7.75, 13.75, 21.75, 27.75, 31.75]:
    place(sfx, whoosh(0.55), at - 0.1, 0.32)
# S2 acronym letters
for k, at in enumerate([4.4, 5.0, 5.6, 6.2]):
    place(sfx, blip(990 + 110 * k), at, 0.3)
# S3 phone
place(sfx, whoosh(0.4, up=False), 9.2, 0.2)
place(sfx, bubble(True), 10.0, 0.35)
place(sfx, bubble(False), 11.6, 0.35)
place(sfx, bubble(False), 12.6, 0.35)
# S4 capability tiles
for k in range(6):
    place(sfx, blip(1100 + 60 * k, 0.07), 15.0 + 0.9 * k, 0.28)
# S5 ask first
place(sfx, bubble(False), 23.0, 0.35)
place(sfx, bubble(True), 24.6, 0.35)
place(sfx, click(), 25.4, 0.6)
place(sfx, chime(), 26.0, 0.4)
# S6 shield lines
for at in [28.4, 29.2, 30.0]:
    place(sfx, blip(1500, 0.07), at, 0.25)
# S7 kinetic words
place(sfx, impact(), 34.6, 0.45)
# S8 logo
place(sfx, impact(), 36.0, 0.85)
place(sfx, chime(), 38.2, 0.3)


def to_stereo_wav(sig, path, width=0.002):
    peak = np.max(np.abs(sig)) or 1.0
    sig = sig / peak * 0.89
    delay = int(width * SR)
    left = sig
    right = np.concatenate([np.zeros(delay), sig[:-delay]])
    data = np.stack([left, right], axis=1)
    pcm = (np.clip(data, -1, 1) * 32767).astype("<i2")
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


to_stereo_wav(music, OUT / "music.wav")
to_stereo_wav(sfx, OUT / "sfx.wav", width=0.0005)
print("wrote", OUT / "music.wav", OUT / "sfx.wav")
