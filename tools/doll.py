#!/usr/bin/env python3
"""Paper-doll rig: the mannequin every doll layer is drawn on, its part masks, and the Codex jobs.

usage: doll.py <raw_dir> rig        draws <raw>/doll/mannequin_<bg>_<doll>.png + rig.png/rig.json (needs Pillow + numpy)
       doll.py <raw_dir> jobs <gamedata_archive_dir>   writes <raw>/jobs-doll.tsv + prompts

The mannequin is a flat-coloured chibi figure in side view facing right on a 1024x1024 canvas, posed so the
front arm and the legs stand clear of the torso. Every avatar / outfit / item is generated ON it, so all layers
share one coordinate system: build-assets.py fits the result back onto the mannequin, keys out the background
and the mannequin colour, and cuts what is left into rig parts with the masks drawn here.
"""
import json
import math
import os
import sys

RAW, CMD = sys.argv[1], sys.argv[2]
DOLL = os.path.join(RAW, "doll")
os.makedirs(DOLL, exist_ok=True)
C = 1024
COLORS = {"green": (0, 255, 0), "magenta": (255, 0, 255), "blue": (0, 0, 255), "cyan": (0, 255, 255)}

# ---- geometry (1024 canvas, facing right). Parts are capsules / ellipses; pivots are where they rotate. ----
CX = 520
HEAD = {"c": (CX + 10, 300), "r": (168, 158)}  # chibi head: ~40% of the height
NECK = (CX, 478)
SHOULDER = (CX + 4, 505)
HIP = (CX, 690)
ARM = {"len": 170, "w": 58, "fist": 40}  # shoulder -> fist centre
LEG = {"len": 215, "w": 70, "foot": (112, 54)}
ARM_F, ARM_B = 58, -40  # degrees from straight down, + = forward (right)
LEG_F, LEG_B = 14, -14
TORSO = [(CX - 66, 468), (CX + 70, 468), (CX + 72, 712), (CX - 70, 712)]  # trapezoid, rounded when drawn


def end(p, ang, length):
    a = math.radians(ang)
    return (p[0] + math.sin(a) * length, p[1] + math.cos(a) * length)


def draw_parts(scale=1):
    """part name -> PIL 'L' mask at C*scale."""
    from PIL import Image, ImageDraw

    S = C * scale
    out = {}

    def new():
        im = Image.new("L", (S, S), 0)
        return im, ImageDraw.Draw(im)

    def capsule(d, a, b, w):
        a = (a[0] * scale, a[1] * scale)
        b = (b[0] * scale, b[1] * scale)
        w = w * scale
        d.line([a, b], fill=255, width=int(w))
        for p in (a, b):
            d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=255)

    im, d = new()
    (hx, hy), (rx, ry) = HEAD["c"], HEAD["r"]
    d.ellipse([(hx - rx) * scale, (hy - ry) * scale, (hx + rx) * scale, (hy + ry) * scale], fill=255)
    # a small nose bump so the facing reads
    d.ellipse([(hx + rx - 34) * scale, (hy + 10) * scale, (hx + rx + 14) * scale, (hy + 58) * scale], fill=255)
    out["head"] = im

    im, d = new()
    d.rounded_rectangle([(NECK[0] - 30) * scale, (NECK[1] - 40) * scale, (NECK[0] + 30) * scale, (NECK[1] + 40) * scale], 12 * scale, fill=255)
    d.polygon([(x * scale, y * scale) for x, y in [(TORSO[0][0], TORSO[0][1] + 40), (TORSO[1][0], TORSO[1][1] + 40), TORSO[2], TORSO[3]]], fill=255)
    d.rounded_rectangle([TORSO[0][0] * scale, TORSO[0][1] * scale, TORSO[1][0] * scale, (TORSO[0][1] + 90) * scale], 40 * scale, fill=255)
    d.rounded_rectangle([TORSO[3][0] * scale, (TORSO[3][1] - 60) * scale, TORSO[2][0] * scale, (TORSO[2][1] + 14) * scale], 30 * scale, fill=255)
    out["torso"] = im

    for name, ang in (("arm", ARM_F), ("armB", ARM_B)):
        im, d = new()
        f = end(SHOULDER, ang, ARM["len"])
        capsule(d, SHOULDER, f, ARM["w"])
        r = ARM["fist"]
        d.ellipse([(f[0] - r) * scale, (f[1] - r) * scale, (f[0] + r) * scale, (f[1] + r) * scale], fill=255)
        out[name] = im

    for name, ang in (("leg", LEG_F), ("legB", LEG_B)):
        im, d = new()
        a = end(HIP, ang, LEG["len"])
        capsule(d, HIP, a, LEG["w"])
        fl, fh = LEG["foot"]
        # foot: a rounded shoe pointing right, sole level
        d.rounded_rectangle([(a[0] - 34) * scale, (a[1] - fh * 0.55) * scale, (a[0] - 34 + fl) * scale, (a[1] + fh * 0.6) * scale], fh * 0.5 * scale, fill=255)
        out[name] = im
    return out


