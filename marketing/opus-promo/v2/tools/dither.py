"""Turn a picture into the pixel-dot (ordered dither) look from the reference videos:
crisp square dots in a tiny palette (ink, paper, one brand colour), white background removed.

Usage: python3 -I tools/dither.py <input.png> <output.png> [--cell 5] [--palette ink,paper,cobalt]
"""
import argparse

import numpy as np
from PIL import Image, ImageDraw

PALETTES = {
    "ink": (18, 18, 20),
    "paper": (250, 249, 245),
    "cobalt": (45, 91, 255),
    "cobaltdark": (22, 46, 150),
    "skyl": (150, 182, 255),
    "orange": (255, 122, 48),
    "yellow": (255, 214, 64),
    "grey": (150, 150, 158),
}

BAYER8 = np.array([
    [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21],
]) / 64.0 - 0.5


def remove_white_background(im: Image.Image, tol: int = 28) -> Image.Image:
    """Make the plain white background transparent (flood fill from the edges)."""
    im = im.convert("RGBA")
    if im.getchannel("A").getextrema()[0] < 250:
        return im  # already has transparency
    rgb = im.convert("RGB")
    w, h = rgb.size
    mask = Image.new("L", (w + 2, h + 2), 0)
    # pad with white so one flood reaches every edge region
    padded = Image.new("RGB", (w + 2, h + 2), (255, 255, 255))
    padded.paste(rgb, (1, 1))
    ImageDraw.floodfill(padded, (0, 0), (255, 0, 255), thresh=tol)
    arr = np.array(padded)
    bg = (arr[:, :, 0] == 255) & (arr[:, :, 1] == 0) & (arr[:, :, 2] == 255)
    alpha = np.where(bg[1:-1, 1:-1], 0, 255).astype(np.uint8)
    im.putalpha(Image.fromarray(alpha))
    return im


def dither(im: Image.Image, cell: int, palette, spread: float = 110.0) -> Image.Image:
    im = remove_white_background(im)
    w, h = im.size
    small = im.resize((max(1, w // cell), max(1, h // cell)), Image.LANCZOS)
    a = np.array(small).astype(float)
    rgb, alpha = a[:, :, :3], a[:, :, 3]
    sh, sw = alpha.shape
    thr = np.tile(BAYER8, (sh // 8 + 1, sw // 8 + 1))[:sh, :sw]
    jittered = rgb + thr[:, :, None] * spread
    pal = np.array([PALETTES[p] for p in palette], dtype=float)
    d = ((jittered[:, :, None, :] - pal[None, None, :, :]) ** 2).sum(axis=3)
    idx = d.argmin(axis=2)
    out = pal[idx]
    keep = alpha > (thr + 0.5) * 250 + 2  # dithered edge; fully clear stays clear, fully solid stays solid
    rgba = np.dstack([out, np.where(keep, 255, 0)]).astype(np.uint8)
    res = Image.fromarray(rgba, "RGBA").resize((sw * cell, sh * cell), Image.NEAREST)
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--cell", type=int, default=5)
    ap.add_argument("--palette", default="ink,paper,cobalt,skyl")
    ap.add_argument("--spread", type=float, default=110.0)
    args = ap.parse_args()
    out = dither(Image.open(args.src), args.cell, args.palette.split(","), args.spread)
    out.save(args.dst)
    print("wrote", args.dst, out.size)


if __name__ == "__main__":
    main()
