#!/usr/bin/env python3
"""Writes Codex image-generation jobs for the battle stage art.

usage: make-jobs.py <raw_dir> <phase>
  phase "base": monster pose sheets + one background per location (normal tier)
  phase "tier": elite / nightmare variants of every finished base background

Each job is a line in <raw_dir>/jobs-<phase>.tsv: name \t prompt file \t reference png \t key color
References come from <raw_dir>/ref (rasterized game sprites); finished sheets land in <raw_dir>/sheets.
"""
import os
import struct
import sys
import zlib

RAW, PHASE = sys.argv[1], sys.argv[2]
REF = os.path.join(RAW, "ref")
SHEETS = os.path.join(RAW, "sheets")
PROMPTS = os.path.join(RAW, "prompts")
os.makedirs(PROMPTS, exist_ok=True)

HEAD = "Use your image generation tool to create ONE image, then reply with the absolute path of the saved PNG and nothing else.\n\n"
KEYS = {"green": ("pure green #00FF00", "0x00ff00"), "magenta": ("pure magenta #FF00FF", "0xff00ff")}

LOCATIONS = {
    "smelly_planet": "a filthy garbage planet: heaps of trash and rusty junk, bubbling green toxic puddles, broken sewer pipes, buzzing flies, hazy yellow-green sky",
    "swamp_planet": "a murky swamp: twisted mangrove trees, hanging moss, lily pads, still dark water, low fog",
    "aqua_planet": "the bottom of an alien ocean: coral reefs, swaying kelp, rocks with anemones, light rays from the surface, bubbles",
    "jungle_planet": "a dense alien jungle: giant trees, hanging vines, glowing mushrooms, overgrown ancient stone ruins",
    "gobo_planet": "a goblin war camp on a rocky red planet: crude wooden palisades, patched tents, scrap-metal contraptions, campfire smoke",
    "planet_of_the_eyes": "a surreal alien planet: fleshy purple ground, giant eyeballs embedded in rocks and stalks, swirling strange sky",
    "sorcerers_tower": "the grand hall inside a wizard tower: tall arched windows, bookshelves, floating glowing runes, a magic circle on the stone floor",
    "bear_with_it": "a wild mountain forest: pine trees, bamboo groves, berry bushes, snowy peaks in the distance",
    "golem_cave": "a deep crystal cave: hanging stalactites, glowing blue and purple crystals, veins of magnetic metal ore, rocky ground",
    "twilight_zone": "a haunted gothic graveyard at twilight: dead trees, crooked tombstones, iron fences, a dark castle silhouette under a big moon",
    "infernal_abyss": "a hellish abyss: rivers of lava, jagged obsidian spikes, flames, falling ash, red-black sky",
    "chimerical_den": "a whimsical chaotic den where biomes blend together: swamp water, jungle vines, staring eyes, goblin trinkets, mystical fog",
    "sinister_circus": "a creepy abandoned circus at night: striped big-top tents, a broken carousel, dim string lights, scattered balloons",
    "enchanted_fortress": "the courtyard of an enchanted fortress: chessboard floor tiles, magical shield barriers, banners, towering castle walls",
    "pirate_cove": "a pirate cove: wooden docks, a shipwreck, treasure chests and barrels, a sea cave opening to the ocean",
}
TIERS = {
    "elite": "a HIGHER DIFFICULTY version: dusk lighting with deeper, more saturated colors, a faint red-orange glow on the horizon, a few more cracks, thorns and signs of danger",
    "nightmare": "the HARDEST DIFFICULTY version: night with an ominous crimson and purple sky, eerie glowing embers and lights, scorched and cracked ground, a much more menacing atmosphere",
}


def read_png(path):
    """Minimal 8-bit RGB/RGBA PNG decoder (enough for Chrome screenshots)."""
    data = open(path, "rb").read()
    pos, idat = 8, b""
    while pos < len(data):
        n, typ = struct.unpack(">I4s", data[pos : pos + 8])
        body = data[pos + 8 : pos + 8 + n]
        if typ == b"IHDR":
            w, h, depth, ctype = struct.unpack(">IIBB", body[:10])
        elif typ == b"IDAT":
            idat += body
        pos += 12 + n
    bpp = {2: 3, 6: 4}[ctype]
    raw = zlib.decompress(idat)
    stride = w * bpp
    rows, prev, i = [], bytearray(stride), 0
    for _ in range(h):
        f = raw[i]
        line = bytearray(raw[i + 1 : i + 1 + stride])
        i += 1 + stride
        for x in range(stride):
            a = line[x - bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x - bpp] if x >= bpp else 0
            if f == 1:
                line[x] = (line[x] + a) & 255
            elif f == 2:
                line[x] = (line[x] + b) & 255
            elif f == 3:
                line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(line)
        prev = line
    return w, h, bpp, rows


