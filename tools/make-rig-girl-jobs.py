#!/usr/bin/env python3
"""Writes Codex jobs for the monster-girl look (cfg.monGirl): a new idle frame per monster, drawn as a monster girl in
the pose of its own idle frame, then cut into a rig like any monster (make-rig-monster-jobs.py --girl, rig-monster.py --src).
Three references per monster:
  1  assets/m/<id>/idle.webp on a flat background, 2x: pose, framing, facing, what it holds and in which hand
  2  <raw>/rig/girl/lao/<id>.png: the design (hair, ears, horns, outfit, colours), from the userscript 娘化怪物换皮
     (greasyfork 538533 by LaoTY, MIT); the pictures stay in the raw folder, never in the repo
  3  the player chibi base (<raw>/rig/pl2/sheets/base_a.png), mirrored to face left: proportions and art style
phase idle -> <raw>/rig/girl/sheets/<id>_idle.png; tools/rig-girl-idle.py keys and frames it into <raw>/rig/girl/idle/<id>.png
usage: make-rig-girl-jobs.py <raw_dir> <id> ...
A monster Codex keeps getting wrong takes a note of its own from <raw_dir>/rig/girl/hints.tsv (id, phase, note).
"""
import os
import sys

from PIL import Image, ImageOps

RAW, IDS = sys.argv[1], sys.argv[2:]
GIRL = os.path.join(RAW, "rig", "girl")
ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets")
PROMPT = (
    "Use your image generation tool to create ONE image, then reply with the absolute path of the saved PNG and nothing else.\n\n"
    "Reference image 1 is a monster from a 2D battle game (flat vector art, soft cel shading, no black outlines), standing in 3/4 view "
    "facing LEFT. Reference image 2 is a fan design of the same monster as a cute monster girl (a pixel-art portrait). Reference image 3 "
    "is the body type our game uses for its chibi characters (big round head, small body), also facing LEFT.\n"
    "Task: draw that monster girl as a game sprite: the girl of image 2 (her face, hair colour and style, ears, horns, antennae, tail, "
    "wings, outfit and its colours, and the monster's features she keeps) with the chibi proportions of image 3, in the art style of "
    "image 1 (flat colours, soft cel shading, smooth clean shapes, no pixel art, no black outlines).\n"
    "Pose: EXACTLY the pose of image 1: same position and size in the picture, feet on the same ground line, standing in 3/4 view facing "
    "LEFT, and holding the SAME object as image 1 (same weapon, same size) in the SAME hand at the same place; if image 1 holds nothing, "
    "the hands are empty fists. Both arms clearly apart from the body with a gap between arm and body, both legs apart and both feet "
    "visible, like image 3.\n"
    "She is fully clothed in the outfit of image 2 (a modest dress, tunic or armour covering the body), a friendly cute game character.\n"
    "Background: perfectly flat {bg} everywhere outside her. No text, no shadow, no floor, no frame. Do not use {bg} on her.\n"
    "Output: square, same framing as image 1.\n"
)
BGS = {"green #00FF00": (0, 255, 0), "magenta #FF00FF": (255, 0, 255), "blue #0000FF": (0, 0, 255)}


def background(*ims):
    # the key colour farthest from every colour of the monster and of the design
    px = [p[:3] for im in ims for p in im.convert("RGBA").resize((160, 160)).get_flattened_data() if p[3] > 200][::5]
    far = lambda c: min(sum((a - b) ** 2 for a, b in zip(p, c)) for p in px)
    return max(BGS, key=lambda k: far(BGS[k]))


HP = os.path.join(GIRL, "hints.tsv")
HINTS = [l.rstrip("\n").split("\t", 2) for l in open(HP) if l.count("\t") >= 2] if os.path.exists(HP) else []
for d in ("ref", "prompts"):
    os.makedirs(os.path.join(GIRL, d), exist_ok=True)
base = ImageOps.mirror(Image.open(os.path.join(RAW, "rig", "pl2", "sheets", "base_a.png")).convert("RGB"))
style = os.path.join(GIRL, "ref", "base_left.png")
if not os.path.exists(style):
    base.resize((800, 800), Image.LANCZOS).save(style)
rows = []
for mid in IDS:
    im = Image.open(os.path.join(ASSETS, "m", mid, "idle.webp")).convert("RGBA")
    lao = Image.open(os.path.join(GIRL, "lao", mid + ".png")).convert("RGBA")
    bg = background(im, lao)
    ref = os.path.join(GIRL, "ref", f"{mid}_idle.png")
    flat = Image.new("RGBA", im.size, BGS[bg] + (255,))
    flat.alpha_composite(im)
    flat.convert("RGB").resize((im.width * 2, im.height * 2), Image.LANCZOS).save(ref)
    # the design on white, at most 800 px
    des = os.path.join(GIRL, "ref", f"{mid}_lao.png")
    w = Image.new("RGBA", lao.size, (255, 255, 255, 255))
    w.alpha_composite(lao)
    w = w.convert("RGB")
    w.thumbnail((800, 800))
    w.save(des)
    prompt = os.path.join(GIRL, "prompts", f"{mid}_idle.txt")
    note = "".join(f"Important for this monster: {t}\n" for i, ph, t in HINTS if i == mid and ph == "idle")
    open(prompt, "w").write(PROMPT.replace("{bg}", bg) + note)
    rows.append(f"{mid}_idle\t{prompt}\t{ref},{des},{style}")
    print(mid, bg)
open(os.path.join(GIRL, "jobs-idle.tsv"), "w").write("\n".join(rows) + "\n")
