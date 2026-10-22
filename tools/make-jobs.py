#!/usr/bin/env python3
"""Writes Codex image-generation jobs for the battle stage art.

usage: make-jobs.py <raw_dir> <phase>
  phase "base": monster pose sheets + one background per location (normal tier)
  phase "tier": elite / nightmare variants of every finished base background
  phase "vfx":  skill effect animations (4x2 frames on black, drawn additively in the stage)

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


# effect name -> what the 8 frames show
VFX = {
    "fire_orb": "a blazing fireball projectile flying to the RIGHT, with a flickering flame tail (a seamless loop)",
    "ice_orb": "a sharp glowing ice spear / ice shard projectile flying to the RIGHT, with frost mist trailing (a seamless loop)",
    "nature_orb": "a glowing green thorny seed / spore projectile flying to the RIGHT, with leaves and green sparks trailing (a seamless loop)",
    "fire_burst": "a fiery explosion impact: a bright flash, expanding fireball, flying embers, fading smoke",
    "water_burst": "a water and ice impact: a splash of water, ice crystals bursting outward, fading mist",
    "nature_burst": "a nature magic impact: a burst of green energy, thorny vines and leaves bursting outward, fading spores",
    "phys_hit": "a physical hit spark: a sharp white-yellow star flash, small sparks flying outward, fading",
    "slash": "a sword slash: a bright white-blue crescent arc swept from top-left to bottom-right, then fading with sparkles",
    "stab": "a piercing thrust: a narrow bright streak shooting to the RIGHT with a sharp spark burst at its tip, fading",
    "smash": "a heavy ground smash seen from the side: an impact flash on the ground, a shockwave ring, cracks and dust and rocks flying up, fading",
    "fire_pillar": "a column of fire erupting from the ground (seen from the side, bottom-anchored), rising tall, then dying down into embers",
    "ice_spikes": "a cluster of jagged ice spikes erupting from the ground (seen from the side, bottom-anchored), then shattering into shards",
    "poison_cloud": "a toxic green-purple poison cloud billowing outward from the ground, bubbling, then dissipating",
    "heal": "a healing effect: a soft green light column rising from the ground with glowing plus-shaped sparkles floating up, fading",
    "buff": "a power-up aura: golden rings rising from the ground around an empty center, golden sparkles floating up, fading",
    "revive": "a resurrection: a holy white-gold light pillar descending from above onto the ground with feathers of light, fading",
    "death": "a defeat effect: a puff of grey smoke with a small ghostly soul wisp rising up and fading away",
    # per-skill effects, played where the skill lands (no projectile)
    "entangle": "Entangle: thick thorny green vines bursting up out of the ground (seen from the side, bottom-anchored), coiling upward around an empty center as if wrapping a creature, glowing green, then withering away",
    "water_strike": "Water Strike: a powerful geyser of water blasting up out of the ground (seen from the side, bottom-anchored), splashing and spraying, then collapsing into droplets",
    "life_drain": "Life Drain: dark green and crimson ghostly tendrils swirling around an empty center, pulling small glowing red life orbs out and upward, fading",
    "smoke_burst": "Smoke Burst: a sudden explosive burst of dark purple-grey smoke with ember sparks, puffing outward and slowly dissipating",
    "firestorm": "Firestorm: a swirling tornado of fire rising from the ground (seen from the side, bottom-anchored), spinning flames and embers, then dying out",
    "flame_blast": "Flame Blast: the ground cracks open and molten lava erupts upward (seen from the side, bottom-anchored) with flying magma rocks and fire, then cools into smoke",
    "natures_veil": "Nature's Veil: glowing mushrooms sprouting from the ground (seen from the side, bottom-anchored) releasing a shimmering green-gold veil of spores that drifts up and fades",
    "toxic_pollen": "Toxic Pollen: a cluster of sickly purple poison flowers sprouting from the ground (seen from the side, bottom-anchored) and puffing out thick swirling clouds of bright yellow pollen dust with drifting petals, then settling",
    # ranged skills: arrows flying to the right (seamless loops) and the arrow rain
    "quick_shot": "Quick Shot: two slim arrows in quick succession flying to the RIGHT with short white speed streaks (a seamless loop)",
    "steady_shot": "Steady Shot: one heavy, perfectly straight arrow flying to the RIGHT with a steady golden glow trail (a seamless loop)",
    "penetrating_shot": "Penetrating Shot: an arrow wrapped in a drilling white-blue energy spiral flying to the RIGHT, piercing the air (a seamless loop)",
    "silencing_shot": "Silencing Shot: a dark arrow trailing a purple seal rune and a muted shushing glyph, flying to the RIGHT (a seamless loop)",
    "pestilent_shot": "Pestilent Shot: a sickly green poison-dripping arrow flying to the RIGHT, trailing toxic green fumes and droplets (a seamless loop)",
    "aqua_arrow": "Aqua Arrow: an arrow made of swirling blue water flying to the RIGHT with a splashing water trail (a seamless loop)",
    "flame_arrow": "Flame Arrow: a blazing arrow wreathed in fire flying to the RIGHT with a flaming tail (a seamless loop)",
    "rain_of_arrows": "Rain of Arrows: dozens of arrows raining down steeply from above onto the ground (seen from the side, bottom-anchored), sticking into the ground with dust puffs, then fading",
    # melee skills: the strike drawn over the target
    "scratch": "Scratch: three parallel glowing claw marks raking diagonally across the center, with small sparks, fading",
    "maim": "Maim: a vicious blood-red crescent slash across the center with crimson droplets flying, fading",
    "cleave": "Cleave: one huge wide horizontal sword arc sweeping across the whole frame, bright white with a blue edge, fading",
    "crippling_slash": "Crippling Slash: a low sweeping slash near the bottom with dark purple chains briefly snapping shut, fading",
    "poke": "Poke: a quick jab spark pointing to the RIGHT with a small exclamation burst of fear lines, fading",
    "impale": "Impale: a long glowing spear-like streak piercing straight through the center to the RIGHT, with an exit burst on the far side, fading",
    "puncture": "Puncture: a sharp thrust spark to the RIGHT that cracks a translucent armor plate into flying shards, fading",
    "penetrating_strike": "Penetrating Strike: a thin piercing beam of red-white light driving straight through the center to the RIGHT with a ring shockwave, fading",
    "smack": "Smack: a heavy crushing downward impact with a big comic-style impact star and dust, fading",
    "sweep": "Sweep: a wide low horizontal sweeping arc along the ground kicking up dust (bottom-anchored), fading",
    "stunning_blow": "Stunning Blow: a heavy hammer impact flash with dizzy yellow stars circling above, fading",
    "fracturing_impact": "Fracturing Impact: the ground shatters from a heavy blow (seen from the side, bottom-anchored), cracks spreading and rock chunks flying up, fading",
    "shield_bash": "Shield Bash: a round translucent shield-shaped shockwave slamming to the RIGHT with an impact flash, fading",
    # heals
    "minor_heal": "Minor Heal: a small soft green glow with a few plus-shaped sparkles rising, gentle and modest, fading",
    "quick_aid": "Quick Aid: a fast bright green cross symbol flashing over the center with a quick swirl of green light, fading",
    "rejuvenate": "Rejuvenate: a ring of blooming green-white flowers and leaves rising from the ground (bottom-anchored) with healing light, fading",
    # self buffs
    "berserk": "Berserk: a raging red-orange aura flaring up from the ground (bottom-anchored) around an empty center, with angry red energy spikes, fading",
    "elemental_affinity": "Elemental Affinity: three orbiting orbs of fire, water and nature circling an empty center, glowing, fading",
    "elusiveness": "Elusiveness: swirling pale wind streaks and translucent afterimage silhouettes around an empty center, fading",
    "frenzy": "Frenzy: crackling yellow speed lines and lightning sparks shooting upward around an empty center (bottom-anchored), fading",
    "precision": "Precision: a glowing golden crosshair target reticle locking in over the center, fading",
    "provoke": "Provoke: a red anger vein symbol and red shockwave rings pulsing outward from the center, fading",
    "retribution": "Retribution: a golden aura of radiant spikes and a scale-of-justice glyph glowing around an empty center, fading",
    "spike_shell": "Spike Shell: a translucent spiky shell of brown-orange thorns forming around an empty center, fading",
    "taunt": "Taunt: loud orange shout shockwaves bursting outward from the center with comic shout lines, fading",
    "toughness": "Toughness: grey stone plates and a sturdy rocky aura forming around an empty center (bottom-anchored), fading",
    "vampirism": "Vampirism: a dark crimson blood mist rising around an empty center with small bat silhouettes fluttering up, fading",
    "invincible": "Invincible: a shining golden protective dome shield forming around an empty center, glowing, fading",
    "insanity": "Insanity: a chaotic swirling purple and magenta madness vortex with crazed eye symbols around an empty center, fading",
    "promote": "Promote: a golden crown appearing above with rising golden arrows and sparkles (bottom-anchored), fading",
    # auras (on every ally)
    "critical_aura": "Critical Aura: a red-orange glowing ring on the ground (bottom-anchored) with sharp crit star symbols rising, fading",
    "fierce_aura": "Fierce Aura: a crimson glowing ring on the ground (bottom-anchored) with crossed-sword glyphs rising, fading",
    "mystic_aura": "Mystic Aura: a violet-blue glowing ring on the ground (bottom-anchored) with arcane rune glyphs rising, fading",
    "guardian_aura": "Guardian Aura: a steel-blue glowing ring on the ground (bottom-anchored) with shield glyphs rising, fading",
    "speed_aura": "Speed Aura: a bright yellow-green glowing ring on the ground (bottom-anchored) with wing and speed-line glyphs rising, fading",
    "mana_spring": "Mana Spring: a glowing blue magical fountain of water spouting up from the ground (seen from the side, bottom-anchored) with sparkling mana droplets, then subsiding",
}


def vfx_prompt(desc):
    return f"""Image: a game VFX ANIMATION SPRITE SHEET for a Slay-the-Spire-style 2D battle game, in a bright, clean, stylized hand-painted effect style (soft glows, bold shapes, no realism).