def key_for(path):
    """Green screen unless the subject itself is greenish."""
    w, h, bpp, rows = read_png(path)
    green = total = 0
    for line in rows[::4]:
        for x in range(0, w * bpp, bpp * 4):
            r, g, b = line[x], line[x + 1], line[x + 2]
            if bpp == 4 and line[x + 3] < 128:
                continue
            total += 1
            if g > r + 30 and g >= b:
                green += 1
    return "magenta" if total and green / total > 0.04 else "green"


def job(out, name, prompt, ref, key):
    pf = os.path.join(PROMPTS, name + ".txt")
    open(pf, "w").write(HEAD + prompt)
    out.write(f"{name}\t{pf}\t{ref}\t{key}\n")


def sheet_prompt(subject, facing, poses, keyname):
    bg = KEYS[keyname][0]
    lines = "\n".join(f"{i + 1}. {p}" for i, p in enumerate(poses))
    return f"""Image: a POSE SHEET for a Slay-the-Spire-style 2D side-view battle game, based on the attached reference {subject} (keep its exact design, colors, markings and proportions, and the same flat vector art style with clean shapes and soft cel shading).
Layout: landscape 1536x1024, a 3-column x 2-row grid of 6 equal cells, the SAME subject in every cell, in side view FACING {facing}, full body, standing on the same baseline near the bottom of each cell, same scale in every cell, each pose fully inside its own cell:
{lines}
Background: perfectly flat solid {bg} everywhere, no grid lines, no floor, no shadows, no text, no labels, no borders. Leave clear background space between the poses so each cell can be cut out. Do not use the background color anywhere on the subject.
"""


MONSTER_POSES = [
    "idle: neutral menacing stance",
    "attack wind-up: rearing back, gathering power",
    "attack strike: lunging toward the LEFT, attacking with its natural weapon or body",
    "hurt: recoiling toward the right, flinching, eyes squeezed shut, small impact marks",
    "cast: channeling energy with a glowing aura",
    "defeated: collapsed / knocked out on the ground",
]

with open(os.path.join(RAW, f"jobs-{PHASE}.tsv"), "w") as out:
    if PHASE == "base":
        for line in open(os.path.join(RAW, "monsters.tsv")):
            mid, name = line.rstrip("\n").split("\t")
            ref = os.path.join(REF, mid + ".png")
            k = key_for(ref)
            job(out, "m_" + mid, sheet_prompt(f'monster "{name}"', "LEFT (toward the heroes)", MONSTER_POSES, k), ref, k)
        for loc, desc in LOCATIONS.items():
            prompt = f"""Image: a wide BATTLE BACKGROUND for a Slay-the-Spire-style 2D side-view battle screen, in a flat vector game art style with clean shapes, soft cel shading and atmospheric depth (use the attached location icon only as a hint for mood and colors).
Location: {desc}.
Composition: landscape 1536x1024, camera at eye level looking from the side. A flat walkable ground strip runs across the bottom ~28% of the image where characters will stand (heroes on the left half, monsters on the right half). Keep the middle area uncluttered and a bit softer so characters stand out; put scenery and landmarks in the background and toward the left and right edges. No characters, no creatures, no text, no UI.
"""
            job(out, "bg_" + loc, prompt, os.path.join(REF, f"_zone_{loc}.png"), "none")
    elif PHASE == "tier":
        for loc in LOCATIONS:
            base = os.path.join(SHEETS, f"bg_{loc}.png")
            if not os.path.exists(base):
                continue
            for tier, desc in TIERS.items():
                prompt = f"""Image: {desc} of the attached battle background. Keep EXACTLY the same composition, camera angle, ground line, landmarks and art style; only change lighting, colors, atmosphere and small details. Landscape 1536x1024. No characters, no creatures, no text, no UI.
"""
                job(out, f"bg_{loc}__{tier}", prompt, base, "none")
print(open(os.path.join(RAW, f"jobs-{PHASE}.tsv")).read().count("\n"), "jobs")
