# A book held open by a reader facing right, in parallel projection (no perspective), the hand at the bottom middle of
# the spine.
#   draw <out.png>                      the flat-colour layout guide Codex repaints (1024 px, green ground)
#   cut <sheets dir> <out root> [h=84]  the repainted books -> assets/rig/weapons/<id>.webp (h piece px tall); prints
#                                       each one's grip (the bottom of the spine) for RIG_GRIP
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

# like a reader looking down into a book (screenshot/119845186.webp): the two covers spread in a wide V, their
# outsides toward us, the opening (the page edges along the top) toward the reader's face, up and to the left; the
# spine runs up from the hand into the book
A, B = (512, 660), (580, 560)  # the bottom and the top of the spine
L, R, D = (-230, -110), (170, -50), (-18, -58)  # the left cover, the right cover, the page block's thickness (the game icon: ~30 % of the cover)


def add(p, *q):
    return (p[0] + sum(v[0] for v in q), p[1] + sum(v[1] for v in q))


SPINE = [add(A, (-14, 0)), add(B, (-14, 0)), add(B, (14, 0)), add(A, (14, 0))]
LEFT = [A, B, add(B, L), add(A, L)]
RIGHT = [A, B, add(B, R), add(A, R)]
PAGES_L = [B, add(B, L), add(B, L, D), add(B, D)]
PAGES_R = [B, add(B, R), add(B, R, D), add(B, D)]
GRIP = A

if sys.argv[1] == "draw":
    im = Image.new("RGB", (1024, 1024), (0, 255, 0))
    d = ImageDraw.Draw(im)
    # flat fills, no outlines: the game's icons have none
    for q in (PAGES_L, PAGES_R):
        d.polygon(q, fill=(205, 205, 205))
    d.polygon(LEFT, fill=(125, 90, 185))
    d.polygon(RIGHT, fill=(145, 108, 205))
    d.polygon(SPINE, fill=(105, 75, 165))
    im.save(sys.argv[2])
else:
    src, root = sys.argv[2], sys.argv[3]
    H = float(sys.argv[4]) if len(sys.argv) > 4 else 84
    out = os.path.join(root, "assets", "rig", "weapons")
    os.makedirs(out, exist_ok=True)
    grips = {}
    for f in sorted(os.listdir(src)):
        if not f.endswith(".png"):
            continue
        im = Image.open(os.path.join(src, f)).convert("RGB")
        S = im.width / 1024
        rgb = np.asarray(im).astype(np.int16)
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        dd = g - np.maximum(r, b)
        a = np.clip(1 - (dd - 40) / 80, 0, 1)
        rgb[..., 1] = np.where(dd > 0, np.maximum(r, b), g)
        ys, xs = np.nonzero(a > 0.5)
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        k = H / (y1 - y0)
        p = Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), "RGBA").crop((x0, y0, x1, y1))
        p = p.resize((max(1, round(p.width * k)), max(1, round(p.height * k))), Image.LANCZOS)
        p.save(os.path.join(out, f[:-4] + ".webp"), "WEBP", quality=90, method=6)
        grips["rig:" + f[:-4]] = [round((GRIP[0] * S - x0) * k), round((GRIP[1] * S - y0) * k)]
    print(json.dumps(grips, separators=(",", ":")))
