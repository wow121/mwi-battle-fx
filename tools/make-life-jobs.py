#!/usr/bin/env python3
"""Writes Codex image-generation jobs for the skilling window (Life module) art.

usage: make-life-jobs.py <raw_dir>
  lb_<scene>   backgrounds: milking, woodcutting, the 7 foraging areas, the 7 production / enhancing / alchemy rooms
  lt_<id>      3x2 pose sheets of the 7 cows and the 7 trees (cut like monsters, see LIFE_POSES in build-assets.py)
  lg_<group>   packed sheets of different things, one per cell: foraging plants by area (3x2), the stations (4x2),
               the tools of one kind in their 8 tiers (4x2), the town's buildings (lg_town_a/b, 4x2); the cell -> id
               lists go to <raw_dir>/life-groups.json

Jobs go to <raw_dir>/jobs-life.tsv (name \t prompt file \t references \t key color), run with gen.sh.
References: the game's own sprites, rendered first with
  render-refs.sh <raw> $(make-life-jobs.py <raw> --refs)
"""
import json
import os
import sys

RAW = sys.argv[1]
REF = os.path.join(RAW, "ref", "lib")
SHEETS = os.path.join(RAW, "sheets")
PROMPTS = os.path.join(RAW, "prompts")
HEAD = "Use your image generation tool to create ONE image, then reply with the absolute path of the saved PNG and nothing else.\n\n"
KEYS = {"green": "pure green #00FF00", "magenta": "pure magenta #FF00FF"}
STYLE = "a flat vector game art style with clean shapes, soft cel shading and bright friendly colors (the same style as the game's icons)"

