#!/usr/bin/env python3
"""Writes Codex jobs for cutting monsters into rig parts (tools/rig-monster.py). Two images per monster, both traced
over its idle frame (assets/m/<id>/idle.webp, given at 2x on a flat background):
  seg    <id>_seg.png    a PART MAP: the monster in flat key colours, one per part
  trunk  <id>_trunk.png  the monster with its arms, hands, held objects and legs taken off and the body completed,
                         so the parts can move off it without leaving a hole
usage: make-rig-monster-jobs.py <raw_dir> seg|trunk <id> ...
A monster Codex keeps getting wrong takes a note of its own from <raw_dir>/rig/mon/hints.tsv (id, phase, note).
Writes <raw_dir>/rig/mon/ref/<id>.png and <raw_dir>/rig/mon/jobs-<phase>.tsv for tools/gen.sh <raw_dir>/rig/mon <jobs> <parallel>.
"""
import json
import os
import sys

from PIL import Image

RAW, PHASE, IDS = sys.argv[1], sys.argv[2], sys.argv[3:]
MON = os.path.join(RAW, "rig", "mon")
ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets")
HEAD = "Use your image generation tool to create ONE image, then reply with the absolute path of the saved PNG and nothing else.\n\n"
REF = "Reference image 1 is a monster from a 2D battle game (flat vector art, soft cel shading) on a flat {bg} background, seen in 3/4 view facing LEFT.\n"
PROMPT = {
    "seg": HEAD
    + REF
    + "Task: make a PART MAP of it for a cutout puppet (Spine-style rig). Trace the monster EXACTLY: same outline, same size, same position, "
    "so the map lies over image 1 pixel for pixel. Fill every part of the monster with ONE perfectly flat colour by which body part it "
    "belongs to (no shading, no outlines, no details, no anti-aliasing between parts):\n"
    "- RED #FF0000: the trunk: body and head together (for a creature whose head is part of its body), including ears, hair, horns, tail "
    "and anything worn on the body.\n"
    "- YELLOW #FFFF00: the head, ONLY if it is a separate head on a neck; otherwise do not use yellow.\n"
    "- BLUE #0000FF: the arm on the LEFT side of the picture, from the shoulder to the hand.\n"
    "- CYAN #00FFFF: the arm on the RIGHT side of the picture, from the shoulder to the hand.\n"
    "- WHITE #FFFFFF: a weapon or object held in the hands (blade, staff, club, slingshot, torch with its flame), the whole object.\n"
    "- GREEN #00FF00: the leg / foot on the LEFT side of the picture.\n"
    "- MAGENTA #FF00FF: the leg / foot on the RIGHT side of the picture.\n"
    "- ORANGE #FF8000: anything floating in the air around the monster, not held and not touching it (orbs, crystals, "
    "snowflakes, sparks), each object whole.\n"
    "Where one part covers another, paint only the part on top (as it appears in image 1).\n"
    "Background: perfectly flat black #000000 everywhere outside the monster. No text, no labels.\n"
    "Output: square, same framing as image 1.\n",
    "trunk": HEAD
    + REF
    + "Task: redraw it as the TRUNK PIECE of a cutout puppet: the same monster with its ARMS, HANDS, anything held in the hands, and its "
    "LEGS / FEET all taken off, and anything floating in the air around it removed. Keep the head, face, ears, hair, horns, tail, wings and anything worn on the body exactly as in image 1, "
    "pixel for pixel where they are visible. Where the arms, the held object or the legs covered the body, complete the body naturally: "
    "continue its colours, shading, spots, clothing and outline, with a smooth rounded edge at the shoulders and at the bottom where the "
    "legs were. Same size, same position, same view; nothing new added.\n"
    "Background: perfectly flat {bg} everywhere outside the monster. No text, no shadow, no floor. Do not use {bg} on the monster.\n"
    "Output: square, same framing as image 1.\n",
}
# a four-legged beast (tools/rig-monster.json tmpl quad): its head and four legs, the trunk without them
QUAD = (
    "Task: make a PART MAP of it for a cutout puppet (Spine-style rig). Trace the monster EXACTLY: same outline, same size, same position, "
    "so the map lies over image 1 pixel for pixel. Fill every part of the animal with ONE perfectly flat colour by which body part it "
    "belongs to (no shading, no outlines, no details, no anti-aliasing between parts):\n"
    "- RED #FF0000: the body: back, belly, chest, neck, rump and tail.\n"
    "- YELLOW #FFFF00: the head (face, snout, ears, horns), from where it meets the neck.\n"
    "- BLUE #0000FF: the FRONT leg nearer to the viewer (the one drawn over the body), from the shoulder to the paw.\n"
    "- CYAN #00FFFF: the FRONT leg farther from the viewer (partly hidden), from the shoulder to the paw.\n"
    "- GREEN #00FF00: the BACK leg nearer to the viewer, from the hip to the paw.\n"
    "- MAGENTA #FF00FF: the BACK leg farther from the viewer, from the hip to the paw.\n"
    "Where one part covers another, paint only the part on top (as it appears in image 1).\n"
    "Background: perfectly flat black #000000 everywhere outside the animal. No text, no labels.\n"
    "Output: square, same framing as image 1.\n"
)
QUAD_TRUNK = (
    "Task: redraw it as the TRUNK PIECE of a cutout puppet: the same animal with its HEAD and all FOUR LEGS taken off. Keep the body, "
    "neck, back, belly, rump and tail exactly as in image 1, pixel for pixel where they are visible. Where the head and the legs covered "
    "the body, complete it naturally: continue its colours, fur, shading and outline, with a smooth rounded end at the neck and a smooth "
    "belly line where the legs were. Same size, same position, same view; nothing new added.\n"
    "Background: perfectly flat {bg} everywhere outside the animal. No text, no shadow, no floor. Do not use {bg} on the animal.\n"
    "Output: square, same framing as image 1.\n"
)
PROMPT[("seg", "quad")] = HEAD + REF + QUAD
PROMPT[("trunk", "quad")] = HEAD + REF + QUAD_TRUNK
TMPL = {k: v.get("tmpl") for k, v in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "rig-monster.json"))).items()}
BGS = {"white #FFFFFF": (255, 255, 255), "green #00FF00": (0, 255, 0), "magenta #FF00FF": (255, 0, 255), "blue #0000FF": (0, 0, 255)}


