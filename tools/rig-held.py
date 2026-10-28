# Off-hand items drawn in the hand of the magenta pose mannequin (Codex sheets on green, ~/mwi-art-raw/doll/
# mannequin_green_magenta.png as the pose reference) -> assets/rig/weapons/<id>.webp, the item alone, sized to the rig
# by the mannequin's height; prints each item's grip (where the mannequin's front fist was) for RIG_GRIP.
# usage: python rig-held.py <sheets dir> <out root> [rig height in piece px = 460 / 1.16]
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter

src, root = sys.argv[1], sys.argv[2]
H = float(sys.argv[3]) if len(sys.argv) > 3 else 460 / 1.16
FIST = (668, 595)  # the template's front fist, in its 1024 px
out = os.path.join(root, "assets", "rig", "weapons")
os.makedirs(out, exist_ok=True)
grips = {}
for f in sorted(os.listdir(src)):
    if not f.endswith(".png"):
        continue
    k = f[:-4]
    im = Image.open(os.path.join(src, f)).convert("RGB")
    S = im.width / 1024
    rgb = np.asarray(im).astype(np.int16)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    d = g - np.maximum(r, b)
    a = np.clip(1 - (d - 40) / 80, 0, 1)
    rgb[..., 1] = np.where(d > 0, np.maximum(r, b), g)
    # the mannequin (flat magenta) and a ring round it go too
    mag = (r > 170) & (b > 170) & (g < 110)
    ys, xs = np.nonzero(mag)
    ch = ys.max() - ys.min()
    ring = np.asarray(Image.fromarray((mag * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
    a = np.where(ring, 0, a)
    ys, xs = np.nonzero(a > 0.5)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    kk = H / ch
    piece = Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), "RGBA").crop((x0, y0, x1, y1))
    piece = piece.resize((max(1, round(piece.width * kk)), max(1, round(piece.height * kk))), Image.LANCZOS)
    piece.save(os.path.join(out, k + ".webp"), "WEBP", quality=90, method=6)
    grips["rig:" + k] = [round((FIST[0] * S - x0) * kk), round((FIST[1] * S - y0) * kk)]
print(json.dumps(grips, separators=(",", ":")))
