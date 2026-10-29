#!/usr/bin/env python3
"""Cuts the rigged player's avatar / outfit layers, each on its own (re-runnable).

usage: rig-player-layers.py <sheets dir> <out dir> <name> ...      names like a_cat_1 / o_mage_1

<sheets dir> holds noarms_a.png (the bald base figure without arms) and, per layer, the two Codex sheets of
tools/make-rig-player-jobs.py on flat green (an outfit's uncovered skin in magenta): <name>.png, the armless body
painted over noarms_a (an avatar's may be the head only, its body in magenta: filled with the base recoloured), and
<name>_parts.png, the parts guide (tools/rig-player-guide.py, next to this script) repainted as its arms and fists.
Per layer it writes to <out dir> (assets/rig/player):
  <name>_body.webp / _head.webp   the armless body split at the neck (the far arm passes between head and torso)
  <name>_hm.webp / _ho.webp       the two fists (back = main hand, front = off hand)
  <name>_arm{f,b}_{up,lo}.webp    each upper arm / forearm, a capsule lying level, its joint at the centre of its left
                                  end (rig.json arms.pad: [upper, forearm])
and merges into <out dir>/rig.json: the name into avatars / outfits, its arm colours into armColors. A check sheet
(check-<first>.png in the sheets dir) shows every layer over the base figure with its outline in yellow, the parts
beside it, and how well it lines up (body cover, spill outside the outline, each part's cover of its slot).
"""
import importlib.util
import json
import os
import sys

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

SHEETS, OUT = sys.argv[1], sys.argv[2]
NAMES = sys.argv[3:]
S = 0.5
BODY_BOX = (300, 150, 1000, 1200)
HEAD = (166, 145, 118, 116)  # head ellipse: centre x, y, radius x, y in the half-res body box
CHIN = 660  # full-res y of the base figure's chin
_spec = importlib.util.spec_from_file_location("guide", os.path.join(os.path.dirname(os.path.abspath(__file__)), "rig-player-guide.py"))
GUIDE = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(GUIDE)
PK = S / GUIDE.G  # parts sheet pixels → piece pixels


def key(path):
    """green-keyed RGBA (float), green spill pulled out of the edges"""
    im = np.asarray(Image.open(path).convert("RGB")).astype(float)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    a = np.clip((90 - (g - np.maximum(r, b))) / 50, 0, 1)
    return np.dstack([r, np.minimum(g, np.maximum(r, b) + 20), b, a * 255])


def grow(m, n):
    for _ in range(n):
        m = m | np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)
    return m


base = key(os.path.join(SHEETS, "noarms_a.png"))
SIL = base[..., 3] > 128
H, W = SIL.shape


def unmagenta(im):
    """an outfit's bare skin out: magenta by hue (Codex sometimes paints a darker one and anti-aliases it into the
    clothing), the fringe faded in proportion, and the seam where it met the green (a grey neither key takes)"""
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    mg = np.minimum(r, b) - g - np.abs(r - b) * 0.5
    bare = im[..., 3] < 50
    im[..., 3] *= np.clip((70 - mg) / 40, 0, 1)
    im[grow(mg > 30, 3) & grow(bare, 3), 3] = 0


def fill_skin(im, skin):
    """an avatar drawn head only (make-rig-player-jobs.py bodym: the image filter blocks some bare bodies), its body left
    magenta: the base figure under it, recoloured to the skin of its arms (its shading and outline kept as the ratio to
    the base's own skin)"""
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    mag = (np.minimum(r, b) - g - np.abs(r - b) * 0.5 > 30) & (im[..., 3] > 50)
    if mag.sum() < 0.05 * SIL.sum():
        return
    unmagenta(im)
    lum = base[..., :3] @ [0.3, 0.59, 0.11]
    torso = SIL.copy()
    torso[:720] = False
    shade = np.clip(lum / max(1, np.median(lum[torso])), 0, 1.3)[..., None]
    under = np.dstack([np.clip(np.array(skin, float) * shade, 0, 255), base[..., 3] * grow(mag, 4)])
    ai, au = im[..., 3:] / 255, under[..., 3:] / 255
    ao = ai + au * (1 - ai)
    im[..., :3] = (im[..., :3] * ai + under[..., :3] * au * (1 - ai)) / np.maximum(ao, 1e-6)
    im[..., 3:] = ao * 255