def background(im):
    # the key colour farthest from every colour of the monster
    px = [p[:3] for p in im.get_flattened_data() if p[3] > 200][::7]
    far = lambda c: min(sum((a - b) ** 2 for a, b in zip(p, c)) for p in px)
    return max((k for k in BGS if "white" not in k), key=lambda k: far(BGS[k]))


HP = os.path.join(MON, "hints.tsv")
HINTS = [l.rstrip("\n").split("\t", 2) for l in open(HP) if l.count("\t") >= 2] if os.path.exists(HP) else []
os.makedirs(os.path.join(MON, "ref"), exist_ok=True)
os.makedirs(os.path.join(MON, "prompts"), exist_ok=True)
rows = []
for mid in IDS:
    im = Image.open(os.path.join(ASSETS, "m", mid, "idle.webp")).convert("RGBA")
    # (the part map's key colours include green and magenta: its reference is on white)
    bg = "white #FFFFFF" if PHASE == "seg" else background(im)
    ref = os.path.join(MON, "ref", f"{mid}_{PHASE}.png")
    base = Image.new("RGBA", im.size, BGS[bg] + (255,))
    base.alpha_composite(im)
    base.convert("RGB").resize((im.width * 2, im.height * 2), Image.LANCZOS).save(ref)
    prompt = os.path.join(MON, "prompts", f"{mid}_{PHASE}.txt")
    # a monster Codex keeps getting wrong: a note of its own (<raw>/rig/mon/hints.tsv: id, phase, note)
    note = "".join(f"Important for this monster: {t}\n" for i, ph, t in HINTS if i == mid and ph == PHASE)
    open(prompt, "w").write(PROMPT.get((PHASE, TMPL.get(mid)), PROMPT[PHASE]).replace("{bg}", bg) + note)
    rows.append(f"{mid}_{PHASE}\t{prompt}\t{ref}")
    print(mid, bg)
open(os.path.join(MON, f"jobs-{PHASE}.tsv"), "w").write("\n".join(rows) + "\n")
