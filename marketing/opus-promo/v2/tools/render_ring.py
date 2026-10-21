"""Render a glossy 3D 'O' ring (torus) with simple ray marching. Free stand-in for 3D props.
Usage: python3 -I tools/render_ring.py out.png [size] [tilt_degrees]"""
import sys
import numpy as np
from PIL import Image

out = sys.argv[1]
S = int(sys.argv[2]) if len(sys.argv) > 2 else 600
tilt = np.radians(float(sys.argv[3]) if len(sys.argv) > 3 else 25)
R, r = 0.62, 0.26
ys, xs = np.mgrid[0:S, 0:S]
u = (xs / S - 0.5) * 2.4
v = -(ys / S - 0.5) * 2.4
ro = np.stack([u, v, np.full_like(u, -3.0)], -1)
rd = np.broadcast_to(np.array([0, 0, 1.0]), ro.shape)
ct, st = np.cos(tilt), np.sin(tilt)

def rot(p):  # tilt the ring toward the camera (around x), then stand it up
    x, y, z = p[..., 0], p[..., 1], p[..., 2]
    y2, z2 = y * ct - z * st, y * st + z * ct
    return np.stack([x, z2, y2], -1)

def sdf(p):
    q = rot(p)
    a = np.sqrt(q[..., 0] ** 2 + q[..., 2] ** 2) - R
    return np.sqrt(a ** 2 + q[..., 1] ** 2) - r

t = np.zeros(u.shape)
hit = np.zeros(u.shape, bool)
for _ in range(90):
    p = ro + rd * t[..., None]
    d = sdf(p)
    hit |= d < 1e-3
    t = np.where(hit, t, t + d)
p = ro + rd * t[..., None]
e = 1e-3
n = np.stack([sdf(p + np.array([e, 0, 0])) - sdf(p - np.array([e, 0, 0])),
              sdf(p + np.array([0, e, 0])) - sdf(p - np.array([0, e, 0])),
              sdf(p + np.array([0, 0, e])) - sdf(p - np.array([0, 0, e]))], -1)
n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-9
light = np.array([-0.5, 0.7, -0.6]); light /= np.linalg.norm(light)
diff = np.clip((n * light).sum(-1), 0, 1)
h = light - np.array([0, 0, 1.0]); h /= np.linalg.norm(h)
spec = np.clip((n * h).sum(-1), 0, 1) ** 40
base = np.array([45, 91, 255]) / 255
col = base[None, None, :] * (0.25 + 0.85 * diff[..., None]) + spec[..., None] * 0.9
col = np.clip(col, 0, 1)
rgba = np.dstack([col, hit.astype(float)])  # transparent outside the ring (and in its hole)
Image.fromarray((rgba * 255).astype(np.uint8), "RGBA").save(out)
print("wrote", out)