def save(img, name):
    img.save(os.path.join(OUT, name + ".webp"), lossless=True)


def cut_body(name, im):
    x0, y0, x1, y1 = BODY_BOX
    b = Image.fromarray(im[y0:y1, x0:x1].astype(np.uint8))
    b = b.resize((round((x1 - x0) * S), round((y1 - y0) * S)), Image.LANCZOS)
    m = Image.new("L", b.size, 0)
    cx, cy, rx, ry = HEAD
    ImageDraw.Draw(m).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=255)
    # and everything above the chin joined to the head (ears, horns, hair, cheeks and whiskers past the ellipse);
    # what is not joined to it there (a tail, a cape) stays on the body
    solid = np.asarray(b)[..., 3] > 4
    above = np.zeros_like(solid)
    above[: round((CHIN - y0) * S)] = True
    reach = (np.asarray(m) > 0) & solid
    while True:
        nxt = grow(reach, 1) & solid & above | reach
        if (nxt == reach).all():
            break
        reach = nxt
    # (widened past its edge first, so the soft edge below fades into empty space, not into the head's own outline)
    reach = grow(reach, 3) & above
    m = Image.fromarray(np.maximum(np.asarray(m), reach.astype(np.uint8) * 255))
    m = m.filter(ImageFilter.GaussianBlur(1.2))
    a = b.split()[3]
    head = b.copy()
    head.putalpha(ImageChops.multiply(a, m))
    torso = b.copy()
    torso.putalpha(ImageChops.multiply(a, ImageChops.invert(m)))
    save(head, name + "_head")
    save(torso, name + "_body")


def cut_parts(name, pt, painted):
    """the arm capsules and fists out of the parts sheet (guide pixels); returns the arm colours and each slot's cover"""
    pil = Image.fromarray(pt.astype(np.uint8))
    cover, cols = {}, {}
    M = GUIDE.MARGIN
    for slot in GUIDE.SLOTS:
        (x0, y0, x1, y1), r = GUIDE.capsule(slot)
        box = tuple(round(v) for v in (x0 - M, y0 - M, x1 + M, y1 + M))
        piece = pil.crop(box)
        save(piece.resize((round(piece.width * PK), round(piece.height * PK)), Image.LANCZOS), f"{name}_{slot}")
        cap = np.zeros(painted.shape, bool)
        mk = Image.new("L", (painted.shape[1], painted.shape[0]), 0)
        ImageDraw.Draw(mk).rounded_rectangle((x0, y0, x1, y1), radius=r, fill=255)
        cap = np.asarray(mk) > 0
        cover[slot] = round(float((painted & cap).sum() / cap.sum()), 2)
        # the arm's colour (for the plain tube when a layer has no pieces): the forearm's, and how much of the arm
        # the layer covers (a sleeve or not)
        arm = slot[:4]
        px = pt[cap & (pt[..., 3] > 200)][:, :3]
        if slot.endswith("_lo") or arm not in cols:
            fill = [int(v) for v in np.median(px, 0)] if len(px) else [0, 0, 0]
            cols[arm] = {"fill": "#%02x%02x%02x" % tuple(fill), "line": "#%02x%02x%02x" % tuple(int(v * 0.55) for v in fill), "cover": round(len(px) / cap.sum(), 2)}
    for part, ((gx, gy), _, r) in GUIDE.FISTS.items():
        R = r * GUIDE.G
        piece = pil.crop((gx - R, gy - R, gx + R, gy + R))
        mk = Image.new("L", (4 * R, 4 * R), 0)
        ImageDraw.Draw(mk).ellipse((0, 0, 4 * R - 1, 4 * R - 1), fill=255)
        mk = mk.resize((2 * R, 2 * R), Image.LANCZOS)
        piece.putalpha(Image.fromarray(np.minimum(np.asarray(piece)[..., 3], np.asarray(mk)).astype(np.uint8)))
        save(piece.resize((round(2 * r * S), round(2 * r * S)), Image.LANCZOS), f"{name}_{part}")
        yy, xx = np.ogrid[: painted.shape[0], : painted.shape[1]]
        circ = (xx - gx) ** 2 + (yy - gy) ** 2 < (R * 0.8) ** 2
        cover[part] = round(float((painted & circ).sum() / circ.sum()), 2)
    return cols, cover


