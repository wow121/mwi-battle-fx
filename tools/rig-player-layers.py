#!/usr/bin/env python3
"""Cuts the rigged player's avatar / outfit layers, each on its own (re-runnable; replaces tools/rig-cut-player.py,
rig-cut-player-hands.py, rig-arms-player.py and rig-head-player.py, which ran one pilot in sequence).

usage: rig-player-layers.py <sheets dir> <out dir> <name> ...      names like a_cat_1 / o_mage_1

<sheets dir> holds base_a.png (the bald base figure) and <name>.png (Codex sheets, tools/make-rig-player-jobs.py):
each layer painted over the base figure on flat green, an outfit's uncovered skin in magenta. Per layer it writes to
<out dir> (assets/rig/player):
  <name>_body.webp / _head.webp   the body without arms (the torso behind them filled in), split at the neck so the
                                  far arm can pass between head and torso
  <name>_hm.webp / _ho.webp       the two fists (back = main hand, front = off hand)
  <name>_arm{f,b}_{up,lo}.webp    each upper arm / forearm straightened into a strip
and merges into <out dir>/rig.json: the name into avatars / outfits, its arm colours into armColors. The rig's
geometry (parts, arms) is left alone. A check sheet (check-<first>.png in the sheets dir) shows every layer over the
base figure with the base outline in yellow, plus how well it lines up (fist / body cover, spill outside the outline).
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

SHEETS, OUT = sys.argv[1], sys.argv[2]
NAMES = sys.argv[3:]
S = 0.5
BODY_BOX = (300, 150, 1000, 1200)
ARM = [(690, 672), (720, 680), (765, 733), (825, 725), (860, 698), (900, 705), (925, 740), (922, 790), (900, 815), (860, 826), (800, 822), (750, 815), (718, 800), (700, 775), (672, 745), (668, 700)]
BARM = [(600, 640), (620, 660), (590, 700), (565, 708), (520, 740), (487, 770), (490, 820), (470, 855), (430, 870), (380, 860), (358, 830), (360, 790), (375, 745), (410, 712), (460, 680), (510, 650), (560, 628)]
HANDS = {"hm": ((412, 812), 58), "ho": ((876, 762), 58)}
# arm: polygon, shoulder, elbow, wrist, fist (centre, radius) left out of the strip
ARMS = {
    "armf": (ARM, (705, 712), (772, 770), (828, 764), ((876, 762), 50)),
    "armb": (BARM, (585, 672), (478, 742), (448, 775), ((412, 812), 48)),
}
T = 76  # arm strip thickness (full-res px)
HEAD = (166, 145, 118, 116)  # head ellipse: centre x, y, radius x, y in the half-res body box
CHIN = 660  # full-res y of the base figure's chin


def key(path):
    """green-keyed RGBA (float), green spill pulled out of the edges"""
    im = np.asarray(Image.open(path).convert("RGB")).astype(float)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    a = np.clip((90 - (g - np.maximum(r, b))) / 50, 0, 1)
    return np.dstack([r, np.minimum(g, np.maximum(r, b) + 20), b, a * 255])


def poly(pts, size):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return np.asarray(m) > 0


def grow(m, n):
    for _ in range(n):
        m = m | np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)
    return m


base = key(os.path.join(SHEETS, "base_a.png"))
SIL = base[..., 3] > 128
H, W = SIL.shape
SIL6 = grow(SIL, 6)
XX = np.arange(W)[None, :]


def body_of(im):
    """the layer without its arms, the torso behind them filled with a flat smear of the nearest body colour"""
    arm = poly(ARM, (W, H))
    arm = (arm | (grow(arm, 8) & (XX > 770))) & SIL6
    barm = poly(BARM, (W, H))
    barm = (barm | (grow(barm, 8) & (XX < 470))) & SIL6
    body = im.copy()
    body[arm | barm, 3] = 0
    solid = (body[..., 3] > 250) & ~grow(~(body[..., 3] > 250), 3)
    rows = {}
    for y in range(660, 840):
        xs = np.where(solid[y, :668])[0]
        if len(xs):
            rows[y] = (xs[-1], body[y, xs[-30:]].mean(0))
    for y, (last, _) in rows.items():
        near = [rows[k][1] for k in range(y - 6, y + 7) if k in rows]
        src = np.mean(near, 0)
        src[3] = 255
        for x in np.where(arm[y] & (np.arange(W) <= 740))[0]:
            if x > last:
                body[y, x] = src
    solid = (body[..., 3] > 250) & ~grow(~(body[..., 3] > 250), 3)
    for y in range(640, 760):
        xs = np.where(solid[y, 600:])[0]
        if not len(xs):
            continue
        x0 = 600 + xs[0]
        src = body[y, x0 : x0 + 20].mean(0)
        src[3] = 255
        for x in np.where(barm[y] & (np.arange(W) >= 545))[0]:
            if x < x0:
                body[y, x] = src
    return body


def save(img, name):
    img.save(os.path.join(OUT, name + ".webp"), lossless=True)


def cut(name, im):
    pil = Image.fromarray(im.astype(np.uint8))
    # body → torso + head
    x0, y0, x1, y1 = BODY_BOX
    b = Image.fromarray(body_of(im)[y0:y1, x0:x1].astype(np.uint8))
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
    # fists: round pieces
    for part, ((cx, cy), r) in HANDS.items():
        piece = pil.crop((cx - r, cy - r, cx + r, cy + r))
        mk = Image.new("L", (8 * r, 8 * r), 0)
        ImageDraw.Draw(mk).ellipse((0, 0, 8 * r - 1, 8 * r - 1), fill=255)
        mk = mk.resize((2 * r, 2 * r), Image.LANCZOS)
        piece.putalpha(Image.fromarray(np.minimum(np.asarray(piece)[..., 3], np.asarray(mk)).astype(np.uint8)))
        save(piece.resize((round(2 * r * S), round(2 * r * S)), Image.LANCZOS), f"{name}_{part}")
    # arms: strips along shoulder → elbow → wrist, and the arm's colour
    cols = {}
    for part, (pts, sh, el, wr, (fc, fr)) in ARMS.items():
        mk = Image.new("L", (W, H), 0)
        d = ImageDraw.Draw(mk)
        d.polygon(pts, fill=255)
        d.ellipse((fc[0] - fr, fc[1] - fr, fc[0] + fr, fc[1] + fr), fill=0)
        mask = (np.asarray(mk) > 0) & SIL6
        arr = im.astype(np.uint8).copy()
        arr[..., 3] = np.where(mask, arr[..., 3], 0)
        armim = Image.fromarray(arr)
        for seg, (p0, p1) in (("up", (sh, el)), ("lo", (el, wr))):
            ang = math.degrees(math.atan2(p1[1] - p0[1], p1[0] - p0[0]))
            L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
            st = armim.rotate(ang, center=p0, resample=Image.BICUBIC)
            st = st.crop((round(p0[0] - T * 0.25), round(p0[1] - T / 2), round(p0[0] + L + T * 0.1), round(p0[1] + T / 2)))
            save(st.resize((round(st.width * S), round(T * S)), Image.LANCZOS), f"{name}_{part}_{seg}")
        px = arr[mask & (arr[..., 3] > 200)][:, :3]
        fill = [int(v) for v in np.median(px, 0)] if len(px) else [0, 0, 0]
        cols[part] = {"fill": "#%02x%02x%02x" % tuple(fill), "line": "#%02x%02x%02x" % tuple(int(v * 0.55) for v in fill), "cover": round(len(px) / max(1, mask.sum()), 2)}
    return cols


def score(painted):
    """how well a layer lines up with the base: the share of each fist and of the body it paints, and how much it
    paints outside the base outline (hair, ears and capes are allowed out, so only the body's lower half counts)"""
    out = {}
    for part, ((cx, cy), r) in HANDS.items():
        yy, xx = np.ogrid[:H, :W]
        circ = ((xx - cx) ** 2 + (yy - cy) ** 2 < (r * 0.7) ** 2) & SIL
        out[part] = round(float((painted & circ).sum() / max(1, circ.sum())), 2)
    low = np.zeros_like(SIL)
    low[660:] = True
    out["body"] = round(float((painted & SIL & low).sum() / max(1, (SIL & low).sum())), 2)
    out["spill"] = round(float((painted & ~grow(SIL, 10) & low).sum() / max(1, (SIL & low).sum())), 2)
    return out


rig_path = os.path.join(OUT, "rig.json")
rig = json.load(open(rig_path))
tiles = []
for name in NAMES:
    im = key(os.path.join(SHEETS, name + ".png"))
    if im.shape[:2] != (H, W):
        im = np.asarray(Image.fromarray(im.astype(np.uint8)).resize((W, H), Image.LANCZOS)).astype(float)
    painted = im[..., 3] > 128  # (an outfit's magenta counts: it marks the figure the outfit leaves bare)
    if name.startswith("o_"):
        r, g, b = im[..., 0], im[..., 1], im[..., 2]
        # magenta by hue, not just the pure #FF00FF asked for (Codex sometimes paints a darker one, and anti-aliases it
        # into the clothing): red and blue alike, green far below both; the fringe faded in proportion
        mg = np.minimum(r, b) - g - np.abs(r - b) * 0.5
        bare = im[..., 3] < 50
        im[..., 3] *= np.clip((70 - mg) / 40, 0, 1)
        # the seam where the magenta met the green background (the two blended into a grey neither key takes)
        im[grow(mg > 30, 3) & grow(bare, 3), 3] = 0
    sc = score(painted)
    cols = cut(name, im)
    kind = "avatars" if name.startswith("a_") else "outfits"
    short = name[2:]
    if short not in rig[kind]:
        rig[kind].append(short)
    rig.setdefault("armColors", {})[name] = cols
    print(name, json.dumps(sc), flush=True)
    # check tile: the layer over the base figure (an outfit over the base's skin), the base outline in yellow
    c = Image.fromarray(base.astype(np.uint8))
    c.alpha_composite(Image.fromarray(im.astype(np.uint8)))
    bg = Image.new("RGBA", c.size, (40, 50, 90, 255))
    bg.alpha_composite(c)
    arr = np.asarray(bg).copy()
    arr[SIL ^ np.roll(SIL, 1, 0) | SIL ^ np.roll(SIL, 1, 1)] = [255, 255, 0, 255]
    t = Image.fromarray(arr).crop((300, 150, 1000, 1200)).resize((350, 525))
    ImageDraw.Draw(t).text((4, 4), f"{name}\nhm {sc['hm']} ho {sc['ho']}\nbody {sc['body']} spill {sc['spill']}", fill=(255, 255, 255))
    tiles.append(t)
json.dump(rig, open(rig_path, "w"), indent=1)
if tiles:
    cols = min(5, len(tiles))
    sheet = Image.new("RGB", (cols * 350, ((len(tiles) + cols - 1) // cols) * 525))
    for k, t in enumerate(tiles):
        sheet.paste(t.convert("RGB"), ((k % cols) * 350, (k // cols) * 525))
    sheet.save(os.path.join(SHEETS, "check-" + NAMES[0] + ".png"))
