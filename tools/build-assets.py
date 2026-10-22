"""Cuts finished Codex sheets into the web assets the userscript loads, and writes the manifest.

usage: <raw_dir>/venv/bin/python build-assets.py <raw_dir> <repo_dir>   (needs Pillow + numpy)
  m_<monster>.png        -> assets/m/<monster>/<pose>.webp   (3x2 pose sheet, keyed)
  p_<look>.png           -> assets/p/<look>/<pose>.webp      (3x2 pose sheet, keyed)
  bg_<loc>[__tier].png   -> assets/bg/<loc>[__tier].webp
Each pose frame is its 512px cell plus a MARGIN on every side, so weapons and swings that cross the
cell edge survive; pieces of neighbouring poses are dropped by assigning connected blobs to cells.
Already-built outputs newer than their sheet are skipped.
"""
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image

RAW, REPO = sys.argv[1], sys.argv[2]
SHEETS = os.path.join(RAW, "sheets")
ASSETS = os.path.join(REPO, "assets")
POSES = ["idle", "windup", "strike", "hurt", "cast", "dead"]
KEY_RGB = {"green": (0, 255, 0), "magenta": (255, 0, 255)}
CELL = 512
MARGIN = 96  # px of the sheet around each cell; the userscript draws frames at (CELL + 2*MARGIN)/CELL size
OUT = 400  # output frame size in px

keys = {}
for f in os.listdir(RAW):
    if f.startswith("jobs-") and f.endswith(".tsv"):
        for line in open(os.path.join(RAW, f)):
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 4:
                keys[parts[0]] = parts[3]


def fresh(out, src):
    return os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(src)


def label(mask):
    """4-connected components of a small boolean grid -> (labels, sizes)."""
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    sizes = [0]
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]:
            continue
        n = len(sizes)
        lab[y0, x0] = n
        q = deque([(y0, x0)])
        size = 0
        while q:
            y, x = q.popleft()
            size += 1
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n
                    q.append((yy, xx))
        sizes.append(size)
    return lab, sizes


def dilate(m, r):
    out = m.copy()
    for _ in range(r):
        o = out.copy()
        o[1:] |= out[:-1]
        o[:-1] |= out[1:]
        o[:, 1:] |= out[:, :-1]
        o[:, :-1] |= out[:, 1:]
        out = o
    return out


def cut_sheet(src, outdir, key):
    os.makedirs(outdir, exist_ok=True)
    if fresh(os.path.join(outdir, POSES[-1] + ".webp"), src):
        return
    rgb = np.asarray(Image.open(src).convert("RGB")).astype(np.int16)
    H, W = rgb.shape[:2]
    kc = np.array(KEY_RGB[key], np.int16)
    dist = np.abs(rgb - kc).sum(axis=2)
    alpha = np.clip((dist - 110) / 140.0, 0, 1)
    # despill only near the key (edge band), so real greens/magentas inside the subject survive
    band = dilate(alpha < 0.98, 3) & (alpha > 0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    if key == "green":
        g2 = np.where(band, np.minimum(g, np.maximum(r, b)), g)
        rgb = np.stack([r, g2, b], axis=2)
    else:
        excess = np.where(band, np.clip(np.minimum(r, b) - g, 0, None), 0)
        rgb = np.stack([r - excess, g, b - excess], axis=2)
    # blobs at 1/4 resolution, each assigned to the cell holding its centroid
    S = 4
    small = (alpha[: H // S * S, : W // S * S].reshape(H // S, S, W // S, S) > 0.5).any(axis=(1, 3))
    lab, sizes = label(small)
    cols, rows = W // CELL, H // CELL
    ys, xs = np.indices(lab.shape)
    cnt = np.bincount(lab.ravel(), minlength=len(sizes))
    sx = np.bincount(lab.ravel(), xs.ravel(), minlength=len(sizes))
    sy = np.bincount(lab.ravel(), ys.ravel(), minlength=len(sizes))
    owner = {}
    for n in range(1, len(sizes)):
        if cnt[n] < 20:
            continue
        cx, cy = sx[n] / cnt[n] * S, sy[n] / cnt[n] * S
        owner[n] = min(int(cy // CELL), rows - 1) * cols + min(int(cx // CELL), cols - 1)
    rgba = np.dstack([np.clip(rgb, 0, 255), (alpha * 255)]).astype(np.uint8)
    for cell, pose in enumerate(POSES):
        keep = np.isin(lab, [n for n, c in owner.items() if c == cell])
        keep = dilate(keep, 1).repeat(S, axis=0).repeat(S, axis=1)
        full = np.zeros((H, W), bool)
        full[: keep.shape[0], : keep.shape[1]] = keep
        x, y = (cell % cols) * CELL, (cell // cols) * CELL
        frame = np.zeros((CELL + 2 * MARGIN, CELL + 2 * MARGIN, 4), np.uint8)
        x0, y0 = max(0, x - MARGIN), max(0, y - MARGIN)
        x1, y1 = min(W, x + CELL + MARGIN), min(H, y + CELL + MARGIN)
        part = rgba[y0:y1, x0:x1].copy()
        part[..., 3] = np.where(full[y0:y1, x0:x1], part[..., 3], 0)
        frame[y0 - (y - MARGIN) : y1 - (y - MARGIN), x0 - (x - MARGIN) : x1 - (x - MARGIN)] = part
        Image.fromarray(frame, "RGBA").resize((OUT, OUT), Image.LANCZOS).save(os.path.join(outdir, pose + ".webp"), quality=85, method=4)


manifest = {"poses": POSES, "frame": {"cell": CELL, "margin": MARGIN}, "m": [], "p": [], "bg": []}
for f in sorted(os.listdir(SHEETS)):
    if not f.endswith(".png"):
        continue
    name, src = f[:-4], os.path.join(SHEETS, f)
    if name.startswith("m_"):
        cut_sheet(src, os.path.join(ASSETS, "m", name[2:]), keys.get(name, "green"))
        manifest["m"].append(name[2:])
    elif name.startswith("p_"):
        cut_sheet(src, os.path.join(ASSETS, "p", name[2:]), keys.get(name, "green"))
        manifest["p"].append(name[2:])
    elif name.startswith("bg_"):
        out = os.path.join(ASSETS, "bg", name[3:] + ".webp")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        if not fresh(out, src):
            im = Image.open(src).convert("RGB")
            im.resize((1280, round(im.height * 1280 / im.width)), Image.LANCZOS).save(out, quality=78, method=6)
        manifest["bg"].append(name[3:])
json.dump(manifest, open(os.path.join(ASSETS, "manifest.json"), "w"), separators=(",", ":"))
print({k: len(v) for k, v in manifest.items() if isinstance(v, list)})
