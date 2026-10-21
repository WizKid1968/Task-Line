"""OPUS promo v2 soundtrack: Fish Audio voice-over + generated music + sound effects,
mixed into one track (music dips under the voice). No samples, no licences.

Run from marketing/opus-promo/v2:  python3 -I tools/make_audio.py
Needs assets/voice/vo1.wav .. vo8.wav (Fish Audio, free model). Writes assets/audio/mix.wav.
Times here must match index.html.
"""
import math
import wave
from pathlib import Path

import numpy as np

SR = 44100
DUR = 50.0
N = int(SR * DUR)
BEAT = 0.5  # 120 BPM
ROOT = Path(__file__).resolve().parent.parent
rng = np.random.default_rng(1968)

# (file, source start, source end or None, place at)
VOICE = [
    ("vo1", 0.0, None, 3.40),
    ("vo2", 0.0, None, 6.70),
    ("vo3", 0.0, None, 11.20),
    ("vo4", 0.00, 0.72, 15.70),   # Plan a party.
    ("vo4", 1.00, 2.02, 17.90),   # Build a website.
    ("vo4", 2.33, 3.20, 20.10),   # Order lunch.
    ("vo4", 3.28, 4.12, 24.50),   # Write the listing.
    ("vo4", 4.36, 5.44, 26.70),   # Research the market.
    ("vo4", 5.62, 6.62, 28.90),   # Make the video.
    ("vo5", 0.0, None, 31.30),
    ("vo6", 0.0, None, 35.40),
    ("vo7", 0.0, None, 40.30),
    ("vo8", 0.0, None, 43.40),
]


def read_wav(path):
    with wave.open(str(path), "rb") as w:
        ch, sw, sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    if sw == 2:
        a = np.frombuffer(raw, "<i2").astype(float) / 32768
    elif sw == 4:
        a = np.frombuffer(raw, "<i4").astype(float) / 2147483648
    else:
        raise ValueError(f"{path}: {sw * 8}-bit audio not supported")
    a = a.reshape(-1, ch).mean(axis=1)
    if sr != SR:  # simple linear resample
        x = np.linspace(0, len(a) - 1, int(len(a) * SR / sr))
        a = np.interp(x, np.arange(len(a)), a)
    return a


def t_axis(n):
    return np.arange(n) / SR


def lowpass(x, cutoff):
    c = np.broadcast_to(np.asarray(cutoff, dtype=float), x.shape)
    a = np.exp(-2 * math.pi * c / SR)
    y = np.empty_like(x)
    prev = 0.0
    for i in range(len(x)):
        prev = (1 - a[i]) * x[i] + a[i] * prev
        y[i] = prev
    return y


def env(n, a, r):
    e = np.ones(n)
    na, nr = min(int(a * SR), n), min(int(r * SR), n)
    e[:na] = np.linspace(0, 1, na, endpoint=False)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def place(buf, sig, at, gain=1.0):
    i = int(at * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * gain


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tri(f, n, detune=0.0):
    t = t_axis(n)
    out = np.zeros(n)
    for d in (-detune, 0.0, detune):
        ph = (t * f * (1 + d)) % 1.0
        out += 4 * np.abs(ph - 0.5) - 1
    return out / 3


# ---------------- voice ----------------
voice = np.zeros(N)
vo_active = np.zeros(N)
for name, s0, s1, at in VOICE:
    a = read_wav(ROOT / "assets" / "voice" / f"{name}.wav")
    seg = a[int(s0 * SR): int(s1 * SR) if s1 else len(a)]
    seg = seg * env(len(seg), 0.008, 0.03)
    place(voice, seg, at)
    i = int(at * SR)
    vo_active[i: i + len(seg)] = 1
peak = np.max(np.abs(voice)) or 1
voice = voice / peak * 0.9

# ---------------- music (bright, major: C G Am F) ----------------
music = np.zeros(N)
t = t_axis(N)
chords = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]
bass = [36, 43, 45, 41]


def pluck(f, length=0.22):
    n = int(length * SR)
    s = tri(f, n, 0.003) + 0.3 * np.sin(2 * math.pi * 2 * f * t_axis(n))
    return s * np.exp(-t_axis(n) * 13)


# Soft pad from 3 s
pad = np.zeros(N)
for bar in range(int(DUR / 2)):
    ch = chords[bar % 4]
    n = int(2.2 * SR)
    seg = sum(tri(midi(m), n, 0.004) for m in ch) / 3
    place(pad, seg * env(n, 0.5, 0.6), bar * 2.0)
pad_gain = np.interp(t, [0, 2.8, 3.2, 50], [0.0, 0.0, 0.22, 0.22])
music += lowpass(pad, 1500) * pad_gain