def score(painted):
    """how well a body lines up with the base: the share of the base's lower half it paints, and how much it paints
    outside the base outline there (hair, ears and capes are allowed out above)"""
    low = np.zeros_like(SIL)
    low[660:] = True
    return {
        "body": round(float((painted & SIL & low).sum() / max(1, (SIL & low).sum())), 2),
        "spill": round(float((painted & ~grow(SIL, 10) & low).sum() / max(1, (SIL & low).sum())), 2),
    }


rig_path = os.path.join(OUT, "rig.json")
rig = json.load(open(rig_path))
tiles = []
SZ = GUIDE.SIZE
for name in NAMES:
    im = key(os.path.join(SHEETS, name + ".png"))
    if im.shape[:2] != (H, W):
        im = np.asarray(Image.fromarray(im.astype(np.uint8)).resize((W, H), Image.LANCZOS)).astype(float)
    pt = key(os.path.join(SHEETS, name + "_parts.png"))
    if pt.shape[:2] != (SZ, SZ):
        pt = np.asarray(Image.fromarray(pt.astype(np.uint8)).resize((SZ, SZ), Image.LANCZOS)).astype(float)
    # (an outfit's magenta counts as painted: it marks the figure the outfit leaves bare)
    painted, ppainted = im[..., 3] > 128, pt[..., 3] > 128
    if name.startswith("o_"):
        unmagenta(im)
        unmagenta(pt)
    sc = score(painted)
    cols, cover = cut_parts(name, pt, ppainted)
    if name.startswith("a_"):
        fill_skin(im, [int(cols["armf"]["fill"][k : k + 2], 16) for k in (1, 3, 5)])
    cut_body(name, im)
    sc.update(cover)
    kind = "avatars" if name.startswith("a_") else "outfits"
    if name[2:] not in rig[kind]:
        rig[kind].append(name[2:])
    rig.setdefault("armColors", {})[name] = cols
    print(name, json.dumps(sc), flush=True)
    # check tile: the body over the base figure, the base outline in yellow; the parts beside it
    c = Image.fromarray(base.astype(np.uint8))
    c.alpha_composite(Image.fromarray(im.astype(np.uint8)))
    bg = Image.new("RGBA", c.size, (40, 50, 90, 255))
    bg.alpha_composite(c)
    arr = np.asarray(bg).copy()
    arr[SIL ^ np.roll(SIL, 1, 0) | SIL ^ np.roll(SIL, 1, 1)] = [255, 255, 0, 255]
    t = Image.new("RGB", (700, 525))
    t.paste(Image.fromarray(arr).crop((300, 150, 1000, 1200)).resize((350, 525)).convert("RGB"), (0, 0))
    pb = Image.new("RGBA", (SZ, SZ), (40, 50, 90, 255))
    pb.alpha_composite(Image.fromarray(pt.astype(np.uint8)))
    t.paste(pb.resize((350, 350)).convert("RGB"), (350, 80))
    ImageDraw.Draw(t).text((4, 4), name + "\n" + "\n".join(f"{k} {v}" for k, v in sc.items()), fill=(255, 255, 255))
    tiles.append(t)
# the arm pieces' joint: the centre of a capsule's left end, past the cut's margin (piece pixels)
for arm in rig["arms"].values():
    arm["pad"] = [round((GUIDE.SLOTS["armf_" + seg][2] * GUIDE.G / 2 + GUIDE.MARGIN) * PK, 2) for seg in ("up", "lo")]
json.dump(rig, open(rig_path, "w"), indent=1)
if tiles:
    cols = min(3, len(tiles))
    sheet = Image.new("RGB", (cols * 700, ((len(tiles) + cols - 1) // cols) * 525))
    for k, t in enumerate(tiles):
        sheet.paste(t, ((k % cols) * 700, (k // cols) * 525))
    sheet.save(os.path.join(SHEETS, "check-" + NAMES[0] + ".png"))