COWS = ["cow", "verdant_cow", "azure_cow", "burble_cow", "crimson_cow", "unicow", "holy_cow"]
TREES = ["tree", "birch_tree", "cedar_tree", "purpleheart_tree", "ginkgo_tree", "redwood_tree", "arcane_tree"]
# foraging area -> [(item, what grows it)]; the area's own action is the last cell
AREAS = {
    "farmland": [("cotton", "a cotton plant with fluffy white bolls"), ("egg", "a straw nest on the ground holding a few eggs"), ("sugar", "a clump of sugar cane stalks"), ("wheat", "a bunch of ripe golden wheat stalks")],
    "shimmering_lake": [("apple", "a small apple tree with red apples"), ("arabica_coffee_bean", "an arabica coffee shrub with red coffee cherries"), ("blueberry", "a blueberry bush"), ("flax", "flax plants with small blue flowers")],
    "misty_forest": [("blackberry", "a thorny blackberry bramble"), ("orange", "a small orange tree"), ("robusta_coffee_bean", "a robusta coffee shrub with dark red cherries")],
    "burble_beach": [("bamboo_branch", "a clump of green bamboo"), ("liberica_coffee_bean", "a tall liberica coffee shrub with large cherries"), ("plum", "a small plum tree with purple plums"), ("strawberry", "a strawberry plant with ripe strawberries")],
    "silly_cow_valley": [("cocoon", "a branch with silk cocoons hanging from it"), ("excelsa_coffee_bean", "an excelsa coffee shrub"), ("mooberry", "a whimsical mooberry bush (berries like the attached icon)"), ("peach", "a small peach tree")],
    "olympus_mons": [("dragon_fruit", "a dragon fruit cactus with pink fruits"), ("fieriosa_coffee_bean", "a fiery coffee shrub with flame-coloured cherries"), ("marsberry", "a red alien marsberry bush")],
    "asteroid_belt": [("radiant_fiber", "glowing radiant fibres growing out of a crystal rock"), ("spaceberry", "an alien spaceberry bush"), ("spacia_coffee_bean", "a cosmic coffee shrub with starry cherries"), ("star_fruit", "a plant bearing glowing star-shaped fruits")],
}
BG = {
    "milking": "a sunny cow pasture on a farm: a green meadow, a red wooden barn and white fence far back, milk cans and hay bales near the edges, blue sky with soft clouds",
    "woodcutting": "a peaceful forest clearing for lumberjacks: tall trees in the background, tree stumps and stacked logs near the edges, sun rays through the canopy",
    "farmland": "sunny farmland: plowed fields with crops in rows, a small chicken coop and a windmill in the distance, wooden fences",
    "shimmering_lake": "the shore of a sparkling crystal-clear lake: glittering water, reeds, fruit trees and berry bushes on gentle hills",
    "misty_forest": "a misty enchanted forest: tall dark trees fading into soft fog, ferns, mossy stones, wild brambles",
    "burble_beach": "a tropical beach where soap-like bubbles float in the air: warm sand, palm trees and bamboo, a turquoise sea",
    "silly_cow_valley": "a whimsical pastel valley with goofy cow-patterned hills, peach trees and berry bushes, silk cocoons hanging from branches",
    "olympus_mons": "the slopes of Olympus Mons on Mars: red rocky terrain, a giant volcano far away, hardy red alien plants, a dusty orange sky",
    "asteroid_belt": "a garden on a floating asteroid: rocky ground, a starry deep-space sky with planets and other asteroids, glowing alien plants",
    "cheesesmithing": "a cozy cheesesmith's smithy: stone walls, a glowing furnace on the far left, racks of cheese wheels and cheese-metal tools on the walls",
    "crafting": "a woodworker's workshop: wooden walls with hanging saws and tools, stacks of lumber near the edges, wood shavings on the floor, a sunny window",
    "tailoring": "a tailor's studio: shelves of fabric bolts and yarn, a dress mannequin near an edge, spools of thread, warm lamplight",
    "cooking": "a warm rustic kitchen: brick walls, hanging pots and pans, shelves of ingredients, a window with potted herbs",
    "brewing": "a cozy tea and coffee room: shelves of tea jars and coffee sacks, copper kettles, light steam, a warm wooden interior",
    "alchemy": "an alchemist's laboratory: shelves of glowing potions and bottles, bubbling flasks, old books, mystical purple light",
    "enhancing": "an enchanter's forge chamber: dark stone walls with glowing blue runes, floating magic sparks, a faint rune circle on the floor",
}
# backgrounds whose scene icon is a skill icon rather than an area icon
SKILL_SCENES = {"milking", "woodcutting", "cheesesmithing", "crafting", "tailoring", "cooking", "brewing", "alchemy", "enhancing"}
STATIONS = [
    ("cheesesmithing", "a sturdy anvil on a stump next to a small glowing furnace (cheese-yellow metal accents)"),
    ("crafting", "a carpenter's workbench with a vise and a few planks"),
    ("tailoring", "a sewing table with a spinning wheel and a spool rack"),
    ("cooking", "a small cooking stove with a pot over the fire"),
    ("brewing", "a brewing stand: a copper kettle on a burner beside a coffee grinder and teapot"),
    ("alchemy", "an alchemy table with a bubbling alembic and flasks"),
    ("enhancing", "an enhancing altar: a stone pedestal with glowing blue runes and small floating crystals"),
]
# storage (left of the window, the inventory's counts are drawn on it) and the small table that holds the materials
PROPS = [
    ("storage_wood", "an indoor storage shelf: a sturdy wooden shelving unit with three EMPTY open shelves (nothing on them), a crate and a sack on the floor beside it"),
    ("storage_crates", "an outdoor storage corner: a stack of open wooden crates and a woven basket with flat EMPTY tops, a small barrel"),
    ("storage_arcane", "a magical storage cabinet: a dark wooden and stone cabinet with three EMPTY open shelves edged with faintly glowing blue runes"),
    ("table_wood", "a small low wooden side table with a plain EMPTY flat top, about half a person's height"),
    ("table_stone", "a small low stone side table with a plain EMPTY flat top and faint glowing blue runes on its front, about half a person's height"),
]
TIERS = ["cheese", "verdant", "azure", "burble", "crimson", "rainbow", "holy", "celestial"]
TOOLS = {
    "brush": "a milking brush",
    "shears": "a pair of garden shears",
    "hatchet": "a hatchet",
    "hammer": "a smithing hammer",
    "chisel": "a woodworking chisel",
    "needle": "a big sewing needle",
    "spatula": "a cooking spatula",
    "pot": "a brewing teapot exactly like the attached icons (one side handle, a lid, a spout), with no other handle",
    "alembic": "a small handheld alchemy still (alembic) redrawn faithfully from the attached icons: the same round-bottomed flask with an onion-shaped dome on top and the same long curved tube coming off the dome, the same flat colours and simple shapes (no glass shine, no bubbles, no visible liquid; leave out the small receiving cup)",
    "enhancer": "an enhancing tool (as in the attached icons)",
}

