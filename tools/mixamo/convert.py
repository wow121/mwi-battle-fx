# Mixamo joint dump (dump.py) -> 2D rig actions for the player rig (assets/rig/player) + stick-figure previews.
# usage: convert.py <dump.json> <out actions.json> [preview dir]
# Side view: screen x = the character's forward, screen y = down. The main weapon is held in the back hand (barm /
# bfore, the clip's sword hand) and the off-hand in the front hand (arm / fore, the clip's shield hand). Angles follow
# the rig: + raises an arm / turns a forearm up, body + leans forward (from the idle stance's lean, so standing is upright).
import json, math, sys, os

dump, out = sys.argv[1], sys.argv[2]
prev = sys.argv[3] if len(sys.argv) > 3 else None
D = json.load(open(dump))
# rest directions of the drawn rig parts (screen degrees, clockwise from +x), see tools/rig-cut-player.py
ARM0 = math.degrees(math.atan2(770 - 712, 772 - 705))   # shoulder -> elbow
FORE0 = math.degrees(math.atan2(760 - 770, 873 - 772))  # elbow -> fist
BARM0 = math.degrees(math.atan2(742 - 672, 478 - 585))  # back shoulder -> back elbow
BFORE0 = math.degrees(math.atan2(812 - 742, 412 - 478))  # back elbow -> back fist
IDLE = "sword and shield idle (4)" 
STEP = 2  # frames per key (30 fps -> 15 keys a second)


def sub(a, b):
    return [a[i] - b[i] for i in range(3)]


def unwrap(vals):
    out, prev = [], None
    for v in vals:
        if prev is not None:
            while v - prev > 180: v -= 360
            while v - prev < -180: v += 360
        out.append(v)
        prev = v
    return out


def convert(name, clip):
    F = clip["frames"]
    if len(F) < 3: return None
    f0 = F[0]
    # forward: (right shoulder -> left shoulder) x up, flattened
    r2l = sub(f0["LeftArm"], f0["RightArm"])
    fwd = [r2l[1] * 1 - 0, -(r2l[0] * 1), 0]  # r2l x Z = (y, -x, 0)
    n = math.hypot(fwd[0], fwd[1]) or 1
    fwd = [fwd[0] / n, fwd[1] / n, 0]
    lat = [-fwd[1], fwd[0], 0]
    sx = lambda p: p[0] * fwd[0] + p[1] * fwd[1]
    sy = lambda p: -p[2]
    ang = lambda a, b: math.degrees(math.atan2(sy(b) - sy(a), sx(b) - sx(a)))

    # a limb seen from the side: a sideways reach shows as forward (a reach across the chest is still in front),
    # only a reach behind the body shows as backward; the sign eases through zero so a swing past the side stays
    # smooth instead of flipping (a plain projection collapses an arm pointing at the camera to a dot)
    def limb(a, b):
        v = sub(b, a)
        f = v[0] * fwd[0] + v[1] * fwd[1]
        l = v[0] * lat[0] + v[1] * lat[1]
        L = math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2) or 1
        h = math.tanh(f / (0.25 * L)) * math.hypot(f, l)
        return math.degrees(math.atan2(-v[2], h))
    feet = min(f0.get("RightToeBase", f0["RightFoot"])[2], f0.get("LeftToeBase", f0["LeftFoot"])[2])
    H = (f0.get("HeadTop_End", f0["Head"])[2] - feet) or 1.8
    hx0, hz0 = sx(f0["Hips"]), f0["Hips"][2]
    rows = []
    for fr in F:
        body = ang(fr["Hips"], fr["Neck"]) + 90
        a_arm = limb(fr["LeftArm"], fr["LeftForeArm"])
        a_fore = limb(fr["LeftForeArm"], fr["LeftHand"])
        a_barm = limb(fr["RightArm"], fr["RightForeArm"])
        a_bfore = limb(fr["RightForeArm"], fr["RightHand"])
        rows.append({"body": body - LEAN, "arm": ARM0 + body - a_arm, "fore": a_arm + (FORE0 - ARM0) - a_fore,
                     "barm": BARM0 + body - a_barm, "bfore": a_barm + (BFORE0 - BARM0) - a_bfore,
                     "x": max(-0.2, min(0.2, 0.35 * (sx(fr["Hips"]) - hx0) / H)), "y": max(-0.1, min(0.4, (fr["Hips"][2] - hz0) / H))})
    for k in ("body", "arm", "fore", "barm", "bfore"):
        col = unwrap([r[k] for r in rows])
        for r, v in zip(rows, col): r[k] = v
    fps = clip["fps"]
    # the blow lands where the sword hand moves fastest (the right foot for a kick)
    tip = "RightFoot" if "kick" in name else "RightHand"
    sp = [math.hypot(sx(F[i][tip]) - sx(F[i - 1][tip]), sy(F[i][tip]) - sy(F[i - 1][tip])) for i in range(1, len(F))]
    hit = round((sp.index(max(sp)) + 1) * 1000 / fps)
    keys = []
    for i in list(range(0, len(rows), STEP)) + ([len(rows) - 1] if (len(rows) - 1) % STEP else []):
        r = rows[i]
        keys.append({"t": round(i * 1000 / fps), "e": "linear", "a": {k: round(r[k]) for k in ("body", "arm", "fore", "barm", "bfore")}, "x": round(r["x"], 3), "y": round(r["y"], 3)})
    return {"dur": keys[-1]["t"], "hit": hit, "keys": keys}, rows, F, sx, sy, H


