#!/usr/bin/env python3
"""Cuts a monster's idle frame (assets/m/<id>/idle.webp) into rig parts by a Codex PART MAP: the same picture
traced in flat colours, one per part (make-rig-monster-jobs.py, prompt seg). Every part keeps the original pixels;
the map only says which part a pixel belongs to. Joints and the drawing order come from the shapes themselves:
  trunk  red      body and head in one (pivot: the hips)
  head   yellow   a head on a neck, child of the trunk (pivot: where it meets the trunk)
  arms   blue / cyan  the arm on the left / right of the picture (pivot: the shoulder, the top of the arm)
  weapon white    whatever the hands hold, child of the hand that holds it (pivot: that hand)
  legs   green / magenta  (pivot: the hip, the top of the leg)
The arm holding the weapon becomes arm_m (main), the other arm_o; without a weapon arm_m is the forward one (left in
the picture). The trunk under the arms, the weapon and the legs is filled from a second Codex image, the TRUNK
PIECE (the monster with them taken off, prompt trunk), its colours fitted to the original; an arm or weapon lying
inside the piece's outline was drawn over the trunk, one outside it behind.

usage: rig-monster.py <id> <part map png> <trunk png> <out dir>   [--tmpl biped] [--over JSON] [--check check.png]
  corrections for a monster the shapes mislead: tools/rig-monster.json {id: {...}} (or --over), e.g. '{"z":{"arm_o":1},"pivot":{"arm_m":[230,250]},"weapon":"arm_o"}' (idle px)
"""
import argparse
import json
import os