if len(sys.argv) > 2 and sys.argv[2] == "--refs":
    refs = [f"actions/{i}" for i in COWS + TREES + list(AREAS)] + [f"skills/{s}" for s in SKILL_SCENES]
    refs += [f"items/{i}" for a in AREAS.values() for i, _ in a]
    refs += [f"items/{t}_{k}" for k in TOOLS for t in TIERS]
    print(" ".join(refs))
    sys.exit()

os.makedirs(PROMPTS, exist_ok=True)
groups = {}
out = open(os.path.join(RAW, "jobs-life.tsv"), "w")


def job(name, prompt, refs, key):
    pf = os.path.join(PROMPTS, name + ".txt")
    open(pf, "w").write(HEAD + prompt)
    out.write(f"{name}\t{pf}\t{','.join(refs)}\t{key}\n")


def grid(cols, rows, cells, key, what):
    lines = "\n".join(f"{i + 1}. {c}" for i, c in enumerate(cells))
    empty = cols * rows - len(cells)
    rest = f" The remaining {empty} cell{'s stay' if empty > 1 else ' stays'} completely empty." if empty else ""
    return f"""Layout: landscape 1536x1024, a {cols}-column x {rows}-row grid of {cols * rows} equal cells, in reading order (left to right, then the next row), one subject per cell, each centered in its cell, standing on the same baseline near the bottom of the cell, fully inside it, at a consistent scale:{rest}
{lines}
Background: perfectly flat solid {KEYS[key]} everywhere, no grid lines, no floor, no shadows, no text, no labels, no borders. Leave clear background space around each subject so the cells can be cut apart. Do not use the background color anywhere on the subjects. {what}
"""


style_bg = os.path.join(SHEETS, "bg_jungle_planet.png")
for scene, desc in BG.items():
    icon = os.path.join(REF, ("s_" if scene in SKILL_SCENES else "act_") + scene + ".png")
    prompt = f"""Image: a wide BACKGROUND for a small side-view idle-game window, in {STYLE}; match the first attached background's art style and level of detail exactly but not its content (the second attached icon only hints at the theme and colours).
Scene: {desc}.
Composition: landscape 1536x1024, camera at eye level from the side. The image will be shown cropped to a wide 2:1 strip around its lower middle, so keep everything important between 20% and 85% of the height. A flat ground / floor strip covers the bottom ~30%: a character will stand on it on the left third and the thing being worked on (an animal, a tree, a plant or a workbench) on the right third, so leave both spots and the middle open and a bit softer; put scenery toward the back and the left and right edges. No characters, no animals, no people, no text, no UI.
"""
    job("lb_" + scene, prompt, [style_bg, icon], "none")

COW_POSES = [
    "idle: standing calmly",
    "grazing: head lowered to the grass, chewing",
    "being milked: eyes closed contentedly, a small happy blush",
    "startled: a little hop, ears up, surprised",
    "mooing: head raised, mouth open, cheerful",
    "happy: eyes closed smiling, small hearts floating above",
]
for cow in COWS:
    key = "magenta" if cow in ("verdant_cow", "unicow") else "green"
    lines = "\n".join(f"{i + 1}. {p}" for i, p in enumerate(COW_POSES))
    prompt = f"""Image: a POSE SHEET for a cute 2D side-view idle game, based on the attached cow icon (keep its exact design, colours, markings and proportions, drawn as a whole cow with four legs), in {STYLE}.
Layout: landscape 1536x1024, a 3-column x 2-row grid of 6 equal cells, the SAME cow in every cell, in side view FACING LEFT (toward the farmer), full body, standing on the same baseline near the bottom of each cell, same scale in every cell, each pose fully inside its own cell:
{lines}
Background: perfectly flat solid {KEYS[key]} everywhere, no grid lines, no floor, no shadows, no text, no labels, no borders. Leave clear background space between the poses so each cell can be cut out. Do not use the background color anywhere on the cow.
"""
    job("lt_" + cow, prompt, [os.path.join(REF, f"act_{cow}.png")], key)

