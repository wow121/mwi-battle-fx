# Weapons redrawn for the rigged player (Codex sheets on pure green: side-view crossbows, the stock level, pointing
# right) -> assets/rig/weapons/<id>.webp, cropped and sized; prints their axes for WEAPON_AXIS ("rig:<id>").
# usage: python rig-weapons.py <sheets dir> <repo> [width=200]
import json, os, sys
import numpy as np
from PIL import Image

src, root = sys.argv[1], sys.argv[2]
W = int(sys.argv[3]) if len(sys.argv) > 3 else 200
out = os.path.join(root, "assets", "rig", "weapons")
os.makedirs(out, exist_ok=True)
axes = {}
for f in sorted(os.listdir(src)):
    if not f.endswith(".png"):
        continue
    k = f[:-4]
    rgb = np.asarray(Image.open(os.path.join(src, f)).convert("RGB")).astype(np.int16)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # green key: how much greener than the other two channels; soft edge, green spill pulled out of the edge pixels
    d = g - np.maximum(r, b)
    a = np.clip(1 - (d - 40) / 80, 0, 1)
    rgb[..., 1] = np.where(d > 0, np.maximum(r, b), g)
    ys, xs = np.nonzero(a > 0.5)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    im = Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), "RGBA").crop((x0, y0, x1, y1))
    k2 = W / im.width
    im = im.resize((W, max(1, round(im.height * k2))), Image.LANCZOS)
    im.save(os.path.join(out, k + ".webp"), "WEBP", quality=90, method=6)
    # the axis: level along the stock (the mean height of the back third, where only the stock is)
    al = np.asarray(im)[..., 3] > 128
    sy, sx = np.nonzero(al[:, : W // 3])
    y = float(sy.mean())
    axes["rig:" + k] = [0, round(y), W, round(y)]
print(json.dumps(axes, separators=(",", ":")))
