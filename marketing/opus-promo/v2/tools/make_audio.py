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
DUR = 80.0
N = int(SR * DUR)
ROOT = Path(__file__).resolve().parent.parent
MUSIC = ROOT / "assets" / "music" / "southern-techno-2.mp3"
MUSIC_START = 15.2  # the track's drop (0:28) lands on "Here's how it works" at 12.8 s (80 s excerpt)
rng = np.random.default_rng(7)

VOICE = [  # (line file, place at seconds, phone-line sound?)
    ("l1", 0.2, False), ("l2", 4.2, False), ("l3", 13.0, False), ("l4", 14.8, False),
    ("op1", 19.3, True), ("call1", 22.4, True), ("l5", 27.6, False), ("op2", 32.2, True),
    ("l6", 36.9, False), ("call2", 39.2, True), ("op3", 40.4, True),
    ("l7", 44.2, False), ("l8", 52.3, False), ("l9", 58.8, False), ("l10", 63.5, False), ("l11", 69.9, False), ("l12", 72.2, False),
]


def decode(path, start=0.0, dur=None, phone=False):
    cmd = ["ffmpeg", "-v", "error", "-ss", str(start), "-i", str(path)]
    if dur:
        cmd += ["-t", str(dur)]
    if phone:  # telephone-line sound: narrow band, a little compression
        cmd += ["-af", "highpass=f=320,lowpass=f=3300,acompressor=threshold=-18dB:ratio=3,volume=1.6"]
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
for name, at, phone in VOICE:
    seg = decode(ROOT / "assets" / "voice2" / f"{name}.wav", phone=phone)
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


for at in [4.0, 12.8, 14.6, 44.0, 52.1, 58.6, 63.3, 69.7, 72.0]:
    place(sfx, whoosh(), at - 0.2, 0.5)
for at in [45.4, 53.6, 59.7]:   # request cards
    place(sfx, pop(), at, 0.5)
for at, f in [(18.9, 880), (19.05, 1175)]:             # call connects (two soft beeps)
    n = int(0.12 * SR)
    place(sfx, np.sin(2 * math.pi * f * t_axis(n)) * np.exp(-t_axis(n) * 18), at, 0.5)
for at in [42.8, 50.7, 57.3, 62.0, 74.6]:               # done / result / button
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
