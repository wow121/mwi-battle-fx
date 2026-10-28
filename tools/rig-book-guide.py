# A book held open by a reader facing right, in parallel projection (no perspective): the spine on the right toward the
# foe, the covers opening to the left toward the reader's eyes, the hand at the bottom middle of the spine.
#   draw <out.png>                      the flat-colour layout guide Codex repaints (1024 px, green ground)
#   cut <sheets dir> <out root> [h=131] the repainted books -> assets/rig/weapons/<id>.webp (h piece px tall); prints
#                                       each one's grip (the bottom of the spine) for RIG_GRIP
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

SPINE = [(600, 300), (630, 300), (630, 700), (600, 700)]
NEAR = [(600, 300), (600, 700), (470, 740), (470, 340)]  # the cover toward us (its outside, with the emblem)
FAR = [(600, 300), (600, 700), (360, 590), (360, 190)]  # the cover away from us, opened wide
# the open page block between them: its top fanning out of the spine, its page edges facing the reader
PAGES = [(600, 300), (360, 190), (360, 590), (470, 740), (470, 340)]
GRIP = (615, 700)

if sys.argv[1] == "draw":
    im = Image.new("RGB", (1024, 1024), (0, 255, 0))
    d = ImageDraw.Draw(im)
    d.polygon(FAR, fill=(90, 60, 140), outline=(30, 20, 50), width=6)
    d.polygon(PAGES, fill=(245, 235, 210), outline=(30, 20, 50), width=6)
    d.polygon(NEAR, fill=(140, 100, 200), outline=(30, 20, 50), width=6)
    d.polygon(SPINE, fill=(110, 75, 170), outline=(30, 20, 50), width=6)
    im.save(sys.argv[2])
else:
    src, root = sys.argv[2], sys.argv[3]
    H = float(sys.argv[4]) if len(sys.argv) > 4 else 131
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