TREE_POSES = [
    "idle: standing still",
    "hit: the trunk shaking from an axe blow, a fresh notch in the trunk with wood chips and a few leaves flying",
    "swaying gently to the left in the wind",
    "swaying gently to the right in the wind",
    "rustling: leaves shimmering with a few sparkles",
    "idle with a few leaves drifting down",
]
for tree in TREES:
    lines = "\n".join(f"{i + 1}. {p}" for i, p in enumerate(TREE_POSES))
    prompt = f"""Image: a POSE SHEET for a cute 2D side-view idle game, based on the attached tree icon (keep its exact design, colours and shape, drawn as a whole tree with trunk and a bit of roots), in {STYLE}.
Layout: landscape 1536x1024, a 3-column x 2-row grid of 6 equal cells, the SAME tree in every cell, side view, its roots on the same baseline near the bottom of each cell, same scale in every cell, filling most of the cell height but fully inside its own cell:
{lines}
Background: perfectly flat solid {KEYS['magenta']} everywhere, no grid lines, no ground, no shadows, no text, no labels, no borders. Leave clear background space between the trees so each cell can be cut out. Do not use the background color anywhere on the tree.
"""
    job("lt_" + tree, prompt, [os.path.join(REF, f"act_{tree}.png")], "magenta")

for area, plants in AREAS.items():
    names = [i for i, _ in plants]
    cells = [f"{d} (its fruit / crop looks like attached icon {k + 1})" for k, (_, d) in enumerate(plants)]
    cells.append(f"a lush little patch where all of these grow together: {', '.join(d for _, d in plants)}")
    prompt = f"Image: harvestable PLANTS for a cute 2D side-view idle game (a forager picks from them), in {STYLE}, matching the attached item icons.\n" + grid(
        3, 2, cells, "magenta", "Plants are drawn in side view with a little soil at their base."
    )
    job("lg_plants_" + area, prompt, [os.path.join(REF, f"i_{i}.png") for i in names], "magenta")
    groups["lg_plants_" + area] = {"grid": [3, 2], "dir": "plant", "ids": names + [area]}

prompt = f"Image: STORAGE and SIDE TABLES for a cute 2D side-view idle game, in {STYLE}. Everything is EMPTY: no items on any shelf or table top, they will be added later.\n" + grid(
    3, 2, [d for _, d in PROPS], "magenta", "Each is drawn in side view, standing on the ground, seen straight from the front."
)
job("lg_props", prompt, [os.path.join(REF, "s_crafting.png")], "magenta")
groups["lg_props"] = {"grid": [3, 2], "dir": "prop", "ids": [i for i, _ in PROPS]}

prompt = f"Image: WORK STATIONS for a cute 2D side-view idle game, in {STYLE}; the attached skill icons (in this order) give each station's theme and colours.\n" + grid(
    4, 2, [d for _, d in STATIONS], "magenta", "Each station is drawn in side view at about the height of a person, with a flat top where an item can rest."
)
job("lg_stations", prompt, [os.path.join(REF, f"s_{s}.png") for s, _ in STATIONS], "magenta")
groups["lg_stations"] = {"grid": [4, 2], "dir": "station", "ids": [s for s, _ in STATIONS]}

