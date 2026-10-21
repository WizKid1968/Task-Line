"""Render a simple 3D croissant (ellipsoid segments on an arc). Usage: render_croissant.py out.png [size]"""
import sys
import numpy as np
from PIL import Image
out = sys.argv[1]; S = int(sys.argv[2]) if len(sys.argv) > 2 else 600
ys, xs = np.mgrid[0:S, 0:S]
u = (xs / S - 0.5) * 2.6; v = -(ys / S - 0.5) * 2.6
ro = np.stack([u, v, np.full_like(u, -3.0)], -1); rd = np.array([0, 0, 1.0])
segs = []
for i, a in enumerate(np.linspace(-1.5, 1.5, 9)):
    r = 0.30 - 0.15 * (abs(a) / 1.5) ** 1.3
    segs.append((np.array([0.72 * np.sin(a), 0.62 * np.cos(a) - 0.35, 0.0]), r, a))
def sdf(p):
    d = np.full(p.shape[:-1], 9.0)
    for c, r, a in segs:
        q = (p - c) / np.array([1.25, 0.95, 1.0])
        d = np.minimum(d, (np.sqrt((q ** 2).sum(-1)) - r) * 0.95)
    return d
t = np.zeros(u.shape); hit = np.zeros(u.shape, bool)
for _ in range(90):
    p = ro + rd * t[..., None]; d = sdf(p); hit |= d < 1e-3; t = np.where(hit | (t > 6), t, t + d)
p = ro + rd * t[..., None]; e = 1e-3
n = np.stack([sdf(p + [e, 0, 0]) - sdf(p - np.array([e, 0, 0])), sdf(p + [0, e, 0]) - sdf(p - np.array([0, e, 0])), sdf(p + [0, 0, e]) - sdf(p - np.array([0, 0, e]))], -1)
n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-9
L = np.array([-0.5, 0.7, -0.5]); L /= np.linalg.norm(L)
diff = np.clip((n * L).sum(-1), 0, 1)
ridge = 0.5 + 0.5 * np.sin(np.arctan2(p[..., 0], p[..., 1] + 0.25) * 9)
base = np.array([0.93, 0.66, 0.25]) * (0.85 + 0.15 * ridge[..., None])
col = np.clip(base * (0.3 + 0.85 * diff[..., None]), 0, 1)
Image.fromarray((np.dstack([col, hit.astype(float)]) * 255).astype(np.uint8), "RGBA").save(out); print("wrote", out)
