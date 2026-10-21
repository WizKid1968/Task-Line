"""Render the OPUS mascot (a friendly 3D 'O' character) with ray marching, free, in any pose.
Output is RGBA (transparent background), ready for tools/dither.py.

Usage: python3 -I tools/render_mascot.py <pose> <out.png> [size]
Poses: wave, cheer, point, hold (holds a phone), think
"""
import sys

import numpy as np
from PIL import Image

POSE = sys.argv[1]
OUT = sys.argv[2]
S = int(sys.argv[3]) if len(sys.argv) > 3 else 900

COBALT = np.array([45, 91, 255]) / 255
WHITE = np.array([0.98, 0.98, 0.96])
INK = np.array([0.07, 0.07, 0.08])
PHONE = np.array([0.12, 0.12, 0.14])
SCREEN = np.array([0.55, 0.72, 1.0])

# Arm endpoints (shoulder -> hand) per pose, in scene units. x right, y up, z toward the back.
ARMS = {
    "wave":  [((-0.80, 0.10), (-1.02, -0.22)), ((0.80, 0.22), (1.10, 0.66))],
    "cheer": [((-0.80, 0.22), (-1.12, 0.66)), ((0.80, 0.22), (1.12, 0.66))],
    "point": [((-0.80, 0.10), (-1.02, -0.22)), ((0.80, 0.18), (1.30, 0.22))],
    "hold":  [((-0.78, 0.02), (-0.30, -0.30)), ((0.78, 0.02), (0.30, -0.30))],
    "think": [((-0.80, 0.10), (-1.02, -0.22)), ((0.80, 0.05), (0.42, 0.40))],
}[POSE]


def length(v):
    return np.sqrt((v ** 2).sum(-1))


def sd_torus_xy(p, c, R, r):
    q = p - c
    a = np.sqrt(q[..., 0] ** 2 + q[..., 1] ** 2) - R
    return np.sqrt(a ** 2 + q[..., 2] ** 2) - r


def sd_sphere(p, c, r, scale=(1, 1, 1)):
    q = (p - c) / np.array(scale)
    return (length(q) - r) * min(scale)


def sd_capsule(p, a, b, r):
    pa, ba = p - a, b - a
    h = np.clip((pa * ba).sum(-1) / (ba * ba).sum(), 0, 1)
    return length(pa - ba * h[..., None]) - r


def sd_box(p, c, half, rad):
    q = np.abs(p - c) - (np.array(half) - rad)
    return length(np.maximum(q, 0)) + np.minimum(np.max(q, -1), 0) - rad


def smin(a, b, k=0.08):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)


def scene(p):
    """Returns (distance, material id). 0 body, 1 eye white, 2 ink, 3 phone, 4 screen."""
    body = sd_torus_xy(p, np.array([0, 0.08, 0]), 0.56, 0.29)
    for (sx, sy), (hx, hy) in ARMS:
        a = np.array([sx, sy, 0.0])
        b = np.array([hx, hy, -0.10 if POSE == "hold" else 0.0])
        body = smin(body, sd_capsule(p, a, b, 0.095), 0.07)
        body = np.minimum(body, sd_sphere(p, b, 0.13))
    for fx in (-0.26, 0.26):
        body = smin(body, sd_sphere(p, np.array([fx, -0.80, -0.02]), 0.15, (1.2, 0.7, 1.3)), 0.05)
    d, m = body, np.zeros(p.shape[:-1])

    # big glossy black eyes with white sparkles, like the reference characters
    eyes = np.minimum(sd_sphere(p, np.array([-0.18, 0.72, -0.25]), 0.12, (0.85, 1.15, 0.7)),
                      sd_sphere(p, np.array([0.18, 0.72, -0.25]), 0.12, (0.85, 1.15, 0.7)))
    sm = sd_torus_xy(p, np.array([0, 0.60, -0.29]), 0.10, 0.03)
    sm = np.where(p[..., 1] < 0.585, sm, 1.0)
    ink = np.minimum(eyes, sm)
    m = np.where(ink < d, 2, m); d = np.minimum(d, ink)
    glint = np.minimum(sd_sphere(p, np.array([-0.21, 0.77, -0.335]), 0.035),
                       sd_sphere(p, np.array([0.15, 0.77, -0.335]), 0.035))
    m = np.where(glint < d, 1, m); d = np.minimum(d, glint)
    if POSE == "hold":
        ph = sd_box(p, np.array([0, -0.32, -0.30]), (0.20, 0.34, 0.025), 0.05)
        m = np.where(ph < d, 3, m); d = np.minimum(d, ph)
        scr = sd_box(p, np.array([0, -0.32, -0.33]), (0.16, 0.29, 0.006), 0.03)
        m = np.where(scr < d, 4, m); d = np.minimum(d, scr)
    return d, m


ys, xs = np.mgrid[0:S, 0:S]
u = (xs / S - 0.5) * 3.0
v = -(ys / S - 0.5) * 3.0 + 0.05
ro = np.stack([u, v, np.full_like(u, -4.0)], -1)
rd = np.broadcast_to(np.array([0, 0, 1.0]), ro.shape)
t = np.zeros(u.shape)
hit = np.zeros(u.shape, bool)
for _ in range(120):
    p = ro + rd * t[..., None]
    d, _ = scene(p)
    hit |= d < 8e-4
    t = np.where(hit | (t > 8), t, t + d * 0.9)
p = ro + rd * t[..., None]
_, mat = scene(p)
e = 1e-3
nx = scene(p + [e, 0, 0])[0] - scene(p - np.array([e, 0, 0]))[0]
ny = scene(p + [0, e, 0])[0] - scene(p - np.array([0, e, 0]))[0]
nz = scene(p + [0, 0, e])[0] - scene(p - np.array([0, 0, e]))[0]
n = np.stack([nx, ny, nz], -1)
n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-9
key = np.array([-0.55, 0.65, -0.55]); key /= np.linalg.norm(key)
diff = np.clip((n * key).sum(-1), 0, 1)
rim = np.clip(1 - np.abs(n[..., 2]), 0, 1) ** 3
hv = key - np.array([0, 0, 1.0]); hv /= np.linalg.norm(hv)
spec = np.clip((n * hv).sum(-1), 0, 1) ** 36
base = np.zeros(p.shape)
for idx, col in enumerate([COBALT, WHITE, INK, PHONE, SCREEN]):
    base = np.where((mat == idx)[..., None], col, base)
shade = 0.42 + 0.7 * diff[..., None] + 0.2 * rim[..., None]
col = np.clip(base * shade + spec[..., None] * 0.8, 0, 1)

# soft ground shadow under the feet
shadow = np.clip(1 - (((u - 0.0) / 0.62) ** 2 + ((v + 0.96) / 0.10) ** 2), 0, 1) * 0.7
alpha = np.where(hit, 1.0, shadow)
col = np.where(hit[..., None], col, INK)
Image.fromarray((np.dstack([col, alpha]) * 255).astype(np.uint8), "RGBA").save(OUT)
print("wrote", OUT, POSE)