# ---- trials: a guild skilling trial is one big shared project, a labyrinth skilling room an obstacle before a gate
PROJECTS = {
    "woodcutting": ("a gigantic ancient guild tree, as tall as the cell", ["untouched", "a deep axe notch cut into the left of its trunk, wood chips around", "cut nearly through, leaning slightly to the right", "felled: lying on its side, with the fresh stump left standing"]),
    "milking": ("a big wooden guild milk vat (a barrel tub with a little ladder and the guild's banner)", ["empty", "a third full of milk", "two thirds full of creamy milk", "overflowing with milk and foam"]),
    "foraging": ("a big wooden harvest wagon", ["empty", "a third full of mixed fruits, grain and berries", "heaped high with produce", "overflowing with produce, a guild flag on top"]),
    "cheesesmithing": ("a giant cheese-metal guild statue of a cow knight being forged inside wooden scaffolding", ["only the base block inside bare scaffolding", "the lower half built up", "almost complete, scaffolding still around", "finished and gleaming, the scaffolding gone"]),
    "crafting": ("a wooden ship being built on a slipway", ["only the keel and the ribs", "the hull half planked", "fully planked with its mast up", "finished with sails and flags"]),
    "tailoring": ("a giant guild tapestry on a tall wooden loom frame", ["only the bare warp threads", "a third woven from the bottom", "two thirds woven", "finished, a vivid tapestry of a cow and a star"]),
    "cooking": ("a giant celebration cake on a sturdy table", ["one base layer", "two layers", "three layers with frosting", "a finished tower cake with fruit, cream and candles"]),
    "brewing": ("a huge copper tea urn on a stove", ["cold, dull and empty", "warming up with a little steam", "bubbling with steam", "glowing, with swirls of fragrant aroma"]),
    "alchemy": ("a giant alchemy circle on the ground (seen from the side, flat on the floor) around a crystal pedestal", ["faint dark lines", "the outer ring glowing", "two rings glowing", "fully blazing, a big crystal floating over the pedestal"]),
    "enhancing": ("a guild relic: a giant sword set in a stone on a grand altar", ["dull and dusty", "a faint blue glow", "a bright purple glow", "awakened, blazing with golden and rainbow light"]),
}
OBSTACLES = {
    "milking": ("a huge stone-horned labyrinth guardian cow blocking the way", ["standing angry, horns down", "calmer, eyes half closed", "content, being milked happily", "lying asleep to the side, the way free"]),
    "woodcutting": ("thick thorny vines and roots grown over a doorway", ["covering it completely", "a third cut away", "mostly cut away", "only cut stumps left"]),
    "foraging": ("a dense thicket of glowing labyrinth mushrooms and brambles", ["dense and blocking", "a third picked", "mostly picked", "only a few stems left"]),
    "cheesesmithing": ("the gear mechanism of a door made of cheese-metal", ["broken, gears scattered on the floor", "a third of the gears back in place", "mostly assembled", "complete and turning, glowing"]),
    "crafting": ("a wooden bridge over a dark pit", ["collapsed, broken planks", "the frame rebuilt", "half planked", "complete and sturdy"]),
    "tailoring": ("a big rope net blocking a doorway that must be rewoven into a rope ladder", ["torn and tangled", "a third rewoven", "mostly rewoven", "a finished rope ladder"]),
    "cooking": ("a hungry stone guardian face carved in the wall, its mouth open, a big empty bowl before it", ["the bowl empty, the face frowning", "the bowl a third full of food", "the bowl nearly full, the face smiling", "the bowl overflowing, the face beaming"]),
    "brewing": ("a dried-up magical fountain", ["dry and cracked", "a trickle of glowing tea", "half full", "full and sparkling"]),
    "alchemy": ("a dark sigil lock carved on a stone slab", ["dark", "a third of its runes lit", "mostly lit", "fully lit and dissolving into light"]),
    "enhancing": ("a seal stone with runes on a pedestal", ["dull grey", "faint blue runes", "bright purple runes", "blazing golden, cracking open"]),
}
# drawn in the guild trial backdrop's painted style (the first, icon-styled set looked plain)
GUILD_STYLE = "the richly detailed painted style of the attached guild trial backdrop (soft painterly shading, warm light, many small crafted details), not a flat icon"
for skill, (what, stages) in PROJECTS.items():
    cells = [f"stage {k + 1}: {st}" for k, st in enumerate(stages)]
    prompt = f"Image: a GRAND COOPERATIVE GUILD PROJECT for a 2D side-view idle game, in {GUILD_STYLE}: {what}, shown in four stages of completion. Make it monumental and intricate: ornate carving and metalwork, ropes, pulleys, banners with the guild's cow emblem, tool racks, crates and barrels of supplies around its base, little lanterns, so it looks like the work of a whole guild. No people. The SAME object, same size and same position in every cell, drawn big (filling most of its cell), seen from the side, standing on the ground line.\n" + grid(2, 2, cells, "magenta", "")
    job("lg_proj_" + skill, prompt, [os.path.join(SHEETS, "bg_guild_trial.png"), os.path.join(REF, f"s_{skill}.png")], "magenta")
    groups["lg_proj_" + skill] = {"grid": [2, 2], "dir": "project", "ids": [f"{skill}_{k + 1}" for k in range(4)], "out": 512}