import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("id")
ap.add_argument("seg")
ap.add_argument("trunk")
ap.add_argument("out")
ap.add_argument("--tmpl", default="biped")  # (or "tmpl" in tools/rig-monster.json)
ap.add_argument("--over", default="{}")
ap.add_argument("--check")
ap.add_argument("--assets", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets"))
A = ap.parse_args()
# per-monster corrections: tools/rig-monster.json {id: {...}}, then --over on top
OF = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rig-monster.json")
OVER = {**(json.load(open(OF)).get(A.id, {}) if os.path.exists(OF) else {}), **json.loads(A.over)}

src = Image.open(os.path.join(A.assets, "m", A.id, "idle.webp")).convert("RGBA")
im = np.asarray(src).astype(np.int16)
H, W = im.shape[:2]
alpha = im[..., 3]
fg = alpha > 8
yy, xx = np.mgrid[0:H, 0:W]

# ----- the part map: each pixel to the nearest key colour, black = background -----
KEYS = {
    "bg": (0, 0, 0),
    "trunk": (255, 0, 0),
    "head": (255, 255, 0),
    "arm_l": (0, 0, 255),
    "arm_r": (0, 255, 255),
    "weapon": (255, 255, 255),
    "leg_l": (0, 255, 0),
    "leg_r": (255, 0, 255),
    "float": (255, 128, 0),
}
names = list(KEYS)
seg = np.asarray(Image.open(A.seg).convert("RGB").resize((W, H), Image.BOX)).astype(np.int32)
pal = np.array([KEYS[n] for n in names])
d = ((seg[:, :, None, :] - pal[None, None]) ** 2).sum(-1)
lab = d.argmin(-1)
# blends between two key colours at part borders are unreliable: only clear matches count
sure = d.min(-1) < 90 * 90
lab[~sure] = -1
lab[lab == 0] = -1


def shift(a, dy, dx, fill):
    o = np.full_like(a, fill)
    ys = slice(max(dy, 0), H + min(dy, 0))
    yd = slice(max(-dy, 0), H + min(-dy, 0))
    xs = slice(max(dx, 0), W + min(dx, 0))
    xd = slice(max(-dx, 0), W + min(-dx, 0))
    o[ys, xs] = a[yd, xd]
    return o


def grow(m, n=1):
    for _ in range(n):
        m = m | shift(m, 1, 0, False) | shift(m, -1, 0, False) | shift(m, 0, 1, False) | shift(m, 0, -1, False)
    return m


def shrink(m, n=1):
    return ~grow(~m, n)


# every visible pixel of the monster gets the label of the nearest sure one (the map's outline may be off a pixel or two)
L = np.where(fg, lab, -1)
L[fg & (L < 0)] = -2
for _ in range(60):
    todo = L == -2
    if not todo.any():
        break
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nb = shift(L, dy, dx, -1)
        take = todo & (nb >= 0) & (L == -2)
        L[take] = nb[take]
L[L == -2] = names.index("trunk")
mask = {n: (L == names.index(n)) for n in names[1:]}
# specks: a part under 0.3% of the monster is the map's noise, given to the trunk
# (not things floating round it: a snowflake is small)
for n in list(mask):
    if n not in ("trunk", "float") and mask[n].sum() < fg.sum() * 0.003:
        mask["trunk"] |= mask[n]
        mask[n][:] = False
# (a correction may merge one part into another: a ribbon wound round the whole body is not held like a weapon)
for k, v in OVER.get("merge", {}).items():
    mask[v] |= mask[k]
    mask[k][:] = False
# a flier (tmpl fly): the map's arm colours are its wings, nearer (blue) and farther (cyan), each wing its own part
# flapping on its root; everything else is one body
FLY = OVER.get("tmpl") == "fly"
wings = {}
if FLY:
    wings = {"wing_n": mask["arm_l"].copy(), "wing_f": mask["arm_r"].copy()}
    mask["arm_l"][:] = mask["arm_r"][:] = False
    for n in ("leg_l", "leg_r", "weapon", "head"):
        mask["trunk"] |= mask[n]
        mask[n][:] = False
# a limbless one (tmpl blob): the map's arm colours are its loose appendages (tentacles, stalks, hands, a flag), in front
# (blue) and behind (cyan), each piece its own part swaying on its root; yellow a top piece of its own (a lid, a cap, a
# head on a neck) turning on where it meets the body, which is drawn without it; the rest one body
# (a fish, tmpl fish, is cut the same way: its fins and tail the appendages; it swims, turning about its middle)
BLOB = OVER.get("tmpl") in ("blob", "fish")
FISH = OVER.get("tmpl") == "fish"
limbs = {}
if BLOB:
    limbs = {"limb_n": mask["arm_l"].copy(), "limb_f": mask["arm_r"].copy()}
    mask["arm_l"][:] = mask["arm_r"][:] = False
    for n in ("leg_l", "leg_r", "weapon"):
        mask["trunk"] |= mask[n]
        mask[n][:] = False
print("parts", {n: int(m.sum()) for n, m in mask.items() if m.any()})

# ----- roles -----
arms = [n for n in ("arm_l", "arm_r") if mask[n].any()]


def pieces(m):
    """the connected pieces of a mask, largest first"""
    seen = np.zeros_like(m)
    out = []
    for y0, x0 in zip(*np.where(m)):
        if seen[y0, x0]:
            continue
        comp = np.zeros_like(m)
        q = [(y0, x0)]
        seen[y0, x0] = True
        while q:
            y, x = q.pop()
            comp[y, x] = True
            for v, u in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= v < H and 0 <= u < W and m[v, u] and not seen[v, u]:
                    seen[v, u] = True
                    q.append((v, u))
        out.append(comp)
    return sorted(out, key=lambda c: -c.sum())


def grip(m, arm=None):
    """(arm, grip point, tip point, gap) of a held thing: its two ends along its long axis. It is held at the narrower
    end (a hilt, a handle, a haft: the blade, head, flame or fork is wider) by the arm closest to it, when one is near
    it; else at whichever end an arm is closest to. The other end is its tip."""
    ys, xs = np.where(m)
    P = np.stack([xs, ys], 1).astype(float)
    c = P.mean(0)
    v = np.linalg.svd(P - c, full_matrices=False)[2][0]
    t = (P - c) @ v
    u = (P - c) @ np.array([-v[1], v[0]])
    n = max(3, len(t) // 30)
    ends = [P[np.argsort(t)[:n]].mean(0), P[np.argsort(t)[-n:]].mean(0)]
    lo, hi = t.min(), t.max()
    width = [np.ptp(u[t < lo + (hi - lo) * 0.2]), np.ptp(u[t > hi - (hi - lo) * 0.2])]
    near = []
    # (only an arm that touches it can hold it)
    touching = [a for a in arms if (mask[a] & grow(m, 4)).any()] or arms
    for a in touching:
        ay, ax = np.where(mask[a])
        for k, e in enumerate(ends):
            near.append((np.sqrt((ax - e[0]) ** 2 + (ay - e[1]) ** 2).min(), k, a))
    narrow = int(np.argmin(width))
    held = sorted(x for x in near if x[1] == narrow)
    if arm:
        d, k, a = min(x for x in near if x[2] == arm)
    else:
        d, k, a = held[0] if held and held[0][0] < 15 and min(width) < 0.75 * max(width) else min(near)
    return (a, ends[k], ends[1 - k], d)


# the held thing: in one fist, in both (a club, a two-handed sword), or one in each (a pair of sais: two pieces apart,
# each nearest a different fist; a scrap of hilt cut off by a fist stays with its blade)
mask["weapon2"] = np.zeros_like(fg)
hold = other = None
grips = {}
if mask["weapon"].any() and arms:
    ps = [c for c in pieces(mask["weapon"]) if c.sum() > mask["weapon"].sum() * 0.2]
    g1 = grip(mask["weapon"])
    if len(ps) >= 2 and len(arms) == 2:
        a1, a2 = grip(ps[0]), grip(ps[1])
        if a1[0] != a2[0] and a1[3] < 12 and a2[3] < 12:
            mask["weapon2"] = ps[1]
            mask["weapon"] &= ~ps[1]
            g1 = a1
            grips["weapon2"] = a2
    # (a correction may name the holding arm: weapon arm_l / arm_r, the arm on the left / right of the picture; it
    # holds the end nearest it)
    if OVER.get("weapon") and not mask["weapon2"].any():
        g1 = grip(mask["weapon"], OVER["weapon"])
    hold = g1[0]
    grips["weapon"] = g1
    other = ([n for n in arms if n != hold] or [None])[0]
# held in both fists: the other fist (its far end from the shoulder) on the weapon too
two = False
if hold and other and not mask["weapon2"].any():
    # the far half of the other arm (from its shoulder end) lying on the weapon
    oy, ox = np.where(mask[other])
    top = np.array([np.median(ox[oy <= oy.min() + 5]), oy.min()])
    d = np.sqrt((ox - top[0]) ** 2 + (oy - top[1]) ** 2)
    far = np.zeros_like(fg)
    far[oy[d > d.max() * 0.5], ox[d > d.max() * 0.5]] = True
    two = bool((far & grow(mask["weapon"], 4)).sum() > 0.15 * far.sum())
main = hold or ("arm_l" if "arm_l" in arms else (arms[0] if arms else None))
role = {"trunk": "torso", "head": "head", "leg_l": "leg_f", "leg_r": "leg_b", "weapon": "weapon", "weapon2": "weapon_o"}
for n in arms:
    role[n] = "arm_m" if n == main else "arm_o"
# a four-legged beast (tmpl quad): the map's arm colours are its front legs, nearer (blue) and farther (cyan); its leg
# colours the back legs, nearer (green) and farther (magenta); its head turns on its own (bites), so the trunk is
# drawn without it
QUAD = OVER.get("tmpl") == "quad"
if QUAD:
    role.update({"arm_l": "leg_fn", "arm_r": "leg_ff", "leg_l": "leg_bn", "leg_r": "leg_bf"})

# ----- the trunk completed under what covers it: the Codex trunk piece (the monster with arms, held object and
# legs taken off), its colours matched to the original; the original pixels wherever the trunk shows -----
# (a small scrap of an appendage stays on the body)
if BLOB:
    for g in limbs.values():
        for c in pieces(g) if g.any() else []:
            if c.sum() < fg.sum() * 0.004:
                g &= ~c
                mask["trunk"] |= c
trunk = mask["trunk"] | (mask["head"] if not (QUAD or BLOB) else False)
tp = Image.open(A.trunk).convert("RGB").resize((W, H), Image.LANCZOS)
tq = np.asarray(tp).astype(np.float32)
# its background: the key colour of its corners
key = np.median(np.concatenate([tq[:6, :6].reshape(-1, 3), tq[-6:, -6:].reshape(-1, 3), tq[:6, -6:].reshape(-1, 3)]), axis=0)
sil = np.sqrt(((tq - key) ** 2).sum(-1)) > 110
sil = shrink(grow(sil, 1), 1)
# a per-channel linear fit of the piece's colours to the original where both show the trunk (inside, off the edges)
both = shrink(trunk, 3) & shrink(sil, 3) & (alpha > 250)
fit = tq.copy()
if both.sum() > 200:
    for c in range(3):
        a_, b_ = np.polyfit(tq[both, c], im[both, c].astype(np.float32), 1)
        fit[..., c] = np.clip(tq[..., c] * a_ + b_, 0, 255)
# only what something covered and the piece fills, near the trunk (the piece may be off by a few pixels)
cover = np.zeros_like(fg)
for n in arms + ["weapon", "weapon2", "leg_l", "leg_r", "float"] + (["head"] if QUAD or BLOB else []):
    cover |= mask[n]
for m in [*wings.values(), *limbs.values()]:
    cover |= m
f = sil & ~trunk & (cover | ~fg) & grow(trunk, 40)
tr = im.copy()
tr[f, :3] = fit[f].astype(np.int16)
tr[f, 3] = 255
trunk_full = trunk | f
# an arm (or the held object) drawn over the trunk lies inside the piece's outline; one behind it outside
inside = lambda m: (m & shrink(sil, 3)).sum() / max(1, m.sum())

# ----- joints -----
foot_y = int(np.where(fg)[0].max())
fx = np.where(fg & (yy > foot_y - 12))[1]
foot = [int(np.median(fx)), foot_y]
ty, tx = np.where(trunk_full)
pivots = {}
# hips: the trunk's bottom centre, a little up (a beast's: above its back legs, so it rears on them)
pivots["trunk"] = [int(np.median(tx)), int(ty.max() - (ty.max() - ty.min()) * 0.12)]
# (a flier's: its middle, it tilts in the air)
if FLY:
    pivots["trunk"] = [int(np.median(tx)), int(np.median(ty))]
if QUAD and (mask["leg_l"] | mask["leg_r"]).any():
    ly, lx = np.where(mask["leg_l"] | mask["leg_r"])
    pivots["trunk"] = [int(np.median(lx)), int(ly.min())]
# (a limbless one's: its bottom middle, it squashes and leans from the ground)
if BLOB:
    pivots["trunk"] = [int(np.median(tx)), int(np.median(ty))] if FISH else [int(np.median(tx)), int(ty.max())]
if mask["head"].any():
    b = mask["head"] & grow(trunk, 3)
    hy, hx = np.where(b if b.any() else mask["head"])
    pivots["head"] = [int(np.median(hx)), int(np.median(hy))]
    # (a lid turns on its hinge: the back end of where it meets the body)
    if OVER.get("hinge") == "back" and b.any():
        sel = hx >= hx.max() - 4
        pivots["head"] = [int(hx.max()), int(np.median(hy[sel]))]
for n in arms if not QUAD else []:
    ay, ax = np.where(mask[n])
    top = ay.min() + (ay.max() - ay.min()) * 0.18
    sel = ay <= top
    # the shoulder sits inside the top end, not on its edge
    pivots[n] = [int(np.median(ax[sel])), int(min(ay[sel].mean() + 3, top))]
for n in ("leg_l", "leg_r") + (tuple(arms) if QUAD else ()):
    if mask[n].any():
        ly, lx = np.where(mask[n])
        pivots[n] = [int(np.median(lx[ly <= ly.min() + 4])), int(ly.min())]
for w, arm in (("weapon", hold), ("weapon2", other)):
    if arm and mask[w].any():
        # the fist: the far end of the arm from its shoulder; the tip: the weapon's end farther from the fist
        ay, ax = np.where(mask[arm])
        d = np.sqrt((ax - pivots[arm][0]) ** 2 + (ay - pivots[arm][1]) ** 2)
        sel = d >= d.max() * 0.8
        pivots[w] = [int(np.median(ax[sel])), int(np.median(ay[sel]))]
        # (a hand inside a long sleeve: the sleeve's far end is not on the weapon; the arm's pixels touching it are)
        wy, wx = np.where(mask[w])
        gap = np.sqrt((wx - pivots[w][0]) ** 2 + (wy - pivots[w][1]) ** 2).min()
        if gap > 20 and OVER.get("sleeve", True):
            ty_, tx_ = np.where(mask[arm] & grow(mask[w], 4))
            if len(tx_):
                pivots[w] = [int(np.median(tx_)), int(np.median(ty_))]
        _, e1, e2, _ = grips[w]
        fi = np.array(pivots[w])
        grips[w] = (arm, e1, e1 if np.hypot(*(e1 - fi)) > np.hypot(*(e2 - fi)) else e2, 0)
for k, v in OVER.get("pivot", {}).items():
    inv = {v2: k2 for k2, v2 in role.items()}
    pivots[inv.get(k, k)] = v

# ----- drawing order -----
z = {"leg_r": 0, "leg_l": 1, "trunk": 3, "head": 4}
for n in arms:
    z[n] = 6 if inside(mask[n]) > 0.25 else 2 if n == "arm_l" else 1.5
# a beast's legs come out from under its body (their cut tops hidden by it), the far pair behind the near
if QUAD:
    z.update({"leg_r": 0, "arm_r": 0.5, "leg_l": 1, "arm_l": 1.5})
for w, arm in (("weapon", hold), ("weapon2", other)):
    if not arm or not mask[w].any():
        continue
    # under the fist that holds it; over the trunk if it was drawn over it
    if inside(mask[w]) > 0.15:
        z[w] = z[arm] - 0.5 if z[arm] > 3 else 4.5
    else:
        z[w] = z[arm] - 0.25
for k, v in OVER.get("z", {}).items():
    inv = {v2: k2 for k2, v2 in role.items()}
    z[inv.get(k, k)] = v

# ----- write -----
os.makedirs(A.out, exist_ok=True)
parent = {"head": "trunk", "weapon": hold, "weapon2": other, "arm_l": "trunk", "arm_r": "trunk", "leg_l": "trunk", "leg_r": "trunk"}
# (rig.json h maps onto the stage's unit height: a long low beast by 0.6 of its frame, not its own short height)
pix = {"trunk": (trunk_full, tr)}
for n in arms + ["head", "weapon", "weapon2", "leg_l", "leg_r"]:
    if mask[n].any() and n in pivots:
        pix[n] = (mask[n], im)
# a flier's wings: each piece its own part (wing_n1 … nearer, drawn over the body; wing_f1 … behind it), turning on
# its root (where it meets the body), flapping in the engine (rig.json wing = its phase)
for pre, group in wings.items():
    for k, c in enumerate(c for c in pieces(group) if c.sum() >= fg.sum() * 0.004):
        n = f"{pre}{k + 1}"
        root = c & grow(trunk, 3)
        if root.any():
            ry, rx = np.where(root)
            pivots[n] = [int(np.median(rx)), int(np.median(ry))]
        else:
            cy, cx = np.where(c)
            j = np.argmin((cx - pivots["trunk"][0]) ** 2 + (cy - pivots["trunk"][1]) ** 2)
            pivots[n] = [int(cx[j]), int(cy[j])]
        role[n] = n
        z[n] = 6 + k * 0.1 if pre == "wing_n" else 1 + k * 0.1
        parent[n] = "trunk"
        pix[n] = (c, im)
# a limbless one's appendages: each piece its own part on its root (limb_n*, in front of the body; limb_f*, behind),
# swaying in the engine (rig.json sway = its phase); sign: + swings its tip toward the foe, hanging or standing up
limb_sign = {}
for pre, group in limbs.items():
    for k, c in enumerate(pieces(group) if group.any() else []):
        n = f"{pre}{k + 1}"
        root = c & grow(trunk | mask["head"], 3)
        cy, cx = np.where(c)
        if root.any():
            ry, rx = np.where(root)
            pivots[n] = [int(np.median(rx)), int(np.median(ry))]
        else:
            j = np.argmin((cx - pivots["trunk"][0]) ** 2 + (cy - pivots["trunk"][1]) ** 2)
            pivots[n] = [int(cx[j]), int(cy[j])]
        role[n] = n
        z[n] = 6 + k * 0.1 if pre == "limb_n" else 1 + k * 0.1
        # (one growing from the top piece moves with it)
        parent[n] = "head" if mask["head"].any() and (c & grow(mask["head"], 3)).sum() > (c & grow(trunk, 3)).sum() else "trunk"
        pix[n] = (c, im)
        limb_sign[n] = 1 if cy.mean() > pivots[n][1] else -1
# things floating round it: each piece its own part (float1, float2 …), bobbing on its own (rig.json float = its phase)
# (a floating thing stands apart from the monster in the original, mostly empty round it; anything else marked so is
# the map's blend of two parts, red and yellow anti-alias to orange, and goes to the part it borders most)
floats = []
for c in pieces(mask["float"]) if mask["float"].any() else []:
    ring = grow(c, 3) & ~grow(c, 1)
    near = {n: int((mask[n] & ring).sum()) for n in mask if n not in ("float", "weapon2") and mask[n].any()}
    edge = grow(c, 1) & ~c
    if c.sum() >= 12 and (ring & fg & ~mask["float"]).sum() < ring.sum() * 0.3 and (edge & fg & ~mask["float"]).sum() < edge.sum() * 0.1:
        floats.append(c)
    else:
        to = max(near, key=near.get) if any(near.values()) else "trunk"
        if to in pix:
            pix[to] = (pix[to][0] | c, pix[to][1])
for k, c in enumerate(floats):
    n = f"float{k + 1}"
    fy, fx = np.where(c)
    pivots[n] = [int(fx.mean()), int(fy.mean())]
    role[n] = n
    z[n] = 7
    pix[n] = (c, im)
# (its height leaves out what floats above it)
rig = {"foot": foot, "h": int(foot_y - np.where(fg & ~mask["float"])[0].min()) if not QUAD else int(max(foot_y - np.where(fg)[0].min(), 0.6 * H)), "tmpl": OVER.get("tmpl", A.tmpl), "crumble": False, "parts": {}}
if two:
    rig["two"] = True
# a flier hangs this far (in heights) above the ground
if FLY:
    rig["hover"] = 0.35
if FISH:
    rig["hover"] = 0.15
if OVER.get("hover"):
    rig["hover"] = OVER["hover"]
# (a stiff top piece turns only this share of the way: a rook's tower)
if OVER.get("headk") is not None:
    rig["headk"] = OVER["headk"]
# fallen on its back (the torso turned 86 degrees back about its pivot, everything on it along): how far it would
# sink below its feet' line, in heights; the engine lifts it by that much to lie on the ground (rig.json lie)
if not QUAD and (not BLOB or FISH):
    by, bx = np.where(fg & ~mask["float"])
    px, py = pivots["trunk"]
    # (a flier falls belly up)
    t = np.radians(170 if FLY or FISH else 86)
    low = (py + (bx - px) * np.sin(t) + (by - py) * np.cos(t)).max()
    rig["lie"] = round(float(low - foot_y) / rig["h"], 3)
# a beast's legs as a share of its height (lying down it sinks by about that much)
if QUAD:
    tops = [pivots[n][1] for n in ("arm_l", "arm_r", "leg_l", "leg_r") if n in pivots]
    if tops:
        rig["legs"] = round((foot_y - float(np.mean(tops))) / rig["h"], 3)


def k_sway(n):
    # each appendage a little behind the one before it (a wave along a row of tentacles), the far ones on the other beat
    return int(n[6:]) * 0.9 + (0 if n.startswith("limb_n") else 2.2)


def aim(piv, m):
    """the direction from a joint to the farthest pixel of a part: 0 = straight down, 90 = at the foe (left), 180 = up"""
    ys, xs = np.where(m)
    k = np.argmax((xs - piv[0]) ** 2 + (ys - piv[1]) ** 2)
    return round(float(np.degrees(np.arctan2(-(xs[k] - piv[0]), ys[k] - piv[1]))))


def toward(a, b):
    return round(float(np.degrees(np.arctan2(-(b[0] - a[0]), b[1] - a[1]))))


# rest directions (the actions give directions; the engine turns them into turns from these): an arm from its shoulder
# to its fist, a weapon from its grip to its tip
held = {hold: "weapon", other: "weapon2" if mask["weapon2"].any() else None}
aims = {}
for n in arms:
    w = held.get(n)
    aims[n] = toward(pivots[n], pivots[w]) if w else aim(pivots[n], mask[n])
for w in ("weapon", "weapon2"):
    if w in grips and mask[w].any():
        aims[w] = toward(pivots[w], grips[w][2])
# one weapon in each fist: the main one is whichever points more at the foe (it leads the attacks)
if mask["weapon2"].any() and abs(aims["weapon2"] - 90) < abs(aims["weapon"] - 90):
    role.update({hold: "arm_o", other: "arm_m", "weapon": "weapon_o", "weapon2": "weapon"})
for n, (m, src_im) in pix.items():
    ys, xs = np.where(m)
    x0, y0, x1, y1 = max(0, xs.min() - 2), max(0, ys.min() - 2), min(W, xs.max() + 3), min(H, ys.max() + 3)
    layer = np.zeros_like(src_im)
    # soft edges: the original alpha, a pixel of overlap into neighbouring parts so no seam shows
    mm = m if n == "trunk" else grow(m, 1) & fg
    layer[mm] = src_im[mm]
    nm = role[n]
    Image.fromarray(layer[y0:y1, x0:x1].astype(np.uint8)).save(f"{A.out}/{nm}.webp", lossless=True)
    piv = pivots[n]
    q = {"img": nm + ".webp", "pivot": [int(piv[0] - x0), int(piv[1] - y0)], "at": [int(piv[0]), int(piv[1])], "z": z[n]}
    if parent.get(n):
        q["parent"] = role[parent[n]]
    if n in aims:
        q["aim"] = aims[n]
    # every limb turns forward the same way (the engine's guess from the piece's shape fails for a raised arm)
    if n != "trunk" and n != "head" and not n.startswith("float"):
        q["sign"] = 1
    # the trunk stands on its pivot: + leans it forward (the engine's guess from the piece fails when a long tail or coat
    # puts the pivot in its upper half)
    if n == "trunk":
        q["sign"] = -1
    # a beast's head nods down with +
    if (QUAD or BLOB) and n == "head":
        q["sign"] = -1
    if n.startswith("wing"):
        q["wing"] = 0 if n.startswith("wing_n") else 0.7
    if n.startswith("limb"):
        q["sign"] = limb_sign[n]
        q["sway"] = round(k_sway(n), 2)
    if n.startswith("float"):
        q["float"] = round(float(np.random.default_rng(len(rig["parts"])).uniform(0, 6.28)), 2)
    rig["parts"][nm] = q
json.dump(rig, open(f"{A.out}/rig.json", "w"), indent=1)
print(json.dumps({k: (v["at"], v["z"], v.get("parent")) for k, v in rig["parts"].items()}))

if A.check:
    # check sheet: original | part colours with joints | each part alone (trunk shows its fill)
    from PIL import ImageDraw

    S = Image.new("RGBA", (W * 3, H), (70, 70, 80, 255))
    S.alpha_composite(src, (0, 0))
    colors = {"trunk": (230, 60, 60), "head": (230, 220, 60), "arm_l": (60, 90, 240), "arm_r": (60, 220, 230), "weapon": (240, 240, 240), "weapon2": (200, 200, 120), "leg_l": (60, 200, 80), "leg_r": (220, 70, 220)}
    cm = np.zeros((H, W, 4), np.uint8)
    for n, c in colors.items():
        cm[mask[n]] = (*c, 255)
    cm[f] = (140, 30, 30, 255)
    S.alpha_composite(Image.fromarray(cm), (W, 0))
    tri = np.zeros((H, W, 4), np.uint8)
    tri[trunk_full] = tr[trunk_full].astype(np.uint8)
    S.alpha_composite(Image.fromarray(tri), (2 * W, 0))
    dr = ImageDraw.Draw(S)
    for n, p in pivots.items():
        x, y = p[0] + W, p[1]
        dr.ellipse((x - 4, y - 4, x + 4, y + 4), outline=(0, 0, 0), fill=(255, 255, 255))
        dr.text((x + 6, y - 6), f"{role[n]} z{z.get(n)}", fill=(255, 255, 255))
    S.convert("RGB").save(A.check)