# painter's order, back to front; armB / legB are only drawn so the figure reads, their pixels are discarded
ORDER = ["armB", "legB", "leg", "torso", "head", "arm"]


def rig():
    import numpy as np
    from PIL import Image

    SS = 2
    parts = {k: v.resize((C, C), Image.LANCZOS) for k, v in draw_parts(SS).items()}
    masks = {k: np.asarray(v) > 127 for k, v in parts.items()}
    for k, m in masks.items():
        Image.fromarray(m.astype(np.uint8) * 255).save(os.path.join(DOLL, f"mask_{k}.png"))
    for bg, doll in (("green", "magenta"), ("magenta", "blue"), ("green", "blue"), ("magenta", "cyan")):
        im = Image.new("RGB", (C, C), COLORS[bg])
        alpha = np.zeros((C, C), np.uint8)
        for k in ORDER:
            alpha = np.maximum(alpha, np.asarray(parts[k]))
        im.paste(Image.new("RGB", (C, C), COLORS[doll]), mask=Image.fromarray(alpha))
        im.save(os.path.join(DOLL, f"mannequin_{bg}_{doll}.png"))
    # part label map (index into ORDER + 1), topmost part wins
    lab = np.zeros((C, C), np.uint8)
    for n, k in enumerate(ORDER):
        lab[masks[k]] = n + 1
    Image.fromarray(lab).save(os.path.join(DOLL, "labels.png"))
    preview = np.zeros((C, C, 3), np.uint8)
    pal = [(0, 0, 0), (90, 60, 140), (60, 90, 140), (80, 160, 255), (255, 170, 60), (255, 230, 120), (120, 255, 140)]
    for n in range(len(ORDER) + 1):
        preview[lab == n] = pal[n]
    Image.fromarray(preview).save(os.path.join(DOLL, "rig.png"))
    rig = {
        "canvas": C,
        "order": ORDER,
        "pivots": {"neck": NECK, "shoulder": SHOULDER, "hip": HIP, "fist": [round(v) for v in end(SHOULDER, ARM_F, ARM["len"])]},
        "angles": {"arm": ARM_F, "armB": ARM_B, "leg": LEG_F, "legB": LEG_B},
        "bbox": {k: [int(v) for v in (np.nonzero(m.any(0))[0][[0, -1]].tolist() + np.nonzero(m.any(1))[0][[0, -1]].tolist())] for k, m in masks.items()},
    }
    json.dump(rig, open(os.path.join(DOLL, "rig.json"), "w"), indent=1)
    print("rig written", rig["bbox"])


if CMD == "rig":
    rig()


# ---- jobs ----
HEAD_LINE = "Use your image generation tool to create ONE image, then reply with the absolute path of the saved PNG and nothing else.\n\n"
COMMON = """Reference image 1 is a POSE TEMPLATE: a flat {doll} mannequin of a chibi character in side view FACING RIGHT on a {bg} background (big round head with the nose bump on the right, small torso, the front arm reaching forward-right, the back arm behind on the left, two legs with feet pointing right).
Output: square 1024x1024, the mannequin keeps EXACTLY the same position, size and pose as in image 1 (same head size and place, same torso, same arm and leg angles, feet on the same spot), so the result can be laid over image 1 pixel for pixel. Art style: the flat vector game art of reference image 2, clean shapes, soft cel shading, chibi proportions.
Background: perfectly flat pure {bgc} everywhere, no floor, no shadows, no text, no labels, no borders.
"""
KEEP = "Draw nothing else: every part of the mannequin you do not cover stays EXACTLY flat unshaded {dollc}. Do not use {bg} or {doll} on the {what}."
NAMES = {"green": "green #00FF00", "magenta": "magenta #FF00FF", "blue": "blue #0000FF", "cyan": "cyan #00FFFF"}
SLOT_TASK = {
    "head": "put the {name} (reference image 2, headgear) on the mannequin's head, redrawn in side view facing right and sized to fit that head.",
    "body": "dress the mannequin in the {name} (reference image 2, a top / body armour), redrawn in side view: the chest piece on the torso and its sleeves or arm guards on the arms. Do not draw trousers, shoes, gloves or headgear.",
    "legs": "dress the mannequin in the {name} (reference image 2, trousers / leg armour), redrawn in side view on both legs from the hips down to the ankles. Do not draw shoes, a top or anything else.",
    "feet": "put the {name} (reference image 2, footwear) on both of the mannequin's feet, redrawn in side view with the toes pointing right.",
    "hands": "put the {name} (reference image 2, gloves / bracers) on both of the mannequin's hands and forearms, redrawn in side view.",
    "back": "put the {name} (reference image 2, worn on the back) on the mannequin, redrawn in side view: hanging from the shoulders BEHIND the body, on the left side of the figure.",
    "main_hand": "the mannequin holds the {name} (reference image 2, a weapon) in its FRONT hand (the fist on the right), the grip inside the fist, in a ready stance: {how}. Size the weapon to suit the chibi figure.",
    "off_hand": "the mannequin holds the {name} (reference image 2, an off-hand item) in its BACK hand (the fist on the left side of the body), facing the viewer side so it stays visible; {how}.",
}
WEAPON_HOW = [
    ("bow", "the bow held upright and vertical, string toward the body"),
    ("crossbow", "the crossbow held level, pointing right"),
    ("bulwark", "a big shield held upright in front of the body, its face toward the viewer"),
    ("staff", "the staff held upright, its head at the top"),
    ("trident", "the trident held upright, prongs at the top"),
    ("spear", "the spear held upright, point at the top"),
    ("boomstick", "the staff held upright, its head at the top"),
    ("shooter", "the slingshot held up forward"),
    ("", "the weapon held up with its business end pointing up and forward"),
]
OFF_HOW = [("codex", "a book held open"), ("tome", "a book held open"), ("dirk", "a dagger held point forward"), ("watch", "held up"), ("relic", "held up")]