for skill, (what, stages) in OBSTACLES.items():
    cells = [f"stage {k + 1}: {st}" for k, st in enumerate(stages)]
    prompt = f"Image: an OBSTACLE in a labyrinth room for a cute 2D side-view idle game, in {STYLE}, cleared with the {skill} skill: {what}, shown in four stages. The SAME thing, same size and same position in every cell, drawn big, seen from the side, on the ground line.\n" + grid(2, 2, cells, "magenta", "")
    job("lg_obst_" + skill, prompt, [os.path.join(REF, f"s_{skill}.png")], "magenta")
    groups["lg_obst_" + skill] = {"grid": [2, 2], "dir": "obstacle", "ids": [f"{skill}_{k + 1}" for k in range(4)], "out": 512}
prompt = f"Image: the EXIT GATE of a labyrinth room for a cute 2D side-view idle game, in {STYLE}: a heavy carved stone double door in an arch, shown in four stages. The SAME gate, same size and same position in every cell, seen from the front.\n" + grid(2, 2, ["shut, its runes dark", "slightly open, a crack of light", "half open, light pouring out", "wide open, bright light beyond"], "magenta", "")
job("lg_gate", prompt, [os.path.join(SHEETS, "bg_labyrinth.png")], "magenta")
groups["lg_gate"] = {"grid": [2, 2], "dir": "gate", "ids": [f"gate_{k + 1}" for k in range(4)], "out": 512}

# a backdrop for each guild project: the site where the whole guild works on it
GUILD_SITES = {
    "woodcutting": "a guild lumber camp in an old forest: a wide clearing, log piles, a sawhorse and a lumber cart at the edges, guild tents and banners among the trees",
    "milking": "a guild dairy yard in green pastures: wooden fences, a big barn and milk sheds at the back, churns and hay at the edges, guild banners",
    "foraging": "a guild harvest field: rows of crops and orchards fading into the distance, baskets and sacks at the edges, a windmill and guild banners",
    "cheesesmithing": "a guild cheese foundry yard: stone forges and chimneys at the back, racks of cheese-metal ingots, anvils at the edges, guild banners",
    "crafting": "a guild shipyard on a riverbank: workshops and timber stacks at the back, the river in the distance, saws and crates at the edges, guild banners",
    "tailoring": "a guild weaving hall: high timber roof, shelves of dyed yarn and fabric bolts at the back, spinning wheels at the edges, guild banners",
    "cooking": "a guild feast hall kitchen: big hearths and ovens at the back, hanging pots, long tables with ingredients at the edges, guild banners",
    "brewing": "a guild tea house courtyard: tea shelves and herb racks at the back, steaming kettles at the edges, lanterns and guild banners",
    "alchemy": "a guild alchemy sanctum: tall arched windows, shelves of glowing flasks at the back, arcane instruments at the edges, guild banners",
    "enhancing": "a guild relic hall: grand stone pillars and stained glass at the back, rune-carved pedestals at the edges, guild banners",
}
for skill, desc in GUILD_SITES.items():
    prompt = f"""Image: a wide BACKGROUND for a 2D side-view idle game, in the richly detailed painted style of the first attached image (match its art style and level of detail; not its content); the second attached image shows the guild project that will stand in the middle of this scene, for its theme and colours.
Scene: {desc}.
Composition: landscape 1536x1024, camera at eye level from the side. The image will be shown cropped to a wide 2:1 strip around its lower middle. A flat ground strip covers the bottom ~30% where a crowd of guild members and the big project will stand: keep the middle of the ground and the space above it open and a bit softer; put the scenery toward the back and the left and right edges. Do not draw the project itself. No characters, no animals, no people, no text, no UI.
"""
    job("lb_guild_" + skill, prompt, [os.path.join(SHEETS, "bg_guild_trial.png"), os.path.join(SHEETS, f"lg_proj_{skill}.png")], "none")

