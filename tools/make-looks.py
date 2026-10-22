#!/usr/bin/env python3
"""Writes Codex jobs for player looks exported from the userscript (menu: 导出待生成形象).

usage: make-looks.py <raw_dir> <looks.json>
looks.json: [{"id", "mode": "outfit"|"equip", "avatar", "outfit", "style", "weapon", "items": {slot: item}}]
  hrids are short ids (no "/items/" prefix). Reference PNGs come from <raw_dir>/ref/lib
  (a_<avatar>.png, o_<outfit>.png, i_<item>.png — rasterized game sprites).
Appends to <raw_dir>/jobs-looks.tsv; run gen.sh on it, then build-assets.py.
"""
import json
import os
import subprocess
import sys

RAW, LOOKS = sys.argv[1], sys.argv[2]
LIB = os.path.join(RAW, "ref", "lib")
PROMPTS = os.path.join(RAW, "prompts")
COMPO = os.path.join(RAW, "ref", "looks")
os.makedirs(PROMPTS, exist_ok=True)
os.makedirs(COMPO, exist_ok=True)

HEAD = "Use your image generation tool to create ONE image, then reply with the absolute path of the saved PNG and nothing else.\n\n"
WEAPON_BY_STYLE = {
    "stab": "a spear",
    "slash": "a sword",
    "smash": "a heavy mace",
    "ranged": "a bow",
    "magic": "a magic staff",
}
SLOT_NAMES = {
    "head": "head gear",
    "body": "body armor / top",
    "legs": "leg armor / bottoms",
    "feet": "boots",
    "hands": "gloves",
    "main_hand": "main-hand weapon",
    "two_hand": "two-handed weapon",
    "off_hand": "off-hand item",
    "back": "cape / back item",
}


def lib(prefix, hrid):
    p = os.path.join(LIB, f"{prefix}_{hrid}.png")
    return p if os.path.exists(p) else None


def pretty(hrid):
    return hrid.replace("_", " ")


done = set()
jobs_path = os.path.join(RAW, "jobs-looks.tsv")
if os.path.exists(jobs_path):
    done = {l.split("\t")[0] for l in open(jobs_path)}

n = 0
with open(jobs_path, "a") as out:
    for look in json.load(open(LOOKS)):
        name = "p_" + look["id"]
        if name in done:
            continue
        avatar = lib("a", look.get("avatar") or "") or lib("a", "blue_person_1")
        style = look.get("style") or "slash"
        weapon = look.get("weapon")
        weapon_txt = f"a {pretty(weapon)}" if weapon else WEAPON_BY_STYLE.get(style, "a sword")
        refs = []
        if look["mode"] == "outfit" and lib("o", look.get("outfit") or ""):
            # avatar + outfit share the same 100x100 frame, so overlaying them reproduces the in-game look
            comp = os.path.join(COMPO, look["id"] + ".png")
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", avatar, "-i", lib("o", look["outfit"]), "-filter_complex", "overlay", comp], check=True)
            refs.append(comp)
            wear = "Keep the character's face, hair, skin and the exact outfit from reference image 1."
            if weapon and lib("i", weapon):
                refs.append(lib("i", weapon))
                wear += f" The weapon is {weapon_txt}, drawn like reference image 2."
            else:
                wear += f" The weapon is {weapon_txt}."
        else:
            refs.append(avatar)
            wear = ["Keep the character's face, hair and skin from reference image 1, and dress them in exactly these equipment pieces (each shown as an item icon):"]
            for slot, item in (look.get("items") or {}).items():
                p = lib("i", item)
                if p:
                    refs.append(p)
                    wear.append(f"- {SLOT_NAMES.get(slot, slot)}: {pretty(item)} (reference image {len(refs)})")
            if not any(s in (look.get("items") or {}) for s in ("main_hand", "two_hand")):
                wear.append(f"- weapon: {weapon_txt}")
            wear = "\n".join(wear)
        prompt = f"""Image: a character POSE SHEET for a Slay-the-Spire-style 2D side-view battle game, in the same flat vector art style as the references (clean shapes, soft cel shading, chibi proportions).
{wear}
Layout: landscape 1536x1024, a 3-column x 2-row grid of 6 equal cells, the SAME character in every cell, in 3/4 side view FACING RIGHT, full body, feet on the same baseline near the bottom of each cell, same scale in every cell, each pose fully inside its own cell:
1. idle: combat-ready stance holding the weapon
2. attack wind-up: drawing back to attack
3. attack strike: lunging to the RIGHT and attacking with the weapon (a {style} attack), with a motion trail
4. hurt: recoiling backwards to the left, wincing, eyes shut
5. cast: chanting with one hand raised forward and a small glowing light
6. defeated: collapsed, kneeling on one knee with head down, weapon on the ground
Background: perfectly flat solid pure green #00FF00 everywhere, no grid lines, no floor, no shadows, no text, no labels, no borders. Leave clear background space between the poses. Do not use that green anywhere on the character.
"""
        pf = os.path.join(PROMPTS, name + ".txt")
        open(pf, "w").write(HEAD + prompt)
        out.write(f"{name}\t{pf}\t{','.join(refs)}\tgreen\n")
        n += 1
print(n, "new look jobs")
