#!/usr/bin/env python3
"""Writes Codex jobs for the rigged player's avatar / outfit layers. Each layer is two images:
  body   <name>.png        the armless figure (noarms_a.png, the bald base without arms) repainted as the layer,
                           pixel-aligned to it
  parts  <name>_parts.png  the parts guide (guide_parts.png, tools/rig-player-guide.py) repainted as the layer's
                           arms and fists (sleeves and gloves for an outfit), with the body drawn first as a reference
tools/rig-player-layers.py cuts them.

usage: make-rig-player-jobs.py <raw_dir> body|bodym|parts <name> ...   names like a_cat_1 / o_mage_1 (ref/lib/<name>.png)
       make-rig-player-jobs.py <raw_dir> body|bodym|parts --all        every avatar and outfit in ref/lib
bodym: avatars only, the head painted and the body left magenta (for those whose bare body the image filter blocks)
Writes <raw_dir>/rig/pl3/jobs-<phase>.tsv for tools/gen.sh <raw_dir>/rig/pl3 <jobs> <parallel> (it skips sheets that
exist); run the parts phase after the body sheets are in.
"""
import os
import sys

RAW, PHASE = sys.argv[1], sys.argv[2]
PL = os.path.join(RAW, "rig", "pl3")
SHEETS = os.path.join(PL, "sheets")
LIB = os.path.join(RAW, "ref", "lib")
HEAD = "Use your image generation tool to create ONE image, then reply with the absolute path of the saved PNG and nothing else.\n\n"
GREEN = "Background: perfectly flat pure green #00FF00, no floor, no shadow, no text."
BASE = (
    "Reference image 1 is a BASE FIGURE: a bald chibi battle unit WITHOUT ARMS (they are drawn separately), in 3/4 side view "
    "facing right (Arknights-style in-battle chibi), on a flat green background. "
)
KEEP = (
    "Keep EXACTLY the outline, size, position and pose of image 1 (same head, same armless torso with its rounded shoulders, same legs and "
    "feet), so the result lies over image 1 pixel for pixel. Do NOT add arms or hands. "
)
PARTS = (
    "Reference image 1 is a PARTS SHEET on a flat green background: four arm segments of a chibi character, each a horizontal capsule "
    "(top row: the front upper arm and forearm; middle row: the back upper arm and forearm; the LEFT end of each upper arm is the shoulder, "
    "the right end of each forearm is the wrist), and its two fists (bottom row). "
)
PROMPT = {
    ("body", "a"): HEAD
    + BASE
    + "Reference image 2 is a game avatar shown from the FRONT (flat vector art, soft cel shading).\n"
    "Task: repaint the figure of image 1 as the avatar of image 2, in the same 3/4 view facing right: its skin colour, face, both eyes, "
    "hair, ears and any horns, tail or animal features. No clothes and no accessories other than what image 2 shows.\n"
    + KEEP
    + "Only hair, ears, horns or a tail may extend outside the outline.\n"
    "Output: square, same size and framing as image 1. " + GREEN + " Do not use green on the character.\n",
    # (an avatar whose body Codex's filter blocks: the head only, the body left in magenta; rig-player-layers.py fills
    # it with the base figure recoloured to the skin of the avatar's arms)
    ("bodym", "a"): HEAD
    + BASE
    + "Reference image 2 is a game avatar shown from the FRONT (flat vector art, soft cel shading).\n"
    "Task: repaint the HEAD of image 1 as the head of image 2, in the same 3/4 view facing right: its face, both eyes, hair, ears and "
    "any horns, and a tail or wings if image 2 has them. Paint the whole figure below the chin (neck, torso, legs, feet) in perfectly "
    "flat unshaded magenta #FF00FF, keeping its outline exactly; no clothes, no details on it.\n"
    + KEEP
    + "Only hair, ears, horns, wings or a tail may extend outside the outline.\n"
    "Output: square, same size and framing as image 1. " + GREEN + " Do not use green or magenta on the character.\n",
    ("body", "o"): HEAD
    + BASE
    + "Reference image 2 is a game outfit shown from the FRONT (flat vector art, soft cel shading).\n"
    "Task: dress the figure of image 1 in the outfit of image 2, redrawn in the same 3/4 view facing right: the top on the torso (ending "
    "at the shoulders, the sleeves are drawn separately), the bottoms on the legs, shoes on the feet, and headgear only if the outfit has it. "
    "Paint the whole figure that the outfit does NOT cover (face, head, bare skin) in perfectly flat unshaded magenta #FF00FF.\n"
    + KEEP
    + "Clothing may stick out a little where it naturally would (a skirt, a cape, a collar).\n"
    "Output: square, same size and framing as image 1. " + GREEN + " Do not use green or magenta on the clothing.\n",
    ("parts", "a"): HEAD
    + PARTS
    + "Reference image 2 is the character's body, already drawn without arms. Reference image 3 is the character as a game avatar from the front.\n"
    "Task: repaint every piece of image 1 as this character's BARE arms and fists: the skin or fur colour and shading of image 2, fur, "
    "scales or spots where it has them, paws or claws on the fists if it has them. Same flat vector style as image 2.\n"
    "The arm pieces are joined end to end on the character (shoulder, elbow), so paint each one the SAME all the way along: no seam, "
    "no band, no darker or lighter cap at either rounded end, no sleeve opening drawn on an end; only a cuff at the wrist end of a forearm. "
    "Keep the soft shade along the lower side of each piece, as in image 1, in the darker tone of its own colour.\n"
    "Keep EXACTLY the shape, size and position of every piece, so each lies over its piece in image 1; nothing else on the sheet.\n"
    "Output: same size and framing as image 1. " + GREEN + " Do not use green on the pieces.\n",
    ("parts", "o"): HEAD
    + PARTS
    + "Reference image 2 is a body wearing an outfit, already drawn without arms. Reference image 3 is the outfit from the front.\n"
    "Task: repaint the pieces of image 1 as the SLEEVES and GLOVES of this outfit, in the same flat vector style and colours as image 2: "
    "each upper arm piece runs from the shoulder to the elbow, each forearm piece from the elbow to the wrist. A sleeve covers the arm "
    "from the shoulder down as far as it reaches on the outfit: a long sleeve all four pieces; a sleeve to the elbow (puffed or not) the "
    "whole upper arm pieces; a short cap sleeve only their shoulder end; a sleeveless top none. Bracers, wrist guards, arm bands and cuffs "
    "go where they sit on the arm (a bracer or wrist guard on the wrist half of the forearm pieces), never on the fists; a cuff may flare "
    "out a little at the wrist end. The fists get gloves or gauntlets only if the outfit has gloves. Paint every part of every piece that "
    "the outfit does NOT cover in perfectly flat unshaded magenta #FF00FF.\n"
    "The arm pieces are joined end to end on the character (shoulder, elbow), so paint each one the SAME all the way along: no seam, "
    "no band, no darker or lighter cap at either rounded end, no sleeve opening drawn on an end; only a cuff at the wrist end of a forearm. "
    "Keep the soft shade along the lower side of each piece, as in image 1, in the darker tone of its own colour.\n"
    "Keep EXACTLY the shape, size and position of every piece, so each lies over its piece in image 1; nothing else on the sheet.\n"
    "Output: same size and framing as image 1. " + GREEN + " Do not use green or magenta on the clothing.\n",
}
names = sys.argv[3:]
if names == ["--all"]:
    names = sorted(f[:-4] for f in os.listdir(LIB) if f[:2] in ("a_", "o_") and f.endswith(".png"))