def hue_share(path):
    """Share of opaque reference pixels near each key colour."""
    import numpy as np
    from PIL import Image

    a = np.asarray(Image.open(path).convert("RGBA").resize((128, 128))).astype(int)
    op = a[..., 3] > 128
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    n = max(1, op.sum())
    return {
        "green": ((g > r + 30) & (g > b + 10) & op).sum() / n,
        "magenta": ((r > g + 60) & (b > g + 60) & op).sum() / n,
        "blue": ((b > r + 60) & (b > g + 30) & op).sum() / n,
        "cyan": ((g > r + 60) & (b > r + 60) & op).sum() / n,
    }


def keys_for(ref):
    h = hue_share(ref)
    combos = [("green", "magenta"), ("magenta", "blue"), ("green", "blue"), ("magenta", "cyan")]
    return min(combos, key=lambda c: h[c[0]] + h[c[1]] + combos.index(c) * 0.01)


def jobs(arc):
    zh_en = json.load(open(os.path.join(arc, "en.json")))["itemNames"]
    data = json.load(open(os.path.join(arc, "data.json")))
    lib = os.path.join(RAW, "ref", "lib")
    prompts = os.path.join(RAW, "prompts")
    os.makedirs(prompts, exist_ok=True)
    rows = []
    slots = {}

    def add(name, kind, ref, task, what):
        bg, doll = keys_for(ref)
        if kind == "avatar":
            bg, doll = ("magenta", "blue") if hue_share(ref)["green"] > 0.04 else ("green", "magenta")
        text = HEAD_LINE + COMMON.format(doll=doll, bg=bg, bgc=NAMES[bg]) + "Task: " + task
        if kind == "avatar":
            text += f" Do not use {bg} on the character."
        else:
            text += " " + KEEP.format(dollc=NAMES[doll], bg=bg, doll=doll, what=what)
        pf = os.path.join(prompts, name + ".txt")
        open(pf, "w").write(text + "\n")
        rows.append(f"{name}\t{pf}\t{os.path.join(DOLL, f'mannequin_{bg}_{doll}.png')},{ref}\t{bg}:{doll}")

    for h in sorted(data["avatarDetailMap"]):
        k = h.split("/")[-1]
        add("d_a_" + k, "avatar", os.path.join(lib, f"a_{k}.png"),
            "paint the mannequin as the character in reference image 2 (a game avatar shown from the front): its face, eyes, hair, ears and body colour, turned into side view facing right and filling the mannequin's silhouette. No clothes and no accessories other than what image 2 shows. Hair, ears or a tail may extend a little outside the silhouette.", "character")
    for h in sorted(data["avatarOutfitDetailMap"]):
        k = h.split("/")[-1]
        add("d_o_" + k, "outfit", os.path.join(lib, f"o_{k}.png"),
            "dress the mannequin in the outfit from reference image 2 (game clothing shown from the front), redrawn in side view to fit the mannequin's body and limbs exactly: top on the torso, sleeves on the arms, bottoms on the legs, shoes on the feet and headgear on the head only if the outfit has them.", "clothing")
    for h, it in sorted(data["itemDetailMap"].items()):
        slot = ((it.get("equipmentDetail") or {}).get("type") or "").split("/")[-1]
        k = h.split("/")[-1]
        if slot not in ("head", "body", "legs", "feet", "hands", "main_hand", "two_hand", "off_hand", "back") or k.endswith("_refined"):
            continue
        slots[k] = slot
        s = "main_hand" if slot == "two_hand" else slot
        how = next(v for key, v in (WEAPON_HOW if s == "main_hand" else OFF_HOW + [("", "a shield held up with its face toward the viewer")]) if key in k)
        add("d_i_" + k, "item", os.path.join(lib, f"i_{k}.png"), SLOT_TASK[s].format(name=zh_en.get(h, k), how=how), "item")
    json.dump(slots, open(os.path.join(DOLL, "slots.json"), "w"), indent=0)
    zh = json.load(open(os.path.join(arc, "zh.json")))["itemNames"]
    json.dump({k: zh.get("/items/" + k, k) for k in slots}, open(os.path.join(DOLL, "names.json"), "w"), ensure_ascii=False, indent=0)
    open(os.path.join(RAW, "jobs-doll.tsv"), "w").write("\n".join(rows) + "\n")
    print(len(rows), "doll jobs")


if CMD == "jobs":
    jobs(sys.argv[3])