Effect: {desc}.
Layout: landscape 1536x1024, a 4-column x 2-row grid of 8 equal cells (each 384x512), the 8 frames of ONE animation in reading order (left to right, then the second row), each frame centered in its cell and fully inside it, consistent size and position across frames so they play back smoothly.
Background: pure solid BLACK #000000 everywhere (the effect will be drawn with additive blending, so black means transparent). No characters, no creatures, no weapons held by anyone, no text, no labels, no grid lines, no borders.
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
    elif PHASE == "vfx":
        for name, desc in VFX.items():
            job(out, "fx_" + name, vfx_prompt(desc), "", "none")
        circles = """Image: four MAGIC CIRCLE glyphs for a 2D battle game, in a bright, clean, stylized hand-painted effect style with soft glow.
Layout: landscape 1536x1024 split into a 2-column x 2-row grid of 4 equal cells (each 768x512); in each cell one flat circular magic circle seen straight from above (a perfect circle with runes, rings and geometric patterns), centered and filling about 90% of the cell height:
1. fire: orange-red flames motif
2. water: icy blue snowflake motif
3. nature: green leaves and vines motif
4. holy: warm white-gold star motif
Background: pure solid BLACK #000000 everywhere. No text, no labels, no grid lines, no borders.
"""
        job(out, "fx_circles", circles, "", "none")
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
