#!/usr/bin/env python3
"""Writes Codex jobs for the rigged player's avatar / outfit layers: each one repainted over the bald base figure
(base_a.png), pixel-aligned, so the cut pipeline (tools/rig-player-layers.py) can split it like every other layer.

usage: make-rig-player-jobs.py <raw_dir> <name> ...     names like a_cat_1 / o_mage_1 (the game image is ref/lib/<name>.png)
       make-rig-player-jobs.py <raw_dir> --all          every avatar and outfit in ref/lib not drawn yet
Writes <raw_dir>/rig/pl2/jobs-layers.tsv for tools/gen.sh <raw_dir>/rig/pl2 <jobs> <parallel>.
"""
import os
import sys

RAW = sys.argv[1]
PL = os.path.join(RAW, "rig", "pl2")
LIB = os.path.join(RAW, "ref", "lib")
BASE = os.path.join(PL, "sheets", "base_a.png")
HEAD = "Use your image generation tool to create ONE image, then reply with the absolute path of the saved PNG and nothing else.\n\n"
KEEP = (
    "Keep EXACTLY the outline, size, position and pose of image 1 (same head, same body, both arms and fists in the same place, "
    "same legs and feet), so the result lies over image 1 pixel for pixel; "
)
PROMPT = {
    "a": HEAD
    + "Reference image 1 is a BASE FIGURE: a bald chibi battle unit in 3/4 side view facing right (Arknights-style in-battle chibi) on a flat green background. "
    "Reference image 2 is a game avatar shown from the FRONT (flat vector art, soft cel shading).\n"
    "Task: repaint the base figure of image 1 as the avatar of image 2, in the same 3/4 view facing right: its skin colour, face, both eyes, hair, ears and any horns, "
    "tail or animal features. No clothes and no accessories other than what image 2 shows.\n"
    + KEEP
    + "only hair, ears, horns or a tail may extend outside the outline.\n"
    "Output: square, same size and framing as image 1. Background: perfectly flat pure green #00FF00, no floor, no shadow, no text. Do not use green on the character.\n",
    "o": HEAD
    + "Reference image 1 is a BASE FIGURE: a bald chibi battle unit in 3/4 side view facing right (Arknights-style in-battle chibi) on a flat green background. "
    "Reference image 2 is a game outfit shown from the FRONT (flat vector art, soft cel shading).\n"
    "Task: dress the base figure of image 1 in the outfit of image 2, redrawn in the same 3/4 view facing right: the top on the torso, sleeves on both arms, "
    "the bottoms on the legs, shoes on the feet, and headgear only if the outfit has it. Paint the whole figure that the outfit does NOT cover "
    "(face, head, bare skin) in perfectly flat unshaded magenta #FF00FF.\n"
    + KEEP
    + "clothing may stick out a little where it naturally would (skirt, shoulder plates).\n"
    "Output: square, same size and framing as image 1. Background: perfectly flat pure green #00FF00, no floor, no shadow, no text. "
    "Do not use green or magenta on the clothing.\n",
}
names = sys.argv[2:]
if names == ["--all"]:
    done = set(f[:-4] for f in os.listdir(os.path.join(PL, "sheets")))
    names = sorted(f[:-4] for f in os.listdir(LIB) if f[:2] in ("a_", "o_") and f.endswith(".png") and f[:-4] not in done)
for k, text in PROMPT.items():
    with open(os.path.join(PL, f"p_layer_{k}.txt"), "w") as f:
        f.write(text)
with open(os.path.join(PL, "jobs-layers.tsv"), "w") as f:
    for n in names:
        ref = os.path.join(LIB, n + ".png")
        if not os.path.exists(ref):
            sys.exit("no reference " + ref)
        f.write(f"{n}\t{os.path.join(PL, 'p_layer_' + n[0] + '.txt')}\t{BASE},{ref}\n")
print(len(names), "jobs")
