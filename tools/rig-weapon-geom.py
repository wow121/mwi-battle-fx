# The long axis of every held weapon piece (assets/doll/<id>.webp, cut by build-assets.py): its butt and head ends in
# piece pixels, for the rigged player to grip each weapon at its own point and turn it to its grip style's angle.
# usage: python rig-weapon-geom.py <repo>  -> prints the WEAPON_AXIS table for mwi-battle-fx.user.js
import json, sys
import numpy as np
from PIL import Image

root = sys.argv[1]
# crossbows were drawn every which way and their limbs outweigh the stock: the bolt's direction by eye (degrees from
# straight down, 90 = pointing right, 180 = up)
BOLT = {"arcane_crossbow": 90, "birch_crossbow": 180, "cedar_crossbow": 165, "ginkgo_crossbow": 180, "purpleheart_crossbow": 90,
        "redwood_crossbow": 155, "soul_hunter_crossbow": 168, "sundering_crossbow": 180, "wooden_crossbow": 165}
idx = json.load(open(root + "/assets/doll/index.json", encoding="utf-8"))
out = {}
for k, L in sorted(idx["layers"].items()):
    slot = idx["slots"].get(k)
    if slot not in ("main_hand", "two_hand", "off_hand"):
        continue
    sx, sy, w, h = (L.get("weapon") or L.get("off"))[:4]
    a = np.asarray(Image.open(f"{root}/assets/doll/{k}.webp").convert("RGBA").crop((sx, sy, sx + w, sy + h)))[:, :, 3] > 128
    ys, xs = np.nonzero(a)
    if len(xs) < 20:
        continue
    c = np.array([xs.mean(), ys.mean()])
    pts = np.stack([xs, ys], 1) - c
    _, v = np.linalg.eigh(np.cov(pts.T))
    ax = v[:, 1]
    if k in BOLT:
        r = np.radians(BOLT[k])
        ax = np.array([np.sin(r), np.cos(r)])
    # the head is the upper end (every weapon was drawn pointing up); daggers lie flat, their point to the right
    flat = "dirk" in k
    if k not in BOLT and ((ax[0] < 0) if flat else (ax[1] > 0)):
        ax = -ax
    t = pts @ ax
    lo, hi = np.percentile(t, 0.5), np.percentile(t, 99.5)
    b, hd = c + ax * lo, c + ax * hi
    out[k] = [round(float(x)) for x in (*b, *hd)]
print(json.dumps(out, separators=(",", ":")))
