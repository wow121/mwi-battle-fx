#!/usr/bin/env python3
"""Writes Codex jobs for cutting monsters into rig parts (tools/rig-monster.py). Two images per monster, both traced
over its idle frame (assets/m/<id>/idle.webp, given at 2x on a flat background):
  seg    <id>_seg.png    a PART MAP: the monster in flat key colours, one per part
  trunk  <id>_trunk.png  the monster with its arms, hands, held objects and legs taken off and the body completed,
                         so the parts can move off it without leaving a hole
usage: make-rig-monster-jobs.py <raw_dir> seg|trunk <id> ...   [--girl]
  --girl: the monster girl's idle frame (<raw>/rig/girl/idle/<id>.png, tools/make-rig-girl-jobs.py) instead, jobs and
  hints in <raw>/rig/girl, her template under girl_<id> in tools/rig-monster.json (else biped)
A monster Codex keeps getting wrong takes a note of its own from <raw_dir>/rig/mon/hints.tsv (id, phase, note).
Writes <raw_dir>/rig/mon/ref/<id>.png and <raw_dir>/rig/mon/jobs-<phase>.tsv for tools/gen.sh <raw_dir>/rig/mon <jobs> <parallel>.
"""
import json
import os
import sys

from PIL import Image

GIRL = "--girl" in sys.argv
RAW, PHASE, IDS = sys.argv[1], sys.argv[2], [a for a in sys.argv[3:] if a != "--girl"]
MON = os.path.join(RAW, "rig", "girl" if GIRL else "mon")
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
# a flier (tmpl fly): its wings, the rest one body
FLY = (
    "Task: make a PART MAP of it for a cutout puppet (Spine-style rig). Trace the creature EXACTLY: same outline, same size, same position, "
    "so the map lies over image 1 pixel for pixel. Fill every part of it with ONE perfectly flat colour by which part it belongs to "
    "(no shading, no outlines, no details, no anti-aliasing between parts):\n"
    "- RED #FF0000: the body: head, eyes, antennae, thorax, abdomen, tail, legs and any little arms, all of it except the wings.\n"
    "- BLUE #0000FF: every wing NEARER to the viewer (drawn over the body), or, for wings spread flat, the wings on the LEFT side of the picture.\n"
    "- CYAN #00FFFF: every wing FARTHER from the viewer (behind the body), or, for wings spread flat, the wings on the RIGHT side.\n"
    "Each wing whole, out to its tip. Where one part covers another, paint only the part on top (as it appears in image 1).\n"
    "Background: perfectly flat black #000000 everywhere outside the creature. No text, no labels.\n"
    "Output: square, same framing as image 1.\n"
)
FLY_TRUNK = (
    "Task: redraw it as the BODY PIECE of a cutout puppet: the same creature with ALL its WINGS taken off. Keep the head, eyes, antennae, "
    "body, legs, arms and tail exactly as in image 1, pixel for pixel where they are visible. Where the wings covered the body, complete it "
    "naturally: continue its colours, stripes, fur, shading and outline. Same size, same position, same view; nothing new added.\n"
    "Background: perfectly flat {bg} everywhere outside the creature. No text, no shadow, no floor. Do not use {bg} on the creature.\n"
    "Output: square, same framing as image 1.\n"
)
# a limbless one (tmpl blob: slimes, eyes, jellyfish, a snake, a chest): one body that squashes and stretches, maybe a top
# piece of its own (a lid, a cap, a head on a long neck) and loose appendages swaying on their roots; which is which
# this monster's note (hints.tsv) says
BLOB = (
    "Task: make a PART MAP of it for a cutout puppet (Spine-style rig). Trace the creature EXACTLY: same outline, same size, same position, "
    "so the map lies over image 1 pixel for pixel. Fill every part of it with ONE perfectly flat colour by which part it belongs to "
    "(no shading, no outlines, no details, no anti-aliasing between parts):\n"
    "- RED #FF0000: the main body, everything not named below.\n"
    "- YELLOW #FFFF00: the TOP PIECE named in the note below, whole (only if the note names one; else do not use yellow).\n"
    "- BLUE #0000FF: each loose APPENDAGE named in the note (tentacle, stalk, antenna, thin leg, hand, flag) that is drawn IN FRONT of "
    "the body or beside it, each one whole from where it joins the body to its tip.\n"
    "- CYAN #00FFFF: each such appendage drawn BEHIND the body (partly hidden by it).\n"
    "- ORANGE #FF8000: anything floating in the air around it, not touching it (drops, sparks), each whole.\n"
    "Where one part covers another, paint only the part on top (as it appears in image 1).\n"
    "Background: perfectly flat black #000000 everywhere outside the creature. No text, no labels.\n"
    "Output: square, same framing as image 1.\n"
)
BLOB_TRUNK = (
    "Task: redraw it as the BODY PIECE of a cutout puppet: the same creature with the parts named in the note below taken off (and "
    "anything floating around it removed). Keep everything else exactly as in image 1, pixel for pixel where it is visible. Where the "
    "removed parts covered the body, complete the body naturally: continue its colours, pattern, shading and outline, with a smooth "
    "rounded edge where they joined it. Same size, same position, same view; nothing new added.\n"
    "Background: perfectly flat {bg} everywhere outside the creature. No text, no shadow, no floor. Do not use {bg} on the creature.\n"
    "Output: square, same framing as image 1.\n"
)
PROMPT[("seg", "blob")] = HEAD + REF + BLOB
PROMPT[("trunk", "blob")] = HEAD + REF + BLOB_TRUNK
# an arthropod (tmpl bug): its pincers / scythe arms, each walking leg, a scorpion's tail and a head of its own apart
BUG = (
    "Task: make a PART MAP of it for a cutout puppet (Spine-style rig). Trace the creature EXACTLY: same outline, same size, same position, "
    "so the map lies over image 1 pixel for pixel. Fill every part of it with ONE perfectly flat colour by which part it belongs to "
    "(no shading, no outlines, no details, no anti-aliasing between parts):\n"
    "- RED #FF0000: the body (shell, thorax, abdomen), and the head too unless the note below says the head is yellow.\n"
    "- YELLOW #FFFF00: the HEAD, only if the note below says so, whole (with its eyes, antennae, horns).\n"
    "- BLUE #0000FF: the PINCER / CLAW / SCYTHE ARM nearer to the viewer (drawn over the body, or the one on the LEFT), whole from where it "
    "joins the body to its tip.\n"
    "- CYAN #00FFFF: the other pincer / claw / scythe arm (farther, partly hidden, or on the RIGHT).\n"
    "- GREEN #00FF00: each thin WALKING LEG nearer to the viewer (in front of the body), each one whole from the body to its foot.\n"
    "- MAGENTA #FF00FF: each walking leg farther from the viewer (behind the body).\n"
    "- WHITE #FFFFFF: a scorpion's TAIL with its stinger, only if the note below says so, whole from where it leaves the body.\n"
    "Where one part covers another, paint only the part on top (as it appears in image 1).\n"
    "Background: perfectly flat black #000000 everywhere outside the creature. No text, no labels.\n"
    "Output: square, same framing as image 1.\n"
)
BUG_TRUNK = (
    "Task: redraw it as the BODY PIECE of a cutout puppet: the same creature with its pincers / claws / scythe arms, ALL its walking legs, "
    "and the other parts named in the note below taken off. Keep the rest of the body exactly as in image 1, pixel for pixel where it is "
    "visible. Where the removed parts covered the body, complete it naturally: continue its colours, shell pattern, shading and outline, "
    "with a smooth edge where they joined it and a smooth belly line where the legs were. Same size, same position, same view; nothing new added.\n"
    "Background: perfectly flat {bg} everywhere outside the creature. No text, no shadow, no floor. Do not use {bg} on the creature.\n"
    "Output: square, same framing as image 1.\n"
)
# a centaur (tmpl centaur): the human upper body yellow, its arms and bow as a biped's, each horse leg apart
CENT = (
    "Task: make a PART MAP of it for a cutout puppet (Spine-style rig). Trace the centaur EXACTLY: same outline, same size, same position, "
    "so the map lies over image 1 pixel for pixel. Fill every part of it with ONE perfectly flat colour by which part it belongs to "
    "(no shading, no outlines, no details, no anti-aliasing between parts):\n"
    "- RED #FF0000: the HORSE body (barrel, rump, chest of the horse) and its tail.\n"
    "- YELLOW #FFFF00: the HUMAN upper body from the waist up: belly, chest, shoulders, neck, head, face and hair (but not the arms).\n"
    "- BLUE #0000FF: the arm on the LEFT side of the picture, from the shoulder to the hand.\n"
    "- CYAN #00FFFF: the arm on the RIGHT side of the picture, from the shoulder to the hand.\n"
    "- WHITE #FFFFFF: the bow (or whatever it holds), the whole object with its string.\n"
    "- GREEN #00FF00: each horse leg NEARER to the viewer (drawn over the body), each whole from the body to the hoof.\n"
    "- MAGENTA #FF00FF: each horse leg FARTHER from the viewer (partly hidden).\n"
    "Where one part covers another, paint only the part on top (as it appears in image 1).\n"
    "Background: perfectly flat black #000000 everywhere outside the centaur. No text, no labels.\n"
    "Output: square, same framing as image 1.\n"
)
CENT_TRUNK = (
    "Task: redraw it as the BODY PIECE of a cutout puppet: the same centaur with its ARMS, the BOW and all FOUR horse LEGS taken off. Keep "
    "the human upper body (head, face, hair, chest, belly) and the horse body with its tail exactly as in image 1, pixel for pixel where "
    "they are visible. Where the arms, the bow and the legs covered them, complete them naturally: the bare chest and belly, the shoulders "
    "rounded off, the horse's side and a smooth belly line where the legs were. Same size, same position, same view; nothing new added.\n"
    "Background: perfectly flat {bg} everywhere outside the centaur. No text, no shadow, no floor. Do not use {bg} on the centaur.\n"
    "Output: square, same framing as image 1.\n"
)
PROMPT[("seg", "centaur")] = HEAD + REF + CENT
PROMPT[("trunk", "centaur")] = HEAD + REF + CENT_TRUNK
PROMPT[("seg", "bug")] = HEAD + REF + BUG
PROMPT[("trunk", "bug")] = HEAD + REF + BUG_TRUNK
# a fish (tmpl fish): cut the same way, its fins and tail the appendages
PROMPT[("seg", "fish")] = PROMPT[("seg", "blob")]
PROMPT[("trunk", "fish")] = PROMPT[("trunk", "blob")]
PROMPT[("seg", "fly")] = HEAD + REF + FLY
PROMPT[("trunk", "fly")] = HEAD + REF + FLY_TRUNK
PROMPT[("seg", "quad")] = HEAD + REF + QUAD
PROMPT[("trunk", "quad")] = HEAD + REF + QUAD_TRUNK
# a monster girl's head is cut whole with all her hair (Codex otherwise gives only the face, the hair stays on the body)
GIRL_SEG = PROMPT["seg"].replace(
    "- RED #FF0000: the trunk: body and head together (for a creature whose head is part of its body), including ears, hair, horns, tail "
    "and anything worn on the body.\n"
    "- YELLOW #FFFF00: the head, ONLY if it is a separate head on a neck; otherwise do not use yellow.\n",
    "- RED #FF0000: the trunk: neck, chest, belly, hips, the clothes on them (dress, skirt, tunic, cape, scarf), and a tail or wings.\n"
    "- YELLOW #FFFF00: the WHOLE head: face, ALL of the hair (including long hair hanging down behind the shoulders and back, and "
    "every strand and bun), ears, horns, antennae, hat and hair ornaments, as one piece.\n",
)
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
    im = Image.open(os.path.join(MON, "idle", mid + ".png") if GIRL else os.path.join(ASSETS, "m", mid, "idle.webp")).convert("RGBA")
    # (the part map's key colours include green and magenta: its reference is on white)
    bg = "white #FFFFFF" if PHASE == "seg" else background(im)
    ref = os.path.join(MON, "ref", f"{mid}_{PHASE}.png")
    base = Image.new("RGBA", im.size, BGS[bg] + (255,))
    base.alpha_composite(im)
    base.convert("RGB").resize((im.width * 2, im.height * 2), Image.LANCZOS).save(ref)
    prompt = os.path.join(MON, "prompts", f"{mid}_{PHASE}.txt")
    # a monster Codex keeps getting wrong: a note of its own (<raw>/rig/mon/hints.tsv: id, phase, note)
    note = "".join(f"Important for this monster: {t}\n" for i, ph, t in HINTS if i == mid and ph == PHASE)
    open(prompt, "w").write((GIRL_SEG if GIRL and PHASE == "seg" and TMPL.get("girl_" + mid) in (None, "biped", "robed") else PROMPT.get((PHASE, TMPL.get("girl_" + mid if GIRL else mid)), PROMPT[PHASE])).replace("{bg}", bg) + note)
    rows.append(f"{mid}_{PHASE}\t{prompt}\t{ref}")
    print(mid, bg)
open(os.path.join(MON, f"jobs-{PHASE}.tsv"), "w").write("\n".join(rows) + "\n")
