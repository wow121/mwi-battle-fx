#!/usr/bin/env python3
"""Keys a monster girl's Codex idle sheet (make-rig-girl-jobs.py) off its flat background and frames it like the
monsters' own idle frames (400 px square, same framing as the reference), ready for make-rig-monster-jobs.py --girl and
rig-monster.py --src.
usage: rig-girl-idle.py <raw_dir> <id> ...   (<raw>/rig/girl/sheets/<id>_idle.png -> <raw>/rig/girl/idle/<id>.png)
SIZE=800 in the environment: the same frame at 800 px into <raw>/rig/girl/idle800/ (rig-monster.py --hi: her parts drawn
at twice the detail, cut along the 400 px rig)
"""
import os
import sys

import numpy as np
from PIL import Image

RAW, IDS = sys.argv[1], sys.argv[2:]
GIRL = os.path.join(RAW, "rig", "girl")
SIZE = int(os.environ.get("SIZE", 400))
OUT = os.path.join(GIRL, "idle" if SIZE == 400 else f"idle{SIZE}")
os.makedirs(OUT, exist_ok=True)
for mid in IDS:
    im = np.asarray(Image.open(os.path.join(GIRL, "sheets", f"{mid}_idle.png")).convert("RGB")).astype(np.float32)
    h, w, _ = im.shape
    # the key: the median of the border
    edge = np.concatenate([im[0], im[-1], im[:, 0], im[:, -1]])
    key = np.median(edge, axis=0)
    d = np.sqrt(((im - key) ** 2).sum(-1))
    # soft edge between 40 and 110 (of 441), then the key's spill taken out of the semi-transparent rim
    a = np.clip((d - 40) / 70, 0, 1)
    rgb = im.copy()
    rim = (a > 0) & (a < 1)
    rgb[rim] = np.clip((im[rim] - key * (1 - a[rim, None])) / np.maximum(a[rim, None], 1e-3), 0, 255)
    # a key-coloured channel never above the other two (green / magenta / blue spill)
    k = np.argmax(key) if key.max() - key.min() > 200 and (key > 200).sum() == 1 else None
    if k is not None:
        o = [c for c in range(3) if c != k]
        rgb[..., k] = np.minimum(rgb[..., k], rgb[..., o].max(-1))
    elif (key > 200).sum() == 2:  # magenta: red and blue held to green's level plus a little
        g = rgb[..., 1]
        hi = [c for c in range(3) if key[c] > 200]
        cap = np.maximum(g + 60, 0)
        both = np.minimum(rgb[..., hi[0]], rgb[..., hi[1]])
        for c in hi:
            rgb[..., c] = np.where(both > cap, np.minimum(rgb[..., c], cap), rgb[..., c])
    out = np.dstack([rgb, a * 255]).astype(np.uint8)
    img = Image.fromarray(out, "RGBA").resize((SIZE, SIZE), Image.LANCZOS)
    img.save(os.path.join(OUT, f"{mid}.png"))
    bb = img.getchannel("A").point(lambda v: 255 if v > 128 else 0).getbbox()
    print(mid, "bbox", bb)
