"""Cuts finished Codex sheets into the web assets the userscript loads, and writes the manifest.

usage: <raw_dir>/venv/bin/python build-assets.py <raw_dir> <repo_dir>   (needs Pillow + numpy)
  m_<monster>.png        -> assets/m/<monster>/<pose>.webp   (3x2 pose sheet, keyed)
  p_<look>.png           -> assets/p/<look>/<pose>.webp      (3x2 pose sheet, keyed)
  bg_<loc>[__tier].png   -> assets/bg/<loc>[__tier].webp
  fx_<effect>.png        -> assets/fx/<effect>.webp          (4x2 animation frames on black, drawn additively)
  d_<a|o|i>_<id>.png     -> assets/doll/<id>.webp + doll/index.json   (paper-doll layer drawn on the mannequin)
  lb_<scene>.png         -> assets/life/bg/<scene>.webp               (skilling window backgrounds)
  lt_<cow|tree>.png      -> assets/life/t/<id>/<pose>.webp            (3x2 pose sheet, keyed, LIFE_POSES)
  lg_<group>.png         -> assets/life/<dir>/<id>.webp               (one thing per cell, cells listed in
                                                                       <raw_dir>/life-groups.json by make-life-jobs.py)
tools/flip.txt lists monster poses the generator drew facing the wrong way; they are mirrored.
Each pose frame is its 512px cell plus a MARGIN on every side, so weapons and swings that cross the
cell edge survive; pieces of neighbouring poses are dropped by assigning connected blobs to cells.
Already-built outputs newer than their sheet are skipped.
"""
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image

RAW, REPO = sys.argv[1], sys.argv[2]
SHEETS = os.path.join(RAW, "sheets")
ASSETS = os.path.join(REPO, "assets")
POSES = ["idle", "windup", "strike", "hurt", "cast", "dead"]
KEY_RGB = {"green": (0, 255, 0), "magenta": (255, 0, 255)}
CELL = 512
MARGIN = 96  # px of the sheet around each cell; the userscript draws frames at (CELL + 2*MARGIN)/CELL size
OUT = 400  # output frame size in px
FLIP = {}  # monster -> set of poses to mirror
_flip = os.path.join(os.path.dirname(os.path.abspath(__file__)), "flip.txt")
if os.path.exists(_flip):
    for line in open(_flip):
        line = line.split("#")[0].strip()
        if line:
            mid, _, poses = line.partition(":")
            FLIP[mid] = set(poses.split(",")) if poses else set(POSES)

keys = {}
for f in os.listdir(RAW):
    if f.startswith("jobs-") and f.endswith(".tsv"):
        for line in open(os.path.join(RAW, f)):
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 4:
                keys[parts[0]] = parts[3]


def fresh(out, src):
    return os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(src)


def label(mask):
    """4-connected components of a small boolean grid -> (labels, sizes)."""
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    sizes = [0]
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]:
            continue
        n = len(sizes)
        lab[y0, x0] = n
        q = deque([(y0, x0)])
        size = 0
        while q:
            y, x = q.popleft()
            size += 1
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n
                    q.append((yy, xx))
        sizes.append(size)
    return lab, sizes


def dilate(m, r):
    out = m.copy()
    for _ in range(r):
        o = out.copy()
        o[1:] |= out[:-1]
        o[:-1] |= out[1:]
        o[:, 1:] |= out[:, :-1]
        o[:, :-1] |= out[:, 1:]
        out = o
    return out


def cut_sheet(src, outdir, key, flip=frozenset(), poses=POSES):
    os.makedirs(outdir, exist_ok=True)
    marker = os.path.join(outdir, ".flipped")
    done = open(marker).read() if os.path.exists(marker) else ""
    if fresh(os.path.join(outdir, poses[-1] + ".webp"), src) and done == ",".join(sorted(flip)):
        return
    outs = [os.path.join(outdir, p + ".webp") for p in poses]
    cut_cells(src, key, None, outs, MARGIN, OUT, {i for i, p in enumerate(poses) if p in flip})
    if flip:
        open(marker, "w").write(",".join(sorted(flip)))
    elif os.path.exists(marker):
        os.remove(marker)


