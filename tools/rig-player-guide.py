#!/usr/bin/env python3
"""The parts sheet layout for the rigged player's layers: Codex repaints this guide as each avatar's bare arms and
fists, or each outfit's sleeves and gloves (tools/make-rig-player-jobs.py), and tools/rig-player-layers.py cuts the
pieces back out of the same slots.

usage: rig-player-guide.py <base_a.png> <out.png>

On flat green, at twice the figure's size: four arm segments as capsules (rounded at both ends, the joint they hang
from at the centre of the left end; lengths are the rig's bones, rig.json arms.len) and the base figure's two fists
as they are drawn on it. The capsules are filled with the base's skin and outlined like it.
"""
import sys

import numpy as np
from PIL import Image, ImageDraw

G = 2  # guide pixels per figure pixel
# name: (joint x, y on the guide, bone length, thickness), figure pixels for the last two
SLOTS = {
    "armf_up": ((130, 190), 89, 76),
    "armf_lo": ((600, 190), 56, 64),
    "armb_up": ((130, 470), 128, 76),
    "armb_lo": ((640, 470), 45, 64),
}
# fist: (centre on the guide, centre on the figure, radius on the figure)
FISTS = {"hm": ((260, 800), (412, 812), 58), "ho": ((660, 800), (876, 762), 58)}
SIZE = 1024
MARGIN = 16  # guide pixels kept round a capsule when it is cut (a cuff may flare a little)


def capsule(slot):
    (jx, jy), L, T = SLOTS[slot]
    r = T * G / 2
    return (jx - r, jy - r, jx + L * G + r, jy + r), r


if __name__ == "__main__":
    base = Image.open(sys.argv[1]).convert("RGB")
    b = np.asarray(base).astype(int)
    # the skin: the base's front forearm; its outline: the darkest of the arm's edge
    skin = tuple(int(v) for v in np.median(b[740:790, 790:830].reshape(-1, 3), 0))
    line = tuple(int(v * 0.62) for v in skin)
    g = Image.new("RGB", (SIZE, SIZE), (0, 255, 0))
    d = ImageDraw.Draw(g)
    for slot in SLOTS:
        (x0, y0, x1, y1), r = capsule(slot)
        d.rounded_rectangle((x0, y0, x1, y1), radius=r, fill=line)
        w = 5
        d.rounded_rectangle((x0 + w, y0 + w, x1 - w, y1 - w), radius=r - w, fill=skin)
        # a band of shade along the lower side, like the base's arms
        d.rounded_rectangle((x0 + w + r * 0.4, y1 - r * 0.55, x1 - w - r * 0.4, y1 - w - 4), radius=r * 0.3, fill=tuple(int(v * 0.86) for v in skin))
    # the fists, cut round from the base figure (green kept as green round them)
    for name, ((gx, gy), (cx, cy), r) in FISTS.items():
        piece = base.crop((cx - r, cy - r, cx + r, cy + r)).resize((2 * r * G, 2 * r * G), Image.LANCZOS)
        m = Image.new("L", piece.size, 0)
        ImageDraw.Draw(m).ellipse((0, 0, piece.size[0] - 1, piece.size[1] - 1), fill=255)
        g.paste(piece, (gx - r * G, gy - r * G), m)
    g.save(sys.argv[2])