# Plucky arpeggio: sparse 3-15 s, busy 15-43 s, sparse at the end
pattern = [0, 1, 2, 1, 2, 1, 0, 2]
for k in range(int(3 / (BEAT / 2)), int(DUR / (BEAT / 2))):
    at = k * BEAT / 2
    busy = 15.4 <= at < 43
    if not busy and k % 2:
        continue
    bar = int(at // 2)
    note = chords[bar % 4][pattern[k % 8]] + 12
    place(music, pluck(midi(note)), at, 0.16 if busy else 0.12)

# Kick, clap, hats from 6.5 s; half-time drop during the wall (31-35); full again 35-43
def kick():
    n = int(0.3 * SR)
    tt = t_axis(n)
    f = 50 + 120 * np.exp(-tt * 30)
    return np.sin(2 * math.pi * np.cumsum(f) / SR) * np.exp(-tt * 10)


def clap():
    n = int(0.18 * SR)
    noise = rng.standard_normal(n)
    bp = lowpass(noise, 2500) - lowpass(noise, 900)
    e = np.exp(-t_axis(n) * 22)
    return bp * e * 3


def hat():
    n = int(0.04 * SR)
    noise = rng.standard_normal(n)
    return (noise - lowpass(noise, 7000)) * np.exp(-t_axis(n) * 80)


K, C = kick(), clap()
for k in range(int(6.5 / BEAT), int(43 / BEAT)):
    at = k * BEAT
    half = 31 <= at < 35
    if half and k % 2:
        continue
    place(music, K, at, 0.5)
    if at >= 11 and k % 2 == 1 and not half:
        place(music, C, at, 0.22)
    if at >= 15.4:
        place(music, hat(), at + BEAT / 2, 0.12)

# Bass on 8ths, 11-43 s
for k in range(int(11 / (BEAT / 2)), int(43 / (BEAT / 2))):
    at = k * BEAT / 2
    f = midi(bass[int(at // 2) % 4])
    n = int(0.2 * SR)
    s = np.sin(2 * math.pi * f * t_axis(n)) * np.exp(-t_axis(n) * 9)
    place(music, s, at, 0.32)

# Riser into the logo, final chord hit at 43 s
n = int(3 * SR)
noise = rng.standard_normal(n)
riser = (noise - lowpass(noise, np.linspace(500, 9000, n))) * np.linspace(0, 1, n) ** 2
place(music, riser, 40.0, 0.12)
n = int(7 * SR)
final = sum(tri(midi(m), n, 0.005) for m in [48, 60, 64, 67, 72]) / 5
place(music, lowpass(final * env(n, 0.02, 4.0), 2500), 43.0, 0.6)

# Fades, then duck under the voice (smooth envelope)
music *= np.minimum(1, t / 0.5)
fade = np.ones(N)
i48 = int(48 * SR)
fade[i48:] = np.linspace(1, 0, N - i48)
music *= fade
k = int(0.12 * SR)
smooth = np.convolve(vo_active, np.ones(k) / k, mode="same")
duck = 1 - 0.55 * np.clip(smooth * 1.3, 0, 1)
music *= duck
music = music / (np.max(np.abs(music)) or 1) * 0.55

# ---------------- sound effects ----------------
sfx = np.zeros(N)


def ping():
    n = int(0.5 * SR)
    tt = t_axis(n)
    return (np.sin(2 * math.pi * 1568 * tt) * 0.6 + np.sin(2 * math.pi * 2093 * tt) * 0.4) * np.exp(-tt * 9)


def pop(f0=500, f1=1100):
    n = int(0.11 * SR)
    tt = t_axis(n)
    f = np.linspace(f0, f1, n)
    return np.sin(2 * math.pi * np.cumsum(f) / SR) * np.exp(-tt * 30)


def whoosh(length=0.45):
    n = int(length * SR)
    noise = rng.standard_normal(n)
    body = lowpass(noise, np.linspace(400, 6000, n))
    return body * np.sin(np.linspace(0, math.pi, n)) ** 2


def swoosh_in(length=0.35):
    n = int(length * SR)
    noise = rng.standard_normal(n)
    body = lowpass(noise, np.linspace(6000, 600, n))
    return body * np.sin(np.linspace(0, math.pi, n)) ** 2


def chime():
    n = int(1.2 * SR)
    tt = t_axis(n)
    return sum(np.sin(2 * math.pi * midi(m) * tt) * np.exp(-tt * (3 + i)) for i, m in enumerate([84, 88, 91])) / 3


def boom():
    n = int(1.4 * SR)
    tt = t_axis(n)
    f = 40 + 60 * np.exp(-tt * 9)
    return np.sin(2 * math.pi * np.cumsum(f) / SR) * np.exp(-tt * 3)


place(sfx, ping(), 0.8, 0.5)                 # "hey"
place(sfx, pop(400, 900), 3.1, 0.5)          # mascot pops in
for at in [3.0, 6.5, 11.0, 15.5, 31.0, 35.0, 40.0]:
    place(sfx, whoosh(), at - 0.2, 0.35)     # scene changes
for k in range(7):                            # montage: request in, result out
    c = 15.5 + 2.2 * k
    place(sfx, pop(700, 1300), c + 0.15, 0.35)
    place(sfx, swoosh_in(), c + 0.55, 0.3)
    place(sfx, pop(900, 1600), c + 1.0, 0.3)
for k in range(14):                           # the wall of requests
    place(sfx, pop(800 + 40 * k, 1500 + 40 * k), 31.15 + k * 0.12, 0.12)
place(sfx, swoosh_in(0.6), 33.3, 0.4)
place(sfx, pop(), 35.6, 0.35)                 # landlord request
place(sfx, pop(900, 600), 36.6, 0.35)         # read-back
place(sfx, pop(), 37.9, 0.35)                 # "Yes"
place(sfx, chime(), 38.5, 0.35)               # sent
place(sfx, boom(), 43.0, 0.6)                 # logo
place(sfx, chime(), 45.2, 0.25)               # button
sfx = sfx / (np.max(np.abs(sfx)) or 1) * 0.5

# ---------------- mix ----------------
mix = voice * 1.0 + music * 0.75 + sfx * 0.6
mix = mix / (np.max(np.abs(mix)) or 1) * 0.92
out = ROOT / "assets" / "audio" / "mix.wav"
out.parent.mkdir(parents=True, exist_ok=True)
pcm = (np.clip(np.stack([mix, mix], axis=1), -1, 1) * 32767).astype("<i2")
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", out)