def cut_cells(src, key, grid, outs, margin, out_w, flip=frozenset()):
    """Keys out a sheet and writes each grid cell (plus margin) to outs[cell] (None = skip). grid = (cols, rows),
    or None for square CELL-sized cells."""
    rgb = np.asarray(Image.open(src).convert("RGB")).astype(np.int16)
    H, W = rgb.shape[:2]
    kc = np.array(KEY_RGB[key], np.int16)
    dist = np.abs(rgb - kc).sum(axis=2)
    alpha = np.clip((dist - 110) / 140.0, 0, 1)
    # despill only near the key (edge band), so real greens/magentas inside the subject survive
    band = dilate(alpha < 0.98, 3) & (alpha > 0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    if key == "green":
        g2 = np.where(band, np.minimum(g, np.maximum(r, b)), g)
        rgb = np.stack([r, g2, b], axis=2)
    else:
        excess = np.where(band, np.clip(np.minimum(r, b) - g, 0, None), 0)
        rgb = np.stack([r - excess, g, b - excess], axis=2)
    # blobs at 1/4 resolution, each assigned to the cell holding its centroid
    S = 4
    small = (alpha[: H // S * S, : W // S * S].reshape(H // S, S, W // S, S) > 0.5).any(axis=(1, 3))
    lab, sizes = label(small)
    cols, rows = grid or (W // CELL, H // CELL)
    cw, ch = W // cols, H // rows
    ys, xs = np.indices(lab.shape)
    cnt = np.bincount(lab.ravel(), minlength=len(sizes))
    sx = np.bincount(lab.ravel(), xs.ravel(), minlength=len(sizes))
    sy = np.bincount(lab.ravel(), ys.ravel(), minlength=len(sizes))
    owner = {}
    for n in range(1, len(sizes)):
        if cnt[n] < 20:
            continue
        cx, cy = sx[n] / cnt[n] * S, sy[n] / cnt[n] * S
        owner[n] = min(int(cy // ch), rows - 1) * cols + min(int(cx // cw), cols - 1)
    rgba = np.dstack([np.clip(rgb, 0, 255), (alpha * 255)]).astype(np.uint8)
    for cell, out in enumerate(outs):
        if not out:
            continue
        keep = np.isin(lab, [n for n, c in owner.items() if c == cell])
        keep = dilate(keep, 1).repeat(S, axis=0).repeat(S, axis=1)
        full = np.zeros((H, W), bool)
        full[: keep.shape[0], : keep.shape[1]] = keep
        x, y = (cell % cols) * cw, (cell // cols) * ch
        m = margin
        frame = np.zeros((ch + 2 * m, cw + 2 * m, 4), np.uint8)
        x0, y0 = max(0, x - m), max(0, y - m)
        x1, y1 = min(W, x + cw + m), min(H, y + ch + m)
        part = rgba[y0:y1, x0:x1].copy()
        part[..., 3] = np.where(full[y0:y1, x0:x1], part[..., 3], 0)
        frame[y0 - (y - m) : y1 - (y - m), x0 - (x - m) : x1 - (x - m)] = part
        im = Image.fromarray(frame, "RGBA").resize((out_w, round(out_w * (ch + 2 * m) / (cw + 2 * m))), Image.LANCZOS)
        if cell in flip:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        im.save(out, quality=85, method=4)




# ---- paper doll: each sheet is one layer painted on the mannequin from tools/doll.py ----
DOLL_SRC = os.path.join(RAW, "doll")
D = 1024  # mannequin canvas; pieces are stored at half size
SLOT_OF = {}
_slots = os.path.join(RAW, "doll", "slots.json")
if os.path.exists(_slots):
    SLOT_OF = json.load(open(_slots))
RGB = {"green": (0, 255, 0), "magenta": (255, 0, 255), "blue": (0, 0, 255), "cyan": (0, 255, 255)}


def shift(a, dy, dx, fill=0):
    out = np.full_like(a, fill)
    h, w = a.shape[:2]
    out[max(0, dy) : h + min(0, dy), max(0, dx) : w + min(0, dx)] = a[max(0, -dy) : h + min(0, -dy), max(0, -dx) : w + min(0, -dx)]
    return out


def grow_labels(lab, rounds):
    """Unlabelled pixels take a neighbour's label, ring by ring (nearest part)."""
    lab = lab.copy()
    for _ in range(rounds):
        empty = lab == 0
        if not empty.any():
            break
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = shift(lab, dy, dx)
            take = empty & (n > 0) & (lab == 0)
            lab[take] = n[take]
    return lab


def fill_from(rgb, have, region, rounds=80):
    """Paints region pixels with the average colour of already painted neighbours, ring by ring."""
    rgb = rgb.astype(np.float32).copy()
    have = have.copy()
    todo = region & ~have
    for _ in range(rounds):
        if not todo.any():
            break
        acc = np.zeros_like(rgb)
        cnt = np.zeros(have.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            h = shift(have, dy, dx, False)
            acc += shift(rgb, dy, dx) * h[..., None]
            cnt += h
        new = todo & (cnt > 0)
        rgb[new] = acc[new] / cnt[new][:, None]
        have |= new
        todo &= ~new
    return rgb, have


_tmpl = {}


def template():
    if not _tmpl:
        lab = np.asarray(Image.open(os.path.join(DOLL_SRC, "labels.png")))
        rig = json.load(open(os.path.join(DOLL_SRC, "rig.json")))
        _tmpl.update(lab=lab, rig=rig, order=rig["order"], near=grow_labels(lab[::4, ::4], 200).repeat(4, 0).repeat(4, 1))
    return _tmpl


def key_alpha(rgb, color):
    dist = np.abs(rgb - np.array(RGB[color], np.int16)).sum(axis=2)
    return np.clip((dist - 110) / 140.0, 0, 1)


def seg_alpha(rgb, c0, c1):
    p0, p1 = np.array(RGB[c0], np.float32), np.array(RGB[c1], np.float32)
    d = p1 - p0
    t = np.clip(((rgb - p0) @ d) / (d @ d), 0, 1)
    near = p0 + t[..., None] * d
    dist = np.abs(rgb - near).sum(axis=2)
    return np.clip((dist - 110) / 140.0, 0, 1)


def fit(fg, sil):
    """Best small translation of the drawn silhouette onto the mannequin (the generator rarely drifts)."""
    # below the neck only: hair, ears and hats vary, the body is what the generator keeps in place
    a, b = fg[480::8, ::8], sil[480::8, ::8]
    best, bd = -1, (0, 0)
    for dy in range(-5, 6):
        for dx in range(-5, 6):
            s = (shift(a, dy, dx, False) & b).sum() - 0.5 * (shift(a, dy, dx, False) & ~b).sum()
            if s > best:
                best, bd = s, (dy * 8, dx * 8)
    return bd, (a & b).sum() / max(1, (a | b).sum())


def weapon_dir(m, name, fist):
    """Where the weapon points, as an angle from straight down (+ = forward): from the fist toward its mass,
    or along its long axis for weapons gripped in the middle (bows, crossbows, bulwarks)."""
    ys, xs = np.nonzero(m[::2, ::2])
    xs, ys = xs * 2.0 - fist[0], ys * 2.0 - fist[1]
    if not len(xs):
        return [0, 0]
    cx, cy = xs.mean(), ys.mean()
    held_mid = any(k in name for k in ("bow", "bulwark", "defender")) or np.hypot(cx, cy) < 70
    if held_mid:
        cov = np.cov(np.stack([xs - cx, ys - cy]))
        w, v = np.linalg.eigh(cov)
        vx, vy = v[:, 1]
        if "crossbow" in name:
            vx, vy = (vx, vy) if vx > 0 else (-vx, -vy)
        else:
            vx, vy = (vx, vy) if vy < 0 else (-vx, -vy)
        cx, cy = vx, vy
    return [round(float(np.degrees(np.arctan2(cx, cy))), 1), int(held_mid)]


def cut_doll(src, name, keys, slot, rects, report, dirs):
    out = os.path.join(ASSETS, "doll", name + ".webp")
    T = template()
    order = T["order"]
    bg, doll = keys.split(":") if ":" in keys else ("green", "magenta")
    im = Image.open(src).convert("RGB").resize((D, D), Image.LANCZOS)
    rgb = np.asarray(im).astype(np.int16)
    a_bg = key_alpha(rgb, bg)
    (dy, dx), iou = fit(a_bg > 0.5, T["lab"] > 0)
    if dy or dx:
        rgb, a_bg = shift(rgb, dy, dx, 0), shift(a_bg, dy, dx, 0.0)
        rgb[a_bg == 0] = RGB[bg]
    # the mannequin's edge blends both key colours: key the whole segment between them, but only where the
    # two meet (greys and lilacs elsewhere lie on that segment too and are real paint)
    if slot == "avatar":
        alpha = a_bg
    else:
        a_doll = key_alpha(rgb, doll)
        alpha = np.minimum(a_bg, a_doll)
        seam = dilate(a_bg < 0.05, 5) & dilate(a_doll < 0.05, 5)
        alpha = np.where(seam, np.minimum(alpha, seg_alpha(rgb, bg, doll)), alpha)
    # despill: pull key colours out of the antialiased edge band
    band = dilate(alpha < 0.98, 3) & (alpha > 0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    for k in {bg, doll}:
        if k == "green":
            g = np.where(band, np.minimum(g, np.maximum(r, b)), g)
        elif k == "magenta":
            ex = np.where(band, np.clip(np.minimum(r, b) - g, 0, None), 0)
            r, b = r - ex, b - ex
        elif k == "blue":
            b = np.where(band, np.minimum(b, np.maximum(r, g)), b)
        else:
            ex = np.where(band, np.clip(np.minimum(g, b) - r, 0, None), 0)
            g, b = g - ex, b - ex
    rgb = np.clip(np.stack([r, g, b], axis=2), 0, 255)
    fg = alpha > 0.04
    report.append(f"{name}\t{slot}\tdrift={dx},{dy}\tiou={iou:.2f}\tfg={fg.mean():.3f}")
    if fresh(out, src) and name in rects.get("_done", {}) and (slot not in ("main_hand", "two_hand") or name in dirs):
        return
    # which piece each drawn pixel belongs to
    lab = np.where(T["lab"] > 0, T["lab"], T["near"])
    pname = np.array([""] + order, object)[lab]
    pieces = {}
    if slot in ("main_hand", "two_hand"):
        fist = T["rig"]["pivots"]["fist"]
        dirs[name] = weapon_dir(fg, name, fist)
        rgb, pieces["weapon"] = bridge_grip(rgb, fg, key_alpha(rgb, doll) < 0.5, fist)
    elif slot == "off_hand":
        pieces["off"] = fg
    elif slot == "back":
        pieces["back"] = fg
    elif slot == "head":
        pieces["head"] = fg
    else:
        for p in ("head", "torso", "arm", "leg"):
            pieces[p] = fg & (pname == p)
        if slot == "body":  # a long hem moves with the torso
            pieces["torso"] |= fg & np.isin(pname, ["leg", "legB"])
            pieces.pop("leg")
        if slot in ("feet", "legs"):
            pieces.pop("head")
        pieces = {k: v for k, v in pieces.items() if v.sum() > 150}
        # parts hidden behind a nearer part (torso under the arm and chin, leg tops under the torso) are
        # painted in from their own colours, so nothing gapes when the parts rotate
        for p, m in list(pieces.items()):
            region = template_mask(p) & fg & ~m
            if region.any():
                rgb_f, have = fill_from(rgb, m, region)
                pieces[p] = have
                rgb = np.where((region & have)[..., None], rgb_f, rgb).astype(np.int16)
    # pack the pieces (half size) side by side
    os.makedirs(os.path.dirname(out), exist_ok=True)
    tiles, x = [], 0
    for p, m in pieces.items():
        ys, xs = np.nonzero(m)
        if not len(ys):
            continue
        y0, y1, x0, x1 = ys.min() & ~1, ys.max() + 2, xs.min() & ~1, xs.max() + 2
        # painted-in pixels are opaque; the rest keep their keyed edge
        a = np.where(m & ~fg, 1.0, np.where(dilate(m, 1), alpha, 0))
        tile = np.dstack([rgb, a * 255]).astype(np.uint8)[y0:y1, x0:x1]
        t = Image.fromarray(tile, "RGBA").resize(((x1 - x0) // 2, (y1 - y0) // 2), Image.LANCZOS)
        tiles.append((p, t, x0 // 2, y0 // 2))
    H = max(t.height for _, t, _, _ in tiles)
    atlas = Image.new("RGBA", (sum(t.width + 2 for _, t, _, _ in tiles), H))
    rect = {}
    for p, t, dx2, dy2 in tiles:
        atlas.paste(t, (x, 0))
        rect[p] = [int(v) for v in (x, 0, t.width, t.height, dx2, dy2)]
        x += t.width + 2
    atlas.save(out, quality=88, method=4)
    rects[name] = rect


def bridge_grip(rgb, fg, man, fist):
    """The mannequin's arm is painted over the shaft; once the arm moves on its own that gap would show, so the
    shaft is continued under the arm, as wide as it is just outside it."""
    H, W = fg.shape
    gy, gx = np.mgrid[0:H, 0:W]
    gx, gy = gx - fist[0], gy - fist[1]
    # the arm as drawn (the generator's fist is a little bigger than the template's)
    arm = dilate(man | template_mask("arm"), 6) & (np.hypot(gx, gy) < 200)
    near = fg & ~arm & (np.hypot(gx, gy) < 160)
    if near.sum() < 50:
        return rgb, fg
    # the shaft's own axis, from the paint right around the hand
    px, py = gx[near].astype(np.float64), gy[near].astype(np.float64)
    w, v = np.linalg.eigh(np.cov(np.stack([px - px.mean(), py - py.mean()])))
    ux, uy = v[:, 1]
    along, perp = gx * ux + gy * uy, gx * -uy + gy * ux
    a0, a1 = along[near].min(), along[near].max()
    # the shaft's width from slices across it: a staff head or ornament right by the hand is wide but short,
    # so only the narrow slices count, and most of them must be narrow
    sl = np.round(along / 8).astype(int)
    pn, sn = perp[near], sl[near]
    narrow, slices = [], 0
    for s in np.unique(sn):
        p = pn[sn == s]
        if len(p) >= 5:
            slices += 1
            if np.percentile(p, 95) - np.percentile(p, 5) <= 60:
                narrow.append(s)
    if len(narrow) * 2 < slices:  # a broad blade or shield, not a shaft: leave it
        return rgb, fg
    near = near & np.isin(sl, narrow)
    lo, hi = np.percentile(perp[near], [5, 95])
    # repaint the band under the arm, also the shaft's own edge there (it carries the arm's fringe)
    region = arm & (perp >= lo) & (perp <= hi) & (along >= a0) & (along <= a1)
    if not region.any():
        return rgb, fg
    # a shaft looks the same all along: paint each pixel with the shaft's median colour at its offset
    bins = np.round(perp[near] - lo).astype(int)
    cols = rgb[near]
    prof = np.zeros((bins.max() + 1, 3), np.int16)
    ok = np.zeros(bins.max() + 1, bool)
    for i in range(bins.max() + 1):
        sel = bins == i
        if sel.sum() >= 3:
            prof[i], ok[i] = np.median(cols[sel], axis=0), True
    idx = np.clip(np.round(perp[region] - lo).astype(int), 0, bins.max())
    good = ok[idx]
    ys, xs = np.nonzero(region)
    rgb = rgb.copy()
    rgb[ys[good], xs[good]] = prof[idx[good]]
    painted = np.zeros_like(fg)
    painted[ys[good], xs[good]] = True
    return rgb, (fg & ~region) | painted


_tm = {}


def template_mask(p):
    """The whole shape of a part, also where a nearer part is drawn over it."""
    if p not in _tm:
        _tm[p] = np.asarray(Image.open(os.path.join(DOLL_SRC, f"mask_{p}.png"))) > 127
    return _tm[p]


manifest = {"poses": POSES, "frame": {"cell": CELL, "margin": MARGIN}, "m": [], "p": [], "bg": [], "fx": []}
# skilling window: cows and trees as pose sheets, packed sheets (plants, stations, tools) as one thing per cell
COW_POSES = ["idle", "graze", "milked", "startled", "moo", "happy"]
TREE_POSES = ["idle", "hit", "swayl", "swayr", "rustle", "leaves"]
LIFE_MARGIN = 24
_groups = os.path.join(RAW, "life-groups.json")
GROUPS = json.load(open(_groups)) if os.path.exists(_groups) else {}
life = {"bg": [], "t": [], "plant": [], "station": [], "tool": [], "tool_geo": {}}


def tool_geo(path, kind):
    """Where a drawn tool is held: [grip x, grip y (0..1 of the frame), direction from the grip to the tool's mass in
    degrees (screen coords, y down), reach from the grip (0..1 of the frame width)]. Most tools were drawn with the
    handle's end at the bottom left: the grip is a bit up the handle from it. The teapot is held by its side handle
    (its leftmost part), the alembic by its neck (its top)."""
    a = np.asarray(Image.open(path).convert("RGBA"))[..., 3] > 128
    h, w = a.shape
    ys, xs = np.nonzero(a)
    if not len(xs):
        return None
    cx, cy = xs.mean(), ys.mean()
    if kind == "pot":
        band = xs <= xs.min() + (xs.max() - xs.min()) * 0.08
        gx, gy = xs[band].mean(), ys[band].mean()
    elif kind == "alembic":
        # the top of the flask's neck: the highest part above its middle (the tube curls off to a side)
        col = np.abs(xs - cx) < w * 0.06
        gx, gy = cx, ys[col].min() + (ys.max() - ys.min()) * 0.05
    else:
        i = np.argmax(ys - xs)
        ex, ey = xs[i], ys[i]
        gx, gy = ex + (cx - ex) * 0.16, ey + (cy - ey) * 0.16
    ang = float(np.degrees(np.arctan2(cy - gy, cx - gx)))
    reach = float(np.sqrt((xs - gx) ** 2 + (ys - gy) ** 2).max())
    return [round(gx / w, 4), round(gy / h, 4), round(ang, 1), round(reach / w, 4)]
doll_sheets = []
for f in sorted(os.listdir(SHEETS)):
    if not f.endswith(".png"):
        continue
    name, src = f[:-4], os.path.join(SHEETS, f)
    if name.startswith("m_"):
        cut_sheet(src, os.path.join(ASSETS, "m", name[2:]), keys.get(name, "green"), frozenset(FLIP.get(name[2:], ())))
        manifest["m"].append(name[2:])
    elif name.startswith("p_"):
        cut_sheet(src, os.path.join(ASSETS, "p", name[2:]), keys.get(name, "green"))
        manifest["p"].append(name[2:])
    elif name.startswith("bg_"):
        out = os.path.join(ASSETS, "bg", name[3:] + ".webp")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        if not fresh(out, src):
            im = Image.open(src).convert("RGB")
            im.resize((1280, round(im.height * 1280 / im.width)), Image.LANCZOS).save(out, quality=78, method=6)
        manifest["bg"].append(name[3:])
    elif name.startswith("fx_"):
        # keep the 4x2 frame grid in one image; black stays black (drawn with additive blending)
        out = os.path.join(ASSETS, "fx", name[3:] + ".webp")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        if not fresh(out, src):
            im = Image.open(src).convert("RGB")
            im.resize((1024, round(im.height * 1024 / im.width)), Image.LANCZOS).save(out, quality=82, method=4)
        manifest["fx"].append(name[3:])
    elif name.startswith("d_"):
        doll_sheets.append((name, src))
    elif name.startswith("lb_"):
        out = os.path.join(ASSETS, "life", "bg", name[3:] + ".webp")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        if not fresh(out, src):
            im = Image.open(src).convert("RGB")
            im.resize((960, round(im.height * 960 / im.width)), Image.LANCZOS).save(out, quality=78, method=6)
        life["bg"].append(name[3:])
    elif name.startswith("lt_"):
        tid = name[3:]
        cut_sheet(src, os.path.join(ASSETS, "life", "t", tid), keys.get(name, "green"), poses=COW_POSES if tid.endswith("cow") else TREE_POSES)
        life["t"].append(tid)
    elif name.startswith("lg_") and name in GROUPS:
        g = GROUPS[name]
        outs = [os.path.join(ASSETS, "life", g["dir"], i + ".webp") for i in g["ids"]]
        if not all(fresh(o, src) for o in outs):
            cut_cells(src, keys.get(name, "magenta"), tuple(g["grid"]), outs, LIFE_MARGIN, 256)
        life[g["dir"]] += g["ids"]
        if g["dir"] == "tool":
            for i, o in zip(g["ids"], outs):
                geo = tool_geo(o, i.split("_")[-1])
                if geo:
                    life["tool_geo"][i] = geo
# paper-doll layers: one atlas per layer, rects in doll/index.json
if doll_sheets:
    ipath = os.path.join(ASSETS, "doll", "index.json")
    old = json.load(open(ipath, encoding="utf-8")) if os.path.exists(ipath) else {}
    rects = dict(old.get("layers", {}))
    rects["_done"] = dict(rects)
    dirs = dict(old.get("dirs", {}))
    report = []
    for name, src in doll_sheets:
        kind, key = name[2], name[4:]
        slot = {"a": "avatar", "o": "outfit"}.get(kind) or SLOT_OF.get(key, "body")
        try:
            cut_doll(src, key if kind == "i" else kind + "_" + key, keys.get(name, "green:magenta"), slot, rects, report, dirs)
        except Exception as e:  # one bad sheet must not stop the build
            report.append(f"{name}\tERROR {e!r}")
    rects.pop("_done")
    names = os.path.join(DOLL_SRC, "names.json")
    names = json.load(open(names, encoding="utf-8")) if os.path.exists(names) else {}
    index = {"rig": template()["rig"], "slots": SLOT_OF, "names": names, "dirs": dirs, "layers": rects}
    json.dump(index, open(ipath + ".tmp", "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
    os.replace(ipath + ".tmp", ipath)
    open(os.path.join(REPO, "doll-report.tsv"), "w").write("\n".join(report) + "\n")
    manifest["doll"] = len(rects)
manifest["life"] = life
# shipped mirroring, so the userscript's gallery can show and edit absolute flips
manifest["flips"] = {k: sorted(v) for k, v in sorted(FLIP.items())}
json.dump(manifest, open(os.path.join(ASSETS, "manifest.json"), "w"), separators=(",", ":"))
print({k: len(v) for k, v in manifest.items() if isinstance(v, list)})