# labyrinth backdrops by depth (the battle stage's too): floors 1-4, 5-8, 9-12, 13-16, 17-20
DEPTHS = [
    "the upper halls: worn mossy stone walls, torches, roots breaking through the ceiling, a calm green-gold light",
    "a flooded crypt: knee-deep dark water on the edges, glowing blue fungi on the walls, dripping arches",
    "a crystal cavern: towering amethyst and sapphire crystals growing out of the stone, cold purple light",
    "the molten depths: lava channels along the walls, blackened forge-like stonework, orange embers in the air",
    "the abyssal bottom: crumbling ruins floating over a starry void, cracks of violet light, an eerie silence",
]
for k, desc in enumerate(DEPTHS):
    prompt = f"""Image: a wide BATTLE BACKGROUND for a Slay-the-Spire-style 2D side-view battle screen, in a flat vector game art style with clean shapes, soft cel shading and atmospheric depth (match the attached background's art style exactly; it is the labyrinth's first level, this one is deeper).
Location: inside an ancient magical labyrinth, {desc}.
Composition: landscape 1536x1024, camera at eye level looking from the side. A flat walkable floor runs across the bottom ~28% of the image where characters will stand. Keep the middle area uncluttered and a bit softer; put landmarks toward the back and the left and right edges. No characters, no creatures, no text, no UI.
"""
    job(f"bg_labyrinth_d{k + 1}", prompt, [os.path.join(SHEETS, "bg_labyrinth.png")], "none")

# ---- the town: where the hero lives and walks between jobs (the window's idle view and its transitions). The
# skilling buildings are the game's house rooms; a room not built yet is shown as an empty lot with its sign
TOWN = [
    ("home", None, "the hero's own small cozy cottage with a round wooden door, a little chimney with a curl of smoke, flower boxes under the windows"),
    ("dairy_barn", "s_milking", "a red dairy barn with a big wooden door, a hay loft, milk cans by the door"),
    ("garden", "act_farmland", "a greenhouse garden shed with glass panes, vines and fruit plants inside, flower pots by the door"),
    ("log_shed", "s_woodcutting", "a log shed: an open-fronted timber shed stacked with logs, an axe in a stump by the door"),
    ("forge", "s_cheesesmithing", "a stone cheese forge with a glowing furnace window and a tall chimney, an anvil by the door, cheese-yellow trim"),
    ("workshop", "s_crafting", "a carpenter's workshop of planks with a big door, a saw and planks leaning by it"),
    ("sewing_parlor", "s_tailoring", "a tailor's sewing parlor: a neat shop with a display window showing a dress on a mannequin, fabric bolts, an awning"),
    ("kitchen", "s_cooking", "a cozy restaurant kitchen: brick building with a smoking chimney, a window with pies cooling on the sill"),
    ("brewery", "s_brewing", "a tea and coffee house: a wooden shop with a steaming teapot sign, an awning and a small bench"),
    ("laboratory", "s_alchemy", "an alchemist's laboratory: a narrow purple stone tower with glowing bottles in the windows and a crooked chimney puffing coloured smoke"),
    ("observatory", "s_enhancing", "an enchanter's observatory: a round stone tower with a domed roof and a telescope, faint glowing blue runes on the walls"),
    ("gate", None, "the town gate: a stone archway with an open wooden gate, small banners on top; the road continues through it out of town"),
    ("lot", None, "an empty building lot: a patch of bare earth with a low wooden fence, a pile of planks and a few stones, a blank wooden sign post (nothing written on it)"),
    ("fountain", None, "a round stone town fountain with water sprinkling, a few doves on its rim"),
    ("market", None, "a small market stall with a striped awning and baskets of fruit and cheese"),
    ("lamp", None, "a wrought-iron street lamp next to a small leafy tree and a wooden bench"),
]
for k in range(2):
    part = TOWN[k * 8 : k * 8 + 8]
    refs = [r for _, r, _ in part if r]
    cells = [d + (f" (theme and colours from attached icon {refs.index(r) + 1})" if r else "") for _, r, d in part]
    prompt = f"Image: BUILDINGS of a cosy little village for a cute 2D side-view idle game, in {STYLE} (match the attached background picture's style; the attached icons, numbered in order after it, give some buildings their theme and colours). They stand side by side along one street, so every building is drawn seen straight from the FRONT at eye level (a street elevation, no perspective), its door at the bottom middle, all at the same scale (a door about as tall as a person), each filling most of its cell's height.\n" + grid(4, 2, cells, "magenta", "")
    name = "lg_town_" + "ab"[k]
    job(name, prompt, [os.path.join(SHEETS, "lb_milking.png")] + [os.path.join(REF, r + ".png") for r in refs], "magenta")
    groups[name] = {"grid": [4, 2], "dir": "town", "ids": [i for i, _, _ in part], "out": 320}
