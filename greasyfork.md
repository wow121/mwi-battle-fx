# MWI Alive

Turns the battle area of Milky Way Idle into a Slay-the-Spire-style side-view stage: your party on the left, the monsters on the right, with animated attacks, skills, projectiles, hits, crits and deaths. Skilling plays in a small floating window. The "Original view" button in the top-right corner switches back to the game's own screen at any time.

## Battle stage

- **Two stages**: the default is the new rigged stage (PixiJS; characters and monsters move part by part, with camera zoom, skill close-ups and heavy-hit impacts). A button on the stage or the menu switches to the old stage (whole pose pictures).
- **Characters**: drawn with your in-game avatar and outfit, holding side-view weapons and off-hands. Melee has slash, stab and smash moves, ranged attacks leave arrow trails, spells have a casting pose. Weapons glow by enhancement level (+5 blue, +8 purple, +10 orange, +12 red-gold, +15 and up rainbow), and the special effects of level-95 weapons flash on the weapon when they trigger.
- **Monsters**: all 95 monsters have their own art, with their name and tier (T0–T5). The "Monster girls" menu option swaps them for monster-girl designs (after LaoTY's 娘化怪物换皮).
- **Skill effects**: every skill has its own effect; area skills cover the whole row with one large area effect; crits show big gold numbers.
- **Scenes**: every zone has its own backdrop, with more dangerous versions for elite and nightmare tiers; dungeons, the Labyrinth and Guild Trials have their own backdrops. The top-left corner shows the zone and tier.
- **Formation**: a normal party lines up melee in front, ranged in the middle and magic at the back.
- **Guild Trials**: the trial in the guild's "In Progress" tab is shown on the stage too, with the whole roster in formation (tanks in front, then melee, ranged and magic); scroll to zoom, drag to pan, double-click to reset. With more than 12 players the full effects are kept for you, the monsters and one other member's skill a second, so it stays smooth on a phone; names and HP bars sit on one line without covering each other.
- **Click**: clicking a character or monster on the stage clicks the game's battle card under it and opens the game's own unit window.
- **Quality**: the "Quality" button on the stage switches between high / medium / low / lowest; lower it if the stage stutters.

## Skilling animations

- Skilling plays in a floating window you can drag, resize or collapse to an icon. Each skill has its own scene, workstation and tier-drawn tools (with enhancement glow); gathering carries the products into storage, crafting / enhancing / alchemy take materials from it, and storage shows your actual inventory counts.
- Rare drops, the Philosopher's Stone, enhancement milestones and blessed enhancements have their own animations; the window shows the same bonuses as the game's action panel.
- **Guild skilling trials**: the whole guild works on a big guild project that takes shape in stages as progress is made. **Labyrinth skilling rooms**: the skill scene gets a room seal that lights up with progress.
- **Town**: when you are idle or fighting, the window shows a small town whose workshops are your in-game houses, labelled with their real levels; switching actions, your character walks down the street to the new workshop. While working you can open the town with the 🏘 button in the title bar. Players who talk in chat drop by the town for a while.

## How to use

- After installing, reload the game page and start a battle to see the stage; the top-right button switches between the animation and the original view.
- The userscript manager's menu lets you toggle the battle animation / monster girls / skilling window / town, switch between the new and old stage, and set skill effect opacity, screen shake, camera zoom and animation size; clicking the version line checks the art.
- A party member's weapons and enhancement levels are read once you have opened their profile card, and are remembered after that; until then only their avatar and outfit are shown.
- The art takes a moment to load the first time; after that it is kept in the browser cache and not downloaded again.

## Safety and privacy

- It only reads the game's WebSocket messages; it never sends anything to the game, never changes game data and does not affect the battle itself.
- It does not change the game's own interface; it only lays its picture over the battle / guild / labyrinth area.
- Art and effects are loaded from jsDelivr / GitHub.
- No personal information is collected.

## Feedback

Source code and issues: https://github.com/wow121/mwi-battle-fx

License: MIT
