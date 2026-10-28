# The long axis of every held weapon piece (assets/doll/<id>.webp, cut by build-assets.py): its butt and head ends in
# piece pixels, for the rigged player to grip each weapon at its own point and turn it to its grip style's angle.
# usage: python rig-weapon-geom.py <repo>  -> prints the WEAPON_AXIS table for mwi-battle-fx.user.js
import json, re, sys
import numpy as np
from PIL import Image

root = sys.argv[1]
POLE = re.compile(r"staff|trident|spear|boomstick|stabber")
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
    # poles (staves, tridents, spears): the axis runs down the middle of the shaft, fitted through the cross-sections
    # that are a single thin run (bare shaft, butt spike, the neck under a trident's prongs): flames, ribbons and
    # flowers around it pull the whole piece's mass aside
    if POLE.search(k):
        pr = np.array([-ax[1], ax[0]])
        u = pts @ pr
        rows = []
        for s0 in np.arange(lo, hi, 3):
            m = (t >= s0) & (t < s0 + 3)
            if m.sum() < 3:
                continue
            uu = np.unique(np.round(u[m]))
            wd = uu[-1] - uu[0] + 1
            if len(uu) >= wd * 0.9:  # one solid run, no gaps across
                rows.append((s0 + 1.5, (uu[0] + uu[-1]) / 2, wd))
        if len(rows) >= 4:
            wmin = np.percentile([r[2] for r in rows], 10)
            thin = [r for r in rows if r[2] <= wmin * 1.8]
            if len(thin) >= 4:
                q, p0 = np.polyfit([r[0] for r in thin], [r[1] for r in thin], 1)
                b = c + ax * lo + pr * (p0 + q * lo)
                hd = c + ax * hi + pr * (p0 + q * hi)
    row = [round(float(x)) for x in (*b, *hd)]
    # a break in the art along the shaft (a trident's loose butt spike): the middle of the widest empty stretch, as a
    # share of the length from the butt, for the hand to cover
    n = int(hi - lo) + 1
    filled = np.zeros(n, bool)
    filled[np.clip((t - lo).astype(int), 0, n - 1)] = True
    best, run, start = (0, 0), 0, 0
    for i in range(int(n * 0.05), int(n * 0.95)):
        if filled[i]:
            run = 0
            continue
        if run == 0:
            start = i
        run += 1
        if run > best[0]:
            best = (run, start)
    if best[0] >= 3:
        row.append(round((best[1] + best[0] / 2) / n, 3))
    out[k] = row
print(json.dumps(out, separators=(",", ":")))
