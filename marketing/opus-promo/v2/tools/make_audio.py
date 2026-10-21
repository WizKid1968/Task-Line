"""OPUS promo v2 soundtrack: Rudy's music track ("Southern Techno") + Fish Audio voice-over
("Ethan") + a few light sound effects. The music dips under the voice. Times match index.html.

Run from marketing/opus-promo/v2:  python3 -I tools/make_audio.py
Then normalise:  ffmpeg -y -i assets/audio/mix.wav -af loudnorm=I=-14:TP=-1.5:LRA=11 -ar 44100 assets/audio/mix-loud.wav
"""
import math
import subprocess
import wave
from pathlib import Path

import numpy as np

SR = 44100
DUR = 65.0
N = int(SR * DUR)
ROOT = Path(__file__).resolve().parent.parent
MUSIC = ROOT / "assets" / "music" / "southern-techno.mp3"
MUSIC_START = 15.2  # the track's drop (0:28) lands on "Here's how it works" at 12.8 s
rng = np.random.default_rng(7)

VOICE = [  # (line file, place at seconds)
    ("l1", 0.4), ("l2", 4.2), ("l3", 13.0), ("l4", 14.8), ("l5", 19.4), ("l6", 24.2),
    ("l7", 29.4), ("l8", 37.5), ("l9", 44.0), ("l10", 48.7), ("l11", 55.1), ("l12", 57.4),
]


def decode(path, start=0.0, dur=None):
    cmd = ["ffmpeg", "-v", "error", "-ss", str(start), "-i", str(path)]
    if dur:
        cmd += ["-t", str(dur)]
    cmd += ["-ac", "1", "-ar", str(SR), "-f", "s16le", "-"]
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    return np.frombuffer(raw, "<i2").astype(float) / 32768


def t_axis(n):
    return np.arange(n) / SR


def place(buf, sig, at, gain=1.0):
    i = int(at * SR)
    j = min(len(buf), i + len(sig))
    if i < len(buf):
        buf[i:j] += sig[: j - i] * gain


# Voice
voice = np.zeros(N)
active = np.zeros(N)
for name, at in VOICE:
    seg = decode(ROOT / "assets" / "voice2" / f"{name}.wav")
    place(voice, seg, at)
    i = int(at * SR)
    active[i: i + len(seg)] = 1
voice /= np.max(np.abs(voice)) or 1

# Music: excerpt, fade in/out, dip under the voice
music = np.zeros(N)
m = decode(MUSIC, MUSIC_START, DUR)
music[: len(m)] = m
t = t_axis(N)
music *= np.minimum(1, t / 0.4)
fade_from = DUR - 2.5
music *= np.where(t > fade_from, np.clip((DUR - t) / 2.5, 0, 1), 1)
k = int(0.15 * SR)
smooth = np.convolve(active, np.ones(k) / k, mode="same")
music *= 1 - 0.62 * np.clip(smooth * 1.4, 0, 1)   # about -8 dB under the voice
music /= np.max(np.abs(music)) or 1

# Light sound effects
sfx = np.zeros(N)


def pop(f0=600, f1=1200):
    n = int(0.1 * SR)
    f = np.linspace(f0, f1, n)
    return np.sin(2 * math.pi * np.cumsum(f) / SR) * np.exp(-t_axis(n) * 30)


def whoosh(length=0.4):
    n = int(length * SR)
    noise = rng.standard_normal(n)
    y = np.empty(n)
    prev = 0.0
    a = np.exp(-2 * math.pi * np.linspace(400, 5000, n) / SR)
    for i in range(n):
        prev = (1 - a[i]) * noise[i] + a[i] * prev
        y[i] = prev
    return y * np.sin(np.linspace(0, math.pi, n)) ** 2


def chime():
    n = int(1.0 * SR)
    tt = t_axis(n)
    return sum(np.sin(2 * math.pi * 440 * 2 ** ((m - 69) / 12) * tt) * np.exp(-tt * (3 + i)) for i, m in enumerate([84, 88, 91])) / 3


for at in [4.0, 12.8, 14.6, 29.2, 37.3, 43.8, 48.5, 54.9, 57.2]:
    place(sfx, whoosh(), at - 0.2, 0.5)
for at in [16.0, 20.7, 25.2, 26.6, 30.6, 38.8, 44.9]:   # message bubbles
    place(sfx, pop(), at, 0.5)
for at in [27.4, 35.9, 42.5, 47.2, 59.8]:               # done / result / button
    place(sfx, chime(), at, 0.35)
sfx /= np.max(np.abs(sfx)) or 1

mix = voice * 1.0 + music * 0.42 + sfx * 0.18
mix /= np.max(np.abs(mix)) or 1
mix *= 0.9
out = ROOT / "assets" / "audio" / "mix.wav"
out.parent.mkdir(parents=True, exist_ok=True)
pcm = (np.clip(np.stack([mix, mix], 1), -1, 1) * 32767).astype("<i2")
with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", out)