for (ph, k), text in PROMPT.items():
    if ph == "bodym":
        ph = "body"
        k = "am"
    with open(os.path.join(PL, f"p_{ph}_{k}.txt"), "w") as f:
        f.write(text)
HINTS = {}
if os.path.exists(os.path.join(PL, "hints.tsv")):
    for line in open(os.path.join(PL, "hints.tsv")):
        if line.strip() and not line.startswith("#"):
            nm, ph, text = line.rstrip("\n").split("\t")
            HINTS[(nm, ph)] = text
n = 0
with open(os.path.join(PL, f"jobs-{PHASE}.tsv"), "w") as f:  # (bodym: jobs-bodym.tsv)
    for name in names:
        ref = os.path.join(LIB, name + ".png")
        if not os.path.exists(ref):
            sys.exit("no reference " + ref)
        prompt = os.path.join(PL, "p_body_am.txt" if PHASE == "bodym" else f"p_{PHASE}_{name[0]}.txt")
        # a layer Codex keeps getting wrong: its note (<pl3>/hints.tsv: name, phase, text) added to its own prompt
        hint = HINTS.get((name, PHASE))
        if hint:
            text = open(prompt).read() + "In particular: " + hint + "\n"
            prompt = os.path.join(PL, f"p_{PHASE}_{name}.txt")
            with open(prompt, "w") as h:
                h.write(text)
        if PHASE in ("body", "bodym"):
            f.write(f"{name}\t{prompt}\t{os.path.join(SHEETS, 'noarms_a.png')},{ref}\n")
        else:
            body = os.path.join(SHEETS, name + ".png")
            if not os.path.exists(body):
                print("no body sheet yet:", name)
                continue
            f.write(f"{name}_parts\t{prompt}\t{os.path.join(SHEETS, 'guide_parts.png')},{body},{ref}\n")
        n += 1
print(n, "jobs")