# the idle stance's forward lean counts as upright
_f = D[IDLE]["frames"]
LEAN = 0


def _lean():
    r = []
    for fr in _f:
        r2l = sub(fr["LeftArm"], fr["RightArm"])
        n = math.hypot(r2l[1], r2l[0]) or 1
        fw = [r2l[1] / n, -r2l[0] / n]
        v = sub(fr["Neck"], fr["Hips"])
        r.append(math.degrees(math.atan2(-v[2], v[0] * fw[0] + v[1] * fw[1])) + 90)
    return sum(r) / len(r)


LEAN = _lean()
print("idle lean", round(LEAN, 1))
lib = {}
for name, clip in D.items():
    if name == "X Bot": continue
    r = convert(name, clip)
    if not r: continue
    lib[name] = r[0]
    if prev:
        from PIL import Image, ImageDraw
        _, rows, F, sx, sy, H = r
        idx = list(range(0, len(F), max(1, len(F) // 12)))[:12]
        im = Image.new("RGB", (120 * len(idx), 150), (30, 34, 50))
        d = ImageDraw.Draw(im)
        S = 120 / H
        for j, i in enumerate(idx):
            fr = F[i]
            ox = 60 + 120 * j - sx(F[0]["Hips"]) * S
            oy = 140 - (-min(F[0]["RightToeBase"][2], F[0]["LeftToeBase"][2])) * -S
            P = lambda n: (ox + sx(fr[n]) * S, 140 + (sy(fr[n]) + min(F[0]["RightToeBase"][2], F[0]["LeftToeBase"][2])) * S)
            for a, b, c in [("Hips", "Neck", (220, 220, 220)), ("Neck", "HeadTop_End", (220, 220, 220)), ("LeftArm", "LeftForeArm", (90, 140, 255)), ("LeftForeArm", "LeftHand", (90, 140, 255)),
                            ("LeftUpLeg", "LeftLeg", (120, 120, 150)), ("LeftLeg", "LeftFoot", (120, 120, 150)), ("RightUpLeg", "RightLeg", (200, 200, 200)), ("RightLeg", "RightFoot", (200, 200, 200)),
                            ("RightArm", "RightForeArm", (255, 200, 60)), ("RightForeArm", "RightHand", (255, 200, 60))]:
                d.line([P(a), P(b)], fill=c, width=3)
            d.text((120 * j + 4, 2), str(round(i * 1000 / clip["fps"])), fill=(200, 200, 200))
        os.makedirs(prev, exist_ok=True)
        im.save(os.path.join(prev, name.replace(" ", "_") + ".png"))
json.dump(lib, open(out, "w"), separators=(",", ":"))
print(len(lib), "actions", os.path.getsize(out), "bytes")
