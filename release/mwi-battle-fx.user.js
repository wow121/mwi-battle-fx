// ==UserScript==
// @name         MWI 战斗动画
// @namespace    mwi-battle-fx-release
// @version      0.10.0
// @description  银河奶牛放置：把战斗区域换成杀戮尖塔式的侧视舞台（游戏原版角色形象、AI 生成的怪物立绘与地点背景，攻击、技能特效、弹道、受击、暴击、阵亡），右上角按钮随时切回原版。不改游戏数据，只读游戏消息；立绘从素材 CDN 加载。
// @match        https://www.milkywayidle.com/*
// @match        https://milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @match        https://milkywayidlecn.com/*
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/wow121/mwi-battle-fx/main/release/mwi-battle-fx.user.js
// @downloadURL  https://raw.githubusercontent.com/wow121/mwi-battle-fx/main/release/mwi-battle-fx.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      cdn.jsdelivr.net
// @connect      raw.githubusercontent.com
// @grant        unsafeWindow
// @grant        GM_info
// ==/UserScript==

(function () {
  "use strict"
  const W = typeof unsafeWindow !== "undefined" ? unsafeWindow : window

  // DEV: the build (tools/build-release.py) writes the release copy with this false and drops the
  // "#dev" lines / blocks: the 动画测试 lab, debug logging and the developer menu items
  const DEV = false
  // ---------- settings ----------
  const DEFAULTS = { enabled: true, scale: 1, debug: false, stageH: 360, lookMode: "equip", assetBase: "", overlay: true, liveH: 300, guildOverlay: true, guildH: 460 }
  const DEFAULT_ASSET_BASE = "https://cdn.jsdelivr.net/gh/wow121/mwi-battle-fx@main"
  // jsDelivr's @main can lag for hours; the manifest (which pins the art commit) comes from GitHub first
  const MANIFEST_URLS = ["https://raw.githubusercontent.com/wow121/mwi-battle-fx/main/assets/manifest.json", DEFAULT_ASSET_BASE + "/assets/manifest.json"]
  const cfg = { ...DEFAULTS, ...GM_getValue("battle_fx_cfg_v1", {}) }
  const saveCfg = () => GM_setValue("battle_fx_cfg_v1", cfg)

  // ---------- static data (game v1.20260927.0) ----------
  // short hrid -> [zh name, effect type, target type, combat style, damage type]
  const ABILITIES = {
    aqua_arrow: ["流水箭", "damage", "enemy", "ranged", "water"],
    berserk: ["狂暴", "buff", "self", "", ""],
    cleave: ["分裂斩", "damage", "allEnemies", "slash", "physical"],
    crippling_slash: ["致残斩", "damage", "allEnemies", "slash", "physical"],
    critical_aura: ["暴击光环", "buff", "allAllies", "", ""],
    elemental_affinity: ["元素增幅", "buff", "self", "", ""],
    elusiveness: ["闪避", "buff", "self", "", ""],
    entangle: ["缠绕", "damage", "enemy", "magic", "nature"],
    fierce_aura: ["物理光环", "buff", "allAllies", "", ""],
    fireball: ["火球", "damage", "enemy", "magic", "fire"],
    firestorm: ["火焰风暴", "damage", "allEnemies", "magic", "fire"],
    flame_arrow: ["烈焰箭", "damage", "enemy", "ranged", "fire"],
    flame_blast: ["熔岩爆裂", "damage", "allEnemies", "magic", "fire"],
    fracturing_impact: ["碎裂冲击", "damage", "allEnemies", "smash", "physical"],
    frenzy: ["狂速", "buff", "self", "", ""],
    frost_surge: ["冰霜爆裂", "damage", "allEnemies", "magic", "water"],
    guardian_aura: ["守护光环", "buff", "allAllies", "", ""],
    heal: ["自愈术", "heal", "self", "magic", ""],
    ice_spear: ["冰枪术", "damage", "enemy", "magic", "water"],
    impale: ["透骨之刺", "damage", "enemy", "stab", "physical"],
    insanity: ["疯狂", "buff", "self", "", ""],
    invincible: ["无敌", "buff", "self", "", ""],
    life_drain: ["生命吸取", "damage", "enemy", "magic", "nature"],
    maim: ["血刃斩", "damage", "enemy", "slash", "physical"],
    mana_spring: ["法力喷泉", "damage", "allEnemies", "magic", "water"],
    minor_heal: ["初级自愈术", "heal", "self", "magic", ""],
    mystic_aura: ["元素光环", "buff", "allAllies", "", ""],
    natures_veil: ["自然菌幕", "damage", "allEnemies", "magic", "nature"],
    penetrating_shot: ["贯穿射击", "damage", "enemy", "ranged", "physical"],
    penetrating_strike: ["贯心之刺", "damage", "enemy", "stab", "physical"],
    pestilent_shot: ["疫病射击", "damage", "enemy", "ranged", "physical"],
    poke: ["破胆之刺", "damage", "enemy", "stab", "physical"],
    precision: ["精确", "buff", "self", "", ""],
    promote: ["晋升", "promote", "self", "", ""],
    provoke: ["挑衅", "buff", "self", "", ""],
    puncture: ["破甲之刺", "damage", "enemy", "stab", "physical"],
    quick_aid: ["快速治疗术", "heal", "lowestHpAlly", "magic", ""],
    quick_shot: ["快速射击", "damage", "enemy", "ranged", "physical"],
    rain_of_arrows: ["箭雨", "damage", "allEnemies", "ranged", "physical"],
    rejuvenate: ["群体治疗术", "heal", "allAllies", "magic", ""],
    retribution: ["惩戒", "buff", "self", "", ""],
    revive: ["复活", "revive", "deadAlly", "magic", ""],
    scratch: ["爪影斩", "damage", "enemy", "slash", "physical"],
    shield_bash: ["盾击", "damage", "enemy", "smash", "physical"],
    silencing_shot: ["沉默之箭", "damage", "enemy", "ranged", "physical"],
    smack: ["重碾", "damage", "enemy", "smash", "physical"],
    smoke_burst: ["烟爆灭影", "damage", "enemy", "magic", "fire"],
    speed_aura: ["速度光环", "buff", "allAllies", "", ""],
    spike_shell: ["尖刺防护", "buff", "self", "", ""],
    steady_shot: ["稳定射击", "damage", "enemy", "ranged", "physical"],
    stunning_blow: ["重锤", "damage", "enemy", "smash", "physical"],
    sweep: ["重扫", "damage", "allEnemies", "smash", "physical"],
    taunt: ["嘲讽", "buff", "self", "", ""],
    toughness: ["坚韧", "buff", "self", "", ""],
    toxic_pollen: ["剧毒粉尘", "damage", "allEnemies", "magic", "nature"],
    vampirism: ["吸血", "buff", "self", "", ""],
    water_strike: ["流水冲击", "damage", "enemy", "magic", "water"],
  }
  // seconds a skill's buff / debuff lasts (game data); auras are unique per kind, so different auras stack
  const BUFF_SECONDS = {"berserk":20,"crippling_slash":12,"critical_aura":120,"elemental_affinity":20,"elusiveness":20,"fierce_aura":120,"fracturing_impact":12,"frenzy":20,"frost_surge":9,"guardian_aura":120,"ice_spear":8,"insanity":12,"invincible":12,"maim":12,"mana_spring":10,"mystic_aura":120,"pestilent_shot":12,"precision":20,"provoke":65,"puncture":12,"retribution":30,"smoke_burst":8,"speed_aura":120,"spike_shell":30,"taunt":65,"toughness":20,"toxic_pollen":10,"vampirism":20}
  // official zh names: monsters by short hrid, combat zones (/actions/combat/<id>) by id
  const MONSTER_ZH = {"abyssal_imp":"深渊小鬼","acrobat":"杂技师","trial_hedgehog":"试炼刺猬","anchor_shark":"持锚鲨","aquahorse":"水马","trial_jellyfish":"试炼水母","black_bear":"黑熊","gobo_boomy":"轰轰","brine_marksman":"海盐射手","butterjerry":"蝶鼠","captain_fishhook":"鱼钩船长","centaur_archer":"半人马弓箭手","cyclops":"独眼巨人","chronofrost_sorcerer":"霜时巫师","dryad":"树精","crystal_colossus":"水晶巨像","frost_sniper":"霜冻狙击手","demonic_overlord":"恶魔霸主","deranged_jester":"小丑皇","dodocamel":"渡渡驼","dusk_revenant":"黄昏亡灵","trial_chameleon":"试炼变色龙","elementalist":"元素法师","enchanted_bishop":"秘法主教","enchanted_king":"秘法国王","enchanted_knight":"秘法骑士","enchanted_pawn":"秘法士兵","enchanted_queen":"秘法王后","enchanted_rook":"秘法堡垒","eye":"独眼","eyes":"叠眼","flame_sorcerer":"火焰巫师","fly":"苍蝇","trial_beetle":"试炼甲虫","trial_dragonfly":"试炼蜻蜓","trial_wasp":"试炼黄蜂","trial_firefly":"试炼萤火虫","frog":"青蛙","sea_snail":"蜗牛","giant_shoebill":"鲸头鹳","gobo_chieftain":"哥布林酋长","granite_golem":"花岗岩魔像","griffin":"狮鹫","grizzly_bear":"棕熊","gummy_bear":"软糖熊","crab":"螃蟹","ice_sorcerer":"冰霜巫师","infernal_warlock":"地狱术士","trial_badger":"试炼獾","jackalope":"鹿角兔","rat":"杰瑞","juggler":"杂耍者","jungle_sprite":"丛林精灵","giant_mantis":"巨螳螂","luna_empress":"月神之蝶","magician":"魔术师","magnetic_golem":"磁力魔像","manticore":"狮蝎兽","marine_huntress":"海洋猎手","giant_scorpion":"巨蝎","mimic":"宝箱怪","myconid":"蘑菇人","nom_nom":"咬咬鱼","novice_sorcerer":"新手巫师","panda":"熊猫","polar_bear":"北极熊","porcupine":"豪猪","rabid_rabbit":"疯魔兔","red_panda":"小熊猫","alligator":"夏洛克","gobo_shooty":"咻咻","skunk":"臭鼬","gobo_slashy":"砍砍","slimy":"史莱姆","gobo_smashy":"锤锤","soul_hunter":"灵魂猎手","squawker":"鹦鹉","gobo_stabby":"刺刺","stalactite_golem":"钟乳石魔像","pyre_hunter":"火焰猎手","swampy":"沼泽虫","the_kraken":"克拉肯","the_watcher":"观察者","snake":"蛇","tidal_conjuror":"潮汐召唤师","salamander":"火蜥蜴","shadow_archer":"暗影弓手","treant":"树人","turtle":"忍者龟","vampire":"吸血鬼","veyes":"复眼","siren":"海妖","werewolf":"狼人","zombie":"僵尸","zombie_bear":"僵尸熊"}
  const ZONE_ZH = {"fly":"苍蝇","rat":"杰瑞","skunk":"臭鼬","porcupine":"豪猪","slimy":"史莱姆","smelly_planet":"臭臭星球","frog":"青蛙","snake":"蛇","swampy":"沼泽虫","alligator":"夏洛克","swamp_planet":"沼泽星球","sea_snail":"蜗牛","crab":"螃蟹","aquahorse":"水马","nom_nom":"咬咬鱼","turtle":"忍者龟","aqua_planet":"海洋星球","jungle_sprite":"丛林精灵","myconid":"蘑菇人","treant":"树人","centaur_archer":"半人马弓箭手","jungle_planet":"丛林星球","gobo_stabby":"刺刺","gobo_slashy":"砍砍","gobo_smashy":"锤锤","gobo_shooty":"咻咻","gobo_boomy":"轰轰","gobo_planet":"哥布林星球","eye":"独眼","eyes":"叠眼","veyes":"复眼","planet_of_the_eyes":"眼球星球","novice_sorcerer":"新手巫师","ice_sorcerer":"冰霜巫师","flame_sorcerer":"火焰巫师","elementalist":"元素法师","sorcerers_tower":"巫师之塔","gummy_bear":"软糖熊","panda":"熊猫","black_bear":"黑熊","grizzly_bear":"棕熊","polar_bear":"北极熊","bear_with_it":"熊熊星球","magnetic_golem":"磁力魔像","stalactite_golem":"钟乳石魔像","granite_golem":"花岗岩魔像","golem_cave":"魔像洞穴","zombie":"僵尸","vampire":"吸血鬼","werewolf":"狼人","twilight_zone":"暮光之地","abyssal_imp":"深渊小鬼","soul_hunter":"灵魂猎手","infernal_warlock":"地狱术士","infernal_abyss":"地狱深渊","chimerical_den":"奇幻洞穴","sinister_circus":"阴森马戏团","enchanted_fortress":"秘法要塞","pirate_cove":"海盗基地"}
  const ELEMENT_COLOR = {
    fire: "#ff6a2b",
    water: "#3fb4ff",
    nature: "#62d65a",
    physical: "#ffe3a3",
    heal: "#6cff9a",
    buff: "#ffd84a",
    hurt: "#ff3b3b",
  }
  const zhUI = () => {
    try {
      const l = W.localStorage.getItem("i18nextLng") || document.documentElement.lang || ""
      return !/^en/i.test(l)
    } catch {
      return true
    }
  }
  // what a unit is called on the stage: monsters by their official zh name in a zh UI (the server sends English)
  const nameOf = (side, u) => (side === "m" && zhUI() && MONSTER_ZH[shortId(u?.hrid)]) || u?.name || ""
  function abilityInfo(hrid) {
    if (!hrid) return null
    const key = hrid.split("/").pop()
    const a = ABILITIES[key]
    const en = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    if (!a) return { key, name: en, kind: "damage", target: "enemy", style: "magic", element: "physical" }
    return { key, name: zhUI() ? a[0] : en, kind: a[1], target: a[2], style: a[3], element: a[4] || "physical" }
  }

  // ---------- battle state ----------
  // side "p" = players, "m" = monsters; index matches pMap/mMap keys and DOM order
  const units = { p: [], m: [] }

  function unitFrom(u) {
    const cd = u.combatDetails || {}
    const cs = cd.combatStats || {}
    return {
      name: u.name,
      hrid: u.hrid || null,
      hp: u.currentHitpoints ?? cd.currentHitpoints ?? 0,
      mp: u.currentManapoints ?? cd.currentManapoints ?? 0,
      maxHp: cd.maxHitpoints || 1,
      maxMp: cd.maxManapoints || 1,
      ability: u.preparingAbilityHrid || null,
      style: (cs.combatStyleHrids?.[0] || "/combat_styles/smash").split("/").pop(),
      element: (cs.damageType || "/damage_types/physical").split("/").pop(),
      counters: {},
      raw: u,
    }
  }

  function onNewBattle(obj) {
    units.p = (obj.players || []).map(unitFrom)
    units.m = (obj.monsters || []).map(unitFrom)
    units.p.forEach((u, i) => Looks.assign(u, i))
    if (cfg.enabled) Stage.newBattle()
  }

  // guild trials: up to ~40 players against the trial boss(es), with their own messages (new_guild_battle /
  // guild_battle_updated) in the same pMap / mMap shape; slot 0 is the viewer
  const gunits = { p: [], m: [] }
  // a player seen casting one of these stands with the tanks
  const TANK_ABILITIES = new Set(["provoke", "taunt", "toughness", "spike_shell", "retribution", "guardian_aura", "invincible"])
  function onNewGuildBattle(obj) {
    gunits.p = (obj.players || []).map(unitFrom)
    gunits.m = (obj.monsters || []).map(unitFrom)
    gunits.p.forEach(u => Looks.assignGuild(u))
    if (cfg.enabled) Stage.newBattle("guild")
  }

  const other = side => (side === "p" ? "m" : "p")

  // U: the battle the update belongs to (units = own battle, gunits = guild trial); src: the stage mode it plays in
  function onBattleUpdated(obj, U = units, src = "live") {
    if (!U.p.length && !U.m.length) return
    const changes = [] // {side, i, dHP, dMP, hp, maxHp, acted, prevAbility, died, revived}
    for (const side of ["p", "m"]) {
      const map = obj[side + "Map"] || {}
      for (const k of Object.keys(map)) {
        const i = +k
        const e = map[k]
        const u = U[side][i]
        if (!u || !e) continue
        const c = { side, i, dHP: 0, dMP: 0, hp: u.hp, maxHp: u.maxHp, acted: false, struck: false, prevAbility: u.ability, died: false, revived: false }
        if (typeof e.cHP === "number") {
          c.dHP = e.cHP - u.hp
          c.died = u.hp > 0 && e.cHP <= 0
          c.revived = u.hp <= 0 && e.cHP > 0
          u.hp = c.hp = e.cHP
        }
        if (typeof e.cMP === "number") {
          c.dMP = e.cMP - u.mp
          u.mp = e.cMP
        }
        // atkCounter ticks when the unit acts (attack or cast), dmgCounter when it is hit (a hit without
        // HP loss is a miss / zero damage)
        const tick = key => typeof e[key] === "number" && u.counters[key] !== undefined && e[key] > u.counters[key]
        c.acted = tick("atkCounter")
        c.struck = tick("dmgCounter")
        c.hits = c.struck ? e.dmgCounter - u.counters.dmgCounter : 0
        c.crit = tick("critCounter")
        for (const key of ["atkCounter", "dmgCounter", "critCounter"]) if (typeof e[key] === "number") u.counters[key] = e[key]
        // abilityHrid / isAutoAtk describe the NEXT action
        if ("abilityHrid" in e) u.ability = e.abilityHrid || null
        if (TANK_ABILITIES.has(shortId(e.abilityHrid))) u.tank = true
        else if (e.isAutoAtk) u.ability = null
        changes.push(c)
      }
    }
    const actions = resolve(changes, U)
    // critCounter: whichever side it ticks on (attacker or the one hit), the action's hits were critical
    for (const act of actions) {
      const by = act.actor && changes.find(c => c.side === act.actor.side && c.i === act.actor.i)
      if (act.effect === "damage") for (const t of act.targets) t.crit = (t.crit || !!by?.crit) && t.dHP < 0
    }
    procs(actions, changes, U)
    if (cfg.enabled) Stage.play(actions, src)
  }

  // turns raw hp/mp deltas into actions:
  // {actor: {side,i}|null, ab, effect: damage|heal|buff|regen, style, element, targets: [change]}
  function resolve(changes, U = units) {
    const actions = []
    // with action counters a cast is "acted while an ability was prepared"; without them, an MP drop
    const countersKnown = changes.some(c => U[c.side][c.i]?.counters?.atkCounter !== undefined)
    const casters = changes.filter(c => c.prevAbility && (countersKnown ? c.acted : c.dMP < 0))
    // misses (struck without HP loss) travel with the hits so they still get a "MISS"
    const hurt = changes.filter(c => c.dHP < 0 || (c.struck && c.dHP === 0))
    const healed = changes.filter(c => c.dHP > 0)
    const used = new Set()

    for (const c of casters) {
      const ab = abilityInfo(c.prevAbility)
      const u = U[c.side][c.i]
      let effect = "buff"
      let targets = []
      if (ab.kind === "damage") {
        effect = "damage"
        targets = hurt.filter(h => h.side === other(c.side))
      } else if (ab.kind === "heal" || ab.kind === "revive") {
        effect = "heal"
        targets = healed.filter(h => h.side === c.side)
      }
      targets.forEach(t => used.add(t))
      actions.push({ actor: { side: c.side, i: c.i }, ab, effect, style: ab.style || u.style, element: ab.kind === "damage" ? ab.element : u.element, targets })
    }

    // auto attacks (and damage whose source is unclear, e.g. DoT ticks or retaliation)
    // One update is one combat event. When both sides lose HP in it and nobody cast, one side attacked and
    // the other was hurt by thorns / retribution; without action counters we cannot tell which, so neither
    // side gets an attack animation. A caster that loses HP in its own cast was hit by retaliation too.
    const loose = hurt.filter(h => !used.has(h))
    const mutual = loose.some(h => h.side === "p") && loose.some(h => h.side === "m")
    const casterKeys = new Set(casters.map(c => c.side + c.i))
    const bySrc = new Map()
    for (const t of hurt) {
      if (used.has(t)) continue
      const foes = U[other(t.side)]
      const acted = changes.filter(c => c.side === other(t.side) && c.acted && !casterKeys.has(c.side + c.i))
      let src = acted.length ? acted[0].i : -1
      // hurt while acting and no enemy acted: thorns / retribution bounced its own attack back
      const reflect = src < 0 && (casterKeys.has(t.side + t.i) || (countersKnown ? t.acted : mutual))
      // last resort: a lone enemy must be the attacker (never when counters exist: no tick means no action)
      if (src < 0 && !reflect && !countersKnown) {
        const alive = foes.map((u, i) => (u.hp > 0 ? i : -1)).filter(i => i >= 0)
        if (alive.length === 1) src = alive[0]
      }
      if (src < 0) {
        actions.push({ actor: null, ab: null, effect: "damage", style: reflect ? "reflect" : "dot", element: "physical", targets: [t] })
        continue
      }
      const key = other(t.side) + src
      if (!bySrc.has(key)) {
        const u = foes[src]
        const a = { actor: { side: other(t.side), i: src }, ab: null, effect: "damage", style: u.style, element: u.element, targets: [] }
        bySrc.set(key, a)
        actions.push(a)
      }
      bySrc.get(key).targets.push(t)
    }
    // several attackers in one update (guild trials): the first one carries the numbers, the others swing
    // at the same targets without repeating them
    for (const side of ["p", "m"]) {
      const extra = changes.filter(c => c.side === side && c.acted && !casterKeys.has(c.side + c.i) && !bySrc.has(c.side + c.i))
      const hit = actions.find(a => a.actor?.side === side && !a.ab && a.targets.length)
      if (!hit) continue
      for (const c of extra) {
        const u = U[side][c.i]
        actions.push({ actor: { side, i: c.i }, ab: null, effect: "damage", style: u.style, element: u.element, targets: hit.targets.map(t => ({ ...t, quiet: true })) })
      }
    }
    // life drain / regen ticks
    for (const h of healed) if (!used.has(h)) actions.push({ actor: null, ab: null, effect: "regen", style: "", element: "heal", targets: [h] })
    return actions
  }

  // ---------- 95 weapons' special effects ----------
  // The game sends no proc flag: each effect is inferred from the update it happens in (mechanics as in
  // mwi-fastsim). A proc flashes the holder's weapon in the effect's colour. Teammates' weapons are known
  // only after the viewer opened their profile.
  const PROCS = {
    blazing_trident: "#ff7a2b", // blaze: a cast adds a fire hit on every enemy
    blooming_trident: "#7dff8a", // bloom: a cast adds a heal
    rippling_trident: "#4fc3ff", // ripple: a cast refunds 10 MP (and cuts cooldowns)
    chaotic_flail: "#ff4a6a", // mayhem: a missed auto attack swings at the next enemy
    sundering_crossbow: "#7ff6ff", // pierce: an auto attack goes on to the next enemy
    cursed_bow: "#b86bff", // curse: every landed hit stacks damage taken
    furious_spear: "#ff6a2a", // fury: every landed hit stacks accuracy / damage
    regal_sword: "#ffe27a", // parry: the holder takes an attack aimed at the party and strikes back
    griffin_bulwark: "#fff2b0", // weaken: whoever hits the holder deals less damage
  }
  const weaponOf = u => {
    const it = u?.items || {}
    return shortId(it.main_hand || it.two_hand)?.replace(/_refined$/, "") || null
  }
  const castDrop = {} // "<player>|<ability>" -> largest MP drop seen; a cast ~10 MP cheaper was rippled
  function procs(actions, changes, U = units) {
    const holders = U.p.map((u, i) => ({ i, w: weaponOf(u) })).filter(h => PROCS[h.w])
    if (!holders.length) return
    const flash = (act, h) => (act.procs ||= []).push({ side: "p", i: h.i, color: PROCS[h.w] })
    for (const act of actions) {
      const a = act.actor
      const h = a?.side === "p" && holders.find(x => x.i === a.i)
      if (h && act.ab) {
        const c = changes.find(x => x.side === "p" && x.i === a.i)
        if (h.w === "blazing_trident") {
          const foes = changes.filter(x => x.side === "m" && x.struck)
          if (foes.some(x => x.hits >= 2) || (act.ab.kind !== "damage" && foes.length) || (act.ab.target === "enemy" && foes.length > 1)) flash(act, h)
        } else if (h.w === "blooming_trident") {
          const healed = changes.filter(x => x.side === "p" && x.dHP > 0)
          if (act.ab.kind === "heal" ? act.ab.target !== "allAllies" && healed.length > 1 : healed.length) flash(act, h)
        } else if (h.w === "rippling_trident" && c?.dMP < 0) {
          const k = a.i + "|" + act.ab.key
          if (-c.dMP > (castDrop[k] || 0)) castDrop[k] = -c.dMP
          else if (-c.dMP <= castDrop[k] - 8) flash(act, h)
        }
      } else if (h && act.effect === "damage" && (h.w === "sundering_crossbow" || h.w === "chaotic_flail") && act.targets.length > 1) flash(act, h)
      // curse / fury: any landed hit, auto attack or skill
      if (h && act.effect === "damage" && (h.w === "cursed_bow" || h.w === "furious_spear") && act.targets.some(t => t.dHP < 0)) flash(act, h)
      if (act.effect === "damage" && a?.side === "m") {
        for (const t of act.targets) {
          const g = t.side === "p" && holders.find(x => x.w === "griffin_bulwark" && x.i === t.i)
          if (g) flash(act, g)
        }
      }
      // a monster hurt by its own attack with no player acting: parried by a living regal sword holder
      if (!a && act.style === "reflect" && act.targets[0]?.side === "m") {
        const p = holders.find(x => x.w === "regal_sword" && U.p[x.i].hp > 0)
        if (p) {
          Object.assign(act, { actor: { side: "p", i: p.i }, style: U.p[p.i].style, element: U.p[p.i].element })
          flash(act, p)
        }
      }
    }
  }

  // ---------- helpers ----------
  const later = (ms, fn) => (ms > 0 ? setTimeout(fn, ms) : fn())
  const fmt = n => {
    n = Math.abs(Math.round(n))
    return n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : String(n)
  }
  const pct = (a, b) => Math.max(0, Math.min(100, (a / (b || 1)) * 100)) + "%"

  // ---------- the game's battle cards (read only: avatar sprites are taken from them) ----------
  function cardEl(side, i) {
    const area = document.querySelector(side === "p" ? '[class*="BattlePanel_playersArea"]' : '[class*="BattlePanel_monstersArea"]')
    let grid = area?.querySelector('[class*="BattlePanel_combatUnitGrid"]')
    if (!grid) grid = document.querySelectorAll('[class*="BattlePanel_combatUnitGrid"]')[side === "p" ? 0 : 1]
    return grid?.children[i] || null
  }

  // ---------- where we fight: location + difficulty pick the stage background ----------
  const ZONE_LOC = {"abyssal_imp":"infernal_abyss","alligator":"swamp_planet","aqua_planet":"aqua_planet","aquahorse":"aqua_planet","bear_with_it":"bear_with_it","black_bear":"bear_with_it","centaur_archer":"jungle_planet","chimerical_den":"chimerical_den","crab":"aqua_planet","elementalist":"sorcerers_tower","enchanted_fortress":"enchanted_fortress","eye":"planet_of_the_eyes","eyes":"planet_of_the_eyes","flame_sorcerer":"sorcerers_tower","fly":"smelly_planet","frog":"swamp_planet","gobo_boomy":"gobo_planet","gobo_planet":"gobo_planet","gobo_shooty":"gobo_planet","gobo_slashy":"gobo_planet","gobo_smashy":"gobo_planet","gobo_stabby":"gobo_planet","golem_cave":"golem_cave","granite_golem":"golem_cave","grizzly_bear":"bear_with_it","gummy_bear":"bear_with_it","ice_sorcerer":"sorcerers_tower","infernal_abyss":"infernal_abyss","infernal_warlock":"infernal_abyss","jungle_planet":"jungle_planet","jungle_sprite":"jungle_planet","magnetic_golem":"golem_cave","myconid":"jungle_planet","nom_nom":"aqua_planet","novice_sorcerer":"sorcerers_tower","panda":"bear_with_it","pirate_cove":"pirate_cove","planet_of_the_eyes":"planet_of_the_eyes","polar_bear":"bear_with_it","porcupine":"smelly_planet","rat":"smelly_planet","sea_snail":"aqua_planet","sinister_circus":"sinister_circus","skunk":"smelly_planet","slimy":"smelly_planet","smelly_planet":"smelly_planet","snake":"swamp_planet","sorcerers_tower":"sorcerers_tower","soul_hunter":"infernal_abyss","stalactite_golem":"golem_cave","swamp_planet":"swamp_planet","swampy":"swamp_planet","treant":"jungle_planet","turtle":"aqua_planet","twilight_zone":"twilight_zone","vampire":"twilight_zone","veyes":"planet_of_the_eyes","werewolf":"twilight_zone","zombie":"twilight_zone"}
  const MONSTER_LOC = {"abyssal_imp":"infernal_abyss","alligator":"swamp_planet","sea_snail":"aqua_planet","crab":"aqua_planet","aquahorse":"aqua_planet","nom_nom":"aqua_planet","turtle":"aqua_planet","marine_huntress":"aqua_planet","gummy_bear":"bear_with_it","panda":"bear_with_it","black_bear":"bear_with_it","grizzly_bear":"bear_with_it","polar_bear":"bear_with_it","red_panda":"bear_with_it","centaur_archer":"jungle_planet","elementalist":"sorcerers_tower","eye":"planet_of_the_eyes","eyes":"planet_of_the_eyes","flame_sorcerer":"sorcerers_tower","fly":"smelly_planet","frog":"swamp_planet","gobo_boomy":"gobo_planet","gobo_stabby":"gobo_planet","gobo_slashy":"gobo_planet","gobo_smashy":"gobo_planet","gobo_shooty":"gobo_planet","gobo_chieftain":"gobo_planet","magnetic_golem":"golem_cave","stalactite_golem":"golem_cave","granite_golem":"golem_cave","crystal_colossus":"golem_cave","ice_sorcerer":"sorcerers_tower","soul_hunter":"infernal_abyss","infernal_warlock":"infernal_abyss","demonic_overlord":"infernal_abyss","jungle_sprite":"jungle_planet","myconid":"jungle_planet","treant":"jungle_planet","luna_empress":"jungle_planet","novice_sorcerer":"sorcerers_tower","veyes":"planet_of_the_eyes","the_watcher":"planet_of_the_eyes","porcupine":"smelly_planet","rat":"smelly_planet","skunk":"smelly_planet","slimy":"smelly_planet","snake":"swamp_planet","chronofrost_sorcerer":"sorcerers_tower","swampy":"swamp_planet","giant_shoebill":"swamp_planet","zombie":"twilight_zone","vampire":"twilight_zone","werewolf":"twilight_zone","dusk_revenant":"twilight_zone"}
  const where = { zone: null, tier: 0, labyrinth: false }
  const shortId = h => (h ? String(h).split("/").pop() : null)
  function combatActionIn(obj) {
    const party = obj.partyInfo?.party
    if (party?.actionHrid?.startsWith("/actions/combat/")) return party
    for (const list of [obj.endCharacterActions, obj.characterActions]) {
      if (!Array.isArray(list)) continue
      const a = list.find(x => x?.actionHrid?.startsWith("/actions/combat/") && !x.isDone)
      if (a) return a
    }
    return null
  }
  // location from the current combat action; when that is unknown, from the monsters on the field
  function stageLocation() {
    if (where.labyrinth) return "labyrinth"
    const loc = ZONE_LOC[where.zone]
    if (loc) return loc
    const votes = {}
    for (const u of units.m) {
      const l = MONSTER_LOC[shortId(u.hrid)]
      if (l) votes[l] = (votes[l] || 0) + 1
    }
    return Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0] || null
  }

  // ---------- generated art (pose frames, backgrounds) from the asset CDN ----------
  const Assets = (() => {
    let manifest = GM_getValue("battle_fx_manifest_v1", null)
    let fetchedAt = GM_getValue("battle_fx_manifest_at_v1", 0)
    let loading = false
    const listeners = []
    const base = () => (cfg.assetBase || DEFAULT_ASSET_BASE).replace(/\/+$/, "")
    function refresh(force) {
      if (loading || (!force && manifest && Date.now() - fetchedAt < 1800e3)) return
      loading = true
      const urls = cfg.assetBase ? [base() + "/assets/manifest.json"] : MANIFEST_URLS
      const next = k => {
        if (k >= urls.length) return (loading = false)
        GM_xmlhttpRequest({
          method: "GET",
          url: urls[k] + "?t=" + Math.floor(Date.now() / 300e3),
          timeout: 15000,
          onload: r => {
            try {
              manifest = JSON.parse(r.responseText)
              fetchedAt = Date.now()
              loading = false
              GM_setValue("battle_fx_manifest_v1", manifest)
              GM_setValue("battle_fx_manifest_at_v1", fetchedAt)
              listeners.forEach(f => f())
            } catch (e) {
              next(k + 1)
            }
          },
          onerror: () => next(k + 1),
          ontimeout: () => next(k + 1),
        })
      }
      next(0)
    }
    const has = (kind, id) => !!id && !!manifest?.[kind]?.includes(id)
    // files come from the commit the manifest was published at, so the CDN can never serve stale art
    const url = path => (manifest?.rev && !cfg.assetBase ? DEFAULT_ASSET_BASE.replace(/@main$/, "@" + manifest.rev) : base()) + "/assets/" + path
    return { refresh, has, url, list: kind => manifest?.[kind] || [], get: k => manifest?.[k], onChange: f => listeners.push(f) }
  })()

  // ---------- player looks: by equipment or by avatar + outfit (per-viewer setting) ----------
  const VISIBLE_SLOTS = ["head", "body", "legs", "feet", "hands", "main_hand", "two_hand", "off_hand", "back"]
  const Looks = (() => {
    const me = { name: null, avatar: null, outfit: null, items: {}, enh: {} }
    const profiles = GM_getValue("battle_fx_profiles_v1", {}) // player name -> {avatar, outfit, items, enh}
    // first string value whose key matches, searching a few levels down
    function findKey(o, re, depth = 3) {
      if (!o || typeof o !== "object" || depth < 0) return undefined
      for (const k of Object.keys(o)) if (re.test(k) && typeof o[k] === "string") return o[k]
      for (const k of Object.keys(o)) {
        const v = o[k]
        if (v && typeof v === "object" && !Array.isArray(v)) {
          const r = findKey(v, re, depth - 1)
          if (r !== undefined) return r
        }
      }
      return undefined
    }
    const avatarOf = o => ({ avatar: shortId(findKey(o, /^avatarHrid$/i)), outfit: shortId(findKey(o, /^avatarOutfitHrid$/i)) })
    function itemsFrom(list) {
      const items = {}
      for (const it of Array.isArray(list) ? list : Object.values(list || {})) {
        const slot = shortId(it?.itemLocationHrid)
        if (VISIBLE_SLOTS.includes(slot) && it.itemHrid) items[slot] = shortId(it.itemHrid)
      }
      return items
    }
    // slot -> enhancement level (+N) of the visible gear
    function enhFrom(list) {
      const enh = {}
      for (const it of Array.isArray(list) ? list : Object.values(list || {})) {
        const slot = shortId(it?.itemLocationHrid)
        if (VISIBLE_SLOTS.includes(slot) && it.enhancementLevel > 0) enh[slot] = it.enhancementLevel
      }
      return enh
    }
    function onMessage(obj) {
      if (obj.type === "init_character_data") {
        me.name = obj.character?.name || me.name
        Object.assign(me, avatarOf(obj.character || {}))
        if (!me.avatar) Object.assign(me, avatarOf(obj))
        me.items = itemsFrom(obj.characterItems)
        me.enh = enhFrom(obj.characterItems)
      } else if (obj.type === "profile_shared") {
        const p = obj.profile || {}
        const name = p.sharableCharacter?.name
        if (name) {
          profiles[name] = { ...avatarOf(p.sharableCharacter), items: itemsFrom(p.wearableItemMap), enh: enhFrom(p.wearableItemMap) }
          GM_setValue("battle_fx_profiles_v1", profiles)
        }
      } else if (Array.isArray(obj.endCharacterItems)) {
        // equipping moves the item into a visible slot; unequipping moves it back to the inventory
        for (const it of obj.endCharacterItems) {
          const slot = shortId(it.itemLocationHrid)
          const id = shortId(it.itemHrid)
          if (VISIBLE_SLOTS.includes(slot) && it.count > 0) {
            me.items[slot] = id
            me.enh[slot] = it.enhancementLevel || 0
          } else {
            for (const s of VISIBLE_SLOTS) {
              if (me.items[s] !== id) continue
              delete me.items[s]
              delete me.enh[s]
            }
          }
        }
      }
    }
    // avatar/outfit layers drawn on the game's battle card
    function cardLook(i) {
      const out = {}
      for (const u of cardEl("p", i)?.querySelectorAll("use") || []) {
        const h = u.getAttribute("href") || u.getAttribute("xlink:href") || ""
        if (/avatar_outfits/.test(h)) out.outfit = h.split("#")[1]
        else if (/avatars?[_.]/.test(h) && !/background|border/.test(h)) out.avatar = h.split("#")[1]
      }
      return out
    }
    function hash(str) {
      let h1 = 0x811c9dc5
      let h2 = 0x01000193
      for (let i = 0; i < str.length; i++) {
        h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619)
        h2 = Math.imul(h2 ^ str.charCodeAt(i), 2246822519)
      }
      return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)
    }
    function spec(u, mode) {
      const items = u.items || {}
      const weapon = items.main_hand || items.two_hand || null
      if (mode === "equip" && Object.keys(items).length) {
        const sorted = {}
        for (const s of VISIBLE_SLOTS) if (items[s]) sorted[s] = items[s]
        return { mode: "equip", avatar: u.avatar || null, style: u.style, weapon, items: sorted }
      }
      if (u.avatar) return { mode: "outfit", avatar: u.avatar, outfit: u.outfit || null, style: u.style, weapon }
      return null
    }
    const idOf = sp => sp.mode[0] + "_" + hash(JSON.stringify(sp))
    // picks the art for a player: preferred mode, then the other mode, then a generic look for the combat style
    function assign(u, i) {
      const prof = u.name && u.name === me.name ? me : profiles[u.name] || {}
      const fromBattle = avatarOf(u.raw || {})
      const card = cardLook(i)
      u.avatar = fromBattle.avatar || prof.avatar || card.avatar || null
      u.outfit = fromBattle.outfit || prof.outfit || card.outfit || null
      u.items = prof.items || {}
      u.enh = prof.enh || {}
      const modes = cfg.lookMode === "outfit" ? ["outfit", "equip"] : ["equip", "outfit"]
      u.lookId = null
      for (const m of modes) {
        const sp = spec(u, m)
        if (!sp) continue
        const id = idOf(sp)
        if (Assets.has("p", id)) {
          u.lookId = id
          break
        }
      }
    }
    // guild trial players: no battle cards to read; self and opened profiles give the look, the rest get
    // the generic look for their combat style
    function assignGuild(u) {
      const prof = u.name && u.name === me.name ? me : profiles[u.name] || {}
      const fromBattle = avatarOf(u.raw || {})
      u.avatar = fromBattle.avatar || prof.avatar || null
      u.outfit = fromBattle.outfit || prof.outfit || null
      u.items = prof.items || {}
      u.enh = prof.enh || {}
      u.lookId = null
      if (/shield|bulwark|aegis|buckler/.test(u.items.off_hand || u.items.two_hand || "")) u.tank = true
    }
    return { onMessage, assign, assignGuild, me }
  })()

  // ---------- paper-doll layers: drawn side-view weapons / off-hands for the held gear ----------
  // Every layer (assets/doll/<id>.webp) was generated on the same mannequin and cut into rig pieces; whole dolls
  // are no longer assembled (v0.9.1), only the weapon and off-hand pieces are used.
  const Doll = (() => {
    let index = null
    let loading = false
    const listeners = []
    function load() {
      if (index || loading || !Assets.get("doll")) return
      loading = true
      GM_xmlhttpRequest({
        method: "GET",
        url: Assets.url("doll/index.json"),
        timeout: 20000,
        onload: r => {
          loading = false
          try {
            index = JSON.parse(r.responseText)
            listeners.forEach(f => f())
          } catch (e) {
          }
        },
        onerror: () => (loading = false),
        ontimeout: () => (loading = false),
      })
    }
    Assets.onChange(load)
    const ready = () => (load(), !!index)
    const base = id => id && String(id).replace(/_refined$/, "")
    // a weapon / off-hand layer as one held piece: its sheet, crop rect and grip point (piece pixels)
    function held(id) {
      const k = ready() && base(id)
      const rects = k && index.layers[k]
      const r = rects && (rects.weapon || rects.off)
      if (!r) return null
      const [sx, sy, w, h, dx, dy] = r
      // weapons were drawn in the doll's front fist (rig canvas = 2x piece pixels); off-hands roughly mid-grip
      const fist = index.rig.pivots.fist
      const grip = rects.weapon ? [fist[0] / 2 - dx, fist[1] / 2 - dy] : [w / 2, h * 0.6]
      const W = Math.max(...Object.values(rects).map(x => x[0] + x[2])) + 2
      const H = Math.max(...Object.values(rects).map(x => x[1] + x[3]))
      return { url: Assets.url("doll/" + k + ".webp"), rect: [sx, sy, w, h], grip, W, H, mid: !!index.dirs?.[k]?.[1] }
    }
    const list = prefix => (index ? Object.keys(index.layers).filter(k => (prefix ? k.startsWith(prefix) : !/^[ao]_/.test(k))) : [])
    return { ready, held, onLoad: f => listeners.push(f), list, slotOf: id => index?.slots?.[id], nameOf: id => index?.names?.[id] || id }
  })()

  // ---------- side-view stage: Slay-the-Spire style, heroes on the left, monsters on the right ----------
  const Stage = (() => {
    const SVGNS = "http://www.w3.org/2000/svg"
    const actors = { p: [], m: [] }
    const fx = [] // canvas effects {t0, dur, draw(ctx, p, now), done}
    let stageEl, viewEl, worldEl, canvas, ctx, banner, waitEl, bgEl, locEl
    // guild-trial camera: zoom z (1 = whole field) and pan x / y in stage pixels; cres = canvas resolution factor
    const view = { z: 1, x: 0, y: 0 }
    let cres = 1
    // where the stage hangs: "test" = the 动画测试 tab (lab units), "live" = over the game's unit cards
    let host = null
    let mode = ""
    let shown = units
    let bgKey = ""
    let tabBtn, panel, indicator
    let active = false
    let restore = [] // [element, prop, value] to undo when leaving our tab
    let boxObserver = null
    let SW = 0
    let SH = 0
    let dpr = 1
    let raf = 0
    let playersKey = ""
    let syncTimer = 0
    const now = () => performance.now()

    function injectCss() {
      if (document.getElementById("bfx-css")) return
      const st = document.createElement("style")
      st.id = "bfx-css"
      st.textContent = `
.bfx-panel{padding:6px 4px;font:12px/1.2 sans-serif;color:#dfe6ff}
/* isolate: our z-indexes stay inside the stage, so game popups and tooltips are never covered */
.bfx-stage{position:relative;isolation:isolate;z-index:0;width:100%;min-height:200px;overflow:hidden;resize:vertical;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:
 radial-gradient(ellipse 60% 30% at 50% 100%,rgba(120,140,255,.18),transparent),
 linear-gradient(180deg,#141b38 0%,#22305e 48%,#3a3a62 64%,#2b2742 65%,#1e1b30 100%)}
.bfx-view{position:absolute;inset:0;transform-origin:0 0}
.bfx-loc{position:absolute;left:6px;top:4px;z-index:20;padding:1px 9px;font:600 12px/18px sans-serif;color:#eef2ff;background:rgba(10,14,30,.6);border:1px solid rgba(255,255,255,.15);border-radius:10px;text-shadow:0 1px 2px #000}
.bfx-guild .bfx-loc{left:84px}
.bfx-world{position:absolute;inset:0}
.bfx-guild{cursor:grab;touch-action:none}
.bfx-zoom{display:none;position:absolute;left:4px;top:2px;z-index:20;gap:3px;pointer-events:auto!important}
.bfx-guild .bfx-zoom{display:flex}
.bfx-zoom button{width:22px;height:20px;padding:0;font:13px/18px sans-serif;color:#dfe6ff;background:rgba(20,26,52,.85);border:1px solid #4a5590;border-radius:6px;cursor:pointer}
.bfx-tiny .bfx-name,.bfx-tiny .bfx-chips,.bfx-guild .bfx-p .bfx-hpt{display:none}
.bfx-guild .bfx-p .bfx-name{font-size:1em}
.bfx-guild .bfx-p .bfx-hud{width:90%}
.bfx-guild .bfx-p .bfx-bar{height:.3em;margin-top:.1em}
.bfx-bg{position:absolute;inset:0;background:center 85%/cover no-repeat;opacity:0;transition:opacity .6s}
.bfx-bg:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.15),transparent 30%,transparent 70%,rgba(0,0,0,.35))}
/* frames are the 512px pose cell plus a 96px margin all round: scale up so the cell fills the actor box */
.bfx-sprite>img{position:absolute;left:-18.75%;top:-18.75%;width:137.5%;height:137.5%;display:block}
.bfx-art .bfx-shadow{bottom:2%;height:10%;width:56%}
.bfx-rings{position:absolute;left:50%;bottom:0;width:0;height:0}
.bfx-ring{position:absolute;border-radius:50%;border:2px solid;transform:translate(-50%,-50%);animation:bfx-ring 2.4s ease-in-out infinite}
@keyframes bfx-ring{0%,100%{opacity:.45}50%{opacity:.95}}
.bfx-chips{display:flex;justify-content:center;flex-wrap:wrap;gap:2px;margin-bottom:2px;min-height:0}
.bfx-chip{width:14px;height:14px;border-radius:50%;font:700 9px/14px sans-serif;text-align:center;color:#1a1a1a;box-shadow:0 0 3px rgba(0,0,0,.8)}
.bfx-chip.debuff{color:#fff;background:#5a1a24!important;border:1px solid #ff5a6a;line-height:12px}
.bfx-bubble{position:absolute;left:-12%;right:-12%;top:-8%;bottom:-4%;border-radius:50%;border:2px solid rgba(255,226,122,.85);background:radial-gradient(ellipse at 50% 35%,rgba(255,240,180,.08),rgba(255,214,90,.22) 70%,rgba(255,214,90,.05));box-shadow:0 0 14px rgba(255,214,90,.7),inset 0 0 12px rgba(255,214,90,.5);animation:bfx-ring 1.6s ease-in-out infinite;pointer-events:none}
.bfx-hpt{position:absolute;left:0;right:0;top:-1px;font-size:9px;line-height:5px;text-align:center;text-shadow:0 0 2px #000,0 0 2px #000}
.bfx-stage>*{pointer-events:none}
/* effects are light on black: screen-blend the whole canvas so black is see-through over the scene */
.bfx-stage canvas{position:absolute;inset:0;width:100%;height:100%;z-index:5000;mix-blend-mode:screen}
.bfx-actor{position:absolute;transform:translate(-50%,-100%)}
.bfx-shadow{position:absolute;left:50%;bottom:-6%;width:72%;height:16%;transform:translateX(-50%);border-radius:50%;background:radial-gradient(rgba(0,0,0,.55),transparent 70%)}
.bfx-move,.bfx-pose,.bfx-hit,.bfx-idle,.bfx-sprite{position:absolute;inset:0;transform-origin:50% 100%}
.bfx-idle{animation:bfx-bob 1.8s ease-in-out infinite}
@keyframes bfx-bob{0%,100%{transform:translateY(0) scale(1,1)}50%{transform:translateY(-3%) scale(1.025,.975)}}
.bfx-dead .bfx-idle{animation-play-state:paused}
.bfx-sprite svg{width:100%;height:100%;display:block;overflow:visible}
/* held weapon / off-hand on the game look: turned on the hand by pose (svg user units) */
.bfx-wpn,.bfx-off{transition:transform .14s ease-out}
.bfx-wpn{transform-origin:64px 72px}
.bfx-off{transform-origin:20px 78px}
[data-pose=windup] .bfx-wpn{transform:rotate(-60deg)}
[data-pose=strike] .bfx-wpn{transform:translate(4px,4px) rotate(75deg)}
[data-pose=strike] .bfx-off{transform:translateX(4px)}
[data-pose=windup] .bfx-wpn[data-mid]{transform:rotate(-15deg)}
[data-pose=strike] .bfx-wpn[data-mid]{transform:translateX(5px) rotate(12deg)}
[data-style=ranged][data-pose=windup] .bfx-wpn{transform:translateX(-3px) rotate(-10deg)}
[data-style=ranged][data-pose=strike] .bfx-wpn{transform:translateX(-6px)}
[data-style=magic][data-pose=windup] .bfx-wpn,[data-pose=cast] .bfx-wpn{transform:translateY(-12px) rotate(-25deg)}
[data-style=magic][data-pose=strike] .bfx-wpn{transform:translate(6px,-4px) rotate(30deg)}
[data-pose=hurt] .bfx-wpn{transform:rotate(-25deg)}
[data-pose=hurt] .bfx-off{transform:rotate(12deg)}
[data-pose=dead] .bfx-wpn{transform:translate(8px,16px) rotate(100deg)}
.bfx-hud{position:absolute;left:50%;top:100%;width:min(84%,140px);transform:translateX(-50%);margin-top:2px}
.bfx-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;font-size:11px;font-weight:600;text-shadow:0 1px 2px #000,0 0 3px #000}
.bfx-bar{position:relative;height:4px;margin-top:2px;background:rgba(0,0,0,.6);border-radius:2px;overflow:visible;box-shadow:0 0 0 1px rgba(0,0,0,.4)}
.bfx-bar i{display:block;height:100%;width:100%;border-radius:2px;transition:width .3s}
.bfx-num.bfx-crit{font-style:italic;-webkit-text-stroke:1.5px #5a1a00;text-shadow:0 0 6px rgba(255,170,40,.9),0 2px 3px rgba(0,0,0,.7)}
.bfx-num.bfx-crit small{display:block;font-size:.5em;line-height:1;text-align:center;letter-spacing:1px;-webkit-text-stroke:1px #5a1a00}
.bfx-num{position:absolute;left:0;top:0;z-index:6000;font:900 16px/1 sans-serif;white-space:nowrap;-webkit-text-stroke:1px rgba(0,0,0,.85);paint-order:stroke fill;text-shadow:0 2px 3px rgba(0,0,0,.6)}
.bfx-banner{position:absolute;left:50%;top:8px;z-index:6000;transform:translateX(-50%);padding:4px 14px;border:1px solid rgba(255,255,255,.35);border-radius:4px;background:linear-gradient(#26306a,#121a3c);font-weight:700;font-size:13px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.5);opacity:0}
.bfx-wait{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:.5}
.bfx-live-slot{position:absolute;inset:0;z-index:5}
.bfx-stage.bfx-live{position:absolute;inset:0;height:auto;min-height:0;resize:none;border-radius:6px}
.bfx-toggle{position:absolute;top:2px;right:4px;z-index:20;padding:2px 8px;font:12px/18px sans-serif;color:#dfe6ff;background:rgba(20,26,52,.85);border:1px solid #4a5590;border-radius:10px;cursor:pointer}
.bfx-toggle:hover{background:#2a3460}
`
      document.head.appendChild(st)
    }

    // ----- our tab next to the game's 交战 tab -----
    // the label carries the battle count, e.g. "交战# 423"
    const TAB_RE = /^(交战|Battle|Combat)(\s*#\s*[\d,]+)?$/i
    const TAB_SEL = '.MuiTab-root,[role="tab"],button'
    function findBattleTab() {
      for (const b of document.querySelectorAll(TAB_SEL))
        if (!b.classList.contains("bfx-tab") && TAB_RE.test(b.textContent.replace(/\s+/g, " ").trim())) return b
      return null
    }
    function panelsBox(btn) {
      for (let el = btn.parentElement; el && el !== document.body; el = el.parentElement) {
        const c = el.querySelector('[class*="tabPanelsContainer"]')
        if (c) return c
      }
      return null
    }
    // the game re-renders the tab bar when switching pages, so this runs on a timer and re-injects when needed
    function ensureTab() {
      if (cfg.enabled && tabBtn?.isConnected && panel?.isConnected) return
      if (active) deactivate()
      tabBtn?.remove()
      panel?.remove()
      tabBtn = panel = null
      if (!cfg.enabled || !DEV) return
      const ref = findBattleTab()
      const box = ref && panelsBox(ref)
      if (!box) return
      injectCss()
      // a clone keeps the game's tab look; React does not know about it, so its clicks are ours alone
      tabBtn = ref.cloneNode(true)
      tabBtn.classList.remove("Mui-selected")
      tabBtn.classList.add("bfx-tab")
      tabBtn.setAttribute("aria-selected", "false")
      tabBtn.removeAttribute("id")
      tabBtn.removeAttribute("aria-controls")
      // first text becomes our label; the rest (the "# 423" battle count) is cleared
      const tw = document.createTreeWalker(tabBtn, NodeFilter.SHOW_TEXT)
      let labeled = false
      for (let n; (n = tw.nextNode()); ) {
        if (!n.nodeValue.trim()) continue
        n.nodeValue = labeled ? "" : zhUI() ? "动画测试" : "FX Lab"
        labeled = true
      }
      ref.after(tabBtn)
      panel = document.createElement("div")
      panel.className = "bfx-panel"
      panel.style.display = "none"
      box.appendChild(panel)
      tabBtn.addEventListener("click", e => {
        e.preventDefault()
        e.stopPropagation()
        activate()
      })
      // any game tab click leaves ours first; the game then switches as usual
      ref.parentElement.addEventListener(
        "click",
        e => {
          const b = e.target.closest?.(TAB_SEL)
          if (b && b !== tabBtn && active) deactivate()
        },
        true,
      )
    }
    function activate() {
      if (active || !panel) return
      if (mode === "live") detach()
      const set = (el, prop, val) => {
        restore.push([el, prop, el.style[prop]])
        el.style[prop] = val
      }
      const box = panel.parentElement
      const hideGamePanels = () => {
        for (const c of box.children) if (c !== panel && c.style.display !== "none") set(c, "display", "none")
      }
      hideGamePanels()
      // the game may re-create or re-show its panels (e.g. on a new wave) while ours is open
      boxObserver = new MutationObserver(hideGamePanels)
      boxObserver.observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] })
      for (const b of tabBtn.parentElement.querySelectorAll(".Mui-selected")) {
        b.classList.remove("Mui-selected")
        restore.push([b, "class", "Mui-selected"])
      }
      indicator = tabBtn.closest(".MuiTabs-root")?.querySelector(".MuiTabs-indicator")
      if (indicator) set(indicator, "opacity", "0")
      tabBtn.classList.add("Mui-selected")
      tabBtn.setAttribute("aria-selected", "true")
      panel.style.display = ""
      active = true
      attach(Lab.render(panel), "test")
    }
    function deactivate() {
      active = false
      boxObserver?.disconnect()
      boxObserver = null
      for (const [el, prop, val] of restore.reverse()) {
        if (prop === "class") el.classList.add(val)
        else el.style[prop] = val
      }
      restore = []
      tabBtn?.classList.remove("Mui-selected")
      tabBtn?.setAttribute("aria-selected", "false")
      if (panel) panel.style.display = "none"
      // nothing runs while hidden: the lab stops, and the stage goes back over the real battle
      Lab.stop()
      if (mode === "test") detach()
      Live.ensure()
    }
    function open() {
      ensureTab()
      if (!tabBtn) return false
      activate()
      return true
    }
    function createStage() {
      // the stage box never moves; everything that shakes lives in .bfx-world inside it
      stageEl = document.createElement("div")
      stageEl.className = "bfx-stage"
      // .bfx-view carries the guild-trial zoom / pan, .bfx-world the shakes
      stageEl.innerHTML =
        '<div class="bfx-view"><div class="bfx-world"><div class="bfx-bg"></div><canvas></canvas></div></div><div class="bfx-banner"></div><div class="bfx-loc"></div><div class="bfx-wait">等待战斗…</div>' +
        '<div class="bfx-zoom"><button data-z="1.25">＋</button><button data-z="0.8">－</button><button data-z="0">⟲</button></div>'
      viewEl = stageEl.querySelector(".bfx-view")
      worldEl = stageEl.querySelector(".bfx-world")
      bgEl = stageEl.querySelector(".bfx-bg")
      canvas = stageEl.querySelector("canvas")
      ctx = canvas.getContext("2d")
      banner = stageEl.querySelector(".bfx-banner")
      waitEl = stageEl.querySelector(".bfx-wait")
      locEl = stageEl.querySelector(".bfx-loc")
      zoomControls()
      let hTimer = 0
      new ResizeObserver(() => {
        layout()
        clearTimeout(hTimer)
        hTimer = setTimeout(() => {
          const h = Math.round(stageEl.getBoundingClientRect().height)
          if (mode === "test" && h > 0 && h !== cfg.stageH) {
            cfg.stageH = h
            saveCfg()
          }
        }, 400)
      }).observe(stageEl)
    }
    // ----- guild-trial camera: wheel zooms about the cursor, drag pans, double click / ⟲ resets -----
    function setView(z, x, y) {
      view.z = Math.max(1, Math.min(4, z))
      view.x = Math.min(0, Math.max(SW - SW * view.z, x))
      view.y = Math.min(0, Math.max(SH - SH * view.z, y))
      if (viewEl) viewEl.style.transform = view.z === 1 ? "" : `translate(${view.x}px,${view.y}px) scale(${view.z})`
      // names only while the units are big enough on screen to carry them
      stageEl?.classList.toggle("bfx-tiny", mode === "guild" && (actors.p[0]?.s || 0) * view.z < 90)
      const res = mode === "guild" ? Math.min(2, Math.ceil(view.z * 2) / 2) : 1
      if (res !== cres) layout()
    }
    function zoomAt(f, mx, my) {
      const z = Math.max(1, Math.min(4, view.z * f))
      setView(z, mx - ((mx - view.x) / view.z) * z, my - ((my - view.y) / view.z) * z)
    }
    function zoomControls() {
      const guild = () => mode === "guild"
      stageEl.addEventListener(
        "wheel",
        e => {
          if (!guild()) return
          e.preventDefault()
          const r = stageEl.getBoundingClientRect()
          zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top)
        },
        { passive: false },
      )
      let drag = null
      stageEl.addEventListener("pointerdown", e => {
        if (!guild() || e.button !== 0 || e.target.closest("button")) return
        drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
        stageEl.setPointerCapture(e.pointerId)
      })
      stageEl.addEventListener("pointermove", e => drag && setView(view.z, drag.vx + e.clientX - drag.x, drag.vy + e.clientY - drag.y))
      stageEl.addEventListener("pointerup", () => (drag = null))
      stageEl.addEventListener("dblclick", () => guild() && setView(1, 0, 0))
      stageEl.querySelector(".bfx-zoom").addEventListener("click", e => {
        const f = +e.target.closest("button")?.dataset.z
        if (f === 0) setView(1, 0, 0)
        else if (f) zoomAt(f, SW / 2, SH / 2)
      })
    }
    function attach(newHost, newMode) {
      injectCss()
      if (!stageEl) createStage()
      if (host === newHost && mode === newMode && stageEl.parentElement === newHost) return
      host = newHost
      mode = newMode
      shown = mode === "test" ? Lab.units : mode === "guild" ? gunits : units
      fx.length = 0
      stageEl.classList.toggle("bfx-live", mode === "live" || mode === "guild")
      stageEl.classList.toggle("bfx-guild", mode === "guild")
      view.z = 1
      view.x = view.y = 0
      viewEl.style.transform = ""
      stageEl.style.height = mode === "test" ? cfg.stageH + "px" : ""
      host.appendChild(stageEl)
      reload()
      preloadFx()
      Assets.refresh()
    }
    function detach() {
      fx.length = 0
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      stageEl?.remove()
      host = null
      mode = ""
    }
    // rebuild everything from the units on show
    function reload() {
      if (!stageEl) return
      if (mode === "live") shown.p.forEach((u, i) => Looks.assign(u, i))
      if (mode === "guild") shown.p.forEach(u => Looks.assignGuild(u))
      playersKey = ""
      rebuild(true)
      setBackground()
      for (const side of ["p", "m"]) actors[side].forEach(a => (setBars(a), shown[side][a.i]?.hp <= 0 && die(a, true), renderStatus(a)))
    }
    // location art, the elite / nightmare variant for higher tiers, plus a slight per-tier grade
    // the badge in the corner: where we fight and the difficulty tier (colour by band: normal / elite / nightmare)
    function setLocation() {
      if (!locEl) return
      const zh = zhUI()
      const title = id => (zh && ZONE_ZH[id]) || (id || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
      let text = ""
      let tier = null
      if (mode === "guild") {
        const bosses = [...new Set(shown.m.map(u => nameOf("m", u)).filter(Boolean))]
        text = (zh ? "公会试炼" : "Guild Trial") + (bosses.length ? " · " + bosses.join(" / ") : "")
      } else if (mode === "test") {
        text = title(Lab.loc())
        tier = Lab.tier()
      } else if (where.labyrinth) text = zh ? "迷宫" : "Labyrinth"
      else {
        const zone = where.zone && ZONE_ZH[where.zone] ? where.zone : stageLocation()
        text = zone ? title(zone) : ""
        tier = where.tier ?? null
      }
      locEl.style.display = text ? "" : "none"
      locEl.textContent = text
      if (text && tier !== null) {
        const t = document.createElement("b")
        t.textContent = " T" + tier
        t.style.color = tier >= 4 ? "#ff6a5a" : tier >= 2 ? "#ffcf5a" : "#cfe0ff"
        locEl.appendChild(t)
      }
    }
    function setBackground() {
      setLocation()
      if (!bgEl) return
      const loc = mode === "test" ? Lab.loc() : mode === "guild" ? "guild_trial" : stageLocation()
      const t = mode === "test" ? Lab.tier() : mode === "guild" ? 0 : where.tier || 0
      const band = t >= 4 ? "__nightmare" : t >= 2 ? "__elite" : ""
      const name = loc && (Assets.has("bg", loc + band) ? loc + band : Assets.has("bg", loc) ? loc : null)
      const key = name + "|" + t
      if (key === bgKey) return
      bgKey = key
      if (!name) {
        bgEl.style.opacity = 0
        return
      }
      const url = Assets.url("bg/" + name + ".webp")
      const img = new Image()
      img.onload = () => {
        bgEl.style.backgroundImage = `url("${url}")`
        bgEl.style.filter = `brightness(${1 - t * 0.035}) saturate(${1 + t * 0.06}) contrast(${1 + t * 0.03})`
        bgEl.style.opacity = 1
      }
      img.src = url
    }
    const visible = () => cfg.enabled && !!stageEl?.isConnected && !document.hidden && (mode === "test" ? active : !!host?.offsetParent)

    // ----- sprites: the game's own svg sprite sheets -----
    const hrefOf = u => u.getAttribute("href") || u.getAttribute("xlink:href") || ""
    let monsterSheet = ""
    const sheets = {}
    const sheetAt = {}
    const sheetsSaved = GM_getValue("battle_fx_sheets_v1", {}) // last seen urls: the items sheet may not be on screen yet
    // avatars / avatar_outfits / items: "<name>_sprite.<hash>.svg" in the game, "<name>.svg" in the mock
    // held icons on the 100-unit avatar box: [x, y, size]; the weapon sits in the front hand, the off-hand at the back
    const HELD = { "bfx-wpn": [58, 30, 46], "bfx-off": [4, 50, 34] }
    // drawn held pieces (the paper-doll weapon / off-hand layers): grip on the hand, scaled from rig pixels
    const HANDS = { "bfx-wpn": [79, 66], "bfx-off": [21, 67] }
    const HELD_SCALE = 0.2
    const PLAYER_SCALE = 0.75
    let glowSeq = 0
    function sheet(name) {
      if (sheets[name]) return sheets[name]
      if (now() - (sheetAt[name] ?? -1e9) > 3000) {
        sheetAt[name] = now()
        const url = sheetUrl(new RegExp("(^|/)" + name + "(_sprite)?[^#/]*\\.svg"))
        if (url) {
          if (sheetsSaved[name] !== url) GM_setValue("battle_fx_sheets_v1", Object.assign(sheetsSaved, { [name]: url }))
          return (sheets[name] = url)
        }
      }
      return sheetsSaved[name] || ""
    }
    function sheetUrl(re) {
      for (const u of document.querySelectorAll("use")) {
        const h = hrefOf(u)
        if (re.test(h)) return h.split("#")[0]
      }
      for (const e of performance.getEntriesByType("resource")) if (re.test(e.name)) return e.name
      return ""
    }
    function svgOf(hrefs) {
      const s = document.createElementNS(SVGNS, "svg")
      s.setAttribute("viewBox", "0 0 100 100")
      for (const h of hrefs) {
        const u = document.createElementNS(SVGNS, "use")
        u.setAttribute("href", h)
        s.appendChild(u)
      }
      return s
    }
    function fallbackSvg(side, u) {
      const s = document.createElementNS(SVGNS, "svg")
      s.setAttribute("viewBox", "0 0 100 100")
      const c = ELEMENT_COLOR[u?.element] || "#9aa"
      s.innerHTML =
        side === "p"
          ? `<circle cx="50" cy="28" r="15" fill="#f1d3b3"/><path d="M28 92 Q30 50 50 48 Q70 50 72 92 Z" fill="${c}" stroke="#0006" stroke-width="2"/><circle cx="55" cy="27" r="2.5" fill="#222"/>`
          : `<path d="M18 92 Q14 40 50 30 Q86 40 82 92 Z" fill="${c}" stroke="#0006" stroke-width="2"/><circle cx="38" cy="55" r="5" fill="#fff"/><circle cx="38" cy="55" r="2.5" fill="#000"/><circle cx="62" cy="55" r="5" fill="#fff"/><circle cx="62" cy="55" r="2.5" fill="#000"/>`
      return s
    }
    // enhancement aura behind a held piece: none below +5, then blue / purple / orange / red-gold, rainbow from +15;
    // from +10 it breathes (svg animations: css filters on svg elements are unreliable)
    // [from +N, colour, outline radius, blur, breathing period s] in avatar-box units
    const ENCH = [[15, "rainbow", 2.6, 3.4, 1.6], [12, "#ff5a3c", 2.2, 3, 1.4], [10, "#ffa53a", 1.9, 2.6, 2.4], [8, "#c07bff", 1.6, 2.2, 0], [5, "#6fb6ff", 1.3, 2, 0]]
    const RAINBOW = "#ff4d4d;#ffb84d;#fff04d;#4dff88;#4dc3ff;#b84dff;#ff4d4d"
    function enchAura(level, content) {
      const tier = ENCH.find(([n]) => level >= n)
      if (!tier || !content.length) return null
      const [, color, radius, blur, breathe] = tier
      const id = "bfx-ench" + ++glowSeq
      const g = document.createElementNS(SVGNS, "g")
      g.setAttribute("class", "bfx-ench")
      g.setAttribute("filter", `url(#${id})`)
      g.setAttribute("opacity", breathe ? 0.7 : 0.9)
      const flood = color === "rainbow" ? `<feFlood flood-color="#ff4d4d"><animate attributeName="flood-color" values="${RAINBOW}" dur="3s" repeatCount="indefinite"/></feFlood>` : `<feFlood flood-color="${color}"/>`
      g.innerHTML =
        `<defs><filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feMorphology in="SourceAlpha" operator="dilate" radius="${radius}" result="a"/><feGaussianBlur in="a" stdDeviation="${blur}" result="b"/>${flood}<feComposite in2="b" operator="in" result="c"/><feMerge><feMergeNode in="c"/><feMergeNode in="c"/></feMerge></filter></defs>` +
        (breathe ? `<animate attributeName="opacity" values="0.55;1;0.55" dur="${breathe}s" repeatCount="indefinite"/>` : "")
      for (const ch of content) g.appendChild(ch.cloneNode(true))
      return g
    }
    // the game's own look for a player: avatar + outfit from their card (live) or the ids we know (lab),
    // holding the weapon / off-hand icons when we know the gear (self, or a profile the viewer has opened)
    function gameLook(i) {
      const u = shown.p[i]
      const card = mode === "live" ? cardEl("p", i) : null
      let hrefs = card ? [...card.querySelectorAll("use")].map(hrefOf).filter(h => /avatar/.test(h) && !/background|border/.test(h)) : []
      if (!hrefs.length && u?.avatar && sheet("avatars")) {
        hrefs = [sheet("avatars") + "#" + u.avatar]
        if (u.outfit && sheet("avatar_outfits")) hrefs.push(sheet("avatar_outfits") + "#" + u.outfit)
      }
      if (!hrefs.length) return null
      const it = u?.items || {}
      const enh = u?.enh || {}
      const held = [
        ["bfx-off", it.off_hand, enh.off_hand || 0],
        ["bfx-wpn", it.main_hand || it.two_hand, (it.main_hand ? enh.main_hand : enh.two_hand) || 0],
      ].filter(x => x[1] && (Doll.held(x[1]) || sheet("items")))
      const node = svgOf(hrefs)
      const attrs = (el, o) => Object.entries(o).forEach(([k, v]) => el.setAttribute(k, v))
      for (const [cls, id, level] of held) {
        const g = document.createElementNS(SVGNS, "g")
        g.setAttribute("class", cls)
        const pc = Doll.held(id)
        if (pc) {
          // the drawn piece, cropped from its layer sheet, its grip in the hand
          const [hx, hy] = HANDS[cls]
          const k = HELD_SCALE
          const box = document.createElementNS(SVGNS, "svg")
          attrs(box, { x: hx - pc.grip[0] * k, y: hy - pc.grip[1] * k, width: pc.rect[2] * k, height: pc.rect[3] * k, viewBox: pc.rect.join(" "), overflow: "hidden" })
          const img = document.createElementNS(SVGNS, "image")
          attrs(img, { href: pc.url, width: pc.W, height: pc.H })
          box.appendChild(img)
          g.appendChild(box)
          g.style.transformOrigin = `${hx}px ${hy}px`
          if (pc.mid) g.dataset.mid = 1
        } else {
          // no drawn piece: the game's item icon
          const w = document.createElementNS(SVGNS, "use")
          const [x, y, size] = HELD[cls]
          attrs(w, { href: sheet("items") + "#" + id, x, y, width: size, height: size })
          g.appendChild(w)
        }
        if (cls === "bfx-wpn") {
          // glow layer behind the weapon: a blurred outline whose colour flashWeapon sets
          const id = "bfx-glow" + ++glowSeq
          const defs = document.createElementNS(SVGNS, "defs")
          defs.innerHTML = `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feMorphology in="SourceAlpha" operator="dilate" radius="1.3" result="a"/><feGaussianBlur in="a" stdDeviation="2" result="b"/><feFlood flood-color="#fff"/><feComposite in2="b" operator="in"/></filter>`
          const glow = document.createElementNS(SVGNS, "g")
          attrs(glow, { class: "bfx-glow", filter: `url(#${id})`, opacity: 0 })
          for (const ch of [...g.childNodes]) glow.appendChild(ch.cloneNode(true))
          glow.appendChild(defs)
          g.insertBefore(glow, g.firstChild)
        }
        const aura = enchAura(level, [...g.childNodes].filter(ch => !ch.classList?.contains("bfx-glow")))
        if (aura) g.insertBefore(aura, g.firstChild)
        node.appendChild(g)
      }
      return { key: hrefs.join() + "|" + held.join() + (Doll.ready() ? "|d" : ""), node, real: true }
    }
    // monsters: sheet + hrid (cards may still show the previous wave); players: their game look
    function spriteFor(side, i) {
      const u = shown[side][i]
      if (side === "p") {
        const look = gameLook(i)
        if (look) return look
      }
      if (side === "m" && u?.hrid) {
        monsterSheet ||= sheetUrl(/combat_monsters[^#]*\.svg/)
        if (monsterSheet) {
          const h = monsterSheet + "#" + u.hrid.split("/").pop()
          return { key: h, node: svgOf([h]), real: true }
        }
      }
      const card = cardEl(side, i)
      if (card) {
        const re = side === "p" ? /avatar/ : /combat_monsters/
        const hrefs = [...card.querySelectorAll("use")].map(hrefOf).filter(h => re.test(h) && !/background|border/.test(h))
        if (hrefs.length) return { key: hrefs.join(), node: svgOf(hrefs), real: true }
      }
      return { key: "fallback", node: fallbackSvg(side, u), real: false }
    }
    // generated pose frames: "m/<monster>" or "p/<look>" when the manifest has them
    function artFor(side, i) {
      const u = shown[side][i]
      if (side === "m") {
        const id = shortId(u?.hrid)
        return Assets.has("m", id) ? "m/" + id : null
      }
      if (u?.lookId) return "p/" + u.lookId
      // no art made for this exact look: the game's own look, then a generic look for the combat style
      if (gameLook(i)) return null
      const d = "default_" + (u?.style || "slash")
      return Assets.has("p", d) ? "p/" + d : null
    }
    const frameUrl = (a, pose) => Assets.url(`${a.art}/${pose}.webp`)
    // swaps to a pose frame; ms > 0 falls back to idle (or dead) afterwards
    function setPose(a, pose, ms) {
      if (!a.art) {
        // svg sprites: the whole body moves elsewhere; here only the held weapon swings (css by data-pose)
        clearTimeout(a.poseTimer)
        if (a.dead && pose !== "dead") return
        a.spriteEl.dataset.pose = pose
        a.spriteEl.dataset.style = shown[a.side][a.i]?.style || ""
        if (ms > 0) a.poseTimer = setTimeout(() => (a.spriteEl.dataset.pose = a.dead ? "dead" : "idle"), ms)
        return
      }
      if (!a.img) return
      clearTimeout(a.poseTimer)
      if (a.dead && pose !== "dead") return
      showFrame(a, pose)
      if (ms > 0) a.poseTimer = setTimeout(() => showFrame(a, a.dead ? "dead" : "idle"), ms)
    }
    function showFrame(a, pose) {
      a.img.src = frameUrl(a, pose)
    }
    // a weapon special effect: the held weapon's glow outline pulses in the effect's colour
    function flashWeapon(a, color) {
      const glow = a?.spriteEl.querySelector(".bfx-wpn .bfx-glow")
      if (!glow) return
      glow.querySelector("feFlood").setAttribute("flood-color", color)
      glow.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0.8, offset: 0.55 }, { opacity: 0 }], { duration: 750, easing: "ease-out" })
      a.spriteEl.querySelector(".bfx-wpn").animate([{ filter: "none" }, { filter: "brightness(1.7)", offset: 0.2 }, { filter: "none" }], { duration: 600 })
    }
    function refreshSprite(a) {
      const art = artFor(a.side, a.i)
      if (art && art !== a.art) {
        a.art = art
        a.img = document.createElement("img")
        a.img.decoding = "async"
        showFrame(a, a.dead ? "dead" : "idle")
        for (const p of ["windup", "strike", "hurt", "cast", "dead"]) new Image().src = frameUrl(a, p)
        a.spriteEl.replaceChildren(a.img)
        a.el.classList.add("bfx-art")
        a.real = true
        return
      }
      if (a.art) return
      // svg sprites follow the unit (new wave, gear learned later) but never fall back from a real look
      const sp = spriteFor(a.side, a.i)
      if (sp.key === a.spriteKey || (a.real && !sp.real)) return
      a.el.classList.remove("bfx-art")
      a.spriteEl.replaceChildren(sp.node)
      a.spriteKey = sp.key
      a.real = sp.real
    }

    // ----- actors -----
    function makeActor(side, i) {
      const u = shown[side][i] || {}
      const el = document.createElement("div")
      el.className = "bfx-actor bfx-" + side
      el.innerHTML =
        '<div class="bfx-rings"></div><div class="bfx-shadow"></div><div class="bfx-move"><div class="bfx-pose"><div class="bfx-hit"><div class="bfx-idle"><div class="bfx-sprite"></div></div></div></div></div>' +
        '<div class="bfx-hud"><div class="bfx-chips"></div><div class="bfx-name"></div><div class="bfx-bar"><i style="background:linear-gradient(#ff7a7a,#d93b3b)"></i><span class="bfx-hpt"></span></div><div class="bfx-bar"><i style="background:linear-gradient(#7ab8ff,#2f6fd9)"></i></div></div>'
      el.querySelector(".bfx-idle").style.animationDelay = -Math.random() * 1.8 + "s"
      el.querySelector(".bfx-name").textContent = nameOf(side, u)
      const [hpI, mpI] = el.querySelectorAll(".bfx-bar i")
      const hpT = el.querySelector(".bfx-hpt")
      const a = {
        side,
        i,
        el,
        dir: side === "p" ? 1 : -1,
        move: el.querySelector(".bfx-move"),
        pose: el.querySelector(".bfx-pose"),
        hit: el.querySelector(".bfx-hit"),
        spriteEl: el.querySelector(".bfx-sprite"),
        hpI,
        mpI,
        hpT,
        ringsEl: el.querySelector(".bfx-rings"),
        chipsEl: el.querySelector(".bfx-chips"),
        status: {}, // skill key -> {until, kind: "buff" | "debuff"}
        fxBusyUntil: 0,
        x: 0,
        y: 0,
        s: 60,
        busyUntil: 0,
        dead: false,
        deathAnim: null,
        spriteKey: "",
        real: false,
        art: null,
        img: null,
        doll: null,
        poseTimer: 0,
      }
      refreshSprite(a)
      worldEl.appendChild(el)
      return a
    }
    function rebuild(all) {
      const key = shown.p.map(u => u.name).join("|")
      if (all || key !== playersKey) {
        actors.p.forEach(a => a.el.remove())
        actors.p = shown.p.map((_, i) => makeActor("p", i))
        playersKey = key
      }
      actors.m.forEach(a => a.el.remove())
      actors.m = shown.m.map((_, i) => makeActor("m", i))
      waitEl.style.display = shown.p.length || shown.m.length ? "none" : ""
      layout()
    }
    function layout() {
      if (!stageEl) return
      const r = stageEl.getBoundingClientRect()
      if (!r.width) return
      SW = r.width
      SH = r.height
      dpr = W.devicePixelRatio || 1
      // zoomed in, effects are drawn at a higher resolution so they stay sharp
      cres = mode === "guild" ? Math.min(2, Math.ceil(view.z * 2) / 2) : 1
      canvas.width = Math.round(SW * dpr * cres)
      canvas.height = Math.round(SH * dpr * cres)
      // each side stands in a row on the same ground line, first unit nearest the middle;
      // every other unit steps a little back so a crowded row still reads
      const ground = SH * 0.84
      for (const side of ["p", "m"]) {
        if (side === "p" && mode === "guild") {
          guildLayout(ground)
          continue
        }
        const list = actors[side]
        const n = list.length
        // shrink with the head count so neighbours overlap by at most ~30%
        // players are drawn edge to edge (no frame margin): smaller than the monsters
        const s = Math.min(SH * 0.5, SW * 0.21, (SW * 0.44) / (1 + 0.72 * Math.max(0, n - 1))) * cfg.scale * (side === "p" ? PLAYER_SCALE : 1)
        const room = SW * 0.44 - s
        const step = n > 1 ? Math.min(s * 0.78, room / (n - 1)) : 0
        list.forEach((a, k) => {
          a.s = s
          const back = k % 2 ? 1 : 0
          a.y = ground - back * SH * 0.035
          a.x = side === "p" ? SW * 0.46 - s / 2 - k * step : SW * 0.54 + s / 2 + k * step
          Object.assign(a.el.style, { left: a.x + "px", top: a.y + "px", width: s + "px", height: s + "px", zIndex: 100 - back * 10 - k })
        })
      }
    }
    // guild trials: the whole roster in formation, tanks in front, then melee, ranged and magic at the back.
    // Each group fills columns of up to `rows`; back rows stand higher and a little to the left.
    const ROLE_ORDER = ["tank", "melee", "ranged", "magic"]
    const roleOf = u => (u?.tank ? "tank" : u?.style === "ranged" ? "ranged" : u?.style === "magic" ? "magic" : "melee")
    function guildLayout(ground) {
      const list = actors.p
      const n = list.length
      if (!n) return
      const rows = n <= 4 ? 1 : n <= 10 ? 2 : n <= 18 ? 3 : n <= 30 ? 4 : 5
      const groups = ROLE_ORDER.map(r => list.filter(a => roleOf(shown.p[a.i]) === r)).filter(g => g.length)
      const cols = groups.reduce((c, g) => c + Math.ceil(g.length / rows), 0)
      const s = Math.min(SH * 0.4, (SW * 0.46) / (cols * 0.68 + (groups.length - 1) * 0.3 + 0.9)) * cfg.scale
      const dx = s * 0.68
      const dy = rows > 1 ? Math.min(s * 0.32, (SH * 0.42) / (rows - 1)) : 0
      let col = 0
      for (const g of groups) {
        g.forEach((a, k) => {
          const c = col + Math.floor(k / rows)
          const r = k % rows
          a.s = s
          a.x = SW * 0.46 - s / 2 - c * dx - r * s * 0.15
          a.y = ground - r * dy
          // the HUD scales with the unit (the camera zoom enlarges both together)
          Object.assign(a.el.style, { left: a.x + "px", top: a.y + "px", width: s + "px", height: s + "px", zIndex: 500 - r * 40 - Math.round(c), fontSize: s * 0.16 + "px" })
        })
        col += Math.ceil(g.length / rows) + 0.3
      }
      stageEl.classList.toggle("bfx-tiny", s * view.z < 90)
    }
    const actorOf = r => r && actors[r.side]?.[r.i]
    const mid = a => ({ x: a.x, y: a.y - a.s * 0.5 })

    function setBars(a) {
      const u = shown[a.side][a.i]
      if (!u) return
      a.hpI.style.width = pct(u.hp, u.maxHp)
      a.mpI.style.width = pct(u.mp, u.maxMp)
      a.hpT.textContent = `${fmt(u.hp)}/${fmt(u.maxHp)}`
    }
    function setHp(a, t) {
      a.hpI.style.width = pct(t.hp, t.maxHp)
      a.hpT.textContent = `${fmt(t.hp)}/${fmt(t.maxHp)}`
    }
    // bars and dead/alive state catch up with the real numbers after the animations
    function syncSoon() {
      clearTimeout(syncTimer)
      syncTimer = setTimeout(() => {
        for (const side of ["p", "m"])
          for (const a of actors[side]) {
            const u = shown[side][a.i]
            if (!u) continue
            setBars(a)
            if (u.hp <= 0 && !a.dead) die(a, true)
            else if (u.hp > 0 && a.dead) revive(a, true)
            refreshSprite(a)
          }
      }, 900)
    }

    // ----- canvas effects -----
    function addFx(dur, draw, delay = 0) {
      const f = { t0: now() + delay, dur, draw, done: null }
      fx.push(f)
      if (!raf) raf = requestAnimationFrame(loop)
      return f
    }
    function loop() {
      raf = 0
      if (!ctx) return
      const t = now()
      ctx.setTransform(dpr * cres, 0, 0, dpr * cres, 0, 0)
      ctx.clearRect(0, 0, SW, SH)
      for (let k = 0; k < fx.length; k++) {
        const f = fx[k]
        const p = (t - f.t0) / f.dur
        if (p < 0) continue
        if (p >= 1) {
          fx.splice(k--, 1)
          try {
            f.done?.()
          } catch (e) {
            console.warn("[战斗动画]", e)
          }
          continue
        }
        ctx.save()
        try {
          f.draw(ctx, p, t)
        } catch (e) {
          console.warn("[战斗动画]", e)
        }
        ctx.restore()
      }
      if (fx.length) raf = requestAnimationFrame(loop)
    }
    function burst(x, y, o = {}) {
      const { n = 14, color = "#fff", speed = 140, life = 520, size = 3, gravity = 260, spread = Math.PI * 2, angle = -Math.PI / 2, shape = "dot", delay = 0 } = o
      const ps = Array.from({ length: Math.round(n * cfg.scale) || 1 }, () => {
        const a = angle + (Math.random() - 0.5) * spread
        const v = speed * (0.35 + Math.random() * 0.85) * cfg.scale
        return { vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: size * (0.6 + Math.random() * 0.8) * cfg.scale, l: 0.6 + Math.random() * 0.4 }
      })
      addFx(
        life,
        (c, p) => {
          const tt = (p * life) / 1000
          c.globalCompositeOperation = "lighter"
          c.fillStyle = c.strokeStyle = color
          c.shadowColor = color
          c.shadowBlur = 6
          for (const q of ps) {
            const pp = p / q.l
            if (pp >= 1) continue
            c.globalAlpha = 1 - pp
            const px = x + q.vx * tt
            const py = y + q.vy * tt + 0.5 * gravity * tt * tt
            if (shape === "plus") {
              c.fillRect(px - q.s * 1.5, py - q.s * 0.4, q.s * 3, q.s * 0.8)
              c.fillRect(px - q.s * 0.4, py - q.s * 1.5, q.s * 0.8, q.s * 3)
            } else if (shape === "shard") {
              const a = Math.atan2(q.vy + gravity * tt, q.vx)
              c.lineWidth = q.s * 0.7
              c.beginPath()
              c.moveTo(px, py)
              c.lineTo(px - Math.cos(a) * q.s * 4, py - Math.sin(a) * q.s * 4)
              c.stroke()
            } else {
              c.beginPath()
              c.arc(px, py, q.s * (1 - pp * 0.5), 0, Math.PI * 2)
              c.fill()
            }
          }
        },
        delay,
      )
    }
    function ringFx(x, y, r0, r1, color, dur, flat = 1, width = 3, delay = 0) {
      addFx(
        dur,
        (c, p) => {
          c.globalCompositeOperation = "lighter"
          c.globalAlpha = 1 - p
          c.strokeStyle = color
          c.shadowColor = color
          c.shadowBlur = 10
          c.lineWidth = width * cfg.scale * (1 - p * 0.6)
          c.beginPath()
          c.ellipse(x, y, r0 + (r1 - r0) * Math.sqrt(p), (r0 + (r1 - r0) * Math.sqrt(p)) * flat, 0, 0, Math.PI * 2)
          c.stroke()
        },
        delay,
      )
    }
    // rotating magic circle on the ground
    // ----- generated effect sheets: 4x2 frames on black, drawn additively (black = transparent) -----
    const fxImgs = {}
    function fxImg(name) {
      if (!Assets.has("fx", name)) return null
      let im = fxImgs[name]
      if (!im) {
        im = fxImgs[name] = new Image()
        im.src = Assets.url("fx/" + name + ".webp")
      }
      return im.complete && im.naturalWidth ? im : null
    }
    // every sheet the manifest lists: an effect that is still downloading falls back to the generic look,
    // and long-cooldown skills would otherwise show that fallback on nearly every cast
    function preloadFx() {
      for (const n of Assets.list("fx")) fxImg(n)
    }
    function drawFrame(c, im, f, w, h, anchor) {
      const fw = im.naturalWidth / 4
      const fh = im.naturalHeight / 2
      c.drawImage(im, (f % 4) * fw, Math.floor(f / 4) * fh, fw, fh, -w / 2, anchor === "bottom" ? -h : -h / 2, w, h)
    }
    // plays an effect once at (x, y), h px tall; false when the art is not available (callers fall back)
    function sprite(name, x, y, h, { dur = 560, anchor = "center", flip = false, rot = 0, delay = 0, alpha = 1 } = {}) {
      const im = fxImg(name)
      if (!im) return false
      const w = (h * im.naturalWidth) / 4 / (im.naturalHeight / 2)
      addFx(
        dur,
        (c, p) => {
          c.globalCompositeOperation = "lighter"
          c.globalAlpha = alpha
          c.translate(x, y)
          if (rot) c.rotate(rot)
          if (flip) c.scale(-1, 1)
          drawFrame(c, im, Math.min(7, Math.floor(p * 8)), w, h, anchor)
        },
        delay,
      )
      return true
    }
    const BURST = { fire: "fire_burst", water: "water_burst", nature: "nature_burst" }
    const ORB = { fire: "fire_orb", water: "ice_orb", nature: "nature_orb" }
    const CIRCLE = { fire: 0, water: 1, nature: 2 }

    function circleFx(a, color, dur, element) {
      const r = a.s * 0.55
      const im = fxImg("circles")
      addFx(dur, (c, p, t) => {
        c.globalCompositeOperation = "lighter"
        c.globalAlpha = p < 0.15 ? p / 0.15 : 1 - Math.max(0, p - 0.6) / 0.4
        c.translate(a.x, a.y)
        c.scale(1, 0.32)
        if (im) {
          // 2x2 sheet of round glyphs: fire, water, nature, holy
          const k = CIRCLE[element] ?? 3
          const cw = im.naturalWidth / 2
          const ch = im.naturalHeight / 2
          c.rotate(t / 900)
          c.drawImage(im, (k % 2) * cw + (cw - ch) / 2, Math.floor(k / 2) * ch, ch, ch, -r * 0.95, -r * 0.95, r * 1.9, r * 1.9)
          return
        }
        c.rotate(t / 260)
        c.strokeStyle = color
        c.shadowColor = color
        c.shadowBlur = 12
        c.lineWidth = 2.5
        c.beginPath()
        c.arc(0, 0, r, 0, Math.PI * 2)
        c.stroke()
        c.setLineDash([7, 5])
        c.beginPath()
        c.arc(0, 0, r * 0.72, 0, Math.PI * 2)
        c.stroke()
        c.setLineDash([])
        c.beginPath()
        for (let k = 0; k < 6; k++) {
          const an = (k / 6) * Math.PI * 2
          c.lineTo(Math.cos(an) * r * 0.72, Math.sin(an) * r * 0.72)
        }
        c.closePath()
        c.stroke()
      })
    }
    function pillarFx(x, yFeet, w, h, color, dur, delay = 0) {
      addFx(
        dur,
        (c, p) => {
          const a = Math.sin(p * Math.PI)
          const g = c.createLinearGradient(0, yFeet - h, 0, yFeet)
          g.addColorStop(0, "rgba(0,0,0,0)")
          g.addColorStop(1, color)
          c.globalCompositeOperation = "lighter"
          c.globalAlpha = a * 0.55
          c.fillStyle = g
          c.fillRect(x - (w / 2) * a, yFeet - h, w * a, h)
        },
        delay,
      )
    }
    // projectile from a to b; arc lifts the middle of the path; onHit fires on arrival
    // trail: streak colour for skill shots drawn from a sheet (arrows always streak)
    function projectile(from, to, { kind, color, dur, arc = 0, size = 1, art, trail: streak }, onHit) {
      const trail = []
      const motes = [] // sparks shed along a streaked path
      const im = art && fxImg(art)
      const f = addFx(dur, (c, p) => {
        const e = kind === "meteor" ? p * p : p
        const x = from.x + (to.x - from.x) * e
        const y = from.y + (to.y - from.y) * e - arc * 4 * e * (1 - e)
        const ang = Math.atan2(to.y - from.y - arc * 4 * (1 - 2 * e), to.x - from.x)
        c.globalCompositeOperation = "lighter"
        if (kind === "arrow" || streak) {
          // a fading ribbon (white near the head) and a few sparks left hanging in the air
          const sc = streak || color
          trail.push({ x, y })
          if (trail.length > 10) trail.shift()
          if (Math.random() < 0.6) motes.push({ x, y, vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.5) * 50 - 15, t: p })
          c.save()
          c.lineCap = "round"
          c.shadowColor = sc
          c.shadowBlur = 10
          for (let k = 1; k < trail.length; k++) {
            c.globalAlpha = (k / trail.length) * 0.85
            c.strokeStyle = k > trail.length - 3 ? "#fff" : sc
            c.lineWidth = (1 + (k / trail.length) * 4 * size) * cfg.scale
            c.beginPath()
            c.moveTo(trail[k - 1].x, trail[k - 1].y)
            c.lineTo(trail[k].x, trail[k].y)
            c.stroke()
          }
          c.fillStyle = sc
          for (const m of motes) {
            const age = ((p - m.t) * dur) / 1000
            if (age > 0.35) continue
            c.globalAlpha = 1 - age / 0.35
            c.beginPath()
            c.arc(m.x + m.vx * age, m.y + m.vy * age, 1.6 * cfg.scale, 0, Math.PI * 2)
            c.fill()
          }
          c.restore()
        }
        if (im) {
          // looping projectile sheet, drawn flying along the path
          const h = 70 * cfg.scale * size
          c.translate(x, y)
          c.rotate(ang)
          drawFrame(c, im, Math.floor(p * dur / 60) % 8, (h * im.naturalWidth) / 4 / (im.naturalHeight / 2), h, "center")
          return
        }
        c.shadowColor = color
        c.shadowBlur = 12
        if (kind === "arrow") {
          // shaft, coloured fletching, bright head
          const k = cfg.scale * size
          const L = 24 * k
          c.translate(x, y)
          c.rotate(ang)
          c.lineCap = "round"
          c.strokeStyle = "#f4e6c8"
          c.lineWidth = 2.2 * k
          c.beginPath()
          c.moveTo(-L, 0)
          c.lineTo(0, 0)
          c.stroke()
          c.fillStyle = color
          c.beginPath()
          c.moveTo(-L - 7 * k, -4.5 * k)
          c.lineTo(-L + 6 * k, 0)
          c.lineTo(-L - 7 * k, 4.5 * k)
          c.lineTo(-L - 3 * k, 0)
          c.closePath()
          c.fill()
          c.fillStyle = "#fff"
          c.beginPath()
          c.moveTo(7 * k, 0)
          c.lineTo(-3 * k, -4.5 * k)
          c.lineTo(-1 * k, 0)
          c.lineTo(-3 * k, 4.5 * k)
          c.closePath()
          c.fill()
        } else {
          trail.push({ x, y })
          if (trail.length > 12) trail.shift()
          const R = 9 * cfg.scale * size
          c.fillStyle = color
          trail.forEach((q, k) => {
            c.globalAlpha = (k / trail.length) * 0.5
            c.beginPath()
            c.arc(q.x, q.y, R * (k / trail.length) * 0.9, 0, Math.PI * 2)
            c.fill()
          })
          c.globalAlpha = 1
          const g = c.createRadialGradient(x, y, 0, x, y, R * 1.6)
          g.addColorStop(0, "#fff")
          g.addColorStop(0.3, color)
          g.addColorStop(1, "rgba(0,0,0,0)")
          c.fillStyle = g
          c.beginPath()
          c.arc(x, y, R * 1.6, 0, Math.PI * 2)
          c.fill()
        }
      })
      f.done = onHit
      return f
    }
    // a bow shot leaving: flash and ring at the front of the shooter, sparks spraying forward
    function muzzleFx(src, color, big) {
      const m = mid(src)
      const x = m.x + src.dir * src.s * 0.3
      const y = m.y
      addFx(big ? 320 : 220, (c, p) => {
        const r = src.s * (big ? 0.34 : 0.22) * (0.4 + p)
        const g = c.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, "#fff")
        g.addColorStop(0.35, color)
        g.addColorStop(1, "rgba(0,0,0,0)")
        c.globalCompositeOperation = "lighter"
        c.globalAlpha = 1 - p
        c.fillStyle = g
        c.beginPath()
        c.arc(x, y, r, 0, Math.PI * 2)
        c.fill()
      })
      ringFx(x, y, src.s * 0.05, src.s * (big ? 0.42 : 0.26), color, big ? 320 : 240, 0.55, 2)
      burst(x, y, { n: big ? 12 : 7, color, angle: src.dir > 0 ? 0 : Math.PI, spread: 0.9, speed: 190, gravity: 0, life: 260, size: 2, shape: "shard" })
    }
    // a shot that goes through: a beam from the shooter on past the target to the edge of the stage
    function pierceFx(from, to, color) {
      const dx = to.x - from.x
      const dy = to.y - from.y
      const len = Math.hypot(dx, dy) || 1
      const ex = to.x + (dx / len) * SW
      const ey = to.y + (dy / len) * SW
      addFx(320, (c, p) => {
        c.globalCompositeOperation = "lighter"
        c.globalAlpha = 1 - p
        c.lineCap = "round"
        c.shadowColor = color
        c.shadowBlur = 14
        c.strokeStyle = color
        c.lineWidth = (6 * (1 - p) + 1) * cfg.scale
        c.beginPath()
        c.moveTo(from.x, from.y)
        c.lineTo(ex, ey)
        c.stroke()
        c.strokeStyle = "#fff"
        c.lineWidth = 1.5 * cfg.scale
        c.stroke()
      })
    }
    function slashFx(x, y, r, dir, color, wide = 1) {
      const start = dir > 0 ? -0.85 * Math.PI : -0.15 * Math.PI
      const sweep = 1.15 * Math.PI * wide
      addFx(260, (c, p) => {
        const e = Math.min(1, p * 1.8)
        c.globalCompositeOperation = "lighter"
        c.globalAlpha = 1 - Math.max(0, p - 0.4) / 0.6
        c.shadowColor = color
        c.shadowBlur = 14
        for (let k = 0; k < 3; k++) {
          c.strokeStyle = k === 2 ? "#fff" : color
          c.lineWidth = (7 - k * 2.5) * cfg.scale
          c.beginPath()
          c.arc(x - dir * r * 0.25, y, r * (1 - k * 0.04), start, start + dir * sweep * e, dir < 0)
          c.stroke()
        }
      })
    }
    function thrustFx(x, y, dir, color, len) {
      addFx(200, (c, p) => {
        c.globalCompositeOperation = "lighter"
        c.globalAlpha = 1 - p
        c.strokeStyle = "#fff"
        c.shadowColor = color
        c.shadowBlur = 12
        c.lineWidth = 4 * cfg.scale * (1 - p)
        c.beginPath()
        c.moveTo(x - dir * len, y)
        c.lineTo(x + dir * len * (0.2 + p * 0.4), y)
        c.stroke()
      })
      burst(x, y, { n: 10, color, angle: dir > 0 ? 0 : Math.PI, spread: 1.2, speed: 220, gravity: 120, life: 380, size: 2, shape: "shard" })
    }
    function spikesFx(a, color, delay) {
      const base = a.y
      const offs = [-0.35, -0.12, 0.1, 0.32].map(o => o * a.s)
      addFx(
        520,
        (c, p) => {
          const h = a.s * 0.9 * Math.min(1, p * 4) * (p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1)
          c.globalCompositeOperation = "lighter"
          c.fillStyle = color
          c.shadowColor = color
          c.shadowBlur = 12
          offs.forEach((o, k) => {
            const hh = h * (0.6 + ((k * 37) % 5) / 10)
            c.globalAlpha = 0.85
            c.beginPath()
            c.moveTo(a.x + o - a.s * 0.08, base)
            c.lineTo(a.x + o + (k % 2 ? 0.04 : -0.04) * a.s, base - hh)
            c.lineTo(a.x + o + a.s * 0.08, base)
            c.closePath()
            c.fill()
          })
        },
        delay,
      )
    }
    // shakes the scene inside the stage (slightly zoomed so its edges never show); the stage box stays put
    function shake(amp = 5, dur = 260) {
      worldEl.animate(
        [0, 1, 2, 3, 4, 5].map(k => ({ transform: k === 5 ? "none" : `translate(${(Math.random() - 0.5) * amp * 2}px,${(Math.random() - 0.5) * amp}px) scale(1.03)` })),
        { duration: dur },
      )
    }

    // ----- dom bits -----
    function number(a, text, kind) {
      const n = document.createElement("div")
      const crit = kind === "crit"
      n.className = "bfx-num" + (crit ? " bfx-crit" : "")
      n.textContent = text
      if (crit) n.insertAdjacentHTML("afterbegin", `<small>${zhUI() ? "暴击" : "CRIT"}</small>`)
      n.style.color = kind === "heal" ? "#7dffa5" : kind === "miss" ? "#c8d2e8" : crit ? (a.side === "p" ? "#ff7a4a" : "#ffd23a") : a.side === "p" ? "#ffb0a8" : "#fff"
      n.style.fontSize = 16 * cfg.scale * (crit ? 1.75 : kind === "big" ? 1.25 : 1) + "px"
      worldEl.appendChild(n)
      const x = a.x + (Math.random() - 0.5) * a.s * 0.5
      const y = a.y - a.s * 0.85
      const tr = (dy, s) => `translate(${x}px,${y + dy}px) translate(-50%,-50%) scale(${s})`
      n.animate(
        [
          { transform: tr(0, 0.4), opacity: 0 },
          { transform: tr(-26, crit ? 1.7 : 1.3), opacity: 1, offset: 0.16 },
          { transform: tr(-12, 1), opacity: 1, offset: 0.3 },
          { transform: tr(-16, 1), opacity: 1, offset: 0.8 },
          { transform: tr(-30, 1), opacity: 0 },
        ],
        { duration: crit ? 1400 : 1100, fill: "forwards", easing: "ease-out" },
      ).onfinish = () => n.remove()
    }
    function showBanner(a, ab) {
      const u = shown[a.side][a.i]
      const who = nameOf(a.side, u)
      banner.textContent = (who ? who + "：" : "") + ab.name
      banner.style.color = ab.kind === "heal" ? ELEMENT_COLOR.heal : ab.kind === "damage" ? ELEMENT_COLOR[ab.element] : ELEMENT_COLOR.buff
      banner.getAnimations().forEach(x => x.cancel())
      banner.animate(
        [
          { opacity: 0, transform: "translateX(-50%) translateY(-6px)" },
          { opacity: 1, transform: "translateX(-50%) translateY(0)", offset: 0.12 },
          { opacity: 1, transform: "translateX(-50%) translateY(0)", offset: 0.82 },
          { opacity: 0, transform: "translateX(-50%) translateY(0)" },
        ],
        { duration: 1300 },
      )
    }
    function castPose(a, color, dur, element) {
      setPose(a, "cast", dur + 260)
      a.pose.animate(
        [
          { transform: "translateY(0)", filter: "none" },
          // cast in place: the cast frame already shows the gesture, so only a slight lean and swell
          { transform: `rotate(${a.dir * 2}deg) scale(1.02)`, filter: `brightness(1.3) drop-shadow(0 0 6px ${color})`, offset: 0.6 },
          { transform: "translateY(0)", filter: "none" },
        ],
        { duration: dur + 200, easing: "ease-in-out" },
      )
      circleFx(a, color, dur + 300, element)
      burst(a.x, a.y - a.s * 0.2, { n: 10, color, speed: 60, gravity: -120, life: dur + 200, size: 2.5, spread: 1.6 })
    }

    // ----- lasting effects: aura rings under every ally (stacked outward) + buff / debuff chips -----
    const AURA = { critical_aura: "#ff8a3c", fierce_aura: "#ff3c5a", mystic_aura: "#9a7cff", guardian_aura: "#4aa8ff", speed_aura: "#9cff4a" }
    const sideAuras = { p: {}, m: {} } // aura key -> expiry; recasting the same aura only refreshes it
    function grantAura(side, key) {
      sideAuras[side][key] = now() + (BUFF_SECONDS[key] || 120) * 1000
      actors[side].forEach(renderStatus)
    }
    function addStatus(a, key, kind) {
      a.status[key] = { until: now() + (BUFF_SECONDS[key] || 10) * 1000, kind }
      renderStatus(a)
    }
    // while a self buff lasts the unit keeps a matching glow (up to two stack); invincible adds a shield bubble
    const BUFF_LOOK = {
      berserk: "#ff3b2f", frenzy: "#ffd23c", vampirism: "#b0102a", spike_shell: "#ff8a2a", retribution: "#ffd76a",
      elemental_affinity: "#c77dff", precision: "#5ad6ff", insanity: "#d23cff", provoke: "#ff4040", taunt: "#ff4040", invincible: "#ffe27a",
    }
    function renderLook(a, active) {
      const glows = active.filter(k => BUFF_LOOK[k]).slice(0, 2)
      let filter = glows.map((k, n) => `drop-shadow(0 0 ${5 + n * 4}px ${BUFF_LOOK[k]})`).join(" ")
      if (active.includes("toughness")) filter += " saturate(.55) brightness(.92)"
      a.spriteEl.style.filter = filter.trim()
      a.spriteEl.style.opacity = active.includes("elusiveness") ? "0.72" : ""
      let bubble = a.el.querySelector(".bfx-bubble")
      if (active.includes("invincible") && !bubble) {
        bubble = document.createElement("div")
        bubble.className = "bfx-bubble"
        a.move.appendChild(bubble)
      } else if (!active.includes("invincible")) bubble?.remove()
    }
    function renderStatus(a) {
      const t = now()
      const auras = a.dead ? [] : Object.keys(AURA).filter(k => sideAuras[a.side][k] > t)
      a.ringsEl.replaceChildren(
        ...auras.map((k, n) => {
          const r = document.createElement("div")
          r.className = "bfx-ring"
          const w = a.s * (0.7 + n * 0.16)
          Object.assign(r.style, { width: w + "px", height: w * 0.26 + "px", borderColor: AURA[k], boxShadow: `0 0 8px ${AURA[k]}, inset 0 0 6px ${AURA[k]}`, animationDelay: -n * 0.4 + "s" })
          return r
        }),
      )
      const chips = [...auras.map(k => [k, "buff"]), ...Object.entries(a.status).filter(([, v]) => v.until > t && !a.dead).map(([k, v]) => [k, v.kind])]
      renderLook(a, chips.filter(([, kind]) => kind === "buff").map(([k]) => k))
      a.chipsEl.replaceChildren(
        ...chips.map(([k, kind]) => {
          const c = document.createElement("div")
          c.className = "bfx-chip " + kind
          c.style.background = AURA[k] || ELEMENT_COLOR.buff
          c.textContent = (abilityInfo("/abilities/" + k)?.name || "?")[0]
          return c
        }),
      )
    }
    // effects cast on the same actor back to back queue up instead of piling on top of each other
    function fxSlot(a, dur) {
      const t = now()
      const wait = Math.max(0, a.fxBusyUntil - t)
      a.fxBusyUntil = t + wait + dur * 0.7
      return wait
    }

    // ----- reactions -----
    function impact(a, t, style, element, big, noBurst) {
      const color = ELEMENT_COLOR[element] || ELEMENT_COLOR.physical
      const m = mid(a)
      if (t && !t.dHP && !t.quiet) {
        // miss / zero damage: a quick sidestep instead of a flinch
        a.hit.animate([{ transform: "none" }, { transform: `translateX(${-a.dir * a.s * 0.18}px) translateY(-6%)`, offset: 0.35 }, { transform: "none" }], { duration: 320, easing: "ease-out" })
        number(a, "MISS", "miss")
        return
      }
      if (!t?.died) setPose(a, "hurt", 420)
      a.hit.animate(
        [
          { transform: "translateX(0)" },
          { transform: `translateX(${-a.dir * a.s * 0.12}px) rotate(${-a.dir * 6}deg)`, offset: 0.2 },
          { transform: "translateX(0)" },
        ],
        { duration: 300, easing: "ease-out" },
      )
      a.spriteEl.animate([{ filter: "brightness(3) saturate(0)" }, { filter: "none" }], { duration: 180 })
      if (style === "dot") burst(m.x, m.y, { n: 8, color: "#b77cff", speed: 70, gravity: -60, life: 500, size: 2.5 })
      else if (style === "reflect") burst(m.x, m.y, { n: 12, color: "#ff9a3c", speed: 170, gravity: 0, life: 360, size: 2, shape: "shard" })
      else if (noBurst) {
        // the spell's own effect is the hit
      } else if (!sprite(BURST[element] || "phys_hit", m.x, m.y, a.s * (big ? 1.1 : 0.85), { dur: 520, flip: a.dir > 0 }))
        burst(m.x, m.y, { n: big ? 22 : 14, color, speed: big ? 200 : 150, life: 480 })
      // arrows: splinters thrown on along the line of flight (away from the shooter the target faces)
      if (style === "ranged") burst(m.x, m.y, { n: big ? 12 : 7, color, angle: a.dir > 0 ? Math.PI : 0, spread: 0.8, speed: 210, gravity: 120, life: 320, size: 2, shape: "shard" })
      if (style === "smash" && !sprite("smash", a.x, a.y + a.s * 0.05, a.s * 0.9, { dur: 560, anchor: "bottom" })) {
        ringFx(a.x, a.y, a.s * 0.1, a.s * 0.8, "#fff", 380, 0.3, 4)
        burst(a.x, a.y, { n: 12, color: "#c9b38a", angle: -Math.PI / 2, spread: 2.6, speed: 120, gravity: 300, life: 500, size: 3 })
      }
      if (t?.crit) {
        // critical: a white flash ring and a heavier shake on top of the usual hit
        ringFx(m.x, m.y, a.s * 0.1, a.s * 0.7, "#ffe27a", 300, 0.9, 3)
        a.hit.animate([{ transform: "none" }, { transform: `translateX(${-a.dir * a.s * 0.2}px) rotate(${-a.dir * 10}deg)`, offset: 0.2 }, { transform: "none" }], { duration: 380, easing: "ease-out" })
      }
      if (t && !t.quiet) {
        number(a, fmt(t.dHP), t.crit ? "crit" : big ? "big" : "")
        setHp(a, t)
        if (t.died) later(160, () => die(a))
      }
    }
    function die(a, quiet) {
      if (a.dead) return
      a.dead = true
      a.el.classList.add("bfx-dead")
      a.status = {}
      renderStatus(a)
      const m = mid(a)
      setPose(a, "dead")
      if (!quiet && !sprite("death", m.x, m.y - a.s * 0.15, a.s * 1.1, { dur: 1000 })) burst(m.x, m.y, { n: 18, color: "#ddd", speed: 90, gravity: -80, life: 800, size: 3 })
      if (a.art) {
        // the generated "defeated" frame; monsters then fade out like in Slay the Spire
        setPose(a, "dead")
        a.deathAnim = a.pose.animate(
          a.side === "m"
            ? [{ opacity: 1, filter: "none" }, { opacity: 1, filter: "brightness(1.6)", offset: 0.15 }, { opacity: 1, filter: "grayscale(.6)", offset: 0.6 }, { opacity: 0, filter: "grayscale(1)" }]
            : [{ filter: "none" }, { filter: "grayscale(.7) brightness(.8)" }],
          { duration: quiet ? 1 : a.side === "m" ? 1600 : 700, fill: "forwards", easing: "ease-in" },
        )
        return
      }
      a.deathAnim =
        a.side === "m"
          ? a.pose.animate(
              [
                { opacity: 1, filter: "none", transform: "none" },
                { opacity: 1, filter: "brightness(2.5) sepia(1) hue-rotate(-30deg) saturate(3)", transform: "scale(1.05,.95)", offset: 0.2 },
                { opacity: 0, filter: "brightness(.5) grayscale(1)", transform: "translateY(6%) scale(.85,.6)" },
              ],
              { duration: quiet ? 1 : 900, fill: "forwards", easing: "ease-in" },
            )
          : a.pose.animate(
              [
                { transform: "none", filter: "none" },
                { transform: `translateY(-8%) rotate(${-a.dir * 15}deg)`, offset: 0.25 },
                { transform: `translateX(${-a.dir * 15}%) rotate(${-a.dir * 88}deg) translateY(10%)`, filter: "grayscale(1) brightness(.6)" },
              ],
              { duration: quiet ? 1 : 700, fill: "forwards", easing: "ease-in" },
            )
    }
    function revive(a, quiet) {
      if (!a.dead) return
      a.dead = false
      a.el.classList.remove("bfx-dead")
      a.deathAnim?.cancel()
      a.deathAnim = null
      if (a.art) showFrame(a, "idle")
      setPose(a, "idle")
      if (!quiet && !sprite("revive", a.x, a.y, a.s * 2, { dur: 1100, anchor: "bottom" })) {
        pillarFx(a.x, a.y, a.s * 0.9, a.s * 2.2, "#fff6c0", 900)
        burst(a.x, a.y - a.s * 0.3, { n: 18, color: "#fff6c0", speed: 80, gravity: -140, life: 900, size: 2.5 })
      }
    }

    // ----- actions -----
    function play(actions, src = "live") {
      if (mode !== src || !visible()) return
      if (actors.p.length !== shown.p.length || actors.m.length !== shown.m.length) rebuild()
      for (const act of actions) {
        try {
          run(act)
        } catch (e) {
          console.warn("[战斗动画]", e)
        }
      }
      syncSoon()
    }

    function run(act) {
      const T = now()
      const src = actorOf(act.actor)
      const tg = act.targets.map(t => ({ t, a: actorOf(t) })).filter(x => x.a)
      if (act.effect === "regen") {
        for (const { t, a } of tg) {
          if (t.revived) revive(a)
          if (t.dHP >= 1) number(a, "+" + fmt(t.dHP), "heal")
          setHp(a, t)
        }
        return
      }
      if (!src) {
        for (const { t, a } of tg) impact(a, t, act.style, act.element)
        return
      }
      refreshSprite(src)
      const quick = src.busyUntil > T || src.dead
      const ab = act.ab
      if (ab) showBanner(src, ab)
      let dur
      if (act.effect === "damage") {
        const aoe = ab?.target === "allEnemies" || tg.length > 1
        if (act.style === "magic") dur = magic(src, tg, act.element, ab, quick)
        else if (act.style === "ranged") dur = ranged(src, tg, act.element, aoe, quick, ab)
        else dur = melee(src, tg, act.style, act.element, aoe, quick, !!ab, ab)
        // damage skills that leave a debuff (bleed, armor break, slow, poison...)
        if (ab && BUFF_SECONDS[ab.key]) later(dur * 0.6, () => tg.forEach(({ a }) => addStatus(a, ab.key, "debuff")))
      } else if (act.effect === "heal") dur = heal(src, tg, quick, ab)
      else dur = buff(src, ab, quick)
      src.busyUntil = T + dur
      for (const p of act.procs || []) later(Math.min(dur, 900) * 0.45, () => flashWeapon(actorOf(p), p.color))
    }

    // Every ability has its own generated effect (sheet name = ability key unless renamed):
    //   proj   – flies from the caster (bolts and arrows), bursting on arrival
    //   ground – rises from the target's feet (bottom-anchored)
    //   on     – plays over the target (strikes, self buffs)
    const PROJ = { fireball: "fire_orb", ice_spear: "ice_orb", quick_shot: 1, steady_shot: 1, penetrating_shot: 1, silencing_shot: 1, pestilent_shot: 1, aqua_arrow: 1, flame_arrow: 1 }
    const GROUND = new Set(["entangle", "water_strike", "firestorm", "flame_blast", "natures_veil", "toxic_pollen", "mana_spring", "frost_surge", "rain_of_arrows", "sweep", "fracturing_impact", "rejuvenate", "heal", "berserk", "frenzy", "toughness", "promote", "critical_aura", "fierce_aura", "mystic_aura", "guardian_aura", "speed_aura", "revive"])
    const RENAME = { frost_surge: "ice_spikes" }
    const SIZE = { firestorm: 1.75, mana_spring: 1.6, water_strike: 1.5, flame_blast: 1.5, natures_veil: 1.45, toxic_pollen: 1.4, rain_of_arrows: 1.5, cleave: 1.6, sweep: 1.4, fracturing_impact: 1.2, revive: 2, invincible: 1.5 }
    function fxSpec(ab) {
      if (!ab) return null
      const k = ab.key
      if (PROJ[k]) return { proj: PROJ[k] === 1 ? k : PROJ[k] }
      const spec = { h: SIZE[k] || 1.3, drain: k === "life_drain" }
      spec[GROUND.has(k) ? "ground" : "on"] = RENAME[k] || k
      return spec
    }
    // draws a ground / on spec at actor a; false when its sheet is not available
    function specFx(spec, a, delay = 0, dur = 820) {
      if (!spec || (!spec.ground && !spec.on)) return false
      const m = mid(a)
      return sprite(spec.ground || spec.on, a.x, spec.ground ? a.y + a.s * 0.04 : m.y, a.s * spec.h, { dur, anchor: spec.ground ? "bottom" : "center", delay })
    }
    // AoE: one big effect centred on the whole group instead of a copy on every unit
    function groupFx(spec, group, delay = 0, dur = 900) {
      if (!spec || (!spec.ground && !spec.on) || !group.length) return false
      const xs = group.map(a => a.x)
      const s = Math.max(...group.map(a => a.s))
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2
      const ground = Math.max(...group.map(a => a.y))
      // sheets are 3:4 frames; size them to cover the row, within the stage height
      const h = Math.min(SH * 0.95, Math.max(s * spec.h * 1.2, ((Math.max(...xs) - Math.min(...xs) + s) * 1.05) / 0.75))
      return sprite(spec.ground || spec.on, cx, spec.ground ? ground + s * 0.04 : ground - s * 0.5, h, { dur, anchor: spec.ground ? "bottom" : "center", delay })
    }
    const isAoe = (ab, tg) => ab?.target === "allEnemies" || ab?.target === "allAllies" || tg.length > 1
    const ELEMENT_FX = { fire: { ground: "flame_blast", h: 1.5 }, water: { ground: "water_strike", h: 1.5 }, nature: { ground: "entangle", h: 1.35 } }

    function magic(src, tg, element, ab, quick) {
      const color = ELEMENT_COLOR[element] || ELEMENT_COLOR.physical
      const castT = quick ? 120 : 360
      castPose(src, color, castT, element)
      const spec = ab ? fxSpec(ab) || ELEMENT_FX[element] || { proj: ORB[element] } : { proj: ORB[element] }
      if (isAoe(ab, tg) && (spec.ground || spec.on)) {
        later(castT, () => {
          const shown = groupFx(spec, tg.map(x => x.a))
          tg.forEach(({ t, a }, n) => {
            if (!shown) groundFallback(a, element, color, n * 90)
            later(220 + n * 50, () => impact(a, t, "magic", element, true, shown))
          })
        })
        return castT + 500 + tg.length * 50
      }
      later(castT, () =>
        tg.forEach(({ t, a }, n) => {
          const d = n * 90
          const m = mid(a)
          if (!spec.ground && !spec.on) {
            later(d, () => projectile(mid(src), m, { kind: "orb", color, dur: 380, arc: Math.min(40, SH * 0.12), art: spec.proj }, () => impact(a, t, "magic", element, !!ab)))
            return
          }
          const shown = specFx(spec, a, d)
          if (!shown) groundFallback(a, element, color, d)
          later(d + 200, () => impact(a, t, "magic", element, true, shown))
          // life drain: motes of life float back to the caster
          if (spec.drain)
            for (let k = 0; k < 5; k++) later(d + 260 + k * 70, () => projectile({ x: m.x + (Math.random() - 0.5) * a.s * 0.4, y: m.y }, mid(src), { kind: "orb", color: "#ff5a6a", dur: 420, arc: 30 + k * 6, size: 0.45 }))
        }),
      )
      return castT + 420 + tg.length * 90
    }
    // the old procedural looks, for when an effect sheet has not loaded
    function groundFallback(a, element, color, d) {
      const m = mid(a)
      if (element === "fire") later(d, () => projectile({ x: m.x - a.dir * a.s * 0.9, y: -20 }, m, { kind: "meteor", color, dur: 320, size: 1.3 }))
      else if (element === "water") spikesFx(a, color, d)
      else burst(m.x, m.y, { n: 26, color, speed: 50, gravity: -30, life: 900, size: 4, delay: d })
    }

    // skill shots streak in their own colour; others in the damage type's
    const SHOT_COLOR = { pestilent_shot: "#9be15d", silencing_shot: "#c48cff", steady_shot: "#ffd75a", penetrating_shot: "#fff2c0" }
    function ranged(src, tg, element, aoe, quick, ab) {
      const spec = fxSpec(ab)
      let rainShown = false
      const color = SHOT_COLOR[ab?.key] || (element === "physical" ? "#ffe9b0" : ELEMENT_COLOR[element])
      const drawT = quick ? 60 : 200
      setPose(src, "windup", drawT)
      later(drawT, () => setPose(src, "strike", 320))
      src.pose.animate(
        [{ transform: "none" }, { transform: `translateX(${-src.dir * 8}%) rotate(${-src.dir * 8}deg)`, offset: 0.7 }, { transform: "none" }],
        { duration: drawT + 160, easing: "ease-out" },
      )
      later(drawT, () => {
        muzzleFx(src, color, !!ab)
        tg.forEach(({ t, a }, n) => {
          const m = mid(a)
          if (spec?.ground) {
            const shown = n === 0 ? (rainShown = groupFx(spec, tg.map(x => x.a), 0, 900)) : rainShown
            // a volley streaking down onto each target ahead of the rain effect
            for (let k = 0; k < 3; k++) {
              const to = { x: m.x + (k - 1) * a.s * 0.3, y: a.y - a.s * 0.1 }
              later(n * 50 + k * 70, () => projectile({ x: to.x - a.dir * a.s * 0.8, y: -20 }, to, { kind: "arrow", color, dur: 240 }, () => burst(to.x, to.y, { n: 5, color, life: 280, speed: 90, shape: "shard" })))
            }
            later(260 + n * 50, () => impact(a, t, "ranged", element, true, shown))
          } else if (aoe) {
            for (let k = 0; k < 3; k++) {
              const from = { x: m.x - a.dir * (20 + k * 14), y: -10 - k * 25 }
              const to = { x: m.x + (k - 1) * a.s * 0.25, y: a.y - a.s * 0.15 }
              later(n * 70 + k * 60, () => projectile(from, to, { kind: "arrow", color, dur: 260 }, () => (k === 0 ? impact(a, t, "ranged", element) : burst(to.x, to.y, { n: 5, color, life: 300, speed: 80 }))))
            }
          } else {
            const arc = Math.min(30, SW * 0.04)
            later(n * 70, () =>
              projectile(mid(src), m, { kind: "arrow", color, dur: 300, arc, art: spec?.proj, size: 0.8, trail: ab ? color : null }, () => {
                impact(a, t, "ranged", element, !!ab)
                if (ab?.key === "penetrating_shot") pierceFx(mid(src), m, color)
              }),
            )
            // quick shot: a second arrow right behind the first
            if (ab?.key === "quick_shot") later(n * 70 + 90, () => projectile(mid(src), { x: m.x, y: m.y - a.s * 0.12 }, { kind: "arrow", color, dur: 260, arc, size: 0.7 }, () => burst(m.x, m.y - a.s * 0.12, { n: 6, color, life: 280, speed: 120, shape: "shard" })))
          }
        })
      })
      return drawT + 300 + tg.length * 70
    }

    // melee: run up to the target (or the middle of the group for AoE), strike, run back
    function melee(src, tg, style, element, aoe, quick, isSkill, ab) {
      const spec = fxSpec(ab)
      const color = ELEMENT_COLOR[element] || ELEMENT_COLOR.physical
      if (!tg.length) return 0
      const cx = tg.reduce((s, x) => s + x.a.x, 0) / tg.length
      const cy = tg.reduce((s, x) => s + x.a.y, 0) / tg.length
      const lead = tg[0].a
      const run = quick ? 0 : 230
      const strike = 70
      setPose(src, "windup", run + strike)
      later(run + strike, () => setPose(src, "strike", 300))
      if (!quick) {
        const dx = cx - src.dir * lead.s * (aoe ? 1.1 : 0.75) - src.x
        const dy = cy - src.y
        const D = run + 320 + 250
        src.el.style.zIndex = 4000
        const anim = src.move.animate(
          [
            { transform: "translate(0,0)" },
            { transform: `translate(${dx}px,${dy}px)`, offset: run / D, easing: "ease-in-out" },
            { transform: `translate(${dx}px,${dy}px)`, offset: (run + 320) / D },
            { transform: "translate(0,0)" },
          ],
          { duration: D, easing: "ease-in-out" },
        )
        const z = src.el.style.zIndex
        anim.onfinish = anim.oncancel = () => (src.el.style.zIndex = z)
        // little hop while running
        src.pose.animate(
          [{ transform: "none" }, { transform: "translateY(-12%)", offset: 0.5 }, { transform: "none" }],
          { duration: run, iterations: 1 },
        )
      }
      later(run, () => {
        src.pose.animate(
          [
            { transform: "none" },
            { transform: `rotate(${-src.dir * 14}deg)`, offset: 0.35 },
            { transform: `rotate(${src.dir * 22}deg) translateX(${src.dir * 8}%)`, offset: 0.6 },
            { transform: "none" },
          ],
          { duration: 260, easing: "ease-out" },
        )
        later(strike, () => {
          const groupShown = aoe && spec && groupFx(spec, tg.map(x => x.a), 0, 560)
          for (const { t, a } of tg) {
            const m = mid(a)
            if (groupShown) {
              impact(a, t, style, element, true, true)
              continue
            }
            if (spec && specFx({ ...spec, h: spec.h * (spec.ground ? 1 : 0.95) }, a, 0, 520)) {
              impact(a, t, style, element, true, true)
              continue
            }
            if (style === "stab") sprite("stab", m.x - src.dir * a.s * 0.15, m.y, a.s * 0.75, { dur: 300, flip: src.dir < 0 }) || thrustFx(m.x, m.y, src.dir, color, a.s * 0.6)
            else if (style === "slash" && !aoe) sprite("slash", m.x, m.y, a.s * 1.05, { dur: 320, flip: src.dir < 0 }) || slashFx(m.x, m.y, a.s * 0.5, src.dir, isSkill ? color : "#e8f0ff")
            impact(a, t, style, element, isSkill)
          }
          if (aoe && style === "slash" && !spec) sprite("slash", cx, cy - lead.s * 0.5, lead.s * 1.9, { dur: 360, flip: src.dir < 0 }) || slashFx(cx, cy - lead.s * 0.5, lead.s * 1.2, src.dir, color, 1.1)
          if (style === "smash") shake(isSkill ? 8 : 5)
        })
      })
      return run + 320 + 250
    }

    function heal(src, tg, quick, ab) {
      const spec = fxSpec(ab) || { ground: "heal", h: 1.5 }
      const color = ELEMENT_COLOR.heal
      const castT = quick ? 100 : 300
      castPose(src, color, castT, "heal")
      later(castT, () => {
        const list = tg.length ? tg : [{ a: src, t: null }]
        const groupShown = isAoe(ab, tg) && groupFx(spec, list.map(x => x.a), 0, 1000)
        list.forEach(({ t, a }, n) => {
          if (groupShown) {
            // the big effect covers everyone; numbers still pop per unit below
          } else if (!specFx(spec, a, n * 80 + fxSlot(a, 900), 900)) pillarFx(a.x, a.y, a.s * 0.8, a.s * 1.6, color, 700, n * 80)
          burst(a.x, a.y - a.s * 0.3, { n: 12, color, speed: 50, gravity: -160, life: 900, size: 3, shape: "plus", delay: n * 80 })
          if (t) {
            later(n * 80 + 150, () => {
              if (t.revived) revive(a)
              if (t.dHP > 0) number(a, "+" + fmt(t.dHP), "heal")
              setHp(a, t)
            })
          }
        })
      })
      return castT + 600
    }

    function buff(src, ab, quick) {
      const color = ELEMENT_COLOR.buff
      const castT = quick ? 80 : 240
      castPose(src, color, castT, "buff")
      const allies = ab?.target === "allAllies" ? actors[src.side].filter(a => !a.dead) : [src]
      const spec = fxSpec(ab) || { ground: "buff", h: 1.4 }
      later(castT, () => {
        if (ab && AURA[ab.key]) grantAura(src.side, ab.key)
        else if (ab && BUFF_SECONDS[ab.key]) addStatus(src, ab.key, "buff")
      })
      later(castT, () => {
        if (allies.length > 1 && groupFx(spec, allies, 0, 1000)) return
        allies.forEach((a, n) => {
          if (specFx(spec, a, n * 60 + fxSlot(a, 800), 800)) return
          ringFx(a.x, a.y, a.s * 0.2, a.s * 0.75, color, 600, 0.3, 3, n * 60)
          pillarFx(a.x, a.y, a.s * 0.7, a.s * 1.4, color, 600, n * 60)
          burst(a.x, a.y - a.s * 0.2, { n: 10, color, speed: 40, gravity: -150, life: 800, size: 2.5, delay: n * 60 })
        })
      })
      return castT + 500
    }

    function newBattle(src = "live") {
      if (mode !== src) return
      sideAuras.m = {}
      if (!visible()) return
      setBackground()
      const keepPlayers = shown.p.map(u => u.name).join("|") === playersKey
      rebuild(false)
      if (keepPlayers) actors.p.forEach(a => shown.p[a.i]?.hp > 0 && revive(a, true))
      // monsters walk in from the right
      actors.m.forEach((a, n) =>
        a.move.animate([{ transform: `translateX(${SW * 0.35}px)`, opacity: 0 }, { transform: "translateX(0)", opacity: 1 }], {
          duration: 600,
          delay: n * 90,
          fill: "backwards",
          easing: "ease-out",
        }),
      )
      for (const side of ["p", "m"]) actors[side].forEach(a => (setBars(a), shown[side][a.i]?.hp <= 0 && die(a, true)))
    }

    function start() {
      setInterval(ensureTab, 1000)
      // expire rings and chips
      setInterval(() => mode && ["p", "m"].forEach(side => actors[side].forEach(renderStatus)), 1000)
      Assets.onChange(() => {
        preloadFx()
        if (!mode) return
        if (mode === "live") shown.p.forEach((u, i) => Looks.assign(u, i))
        for (const side of ["p", "m"]) actors[side].forEach(refreshSprite)
        bgKey = ""
        setBackground()
      })
      Doll.onLoad(() => {
        Lab.redraw()
        if (mode) actors.p.forEach(refreshSprite)
      })
    }

    const refreshArt = () => ["p", "m"].forEach(side => actors[side].forEach(a => (a.art = null, a.real = false, a.spriteKey = "", refreshSprite(a))))
    return { play, flashWeapon: (side, i, color) => flashWeapon(actors[side][i], color), newBattle, layout, open, start, ensureTab, injectCss, actors, setBackground, attach, detach, reload, refreshArt, isTestActive: () => active, modeOf: () => mode }
  })()

  // ---------- real battles: the stage laid over the game's unit cards ----------
  // Only BattlePanel_battleArea is covered, so consumables, ability cooldowns and the flee button below
  // stay visible. A button in the panel's corner switches between our view and the original cards.
  const Live = (() => {
    let area = null
    let slot = null
    let btn = null
    function cleanup() {
      slot?.remove()
      btn?.remove()
      if (area) area.style.minHeight = ""
      slot = btn = null
      if (Stage.modeOf() === "live") Stage.detach()
    }
    function ensure() {
      const a = cfg.enabled ? document.querySelector('[class*="BattlePanel_battleArea"]') : null
      if (a !== area) {
        cleanup()
        area = a
      }
      if (!area) return
      const panel = area.closest('[class*="BattlePanel_battlePanel"]') || area.parentElement
      if (!btn?.isConnected) {
        btn = document.createElement("button")
        btn.className = "bfx-toggle"
        btn.addEventListener("click", e => {
          e.stopPropagation()
          cfg.overlay = !cfg.overlay
          saveCfg()
          ensure()
        })
        if (getComputedStyle(panel).position === "static") panel.style.position = "relative"
        panel.appendChild(btn)
      }
      btn.textContent = cfg.overlay ? "切换到原版" : "切换到动画"
      if (!cfg.overlay) {
        slot?.remove()
        slot = null
        area.style.minHeight = ""
        if (Stage.modeOf() === "live") Stage.detach()
        return
      }
      if (!slot?.isConnected) {
        slot = document.createElement("div")
        slot.className = "bfx-live-slot"
        if (getComputedStyle(area).position === "static") area.style.position = "relative"
        area.appendChild(slot)
      }
      area.style.minHeight = cfg.liveH + "px"
      if (!Stage.isTestActive() && !GuildLive.active()) Stage.attach(slot, "live")
    }
    return { ensure }
  })()

  // ---------- guild trials: the stage laid over the trial shown in the guild page's 进行中 tab ----------
  // The trial view lists the members as small MiniUnit cells next to the boss / own CombatUnit cards; the stage
  // covers the smallest visible box holding them all (never one that holds the tab bar).
  const GuildLive = (() => {
    let area = null
    let slot = null
    let btn = null
    const shownEls = sel => [...document.querySelectorAll(sel)].filter(e => e.offsetParent && !e.closest(".bfx-stage"))
    function findArea() {
      const cells = shownEls('[class*="MiniUnit_miniUnit"]')
      if (!cells.length) return null
      const common = els => {
        let a = els[0].parentElement
        while (a && !els.every(e => a.contains(e))) a = a.parentElement
        return a
      }
      const units = shownEls('[class*="CombatUnit_combatUnit"]').filter(e => !e.closest('[class*="BattlePanel_battlePanel"]'))
      const all = common([...cells, ...units])
      return all && !all.querySelector('[role="tablist"]') ? all : common(cells)
    }
    function cleanup() {
      slot?.remove()
      btn?.remove()
      if (area) area.style.minHeight = ""
      slot = btn = null
      if (Stage.modeOf() === "guild") Stage.detach()
    }
    function ensure() {
      const a = cfg.enabled && gunits.p.length ? findArea() : null
      if (a !== area) {
        cleanup()
        area = a
      }
      if (!area) return
      if (!btn?.isConnected) {
        btn = document.createElement("button")
        btn.className = "bfx-toggle"
        btn.addEventListener("click", e => {
          e.stopPropagation()
          cfg.guildOverlay = !cfg.guildOverlay
          saveCfg()
          ensure()
        })
        if (getComputedStyle(area).position === "static") area.style.position = "relative"
        area.appendChild(btn)
      }
      btn.textContent = cfg.guildOverlay ? "切换到原版" : "切换到动画"
      if (!cfg.guildOverlay) {
        slot?.remove()
        slot = null
        area.style.minHeight = ""
        if (Stage.modeOf() === "guild") Stage.detach()
        return
      }
      if (!slot?.isConnected) {
        slot = document.createElement("div")
        slot.className = "bfx-live-slot"
        area.appendChild(slot)
      }
      area.style.minHeight = cfg.guildH + "px"
      if (!Stage.isTestActive()) Stage.attach(slot, "guild")
    }
    return { ensure, active: () => !!slot?.isConnected }
  })()

  const Lab = { units: { p: [], m: [] }, render() {}, stop() {}, redraw() {}, loc: () => null, tier: () => 0 }


  // ---------- menu ----------
  let menuIds = []
  function menu() {
    menuIds.forEach(id => GM_unregisterMenuCommand?.(id))
    const toggle = (key, label, after) =>
      GM_registerMenuCommand(`${cfg[key] ? "✅" : "⬜"} ${label}`, () => {
        cfg[key] = !cfg[key]
        saveCfg()
        after?.()
        menu()
      })
    menuIds = [
      GM_registerMenuCommand(`当前版本 v${GM_info?.script?.version || "?"}`, () => Assets.refresh(true)),
      toggle("enabled", "战斗动画（舞台 / 叠加层）", () => Stage.ensureTab()),
      GM_registerMenuCommand(`动画大小：${cfg.scale}`, () => {
        const v = parseFloat(prompt("动画大小倍率（0.5 ~ 2）", cfg.scale))
        if (v >= 0.3 && v <= 3) {
          cfg.scale = v
          saveCfg()
          Stage.layout()
          menu()
        }
      }),
    ]
  }
  menu()
  Stage.start()
  setInterval(() => (GuildLive.ensure(), Live.ensure()), 1000)
  // always fetch a fresh manifest on page load: a cached one from an older release lacks the new art
  Assets.refresh(true)

  // ---------- websocket hook ----------
  // battle ticks drive the stage; character / profile / item / action messages feed looks and the location
  const WANTED = /^(new_battle|battle_updated|new_guild_battle|guild_battle_updated|labyrinth_updated|init_character_data|profile_shared|items_updated|actions_updated)$|party/
  function onCharacterMessage(obj) {
    Looks.onMessage(obj)
    const act = combatActionIn(obj)
    if (act) {
      where.zone = shortId(act.actionHrid)
      where.tier = act.difficultyTier || 0
      Stage.setBackground()
    }
  }
  // read-only: wraps MessageEvent.data, never changes the message; each event handled once
  const seen = new WeakSet()
  const desc = Object.getOwnPropertyDescriptor(W.MessageEvent.prototype, "data")
  const origGet = desc.get
  desc.get = function () {
    const msg = origGet.call(this)
    try {
      if (typeof msg === "string" && !seen.has(this)) {
        seen.add(this)
        const ws = this.currentTarget
        if (ws instanceof W.WebSocket && ws.url.includes("milkywayidle") && msg.length < 2e7) {
          const type = (/"type":"([a-z_]+)"/.exec(msg.slice(0, 200)) || (msg.length < 20000 && /"type":"([a-z_]+)"/.exec(msg)) || [])[1]
          if (type && WANTED.test(type)) {
            setTimeout(() => {
              try {
                const obj = JSON.parse(msg)
                if (obj.type === "new_battle") onNewBattle(obj)
                else if (obj.type === "battle_updated") onBattleUpdated(obj)
                else if (obj.type === "new_guild_battle") onNewGuildBattle(obj)
                else if (obj.type === "guild_battle_updated") onBattleUpdated(obj, gunits, "guild")
                else if (obj.type === "labyrinth_updated") {
                  // labyrinth fights are ordinary battles; only the backdrop changes
                  where.labyrinth = !!obj.labyrinth?.isActive
                  Stage.setBackground()
                }
                else onCharacterMessage(obj)
              } catch (e) {
              }
            }, 0)
          }
        }
      }
    } catch {}
    return msg
  }
  Object.defineProperty(W.MessageEvent.prototype, "data", desc)

})()