prompt = f"""Image: a wide BACKGROUND for a small side-view idle-game window, in {STYLE}; match the attached background's art style and level of detail exactly but not its content.
Scene: the sky and far distance over a cosy little village: soft clouds, rolling green hills, a few far-away roofs, a windmill and trees on the hills. A cobblestone street runs across the whole bottom ~22% of the image with a grass verge behind it.
Composition: landscape 1536x1024, camera at eye level from the side. Buildings will be laid along the street in front of this picture, so keep the middle band plain and soft (only far-away scenery, small and pale); nothing tall in the foreground. No characters, no animals, no people, no text, no UI.
"""
job("lb_town", prompt, [os.path.join(SHEETS, "lb_milking.png")], "none")

# how each tool is drawn, so the userscript can find the grip (see tool_geo in build-assets.py)
HELD = "drawn as held in a hand, seen from the side: the handle toward the BOTTOM-LEFT of its cell and the working end toward the TOP-RIGHT, tilted 45 degrees, all eight at the same size and the same angle, the end of the handle at the same spot in every cell"
HELD_KIND = {
    "pot": "standing upright in side view with its spout pointing to the RIGHT and its single handle on the LEFT, all eight at the same size",
    "alembic": "standing upright in side view with its tube curving off to the RIGHT, coloured like its icon, all eight at the same size",
}
for kind, desc in TOOLS.items():
    cells = [f"the {t} tier (attached icon {k + 1})" for k, t in enumerate(TIERS)]
    prompt = f"""Image: eight versions of {desc} for a cute 2D side-view idle game, in {STYLE}, one per material tier, each matching its attached item icon (same order) in colours, material and ornaments.
Every tool is {HELD_KIND.get(kind, HELD)}. No hands, no characters.
""" + grid(4, 2, cells, "magenta", "")
    refs = [os.path.join(REF, f"i_{t}_{kind}.png") for t in TIERS]
    if kind == "alembic":
        # redrawn after a too realistic first try: the finished teapots set the style
        refs.append(os.path.join(SHEETS, "lg_tool_pot.png"))
        prompt += "Match the drawing style, outline weight and shading of the LAST attached image (other tools of the same game) exactly.\n"
    job("lg_tool_" + kind, prompt, refs, "magenta")
    groups["lg_tool_" + kind] = {"grid": [4, 2], "dir": "tool", "ids": [f"{t}_{kind}" for t in TIERS]}

out.close()
json.dump(groups, open(os.path.join(RAW, "life-groups.json"), "w"), indent=1)
print(open(os.path.join(RAW, "jobs-life.tsv")).read().count("\n"), "jobs")
