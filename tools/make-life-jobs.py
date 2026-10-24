#!/usr/bin/env python3
"""Writes Codex image-generation jobs for the skilling window (Life module) art.

usage: make-life-jobs.py <raw_dir>
  lb_<scene>   backgrounds: milking, woodcutting, the 7 foraging areas, the 7 production / enhancing / alchemy rooms
  lt_<id>      3x2 pose sheets of the 7 cows and the 7 trees (cut like monsters, see LIFE_POSES in build-assets.py)
  lg_<group>   packed sheets of different things, one per cell: foraging plants by area (3x2), the stations (4x2),
               the tools of one kind in their 8 tiers (4x2); the cell -> id lists go to <raw_dir>/life-groups.json

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
TIERS = ["cheese", "verdant", "azure", "burble", "crimson", "rainbow", "holy", "celestial"]
TOOLS = {
    "brush": "a milking brush",
    "shears": "a pair of garden shears",
    "hatchet": "a hatchet",
    "hammer": "a smithing hammer",
    "chisel": "a woodworking chisel",
    "needle": "a big sewing needle",
    "spatula": "a cooking spatula",
    "pot": "a brewing pot with a long handle",
    "alembic": "an alchemy alembic flask held by its neck",
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

prompt = f"Image: WORK STATIONS for a cute 2D side-view idle game, in {STYLE}; the attached skill icons (in this order) give each station's theme and colours.\n" + grid(
    4, 2, [d for _, d in STATIONS], "magenta", "Each station is drawn in side view at about the height of a person, with a flat top where an item can rest."
)
job("lg_stations", prompt, [os.path.join(REF, f"s_{s}.png") for s, _ in STATIONS], "magenta")
groups["lg_stations"] = {"grid": [4, 2], "dir": "station", "ids": [s for s, _ in STATIONS]}

for kind, desc in TOOLS.items():
    cells = [f"the {t} tier (attached icon {k + 1})" for k, t in enumerate(TIERS)]
    prompt = f"""Image: eight versions of {desc} for a cute 2D side-view idle game, in {STYLE}, one per material tier, each matching its attached item icon (same order) in colours, material and ornaments.
Every tool is drawn as held in a hand, seen from the side: the handle toward the BOTTOM-LEFT of its cell and the working end toward the TOP-RIGHT, tilted 45 degrees, all eight at the same size and the same angle, the end of the handle at the same spot in every cell. No hands, no characters.
""" + grid(4, 2, cells, "magenta", "")
    job("lg_tool_" + kind, prompt, [os.path.join(REF, f"i_{t}_{kind}.png") for t in TIERS], "magenta")
    groups["lg_tool_" + kind] = {"grid": [4, 2], "dir": "tool", "ids": [f"{t}_{kind}" for t in TIERS]}

out.close()
json.dump(groups, open(os.path.join(RAW, "life-groups.json"), "w"), indent=1)
print(open(os.path.join(RAW, "jobs-life.tsv")).read().count("\n"), "jobs")
