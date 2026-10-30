// ==UserScript==
// @name         牛牛动起来（开发版）
// @namespace    mwi-battle-fx
// @version      0.21.73
// @license      MIT
// @description  银河奶牛放置（开发版，带动画测试、生活测试面板和录制工具）：战斗换成杀戮尖塔式侧视舞台；生活技能浮动小窗动画；公会生活试炼与迷宫生活房间专属动画。只读游戏消息，不改游戏数据；立绘从素材 CDN 加载。
// @match        https://www.milkywayidle.com/*
// @match        https://milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @match        https://milkywayidlecn.com/*
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/wow121/mwi-battle-fx/main/mwi-battle-fx.user.js
// @downloadURL  https://raw.githubusercontent.com/wow121/mwi-battle-fx/main/mwi-battle-fx.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @connect      cdn.jsdelivr.net
// @connect      raw.githubusercontent.com
// @connect      *
// @grant        unsafeWindow
// @grant        GM_info
// ==/UserScript==

(function () {
  "use strict"
  const W = typeof unsafeWindow !== "undefined" ? unsafeWindow : window

  // DEV: the build (tools/build-release.py) writes the release copy with this false and drops the
  // "#dev" lines / blocks: the 动画测试 lab, debug logging and the developer menu items
  const DEV = true
  // ---------- settings ----------
  const DEFAULTS = { lifeInfo: true, enabled: true, scale: 1, debug: false, stageH: 360, lookMode: "equip", assetBase: "", overlay: true, liveH: 300, guildOverlay: true, guildH: 460, life: true, lifeTown: true, lifeMin: false, lifePos: null, lifeW: 0.2, lifeWm: 0.62, trialOverlay: true, stageEngine: "rig", fxAlpha: 1 }
  const DEFAULT_ASSET_BASE = "https://cdn.jsdelivr.net/gh/wow121/mwi-battle-fx@main"
  // jsDelivr's @main can lag for hours; the manifest (which pins the art commit) comes from GitHub first
  // the art commit this script was released with (publish.sh keeps it current): when raw.githubusercontent.com can't be
  // reached, its manifest on jsDelivr (never stale, unlike @main, whose commit jsDelivr resolves hours late) comes next
  const ASSET_REV = "caf1470507"
  // jsDelivr is DNS-polluted on some networks in China: there the same commit's files come from GitHub via gh-proxy
  const MIRROR = "https://gh-proxy.org/https://raw.githubusercontent.com/wow121/mwi-battle-fx/"
  const MANIFEST_URLS = [
    "https://raw.githubusercontent.com/wow121/mwi-battle-fx/main/assets/manifest.json",
    DEFAULT_ASSET_BASE.replace(/@main$/, "@" + ASSET_REV) + "/assets/manifest.json",
    DEFAULT_ASSET_BASE + "/assets/manifest.json",
    MIRROR + "main/assets/manifest.json",
  ]
  const cfg = { ...DEFAULTS, ...GM_getValue("battle_fx_cfg_v1", {}) }
  const saveCfg = () => GM_setValue("battle_fx_cfg_v1", cfg)

  // ---------- websocket hook (installed first) ----------
  // read-only: wraps MessageEvent.data, never changes the message; each event handled once. It goes in before the
  // rest of the setup so nothing that fails later can keep it out; messages that arrive before the handler at the
  // bottom exists are queued. Other scripts replace window.WebSocket with their own wrapper (e.g. "MWI Combat
  // Simulator 主站一键导入"), so the socket is recognised by its url, not by instanceof WebSocket.
  let onWsMessage = null
  const earlyWs = []
  {
    const seen = new WeakSet()
    const desc = Object.getOwnPropertyDescriptor(W.MessageEvent.prototype, "data")
    const origGet = desc.get
    desc.get = function () {
      const msg = origGet.call(this)
      try {
        if (typeof msg === "string" && msg.length < 2e7 && !seen.has(this)) {
          const ws = this.currentTarget || this.target
          const url = ws && typeof ws.url === "string" ? ws.url : ""
          if (url.includes("milkywayidle")) {
            seen.add(this)
            if (onWsMessage) onWsMessage(msg)
            else if (earlyWs.length < 500) earlyWs.push(msg)
          }
        }
      } catch {}
      return msg
    }
    Object.defineProperty(W.MessageEvent.prototype, "data", desc)
  }

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
  }  // UI text in the game's language: Chinese for a zh UI, English otherwise
  const L = (zh, en) => (zhUI() ? zh : en)

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
    if (cfg.debug) console.log("[战斗动画] new_battle", obj) // #dev
    if (cfg.enabled) Stage.newBattle()
    if (cfg.enabled) Arena.newBattle(units)
  }

  // guild trials: up to ~40 players against the trial boss(es), with their own messages (new_guild_battle /
  // guild_battle_updated) in the same pMap / mMap shape; slot 0 is the viewer
  const gunits = { p: [], m: [] }
  // a player seen casting one of these stands with the tanks
  const TANK_ABILITIES = new Set(["provoke", "taunt", "toughness", "spike_shell", "retribution", "guardian_aura", "invincible"])
  // their places in a guild trial's formation, front to back
  const ROLE_ORDER = ["tank", "melee", "ranged", "magic"]
  const roleOf = u => (u?.tank ? "tank" : u?.style === "ranged" ? "ranged" : u?.style === "magic" ? "magic" : "melee")
  function onNewGuildBattle(obj) {
    gunits.tier = obj.tier ?? gunits.tier
    gunits.p = (obj.players || []).map(unitFrom)
    gunits.m = (obj.monsters || []).map(unitFrom)
    gunits.p.forEach(u => Looks.assignGuild(u))
    if (cfg.enabled) Stage.newBattle("guild")
    if (cfg.enabled) Arena.newBattle(gunits)
  }

  // A trial joined mid-way (or a page reload during one) has no new_guild_battle: units are made up from the
  // update itself, named from the trial view (member cells after the own card; slot 0 = the viewer) and the boss
  // cards; styles are learnt from the skills seen.
  function guildDom() {
    const area = guildArea()
    if (!area) return { names: [], mons: [] }
    const names = [...area.querySelectorAll('[class*="MiniUnit_name"]')].map(e => e.textContent.trim())
    const grid = area.querySelector('[class*="BattlePanel_monstersArea"] [class*="BattlePanel_combatUnitGrid"]')
    const mons = [...(grid?.children || [])].map(c => (c.querySelector('use[href*="combat_monsters"]')?.getAttribute("href") || "").split("#")[1])
    return { names, mons }
  }
  function fillGuildUnits(obj) {
    let dom = null
    let added = false
    for (const side of ["p", "m"]) {
      for (const [k, e] of Object.entries(obj[side + "Map"] || {})) {
        const i = +k
        if (gunits[side][i]) continue
        dom ||= guildDom()
        const own = side === "p" && i === 0 && units.p.find(u => u.name === Looks.me.name)
        const mon = side === "m" ? dom.mons[i] : null
        const u = {
          name: side === "p" ? (i === 0 ? Looks.me.name : dom.names[i - 1]) || `#${i}` : MONSTER_ZH[mon] || mon || "?",
          hrid: mon ? "/monsters/" + mon : null,
          hp: e.cHP ?? 1, mp: e.cMP ?? 0, maxHp: e.mHP || e.cHP || 1, maxMp: e.mMP || 1,
          ability: null, style: own?.style || "slash", element: own?.element || "physical", counters: {}, raw: {}, guessed: true,
        }
        for (let n = 0; n < i; n++) gunits[side][n] ||= { name: side === "p" ? `#${n}` : "?", hp: 1, mp: 0, maxHp: 1, maxMp: 1, style: "slash", element: "physical", counters: {}, raw: {}, guessed: true }
        gunits[side][i] = u
        if (side === "p") Looks.assignGuild(u)
        added = true
      }
    }
    if (added) Stage.syncRoster("guild")
  }

  const other = side => (side === "p" ? "m" : "p")

  // U: the battle the update belongs to (units = own battle, gunits = guild trial); src: the stage mode it plays in
  function onBattleUpdated(obj, U = units, src = "live") {
    if (U === gunits) {
      if (obj.tier !== undefined && obj.tier !== gunits.tier) (gunits.tier = obj.tier), Stage.setBackground()
      fillGuildUnits(obj)
    }
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
        // stunned: the server flags a unit while it is stunned (isStunned, sent only while true, as isBlinded is). The
        // time it began is kept; an update for the unit without the flag, or its death, ends it.
        if (e.isStunned && !c.died) u.stunned ||= Date.now()
        else u.stunned = 0
        // abilityHrid / isAutoAtk describe the NEXT action
        if ("abilityHrid" in e) u.ability = e.abilityHrid || null
        if (TANK_ABILITIES.has(shortId(e.abilityHrid))) u.tank = true
        const st = ABILITIES[shortId(e.abilityHrid)]?.[3]
        if (u.guessed && st) (u.style = st), (u.element = ABILITIES[shortId(e.abilityHrid)][4] || u.element)
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
    if (cfg.debug) console.log("[战斗动画]", JSON.stringify(obj), changes, actions) // #dev
    if (cfg.enabled) Stage.play(actions, src)
    // (the rigged stage, when it is the one laid over this battle)
    if (cfg.enabled && (src === "live" || src === "guild")) Arena.playLive(actions, U)
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
  // The guild page's 进行中 tab shows the running trial in the same BattlePanel as the own battle (its players
  // area holds a guildPartyArea instead of a card grid); both can run at once, so the two are told apart.
  const isGuildArea = a => !!(a.querySelector('[class*="BattlePanel_guildPartyArea"]') || a.closest('[class*="GuildPanel_guildPanel"]'))
  const battleAreas = () => [...document.querySelectorAll('[class*="BattlePanel_battleArea"]')]
  const ownArea = () => battleAreas().find(a => !isGuildArea(a)) || null
  const guildArea = () => battleAreas().find(a => isGuildArea(a) && a.offsetParent) || null
  function cardEl(side, i) {
    const area = ownArea()?.querySelector(side === "p" ? '[class*="BattlePanel_playersArea"]' : '[class*="BattlePanel_monstersArea"]')
    const grid = area?.querySelector('[class*="BattlePanel_combatUnitGrid"]')
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
  // the labyrinth's backdrop by depth: floors 1-4, 5-8, 9-12, 13-16, 17+ (falls back to the one labyrinth backdrop)
  function labyrinthBg(floor) {
    const d = "labyrinth_d" + Math.min(5, Math.max(1, Math.ceil((floor || 1) / 4)))
    return Assets.has("bg", d) ? d : "labyrinth"
  }
  // a fighter's size on a stage SW x SH with n on its side: a row of three (a planet fight of a full party) sets it,
  // so a lone fighter (the labyrinth) is no bigger than one in a party; only a longer row shrinks it to fit
  const unitSize = (SW, SH, n) => Math.min(SH * 0.5, (SW * 0.44) / (1 + 0.72 * (Math.max(n, 3) - 1)))
  function stageLocation() {
    if (where.labyrinth) return labyrinthBg(where.floor)
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
    // an asset base that is just this repo's jsDelivr @main counts as the default: its files and manifest are cached
    // there for up to a week, so they are taken pinned to the manifest's commit like the default's
    const custom = () => !!cfg.assetBase && !/^https:\/\/cdn\.jsdelivr\.net\/gh\/wow121\/mwi-battle-fx@main\/*$/.test(cfg.assetBase)
    const base = () => (custom() ? cfg.assetBase : DEFAULT_ASSET_BASE).replace(/\/+$/, "")
    let source = ""
    function refresh(force) {
      if (loading || (!force && manifest && Date.now() - fetchedAt < 1800e3)) return
      loading = true
      const urls = custom() ? [base() + "/assets/manifest.json"] : MANIFEST_URLS
      const next = k => {
        if (k >= urls.length) return (loading = false)
        GM_xmlhttpRequest({
          method: "GET",
          url: urls[k] + "?t=" + Math.floor(Date.now() / 300e3),
          timeout: 15000,
          onload: r => {
            try {
              manifest = JSON.parse(r.responseText)
              // a manifest taken from a commit before its pin has no rev: it is that commit
              if (!manifest.rev) manifest.rev = (/@([0-9a-f]{7,40})\//.exec(urls[k]) || [])[1]
              // the art commit's own manifest (ASSET_REV, fetched when raw.githubusercontent.com is out of reach)
              // still carries the previous pin: its rev / revs would load the files this commit added or changed
              // from older commits (missing or stale). Everything comes from the art commit itself instead.
              if (urls[k].includes("@" + ASSET_REV + "/")) {
                manifest.rev = ASSET_REV
                delete manifest.revs
              }
              fetchedAt = Date.now()
              source = urls[k]
              loading = false
              GM_setValue("battle_fx_manifest_v1", manifest)
              GM_setValue("battle_fx_manifest_at_v1", fetchedAt)
              listeners.forEach(f => f())
            } catch (e) {
              if (cfg.debug) console.warn("[战斗动画] manifest", urls[k], e) // #dev
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
    // the mirror is taken while jsDelivr can't be reached: checked on page load, and again when an image from it fails
    const JSD = DEFAULT_ASSET_BASE.replace(/@main$/, "@")
    let mirror = GM_getValue("battle_fx_mirror_v1", false)
    let probing = false
    let probedAt = 0
    // jsDelivr counts as down only when two checks in a row fail: a single slow answer (a commit jsDelivr hasn't
    // fetched yet, a busy evening in China) used to flip every image to the slower mirror for good
    function probe(again) {
      if (custom() || (!again && (probing || Date.now() - probedAt < 60e3))) return
      probing = true
      probedAt = Date.now()
      const done = ok => {
        if (!ok && !mirror && !again) return probe(true)
        probing = false
        if (mirror === !ok) return
        mirror = !ok
        GM_setValue("battle_fx_mirror_v1", mirror)
        if (cfg.debug) console.warn("[战斗动画] jsDelivr", ok ? "reachable again" : "unreachable, art from " + MIRROR) // #dev
        // what is on screen but didn't load switches over too (pinned urls only differ in their prefix); what did
        // load stays as it is: moving it to the other host only made it download again, or vanish when that failed
        for (const el of document.querySelectorAll("img")) if (!(el.complete && el.naturalWidth) && el.src.includes(other())) el.src = remap(el.src)
        listeners.forEach(f => f())
      }
      GM_xmlhttpRequest({
        method: "GET",
        url: JSD + (manifest?.rev || ASSET_REV) + "/assets/manifest.json?p=" + Date.now(),
        timeout: 20000,
        onload: r => {
          try {
            done(r.status < 400 && !!JSON.parse(r.responseText))
          } catch (e) {
            done(false)
          }
        },
        onerror: () => done(false),
        ontimeout: () => done(false),
      })
    }
    // the host not in use, and a url moved to the one in use
    const other = () => (mirror ? JSD : MIRROR)
    const remap = src => String(src).split(other()).join(mirror ? MIRROR : JSD)
    // an image of ours that failed: either host failing has the other checked (the mirror failing can mean jsDelivr
    // is back), and the image is asked for again a few times, from whichever host is in use by then: a frame that
    // failed once used to stay blank for the rest of the fight
    const ours = src => !custom() && (String(src).startsWith(JSD) || String(src).startsWith(MIRROR))
    const failed = src => ours(src) && probe()
    const tries = new WeakMap()
    document.addEventListener(
      "error",
      e => {
        const el = e.target
        if (!(el instanceof HTMLImageElement)) return
        const src = el.getAttribute("src") || ""
        if (!ours(src)) return
        failed(src)
        const n = tries.get(el) || 0
        if (n >= 3) return
        tries.set(el, n + 1)
        setTimeout(() => {
          if (el.isConnected && el.getAttribute("src") === src) el.src = remap(src.replace(/[?&]r=\d+$/, "")) + "?r=" + (n + 1)
        }, [2e3, 6e3, 15e3][n])
      },
      true,
    )
    document.addEventListener("load", e => e.target instanceof HTMLImageElement && tries.delete(e.target), true)
    // files come from the commit the manifest was published at, so the CDN can never serve stale art
    // each file from its own last commit (manifest.revs, see tools/pin-manifest.py): its url stays the same across
    // pins until the file itself changes, so the browser's cache keeps it; files not listed come from manifest.rev
    let revOf = null
    let revsOf = null
    function fileRev(path) {
      if (revsOf !== manifest) {
        revsOf = manifest
        revOf = new Map()
        for (const [r, paths] of Object.entries(manifest?.revs || {})) for (const f of paths) revOf.set(f, r)
      }
      return revOf.get(path) || manifest?.rev
    }
    const root = r => (custom() ? base() : mirror ? MIRROR + (r || "main") : r ? JSD + r : base())
    const url = path => root(fileRev(path)) + "/assets/" + path
    return { info: () => ({ rev: manifest?.rev, source, fetchedAt, base: cfg.assetBase || "", mirror }), refresh, probe, failed, has, url, list: kind => manifest?.[kind] || [], get: k => manifest?.[k], onChange: f => listeners.push(f) }
  })()

  // ---------- player looks: by equipment or by avatar + outfit (per-viewer setting) ----------
  const VISIBLE_SLOTS = ["head", "body", "legs", "feet", "hands", "main_hand", "two_hand", "off_hand", "back"]
  const Looks = (() => {
    const me = { name: null, avatar: null, outfit: null, items: {}, enh: {} }
    const profiles = GM_getValue("battle_fx_profiles_v1", {}) // player name -> {avatar, outfit, items, enh}
    const missing = GM_getValue("battle_fx_missing_v1", {}) // look id -> spec, for 导出待生成形象 // #dev
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
    // skill -> { id, enh } of the skilling tools (for the skilling window's guild trials)
    function toolsFrom(list) {
      const out = {}
      for (const it of Array.isArray(list) ? list : Object.values(list || {})) {
        const slot = shortId(it?.itemLocationHrid) || ""
        if (slot.endsWith("_tool") && it.itemHrid) out[slot.replace(/_tool$/, "")] = { id: shortId(it.itemHrid), enh: it.enhancementLevel || 0 }
      }
      return out
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
          profiles[name] = { ...avatarOf(p.sharableCharacter), items: itemsFrom(p.wearableItemMap), enh: enhFrom(p.wearableItemMap), tools: toolsFrom(p.wearableItemMap) }
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
        // #dev-start
        if (m === modes[0] && !missing[id]) {
          missing[id] = { id, ...sp, name: u.name }
          GM_setValue("battle_fx_missing_v1", missing)
        }
        // #dev-end
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
    // #dev-start
    function exportMissing() {
      const list = Object.values(missing).filter(x => !Assets.has("p", x.id))
      GM_setClipboard(JSON.stringify(list, null, 1))
      return list.length
    }
    return { onMessage, assign, assignGuild, exportMissing, me, toolOf: (name, skill) => profiles[name]?.tools?.[skill] || null, profileOf: name => profiles[name] || null }
    // #dev-end
    // #release-start
    // return { onMessage, assign, assignGuild, me, toolOf: (name, skill) => profiles[name]?.tools?.[skill] || null, profileOf: name => profiles[name] || null }
    // #release-end
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
            if (cfg.debug) console.warn("[战斗动画] doll index", e) // #dev
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
      return { url: Assets.url("doll/" + k + ".webp"), rect: [sx, sy, w, h], grip, W, H, mid: !!index.dirs?.[k]?.[1], dir: index.dirs?.[k]?.[0] }
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
.bfx-stage.bfx-hot{cursor:pointer}
.bfx-zoom{display:none;position:absolute;left:4px;top:2px;z-index:20;gap:3px;pointer-events:auto!important}
.bfx-guild .bfx-zoom{display:flex}
.bfx-zoom button{width:22px;height:20px;padding:0;font:13px/18px sans-serif;color:#dfe6ff;background:rgba(20,26,52,.85);border:1px solid #4a5590;border-radius:6px;cursor:pointer}
.bfx-tiny .bfx-name,.bfx-tiny .bfx-chips,.bfx-guild .bfx-p .bfx-hpt{display:none}
.bfx-guild .bfx-p .bfx-name{font-size:1em}
/* names may spill past the unit's width (centred) before they are cut short */
.bfx-name{display:flex;justify-content:center;width:max-content;max-width:170%;margin-left:50%;transform:translateX(-50%)}
.bfx-name>span{min-width:0;overflow:hidden;text-overflow:ellipsis}
.bfx-name>b{flex:none;white-space:pre}
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
/* chips float above the name (growing upward) so a buff never pushes the name and bars down */
.bfx-chips{position:absolute;left:0;right:0;bottom:100%;display:flex;justify-content:center;flex-wrap:nowrap;gap:2px;margin-bottom:2px}
.bfx-chip{width:14px;height:14px;border-radius:50%;font:700 9px/14px sans-serif;text-align:center;color:#1a1a1a;box-shadow:0 0 3px rgba(0,0,0,.8)}
.bfx-chip.debuff{color:#fff;background:#5a1a24!important;border:1px solid #ff5a6a;line-height:12px}
.bfx-chip.more{width:auto!important;padding:0 3px;border-radius:7px;color:#fff;background:rgba(20,24,40,.85);border:1px solid rgba(255,255,255,.35);box-sizing:border-box}
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
/* melee weapon swings by style: slash sweeps from high behind, stab levels the weapon and thrusts, smash goes overhead */
[data-style=slash][data-pose=windup] .bfx-wpn{transform:rotate(-110deg)}
[data-style=slash][data-pose=strike] .bfx-wpn{transform:translate(4px,4px) rotate(100deg)}
[data-style=stab][data-pose=windup] .bfx-wpn{transform:translateX(-12px) rotate(82deg)}
[data-style=stab][data-pose=strike] .bfx-wpn{transform:translateX(16px) rotate(88deg)}
[data-style=smash][data-pose=windup] .bfx-wpn{transform:translateY(-8px) rotate(-125deg)}
[data-style=smash][data-pose=strike] .bfx-wpn{transform:translateY(6px) rotate(125deg)}
/* bulwarks bash: drawn back, then the whole shield shoved forward (no overhead swing) */
.bfx-sprite[data-pose=windup] .bfx-wpn[data-big]{transform:translateX(-6px) rotate(-8deg)}
.bfx-sprite[data-pose=strike] .bfx-wpn[data-big]{transform:translateX(14px) rotate(5deg)}
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
.bfx-arena{position:relative;width:100%;overflow:hidden;border-radius:8px;border:1px solid rgba(255,255,255,.12);color:#dfe6ff;font:13px sans-serif}
.bfx-live-slot>.bfx-arena{position:absolute;inset:0;border-radius:6px}
/* #dev-start */
.bfx-lab{display:flex;flex-direction:column;gap:4px;margin-bottom:6px;font:12px/1.4 sans-serif;color:#dfe6ff}
.bfx-lab .row{display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:4px 6px;background:rgba(255,255,255,.04);border-radius:6px}
.bfx-lab .lbl{min-width:34px;opacity:.7}
.bfx-lab select,.bfx-lab button{font:12px sans-serif;background:#1d2440;color:#dfe6ff;border:1px solid #3a4470;border-radius:4px;padding:2px 6px;max-width:130px}
.bfx-lab button{cursor:pointer}
.bfx-lab button:hover{background:#2a3460}
.bfx-lab button.on{background:#2f6a3a;border-color:#4fa860}
.bfx-lab button.skill{background:#2b2350;border-color:#5a4a9a}
.bfx-lab .gal{display:flex;flex-wrap:wrap;gap:6px}
.bfx-lab .gal figure{margin:0;display:flex;flex-direction:column;align-items:center;background:rgba(0,0,0,.25);border-radius:6px;padding:2px 4px}
.bfx-lab .gal img{width:96px;height:96px}
.bfx-lab .gal label{font-size:11px;cursor:pointer}
.bfx-lab-stage{display:none}
/* #dev-end */`
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
        n.nodeValue = labeled ? "" : L("动画测试", "FX Lab")
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
        '<div class="bfx-view"><div class="bfx-world"><div class="bfx-bg"></div><canvas></canvas></div></div><div class="bfx-banner"></div><div class="bfx-loc"></div><div class="bfx-wait"></div>' +
        '<div class="bfx-zoom"><button data-z="1.25">＋</button><button data-z="0.8">－</button><button data-z="0">⟲</button></div>'
      viewEl = stageEl.querySelector(".bfx-view")
      worldEl = stageEl.querySelector(".bfx-world")
      bgEl = stageEl.querySelector(".bfx-bg")
      canvas = stageEl.querySelector("canvas")
      // (the skill effects drawn on it, as see-through as cfg.fxAlpha)
      canvas.style.opacity = cfg.fxAlpha
      ctx = canvas.getContext("2d")
      banner = stageEl.querySelector(".bfx-banner")
      waitEl = stageEl.querySelector(".bfx-wait")
      locEl = stageEl.querySelector(".bfx-loc")
      waitEl.textContent = L("等待战斗…", "Waiting for battle…")
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
      const res = mode === "guild" && !crowded() ? Math.min(2, Math.ceil(view.z * 2) / 2) : 1
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
      // live: a click on a unit goes on to its game card under the stage, which opens the game's own
      // unit popup (loot, exp, consumables)
      const unitAt = e => {
        if (mode !== "live" || e.target.closest("button")) return null
        let best = null
        for (const side of ["p", "m"])
          for (const a of actors[side]) {
            const r = a.el.getBoundingClientRect()
            const h = a.el.querySelector(".bfx-hud")?.getBoundingClientRect()
            const bottom = Math.max(r.bottom, h?.bottom || 0)
            if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > bottom) continue
            const d = Math.abs(e.clientX - (r.left + r.right) / 2)
            if (!best || d < best.d) best = { a, d }
          }
        return best && cardEl(best.a.side, best.a.i)
      }
      stageEl.addEventListener("click", e => {
        const card = unitAt(e)
        if (!card) return
        e.stopPropagation()
        // the deepest part of the card, so the click bubbles through whichever element listens
        ;(card.querySelector('[class*="CombatUnit_unitIconContainer"]') || card).click()
      })
      stageEl.addEventListener("mousemove", e => stageEl.classList.toggle("bfx-hot", !!unitAt(e)))
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
        text = L("公会试炼", "Guild Trial") + (bosses.length ? " · " + bosses.join(" / ") : "")
        tier = gunits.tier ?? null
      } else if (mode === "test") {
        text = title(Lab.loc())
        tier = Lab.tier()
      } else if (where.labyrinth) text = L("迷宫", "Labyrinth") + (where.floor ? L(` · 第${where.floor}层`, ` · Floor ${where.floor}`) : "")
      else {
        const zone = where.zone && ZONE_ZH[where.zone] ? where.zone : stageLocation()
        text = zone ? title(zone) : ""
        tier = where.tier ?? null
      }
      locEl.style.display = text ? "" : "none"
      locEl.textContent = text
      if (text && tier !== null) locEl.appendChild(tierTag(tier))
    }
    // " T3" coloured by band: normal / elite (T2+) / nightmare (T4+)
    function tierTag(tier) {
      const t = document.createElement("b")
      t.textContent = " T" + tier
      t.style.color = tier >= 4 ? "#ff6a5a" : tier >= 2 ? "#ffcf5a" : "#cfe0ff"
      return t
    }
    // a monster's difficulty: its own from the battle message (spawn tier + chosen tier: dungeon waves mix tiers).
    // Without one, an ordinary zone's tier (all its monsters share it), the trial's or the lab's; none in dungeons
    // and the labyrinth, where the zone tier says nothing about a given monster
    const DUNGEONS = new Set(["chimerical_den", "enchanted_fortress", "pirate_cove", "sinister_circus"])
    function tierOf(u) {
      const own = u?.raw?.difficultyTier
      if (typeof own === "number") return own
      if (mode === "guild") return gunits.tier ?? null
      if (mode === "test") return Lab.tier() ?? null
      return where.labyrinth || DUNGEONS.has(where.zone) ? null : where.tier ?? null
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
      // a backdrop that failed is asked for again with the next update
      img.onerror = () => (Assets.failed(url), bgKey === key && (bgKey = ""))
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
    // two-handed bulwarks are body-sized shields: drawn bigger than the one-handed gear
    const isBulwark = id => /bulwark/.test(id)
    // two-handed melee weapons (glaives, great clubs...) were drawn no longer than the spears: scaled up to a
    // reach of ~470 rig pixels so they out-measure the one-handers; bows and other two-handers keep their size
    const heldScale = (id, pc) =>
      HELD_SCALE *
      (isBulwark(id) ? 1.8 : Doll.slotOf(id) === "two_hand" && !/bow|shooter|boomstick/.test(id) ? Math.max(1, 470 / Math.hypot(pc.rect[2], pc.rect[3])) : 1)
    const PLAYER_SCALE = 0.75
    let glowSeq = 0
    // a big guild roster: effects get cheaper (no canvas shadow blur, fewer sparks, still enhancement auras)
    const crowded = () => mode === "guild" && shown.p.length > 12
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
      const [, tierColor, radius, blur, tierBreathe] = tier
      // crowded: still auras (svg animations repaint the blurred filter on every frame), rainbow shown as gold
      const still = crowded()
      const color = still && tierColor === "rainbow" ? "#ffd75a" : tierColor
      const breathe = still ? 0 : tierBreathe
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
    // build = false: only the key (what the look is made of), so an unchanged look costs no svg work
    function gameLook(i, build = true) {
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
      const key = hrefs.join() + "|" + held.join() + (Doll.ready() ? "|d" : "") + (crowded() ? "|c" : "")
      if (!build) return { key, real: true, build: () => gameLook(i).node }
      const node = svgOf(hrefs)
      const attrs = (el, o) => Object.entries(o).forEach(([k, v]) => el.setAttribute(k, v))
      for (const [cls, id, level] of held) {
        const g = document.createElementNS(SVGNS, "g")
        g.setAttribute("class", cls)
        const pc = Doll.held(id)
        if (pc) {
          // the drawn piece, cropped from its layer sheet, its grip in the hand
          const [hx, hy] = HANDS[cls]
          const k = heldScale(id, pc)
          const box = document.createElementNS(SVGNS, "svg")
          const w = pc.rect[2] * k
          const h = pc.rect[3] * k
          // a bulwark stands on the ground in front of the bearer, pushed out to the front side so its near edge
          // only grazes the face; everything else hangs from the hand
          const [x, y] = isBulwark(id) ? [hx - 15, 98 - h] : [hx - pc.grip[0] * k, hy - pc.grip[1] * k]
          attrs(box, { x, y, width: w, height: h, viewBox: pc.rect.join(" "), overflow: "hidden" })
          const img = document.createElementNS(SVGNS, "image")
          attrs(img, { href: pc.url, width: pc.W, height: pc.H })
          box.appendChild(img)
          if (/crossbow/.test(id) && pc.dir != null) {
            // crossbows were drawn upright like the bows: laid level, bolt toward the enemy, the hand on the stock
            // a third of the way from its butt (the drawn grip sits off the stock, at the bottom corner)
            const lay = document.createElementNS(SVGNS, "g")
            const [cx, cy] = [x + w / 2, y + h / 2]
            lay.setAttribute("transform", `translate(${hx + h * 0.17 - cx} ${hy - 1 - cy}) rotate(${pc.dir - 90} ${cx} ${cy})`)
            lay.appendChild(box)
            g.appendChild(lay)
          } else g.appendChild(box)
          g.style.transformOrigin = `${hx}px ${hy}px`
          if (pc.mid) g.dataset.mid = 1
          if (isBulwark(id)) g.dataset.big = 1
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
      return { key, node, real: true }
    }
    // monsters: sheet + hrid (cards may still show the previous wave); players: their game look
    function spriteFor(side, i) {
      const u = shown[side][i]
      if (side === "p") {
        const look = gameLook(i, false)
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
      if (gameLook(i, false)) return null
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
        // kept on the actor: a preload nobody holds can be dropped before it is ever shown
        a.pre = ["windup", "strike", "hurt", "cast", "dead"].map(p => {
          const im = new Image()
          im.onerror = () => Assets.failed(im.src)
          im.src = frameUrl(a, p)
          return im
        })
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
      a.spriteEl.replaceChildren(sp.node || sp.build())
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
      // the name is cut short when it does not fit, never the tier after it
      const nameEl = el.querySelector(".bfx-name")
      const nm = document.createElement("span")
      nm.textContent = nameOf(side, u)
      nameEl.appendChild(nm)
      const tier = side === "m" ? tierOf(u) : null
      if (tier !== null) nameEl.appendChild(tierTag(tier))
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
      dpr = crowded() ? Math.min(1.5, W.devicePixelRatio || 1) : W.devicePixelRatio || 1
      // zoomed in, effects are drawn at a higher resolution so they stay sharp (not for a crowd)
      cres = mode === "guild" && !crowded() ? Math.min(2, Math.ceil(view.z * 2) / 2) : 1
      // a crowd draws its effects without shadow blur, the costliest canvas operation: an own (no-op)
      // shadowBlur on the context hides the real one
      if (crowded()) Object.defineProperty(ctx, "shadowBlur", { configurable: true, get: () => 0, set: () => {} })
      else delete ctx.shadowBlur
      canvas.width = Math.round(SW * dpr * cres)
      canvas.height = Math.round(SH * dpr * cres)
      // each side stands in a row on the same ground line, first unit nearest the middle;
      // every other unit steps a little back so a crowded row still reads
      // ...high enough that the name and bars under the feet stay inside the stage
      const ground = Math.min(SH * 0.84, SH - 34)
      for (const side of ["p", "m"]) {
        if (side === "p" && mode === "guild") {
          guildLayout(ground)
          continue
        }
        const list = actors[side]
        const n = list.length
        // shrink with the head count so neighbours overlap by at most ~30%
        // players are drawn edge to edge (no frame margin): smaller than the monsters
        const s = unitSize(SW, SH, n) * cfg.scale * (side === "p" ? PLAYER_SCALE : 1)
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
    function guildLayout(ground) {
      const list = actors.p
      const n = list.length
      if (!n) return
      const groups = ROLE_ORDER.map(r => list.filter(a => roleOf(shown.p[a.i]) === r)).filter(g => g.length)
      // as many rows as make the units biggest: the formation must fit the left half across and ~60% of the height
      // (rows step back by a third of a unit), so a tall stage stacks deeper instead of leaving the sky empty
      let rows = 1
      let s = 0
      for (let r = 1; r <= Math.min(8, n); r++) {
        const cols = groups.reduce((c, g) => c + Math.ceil(g.length / r), 0)
        const size = Math.min(SH * 0.4, (SW * 0.44) / (cols * 0.68 + (groups.length - 1) * 0.3 + 0.15 * (r - 1) + 0.9), (SH * 0.62) / (1 + 0.34 * (r - 1)))
        if (size > s * 1.02) (s = size), (rows = r)
      }
      s *= cfg.scale
      const dx = s * 0.68
      const dy = s * 0.34
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
    // a hit landing shows the unit's latest HP, not the one of the update it came from: in a guild trial
    // dozens of hits fly at once and an older, slower one would put the bar back up
    function setHp(a, t) {
      const u = shown[a.side]?.[a.i]
      const hp = u && typeof u.hp === "number" ? u.hp : t.hp
      const max = u?.maxHp || t.maxHp
      a.hpI.style.width = pct(hp, max)
      a.hpT.textContent = `${fmt(hp)}/${fmt(max)}`
    }
    // bars and dead/alive state catch up with the real numbers after the animations
    // (at most 900 ms late: not pushed back by every update, or a guild trial's steady stream never lets it run)
    function syncSoon() {
      if (syncTimer) return
      syncTimer = setTimeout(() => {
        syncTimer = 0
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
      const ps = Array.from({ length: Math.round(n * cfg.scale * (crowded() ? 0.5 : 1)) || 1 }, () => {
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
      const src = Assets.url("fx/" + name + ".webp")
      // a sheet that didn't load is asked for again once its url changes (new manifest, mirror)
      if (!im || (im.src !== src && !(im.complete && im.naturalWidth))) {
        im = fxImgs[name] = new Image()
        im.onerror = () => Assets.failed(src)
        im.src = src
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
          const len = 24 * k
          c.translate(x, y)
          c.rotate(ang)
          c.lineCap = "round"
          c.strokeStyle = "#f4e6c8"
          c.lineWidth = 2.2 * k
          c.beginPath()
          c.moveTo(-len, 0)
          c.lineTo(0, 0)
          c.stroke()
          c.fillStyle = color
          c.beginPath()
          c.moveTo(-len - 7 * k, -4.5 * k)
          c.lineTo(-len + 6 * k, 0)
          c.lineTo(-len - 7 * k, 4.5 * k)
          c.lineTo(-len - 3 * k, 0)
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
      if (crit) n.insertAdjacentHTML("afterbegin", `<small>${L("暴击", "CRIT")}</small>`)
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
      banner.textContent = (who ? who + L("：", ": ") : "") + ab.name
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
      const chips = [...auras.map(k => [k, "buff"]), ...Object.entries(a.status).filter(([, v]) => v.until > t && !a.dead).map(([k, v]) => [k, v.kind])]
      // runs every second for every unit: nothing is rebuilt (and no ring animation restarts) unless it changed
      const sig = auras.join() + "|" + chips.join() + "|" + Math.round(a.s)
      if (sig === a.statusSig) return
      a.statusSig = sig
      a.ringsEl.replaceChildren(
        ...auras.map((k, n) => {
          const r = document.createElement("div")
          r.className = "bfx-ring"
          const w = a.s * (0.7 + n * 0.16)
          Object.assign(r.style, { width: w + "px", height: w * 0.26 + "px", borderColor: AURA[k], boxShadow: `0 0 8px ${AURA[k]}, inset 0 0 6px ${AURA[k]}`, animationDelay: -n * 0.4 + "s" })
          return r
        }),
      )
      renderLook(a, chips.filter(([, kind]) => kind === "buff").map(([k]) => k))
      // one row only, sized to the unit (small units on a phone): what doesn't fit folds into a "+N" chip,
      // so a stack of buffs never covers the sprite
      const size = Math.max(8, Math.min(14, Math.round(a.s * 0.16)))
      const fit = Math.max(1, Math.floor((a.s + 2) / (size + 2)))
      const vis = chips.length > fit ? chips.slice(0, fit - 1) : chips
      const chipEl = (cls, bg, text) => {
        const c = document.createElement("div")
        c.className = "bfx-chip " + cls
        Object.assign(c.style, { width: size + "px", height: size + "px", fontSize: Math.round(size * 0.64) + "px", lineHeight: size - (cls === "debuff" ? 2 : 0) + "px" })
        if (bg) c.style.background = bg
        c.textContent = text
        return c
      }
      a.chipsEl.replaceChildren(
        ...vis.map(([k, kind]) => chipEl(kind, AURA[k] || ELEMENT_COLOR.buff, (abilityInfo("/abilities/" + k)?.name || "?")[0])),
        ...(chips.length > vis.length ? [chipEl("more", "", "+" + (chips.length - vis.length))] : []),
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
            // a spell flies straight at its mark; only arrows lob
            later(d, () => projectile(mid(src), m, { kind: "orb", color, dur: 340, art: spec.proj }, () => impact(a, t, "magic", element, !!ab)))
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
      // each style has its own swing; strike = ms from arriving to the hit
      const swing = MELEE_SWING[style] || MELEE_SWING.slash
      const jabs = style === "stab" && isSkill ? 3 : 1
      const strike = swing.hit + (jabs - 1) * 110
      setPose(src, "windup", run + swing.hit - 50)
      later(run + swing.hit - 50, () => setPose(src, "strike", 300 + (jabs - 1) * 110))
      // stab skills: three quick jabs, the weapon drawn back between them
      for (let k = 1; k < jabs; k++) {
        later(run + swing.hit + (k - 1) * 110 + 40, () => setPose(src, "windup", 60))
        later(run + swing.hit + (k - 1) * 110 + 95, () => setPose(src, "strike", 300))
      }
      if (!quick) {
        const dx = cx - src.dir * lead.s * (aoe ? 1.1 : 0.75) - src.x
        const dy = cy - src.y
        const D = run + strike + 250 + 250
        src.el.style.zIndex = 4000
        const anim = src.move.animate(
          [
            { transform: "translate(0,0)" },
            { transform: `translate(${dx}px,${dy}px)`, offset: run / D, easing: "ease-in-out" },
            { transform: `translate(${dx}px,${dy}px)`, offset: (run + strike + 250) / D },
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
        src.pose.animate(swing.body(src.dir, jabs), { duration: swing.dur + (jabs - 1) * 110, easing: "ease-out" })
        // extra jabs land as thrust flashes before the real hit
        for (let k = 0; k < jabs - 1; k++)
          later(swing.hit + k * 110, () => tg.forEach(({ a }) => sprite("stab", mid(a).x - src.dir * a.s * 0.15, mid(a).y + (k - 0.5) * a.s * 0.12, a.s * 0.6, { dur: 220, flip: src.dir < 0 }) || thrustFx(mid(a).x, mid(a).y, src.dir, color, a.s * 0.5)))
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
      return run + strike + 250 + 250
    }
    // melee body swings (on .bfx-pose); hit = ms into the swing when the blow lands
    const MELEE_SWING = {
      // slash: twist back, then a wide sweep that carries the body forward
      slash: {
        dur: 320,
        hit: 110,
        body: d => [
          { transform: "none" },
          { transform: `rotate(${-d * 18}deg) translateX(${-d * 4}%)`, offset: 0.25 },
          { transform: `rotate(${d * 26}deg) translateX(${d * 12}%)`, offset: 0.5 },
          { transform: "none" },
        ],
      },
      // stab: crouch back, then a straight low lunge (repeated for multi-jab skills), no turning
      stab: {
        dur: 280,
        hit: 150,
        body: (d, jabs) => {
          const out = [{ transform: "none" }, { transform: `translateX(${-d * 8}%) scaleY(.92)`, offset: 0.3 / jabs }]
          for (let k = 0; k < jabs; k++) {
            out.push({ transform: `translateX(${d * 24}%) translateY(4%)`, offset: (0.55 + k) / (jabs + 0.45) })
            if (k < jabs - 1) out.push({ transform: `translateX(${d * 6}%)`, offset: (0.85 + k) / (jabs + 0.45) })
          }
          out.push({ transform: "none" })
          return out
        },
      },
      // smash: leap up winding back, slam down
      smash: {
        dur: 400,
        hit: 270,
        body: d => [
          { transform: "none" },
          { transform: `translateY(-28%) rotate(${-d * 10}deg)`, offset: 0.45 },
          { transform: `translateY(5%) rotate(${d * 8}deg) scaleY(.9)`, offset: 0.68 },
          { transform: "none" },
        ],
      },
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

    // the roster grew (guild trial joined mid-way): new players / monsters, nobody walks in again
    function syncRoster(src) {
      if (mode !== src || !visible()) return
      const key = shown.p.map(u => u.name).join("|")
      if (key !== playersKey || actors.m.length !== shown.m.length) {
        rebuild(false)
        for (const side of ["p", "m"]) actors[side].forEach(a => (setBars(a), shown[side][a.i]?.hp <= 0 && die(a, true)))
        setLocation()
      }
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
    return { sheet, play, syncRoster, flashWeapon: (side, i, color) => flashWeapon(actors[side][i], color), newBattle, layout, open, start, ensureTab, injectCss, actors, setBackground, attach, detach, reload, refreshArt, isTestActive: () => active, modeOf: () => mode }
  })()

  // a phone (a touch screen, or a narrow window): the battle area keeps the game's own height, which it shrinks when the
  // chat opens below; held at the stage's height (cfg.liveH) it pushed the ability and consumable bar off the screen
  const touchLayout = () => matchMedia("(pointer: coarse)").matches || innerWidth < 700
  // ---------- real battles: the stage laid over the game's unit cards ----------
  // Only BattlePanel_battleArea is covered, so consumables, ability cooldowns and the flee button below
  // stay visible. A button in the panel's corner switches between our view and the original cards.
  // Two stages to choose from (cfg.stageEngine, a button in the other corner): "rig", the rigged PixiJS one (Arena,
  // every monster cut into parts and animated), or "classic", the old one (Stage: whole pose pictures, DOM and CSS).
  const Live = (() => {
    let area = null
    let slot = null
    let btn = null
    let engineBtn = null
    let arenaEl = null
    // the own battle as the rigged stage sees it
    const LIVE = { units, loc: () => stageLocation(), tier: () => where.tier || 0, live: true }
    function cleanup() {
      if (arenaEl) Arena.close(arenaEl)
      slot?.remove()
      btn?.remove()
      engineBtn?.remove()
      if (area) area.style.minHeight = ""
      slot = btn = engineBtn = arenaEl = null
      if (Stage.modeOf() === "live") Stage.detach()
    }
    function ensure() {
      const a = cfg.enabled ? ownArea() : null
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
      btn.textContent = cfg.overlay ? L("切换到原版", "Original view") : L("切换到动画", "Battle FX view")
      if (!cfg.overlay) {
        if (arenaEl) Arena.close(arenaEl)
        slot?.remove()
        engineBtn?.remove()
        slot = engineBtn = arenaEl = null
        area.style.minHeight = ""
        if (Stage.modeOf() === "live") Stage.detach()
        return
      }
      if (!slot?.isConnected) {
        // (the stage's styles: the old stage puts them in when it is attached, the new one never is)
        Stage.injectCss()
        slot = document.createElement("div")
        slot.className = "bfx-live-slot"
        if (getComputedStyle(area).position === "static") area.style.position = "relative"
        area.appendChild(slot)
        arenaEl = null
      }
      // the new stage / the old one
      if (!engineBtn?.isConnected) {
        engineBtn = document.createElement("button")
        engineBtn.className = "bfx-toggle bfx-engine"
        engineBtn.addEventListener("click", e => {
          e.stopPropagation()
          setEngine(cfg.stageEngine === "classic" ? "rig" : "classic")
        })
        panel.appendChild(engineBtn)
      }
      engineBtn.textContent = cfg.stageEngine === "classic" ? L("换新版舞台", "New stage") : L("换老版舞台", "Old stage")
      // (left of the other button: the old stage's location badge is in the left corner)
      engineBtn.style.right = btn.offsetWidth + 10 + "px"
      area.style.minHeight = touchLayout() ? "" : cfg.liveH + "px"
      if (Stage.isTestActive() || GuildLive.active()) return
      if (cfg.stageEngine === "classic") {
        if (arenaEl) Arena.close(arenaEl)
        arenaEl?.remove()
        arenaEl = null
        Stage.attach(slot, "live")
      } else {
        if (Stage.modeOf() === "live") Stage.detach()
        if (!arenaEl?.isConnected) {
          arenaEl = document.createElement("div")
          arenaEl.className = "bfx-arena"
          slot.appendChild(arenaEl)
        }
        Arena.open(arenaEl, LIVE)
      }
    }
    function setEngine(v) {
      cfg.stageEngine = v
      saveCfg()
      ensure()
      GuildLive.ensure()
      menuSoon()
    }
    return { ensure, setEngine }
  })()

  // ---------- guild trials: the stage laid over the trial shown in the guild page's 进行中 tab ----------
  const GuildLive = (() => {
    let area = null
    let slot = null
    let btn = null
    let arenaEl = null
    // the trial as the rigged stage sees it (the trial's own backdrop; its tier in the corner badge)
    const GUILD = { units: gunits, loc: () => "guild_trial", tier: () => gunits.tier ?? 0, live: true, guild: true }
    function cleanup() {
      if (arenaEl) Arena.close(arenaEl)
      slot?.remove()
      btn?.remove()
      if (area) area.style.minHeight = ""
      slot = btn = arenaEl = null
      if (Stage.modeOf() === "guild") Stage.detach()
    }
    function ensure() {
      const a = cfg.enabled ? guildArea() : null
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
      btn.textContent = cfg.guildOverlay ? L("切换到原版", "Original view") : L("切换到动画", "Battle FX view")
      if (!cfg.guildOverlay) {
        if (arenaEl) Arena.close(arenaEl)
        slot?.remove()
        slot = arenaEl = null
        area.style.minHeight = ""
        if (Stage.modeOf() === "guild") Stage.detach()
        return
      }
      if (!slot?.isConnected) {
        // (the stage's styles: the old stage puts them in when it is attached, the new one never is)
        Stage.injectCss()
        slot = document.createElement("div")
        slot.className = "bfx-live-slot"
        area.appendChild(slot)
        arenaEl = null
      }
      area.style.minHeight = touchLayout() ? "" : cfg.guildH + "px"
      if (Stage.isTestActive()) return
      // the old stage or the new one, as for the own battle (cfg.stageEngine)
      if (cfg.stageEngine === "classic") {
        if (arenaEl) Arena.close(arenaEl)
        arenaEl?.remove()
        arenaEl = null
        Stage.attach(slot, "guild")
      } else {
        if (Stage.modeOf() === "guild") Stage.detach()
        if (!arenaEl?.isConnected) {
          arenaEl = document.createElement("div")
          arenaEl.className = "bfx-arena"
          slot.appendChild(arenaEl)
        }
        Arena.open(arenaEl, GUILD)
      }
    }
    return { ensure, active: () => !!slot?.isConnected }
  })()

  // ---------- 生活技能: a floating window that plays the current gathering / production / enhancing action ----------
  // Driven by action_completed (end item counts, skills, the action itself) against the inventory from
  // init_character_data: gains / costs are the count changes. The cycle length comes from the header's progress
  // bar text, else from the server times of two completions. Only the game's own sprites so far (avatar + outfit,
  // items, actions, skills); hidden while fighting or idle.
  const Life = (() => {
    const SVGNS = "http://www.w3.org/2000/svg"
    const SKILL = {
      milking: ["挤奶", "Milking", "gather", "squeeze"],
      foraging: ["采摘", "Foraging", "gather", "chop"],
      woodcutting: ["伐木", "Woodcutting", "gather", "chop"],
      cheesesmithing: ["奶酪锻造", "Cheesesmithing", "make", "chop"],
      crafting: ["制作", "Crafting", "make", "chop"],
      tailoring: ["缝纫", "Tailoring", "make", "stitch"],
      cooking: ["烹饪", "Cooking", "make", "stir"],
      brewing: ["冲泡", "Brewing", "make", "stir"],
      alchemy: ["炼金", "Alchemy", "alchemy", "pour"],
      enhancing: ["强化", "Enhancing", "enhancing", "chop"],
    }
    // particles per skill: colours + shape
    const FX = {
      milking: [["#ffffff", "#f3ecd6"], "drop"],
      foraging: [["#7bd35a", "#b6e36b", "#e9d36b"], "leaf"],
      woodcutting: [["#c48a4a", "#8a5a2b", "#e0b47a"], "chip"],
      cheesesmithing: [["#ffb347", "#ffd76a", "#fff3b0"], "spark"],
      crafting: [["#d9a066", "#a8743f"], "chip"],
      tailoring: [["#f6a6d0", "#9ad0ff", "#fff"], "dot"],
      cooking: [["#ffffffb0", "#ffe9c9a0"], "puff"],
      brewing: [["#9be8ff", "#c6a0ff", "#fff"], "bubble"],
      alchemy: [["#d07bff", "#ffe36b", "#7ff0ff"], "spark"],
      enhancing: [["#7fd0ff", "#ffffff", "#ffe36b"], "spark"],
    }
    const BG = {
      gather: "linear-gradient(#8fd0ff 0%,#cfeeff 58%,#7cc36a 58%,#5a9e4a 100%)",
      woodcutting: "linear-gradient(#a9d8b0 0%,#dff2d8 58%,#5e9d4c 58%,#3f7a37 100%)",
      make: "linear-gradient(#5b4636 0%,#7a5d45 60%,#4a3628 60%,#3a2a1f 100%)",
      alchemy: "linear-gradient(#2a1f45 0%,#463370 62%,#2b2140 62%,#1d1630 100%)",
      enhancing: "linear-gradient(#1f2a44 0%,#33456e 62%,#262c3e 62%,#191d2a 100%)",
    }
    // milking / woodcutting / foraging-area actions drawn in the game's actions sheet; single-item foraging uses the item
    const ACTION_ART = new Set("azure_cow burble_cow cow crimson_cow holy_cow unicow verdant_cow arcane_tree birch_tree cedar_tree ginkgo_tree purpleheart_tree redwood_tree tree asteroid_belt burble_beach farmland misty_forest olympus_mons shimmering_lake silly_cow_valley".split(" "))
    const FORAGE_AREA = {"apple":"shimmering_lake","arabica_coffee_bean":"shimmering_lake","asteroid_belt":"asteroid_belt","bamboo_branch":"burble_beach","blackberry":"misty_forest","blueberry":"shimmering_lake","burble_beach":"burble_beach","cocoon":"silly_cow_valley","cotton":"farmland","dragon_fruit":"olympus_mons","egg":"farmland","excelsa_coffee_bean":"silly_cow_valley","farmland":"farmland","fieriosa_coffee_bean":"olympus_mons","flax":"shimmering_lake","liberica_coffee_bean":"burble_beach","marsberry":"olympus_mons","misty_forest":"misty_forest","mooberry":"silly_cow_valley","olympus_mons":"olympus_mons","orange":"misty_forest","peach":"silly_cow_valley","plum":"burble_beach","radiant_fiber":"asteroid_belt","robusta_coffee_bean":"misty_forest","shimmering_lake":"shimmering_lake","silly_cow_valley":"silly_cow_valley","spaceberry":"asteroid_belt","spacia_coffee_bean":"asteroid_belt","star_fruit":"asteroid_belt","strawberry":"burble_beach","sugar":"farmland","wheat":"farmland"}
    // drawn art (assets/life, see tools/make-life-jobs.py); anything missing falls back to the game's sprites
    const art = (kind, id) => !!id && !!Assets.get("life")?.[kind]?.includes(id)
    const artUrl = path => Assets.url("life/" + path + ".webp")
    const COW_POSES = ["idle", "graze", "milked", "startled", "moo", "happy"]
    const TREE_POSES = ["idle", "hit", "swayl", "swayr", "rustle", "leaves"]
    // what a drop is worth a show (per-action chances, game v1.20260927.0): essences 1.7-70%, artisan's crates
    // 0.01-0.19%, meteorite caches 0.02-0.04% (gathering only), the three skill relics 0.0025-0.003%; transmuting
    // can give a philosopher's stone (6.5-58% by item; its crushed shards, 25%, are an ordinary gain)
    const RARE = /treasure_chest|artisans_crate|meteorite_cache|butter_of_proficiency|branch_of_insight|thread_of_expertise|^philosophers_stone$/
    const MINOR = /essence/
    function rarity(id) {
      if (id === "philosophers_stone") return "sage"
      if (/butter_of_proficiency|branch_of_insight|thread_of_expertise/.test(id)) return "legend"
      if (/meteorite_cache/.test(id)) return "meteor"
      if (/artisans_crate|treasure_chest/.test(id)) return "crate"
      return MINOR.test(id) ? "minor" : null
    }
    const RARE_NAMES = {
      small_artisans_crate: ["小工匠匣", "Small Artisan's Crate"],
      medium_artisans_crate: ["中工匠匣", "Medium Artisan's Crate"],
      large_artisans_crate: ["大工匠匣", "Large Artisan's Crate"],
      small_meteorite_cache: ["小陨石舱", "Small Meteorite Cache"],
      medium_meteorite_cache: ["中陨石舱", "Medium Meteorite Cache"],
      large_meteorite_cache: ["大陨石舱", "Large Meteorite Cache"],
      butter_of_proficiency: ["精通之油", "Butter of Proficiency"],
      branch_of_insight: ["洞察之枝", "Branch of Insight"],
      thread_of_expertise: ["专精之线", "Thread of Expertise"],
      philosophers_stone: ["贤者之石", "Philosopher's Stone"],
      crushed_philosophers_stone: ["贤者之石碎片", "Crushed Philosopher's Stone"],
    }
    const rareName = id => (RARE_NAMES[id] ? L(...RARE_NAMES[id]) : id.replace(/_/g, " "))
    const ENH_COLOR = [[15, "#ffd75a"], [12, "#ff5a3c"], [10, "#ffa53a"], [8, "#c07bff"], [5, "#6fb6ff"], [0, "#e8f4ff"]]
    const enhColor = n => ENH_COLOR.find(([k]) => n >= k)[1]
    // how big the enhancing show is: 0 below +5, then +5 / +8 / +10 / +12 / +15
    const enhStage = n => (n >= 15 ? 5 : n >= 12 ? 4 : n >= 10 ? 3 : n >= 8 ? 2 : n >= 5 ? 1 : 0)
    // a colour for the level; from +15 a hue that keeps turning
    const enhTint = n => (n >= 15 ? `hsl(${(performance.now() / 8) % 360},100%,65%)` : enhColor(n))

    const inv = {} // "<location>::<item>::<enh>" -> count
    const tools = {} // skill -> tool item id
    const toolEnh = {} // skill -> its enhancement level
    const skills = {} // skill hrid -> { level, experience }
    let queue = [] // the character's actions, not done, by ordinal
    let cur = null // the running one (queue[0])
    let cycleAt = 0 // performance.now() the current cycle started
    let measured = 0 // seconds between the last two completions (server time)
    let lastDone = null // { id, count, at: server ms }
    const seen = new Set() // duplicate action_completed (the server sometimes sends one twice)
    let enhLevel = 0 // level of the item being enhanced before this attempt
    let el = null
    let raf = 0
    let lastF = 0
    let sceneKey = ""
    let held = null // the drawn tool in the hand: { kind, geo }
    let staged = false // the storage (left) and the materials table (by the station) are drawn
    // the hero walks: in from the left when an action starts, out to the left with the product and back
    const walk = { x: -60, moves: [], action: null, carried: 0 }
    let posed = null // the drawn cow / tree: { kind: "cow" | "tree", imgs: { pose: img }, until, base }

    const skillOf = hrid => (hrid ? String(hrid).split("/")[2] : null)
    const keyOf = it => `${it.itemLocationHrid}::${it.itemHrid}::${it.enhancementLevel || 0}`
    const hashItem = h => {
      const p = String(h || "").split("::")
      return p.length >= 4 ? { id: shortId(p[2]), level: +p[3] || 0 } : null
    }
    const isLife = a => !!a && !!SKILL[skillOf(a.actionHrid)]
    function setItems(list, withTools = true) {
      for (const it of list || []) {
        inv[keyOf(it)] = it.count
        const loc = shortId(it.itemLocationHrid) || ""
        if (withTools && loc.endsWith("_tool")) {
          const s = loc.replace(/_tool$/, "")
          if (it.count > 0) {
            tools[s] = shortId(it.itemHrid)
            toolEnh[s] = it.enhancementLevel || 0
          } else if (tools[s] === shortId(it.itemHrid)) delete tools[s]
        }
      }
    }
    // resume: the page was just loaded mid-action, so the cycle starts where the header's bar is; a newly started
    // action starts at 0 (the bar may still show the previous action, full)
    let lastPlayAt = 0
    let deferTimer = 0
    let deferFrom = 0 // when the running action was first found ended / replaced
    function setQueue(list, resume = false) {
      queue = list.filter(a => !a.isDone).sort((a, b) => (a.ordinal || 0) - (b.ordinal || 0))
      if (trial) return // the trial has the window; the queue takes over when it ends
      const next = queue[0] || null
      clearTimeout(deferTimer)
      // the running skilling action ends or changes: the last completion's show plays out first, and an action that
      // just ended stays a moment longer (its last completion can come after the message that ends it)
      if (!resume && isLife(cur) && next?.id !== cur.id && visible()) {
        const t = performance.now()
        deferFrom ||= t
        // re-checked when the time is up: a late completion in between has its own show to finish
        const wait = Math.max(isLife(next) ? 0 : deferFrom + 1500 - t, lastPlayAt + 3200 - t)
        if (wait > 0) {
          deferTimer = setTimeout(() => setQueue(queue), wait)
          return
        }
      }
      deferFrom = 0
      if (next?.id !== cur?.id) {
        if (next?.actionHrid !== cur?.actionHrid) measured = 0
        cur = next
        enhLevel = hashItem(cur?.primaryItemHash)?.level || 0
        cycleAt = performance.now() - (resume ? domProgress() * dur() * 1000 : 0)
        lastDone = null
      } else cur = next
      ensure()
    }

    // ----- trials: guild skilling trials and labyrinth skilling rooms -----
    // Not actions: new_guild_skilling / guild_skilling_updated and labyrinth_room_progress carry one attempt each
    // (actionCounter), its success rate, double-progress chance, progress per attempt, the work done / needed, the
    // attempt's time and for enhancing the current / target level. Which skill a labyrinth room is comes from the
    // labyrinth's room grid (path[0] is where the character is). The scene has no storage (a trial takes nothing
    // from the inventory); a guild trial has its project's site as the backdrop, a labyrinth room the depth's.
    let trial = null // { from, key, skill, title, data, at, ended }
    const guildChars = {} // character id -> { name, avatarHrid, avatarOutfitHrid, ... } (the guild's members)
    let myId = null
    // the other guild members in this trial, with their looks (their tools are not sent: they hold the viewer's)
    const trialMates = () => (trial?.from === "guild" ? (trial.data.participantIds || []).filter(id => id !== myId).slice(0, 60) : [])
    let labyrinth = null
    const labPath = () => {
      try {
        const p = labyrinth?.pathData
        return (Array.isArray(p) ? p : JSON.parse(p || "[]"))[0] || null
      } catch {
        return null
      }
    }
    function labRoom() {
      const p = labPath()
      const room = p && labyrinth?.roomData?.[p.y]?.[p.x]
      return room ? { ...room, key: `${p.x},${p.y}` } : null
    }
    // the cow / tree / field / product shown for a trial of this skill: the best one the character's level allows
    function trialActionId(skill, level) {
      const g = gameData()
      if (SKILL[skill][2] !== "gather") return skill + "_essence"
      let best = { milking: "cow", woodcutting: "tree", foraging: "farmland" }[skill]
      let bestLv = -1
      for (const [k, a] of Object.entries(g?.actions || {})) {
        const id = shortId(k)
        if (skillOf(k) !== skill || !ACTION_ART.has(id) || a.level > level || a.level < bestLv) continue
        best = id
        bestLv = a.level
      }
      return best
    }
    // a guild trial and a labyrinth room can run at the same time: each keeps its own state from its own messages,
    // and the scene shows the one whose panel is on screen (pickTrial)
    const trials = {} // "guild" | "lab" -> { from, key, skill, title, data, at, ended, cur }
    function onTrial(from, obj) {
      let skill
      let key
      let title
      const old = trials[from]
      if (from === "guild") {
        skill = shortId(obj.trialHrid)
        key = `guild:${obj.trialHrid}:${obj.tier}`
        title = `${L("公会试炼", "Guild trial")} · ${L(...(SKILL[skill] || [skill, skill]).slice(0, 2))} T${obj.tier}`
      } else {
        const room = labRoom()
        skill = shortId(room?.skillHrid) || old?.skill
        key = room ? `lab:${room.key}` : old?.key
        title = `${L("迷宫", "Labyrinth")} · ${L(...(SKILL[skill] || [skill, skill]).slice(0, 2))}${room?.recommendedLevel ? " Lv." + room.recommendedLevel : ""}`
      }
      if (!SKILL[skill] || !key) return
      let t = old
      if (t && t.key !== key) {
        // the next tier / room: the one before is through, its show plays out first
        if (!t.ended) trialEnd(t, true)
        const wait = 3000 - (performance.now() - t.ended)
        if (wait > 0) return later(wait, () => onTrial(from, obj))
        t = null
      }
      if (!t) {
        const id = trialActionId(skill, skills["/skills/" + skill]?.level || 1)
        t = trials[from] = { from, key, skill, title, data: obj, at: performance.now(), ended: 0 }
        t.cur = { id: "trial:" + key, trial: true, actionHrid: `/actions/${skill}/${id}`, currentCount: obj.actionCounter || 0, hasMaxCount: false, primaryItemHash: SKILL[skill][2] === "gather" ? "" : `0::/item_locations/inventory::/items/${skill}_essence::${obj.currentEnhLevel || 0}` }
        ensure()
        trialFinish(t, obj)
        return
      }
      const prev = t.data
      t.data = obj
      t.at = performance.now()
      if ((obj.actionCounter || 0) <= (prev.actionCounter || 0)) return
      t.cur = { ...t.cur, currentCount: obj.actionCounter }
      if (t === trial) {
        cur = t.cur
        measured = (obj.actionTimeMs || 0) / 1000 || measured
        cycleAt = performance.now()
        if (visible() && !cfg.lifeIcon) playTrial(prev, obj)
        else enhLevel = obj.currentEnhLevel || 0
      }
      trialFinish(t, obj)
    }
    // the trial to show: the one whose panel is on screen (the test panel's in the window)
    function pickTrial() {
      for (const from of ["lab", "guild"]) if (trials[from] && trialHost(trials[from])) return trials[from]
      if (labState) return trials.lab || trials.guild || null // #dev
      return null
    }
    // one attempt: progress gained (doubled), failed, or for enhancing the level gone up / down
    function playTrial(prev, obj) {
      lastPlayAt = performance.now()
      setScene()
      const [cx, cy] = targetAt()
      const skill = trial.skill
      if (obj.targetLevel !== null && obj.targetLevel !== undefined) {
        const b = prev.currentEnhLevel || 0
        const a = obj.currentEnhLevel || 0
        enhLevel = a
        cur = trial.cur = { ...cur, primaryItemHash: `0::/item_locations/inventory::/items/${skill}_essence::${a}` }
        showEnh()
        if (trial.from === "lab") roomEvent(a > b, false)
        trialStage(true)
        if (a > b) enhSuccess(b, a)
        else enhFail(b, a, false)
        return
      }
      const gain = (obj.currentWorkValue || 0) - (prev.currentWorkValue || 0)
      const double = gain > 0 && obj.progressPerAction && gain >= obj.progressPerAction * 1.9
      if (trial.from === "lab") roomEvent(gain > 0, double)
      trialStage(true)
      const who = trial.from === "guild" ? memberAct(gain > 0) : null
      if (who) {
        // one of the guild: the strike lands on the project, the progress rises from them
        const [mx, my] = boxAt(who.el)
        if (gain > 0) {
          later(480, () => {
            if (!tstage) return
            const [px, py] = boxAt(tstage.project)
            burst(skill, px + (mx < px ? -30 : 30), py + 10, double ? 14 : 7, double)
            produceArc(mx, my)
            tstage.project.animate([{ transform: "translateX(0)" }, { transform: `translateX(${mx < px ? 2 : -2}px)` }, { transform: "translateX(0)" }], { duration: 200 })
          })
          pop(`+${fmt(gain)}`, mx - 10, my - 40, 0, -30, 1400, { color: "#ffd75a", size: double ? 15 : 12, glow: double ? "#ffb300" : null, delay: 450 })
          if (double) later(450, () => banner(L("双倍进度！", "Double progress!")))
        } else pop(L("失败", "Failed"), mx - 12, my - 40, 0, -20, 1100, { color: "#ff7a6a", size: 11, delay: 200 })
        return
      }
      if (gain > 0) {
        pop(`+${fmt(gain)} ${L("进度", "progress")}`, cx - 20, cy - 30, 30, -60, 1500, { color: "#ffd75a", size: double ? 15 : 13, glow: double ? "#ffb300" : null })
        burst(skill, cx, cy - 20, double ? 16 : 8, double)
        if (double) banner(L("双倍进度！", "Double progress!"))
        if (posed) setPose(posed.kind === "cow" ? "happy" : "rustle", 900)
      } else {
        pop(L("失败", "Failed"), cx - 14, cy - 30, 0, -30, 1100, { color: "#ff7a6a", size: 13 })
        el.querySelector(".bfxl-target").animate([{ transform: "translateX(0)" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(0)" }], { duration: 300 })
      }
    }
    // the trial is through: work done, or the target level reached
    function trialFinish(t, obj) {
      if (!t || t.ended) return
      const done = obj.targetLevel !== null && obj.targetLevel !== undefined ? (obj.currentEnhLevel || 0) >= obj.targetLevel : obj.targetWorkValue > 0 && obj.currentWorkValue >= obj.targetWorkValue
      if (done) trialEnd(t, true)
    }
    function trialEnd(t, ok, why) {
      if (!t || t.ended) return
      t.ended = performance.now()
      if (t === trial && visible() && !cfg.lifeIcon) {
        trialFinale(ok)
        const [cx, cy] = targetAt()
        const b = banner(ok ? (t.from === "guild" ? L("试炼完成！", "Trial cleared!") : L("房间通关！", "Room cleared!")) : why || L("试炼结束", "Trial over"), ok ? "#ffd75a" : "#ff7a6a")
        if (ok) {
          b?.classList.add("bless")
          burst("enhancing", cx, cy - 20, 24, true)
          FX.fireworks ||= [["#ff4d4d", "#ffb84d", "#fff04d", "#4dff88", "#4dc3ff", "#b84dff"], "spark"]
          for (let i = 0; i < 3; i++) later(250 + i * 300, () => burst("fireworks", cx + (Math.random() - 0.5) * 140, cy - 20, 12, true))
        }
      }
      later(3200, () => {
        if (trials[t.from] === t) delete trials[t.from]
        ensure()
      })
    }
    // the labyrinth moved on: the character left the room (cleared above, or failed / gave up)
    function trialCheckRoom() {
      const t = trials.lab
      if (!t || t.ended) return
      const room = labRoom()
      if (!labyrinth?.isActive || !room || `lab:${room.key}` !== t.key || room.roomType !== "/labyrinth_room_types/skilling") trialEnd(t, false, L("离开房间", "Left the room"))
    }
    // the guild's trial state: this skill's party done (or the trials closed)
    function trialCheckGuild(obj) {
      const t = trials.guild
      if (!t || t.ended) return
      let data
      try {
        data = JSON.parse(obj.guild?.currentTrialsData || "{}")
      } catch {
        return
      }
      const party = data?.skilling?.parties?.["/guild_skilling/" + t.skill]
      if (party?.done || (data?.skilling && data.skilling.status !== "in_progress")) trialEnd(t, !!party?.done && (party.highestTier || 0) >= (t.data.tier || 1), L("试炼结束", "Trial over"))
    }
    // a trial that went quiet (timed out, page asleep): wound up
    function trialTick() {
      for (const t of Object.values(trials)) {
        if (t.ended) continue
        const d = t.data
        const quiet = performance.now() - t.at > Math.max(15000, 4 * (d.actionTimeMs || 0))
        const timedOut = d.timeoutAt && Date.now() > Date.parse(d.timeoutAt)
        if (timedOut) trialEnd(t, false, L("时间到", "Time's up"))
        else if (quiet) trialEnd(t, false)
      }
    }
    function trialLines() {
      const d = trial.data
      const pct = v => (Math.round((v || 0) * 1000) / 10).toString() + "%"
      const line1 = [`⏱ ${((d.actionTimeMs || 0) / 1000).toFixed(2)}s`, `${L("成功率", "Success")} ${pct(d.successRate)}`]
      if (d.efficiency) line1.push(`${L("效率", "Efficiency")} +${pct(d.efficiency)}`)
      const line2 = []
      if (d.targetLevel !== null && d.targetLevel !== undefined) line2.push(`${L("目标", "Target")} +${d.targetLevel}`, `${L("当前", "Now")} +${d.currentEnhLevel || 0}`)
      else line2.push(`${L("每次进度", "Per attempt")} ${fmt(d.progressPerAction || 0)}`)
      line2.push(`${L("双倍进度", "Double progress")} ${pct(d.doubleProgressChance)}`, `${L("次数", "Attempts")} ${d.actionCounter || 0}`)
      return [line1, line2]
    }
    // the trial's own bar: work done / needed (or levels), time left
    function showTrialBar() {
      if (el) showSeal()
      const bar = el?.querySelector(".bfxl-tbar")
      if (!bar) return
      bar.style.display = trial ? "" : "none"
      if (!trial) return
      const d = trial.data
      const enh = d.targetLevel !== null && d.targetLevel !== undefined
      const k = enh ? (d.currentEnhLevel || 0) / (d.targetLevel || 1) : d.targetWorkValue ? (d.currentWorkValue || 0) / d.targetWorkValue : d.currentProgress || 0
      bar.querySelector("i").style.width = Math.min(100, k * 100) + "%"
      let left = ""
      if (d.timeoutAt) {
        const s = Math.max(0, Math.round((Date.parse(d.timeoutAt) - Date.now()) / 1000))
        left = ` · ${L("剩余", "left")} ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
      }
      bar.querySelector("span").textContent = (enh ? `+${d.currentEnhLevel || 0} / +${d.targetLevel}` : `${fmt(d.currentWorkValue || 0)} / ${fmt(d.targetWorkValue || 0)} (${(k * 100).toFixed(1)}%)`) + left
    }

    // ----- the game's header: the action's name, its seconds per action and how far the bar is -----
    const headerName = () => document.querySelector('[class*="Header_actionName"]')
    const headerScope = () => headerName()?.parentElement?.parentElement || null
    function domSeconds() {
      const t = headerScope()?.querySelector('[class*="ProgressBar_text"]')?.textContent || ""
      const m = /(\d+(?:\.\d+)?)\s*s/.exec(t)
      const v = m ? +m[1] : 0
      return v >= 0.5 && v <= 3600 ? v : 0
    }
    function domProgress() {
      const bar = headerScope()?.querySelector('[class*="ProgressBar_innerBar"]')
      const w = bar?.parentElement?.getBoundingClientRect().width
      return bar && w ? Math.max(0, Math.min(1, bar.getBoundingClientRect().width / w)) : 0
    }
    const dur = () => measured || domSeconds() || 6
    function actionName() {
      if (trial) return trial.title
      // #dev-start
      if (labState) return `${SKILL[labState.skill][0]} - ${(LAB_ACTIONS[labState.skill].find(a => a[0] === labState.act) || [, labState.act])[1]}（测试）`
      // #dev-end
      const t = (headerName()?.querySelector('[class*="Header_displayName"]') || headerName())?.textContent || ""
      const clean = t.replace(/\s*\[.*$/, "").trim()
      if (clean) return clean
      const id = shortId(cur?.actionHrid) || ""
      return id.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    }

    // ----- messages -----
    function onMessage(obj) {
      if (obj.guildSharableCharacterMap) Object.assign(guildChars, obj.guildSharableCharacterMap)
      if (obj.type === "chat_message_received") return townVisitor(obj.message)
      if (visitors.length && (obj.type === "profile_shared" || obj.guildSharableCharacterMap)) restyleVisitors()
      setHouses(obj)
      if (obj.type === "init_character_data") {
        myId = obj.character?.id ?? myId
        for (const k of Object.keys(inv)) delete inv[k]
        for (const k of Object.keys(tools)) delete tools[k]
        setItems(obj.characterItems)
        setBuffMaps(obj)
        for (const s of obj.characterSkills || []) skills[s.skillHrid] = { level: s.level, experience: s.experience }
        cur = null
        setQueue(obj.characterActions || [], true)
      } else if (obj.type === "actions_updated") {
        // #dev-start
        if (labState) {
          const byId = Object.fromEntries(labState.saved.queue.map(a => [a.id, a]))
          for (const a of obj.endCharacterActions || []) byId[a.id] = a
          labState.saved.queue = Object.values(byId).filter(a => !a.isDone)
          return
        }
        // #dev-end
        const byId = Object.fromEntries(queue.map(a => [a.id, a]))
        for (const a of obj.endCharacterActions || []) byId[a.id] = a
        setQueue(Object.values(byId))
      } else if (obj.type === "items_updated") {
        setItems(obj.endCharacterItems)
      } else if (/buff|house/.test(obj.type)) {
        setBuffMaps(obj)
      } else if (obj.type === "new_guild_skilling" || obj.type === "guild_skilling_updated") {
        onTrial("guild", obj)
      } else if (obj.type === "labyrinth_room_progress") {
        onTrial("lab", obj)
      } else if (obj.type === "labyrinth_updated") {
        labyrinth = obj.labyrinth || labyrinth
        trialCheckRoom()
      } else if (obj.type === "guild_updated") {
        trialCheckGuild(obj)
      } else if (obj.type === "action_completed") {
        // #dev-start
        if (labState) return setItems(obj.endCharacterItems)
        // #dev-end
        onCompleted(obj)
      }
    }
    function onCompleted(obj) {
      const a = obj.endCharacterAction
      if (!a) return
      const key = `${a.id}|${a.currentCount}|${a.updatedAt}`
      if (seen.has(key)) return
      seen.add(key)
      if (seen.size > 200) seen.delete(seen.values().next().value)
      // item count changes, before the inventory takes the new counts
      const gains = []
      const costs = []
      for (const it of obj.endCharacterItems || []) {
        if (shortId(it.itemLocationHrid) !== "inventory") continue
        const d = it.count - (inv[keyOf(it)] || 0)
        const g = { id: shortId(it.itemHrid), level: it.enhancementLevel || 0, n: Math.abs(d) }
        if (d > 0) gains.push(g)
        else if (d < 0) costs.push(g)
      }
      setItems(obj.endCharacterItems)
      const ups = []
      let exp = 0
      for (const s of obj.endCharacterSkills || []) {
        const old = skills[s.skillHrid]
        if (s.skillHrid !== "/skills/total_level" && old) {
          exp += Math.max(0, s.experience - old.experience)
          if (s.level > old.level) ups.push([shortId(s.skillHrid), s.level])
        }
        skills[s.skillHrid] = { level: s.level, experience: s.experience }
      }
      const i = queue.findIndex(x => x.id === a.id)
      if (i >= 0) queue[i] = a
      if (cur?.id === a.id) cur = a
      if (!isLife(a) || trial) return
      if (cur?.id !== a.id) setQueue(queue)
      // the cycle: server time between two completions of this action
      const at = Date.parse(a.updatedAt)
      if (lastDone?.id === a.id && a.currentCount === lastDone.count + 1 && at > lastDone.at) {
        const s = (at - lastDone.at) / 1000
        if (s >= 0.5 && s <= 3600) measured = s
      }
      lastDone = { id: a.id, count: a.currentCount, at }
      cycleAt = performance.now()
      const before = enhLevel
      enhLevel = hashItem(a.primaryItemHash)?.level ?? enhLevel
      if (!visible()) return
      if (inTown()) return townDone(skillOf(a.actionHrid), gains)
      if (cfg.lifeIcon) {
        const big = gains.some(g => ["sage", "legend", "meteor", "crate"].includes(rarity(g.id)))
        el.querySelector(".bfxl-ico").animate([{ transform: "scale(1)" }, { transform: `scale(${big ? 1.5 : 1.15})`, filter: big ? "drop-shadow(0 0 10px #ffd75a)" : "none" }, { transform: "scale(1)" }], { duration: big ? 1200 : 350 })
        return
      }
      play({ skill: skillOf(a.actionHrid), gains, costs, exp, ups, enh: [before, enhLevel], action: a })
    }

    // ----- the window -----
    const sheet = name => Stage.sheet(name)
    function svgUse(sheetName, id, cls) {
      const s = document.createElementNS(SVGNS, "svg")
      s.setAttribute("viewBox", "0 0 100 100")
      if (cls) s.setAttribute("class", cls)
      const url = id && sheet(sheetName)
      if (url) {
        const u = document.createElementNS(SVGNS, "use")
        u.setAttribute("href", url + "#" + id)
        s.appendChild(u)
      }
      return s
    }
    const visible = () => !!el && el.style.display !== "none" && !document.hidden
    function injectCss() {
      if (document.getElementById("bfxl-css")) return
      const st = document.createElement("style")
      st.id = "bfxl-css"
      st.textContent = `
.bfxl{position:fixed;z-index:1100;width:340px;border-radius:10px;overflow:hidden;background:#1b2033;color:#eee;
  box-shadow:0 6px 24px #0008;font:12px/1.3 sans-serif;user-select:none}
.bfxl.docked{position:absolute;left:0;top:0;right:0;bottom:0;width:auto!important;border-radius:0;box-shadow:none;z-index:15}
.bfxl.docked .bfxl-size,.bfxl.docked .bfxl-min,.bfxl.docked .bfxl-x,.bfxl.docked .bfxl-grip{display:none}
.bfxl.docked .bfxl-head{cursor:default;padding-right:110px}
.bfxl-grip{position:absolute;right:0;bottom:0;width:14px;height:14px;cursor:nwse-resize;z-index:5;background:linear-gradient(135deg,transparent 50%,#8a93b8 50%,#8a93b8 60%,transparent 60%,transparent 72%,#8a93b8 72%,#8a93b8 82%,transparent 82%)}
.bfxl.icon .bfxl-grip{display:none}
.bfxl-head{display:flex;align-items:center;gap:6px;padding:4px 6px 4px 9px;background:#262d47;cursor:move}
.bfxl-name{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
.bfxl-count{opacity:.75;white-space:nowrap}
.bfxl-head button{background:none;border:0;color:#ccd;cursor:pointer;font-size:14px;line-height:1;padding:0 3px}
.bfxl-head button:hover{color:#fff}
.bfxl-head,.bfxl-grip,.bfxl-ico{touch-action:none}
@media (pointer:coarse){
.bfxl-head{padding:3px 4px 3px 9px;gap:2px}
.bfxl-head button{font-size:17px;padding:5px 7px}
.bfxl-grip{width:24px;height:24px}
}
.bfxl.min .bfxl-view,.bfxl.min .bfxl-bar{display:none}
.bfxl-view{position:relative;overflow:hidden;height:150px}
.bfxl-scene{position:relative;width:340px;height:150px;overflow:hidden;transform-origin:0 0;background:var(--bfxl-bg)}
.bfxl.docked .bfxl-view{background:var(--bfxl-bg)}
.bfxl.docked .bfxl-scene{background:none;overflow:visible}
.bfxl-scene svg{position:absolute;overflow:visible}
.bfxl-hero{position:absolute;left:62px;bottom:10px;width:96px;height:96px}
.bfxl-hero>svg{left:0;top:0;width:100%;height:100%}
.bfxl-tool{position:absolute;left:56%;top:26%;width:50%;height:50%;transform-origin:14% 86%}
.bfxl-tool svg{left:0;top:0;width:100%;height:100%}
.bfxl-target{position:absolute;right:30px;bottom:12px;width:100px;height:100px;transform-origin:50% 100%}
.bfxl-target>svg{left:0;top:0;width:100%;height:100%}
.bfxl-target.station>svg{left:14%;top:34%;width:72%;height:72%;opacity:.85}
.bfxl-target img{position:absolute;pointer-events:none}
.bfxl-target.cow{width:118px;height:118px;right:22px;bottom:4px}
.bfxl-target.tree{width:136px;height:136px;right:14px;bottom:2px}
.bfxl-target img.pose{left:-18.75%;top:-18.75%;width:137.5%;height:137.5%}
.bfxl-target.plant{width:96px;height:96px}
.bfxl-target img.cell{left:-4.7%;top:-4.7%;width:109.4%;height:109.4%}
.bfxl-target.station.drawn{width:84px;height:112px;bottom:6px;right:36px}
.bfxl-target.station.drawn img.cell{left:-6.25%;top:-4.7%;width:112.5%;height:109.4%}
.bfxl-target.station.drawn .bfxl-work{top:-12%;left:22%;width:56%;height:42%}
.bfxl-target.station.drawn.crafting{width:76px;height:101px}
.bfxl-target.station.drawn.brewing{width:72px;height:96px}
.bfxl-target.station.drawn.enhancing{width:76px;height:101px}
.bfxl-tool.drawn{z-index:1}
.bfxl-tool.ench5 img{filter:drop-shadow(0 0 2px #6fb6ff) drop-shadow(0 0 4px #6fb6ff)}
.bfxl-tool.ench8 img{filter:drop-shadow(0 0 2px #c07bff) drop-shadow(0 0 5px #c07bff)}
.bfxl-tool.ench10 img{animation:bfxl-b10 2.4s ease-in-out infinite}
.bfxl-tool.ench12 img{animation:bfxl-b12 1.4s ease-in-out infinite}
.bfxl-tool.ench15 img{animation:bfxl-b15 1.6s linear infinite}
@keyframes bfxl-b10{0%,100%{filter:drop-shadow(0 0 2px #ffa53a) drop-shadow(0 0 3px #ffa53a)}50%{filter:drop-shadow(0 0 3px #ffa53a) drop-shadow(0 0 8px #ffa53a)}}
@keyframes bfxl-b12{0%,100%{filter:drop-shadow(0 0 2px #ff5a3c) drop-shadow(0 0 4px #ffd75a)}50%{filter:drop-shadow(0 0 4px #ff5a3c) drop-shadow(0 0 10px #ffd75a)}}
@keyframes bfxl-b15{0%{filter:drop-shadow(0 0 3px #ff4d4d) drop-shadow(0 0 7px #ff4d4d)}17%{filter:drop-shadow(0 0 3px #ffb84d) drop-shadow(0 0 7px #ffb84d)}33%{filter:drop-shadow(0 0 3px #fff04d) drop-shadow(0 0 7px #fff04d)}50%{filter:drop-shadow(0 0 3px #4dff88) drop-shadow(0 0 7px #4dff88)}67%{filter:drop-shadow(0 0 3px #4dc3ff) drop-shadow(0 0 7px #4dc3ff)}83%{filter:drop-shadow(0 0 3px #b84dff) drop-shadow(0 0 7px #b84dff)}100%{filter:drop-shadow(0 0 3px #ff4d4d) drop-shadow(0 0 7px #ff4d4d)}}
.bfxl-hero{z-index:2}
.bfxl-carry{position:absolute;left:30%;top:-26%;width:40%;height:40%;filter:drop-shadow(0 2px 2px #0006)}
.bfxl-carry svg{left:0;top:0;width:100%;height:100%}
.bfxl-tool.drawn img{width:100%;height:100%;position:absolute;left:0;top:0}
.bfxl-work{position:absolute;left:25%;top:-10%;width:50%;height:50%;filter:drop-shadow(0 0 5px #fffa)}
.bfxl-work svg{left:0;top:0;width:100%;height:100%}
.bfxl-enh{position:absolute;left:0;right:0;top:-22%;text-align:center;font:700 16px sans-serif;text-shadow:0 1px 3px #000}
.bfxl-fx{position:absolute;inset:0;pointer-events:none;z-index:3}
.bfxl-fx>*{position:absolute;left:0;top:0;will-change:transform,opacity}
.bfxl-pop{white-space:nowrap;font-weight:700;text-shadow:0 1px 2px #000,0 0 3px #000;display:flex;align-items:center;gap:2px}
.bfxl-pop svg{position:static;width:22px;height:22px}
.bfxl-banner{left:0!important;right:0;top:34%!important;text-align:center;font:800 18px sans-serif;color:#ffe27a;
  text-shadow:0 0 8px #ff9d00,0 2px 3px #000}
.bfxl-big{position:absolute;left:0;top:0}
.bfxl-store{position:absolute;left:-10px;bottom:2px;width:100px;height:100px;pointer-events:none}
.bfxl-table{position:absolute;bottom:4px;width:56px;height:56px;pointer-events:none}
.bfxl-store img.cell,.bfxl-table img.cell{position:absolute;left:-4.7%;top:-4.7%;width:109.4%;height:109.4%}
.bfxl-slot{position:absolute;width:18px;height:18px;transform:translate(-50%,-100%);filter:drop-shadow(0 1px 1px #0009)}
.bfxl-slot svg{position:absolute;left:0;top:0;width:100%;height:100%}
.bfxl-slot b{position:absolute;left:50%;top:100%;transform:translateX(-50%);font:700 8.5px sans-serif;color:#fff;white-space:nowrap;text-shadow:0 0 2px #000,0 0 2px #000,0 0 1px #000}
.bfxl-target.proj{width:190px;height:127px;right:auto;left:75px;bottom:2px}
.bfxl-seal{position:absolute;left:50%;top:6px;width:44px;height:44px;margin-left:-22px;border-radius:50%;z-index:4;pointer-events:none;
  background:conic-gradient(#ffd75a var(--p,0deg),#3a2f5a55 0);box-shadow:0 0 10px #ffd75a88,inset 0 0 6px #000;animation:bfxl-seal 9s linear infinite}
.bfxl-seal i{position:absolute;inset:4px;border-radius:50%;background:radial-gradient(circle,#2a2140 55%,#4a3a70);border:1px dashed #ffd75aaa}
.bfxl-seal b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 10px sans-serif;color:#ffe9a0;text-shadow:0 0 4px #000}
.bfxl-seal.broken{background:conic-gradient(#ff4a3a var(--p,0deg),#3a0f0f88 0);box-shadow:0 0 12px #ff3a2a}
@keyframes bfxl-seal{to{rotate:360deg}}
.bfxl-seal b{animation:bfxl-seal 9s linear infinite reverse}
.bfxl.labroom .bfxl-seal,.bfxl.labroom .bfxl-info{display:none!important}
.bfxl-room{position:absolute;left:0;top:0;height:150px;transform-origin:0 0;pointer-events:none}
.bfxl-room svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible}
.bfxl-door{position:absolute;bottom:8px;width:130px;height:190px}
.bfxl-door.entry{left:0}
.bfxl-door.exit{right:0}
.bfxl-leaf{transform-box:fill-box;transition:transform 1.4s cubic-bezier(.5,0,.3,1)}
.bfxl-leaf.l{transform-origin:0 50%}
.bfxl-leaf.r{transform-origin:100% 50%}
.bfxl-door.open .bfxl-leaf{transform:scaleX(.12)}
.bfxl-dglow{opacity:0;transition:opacity 1.2s}
.bfxl-door.open .bfxl-dglow{opacity:1}
.bfxl-dseal{transition:opacity .6s}
.bfxl-door.open .bfxl-dseal{opacity:0}
.bfxl-dseal .ring{fill:#1a1430;stroke:#8a6cff;stroke-width:2;transition:stroke .2s;animation:bfxl-sealpulse 2.4s ease-in-out infinite}
.bfxl-dseal .r{fill:#3a2d66;transition:fill .4s}
.bfxl-dseal .r.lit{fill:#ffd75a;filter:drop-shadow(0 0 2px #ffd75a)}
.bfxl-dseal text{font:700 8.5px sans-serif;fill:#ffe9a0;text-anchor:middle}
.bfxl-dseal.red .ring{stroke:#ff4a3a;filter:drop-shadow(0 0 5px #ff3a2a)}
.bfxl-dseal.red .r.lit{fill:#ff6a4a}
@keyframes bfxl-sealpulse{50%{filter:drop-shadow(0 0 4px #8a6cff)}}
.bfxl-torch{position:absolute;top:62px;width:6px;height:16px;background:linear-gradient(#5a4a3a,#2a2018);border-radius:1px}
.bfxl-door.entry .bfxl-torch{left:-8px}
.bfxl-door.exit .bfxl-torch{right:-8px}
.bfxl-torch::before{content:"";position:absolute;left:-4px;top:-15px;width:14px;height:18px;border-radius:50% 50% 45% 45%/60% 60% 40% 40%;transform-origin:50% 100%;
  background:radial-gradient(ellipse at 50% 75%,#fff6c0,#ffb030 40%,#ff5a1a 68%,transparent 72%);animation:bfxl-flame .18s ease-in-out infinite alternate}
.bfxl-torch::after{content:"";position:absolute;left:-52px;top:-62px;width:110px;height:110px;border-radius:50%;background:radial-gradient(circle,#ffb04a50,transparent 65%);animation:bfxl-tglow 2.2s ease-in-out infinite alternate}
@keyframes bfxl-flame{from{transform:scale(1,1) skewX(-3deg)}to{transform:scale(.9,1.12) skewX(4deg)}}
@keyframes bfxl-tglow{from{opacity:.6}to{opacity:1}}
.bfxl-floor{position:absolute;left:calc(var(--sx) + 40px);top:100px;width:300px;height:80px}
.bfxl-runes text{font:700 15px serif;fill:#5e4fa8;text-anchor:middle;transition:fill .4s}
.bfxl-runes text.lit{fill:#ffe27a;filter:drop-shadow(0 0 3px #ffb300)}
.bfxl-ci{animation:bfxl-dash 8s linear infinite}
@keyframes bfxl-dash{to{stroke-dashoffset:-110}}
.bfxl-pile{position:absolute;left:calc(var(--sx) - 52px);bottom:10px;width:110px;height:80px}
.bfxl-pi{position:absolute;width:22px;height:22px;filter:drop-shadow(0 1px 1px #000a)}
.bfxl-peek{position:absolute;bottom:-17px;width:144px;height:144px;filter:brightness(.55) saturate(.8)}
.bfxl-amb{position:absolute;inset:0;pointer-events:none;z-index:5;overflow:hidden}
.bfxl-amb i{position:absolute;width:4px;height:4px;border-radius:50%;background:#bfffe9;box-shadow:0 0 6px 2px #5fffd0aa;animation:bfxl-fly 9s ease-in-out infinite alternate,bfxl-blink 2.6s ease-in-out infinite}
@keyframes bfxl-fly{to{transform:translate(var(--dx),var(--dy))}}
@keyframes bfxl-blink{0%,100%{opacity:.15}50%{opacity:.9}}
.bfxl-amb::after{content:"";position:absolute;left:-20%;right:-20%;bottom:0;height:30%;animation:bfxl-mist 14s ease-in-out infinite alternate;
  background:radial-gradient(ellipse at 30% 100%,#8fa8ff26,transparent 60%),radial-gradient(ellipse at 75% 100%,#b08fff20,transparent 55%)}
@keyframes bfxl-mist{to{transform:translateX(8%)}}
.bfxl-amb b{position:absolute;top:0;background:linear-gradient(#8a8898,#4a4858);clip-path:polygon(20% 0,85% 12%,100% 60%,70% 100%,10% 85%,0 35%)}
.bfxl-tablet{position:absolute;left:10px;top:8px;z-index:7;padding:5px 10px 6px;font:11px/1.55 sans-serif;color:#e8e2cc;pointer-events:none;
  background:linear-gradient(#4a4e62ee,#2c2f40ee);border:1px solid #7a7d94;border-radius:3px;box-shadow:inset 0 0 0 2px #1d2030,0 3px 10px #0008;text-shadow:0 1px 1px #000}
.bfxl-tablet .t{font-weight:700;color:#ffd98a;border-bottom:1px solid #ffffff22;margin-bottom:2px;padding-bottom:1px}
.bfxl-tablet span{margin-right:10px}
.bfxl-tablet span:last-child{margin-right:0}
.bfxl-target.obst{width:150px;height:100px;right:62px;bottom:4px}
.bfxl-target.source{right:150px}
.bfxl-project{position:absolute;width:150px;height:100px;right:6px;bottom:2px;pointer-events:none}
.bfxl-gate{position:absolute;width:126px;height:84px;right:-8px;bottom:4px;pointer-events:none}
.bfxl-target img.stage,.bfxl-project img.stage,.bfxl-gate img.stage{position:absolute;left:-3.125%;top:-4.6875%;width:106.25%;height:109.375%;pointer-events:none}
.bfxl-mates{position:absolute;inset:0;pointer-events:none;z-index:1}
.bfxl-crowd{position:absolute;inset:0;pointer-events:none;z-index:0}
.bfxl-crowd b{display:none}
.bfxl-mate{position:absolute;width:96px;height:96px;transform:scale(.82);transform-origin:50% 100%;filter:brightness(.92)}
.bfxl-mate>svg{position:absolute;left:0;top:0;width:100%;height:100%}
.bfxl-mate b{position:absolute;left:50%;top:-4px;transform:translateX(-50%);font:700 9px sans-serif;color:#fff;white-space:nowrap;text-shadow:0 0 2px #000,0 0 2px #000}
.bfxl-mats{position:absolute;left:4%;right:4%;display:flex;justify-content:center;gap:1px;transform:translateY(-100%);pointer-events:none;z-index:1}
.bfxl-mat{position:relative;width:19px;height:19px;filter:drop-shadow(0 1px 1px #0008)}
.bfxl-mat svg{position:absolute;left:0;top:0;width:100%;height:100%}
.bfxl-mat b{position:absolute;right:-3px;bottom:-4px;font:700 8px sans-serif;color:#fff;text-shadow:0 0 2px #000,0 0 2px #000}
.bfxl-mat.short{opacity:.55;filter:grayscale(.7)}
.bfxl-rune{position:absolute;left:8%;top:-8px;width:84%;aspect-ratio:1;border-radius:50%;border:2px solid var(--enh,#7fd0ff);box-shadow:0 0 8px var(--enh,#7fd0ff),inset 0 0 8px var(--enh,#7fd0ff);background:repeating-conic-gradient(#ffffff55 0 3deg,transparent 3deg 24deg);animation:bfxl-rune 7s linear infinite;pointer-events:none}
.st3 .bfxl-rune,.st4 .bfxl-rune{animation-duration:4s;border-width:3px}
.st5 .bfxl-rune{animation:bfxl-rune 3s linear infinite,bfxl-hue 2s linear infinite;border-width:3px}
.st5 .bfxl-orbit{filter:hue-rotate(0);animation-name:bfxl-orbit;animation-iteration-count:infinite}
.st5 .bfxl-orbit i{animation:bfxl-hue 1.5s linear infinite}
@keyframes bfxl-hue{to{filter:hue-rotate(360deg)}}
@keyframes bfxl-rune{from{transform:scaleY(.3) rotate(0)}to{transform:scaleY(.3) rotate(360deg)}}
.bfxl-orbit{position:absolute;left:50%;top:9%;width:0;height:0;animation:bfxl-orbit 2.4s linear infinite;pointer-events:none}
.bfxl-orbit i{position:absolute;width:5px;height:5px;margin:-2.5px;border-radius:50%;background:#fff;box-shadow:0 0 6px var(--enh,#7fd0ff),0 0 3px #fff}
@keyframes bfxl-orbit{from{transform:scaleY(.4) rotate(0)}to{transform:scaleY(.4) rotate(360deg)}}
.bfxl-beam{height:6px;transform-origin:0 50%;border-radius:3px;background:linear-gradient(90deg,#bfe8ff00,#bfe8ff 20%,#fff 60%,#7fd0ff);box-shadow:0 0 8px #7fd0ff}
.bfxl-fu{width:44px;height:44px;background:radial-gradient(circle,#ff4a3a,#c8141c);border:2px solid #ffd75a;border-radius:4px;box-shadow:0 0 14px #ff3b30,0 0 4px #ffd75a;display:flex;align-items:center;justify-content:center}
.bfxl-fu span{transform:rotate(-45deg);font:900 28px serif;color:#ffd75a;text-shadow:0 1px 2px #6a0000}
.bfxl-banner.bless{color:#ffd75a;text-shadow:0 0 10px #ff3b30,0 0 4px #ff8a1a,0 2px 3px #000}
.bfxl-num{font:900 24px sans-serif;width:60px;text-align:center}
.bfxl-shield{width:52px;height:52px;border-radius:50%;border:2px solid #9fe0ff;background:radial-gradient(circle,#7fd0ff22 40%,#7fd0ff66 75%,transparent);box-shadow:0 0 12px #7fd0ff}
.bfxl-wave{width:16px;height:16px;border-radius:50%;border:2px solid #9fe0ff;box-shadow:0 0 6px #7fd0ff,inset 0 0 4px #7fd0ff}
.bfxl-big svg{position:static!important;width:100%;height:100%}
.bfxl-meteor{width:16px;height:16px;border-radius:50%;background:radial-gradient(circle,#fff6c0 0%,#ffb030 45%,#ff5a1a 75%);box-shadow:0 0 10px #ff7a1a,0 0 22px #ff4a00}
.bfxl-meteor::after{content:"";position:absolute;left:14px;top:4px;width:60px;height:8px;border-radius:4px;background:linear-gradient(90deg,#ffb030cc,#ff5a1a55,transparent)}
.bfxl-flash{width:120px;height:120px;border-radius:50%;background:radial-gradient(circle,#fff 0%,#ffe0a0 35%,transparent 70%)}
.bfxl-ring{width:80px;height:24px;border-radius:50%;border:3px solid #ffd9a0;box-shadow:0 0 8px #ffb070}
.bfxl-dim{inset:0!important;background:#000}
.bfxl-pillar{top:0!important;width:44px;height:150px;transform-origin:50% 0;background:linear-gradient(90deg,transparent,#fff8d0cc 30%,#fff 50%,#fff8d0cc 70%,transparent);filter:blur(1px)}
.bfxl-rays{width:120px;height:120px;border-radius:50%;background:repeating-conic-gradient(#fff3a080 0 10deg,transparent 10deg 30deg);-webkit-mask:radial-gradient(circle,#000 20%,transparent 70%);mask:radial-gradient(circle,#000 20%,transparent 70%)}
.bfxl-circle{border-radius:50%;border:3px double #ff3d6e;box-shadow:0 0 12px #ff3d6e,inset 0 0 12px #ff3d6e;background:repeating-conic-gradient(#ffd75a55 0 4deg,transparent 4deg 30deg)}
.bfxl-circle.inner{border:2px dashed #ffd75a;box-shadow:0 0 8px #ffd75a;background:none}
.bfxl-banner.rainbow{background:linear-gradient(90deg,#ff5f5f,#ffd75a,#6fff8f,#5fc8ff,#c77dff,#ff5f5f);-webkit-background-clip:text;background-clip:text;color:transparent!important;text-shadow:none;filter:drop-shadow(0 0 4px #fff) drop-shadow(0 2px 2px #000)}
.bfxl-banner.sage{color:#ff6b8b;text-shadow:0 0 10px #ff2d55,0 0 4px #ffd75a,0 2px 3px #000}
.bfxl-ico{display:none;width:46px;height:46px;border-radius:50%;cursor:pointer;position:relative;box-shadow:0 3px 10px #0008}
.bfxl-ico svg{position:absolute;left:7px;top:7px;width:32px;height:32px;border-radius:50%;background:#1b2033}
.bfxl.icon{width:46px;border-radius:50%;background:none;box-shadow:none;overflow:visible}
.bfxl.icon .bfxl-head,.bfxl.icon .bfxl-view,.bfxl.icon .bfxl-bar,.bfxl.icon .bfxl-lab{display:none}
.bfxl.icon .bfxl-ico{display:block}
.bfxl-lab{background:#20263c;padding:6px 8px;display:flex;flex-wrap:wrap;gap:4px;align-items:center;font-size:11px}
.bfxl-lab select{background:#141828;color:#ddd;border:1px solid #445;border-radius:3px;font-size:11px;max-width:120px}
.bfxl-lab button{background:#33406a;color:#eef;border:0;border-radius:3px;padding:2px 6px;font-size:11px;cursor:pointer}
.bfxl-lab button:hover{background:#4a5c96}
.bfxl-lab b{width:100%;font-size:11px;opacity:.7}
.bfxl-town{position:absolute;left:0;top:0;width:340px;height:150px;overflow:hidden;transform-origin:0 0;z-index:6;opacity:0;visibility:hidden;
  transition:opacity .35s,visibility 0s .35s;touch-action:pan-y;cursor:grab;user-select:none;background:linear-gradient(#8fd0ff 0%,#d8f0ff 66%,#9ccf7a 66%)}
.bfxl-town.drag{cursor:grabbing}
.bfxl-out{display:none}
.bfxl.canout .bfxl-out{display:inline}
.bfxl.min .bfxl-out,.bfxl.docked .bfxl-out{display:none!important}
.bfxl-pan{position:absolute;top:0;bottom:0;width:26px;z-index:6;display:flex;align-items:center;justify-content:center;font:700 22px sans-serif;color:#fff;
  text-shadow:0 1px 3px #000;opacity:0;pointer-events:none;transition:opacity .2s;touch-action:none}
.bfxl-pan.l{left:0;background:linear-gradient(90deg,#0004,#0000)}
.bfxl-pan.r{right:0;background:linear-gradient(270deg,#0004,#0000)}
.bfxl-pan.on{opacity:.55;pointer-events:auto;cursor:pointer}
.bfxl-pan.on:hover{opacity:.9}
.bfxl-find{position:absolute;top:6px;z-index:7;display:none;align-items:center;gap:1px;padding:1px 4px;border-radius:9px;background:#262d47d8;color:#fff;
  font:700 11px sans-serif;cursor:pointer;box-shadow:0 1px 3px #0008}
.bfxl-find.on{display:flex}
.bfxl-find svg{width:16px;height:16px}
.bfxl-find.l{left:28px}
.bfxl-find.r{right:28px}
.bfxl-tring{position:absolute;bottom:26px;width:18px;height:18px;margin-left:-9px;border-radius:50%;z-index:2;display:none;
  -webkit-mask:radial-gradient(circle,transparent 5px,#000 5.5px);mask:radial-gradient(circle,transparent 5px,#000 5.5px);box-shadow:0 0 0 1px #0006}
.bfxl-tring.on{display:block}
.bfxl.intown .bfxl-town{opacity:1;visibility:visible;transition:opacity .35s}
.bfxl.docked .bfxl-town{display:none}
.bfxl-strip{position:absolute;left:0;top:0;height:150px;will-change:transform}
.bfxl-street{position:absolute;left:0;right:0;bottom:0;height:50px;background:linear-gradient(#7fb35e 0 5px,#b8a383 5px,#a48d6c)}
.bfxl-bld{position:absolute;bottom:34px;width:70px;height:72px;transform:translateX(-50%);transform-origin:50% 100%}
.bfxl-bld.drawn{width:80px;height:104px;bottom:22px}
.bfxl-bld.drawn.deco{width:62px;height:80px;bottom:24px}
.bfxl-bld>img{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}
.bfxl-bld:not(.drawn)::before{content:"";position:absolute;left:4px;right:4px;bottom:0;height:62%;background:#d9c3a0;border-radius:2px;box-shadow:inset 0 -6px 0 #0002}
.bfxl-bld:not(.drawn)::after{content:"";position:absolute;left:-2px;right:-2px;top:0;height:42%;background:var(--roof,#b5523b);clip-path:polygon(50% 0,100% 100%,0 100%)}
.bfxl-bld:not(.drawn)>svg{position:absolute;left:30%;bottom:16%;width:40%;height:40%;z-index:1}
.bfxl-sign{position:absolute;left:58%;bottom:30%;width:26%;aspect-ratio:1;background:#f4e6c4;border:2px solid #7a5530;border-radius:3px;z-index:1}
.bfxl-sign svg{position:absolute;left:8%;top:8%;width:84%;height:84%}
.bfxl-lv{position:absolute;left:50%;top:6%;transform:translateX(-50%);padding:0 4px;border-radius:6px;background:#2b2140d0;font:700 8.5px sans-serif;color:#ffe9a0;white-space:nowrap;z-index:1}
.bfxl-bld.lv4 .bfxl-lv{background:#5a3a10e0;box-shadow:0 0 4px #ffd75a}
.bfxl-bld.lv7>img{filter:drop-shadow(0 0 2px #ffd75a) drop-shadow(0 0 5px #ffb74a88)}
.bfxl-bld.here>img{filter:brightness(1.12) drop-shadow(0 0 4px #fffa)}
.bfxl-thero{position:absolute;bottom:2px;width:96px;height:96px;margin-left:-48px;z-index:3}
.bfxl-thero>div{position:absolute;inset:0;transform-origin:50% 100%}
.bfxl-thero svg{position:absolute;left:0;top:0;width:100%;height:100%}
.bfxl-tvis{position:absolute;left:0;bottom:6px;width:96px;height:96px;margin-left:-48px;z-index:2;pointer-events:none}
.bfxl-tvis>div{position:absolute;inset:0;transform-origin:50% 100%;transform:scale(.55)}
.bfxl-tvis.l>div{transform:scale(-.55,.55)}
.bfxl-tvis.go{will-change:transform}
.bfxl-tvis svg{position:absolute;left:0;top:0;width:100%;height:100%}
.bfxl-tvis b{position:absolute;left:50%;top:30px;transform:translateX(-50%);padding:0 3px;border-radius:4px;background:#0007;font:600 8px sans-serif;color:#eef;white-space:nowrap}
.bfxl-tfx{position:absolute;inset:0;pointer-events:none;z-index:4}
.bfxl-tfx>*{position:absolute;left:0;top:0;font:700 12px sans-serif;color:#fff;text-shadow:0 1px 2px #000;white-space:nowrap}
.bfxl-tfx svg{width:20px;height:20px}
.bfxl-tfx span{display:flex;align-items:center;gap:1px}
.bfxl-bar{position:relative;height:14px;background:#11141f}
.bfxl-tbar{position:relative;height:13px;background:#1c1710}
.bfxl-tbar i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,#c98a00,#ffd75a)}
.bfxl-tbar span{position:absolute;inset:0;text-align:center;font-size:10px;line-height:13px;text-shadow:0 1px 1px #000,0 0 2px #000}
.bfxl.min .bfxl-tbar,.bfxl.icon .bfxl-tbar{display:none!important}
.bfxl-info{padding:3px 8px 4px;background:#171b2b;font-size:10.5px;line-height:1.5;color:#c8d0e8}
.bfxl-info div{display:flex;flex-wrap:wrap;column-gap:9px}
.bfxl-info span{white-space:nowrap}
.bfxl.min .bfxl-info,.bfxl.icon .bfxl-info{display:none!important}
.bfxl-bar i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,#4f8cff,#7fd0ff)}
.bfxl-bar span{position:absolute;inset:0;text-align:center;font-size:10px;line-height:14px;text-shadow:0 1px 1px #000}
`
      document.head.appendChild(st)
    }
    function build() {
      injectCss()
      el = document.createElement("div")
      el.className = "bfxl"
      el.innerHTML = `<div class="bfxl-head"><span class="bfxl-name"></span><span class="bfxl-count"></span><button class="bfxl-out"></button><button class="bfxl-info-btn" title="${L("加成信息", "Bonuses")}">ⓘ</button><button class="bfxl-size" title="${L("大小", "Size")}">⤢</button><button class="bfxl-min" title="${L("折叠", "Collapse")}">–</button><button class="bfxl-x" title="${L("关闭（菜单里可重新打开）", "Close (reopen from the menu)")}">×</button></div><div class="bfxl-view"><div class="bfxl-scene"><div class="bfxl-store"></div><div class="bfxl-table"></div><div class="bfxl-target"></div><div class="bfxl-hero"></div><div class="bfxl-fx"></div></div><div class="bfxl-town"><div class="bfxl-strip"></div><div class="bfxl-pan l">‹</div><div class="bfxl-pan r">›</div><div class="bfxl-find"></div></div></div><div class="bfxl-bar"><i></i><span></span></div><div class="bfxl-tbar"><i></i><span></span></div><div class="bfxl-info"></div><div class="bfxl-ico"></div>`
      document.body.appendChild(el)
      const $ = s => el.querySelector(s)
      // × shrinks the window to a round icon (the skill + a progress ring); a click on it opens it again
      $(".bfxl-x").onclick = () => {
        cfg.lifeIcon = true
        saveCfg()
        ensure()
      }
      $(".bfxl-ico").addEventListener("pointerdown", e => {
        const r = el.getBoundingClientRect()
        const dx = e.clientX - r.left
        const dy = e.clientY - r.top
        let moved = false
        const move = ev => {
          if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 5) return
          moved = true
          cfg.lifePos = [ev.clientX - dx, ev.clientY - dy]
          place()
        }
        const up = ev => {
          removeEventListener("pointermove", move)
          removeEventListener("pointerup", up)
          removeEventListener("pointercancel", up)
          if (!moved && ev.type === "pointerup") cfg.lifeIcon = false
          saveCfg()
          ensure()
        }
        addEventListener("pointermove", move)
        addEventListener("pointerup", up)
        addEventListener("pointercancel", up)
        e.preventDefault()
      })
      // #dev-start
      const labBtn = document.createElement("button")
      labBtn.textContent = "🧪"
      labBtn.title = "生活动画测试"
      labBtn.onclick = () => lab()
      $(".bfxl-head").insertBefore(labBtn, $(".bfxl-size"))
      // #dev-end
      // out into the town while the job goes on (and back in): the hero stays at work
      $(".bfxl-out").onclick = () => {
        town.out = !town.out
        town.free = false
        town.snap = true
        const was = inTown()
        ensure()
        if (was && !inTown()) walkIn()
      }
      townInput()
      $(".bfxl-info-btn").onclick = () => {
        cfg.lifeInfo = !cfg.lifeInfo
        saveCfg()
        showInfo()
        place()
      }
      $(".bfxl-min").onclick = () => {
        cfg.lifeMin = !cfg.lifeMin
        saveCfg()
        ensure()
      }
      // size: a share of the screen's width (the layout is drawn 340 px wide and scaled), at most half of it
      // (a phone keeps its own share, from under half the screen to all of it)
      $(".bfxl-size").onclick = () => {
        const k = widthKey()
        const sizes = narrow() ? [0.45, 0.62, 0.8, 1] : [0.15, 0.2, 0.3, 0.4, 0.5]
        cfg[k] = sizes.find(v => v > (cfg[k] || DEFAULTS[k]) + 0.001) || sizes[0]
        saveCfg()
        place()
      }
      const grip = document.createElement("div")
      grip.className = "bfxl-grip"
      el.appendChild(grip)
      grip.addEventListener("pointerdown", e => {
        const left = el.getBoundingClientRect().left
        const [lo, hi] = widthRange()
        const move = ev => {
          cfg[widthKey()] = Math.max(lo, Math.min(hi, (ev.clientX - left) / innerWidth))
          place()
        }
        const up = () => {
          removeEventListener("pointermove", move)
          removeEventListener("pointerup", up)
          removeEventListener("pointercancel", up)
          saveCfg()
        }
        addEventListener("pointermove", move)
        addEventListener("pointerup", up)
        addEventListener("pointercancel", up)
        e.preventDefault()
        e.stopPropagation()
      })
      // drag by the title bar
      $(".bfxl-head").addEventListener("pointerdown", e => {
        if (e.target.closest("button") || docked) return
        const r = el.getBoundingClientRect()
        const dx = e.clientX - r.left
        const dy = e.clientY - r.top
        let moved = false
        const move = ev => {
          if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 5) return
          moved = true
          cfg.lifePos = [ev.clientX - dx, ev.clientY - dy]
          place()
        }
        const up = ev => {
          removeEventListener("pointermove", move)
          removeEventListener("pointerup", up)
          removeEventListener("pointercancel", up)
          // a double tap / double click (two taps without moving) puts the window back in its default spot
          if (!moved && ev.type === "pointerup") {
            if (performance.now() - lastTap < 400) {
              cfg.lifePos = null
              place()
              lastTap = 0
            } else lastTap = performance.now()
          }
          saveCfg()
        }
        addEventListener("pointermove", move)
        addEventListener("pointerup", up)
        addEventListener("pointercancel", up)
        e.preventDefault()
      })
      addEventListener("resize", place)
    }
    // the game's layout: the skill list on the left, chat under the main panel. Found by shape, not by class
    // hashes: the outermost box (up to the page) of a navigation link that stays a narrow column, and the
    // biggest visible element whose class mentions chat
    function navRight() {
      let e = document.querySelector('[class*="NavigationBar_"]')
      let right = 0
      while (e && e !== document.body) {
        const r = e.getBoundingClientRect()
        if (r.width > 0 && r.width < 420 && r.height > innerHeight * 0.5) right = r.right
        e = e.parentElement
      }
      return right
    }
    function chatTop() {
      let best = null
      for (const e of document.querySelectorAll('[class*="Chat"],[class*="chat"]')) {
        const r = e.getBoundingClientRect()
        if (r.width < 200 || r.height < 80 || r.top < innerHeight * 0.3) continue
        if (!best || r.width * r.height > best.width * best.height) best = r
      }
      return best ? best.top : 0
    }
    // default spot: just above the chat, against the skill list (bottom right when neither is found)
    function defaultPos(w, h) {
      // a phone: no skill list beside the panel; top right, just under the game's header
      if (narrow()) {
        const hd = document.querySelector('[class*="Header_header"]') || document.querySelector('[class*="Header_"]')
        const b = hd ? hd.getBoundingClientRect().bottom : 0
        return [innerWidth - w - 4, (b > 0 && b < innerHeight * 0.4 ? b : 0) + 4]
      }
      const left = navRight()
      const top = chatTop()
      return [left ? left + 8 : innerWidth - w - 16, (top || innerHeight - 8) - h - 8]
    }
    // the window's scale: its share of the screen's width over the 340 px it is laid out in
    // a phone (narrow screen) gets its own, much bigger share: a fifth of 390 px would leave a 78 px picture
    // (screen.width too: a page without a viewport tag is laid out ~980 px wide on a phone and zoomed out)
    const narrow = () => Math.min(innerWidth, screen.width || innerWidth) < 700
    const widthKey = () => (narrow() ? "lifeWm" : "lifeW")
    const widthRange = () => (narrow() ? [0.35, 1] : [0.12, 0.5])
    const winScale = () => {
      const [lo, hi] = widthRange()
      const k = widthKey()
      return Math.min(innerWidth - 8, Math.min(hi, Math.max(lo, cfg[k] || DEFAULTS[k])) * innerWidth) / 340
    }
    // keeps the window on screen; dragged spots are kept, double-clicking the title bar goes back to the default
    // only the picture is scaled: the title bar, bars, bonus lines and buttons keep their size
    let curScale = 1 // the picture's scale as last placed (for measuring in it)
    let lastTap = 0 // last still tap on the title bar (double tap = back to the default spot)
    function place() {
      if (!el) return
      const scene = el.querySelector(".bfxl-scene")
      if (docked) {
        // laid over the game's panel like the battle stage it takes turns with: as tall as that stage, the hero
        // as big as a player on it (same sizing, PLAYER_SCALE 0.75) and standing on its ground line, the backdrop
        // across the whole panel; scaled to the panel's width the figures came out about twice the fighters' size
        const view = el.querySelector(".bfxl-view")
        // the title bar and the bars under the picture, measured one by one: docked, the window stretches over the
        // whole panel, and its height less the picture's grew the panel by the panel's padding every second
        const bars = [...el.children].reduce((h, c) => h + (c === view ? 0 : c.offsetHeight), 0)
        const W = docked.clientWidth
        const H = trial?.from === "guild" ? cfg.guildH : cfg.liveH
        const s = (curScale = Math.max(0.5, (unitSize(W, H, 1) * 0.75 * cfg.scale) / 96))
        docked.style.minHeight = Math.ceil(H + bars) + "px"
        // the game's own content under it may be taller: the picture fills the panel rather than leave a gap
        const Hv = Math.max(H, docked.clientHeight - bars)
        view.style.height = Hv + "px"
        const sceneL = Math.max(0, (W - 340 * s) / 2)
        const ground = Math.min(Hv * 0.84, Hv - 34)
        scene.style.transform = `scale(${s})`
        scene.style.marginLeft = sceneL + "px"
        scene.style.marginTop = Math.max(0, ground - 140 * s) + "px"
        roomGeo = { W, ground, s, sceneL }
        // the labyrinth room's hall: 140 scene units each side of the scene, narrower when the panel is
        const room = roomEl()
        if (room) {
          const rw = Math.min(620, W / s)
          const rl = Math.max(0, Math.min(W - rw * s, sceneL - 140 * s))
          Object.assign(room.style, { left: rl + "px", top: Math.max(0, ground - 140 * s) + "px", width: rw + "px", transform: `scale(${s})` })
          room.style.setProperty("--sx", (sceneL - rl) / s + "px")
        }
        return
      }
      scene.style.marginLeft = scene.style.marginTop = ""
      const s = (curScale = winScale())
      el.style.width = cfg.lifeIcon ? "" : 340 * s + "px"
      el.querySelector(".bfxl-view").style.height = 150 * s + "px"
      scene.style.transform = el.querySelector(".bfxl-town").style.transform = `scale(${s})`
      const w = cfg.lifeIcon ? 46 : 340 * s
      const h = el.offsetHeight
      const [x, y] = cfg.lifePos || defaultPos(w, h)
      el.style.left = Math.max(0, Math.min(innerWidth - w, x)) + "px"
      el.style.top = Math.max(0, Math.min(innerHeight - Math.min(h, 40), y)) + "px"
    }
    // a trial is shown like the battle stage: laid over the game's own panel for it (the guild page's 进行中 tab
    // or the labyrinth's 房间 tab), with a corner button back to the original; not as the floating window (trials
    // from the test panel excepted)
    let docked = null
    let trialBtn = null
    function trialHost(t) {
      // the guild page's 进行中 tab; the labyrinth page's 房间 tab (its fights are the battle stage's)
      const panel = document.querySelector(t?.from === "guild" ? '[class*="GuildPanel_inProgressTab"]' : '[class*="LabyrinthPanel_roomTab"]')
      return t && panel?.offsetParent && !panel.querySelector('[class*="BattlePanel_battleArea"]') ? panel : null
    }
    function dock(host) {
      if (host !== docked || (host && el.parentElement !== host)) {
        if (docked) docked.style.minHeight = ""
        trialBtn?.remove()
        trialBtn = null
        docked = host
        el.classList.toggle("docked", !!host)
        // the floating window's own spot and width must not move it inside the panel
        Object.assign(el.style, { left: "", top: "", width: "" })
        if (host) {
          if (getComputedStyle(host).position === "static") host.style.position = "relative"
          host.style.minHeight = "330px"
          host.appendChild(el)
        } else document.body.appendChild(el)
        layoutDirty = true
      }
      if (!host) return
      Stage.injectCss() // the corner button's style
      if (!trialBtn?.isConnected) {
        trialBtn = document.createElement("button")
        trialBtn.className = "bfx-toggle"
        trialBtn.addEventListener("click", e => {
          e.stopPropagation()
          cfg.trialOverlay = !cfg.trialOverlay
          saveCfg()
          ensure()
        })
        host.appendChild(trialBtn)
      }
      trialBtn.textContent = cfg.trialOverlay ? L("切换到原版", "Original view") : L("切换到动画", "Animated view")
    }
    function ensure() {
      // the trial on screen takes the scene; with none, the queue's action is back
      const pick = pickTrial()
      if (pick !== trial) {
        trial = pick
        sceneKey = ""
        if (pick) {
          cur = pick.cur
          enhLevel = pick.data.currentEnhLevel || 0
          measured = (pick.data.actionTimeMs || 0) / 1000
          cycleAt = performance.now()
          lastDone = null
        } else {
          cur = null
          return setQueue(queue)
        }
      }
      const host = trial ? trialHost(trial) : null
      // the test panel's trials show in the floating window
      let shown = trial ? !!host : true
      if (trial && labState) shown = true // #dev
      // no skilling action (nothing queued, or a fight): the town, unless it is switched off
      const want = cfg.life && document.body && shown && (isLife(cur) || (!trial && cfg.lifeTown))
      if (el && !want && docked) dock(null)
      if (!want) {
        if (el) el.style.display = "none"
        cancelAnimationFrame(raf)
        raf = 0
        return
      }
      if (!el) build()
      dock(host)
      el.style.display = host && !cfg.trialOverlay ? "none" : ""
      el.classList.toggle("min", !!cfg.lifeMin && !docked)
      el.classList.toggle("icon", !!cfg.lifeIcon && !docked)
      if (cfg.lifeMin || cfg.lifeIcon) layoutDirty = true
      townSync()
      // the next job's scene is built when the hero gets to its door
      if (isLife(cur) && !town.trip) setScene()
      else setTownHead()
      showInfo()
      fillStore()
      showTrialBar()
      place()
      if (!raf && !cfg.lifeMin) raf = requestAnimationFrame(frame)
    }
    // a tool in the hand: the drawn one, its grip (found by build-assets.py) on the front hand, turned about the
    // grip and glowing by its level like the battle stage's weapons (+5 blue, +8 purple, +10 orange, +12 red, +15
    // rainbow); the game's icon when it has no drawing
    function makeTool(id, lv) {
      const node = document.createElement("div")
      node.className = "bfxl-tool"
      const geo = id && Assets.get("life")?.tool_geo?.[id]
      if (!art("tool", id) || !geo) {
        if (id) node.appendChild(svgUse("items", id))
        return { node, held: null }
      }
      const kind = id.split("_").pop()
      const [gx, gy, , reach] = geo
      const w = (TOOL_REACH[kind] || 44) / reach
      const h = w * TOOL_FRAME
      node.classList.add("drawn")
      Object.assign(node.style, { left: HAND[0] - gx * w + "px", top: HAND[1] - gy * h + "px", width: w + "px", height: h + "px", transformOrigin: `${gx * 100}% ${gy * 100}%` })
      node.appendChild(img("tool/" + id))
      const tier = [15, 12, 10, 8, 5].find(n => lv >= n)
      if (tier) node.classList.add("ench" + tier)
      return { node, held: { kind, geo } }
    }
    // ----- trial scenes -----
    // A guild trial is everyone's one big project (lg_proj_*: 4 stages of the same thing) that grows with the
    // progress. Everyone works it as equals (the viewer too, among them): they stand around it in rows, holding
    // their tools; a success is acted out by one of them (the messages don't say whose: picked at random) striking
    // the project, a failure by one fumbling. A labyrinth skilling room is the skill's own scene in the depth's
    // backdrop with the room's seal over it, a ring of runes lighting up with the progress.
    let tstage = null // { stages: [img], shown, project }
    let members = [] // guild trial: [{ el, ang, kind, slot: { x, bottom, k, flip }, act: { t0, ok } | null }]
    function stageImgs(box, path) {
      return [1, 2, 3, 4].map(k => {
        const im = img(`${path}_${k}`, "stage")
        im.style.visibility = k === 1 ? "visible" : "hidden"
        box.appendChild(im)
        return im
      })
    }
    function buildTrialScene(skill, id, target) {
      if (trial.from !== "guild" || !art("project", skill + "_1")) return false
      tstage = { shown: -1 }
      target.classList.add("proj")
      tstage.stages = stageImgs(target, `project/${skill}`)
      tstage.project = target
      trialStage(false)
      return true
    }
    const trialProgress = d => (d.targetLevel !== null && d.targetLevel !== undefined ? (d.currentEnhLevel || 0) / (d.targetLevel || 1) : d.targetWorkValue ? (d.currentWorkValue || 0) / d.targetWorkValue : d.currentProgress || 0)
    // the project's stage (the last one only when it is through), the seal's ring
    function trialStage(show) {
      showSeal()
      if (!tstage || !trial) return
      const p = trialProgress(trial.data)
      const k = p >= 1 ? 3 : p >= 2 / 3 ? 2 : p >= 1 / 3 ? 1 : 0
      if (k === tstage.shown || (k === 3 && show)) return
      const was = tstage.shown
      tstage.shown = k
      tstage.stages.forEach((im, i) => (im.style.visibility = i === k ? "visible" : "hidden"))
      if (show && was >= 0 && k > was) {
        const box = tstage.project
        box.animate([{ filter: "brightness(2.2)", transform: "scale(1.06)" }, { filter: "none", transform: "none" }], { duration: 600, easing: "ease-out" })
        const [x, y] = boxAt(box)
        burst(trial.skill, x, y, 14, true)
        banner(L(`阶段 ${k + 1} / 4`, `Stage ${k + 1} / 4`), "#ffd75a")
      }
    }
    // the middle of an element in scene pixels
    function boxAt(e) {
      const s = el.querySelector(".bfxl-scene").getBoundingClientRect()
      const r = e.getBoundingClientRect()
      return [(r.left - s.left + r.width / 2) / curScale, (r.top - s.top + r.height / 2) / curScale]
    }
    // milk / produce thrown into the vat / wagon by whoever got it
    function produceArc(x0, y0) {
      if (!tstage) return
      const [x1, y1] = boxAt(tstage.project)
      const item = trial.skill === "milking" ? "milk" : trial.skill === "foraging" ? gameData()?.actions[cur.actionHrid]?.drops?.[0]?.[0] || "apple" : null
      if (!item) return
      for (let i = 0; i < 2; i++) {
        const p = fxEl("bfxl-big", "width:16px;height:16px")
        p.appendChild(svgUse("items", item))
        p.animate(
          [{ transform: `translate(${x0 - 8}px,${y0 - 20}px) scale(.6)`, opacity: 0 }, { transform: `translate(${(x0 + x1) / 2 - 8}px,${Math.min(y0, y1) - 50}px) scale(1)`, opacity: 1, offset: 0.5 }, { transform: `translate(${x1 - 8}px,${y1 - 10}px) scale(.5)`, opacity: 0 }],
          { duration: 750, delay: i * 120, easing: "ease-in-out", fill: "backwards" },
        ).onfinish = gone(p)
      }
    }
    // ----- the labyrinth room, docked over the 房间 tab: a hall around the skilling scene -----
    // The scene is laid out for the 340 px window: over the wide room tab it was a small group in an empty backdrop.
    // Around it now: the way in (an open archway) on the left and the sealed way on (a closed door with the room's
    // seal) on the right, torches on both; a rune circle on the floor under the hero and the work, a rune lit per
    // twelfth of the progress; what the attempts brought piled at the hero's feet; fireflies, floor mist and now and
    // then a monster peeking round a door; a failure shakes stones loose. The room's numbers are on a stone tablet in
    // the corner instead of the lines under the picture. Laid out in scene units (scaled like the scene) by place().
    const RUNES = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃ"
    const PEEKERS = ["rat", "myconid", "slimy", "zombie", "abyssal_imp", "dusk_revenant", "eye", "mimic", "jungle_sprite", "vampire", "skunk", "snake"]
    // the pile's places, bottom row first: [x, height] in the pile's box
    const PILE = [7, 6, 5, 4, 3, 2, 1].flatMap((n, row) => Array.from({ length: n }, (_, j) => [55 + (j - (n - 1) / 2) * 15 + (((row * 7 + j * 5) % 5) - 2), row * 10]))
    let roomGeo = null // { W, ground, s, sceneL }: the view as last placed, in view pixels
    let nextPeek = 0
    const roomEl = () => el?.querySelector(".bfxl-room")
    function doorSvg(exit) {
      const leaf = l =>
        `<g class="bfxl-leaf ${l ? "l" : "r"}"><path d="${l ? "M25 190V70A40 40 0 0 1 65 30V190Z" : "M105 190V70A40 40 0 0 0 65 30V190Z"}" fill="url(#bfxl-wood)" stroke="#24160c" stroke-width="1.2"/>` +
        `<path d="${l ? "M38 46V190M51 34V190" : "M79 34V190M92 46V190"}" stroke="#2a1a0e" stroke-width="1"/>` +
        `<rect x="${l ? 25 : 65}" y="96" width="40" height="5" fill="#2c2c34"/><rect x="${l ? 25 : 65}" y="152" width="40" height="5" fill="#2c2c34"/>` +
        `<circle cx="${l ? 31 : 99}" cy="98.5" r="1.6" fill="#8a8a90"/><circle cx="${l ? 31 : 99}" cy="154.5" r="1.6" fill="#8a8a90"/>` +
        `<circle cx="${l ? 58 : 72}" cy="134" r="3.5" fill="none" stroke="#8a8a90" stroke-width="1.4"/></g>`
      const seal = exit
        ? `<g class="bfxl-dseal"><circle class="ring" cx="65" cy="118" r="15"/>` +
          Array.from({ length: 8 }, (_, k) => `<circle class="r" cx="${(65 + 21 * Math.cos(((k * 45 - 90) * Math.PI) / 180)).toFixed(1)}" cy="${(118 + 21 * Math.sin(((k * 45 - 90) * Math.PI) / 180)).toFixed(1)}" r="2.6"/>`).join("") +
          `<text x="65" y="121.5"></text></g>`
        : ""
      return (
        `<svg viewBox="0 0 130 190"><defs><linearGradient id="bfxl-stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#666c88"/><stop offset="1" stop-color="#30344a"/></linearGradient>` +
        `<linearGradient id="bfxl-wood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5b3b22"/><stop offset=".5" stop-color="#6e4a2c"/><stop offset="1" stop-color="#4a2f1a"/></linearGradient>` +
        `<radialGradient id="bfxl-gold" cx=".5" cy=".7" r=".7"><stop offset="0" stop-color="#fff6c8"/><stop offset=".45" stop-color="#ffd75a"/><stop offset="1" stop-color="#b8741a"/></radialGradient>` +
        `<radialGradient id="bfxl-mist" cx=".5" cy="1" r=".9"><stop offset="0" stop-color="#3a4a8a"/><stop offset=".6" stop-color="#121633"/><stop offset="1" stop-color="#05060c"/></radialGradient></defs>` +
        `<path d="M25 190V70A40 40 0 0 1 105 70V190Z" fill="${exit ? "#120d08" : "url(#bfxl-mist)"}"/>` +
        (exit ? `<path class="bfxl-dglow" d="M25 190V70A40 40 0 0 1 105 70V190Z" fill="url(#bfxl-gold)"/>` : "") +
        leaf(true) +
        leaf(false) +
        seal +
        `<path d="M4 190V70A61 61 0 0 1 126 70V190H105V70A40 40 0 0 0 25 70V190Z" fill="url(#bfxl-stone)" stroke="#171a26" stroke-width="1.5"/>` +
        `<path d="M4 100H25M4 130H25M4 160H25M105 100H126M105 130H126M105 160H126M10 40L29 52M120 40L101 52M40 13L48 33M90 13L82 33" stroke="#1c2030" stroke-width="1.2"/>` +
        `<path d="M57 7H73L70 31H60Z" fill="#6a7090" stroke="#171a26"/><rect x="-4" y="184" width="138" height="6" rx="1" fill="#3a3e52"/></svg>`
      )
    }
    function floorSvg() {
      const runes = [...RUNES].map((r, i) => {
        const a = ((90 + i * 30) * Math.PI) / 180
        return `<text x="${(150 + 132 * Math.cos(a)).toFixed(1)}" y="${(45.5 + 31 * Math.sin(a)).toFixed(1)}">${r}</text>`
      })
      return (
        `<svg viewBox="0 0 300 80"><defs><radialGradient id="bfxl-cglow"><stop offset="0" stop-color="#ffd75a" stop-opacity=".5"/><stop offset="1" stop-color="#ffd75a" stop-opacity="0"/></radialGradient></defs>` +
        `<ellipse class="bfxl-cg" cx="150" cy="40" rx="150" ry="40" fill="url(#bfxl-cglow)"/>` +
        `<ellipse cx="150" cy="40" rx="144" ry="36" fill="none" stroke="#6d5fb0" stroke-opacity=".7" stroke-width="2"/>` +
        `<path class="bfxl-cp" d="M150 76A144 36 0 1 1 150 4A144 36 0 1 1 150 76" fill="none" stroke="#ffd75a" stroke-width="3" pathLength="100" stroke-dasharray="0 100" style="filter:drop-shadow(0 0 3px #ffb300)"/>` +
        `<ellipse class="bfxl-ci" cx="150" cy="40" rx="118" ry="27" fill="none" stroke="#9f8cff" stroke-opacity=".8" stroke-width="1.2" stroke-dasharray="6 5"/>` +
        `<ellipse cx="150" cy="40" rx="70" ry="16" fill="none" stroke="#9f8cff" stroke-opacity=".45"/><g class="bfxl-runes">${runes.join("")}</g></svg>`
      )
    }
    // what an attempt brings: the room's milk / logs / fruit, else the skill's essence
    function roomItem() {
      const sk = trial.skill
      if (SKILL[sk][2] !== "gather") return sk + "_essence"
      return sk === "milking" ? "milk" : gameData()?.actions[cur.actionHrid]?.drops?.[0]?.[0] || sk + "_essence"
    }
    const roomPileN = d => (d.targetLevel !== null && d.targetLevel !== undefined ? 0 : Math.round((d.currentWorkValue || 0) / (d.progressPerAction || 1)))
    function showRoom() {
      const want = !!el && trial?.from === "lab" && !!docked
      let room = roomEl()
      if (!want || room?.dataset.key !== trial.key) {
        room?.remove()
        el?.querySelectorAll(".bfxl-amb,.bfxl-tablet").forEach(e => e.remove())
        room = null
      }
      el?.classList.toggle("labroom", want)
      if (!want) return
      const view = el.querySelector(".bfxl-view")
      if (!room) {
        room = document.createElement("div")
        room.className = "bfxl-room"
        room.dataset.key = trial.key
        room.innerHTML = `<div class="bfxl-door entry open">${doorSvg(false)}<i class="bfxl-torch"></i></div><div class="bfxl-door exit">${doorSvg(true)}<i class="bfxl-torch"></i></div><div class="bfxl-floor">${floorSvg()}</div><div class="bfxl-pile"></div>`
        view.insertBefore(room, view.firstChild)
        const r = (a, b) => a + Math.random() * (b - a)
        const amb = document.createElement("div")
        amb.className = "bfxl-amb"
        amb.innerHTML = Array.from({ length: 16 }, () => `<i style="left:${r(3, 95)}%;top:${r(12, 80)}%;--dx:${r(-60, 60)}px;--dy:${r(-40, 30)}px;animation-duration:${r(6, 13)}s,${r(1.8, 3.6)}s;animation-delay:-${r(0, 12)}s,-${r(0, 3)}s"></i>`).join("")
        view.appendChild(amb)
        const tab = document.createElement("div")
        tab.className = "bfxl-tablet"
        view.appendChild(tab)
        nextPeek = performance.now() + r(5000, 12000)
        layoutDirty = true
      }
      const d = trial.data
      const enh = d.targetLevel !== null && d.targetLevel !== undefined
      const p = Math.max(0, Math.min(1, trialProgress(d)))
      const lit = Math.floor(p * 12 + 1e-6)
      room.querySelectorAll(".bfxl-runes text").forEach((t, i) => t.classList.toggle("lit", i < lit))
      room.querySelector(".bfxl-cp").setAttribute("stroke-dasharray", `${p * 100} 100`)
      room.querySelector(".bfxl-cg").style.opacity = 0.2 + p * 0.8
      const seal = room.querySelector(".bfxl-dseal")
      seal.querySelectorAll(".r").forEach((c, i) => c.classList.toggle("lit", i < Math.floor(p * 8 + 1e-6)))
      seal.querySelector("text").textContent = enh ? `+${d.currentEnhLevel || 0}/${d.targetLevel}` : Math.floor(p * 100) + "%"
      // a new room, or attempts that were not played (the page out of sight): the pile catches up at once
      pileSet(roomPileN(d), false)
      const floor = labyrinth?.currentFloor
      const rm = labRoom()
      const head = `${floor ? L(`迷宫 第 ${floor} 层`, `Labyrinth floor ${floor}`) : L("迷宫", "Labyrinth")} · ${L(...(SKILL[trial.skill] || [trial.skill, trial.skill]).slice(0, 2))}${rm?.recommendedLevel ? " Lv." + rm.recommendedLevel : ""}`
      const html = `<div class="t">${head}</div>` + trialLines().map(l => `<div>${l.map(x => `<span>${x}</span>`).join("")}</div>`).join("")
      const tab = view.querySelector(".bfxl-tablet")
      if (tab.innerHTML !== html) tab.innerHTML = html
    }
    function pileSet(n, fly) {
      const pile = roomEl()?.querySelector(".bfxl-pile")
      if (!pile) return
      const item = roomItem()
      if (pile.dataset.item !== item) {
        pile.innerHTML = ""
        pile.dataset.item = item
      }
      n = Math.min(n, PILE.length)
      while (pile.children.length > n) pile.lastChild.remove()
      for (let k = pile.children.length, i = 0; k < n; k++, i++) {
        const [x, y] = PILE[k]
        const it = document.createElement("div")
        it.className = "bfxl-pi"
        Object.assign(it.style, { left: x - 11 + "px", bottom: y + "px" })
        it.appendChild(svgUse("items", item))
        pile.appendChild(it)
        // thrown back from the hero's hands (the hero stands right of the pile)
        if (fly) it.animate([{ transform: `translate(${182 - x}px,${y - 60}px) scale(.6)`, opacity: 0 }, { transform: `translate(${(182 - x) / 2}px,${y - 105}px)`, opacity: 1, offset: 0.5 }, { transform: "none", opacity: 1 }], { duration: 650, delay: 300 + i * 120, easing: "ease-in", fill: "backwards" })
      }
    }
    // one attempt in the room: the circle flares (twice for double progress) and the work lands on the pile; a
    // failure flashes the door's seal red and shakes stones loose
    function roomEvent(ok, double) {
      const room = roomEl()
      if (!room) return
      if (ok) {
        pileSet(roomPileN(trial.data), true)
        showRoom()
        room.querySelector(".bfxl-floor").animate([{ filter: "brightness(1)" }, { filter: "brightness(2.2)" }, { filter: "brightness(1)" }], { duration: 600, iterations: double ? 2 : 1 })
        const lit = room.querySelectorAll(".bfxl-runes text.lit")
        lit[lit.length - 1]?.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 260, iterations: 3 })
      } else {
        const seal = room.querySelector(".bfxl-dseal")
        seal.classList.add("red")
        later(700, () => seal.classList.remove("red"))
        room.animate([{ translate: "0 0" }, { translate: "-3px 0" }, { translate: "3px 1px" }, { translate: "0 0" }], { duration: 300 })
        rocks(4)
      }
    }
    // stones dropping from the ceiling onto the floor round the scene
    function rocks(n) {
      const amb = el.querySelector(".bfxl-amb")
      if (!amb || !roomGeo) return
      const { W, ground, s } = roomGeo
      for (let i = 0; i < n; i++) {
        const b = document.createElement("b")
        const sz = (5 + Math.random() * 7) * s
        Object.assign(b.style, { left: W / 2 + (Math.random() - 0.5) * 380 * s + "px", width: sz + "px", height: sz + "px" })
        amb.appendChild(b)
        const rot = (Math.random() - 0.5) * 540
        b.animate([{ transform: "translateY(-20px)", opacity: 1 }, { transform: `translateY(${ground - sz}px) rotate(${rot}deg)`, opacity: 1, offset: 0.8 }, { transform: `translateY(${ground - sz - 5}px) rotate(${rot * 1.1}deg)`, opacity: 0 }], { duration: 700 + Math.random() * 300, delay: i * 90, easing: "ease-in", fill: "backwards" }).onfinish = gone(b)
      }
    }
    // now and then one of the labyrinth's monsters peeks round a door frame, looks at the hero and slips back
    function roomTick() {
      const room = roomEl()
      if (!room || !visible() || performance.now() < nextPeek) return
      nextPeek = performance.now() + 14000 + Math.random() * 16000
      const ids = PEEKERS.filter(id => Assets.has("m", id))
      if (!ids.length) return
      const id = ids[(Math.random() * ids.length) | 0]
      const left = Math.random() < 0.5
      const pk = document.createElement("img")
      pk.className = "bfxl-peek"
      pk.src = Assets.url(`m/${id}/idle.webp`)
      pk.draggable = false
      pk.style[left ? "left" : "right"] = "-7px"
      // behind the door: it comes out past the frame toward the middle (the drawings face left)
      room.insertBefore(pk, room.querySelector(left ? ".entry" : ".exit"))
      const f = left ? "scaleX(-1)" : ""
      const out = left ? 80 : -80
      pk.animate([{ transform: `translateX(0) ${f}` }, { transform: `translateX(${out}px) ${f}`, offset: 0.2 }, { transform: `translateX(${out}px) translateY(-3px) ${f}`, offset: 0.45 }, { transform: `translateX(${out}px) ${f}`, offset: 0.75 }, { transform: `translateX(0) ${f}` }], { duration: 4200, easing: "ease-in-out" }).onfinish = gone(pk)
    }
    // the room through: the circle blazes, the sealed door swings open on a golden light; or its seal cracks red
    function roomFinale(ok) {
      const room = roomEl()
      const exit = room.querySelector(".exit")
      const [x, y] = boxAt(exit)
      if (ok) {
        showRoom()
        room.querySelector(".bfxl-floor").animate([{ filter: "brightness(1)" }, { filter: "brightness(3)" }, { filter: "brightness(1.5)" }], { duration: 1200, fill: "forwards" })
        later(400, () => exit.classList.add("open"))
        later(1000, () => {
          FX.shards ||= [["#ffd75a", "#9fe0ff", "#ffffff"], "chip"]
          burst("shards", x, y, 24, true)
          bigItem("labyrinth_token", x, y + 20, 34, "#ffd75a", 2000, 30)
        })
      } else {
        room.querySelector(".bfxl-dseal").classList.add("red")
        rocks(9)
        const f = fxEl("bfxl-dim", "background:#600")
        f.animate([{ opacity: 0 }, { opacity: 0.45 }, { opacity: 0 }], { duration: 900 }).onfinish = gone(f)
      }
      return true
    }
    // ----- the labyrinth room's seal: a ring of runes over the scene, lit by the progress -----
    function showSeal() {
      showRoom()
      const room = trial?.from === "lab"
      let seal = el?.querySelector(".bfxl-seal")
      if (!room || seal?.dataset.key !== trial.key) seal?.remove()
      if (!room) return
      seal = el.querySelector(".bfxl-seal")
      if (!seal) {
        seal = document.createElement("div")
        seal.className = "bfxl-seal"
        seal.innerHTML = "<i></i><b></b>"
        seal.dataset.key = trial.key
        el.querySelector(".bfxl-scene").appendChild(seal)
      }
      const d = trial.data
      const p = Math.min(1, trialProgress(d))
      seal.style.setProperty("--p", p * 360 + "deg")
      seal.querySelector("b").textContent = d.targetLevel !== null && d.targetLevel !== undefined ? `+${d.currentEnhLevel || 0}/${d.targetLevel}` : Math.floor(p * 100) + "%"
    }
    // the end of a trial: the project's last stage with its own flourish; the room's seal breaking (or cracking red)
    function trialFinale(ok) {
      if (roomEl()) return roomFinale(ok)
      const seal = el.querySelector(".bfxl-seal")
      if (seal) {
        const [x, y] = boxAt(seal)
        if (ok) {
          seal.animate([{ transform: "scale(1)", filter: "brightness(1)" }, { transform: "scale(1.4)", filter: "brightness(3)" }, { transform: "scale(.2)", opacity: 0 }], { duration: 700, easing: "ease-in", fill: "forwards" })
          later(500, () => {
            FX.shards ||= [["#ffd75a", "#9fe0ff", "#ffffff"], "chip"]
            burst("shards", x, y, 24, true)
            bigItem("labyrinth_token", x, y + 30, 34, "#ffd75a", 2000, 30)
          })
        } else {
          seal.classList.add("broken")
          seal.animate([{ transform: "translateX(0)" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(0)" }], { duration: 400 })
          const f = fxEl("bfxl-dim", "background:#600")
          f.animate([{ opacity: 0 }, { opacity: 0.45 }, { opacity: 0 }], { duration: 900 }).onfinish = gone(f)
        }
        return true
      }
      if (!tstage) return false
      const box = tstage.project
      const [x, y] = boxAt(box)
      const showLast = () => {
        tstage.shown = 3
        tstage.stages.forEach((im, i) => (im.style.visibility = i === 3 ? "visible" : "hidden"))
        box.animate([{ filter: "brightness(2.5)", transform: "scale(1.08)" }, { filter: "none", transform: "none" }], { duration: 800, easing: "ease-out" })
        burst("enhancing", x, y - 10, 20, true)
      }
      if (!ok) return true
      if (trial.skill === "woodcutting") {
        // the old tree comes down
        const st = tstage.stages[2]
        st.style.transformOrigin = "75% 92%"
        st.animate([{ transform: "rotate(0)" }, { transform: "rotate(78deg)" }], { duration: 900, easing: "cubic-bezier(.5,0,1,1)", fill: "forwards" }).onfinish = () => {
          st.getAnimations().forEach(a => a.cancel())
          showLast()
          shake(6, 500)
          FX.dust ||= [["#c9a77a", "#8b6b4a", "#e8d3b0"], "chip"]
          burst("dust", x + 40, y + 40, 24, true)
          banner("Timber!", "#ffe27a")
        }
        return true
      }
      showLast()
      if (trial.skill === "tailoring") box.animate([{ transform: "scaleY(.6)" }, { transform: "scaleY(1.05)" }, { transform: "none" }], { duration: 700, easing: "ease-out" })
      if (trial.skill === "brewing" || trial.skill === "cooking") {
        FX.steam ||= [["#ffffffc0", "#ffe9c9b0"], "puff"]
        for (let i = 0; i < 3; i++) later(i * 250, () => burst("steam", x + (Math.random() - 0.5) * 60, y - 30, 8, true))
      }
      // everyone cheers
      for (const m of members) m.el.animate([{ translate: "0 0" }, { translate: "0 -10px" }, { translate: "0 0" }], { duration: 400, iterations: 3, delay: Math.random() * 300 })
      return true
    }
    // ----- the guild's members around the project -----
    // order around it: shuffled by id (the same each time), so the viewer is just one of them
    const mix = id => (Math.imul(Number(id) || 7, 2654435761) >>> 0) % 997
    function buildMates(skill) {
      el.querySelectorAll(".bfxl-mates,.bfxl-crowd").forEach(e => e.remove())
      members = []
      const guild = trial?.from === "guild" && tstage
      el.querySelector(".bfxl-hero").style.display = guild ? "none" : ""
      if (!guild) return
      const ids = [...new Set([myId, ...(trial.data.participantIds || [])])].filter(id => id !== null && id !== undefined).slice(0, 60)
      ids.sort((a, b) => mix(a) - mix(b))
      const front = document.createElement("div")
      front.className = "bfxl-mates"
      const back = document.createElement("div")
      back.className = "bfxl-crowd"
      const slots = memberSlots(ids.length)
      ids.forEach((id, i) => {
        const me = id === myId
        const c = me ? { name: Looks.me.name, avatarHrid: Looks.me.avatar, avatarOutfitHrid: Looks.me.outfit } : guildChars[id] || {}
        const m = document.createElement("div")
        m.className = "bfxl-mate"
        const body = document.createElementNS(SVGNS, "svg")
        body.setAttribute("viewBox", "0 0 100 100")
        for (const [sh, sid] of [["avatars", shortId(c.avatarHrid) || "person_default"], ["avatar_outfits", shortId(c.avatarOutfitHrid)]]) {
          if (!sid || !sheet(sh)) continue
          const u = document.createElementNS(SVGNS, "use")
          u.setAttribute("href", sheet(sh) + "#" + sid)
          body.appendChild(u)
        }
        m.appendChild(body)
        const own = me ? { id: tools[skill], enh: toolEnh[skill] || 0 } : Looks.toolOf(c.name, skill)
        const made = makeTool(own?.id || tools[skill], own ? own.enh : 0)
        m.appendChild(made.node)
        const name = document.createElement("b")
        name.textContent = c.name || "#" + id
        m.appendChild(name)
        const slot = slots[i]
        ;(slot.front ? front : back).appendChild(m)
        members.push({ el: m, tool: made.node, ang: made.held?.geo[2], kind: made.held?.kind || held?.kind, slot, act: null, phase: Math.random() })
      })
      const scene = el.querySelector(".bfxl-scene")
      scene.insertBefore(front, el.querySelector(".bfxl-hero"))
      scene.insertBefore(back, el.querySelector(".bfxl-target"))
      placeMates()
    }
    // rows around the project: four in front at its sides, then rows of 6 / 9 / 9... behind, smaller and higher
    function memberSlots(n) {
      const out = []
      const rows = [4, 6, 9, 9, 9, 9, 9, 9]
      let r = 0
      let j = 0
      for (let i = 0; i < n; i++) {
        if (j >= rows[r]) {
          r++
          j = 0
        }
        out.push({ row: r, j, of: Math.min(rows[r], n - (i - j)), front: r === 0 })
        j++
      }
      return out
    }
    function placeMates() {
      if (!el || !members.length || !tstage) return
      const proj = tstage.project
      const left = proj.offsetLeft
      const right = proj.offsetLeft + proj.offsetWidth
      const mid = (left + right) / 2
      for (const m of members) {
        const { row, j, of } = m.slot
        let x
        let k
        let bottom
        if (row === 0) {
          // two on each side, facing it
          const side = j % 2 ? 1 : -1
          const step = Math.floor(j / 2)
          x = side < 0 ? left + 6 - 34 - 30 * step : right - 6 + 34 + 30 * step
          k = 0.8
          bottom = 8 + 6 * step
        } else {
          x = 20 + ((300 / Math.max(1, of - 1)) * j || 150) + (row % 2) * 8
          k = Math.max(0.3, 0.62 - 0.07 * row)
          bottom = 40 + 11 * row
        }
        x = Math.max(10, Math.min(330, x))
        m.slot.x = x
        m.slot.k = k
        m.slot.flip = x > mid
        m.el.style.left = x - 48 + "px"
        m.el.style.bottom = bottom + "px"
        m.el.style.zIndex = 20 - row
        m.el.style.transform = `scale(${m.slot.flip ? -k : k},${k})`
        m.el.querySelector("b").style.transform = m.slot.flip ? "translateX(-50%) scaleX(-1)" : ""
        m.el.querySelector("b").style.display = row <= 1 ? "" : "none"
      }
    }
    // one member acts out an attempt: a stride to the project and a strike (ok) or a droop (not)
    function memberAct(ok) {
      if (!members.length) return null
      // the front and the next row are seen best: they get most of it
      const pool = members.filter(m => m.slot.row <= 1 && !m.act)
      const m = (pool.length && Math.random() < 0.8 ? pool : members)[(Math.random() * (pool.length && Math.random() < 0.8 ? pool.length : members.length)) | 0]
      if (!m) return null
      m.act = { t0: performance.now(), ok }
      return m
    }
    // the members' frame: idle sway, or the act in progress
    function animateMembers(now) {
      for (const m of members) {
        if (!m.kind) continue
        const toward = m.slot.flip ? -1 : 1
        let f = 0
        let lunge = 0
        let droop = 0
        if (m.act) {
          const p = (now - m.act.t0) / 700
          if (p >= 1) m.act = null
          else if (m.act.ok) {
            f = p
            lunge = Math.sin(Math.PI * p) * 10
          } else droop = Math.sin(Math.PI * p)
        }
        const [dir, x, y, turn] = m.act && m.act.ok ? toolPose(m.kind, f) : toolPose(m.kind, 0)
        const sway = m.act ? 0 : 5 * Math.sin(now / 600 + m.phase * 6)
        const rot = (dir === null ? 0 : dir - (m.ang ?? held?.geo[2] ?? 0)) + turn + sway + droop * 35
        m.tool.style.transform = `translate(${x}px,${y + droop * 4}px) rotate(${rot}deg)`
        m.el.style.translate = `${lunge * toward * m.slot.k}px 0`
      }
    }
    // the static parts: background, hero, the thing being worked on; rebuilt when any of them changes
    function setScene() {
      const skill = skillOf(cur.actionHrid)
      const [, , kind] = SKILL[skill]
      const id = shortId(cur.actionHrid)
      const work = hashItem(cur.primaryItemHash)?.id
      const me = Looks.me
      const key = [cur.id, id, work, tools[skill], toolEnh[skill], !!gameData(), trialMates().map(i => i + (guildChars[i]?.avatarHrid || "") + (Looks.toolOf(guildChars[i]?.name, skill)?.id || "")).join(), me.avatar, me.outfit, sheet("avatars"), sheet("items"), sheet("actions"), sheet("skills"), Assets.get("rev")].join("|")
      el.querySelector(".bfxl-name").textContent = actionName()
      el.querySelector(".bfxl-ico").title = actionName()
      el.querySelector(".bfxl-count").textContent = cur.trial ? "" : cur.hasMaxCount ? `${cur.currentCount} / ${cur.maxCount}` : cur.currentCount ? "#" + cur.currentCount : ""
      if (key === sceneKey) return
      sceneKey = key
      const ico = el.querySelector(".bfxl-ico")
      ico.innerHTML = ""
      ico.appendChild(svgUse("skills", skill))
      const scene = el.querySelector(".bfxl-scene")
      el.querySelector(".bfxl-fx").innerHTML = ""
      // a guild trial: the site drawn for its project (lb_guild_*), else the skill's own backdrop
      const guildBg = trial?.from === "guild" && art("bg", "guild_" + skill) ? "guild_" + skill : null
      const bg = guildBg || (kind === "gather" && skill === "foraging" ? FORAGE_AREA[id] : skill)
      // a labyrinth room is in the labyrinth's depth backdrop
      const trialBg = trial?.from === "lab" ? labyrinthBg(labyrinth?.currentFloor) : null
      // on the window's root: docked, the backdrop fills the whole view around the (smaller) scene
      el.style.setProperty(
        "--bfxl-bg",
        trialBg && Assets.has("bg", trialBg)
          ? `url("${Assets.url("bg/" + trialBg + ".webp")}") center 70% / cover no-repeat, ${BG[kind]}`
          : (art("bg", bg) ? `url("${artUrl("bg/" + bg)}") center 75% / cover no-repeat, ` : "") + (BG[skill] || BG[kind]),
      )
      // hero: avatar + outfit, the skill's tool in the front hand
      const hero = el.querySelector(".bfxl-hero")
      hero.innerHTML = ""
      hero.getAnimations().forEach(a => a.cancel()) // e.g. faded out through a labyrinth gate
      hero.appendChild(heroBody(me))
      const made = makeTool(tools[skill], toolEnh[skill] || 0)
      const tool = made.node
      held = made.held
      hero.appendChild(tool)
      // target: the cow / tree / field, or the skill's station with the item on it
      const target = el.querySelector(".bfxl-target")
      target.innerHTML = ""
      target.className = "bfxl-target"
      posed = null
      tstage = null
      el.querySelectorAll(".bfxl-project,.bfxl-gate").forEach(e => e.remove())
      if (cur.trial && buildTrialScene(skill, id, target)) {
        // a trial's own scene: the guild's big project, or the labyrinth room's obstacle before its gate
      } else if (kind === "gather") {
        if (art("t", id)) {
          // the cow / tree pose frames, all loaded up front and switched by visibility
          const cow = id.endsWith("cow")
          target.classList.add(cow ? "cow" : "tree")
          posed = { kind: cow ? "cow" : "tree", imgs: {}, until: 0, base: "idle", next: performance.now() + 3000 }
          for (const p of cow ? COW_POSES : TREE_POSES) {
            const im = img(`t/${id}/${p}`, "pose")
            im.style.visibility = p === "idle" ? "visible" : "hidden"
            posed.imgs[p] = im
            target.appendChild(im)
          }
        } else if (art("plant", id)) {
          target.classList.add("plant")
          target.appendChild(img("plant/" + id, "cell"))
        } else target.appendChild(ACTION_ART.has(id) && sheet("actions") ? svgUse("actions", id) : svgUse("items", id))
      } else {
        target.classList.add("station")
        if (art("station", skill)) {
          target.classList.add("drawn", skill)
          target.appendChild(img("station/" + skill, "cell"))
        } else target.appendChild(svgUse("skills", skill))
        const w = document.createElement("div")
        w.className = "bfxl-work"
        // over the station: what comes out (alchemy: coins, what it decomposes into, or every possible transmute
        // result in turn); for enhancing the item itself
        const outs = kind === "make" ? [id] : kind === "alchemy" ? alchemyOutputs() : [work]
        outs.forEach((o, i) => {
          const sv = svgUse("items", o)
          if (i) sv.style.visibility = "hidden"
          w.appendChild(sv)
        })
        target.appendChild(w)
        // what goes in, laid out on the table top
        const mats = materials()
        if (mats.length) {
          const row = document.createElement("div")
          row.className = "bfxl-mats"
          row.style.top = (TABLE_TOP[skill] ?? 0.35) * 100 + "%"
          const [x0, x1] = TABLE_X[skill] || [0.04, 0.96]
          Object.assign(row.style, { left: x0 * 100 + "%", right: (1 - x1) * 100 + "%" })
          for (const [mid, n] of mats) {
            const m = document.createElement("div")
            m.className = "bfxl-mat"
            m.dataset.id = mid
            m.dataset.n = n
            m.appendChild(svgUse("items", mid))
            if (n > 1) m.insertAdjacentHTML("beforeend", `<b>${n >= 1000 ? fmt(n) : n}</b>`)
            row.appendChild(m)
          }
          target.appendChild(row)
          markShort()
        }
        if (kind === "enhancing") {
          // a slowly turning rune circle on the altar, sparks circling the item
          const rune = document.createElement("div")
          rune.className = "bfxl-rune"
          target.insertBefore(rune, w)
          const orbit = document.createElement("div")
          orbit.className = "bfxl-orbit"
          orbit.innerHTML = "<i></i><i></i><i></i>"
          target.appendChild(orbit)
          const t = document.createElement("div")
          t.className = "bfxl-enh"
          target.appendChild(t)
        }
      }
      showEnh()
      buildMates(skill) // after the target: the trial's layout decides where they stand
      buildStage(kind, target)
      relayout()
      if (walk.action !== cur.id) {
        walk.action = cur.id
        walk.x = -60
        // crafters fetch the first materials from the storage and lay them on the table
        walk.moves = staged && kind !== "gather" ? fetchMoves(null) : [{ to: workX(), work: true }]
        if (staged && kind !== "gather") setMats(false)
      } else walk.moves = walk.moves.map(m => (m.work ? { ...m, to: workX() } : m))
    }
    // positions measured from the laid-out scene: where the table stands, where the teapot / chisel aim. Measured
    // while the picture is hidden (window collapsed or an icon) they are all zero, so they are measured again the
    // first time it shows; a hero standing at a wrong spot walks to the right one
    let layoutDirty = true
    function relayout() {
      const scene = el.querySelector(".bfxl-scene")
      layoutDirty = !scene.offsetWidth
      if (layoutDirty || !cur) return
      const target = el.querySelector(".bfxl-target")
      const hero = el.querySelector(".bfxl-hero")
      const store = el.querySelector(".bfxl-store")
      const table = el.querySelector(".bfxl-table")
      // the table: behind the hero's back at the station, just right of the storage
      if (staged && table.style.display !== "none") table.style.left = Math.max(store.offsetLeft + store.offsetWidth - 14, workX() - table.offsetWidth + 22) + "px"
      // the teapot is lifted until its body is just over the station's table and its spout over its middle; the
      // chisel (held level) is raised until its tip is on the workbench's top, at most a little so it stays in the
      // hand (those two stations are drawn smaller for that)
      const hand = [workX() + HAND[0], hero.offsetTop + HAND[1]]
      if (held?.kind === "pot") POUR = [Math.max(-6, Math.min(20, target.offsetLeft + target.offsetWidth * 0.25 - hand[0])), Math.max(-16, Math.min(0, target.offsetTop + target.offsetHeight * 0.4 - 14 - hand[1]))]
      if (held?.kind === "chisel") {
        const r = TOOL_REACH.chisel * 0.9
        POUR = [Math.max(-10, Math.min(24, target.offsetLeft + target.offsetWidth * 0.3 - hand[0] - r)), Math.max(-16, Math.min(0, target.offsetTop + target.offsetHeight * 0.36 - hand[1]))]
      }
      const x = workX()
      placeMates()
      walk.moves = walk.moves.map(m => (m.work ? { ...m, to: x } : m))
      if (!walk.moves.length && Math.abs(walk.x - x) > 2 && walk.action === cur.id) walk.moves.push({ to: x, work: true })
    }
    // ----- storage and materials table -----
    // where things sit, as fractions of a prop's 512px cell: storage slots [x, the shelf / top they stand on]
    const STORE_SLOTS = {
      storage_wood: [[0.45, 0.4], [0.72, 0.4], [0.45, 0.625], [0.72, 0.625]],
      storage_crates: [[0.51, 0.37], [0.3, 0.62], [0.86, 0.49], [0.65, 0.7]],
      storage_arcane: [[0.4, 0.45], [0.66, 0.45], [0.4, 0.66], [0.66, 0.66]],
    }
    const PROP_TOP = 0.43 // the side tables' top
    function buildStage(kind, target) {
      const store = el.querySelector(".bfxl-store")
      const table = el.querySelector(".bfxl-table")
      store.innerHTML = ""
      table.innerHTML = ""
      const storeId = kind === "gather" ? "storage_crates" : kind === "make" ? "storage_wood" : "storage_arcane"
      staged = art("prop", storeId) && !cur.trial
      store.style.display = staged ? "" : "none"
      table.style.display = staged && kind !== "gather" ? "" : "none"
      if (!staged) return
      store.dataset.prop = storeId
      store.appendChild(img("prop/" + storeId, "cell"))
      STORE_SLOTS[storeId].forEach(([x, y], i) => {
        const slot = document.createElement("div")
        slot.className = "bfxl-slot"
        Object.assign(slot.style, { left: x * 100 + "%", top: y * 100 + "%" })
        slot.dataset.i = i
        store.appendChild(slot)
      })
      fillStore()
      if (kind === "gather") return
      table.appendChild(img("prop/" + (kind === "make" ? "table_wood" : "table_stone"), "cell"))
      // the materials move from the station onto the table
      const row = target.querySelector(".bfxl-mats")
      if (row) {
        Object.assign(row.style, { top: PROP_TOP * 100 + "%", left: "6%", right: "6%" })
        table.appendChild(row)
      }
    }
    // the items this action is about, with the inventory's counts: what comes out and what goes in
    function storeItems() {
      const skill = skillOf(cur.actionHrid)
      const kind = SKILL[skill][2]
      const g = gameData()
      const work = hashItem(cur.primaryItemHash)?.id
      let ids = []
      if (kind === "gather") ids = [...(g?.actions[cur.actionHrid]?.drops || []).map(([d]) => d), skill + "_essence"]
      else if (kind === "make") ids = [shortId(cur.actionHrid), ...materials().map(([d]) => d)]
      else if (kind === "alchemy") ids = [alchemyOutputs()[0], ...materials().map(([d]) => d)]
      else ids = [work, ...materials().map(([d]) => d)]
      return [...new Set(ids.filter(Boolean))].slice(0, 4)
    }
    // counts on the shelves: as few characters as possible (999, 12.3K, 123K, 1.2M)
    const short = n => (n >= 1e6 ? +(n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : n >= 1e3 ? +(n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "K" : String(n))
    const invCount = id => Object.entries(inv).reduce((t, [k, c]) => (k.startsWith(`/item_locations/inventory::/items/${id}::`) ? t + c : t), 0)
    function fillStore() {
      const slots = el?.querySelectorAll(".bfxl-slot")
      if (!slots?.length || !cur) return
      const items = storeItems()
      slots.forEach((slot, i) => {
        const id = items[i]
        if (slot.dataset.id !== (id || "")) {
          slot.dataset.id = id || ""
          slot.innerHTML = ""
          if (id) {
            slot.appendChild(svgUse("items", id))
            slot.appendChild(document.createElement("b"))
          }
        }
        const b = slot.querySelector("b")
        if (b) b.textContent = short(invCount(id))
      })
    }
    // a slot takes something in (or gives it out): a little bounce
    function bumpStore(id) {
      fillStore()
      const slot = [...(el.querySelectorAll(".bfxl-slot") || [])].find(s => s.dataset.id === id) || el.querySelector(".bfxl-slot")
      slot?.animate([{ transform: "translate(-50%,-100%) scale(1)" }, { transform: "translate(-50%,-100%) scale(1.35)" }, { transform: "translate(-50%,-100%) scale(1)" }], { duration: 350 })
    }
    // the table's materials shown / hidden; laid down with a little drop
    function setMats(on) {
      const row = el.querySelector(".bfxl-mats")
      if (!row) return
      row.style.visibility = on ? "visible" : "hidden"
      // drop what is left of the fly-into-the-station animations
      for (const m of row.children) m.getAnimations().forEach(a => a.cancel())
      if (on) {
        ;[...row.children].forEach((m, i) => m.animate([{ transform: "translateY(-10px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 260, delay: i * 70, easing: "ease-out", fill: "backwards" }))
        markShort()
      }
    }
    const storeX = () => 26
    // to the storage (leaving the product there), to the table with the next materials, back to the station
    function fetchMoves(product) {
      const first = materials()[0]?.[0] || null
      const table = el.querySelector(".bfxl-table")
      return [
        { to: storeX(), carry: product, speed: 190, then: () => (product && bumpStore(product), first && bumpStore(first)) },
        { to: () => table.offsetLeft + table.offsetWidth / 2 - HAND[0] + 6, carry: first, speed: 190, then: () => setMats(true) },
        { to: workX(), work: true, speed: 160 },
      ]
    }
    // where the hero stands to work: the tool's reach short of the target's front
    function workX() {
      const target = el?.querySelector(".bfxl-target")
      if (!target || !cur) return 62
      const kind = SKILL[skillOf(cur.actionHrid)][2]
      const reach = held ? TOOL_REACH[held.kind] || 44 : 30
      const front = target.offsetLeft + target.offsetWidth * (kind === "gather" ? 0.2 : 0.1)
      return Math.max(4, Math.min(150, front - HAND[0] - reach * 0.45))
    }
    // carries the product (icon over the head) to the left edge, drops it, walks back
    function carryOut(item) {
      const back = workX()
      walk.moves.push({ to: staged ? storeX() : 6, carry: item, speed: 190, then: () => staged && bumpStore(item) }, { to: back, work: true, speed: 190 })
    }
    function img(path, cls) {
      const im = document.createElement("img")
      im.src = artUrl(path)
      im.draggable = false
      if (cls) im.className = cls
      return im
    }
    // shows a pose of the drawn cow / tree for ms, then its idle again
    function setPose(p, ms) {
      if (!posed?.imgs[p]) return
      for (const [k, im] of Object.entries(posed.imgs)) im.style.visibility = k === p ? "visible" : "hidden"
      posed.until = performance.now() + ms
    }
    // idle life between hits: the cow grazes now and then, the tree sways
    function idlePose(t) {
      if (!posed) return
      if (t < posed.until) return
      if (t > posed.next) {
        posed.next = t + 3000 + Math.random() * 3000
        if (posed.kind === "cow") return setPose(Math.random() < 0.7 ? "graze" : "moo", 1400)
        setPose("swayl", 500)
        return later(500, () => setPose("swayr", 500))
      }
      setPose("idle", 0)
    }
  // LZString.decompressFromUTF16 (lz-string 1.5, MIT): the game keeps its static data in localStorage this way
  function lzUTF16(input) {
    if (!input) return null
    const reset = 16384
    const next = i => input.charCodeAt(i) - 32
    const dict = [0, 1, 2]
    const out = []
    let enlargeIn = 4
    let dictSize = 4
    let numBits = 3
    let val = next(0)
    let pos = reset
    let index = 1
    const read = n => {
      let bits = 0
      for (let power = 1, max = 1 << n; power !== max; power <<= 1) {
        const b = val & pos
        pos >>= 1
        if (pos === 0) {
          pos = reset
          val = next(index++)
        }
        if (b > 0) bits |= power
      }
      return bits
    }
    const first = read(2)
    if (first === 2) return ""
    let w = String.fromCharCode(read(first === 0 ? 8 : 16))
    dict[3] = w
    out.push(w)
    for (;;) {
      if (index > input.length) return ""
      let c = read(numBits)
      if (c === 2) return out.join("")
      if (c < 2) {
        dict[dictSize++] = String.fromCharCode(read(c === 0 ? 8 : 16))
        c = dictSize - 1
        if (--enlargeIn === 0) enlargeIn = 1 << numBits++
      }
      const entry = dict[c] !== undefined ? dict[c] : c === dictSize ? w + w.charAt(0) : null
      if (entry === null) return null
      out.push(entry)
      dict[dictSize++] = w + entry.charAt(0)
      w = entry
      if (--enlargeIn === 0) enlargeIn = 1 << numBits++
    }
  }
    // ----- the game's static data (localStorage initClientData) and the character's buffs, for the info lines -----
    let gd = null
    let gdTried = 0
    function gameData() {
      if (gd || Date.now() - gdTried < 10000) return gd
      gdTried = Date.now()
      try {
        const all = JSON.parse(lzUTF16(W.localStorage.getItem("initClientData")) || "null")
        const h = all?.clientData || all?.data || all
        if (!h?.actionDetailMap) return null
        // only what the info lines need
        const actions = {}
        const pairs = list => (list || []).map(x => [shortId(x.itemHrid), x.count])
        for (const [k, a] of Object.entries(h.actionDetailMap)) actions[k] = { level: a.levelRequirement?.level || 0, time: (a.baseTimeCost || 0) / 1e9, inputs: pairs(a.inputItems), upgrade: shortId(a.upgradeItemHrid) || null, drops: pairs(a.dropTable) }
        const items = {}
        for (const [k, it] of Object.entries(h.itemDetailMap || {})) items[shortId(k)] = { level: it.itemLevel || 0, transmute: it.alchemyDetail?.transmuteSuccessRate, bulk: it.alchemyDetail?.bulkMultiplier || 1, costs: pairs(it.enhancementCosts), decompose: pairs(it.alchemyDetail?.decomposeItems), drops: pairs(it.alchemyDetail?.transmuteDropTable) }
        gd = { actions, items, enhance: h.enhancementLevelSuccessRateTable || [] }
      } catch (e) {
        if (cfg.debug) console.warn("[生活动画] initClientData", e) // #dev
      }
      return gd
    }
    const buffMaps = {} // "<source>ActionTypeBuffsMap" -> action type -> buffs (equipment, teas, house, community, ...)
    function setBuffMaps(obj) {
      for (const k of Object.keys(obj)) if (/ActionTypeBuffsMap$/.test(k)) buffMaps[k] = obj[k] || {}
    }
    // summed buffs of one action type: buff type (short) -> value
    function buffsFor(skill) {
      const out = {}
      for (const m of Object.values(buffMaps))
        for (const b of m?.["/action_types/" + skill] || []) {
          const t = shortId(b.typeHrid)
          out[t] = (out[t] || 0) + (b.flatBoost || 0) + (b.ratioBoost || 0)
        }
      return out
    }
    const pctS = v => (v >= 0 ? "+" : "") + (Math.round(v * 1000) / 10).toString() + "%"
    // the game's action panel in two lines: time and speed, efficiency, actions per hour; experience, drops and
    // finds, or the success rate for enhancing and alchemy
    function infoLines() {
      if (trial) return trialLines()
      if (!isLife(cur)) return townLines()
      const skill = skillOf(cur.actionHrid)
      const kind = SKILL[skill][2]
      const b = buffsFor(skill)
      const g = gameData()
      const a = g?.actions[cur.actionHrid]
      const level = (skills["/skills/" + skill]?.level || 0) + (b[skill + "_level"] || 0)
      const speed = b.action_speed || 0
      const time = a?.time ? a.time / (1 + speed) : dur()
      const work = hashItem(cur.primaryItemHash)
      const item = work && g?.items[work.id]
      // enhancing has no efficiency; alchemy is levelled against the item, the rest against the action
      const req = kind === "alchemy" ? item?.level || 0 : a?.level || 0
      const eff = kind === "enhancing" ? 0 : Math.max(0, level - req) * 0.01 + (b.efficiency || 0)
      const line1 = [`⏱ ${time.toFixed(2)}s`, `${L("行动速度", "Speed")} ${pctS(speed)}`]
      if (kind !== "enhancing") line1.push(`${L("效率", "Efficiency")} ${pctS(eff)}`)
      line1.push(`≈${Math.round((3600 / time) * (1 + eff))}${L("次/时", "/h")}`)
      const line2 = [`${L("经验", "XP")} ${pctS(b.wisdom || 0)}`]
      if (kind === "gather") {
        line2.push(`${L("采集数量", "Gathering")} ${pctS(b.gathering || 0)}`)
        if (b.processing) line2.push(`${L("加工", "Processing")} ${pctS(b.processing)}`)
      }
      if (kind === "make") {
        if (b.artisan) line2.push(`${L("工匠", "Artisan")} ${pctS(b.artisan)}`)
        if (b.gourmet) line2.push(`${L("美食", "Gourmet")} ${pctS(b.gourmet)}`)
      }
      if (kind === "enhancing" && item && g) {
        const lv = work.level
        const base = g.enhance[lv] ?? 0
        const ratio = (level >= item.level ? (level - item.level) * 0.0005 : -0.5 * (1 - level / item.level)) + (b.enhancing_success || 0)
        line2.unshift(`${L("成功率", "Success")} ${(Math.min(1, base * (1 + ratio)) * 100).toFixed(1)}% (+${lv}→+${lv + 1})`)
        if (b.blessed) line2.push(`${L("福气", "Blessed")} ${pctS(b.blessed)}`)
        if (cur.enhancingMaxLevel) line2.push(`${L("目标", "Target")} +${cur.enhancingMaxLevel}`)
      }
      if (kind === "alchemy" && g) {
        const how = shortId(cur.actionHrid)
        const base = how === "coinify" ? 0.7 : how === "decompose" ? 0.6 : item?.transmute || 0
        const cat = hashItem(cur.secondaryItemHash)?.id || ""
        const catalyst = cat === "prime_catalyst" ? 0.25 : /catalyst/.test(cat) ? 0.15 : 0
        const lvRatio = item && level < item.level ? -0.9 * (1 - level / item.level) : 0
        if (base) line2.unshift(`${L("成功率", "Success")} ${(Math.min(1, base * (1 + lvRatio + (b.alchemy_success || 0) + catalyst)) * 100).toFixed(1)}%`)
      }
      line2.push(`${L("精华发现", "Essence")} ${pctS(b.essence_find || 0)}`, `${L("稀有发现", "Rare")} ${pctS(b.rare_find || 0)}`)
      return [line1, line2]
    }
    function showInfo() {
      const box = el?.querySelector(".bfxl-info")
      if (!box) return
      box.style.display = cfg.lifeInfo ? "" : "none"
      if (!cfg.lifeInfo) return
      const html = infoLines()
        .map(l => `<div>${l.map(x => `<span>${x}</span>`).join("")}</div>`)
        .join("")
      if (box.innerHTML !== html) box.innerHTML = html
    }
    // the item's level over it; the altar's runes and sparks in the colour of the level it is going for, more
    // sparks for higher levels, turning hues from +15
    // where the table top is on each drawn station (fraction of its height from the top)
    const TABLE_TOP = { cheesesmithing: 0.44, crafting: 0.4, tailoring: 0.4, cooking: 0.28, brewing: 0.36, alchemy: 0.42, enhancing: 0.5 }
    // and its left / right ends where that is not the whole width (the anvil stands left of the furnace)
    const TABLE_X = { cheesesmithing: [0, 0.55] }
    // [item, count] going in per action: the recipe (and the item it upgrades); for enhancing the item's costs and the
    // protection; for alchemy the item in its batch size and the catalyst
    function alchemyOutputs() {
      const work = hashItem(cur?.primaryItemHash)
      const it = gameData()?.items[work?.id]
      const how = shortId(cur?.actionHrid)
      if (how === "coinify") return ["coin"]
      if (how === "decompose") return it?.decompose?.length ? it.decompose.map(([d]) => d) : [work?.id]
      if (how === "transmute") return it?.drops?.length ? it.drops.map(([d]) => d) : [work?.id]
      return [work?.id]
    }
    function materials() {
      const g = gameData()
      if (!g || !cur) return []
      const skill = skillOf(cur.actionHrid)
      const kind = SKILL[skill][2]
      const work = hashItem(cur.primaryItemHash)
      const extra = hashItem(cur.secondaryItemHash)
      let out = []
      if (kind === "make") {
        const a = g.actions[cur.actionHrid]
        out = [...(a?.inputs || [])]
        if (a?.upgrade) out.unshift([a.upgrade, 1])
      } else if (kind === "enhancing") {
        out = [...(g.items[work?.id]?.costs || [])]
        if (extra) out.push([extra.id, 1])
      } else if (kind === "alchemy" && work) {
        out = [[work.id, g.items[work.id]?.bulk || 1]]
        if (extra) out.push([extra.id, 1])
      }
      return out.filter(([id]) => id).slice(0, 5)
    }
    // the inventory runs short of one: shown faded
    function markShort() {
      // #dev-start
      if (labState) return
      // #dev-end
      for (const m of el?.querySelectorAll(".bfxl-mat") || []) {
        const prefix = `/item_locations/inventory::/items/${m.dataset.id}::`
        const have = Object.entries(inv).reduce((t, [k, c]) => (k.startsWith(prefix) ? t + c : t), 0)
        m.classList.toggle("short", m.dataset.id !== "coin" && have < +m.dataset.n)
      }
    }
    // the table's materials go into the station; with a storage the hero takes the product there and brings the next
    // materials (on short actions every third time; otherwise the table is laid again at once)
    function useMaterials(delay, kind, gains, key) {
      if (staged) {
        const table = el.querySelector(".bfxl-table")
        const target = el.querySelector(".bfxl-target")
        const dx = target.offsetLeft + target.offsetWidth / 2 - (table.offsetLeft + table.offsetWidth / 2)
        const mats = [...el.querySelectorAll(".bfxl-mat")]
        mats.forEach((m, i) => m.animate([{ transform: "none", opacity: 1 }, { transform: `translate(${dx}px,-30px) scale(.3)`, opacity: 0 }], { duration: 450, delay: delay + i * 60, easing: "ease-in", fill: "forwards" }))
        later(delay + 450 + mats.length * 60, () => key === sceneKey && setMats(false))
        const fetch = dur() >= 2.5 || ++walk.carried % 3 === 0
        if (fetch) {
          const main = gains.find(g => !MINOR.test(g.id) && !RARE.test(g.id)) || gains[0]
          later(delay + 700, () => key === sceneKey && walk.moves.push(...fetchMoves(main?.id || null)))
        } else later(delay + 900, () => key === sceneKey && setMats(true))
        return
      }
      const mats = [...el.querySelectorAll(".bfxl-mat")]
      mats.forEach((m, i) =>
        m.animate(
          [
            { transform: "none", opacity: 1 },
            { transform: `translate(${(mats.length / 2 - i - 0.5) * 12}px,-6px) scale(.2)`, opacity: 0, offset: 0.35 },
            { transform: "translateY(-8px) scale(.6)", opacity: 0, offset: 0.7 },
            { transform: "none", opacity: 1 },
          ],
          { duration: 1100, delay: delay + i * 40, easing: "ease-in-out" },
        ),
      )
      later(delay + 1100, markShort)
    }
    function showEnh() {
      const t = el?.querySelector(".bfxl-enh")
      if (!t) return
      t.textContent = "+" + enhLevel
      t.style.color = enhColor(enhLevel)
      const target = el.querySelector(".bfxl-target")
      const next = enhLevel + 1
      const st = enhStage(next)
      target.style.setProperty("--enh", next >= 15 ? "#ff4d4d" : enhColor(next))
      for (let i = 0; i <= 5; i++) target.classList.toggle("st" + i, i === st)
      const orbit = el.querySelector(".bfxl-orbit")
      const n = 3 + st
      if (orbit && orbit.childElementCount !== n) {
        orbit.innerHTML = ""
        for (let i = 0; i < n; i++) {
          const d = document.createElement("i")
          const a = (i / n) * Math.PI * 2
          d.style.transform = `translate(${28 * Math.cos(a)}px,${28 * Math.sin(a)}px)`
          orbit.appendChild(d)
        }
      }
    }

    function setCarry(item) {
      const hero = el.querySelector(".bfxl-hero")
      hero?.querySelector(".bfxl-carry")?.remove()
      if (!item || !hero) return
      const c = document.createElement("div")
      c.className = "bfxl-carry"
      c.appendChild(svgUse("items", item))
      hero.appendChild(c)
    }
    function dropCarry() {
      const c = el.querySelector(".bfxl-carry")
      if (!c) return
      c.animate([{ transform: "translateY(0) scale(1)", opacity: 1 }, { transform: "translateY(40px) scale(.6)", opacity: 0 }], { duration: 350, easing: "ease-in" }).onfinish = () => c.remove()
    }
    // ----- motion: the tool swings N times per action, the target reacts on each hit -----
    function pose(style, f) {
      const ease = x => x * x * (3 - 2 * x)
      if (style === "chop") {
        if (f < 0.6) return [-55 * ease(f / 0.6), 0, 0]
        if (f < 0.72) return [-55 + 85 * ((f - 0.6) / 0.12), 0, 0]
        return [30 * (1 - ease((f - 0.72) / 0.28)), 0, 0]
      }
      if (style === "stir") return [14 * Math.sin(2 * Math.PI * f), 7 * Math.cos(2 * Math.PI * f), 0]
      if (style === "stitch") return [-8, 0, -12 * Math.abs(Math.sin(Math.PI * f))]
      if (style === "pour") return [f < 0.5 ? 50 * ease(f / 0.5) : 50 * (1 - ease((f - 0.5) / 0.5)), 0, -4 * Math.sin(Math.PI * f)]
      return [12 * Math.sin(2 * Math.PI * f), 3 * Math.sin(2 * Math.PI * f), 0] // squeeze
    }
    const HIT = { chop: 0.72, stir: 0.5, stitch: 0.5, pour: 0.5, squeeze: 0.5 }
    // drawn tools: the front hand on the 96px hero box (as the battle stage's held weapons), how far each kind
    // reaches from the grip (px), the frame's height / width (432x560 cells), and one motion per kind
    const HAND = [76, 63]
    const TOOL_REACH = { pot: 34, alembic: 36, needle: 34, chisel: 38, brush: 40 }
    const TOOL_FRAME = 560 / 432
    let POUR = [14, -26] // how far the teapot / chisel is brought to the table top (set per scene)
    // seconds per stroke, the moment it lands, and the target's reaction (a style of the icon motions)
    const TOOL_MOVE = {
      hatchet: [1.7, 0.68, "chop"],
      hammer: [1.5, 0.68, "chop"],
      brush: [0.9, 0.5, "squeeze"],
      shears: [0.9, 0.5, "squeeze"],
      chisel: [0.7, 0.85, "chop"],
      needle: [0.9, 0.75, "stitch"],
      spatula: [1.4, 0.45, "stir"],
      pot: [2.6, 0.55, "pour"],
      alembic: [1.6, 0.5, "pour"],
      enhancer: [1.6, 0.62, "pour"],
    }
    // -> [direction the tool points (deg, 0 = toward the target, -90 = up) or null, dx, dy, extra turn (deg)]
    function toolPose(kind, f) {
      const ease = x => x * x * (3 - 2 * x)
      const seg = (a, b) => Math.max(0, Math.min(1, (f - a) / (b - a)))
      const wave = Math.sin(2 * Math.PI * f)
      switch (kind) {
        case "hatchet":
        case "hammer": {
          // raised back over the shoulder, then swung down onto the tree / anvil
          const hitAt = kind === "hammer" ? 30 : 15
          if (f < 0.55) return [-70 - 70 * ease(seg(0, 0.55)), 0, -3 * ease(seg(0, 0.55)), 0]
          if (f < 0.68) return [-140 + (140 + hitAt) * seg(0.55, 0.68), 4 * seg(0.55, 0.68), 0, 0]
          return [hitAt - (hitAt + 70) * ease(seg(0.68, 1)), 4 * (1 - seg(0.68, 1)), 0, 0]
        }
        case "brush": // long strokes along the cow's side
          return [-10 + 6 * wave, 12 * (0.5 - 0.5 * Math.cos(2 * Math.PI * f)) - 6, 0, 0]
        case "shears": {
          const b = Math.sin(Math.PI * f) ** 3
          return [-20 - 10 * b, 9 * b, -2 * b, 0]
        }
        case "chisel": {
          // held on the workbench's top: pulled back slowly, then a quick tap
          const [ax, ay] = POUR
          if (f < 0.75) return [0, ax - 4 * ease(seg(0, 0.75)), ay, 0]
          if (f < 0.85) return [0, ax - 4 + 10 * seg(0.75, 0.85), ay, 0]
          return [0, ax + 6 * (1 - ease(seg(0.85, 1))), ay, 0]
        }
        case "needle": // loops through the cloth
          return [-30 + 40 * wave, 6 * Math.cos(2 * Math.PI * f), -9 * wave, 0]
        case "spatula": // slides under, flips, comes back
          if (f < 0.35) return [10, 6 * ease(seg(0, 0.35)), 0, 0]
          if (f < 0.5) return [10 - 70 * seg(0.35, 0.5), 6, -6 * seg(0.35, 0.5), 0]
          return [-60 + 70 * ease(seg(0.5, 1)), 6 * (1 - ease(seg(0.5, 1))), -6 * (1 - ease(seg(0.5, 1))), 0]
        case "pot": {
          // lifted over the table, tilted to pour, set back upright, lowered
          const lift = f < 0.25 ? ease(seg(0, 0.25)) : f < 0.9 ? 1 : 1 - ease(seg(0.9, 1))
          const tilt = f < 0.25 ? 0 : f < 0.45 ? ease(seg(0.25, 0.45)) : f < 0.75 ? 1 : f < 0.9 ? 1 - ease(seg(0.75, 0.9)) : 0
          return [null, POUR[0] * lift, POUR[1] * lift, 55 * tilt]
        }
        case "alembic": // swirled
          return [null, 0, -3 * Math.abs(wave), 18 * wave]
        case "enhancer": {
          // a horn: aimed at the item on the altar, drawing breath, then a pulse with a small recoil
          const p = f < 0.6 ? ease(seg(0, 0.6)) : 1 - ease(seg(0.6, 1))
          return [-28 - 6 * p, -3 * p + (f > 0.6 && f < 0.7 ? -2 : 0), -2 * p, 0]
        }
      }
      return [null, 0, 0, 0]
    }
    // ----- the town -----
    // The window's idle view and the walk between two jobs: the hero lives in a little town whose skilling buildings
    // are the game's house rooms (an unbuilt room is an empty lot with its sign, a built one carries its level and
    // gets a gold trim from level 7). When the action changes the town fades in over the old scene, the hero walks
    // from the old building's door to the new one and goes in, and the new scene fades in. With nothing to do the
    // hero rests at home; in a fight they are out through the town gate.
    // [id, skill, width]: along the street from the gate (left) on
    const TOWN = [["gate", null, 80], ["home", null, 80], ["fountain", null, 62], ["dairy_barn", "milking", 80], ["garden", "foraging", 80], ["log_shed", "woodcutting", 80], ["market", null, 62], ["forge", "cheesesmithing", 80], ["workshop", "crafting", 80], ["sewing_parlor", "tailoring", 80], ["lamp", null, 62], ["kitchen", "cooking", 80], ["brewery", "brewing", 80], ["laboratory", "alchemy", 80], ["observatory", "enhancing", 80]]
    const TOWN_X = {} // a building's middle
    let townW = 12
    for (const [id, , w] of TOWN) {
      TOWN_X[id] = townW + w / 2
      townW += w + 6
    }
    townW += 6
    const ROOM_OF = Object.fromEntries(TOWN.filter(b => b[1]).map(([id, sk]) => [sk, id]))
    const SKILL_AT = Object.fromEntries(TOWN.filter(b => b[1]).map(([id, sk]) => [id, sk]))
    // the backdrop (lb_town) is drawn 400 px wide: its far hills stand still behind the street and drift a little
    // (parallax); its cobbles (from row 195 down) are laid along the whole street and move with the buildings
    const TOWN_BG_W = 400
    const TOWN_BG_Y = 95
    const houses = {} // house room id -> level (from the messages; empty until the character data came)
    function setHouses(obj) {
      const map = obj.characterHouseRoomMap || (obj.characterHouseRoom ? { x: obj.characterHouseRoom } : null)
      for (const r of Object.values(map || {})) if (r?.houseRoomHrid) houses[shortId(r.houseRoomHrid)] = r.level || 0
      for (const r of obj.endCharacterHouseRooms || []) if (r?.houseRoomHrid) houses[shortId(r.houseRoomHrid)] = r.level || 0
    }
    // out: shown by the title bar's button while the job goes on; free: the camera was moved by hand (drag, wheel,
    // the edge arrows) and no longer follows the hero, until the badge to them is clicked or they set off on a walk
    // more than five seconds after the last move
    const town = { at: null, trip: null, x: 0, cam: 0, snap: true, key: "", zAt: 0, lastT: 0, out: false, free: false, dragging: false, dragAt: 0, vel: 0, hold: 0 }
    const placeOf = a => (!a ? "home" : isLife(a) ? ROOM_OF[skillOf(a.actionHrid)] : "gate")
    // where the hero stands at a place: beside the home's door, at a building's door, out through the gate
    const restX = p => TOWN_X[p] + (p === "home" ? 30 : p === "gate" ? -14 : 0)
    const inTown = () => !!el && !docked && !cfg.lifeIcon && el.classList.contains("intown")
    function heroBody(me) {
      const body = document.createElementNS(SVGNS, "svg")
      body.setAttribute("viewBox", "0 0 100 100")
      for (const [sh, sid] of [["avatars", me.avatar], ["avatar_outfits", me.outfit]]) {
        if (!sid || !sheet(sh)) continue
        const u = document.createElementNS(SVGNS, "use")
        u.setAttribute("href", sheet(sh) + "#" + sid)
        body.appendChild(u)
      }
      return body
    }
    // the place follows the running action: a walk there while the window is open, a jump otherwise
    function townSync() {
      if (!cfg.lifeTown || trial || docked) {
        el.classList.remove("intown", "canout")
        town.trip = null
        town.out = false
        return
      }
      // idle or fighting the town is shown anyway: the button is for a running job
      if (!isLife(cur)) town.out = false
      const to = placeOf(cur)
      if (town.at === null || !visible() || cfg.lifeMin || cfg.lifeIcon) {
        town.at = to
        town.trip = null
        town.x = restX(to)
        town.snap = true
      } else if (to !== (town.trip ? town.trip.to : town.at)) {
        // from a job or back through the gate the hero comes out of the door first; a new goal mid-walk turns them
        const from = town.trip || town.at === "home" ? town.x : TOWN_X[town.at]
        town.trip = { to, from, t0: performance.now(), appear: !town.trip && town.at !== "home" }
        if (!inTown()) town.snap = true
        if (performance.now() - town.dragAt > 5000) town.free = false
      }
      const show = town.out || !!town.trip || !isLife(cur)
      if (!show) town.free = false
      el.classList.toggle("intown", show)
      el.classList.toggle("canout", isLife(cur))
      const btn = el.querySelector(".bfxl-out")
      btn.textContent = town.out ? "🏠" : "🏘"
      btn.title = town.out ? L("回屋", "Back inside") : L("出门看看小镇", "Step out into the town")
      buildTown()
    }
    function buildTown() {
      const me = Looks.me
      const key = [JSON.stringify(houses), me.avatar, me.outfit, sheet("avatars"), sheet("skills"), Assets.get("rev")].join("|")
      if (key === town.key) return
      town.key = key
      const bg = art("bg", "town") ? `url("${artUrl("bg/town")}")` : ""
      const box = el.querySelector(".bfxl-town")
      box.style.background = bg ? `${bg} 0 ${-TOWN_BG_Y}px / ${TOWN_BG_W}px auto no-repeat` : ""
      delete box.__bfx // the shorthand reset its position
      const strip = el.querySelector(".bfxl-strip")
      strip.innerHTML = ""
      town.goal = undefined
      strip.style.width = townW + "px"
      const street = document.createElement("div")
      street.className = "bfxl-street"
      if (bg) street.style.background = `${bg} 0 ${-(100 + TOWN_BG_Y)}px / ${TOWN_BG_W}px auto repeat-x`
      strip.appendChild(street)
      for (const [id, skill] of TOWN) {
        const b = document.createElement("div")
        const lv = skill ? houses[id] : undefined
        const lot = lv === 0
        const pic = lot ? "lot" : id
        b.className = "bfxl-bld" + (skill || id === "gate" || id === "home" ? "" : " deco") + (lv >= 7 ? " lv7 lv4" : lv >= 4 ? " lv4" : "")
        b.dataset.id = id
        b.style.left = TOWN_X[id] + "px"
        if (art("town", pic)) {
          b.classList.add("drawn")
          b.appendChild(img("town/" + pic))
        } else {
          if (skill && !lot) b.appendChild(svgUse("skills", skill))
          b.style.setProperty("--roof", { gate: "#8a8f9a", fountain: "#7aa6c8", market: "#d65a5a", lamp: "#556" }[id] || "#b5523b")
        }
        // a lot's sign shows what will be built there; a built room its level
        if (lot) {
          const sign = document.createElement("div")
          sign.className = "bfxl-sign"
          sign.appendChild(svgUse("skills", skill))
          b.appendChild(sign)
        } else if (lv > 0) b.insertAdjacentHTML("beforeend", `<span class="bfxl-lv">Lv${lv}</span>`)
        strip.appendChild(b)
      }
      strip.insertAdjacentHTML("beforeend", '<div class="bfxl-tring"></div>')
      const hero = document.createElement("div")
      hero.className = "bfxl-thero"
      hero.appendChild(document.createElement("div")).appendChild(heroBody(me))
      strip.appendChild(hero)
      // the visitors stay through a rebuild
      for (const v of visitors) strip.appendChild(v.el)
      strip.insertAdjacentHTML("beforeend", '<div class="bfxl-tfx"></div>')
    }
    // the title bar and the bar under the picture while the town is shown
    function setTownHead() {
      const name = cur ? actionName() : L("小镇 · 休息中", "Town · resting")
      el.querySelector(".bfxl-name").textContent = name
      el.querySelector(".bfxl-count").textContent = isLife(cur) && cur.hasMaxCount ? `${cur.currentCount} / ${cur.maxCount}` : ""
      const ico = el.querySelector(".bfxl-ico")
      ico.title = name
      const k = isLife(cur) ? skillOf(cur.actionHrid) : cur ? "combat" : "house"
      if (ico.dataset.k !== k) {
        ico.dataset.k = k
        ico.innerHTML = ""
        ico.appendChild(svgUse(isLife(cur) ? "skills" : "misc", k))
      }
      el.querySelector(".bfxl-bar i").style.width = "0"
      el.querySelector(".bfxl-bar span").textContent = isLife(cur) ? L("前往中…", "On the way…") : cur ? L("出征中", "Out fighting") : L("空闲", "Idle")
    }
    function townLines() {
      const rooms = TOWN.filter(b => b[1]).map(b => houses[b[0]])
      if (!rooms.some(v => v !== undefined)) return []
      const built = rooms.filter(v => v > 0)
      return [[`${L("小镇", "Town")}: ${L("已建", "built")} ${built.length} / ${rooms.length}`, `${L("房屋总等级", "House levels")} ${built.reduce((a, b) => a + b, 0)}`]]
    }
    function townPop(node, x, y, ms) {
      const box = el.querySelector(".bfxl-tfx")
      if (!box) return
      const e = document.createElement("div")
      e.append(node)
      box.appendChild(e)
      e.animate([{ transform: `translate(${x}px,${y}px)`, opacity: 0 }, { opacity: 1, offset: 0.2 }, { transform: `translate(${x + 10}px,${y - 24}px)`, opacity: 0 }], { duration: ms, easing: "ease-out" }).onfinish = () => e.remove()
    }
    // a completion while the town is shown: what came out pops over the job's building, a rare find lights it up
    function townDone(skill, gains) {
      const id = ROOM_OF[skill]
      const b = el.querySelector(`.bfxl-bld[data-id="${id}"]`)
      if (!b) return
      gains.slice(0, 2).forEach((g, i) => {
        const n = document.createElement("span")
        n.append(svgUse("items", g.id), "+" + fmt(g.n))
        setTimeout(() => townPop(n, TOWN_X[id] + 12, 34, 1700), i * 300)
      })
      if (gains.some(g => ["sage", "legend", "meteor", "crate"].includes(rarity(g.id))))
        b.animate([{ filter: "none" }, { filter: "brightness(1.7) drop-shadow(0 0 8px #ffd75a)", transform: "translateX(-50%) scale(1.08)" }, { filter: "none" }], { duration: 1400 })
    }
    // someone talking in a chat channel comes to town and stays ten minutes (what they said is not shown; talking
    // again keeps them longer): their own look when known (a guild member, a profile seen), else a plain avatar and
    // outfit picked by their name. With the town on screen they walk in from the edge of the view
    const STAY_MS = 600000
    const visitors = [] // { name, el, x, to, dir, until, next }
    function visitorLook(name) {
      const g = Object.values(guildChars).find(c => c?.name === name)
      if (g?.avatarHrid) return { avatar: shortId(g.avatarHrid), outfit: shortId(g.avatarOutfitHrid) }
      const prof = Looks.profileOf(name)
      if (prof?.avatar) return prof
      const doll = Doll.list("a_").map(k => k.slice(2)).filter(k => !k.startsWith("custom_"))
      const pool = doll.length ? doll : ["blue_person_1", "blue_person_2", "blue_person_3", "bunny_1", "bunny_2", "cat_1", "cat_2", "cat_3"]
      let h = 0
      for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
      const wear = ["tshirt_default", "suit_1", "suit_3", "suit_5", "dress_1", "dress_4", "dress_7", "mage_1", "mage_2", "ranger_1", "ranger_2", "warrior_1", "warrior_2", "pirate_1", "tshirt_milking", "tshirt_cooking", "uniform_crafting", "uniform_brewing"]
      return { avatar: pool[h % pool.length], outfit: wear[(h >>> 8) % wear.length] }
    }
    // a profile opened (a click on someone in chat) or the guild's members came: the visitors take their real looks
    function restyleVisitors() {
      for (const v of visitors) v.el.firstChild.replaceChildren(heroBody(visitorLook(v.name)))
    }
    function townVisitor(m) {
      const name = m?.sName
      const strip = el?.querySelector(".bfxl-strip")
      if (!name || m.gm || name === Looks.me.name || !strip || !cfg.lifeTown) return
      const now = performance.now()
      const seen = visitors.find(v => v.name === name)
      if (seen) return (seen.until = now + STAY_MS)
      const e = document.createElement("div")
      e.className = "bfxl-tvis"
      e.appendChild(document.createElement("div")).appendChild(heroBody(visitorLook(name)))
      e.insertAdjacentHTML("beforeend", "<b></b>")
      e.lastChild.textContent = name
      strip.appendChild(e)
      const v = { name, el: e, until: now + STAY_MS, next: now + 15000 + Math.random() * 45000 }
      if (inTown() && visible()) {
        v.dir = Math.random() < 0.5 ? 1 : -1
        v.x = v.dir > 0 ? town.cam - 40 : town.cam + 380
        v.to = town.cam + 40 + Math.random() * 260
      } else {
        v.x = v.to = 20 + Math.random() * (townW - 40)
        v.dir = Math.random() < 0.5 ? 1 : -1
      }
      e.style.transform = `translateX(${v.x}px)`
      visitors.push(v)
    }
    function moveVisitors(now, dt) {
      for (let i = visitors.length - 1; i >= 0; i--) {
        const v = visitors[i]
        if (now > v.until) {
          v.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 800 }).onfinish = () => v.el.remove()
          visitors.splice(i, 1)
          continue
        }
        // now and then a few steps along the street
        if (now > v.next && Math.abs(v.to - v.x) < 1) {
          v.next = now + 15000 + Math.random() * 45000
          v.to = Math.max(20, Math.min(townW - 20, v.x + (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * 60)))
        }
        const d = v.to - v.x
        const walking = Math.abs(d) >= 1
        if (walking) {
          v.dir = d > 0 ? 1 : -1
          v.x += v.dir * Math.min(Math.abs(d), 55 * dt)
        }
        // out of the view: not drawn at all (a busy channel fills the street)
        const seen = v.x > town.cam - 60 && v.x < town.cam + 400
        put(v.el, "display", seen ? "" : "none")
        if (!seen) continue
        // walking on a layer of its own: moved by the compositor, the crowd behind is not repainted each frame
        const bob = walking ? Math.round(-20 * Math.abs(Math.sin((now / 1000) * Math.PI * 3))) / 10 : 0
        put(v.el, "transform", `translate(${Math.round(v.x * 10) / 10}px,${bob}px)`)
        const cls = "bfxl-tvis" + (v.dir < 0 ? " l" : "") + (walking ? " go" : "")
        if (v.el.className !== cls) v.el.className = cls
      }
    }
    // back from the town into the job's scene: the hero walks in from the left as on any new action
    function walkIn() {
      if (!isLife(cur)) return
      walk.x = -60
      walk.moves.forEach(m => delete m.t0)
      if (!walk.moves.length) walk.moves.push({ to: workX(), work: true })
    }
    // the town is dragged (a mouse, or a finger sideways: up and down still scroll the page), wheeled, or moved
    // by holding an edge arrow; a move under 5 px is a tap, as on the title bar
    function townInput() {
      const box = el.querySelector(".bfxl-town")
      const moved = () => {
        town.free = true
        town.dragAt = performance.now()
      }
      box.addEventListener("pointerdown", e => {
        if (e.button || e.target.closest(".bfxl-pan,.bfxl-find")) return
        const x0 = e.clientX
        const cam0 = town.cam
        let drag = false
        let lx = x0
        let lt = performance.now()
        town.vel = 0
        const move = ev => {
          if (!drag && Math.abs(ev.clientX - x0) < 5) return
          if (!drag) {
            drag = town.dragging = true
            box.classList.add("drag")
          }
          const now = performance.now()
          const v = -(ev.clientX - lx) / curScale / Math.max(0.008, (now - lt) / 1000)
          town.vel = town.vel * 0.5 + v * 0.5
          lx = ev.clientX
          lt = now
          town.cam = cam0 - (ev.clientX - x0) / curScale
          moved()
        }
        const up = () => {
          removeEventListener("pointermove", move)
          removeEventListener("pointerup", up)
          removeEventListener("pointercancel", up)
          town.dragging = false
          box.classList.remove("drag")
          // let go while still moving: it glides on a little
          town.vel = performance.now() - lt > 80 ? 0 : Math.max(-1500, Math.min(1500, town.vel))
        }
        addEventListener("pointermove", move)
        addEventListener("pointerup", up)
        addEventListener("pointercancel", up)
      })
      box.addEventListener(
        "wheel",
        e => {
          const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 340 : 1)
          if (!d) return
          e.preventDefault()
          town.vel = 0
          town.cam += (d * 0.8) / curScale
          moved()
        },
        { passive: false },
      )
      for (const [cls, dir] of [["l", -1], ["r", 1]]) {
        const a = box.querySelector(".bfxl-pan." + cls)
        a.addEventListener("pointerdown", e => {
          e.preventDefault()
          e.stopPropagation()
          try {
            a.setPointerCapture(e.pointerId)
          } catch {}
          town.hold = dir
          town.vel = 0
        })
        for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) a.addEventListener(ev, () => (town.hold = 0))
      }
      box.querySelector(".bfxl-find").addEventListener("click", () => (town.free = false))
    }
    // a style written only when it changed: most of the town stands still most of the time, and a rewrite each
    // frame (even of the same value) had the street with its visitors repainted sixty times a second
    function put(n, k, v) {
      const c = (n.__bfx ||= {})
      if (c[k] === v) return
      c[k] = v
      n.style[k] = v
    }
    function townFrame(now) {
      const hero = el.querySelector(".bfxl-thero")
      if (!hero || cfg.lifeIcon) return
      const dt = Math.min(0.1, (now - (town.lastT || now)) / 1000)
      town.lastT = now
      const tr = town.trip
      // at the gate the hero is out of town, at a job inside its building
      let opacity = town.at === "gate" || SKILL_AT[town.at] ? 0 : 1
      let walking = false
      let facing = town.at === "home" ? -1 : 1
      if (tr) {
        if (tr.ms === undefined) {
          tr.x1 = restX(tr.to)
          tr.wait = tr.appear ? 450 : 0
          // brisk: at most about two and a half seconds whatever the distance
          tr.ms = Math.max(600, Math.min(2600, (Math.abs(tr.x1 - tr.from) / 170) * 1000))
          tr.end = tr.to === "home" ? 0 : 380
        }
        const e = now - tr.t0
        const k = Math.max(0, Math.min(1, (e - tr.wait) / tr.ms))
        town.x = tr.from + (tr.x1 - tr.from) * k
        facing = tr.x1 < tr.from ? -1 : 1
        walking = e >= tr.wait && k < 1
        // out of the door, along the street, in at the other door
        opacity = e < tr.wait ? e / tr.wait : k < 1 ? 1 : 1 - (e - tr.wait - tr.ms) / (tr.end || 1)
        if (k >= 1 && e - tr.wait - tr.ms >= tr.end) {
          town.at = tr.to
          town.trip = null
          ensure()
          if (!inTown()) walkIn()
          return
        }
      } else if (town.at !== "gate") town.x = restX(town.at)
      // the camera: on the hero (or the building they are in), else where it was moved to, gliding to a stop
      const maxCam = townW - 340
      const focus = tr || town.at === "home" ? town.x : TOWN_X[town.at]
      if (town.hold) {
        town.cam += town.hold * 320 * dt
        town.free = true
        town.dragAt = now
      } else if (town.free && !town.dragging) {
        town.cam += town.vel * dt
        town.vel *= Math.exp(-dt * 4)
      }
      if (!town.free) {
        const target = Math.max(0, Math.min(maxCam, focus - 170))
        town.cam = town.snap || Math.abs(target - town.cam) < 0.2 ? target : town.cam + (target - town.cam) * (1 - Math.exp(-dt * 7))
      } else if (Math.abs(town.vel) < 2) town.vel = 0
      town.cam = Math.max(0, Math.min(maxCam, town.cam))
      town.snap = false
      const box = el.querySelector(".bfxl-town")
      box.querySelector(".bfxl-pan.l").classList.toggle("on", town.cam > 1)
      box.querySelector(".bfxl-pan.r").classList.toggle("on", town.cam < maxCam - 1)
      // off screen: a badge on that side points to them, a click brings the camera back
      const find = box.querySelector(".bfxl-find")
      const side = focus < town.cam + 12 ? "l" : focus > town.cam + 328 ? "r" : ""
      find.classList.toggle("on", !!side)
      if (side) {
        const k = side + (isLife(cur) ? skillOf(cur.actionHrid) : cur ? "combat" : "house")
        if (find.dataset.k !== k) {
          find.dataset.k = k
          find.className = "bfxl-find on " + side
          find.innerHTML = ""
          find.append(side === "l" ? "◂" : "", isLife(cur) ? svgUse("skills", skillOf(cur.actionHrid)) : svgUse("misc", cur ? "combat" : "house"), side === "r" ? "▸" : "")
          find.title = L("回到角色", "Back to the hero")
        }
      }
      // at work: the action's progress as a ring at the building's door and in the bar under the picture
      const ring = el.querySelector(".bfxl-tring")
      const working = !tr && isLife(cur) && SKILL_AT[town.at]
      ring?.classList.toggle("on", !!working)
      if (working) {
        const d = dur()
        let t = (now - cycleAt) / (d * 1000)
        if (t > 1.6) {
          cycleAt = now
          t = 0
        }
        // in 3° steps: the ring need not be redrawn every frame
        put(ring, "left", TOWN_X[town.at] + "px")
        put(ring, "background", `conic-gradient(#7fd0ff ${Math.round(Math.min(1, t) * 120) * 3}deg,#2b3350d0 0)`)
        put(el.querySelector(".bfxl-bar i"), "width", Math.round(Math.min(100, t * 100) * 2) / 2 + "%")
        const sec = d.toFixed(2) + "s"
        const lab = el.querySelector(".bfxl-bar span")
        if (lab.textContent !== sec) lab.textContent = sec
      }
      moveVisitors(now, dt)
      const cam = Math.round(town.cam * 10) / 10
      put(el.querySelector(".bfxl-strip"), "transform", `translateX(${-cam}px)`)
      put(box, "backgroundPositionX", Math.round(-(cam / Math.max(1, maxCam)) * (TOWN_BG_W - 340) * 10) / 10 + "px")
      put(hero, "left", Math.round(town.x * 10) / 10 + "px")
      put(hero, "opacity", String(Math.round(Math.max(0, Math.min(1, opacity)) * 50) / 50))
      const bob = walking ? Math.round(-30 * Math.abs(Math.sin((now / 1000) * Math.PI * 4))) / 10 : 0
      put(hero.firstChild, "transform", `translateY(${bob}px) scale(.62) scaleX(${facing})`)
      // the building the hero is heading for lights up
      const goal = tr?.to || (working ? town.at : null)
      if (town.goal !== goal) {
        town.goal = goal
        for (const b of el.querySelectorAll(".bfxl-bld")) b.classList.toggle("here", b.dataset.id === goal)
      }
      // resting at home: z-z-z; out fighting: crossed swords over the gate
      if (!tr && now - town.zAt > 1700) {
        town.zAt = now
        if (town.at === "home") townPop("z", town.x + 4, 72, 1800)
        else if (town.at === "gate") townPop(sheet("misc") ? svgUse("misc", "combat") : "⚔", TOWN_X.gate - 10, 40, 2200)
      }
    }
    function frame() {
      raf = 0
      if (!visible() || cfg.lifeMin) return
      if (inTown()) {
        raf = requestAnimationFrame(frame)
        return townFrame(performance.now())
      }
      if (!isLife(cur)) return
      raf = requestAnimationFrame(frame)
      const skill = skillOf(cur.actionHrid)
      const style = SKILL[skill][3]
      const d = dur()
      let t = (performance.now() - cycleAt) / (d * 1000)
      // well past the end without a completion: the guessed start or length was off, start another cycle
      if (t > 1.6) {
        cycleAt = performance.now()
        t = 0
      }
      // #dev-start
      if (labState?.auto && t >= 1) labComplete({})
      // #dev-end
      if (layoutDirty && !cfg.lifeIcon) relayout()
      if (cfg.lifeIcon) {
        el.querySelector(".bfxl-ico").style.background = `conic-gradient(#7fd0ff ${Math.min(1, t) * 360}deg,#2b3350 0)`
        return
      }
      const move = held && TOOL_MOVE[held.kind]
      const n = Math.max(1, Math.min(8, Math.round(d / (move ? move[0] : style === "stitch" ? 0.8 : 1.7))))
      // past the end the action is waiting for the server: hold the rest pose
      const sub = Math.min(t, 1) * n
      const f = t >= 1 ? 0.999 : sub % 1
      const now = performance.now()
      const hero = el.querySelector(".bfxl-hero")
      const m = walk.moves[0]
      let facing = 1
      let walking = false
      if (m) {
        if (m.t0 === undefined) {
          m.t0 = now
          m.from = walk.x
          if (typeof m.to === "function") m.to = m.to()
          m.ms = Math.max(120, (Math.abs(m.to - m.from) / (m.speed || 150)) * 1000)
          setCarry(m.carry)
        }
        const k = Math.min(1, (now - m.t0) / m.ms)
        walk.x = m.from + (m.to - m.from) * k
        walking = true
        if (m.to < m.from) facing = -1
        if (k >= 1) {
          walk.moves.shift()
          if (m.carry) dropCarry()
          m.then?.()
        }
      }
      if (hero) {
        hero.style.left = walk.x + "px"
        const bob = walking ? -3 * Math.abs(Math.sin((now / 1000) * Math.PI * 4)) : -2 * Math.abs(Math.sin(Math.PI * f))
        hero.style.transform = `translateY(${bob}px) scaleX(${facing})`
      }
      const tool = el.querySelector(".bfxl-hero > .bfxl-tool")
      if (walking) {
        // tool at rest while walking; no strokes land
        if (tool) tool.style.transform = move ? `rotate(${(toolPose(held.kind, 0)[0] ?? held.geo[2]) - held.geo[2]}deg)` : ""
        lastF = f
      } else if (tool && move) {
        const [dir, x, y, turn] = toolPose(held.kind, f)
        const rot = (dir === null ? 0 : dir - held.geo[2]) + turn
        tool.style.transform = `translate(${x}px,${y}px) rotate(${rot}deg)`

      } else if (tool) {
        const [rot, x, y] = pose(style, f)
        tool.style.transform = `translate(${x}px,${y}px) rotate(${rot}deg)`
      }
      idlePose(now)
      const work = el.querySelector(".bfxl-work")
      if (work) work.style.transform = `translateY(${3 * Math.sin(performance.now() / 500)}px)`
      // a transmute's possible results take turns, like a slot machine
      if (work && work.childElementCount > 1) {
        const k = Math.floor(performance.now() / 180) % work.childElementCount
        ;[...work.children].forEach((c, i) => (c.style.visibility = i === k ? "visible" : "hidden"))
      }
      // the product to come firms up over the action
      if (work && (SKILL[skill][2] === "make" || SKILL[skill][2] === "alchemy")) work.style.opacity = 0.3 + 0.6 * Math.min(1, t)
      // enhancing: the item charges up in the colour of the level it is going for
      if (work && skill === "enhancing") {
        const c = enhTint(enhLevel + 1)
        const k = Math.min(1, t)
        work.style.filter = `drop-shadow(0 0 ${3 + 9 * k}px ${c}) drop-shadow(0 0 ${2 + 4 * k}px #fff) brightness(${1 + 0.35 * k})`
        const orbit = el.querySelector(".bfxl-orbit")
        if (orbit) orbit.style.animationDuration = 2.4 - 1.6 * k + "s"
      }
      const bar = el.querySelector(".bfxl-bar i")
      bar.style.width = Math.min(100, t * 100) + "%"
      el.querySelector(".bfxl-bar span").textContent = d.toFixed(2) + "s"
      animateMembers(now)
      const hitAt = move ? move[1] : HIT[style]
      // in a guild trial the strokes are the members' (one per attempt), not the hidden hero's
      if (!members.length && !walking && t < 1 && f >= hitAt && lastF < hitAt) hit(skill, move ? move[2] : style)
      lastF = t >= 1 ? 1 : f
    }
    // where the target's middle is, in scene pixels
    function targetAt() {
      const s = el.querySelector(".bfxl-scene").getBoundingClientRect()
      const r = el.querySelector(".bfxl-target").getBoundingClientRect()
      const k = curScale
      return [(r.left - s.left + r.width / 2) / k, (r.top - s.top + r.height / 2) / k]
    }
    // rings of power from the horn's bell to the item on the altar
    function hornWave() {
      const hero = el.querySelector(".bfxl-hero")
      // the item on the altar, or in a trial the relic / seal stone
      const work = el.querySelector(".bfxl-work") || tstage?.project
      if (!hero || !work) return
      const s = el.querySelector(".bfxl-scene").getBoundingClientRect()
      const k = curScale
      const a = ((-32 * Math.PI) / 180)
      const r = (TOOL_REACH.enhancer || 44) * 0.85
      const bx = hero.offsetLeft + HAND[0] + Math.cos(a) * r
      const by = hero.offsetTop + HAND[1] + Math.sin(a) * r
      const w = work.getBoundingClientRect()
      const tx = (w.left - s.left + w.width / 2) / k
      const ty = (w.top - s.top + w.height / 2) / k
      for (let i = 0; i < 3; i++) {
        const ring = fxEl("bfxl-wave", `border-color:${enhTint(enhLevel + 1)};box-shadow:0 0 6px ${enhTint(enhLevel + 1)}`)
        ring.animate(
          [
            { transform: `translate(${bx - 8}px,${by - 8}px) scale(.4)`, opacity: 0 },
            { transform: `translate(${bx - 8}px,${by - 8}px) scale(.8)`, opacity: 1, offset: 0.15 },
            { transform: `translate(${tx - 8}px,${ty - 8}px) scale(1.8)`, opacity: 0 },
          ],
          { duration: 620, delay: i * 120, easing: "ease-out", fill: "backwards" },
        ).onfinish = gone(ring)
      }
      // and a beam of light from the bell to the item
      const len = Math.hypot(tx - bx, ty - by)
      const bc = enhTint(enhLevel + 1)
      const beam = fxEl("bfxl-beam", `width:${len}px;transform:translate(${bx}px,${by - 3}px) rotate(${Math.atan2(ty - by, tx - bx)}rad);background:linear-gradient(90deg,transparent,${bc} 20%,#fff 60%,${bc});box-shadow:0 0 ${6 + 2 * enhStage(enhLevel + 1)}px ${bc}`)
      beam.animate([{ opacity: 0, clipPath: "inset(0 100% 0 0)" }, { opacity: 1, clipPath: "inset(0 0 0 0)", offset: 0.35 }, { opacity: 0, clipPath: "inset(0 0 0 60%)" }], { duration: 520, easing: "ease-out" }).onfinish = gone(beam)
      later(450, () => burst("enhancing", tx, ty, 4))
    }
    // the enhanced item's middle in scene pixels
    function itemAt() {
      const work = el.querySelector(".bfxl-work")
      if (!work) return targetAt()
      const s = el.querySelector(".bfxl-scene").getBoundingClientRect()
      const w = work.getBoundingClientRect()
      const k = curScale
      // kept low enough that what pops up over it stays in the window
      return [(w.left - s.left + w.width / 2) / k, Math.max(44, (w.top - s.top + w.height / 2) / k)]
    }
    // the show grows with the level reached: flash, ring and sparks always; rays from +5; the window dims with a
    // light pillar and shakes from +10; turning colours and fireworks from +15
    function enhSuccess(b, a) {
      const [x, y] = itemAt()
      const st = enhStage(a)
      const c = enhColor(a)
      const work = el.querySelector(".bfxl-work")
      const f = fxEl("bfxl-flash")
      f.animate([{ transform: `translate(${x - 60}px,${y - 60}px) scale(.2)`, opacity: 1 }, { transform: `translate(${x - 60}px,${y - 60}px) scale(${1 + 0.15 * st})`, opacity: 0 }], { duration: 450, easing: "ease-out" }).onfinish = gone(f)
      if (st >= 1) {
        const rays = fxEl("bfxl-rays", `left:${x - 60}px;top:${y - 60}px;background:repeating-conic-gradient(${c}aa 0 10deg,transparent 10deg 30deg)`)
        if (st >= 5) rays.style.animation = "bfxl-hue 1s linear infinite"
        rays.animate([{ transform: "rotate(0) scale(.2)", opacity: 0 }, { transform: `rotate(40deg) scale(${0.8 + 0.1 * st})`, opacity: 1, offset: 0.2 }, { transform: "rotate(150deg) scale(1.1)", opacity: 0 }], { duration: 1200 + 150 * st }).onfinish = gone(rays)
      }
      const r = fxEl("bfxl-ring", `border-color:${c};box-shadow:0 0 10px ${c}`)
      r.animate([{ transform: `translate(${x - 40}px,${y - 12}px) scale(.2)`, opacity: 1 }, { transform: `translate(${x - 40}px,${y - 12}px) scale(2.4,1.6)`, opacity: 0 }], { duration: 700, easing: "ease-out" }).onfinish = gone(r)
      work?.animate([{ transform: "scale(1)" }, { transform: "scale(1.35) rotate(-8deg)" }, { transform: "scale(1)" }], { duration: 500, easing: "ease-out" })
      const num = fxEl("bfxl-num", `color:${c};text-shadow:0 0 10px ${c},0 0 4px #fff,0 2px 3px #000`)
      num.textContent = "+" + a
      if (st >= 5) num.style.animation = "bfxl-hue 1s linear infinite"
      num.animate([{ transform: `translate(${x - 70}px,${y - 20}px) scale(.3)`, opacity: 0 }, { transform: `translate(${x - 70}px,${y - 34}px) scale(${1.2 + 0.1 * st})`, opacity: 1, offset: 0.25 }, { transform: `translate(${x - 70}px,${y - 36}px) scale(1)`, opacity: 1, offset: 0.75 }, { transform: `translate(${x - 70}px,${y - 44}px) scale(1)`, opacity: 0 }], { duration: 1600, easing: "ease-out" }).onfinish = gone(num)
      burst("enhancing", x, y, 10 + 4 * st, st >= 1)
      if (st >= 2) later(250, () => burst("enhancing", x, y - 10, 6 + 2 * st, true))
      if (st >= 5) {
        // fireworks in every colour
        FX.fireworks ||= [["#ff4d4d", "#ffb84d", "#fff04d", "#4dff88", "#4dc3ff", "#b84dff"], "spark"]
        for (let i = 0; i < 5; i++) later(300 + i * 280, () => burst("fireworks", x + (Math.random() - 0.5) * 150, y - 10 + (Math.random() - 0.5) * 50, 12, true))
      }
      if (a >= 10) {
        // high levels: the whole window joins in
        const dim = fxEl("bfxl-dim")
        dim.animate([{ opacity: 0 }, { opacity: 0.5, offset: 0.15 }, { opacity: 0.5, offset: 0.7 }, { opacity: 0 }], { duration: 2200 }).onfinish = gone(dim)
        const pillar = fxEl("bfxl-pillar", `left:${x - 22}px;background:linear-gradient(90deg,transparent,${c}cc 30%,#fff 50%,${c}cc 70%,transparent)`)
        pillar.animate([{ transform: "scaleY(0)", opacity: 0 }, { transform: "scaleY(1)", opacity: 1, offset: 0.15 }, { transform: "scaleY(1)", opacity: 0 }], { duration: 1800 }).onfinish = gone(pillar)
        shake(3, 350)
      }
      if (a - b >= 2) return blessShow(b, a, x, y)
      const b2 = banner(L(`强化成功 +${a}`, `Success +${a}`), c)
      if (a >= 15) b2?.classList.add("rainbow")
    }
    // 福气 (blessed: two levels at once): a 福 paper diamond spins down onto the item and bursts into coins,
    // the level ticks up twice, firecrackers go off around it
    function blessShow(b, a, x, y) {
      const fu = fxEl("bfxl-fu")
      fu.innerHTML = "<span>福</span>"
      fu.animate(
        [
          { transform: `translate(${x - 22}px,${y - 70}px) rotate(45deg) scale(.3) rotateY(0)`, opacity: 0 },
          { transform: `translate(${x - 22}px,${y - 24}px) rotate(45deg) scale(1.2) rotateY(360deg)`, opacity: 1, offset: 0.35 },
          { transform: `translate(${x - 22}px,${y - 22}px) rotate(45deg) scale(1) rotateY(360deg)`, opacity: 1, offset: 0.7 },
          { transform: `translate(${x - 22}px,${y - 22}px) rotate(45deg) scale(1.7) rotateY(360deg)`, opacity: 0 },
        ],
        { duration: 1500, easing: "ease-out" },
      ).onfinish = gone(fu)
      // the coins
      later(1050, () => {
        const fx = el.querySelector(".bfxl-fx")
        for (let i = 0; i < 18; i++) {
          const coin = document.createElement("i")
          coin.style.cssText = "width:9px;height:9px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff6b0,#ffd23a 45%,#c98a00);box-shadow:0 0 4px #ffcf40"
          fx.appendChild(coin)
          const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.8
          const v = 40 + Math.random() * 45
          const ex = x + Math.cos(ang) * v
          coin.animate(
            [
              { transform: `translate(${x}px,${y - 30}px) scaleX(1)`, opacity: 1 },
              { transform: `translate(${(x + ex) / 2}px,${y - 30 + Math.sin(ang) * v}px) scaleX(.2)`, opacity: 1, offset: 0.4 },
              { transform: `translate(${ex}px,${y + 40}px) scaleX(1)`, opacity: 0 },
            ],
            { duration: 900 + Math.random() * 400, easing: "ease-in" },
          ).onfinish = gone(coin)
        }
      })
      // the level ticks up twice
      ;[b + 1, a].forEach((n, i) =>
        later(300 + i * 450, () => {
          const num = fxEl("bfxl-num", `color:${enhColor(n)};text-shadow:0 0 8px #ff3b30,0 0 4px #ffd75a,0 2px 3px #000`)
          num.textContent = "+" + n + (i ? "!!" : "!")
          num.animate([{ transform: `translate(${x - 80 + i * 14}px,${y - 14}px) scale(.3)`, opacity: 0 }, { transform: `translate(${x - 80 + i * 14}px,${y - 30 - i * 6}px) scale(1.3)`, opacity: 1, offset: 0.3 }, { transform: `translate(${x - 80 + i * 14}px,${y - 38 - i * 6}px) scale(1)`, opacity: 0 }], { duration: 1100, easing: "ease-out" }).onfinish = gone(num)
        }),
      )
      // firecrackers
      FX.firecracker ||= [["#ff3b30", "#ffd75a", "#ff8a1a", "#fff"], "spark"]
      for (let i = 0; i < 4; i++) later(200 + i * 260, () => burst("firecracker", x + (Math.random() - 0.5) * 120, y - 20 + (Math.random() - 0.5) * 40, 9, true))
      const bn = banner(L(`福气！+${b} → +${a}`, `Blessed! +${b} → +${a}`), "#ffd75a")
      bn?.classList.add("bless")
    }
    // the fall is as heavy as the level lost
    function enhFail(b, a, prot) {
      const [x, y] = itemAt()
      const st = enhStage(b)
      const work = el.querySelector(".bfxl-work")
      if (prot) {
        // the protection catches it: a shield flickers up around the item
        const sh = fxEl("bfxl-shield")
        sh.animate([{ transform: `translate(${x - 26}px,${y - 26}px) scale(.5)`, opacity: 0 }, { transform: `translate(${x - 26}px,${y - 26}px) scale(1.1)`, opacity: 1, offset: 0.2 }, { transform: `translate(${x - 26}px,${y - 26}px) scale(1)`, opacity: 0.8, offset: 0.7 }, { transform: `translate(${x - 26}px,${y - 26}px) scale(1.3)`, opacity: 0 }], { duration: 1000 }).onfinish = gone(sh)
      }
      const f = fxEl("bfxl-flash", "background:radial-gradient(circle,#ff6a5a 0%,#ff2a2a66 40%,transparent 70%)")
      f.animate([{ transform: `translate(${x - 60}px,${y - 60}px) scale(.3)`, opacity: 1 }, { transform: `translate(${x - 60}px,${y - 60}px) scale(1.2)`, opacity: 0 }], { duration: 450 }).onfinish = gone(f)
      work?.animate([0, 1, 2, 3, 4, 5, 6].map(i => ({ transform: i === 6 ? "none" : `translateX(${(i % 2 ? -1 : 1) * 7 * (1 - i / 6)}px) rotate(${(i % 2 ? 1 : -1) * 10 * (1 - i / 6)}deg)` })), { duration: 480 })
      FX.smoke ||= [["#555a", "#777a", "#333a"], "puff"]
      burst("smoke", x, y, 6 + 3 * st, true)
      if (a < b) {
        const num = fxEl("bfxl-num", "color:#ff6a5a;text-shadow:0 0 6px #f00,0 2px 3px #000")
        num.textContent = "+" + b
        num.animate([{ transform: `translate(${x - 30}px,${y - 46}px) scale(1.2)`, opacity: 1 }, { transform: `translate(${x - 30}px,${y + 10}px) scale(.7) rotate(18deg)`, opacity: 0 }], { duration: 900, easing: "ease-in" }).onfinish = gone(num)
      }
      shake(1 + st, 250 + 50 * st)
      banner(a < b ? L(`失败 +${b} → +${a}`, `Failed +${b} → +${a}`) + (prot ? L("（保护）", " (protected)") : "") : L("强化失败", "Failed"), "#ff7a6a")
    }
    function hit(skill, style) {
      if (held?.kind === "enhancer") hornWave()
      if (skill === "foraging" && !walk.moves.length && Math.random() < 0.6) {
        const base = workX()
        walk.moves.push({ to: base - 4 - Math.random() * 18, speed: 110 }, { to: base, work: true, speed: 110 })
      }
      const target = el.querySelector(".bfxl-target")
      const kind = SKILL[skill][2]
      if ((style === "chop" || style === "squeeze") && !posed)
        target.animate(
          skill === "woodcutting" ? [{ transform: "rotate(0)" }, { transform: "rotate(-4deg)" }, { transform: "rotate(2deg)" }, { transform: "rotate(0)" }] : [{ transform: "translateX(0)" }, { transform: "translateX(3px)" }, { transform: "translateX(-2px)" }, { transform: "translateX(0)" }],
          { duration: 260 },
        )
      if (posed) setPose(posed.kind === "cow" ? "milked" : "hit", posed.kind === "cow" ? 500 : 260)
      const [cx, cy] = targetAt()
      burst(skill, cx - (kind === "gather" ? 30 : 10), cy + (kind === "gather" ? 0 : -20), style === "stir" || style === "pour" ? 3 : 5)
    }
    function burst(skill, x, y, count, big) {
      const fx = el.querySelector(".bfxl-fx")
      if (!fx || fx.childElementCount > 70) return
      const [colors, shape] = FX[skill] || FX.enhancing
      for (let i = 0; i < count; i++) {
        const p = document.createElement("i")
        const c = colors[(Math.random() * colors.length) | 0]
        const s = (big ? 5 : 3) + Math.random() * 4
        const round = shape === "chip" ? "1px" : shape === "leaf" ? "60% 0" : "50%"
        p.style.cssText = `width:${s}px;height:${shape === "drop" ? s * 1.4 : s}px;background:${shape === "bubble" ? "transparent" : c};border:${shape === "bubble" ? "1.5px solid " + c : "0"};border-radius:${round};box-shadow:${shape === "spark" ? "0 0 6px " + c : "none"}`
        fx.appendChild(p)
        const up = shape === "puff" || shape === "bubble"
        const a = up ? -Math.PI / 2 + (Math.random() - 0.5) * 0.9 : -Math.PI / 2 + (Math.random() - 0.5) * 2.6
        const v = (big ? 70 : 34) + Math.random() * 30
        const ex = x + Math.cos(a) * v
        const ey = y + Math.sin(a) * v + (up ? 0 : 40)
        p.animate(
          [
            { transform: `translate(${x}px,${y}px) scale(1)`, opacity: 1 },
            { transform: `translate(${(x + ex) / 2}px,${y + Math.sin(a) * v * 0.8}px) scale(${up ? 1.6 : 1}) rotate(${Math.random() * 360}deg)`, opacity: 0.9, offset: 0.45 },
            { transform: `translate(${ex}px,${ey}px) scale(${up ? 2.2 : 0.6})`, opacity: 0 },
          ],
          { duration: (up ? 1100 : 650) + Math.random() * 250, easing: "ease-out" },
        ).onfinish = () => p.remove()
      }
    }
    // a floating label (item icon + text) from (x, y) drifting by (dx, dy)
    function pop(html, x, y, dx, dy, ms, opts = {}) {
      const fx = el.querySelector(".bfxl-fx")
      if (!fx) return
      const p = document.createElement("div")
      p.className = "bfxl-pop"
      if (opts.icon) p.appendChild(svgUse("items", opts.icon))
      const t = document.createElement("span")
      t.textContent = html
      t.style.color = opts.color || "#fff"
      t.style.fontSize = (opts.size || 13) + "px"
      p.appendChild(t)
      if (opts.glow) p.style.filter = `drop-shadow(0 0 6px ${opts.glow})`
      fx.appendChild(p)
      p.animate(
        [
          { transform: `translate(${x}px,${y}px) scale(${opts.from ?? 0.6})`, opacity: 0 },
          { transform: `translate(${x}px,${y - 8}px) scale(1)`, opacity: 1, offset: 0.15 },
          { transform: `translate(${x + dx * 0.6}px,${y + dy * 0.6}px) scale(1)`, opacity: 1, offset: 0.7 },
          { transform: `translate(${x + dx}px,${y + dy}px) scale(0.85)`, opacity: 0 },
        ],
        { duration: ms, delay: opts.delay || 0, easing: "ease-out", fill: "backwards" },
      ).onfinish = () => p.remove()
    }
    function banner(text, color) {
      const fx = el.querySelector(".bfxl-fx")
      const b = document.createElement("div")
      b.className = "bfxl-banner"
      b.textContent = text
      if (color) b.style.color = color
      fx.appendChild(b)
      b.animate(
        [
          { transform: "scale(.4)", opacity: 0 },
          { transform: "scale(1.15)", opacity: 1, offset: 0.12 },
          { transform: "scale(1)", opacity: 1, offset: 0.25 },
          { transform: "scale(1)", opacity: 1, offset: 0.8 },
          { transform: "translateY(-14px)", opacity: 0 },
        ],
        { duration: 2200, easing: "ease-out" },
      ).onfinish = () => b.remove()
      return b
    }
    // ----- rare drops: crate < meteorite < relic; philosopher's stones from transmuting -----
    function fxEl(cls, css) {
      const e = document.createElement("div")
      e.className = cls
      if (css) e.style.cssText = css
      el.querySelector(".bfxl-fx").appendChild(e)
      return e
    }
    const gone = e => () => e.remove()
    function bigItem(id, x, y, size, glow, ms, rise = 40) {
      const b = fxEl("bfxl-big", `width:${size}px;height:${size}px;filter:drop-shadow(0 0 8px ${glow}) drop-shadow(0 0 3px ${glow})`)
      b.appendChild(svgUse("items", id))
      b.animate(
        [
          { transform: `translate(${x - size / 2}px,${y - size / 2}px) scale(.2)`, opacity: 0 },
          { transform: `translate(${x - size / 2}px,${y - size / 2 - rise * 0.8}px) scale(1.15)`, opacity: 1, offset: 0.2 },
          { transform: `translate(${x - size / 2}px,${y - size / 2 - rise}px) scale(1)`, opacity: 1, offset: 0.8 },
          { transform: `translate(${x - size / 2}px,${y - size / 2 - rise - 10}px) scale(.9)`, opacity: 0 },
        ],
        { duration: ms, easing: "ease-out" },
      ).onfinish = gone(b)
      return b
    }
    function shake(px, ms) {
      el.querySelector(".bfxl-view").animate(
        [0, 1, 2, 3, 4, 5].map(i => ({ transform: i === 5 ? "none" : `translate(${(i % 2 ? -1 : 1) * px * (1 - i / 5)}px,${(i % 3 - 1) * px * 0.6}px)` })),
        { duration: ms },
      )
    }
    function rareShow(g, skill, cx, cy) {
      const kind = rarity(g.id)
      const label = `${rareName(g.id)}${g.n > 1 ? " ×" + g.n : ""}`
      if (posed) setPose(posed.kind === "cow" ? "startled" : "leaves", 1400)
      if (kind === "crate") {
        // bigger crate, bigger show
        const k = /large/.test(g.id) ? 1.3 : /medium/.test(g.id) ? 1.15 : 1
        bigItem(g.id, cx, cy - 20, 34 * k, "#ffb300", 2200)
        burst(skill, cx, cy - 30, Math.round(14 * k), true)
        banner(L("稀有掉落！", "Rare drop!") + " " + label)
      } else if (kind === "meteor") {
        // a burning rock falls out of the sky, hits the ground, and the cache is in the crater
        const gx = cx - 18
        const gy = cy + 34
        const m = fxEl("bfxl-meteor")
        m.animate([{ transform: "translate(330px,-40px) rotate(-35deg)" }, { transform: `translate(${gx}px,${gy - 8}px) rotate(-35deg)` }], { duration: 650, easing: "cubic-bezier(.5,0,1,1)" }).onfinish = () => {
          m.remove()
          const f = fxEl("bfxl-flash")
          f.animate([{ transform: `translate(${gx - 60}px,${gy - 60}px) scale(.2)`, opacity: 1 }, { transform: `translate(${gx - 60}px,${gy - 60}px) scale(1.6)`, opacity: 0 }], { duration: 500, easing: "ease-out" }).onfinish = gone(f)
          const r = fxEl("bfxl-ring")
          r.animate([{ transform: `translate(${gx - 40}px,${gy - 12}px) scale(.2,.2)`, opacity: 1 }, { transform: `translate(${gx - 40}px,${gy - 12}px) scale(2.2,1.2)`, opacity: 0 }], { duration: 700, easing: "ease-out" }).onfinish = gone(r)
          shake(5, 420)
          FX.dust ||= [["#c9a77a", "#8b6b4a", "#e8d3b0"], "chip"]
          burst("dust", gx, gy, 18, true)
          burst("cheesesmithing", gx, gy - 6, 10, true)
          bigItem(g.id, gx, gy - 20, 40, "#ff8a3c", 2400, 30)
          banner(L("天降陨石！", "Meteorite!") + " " + label, "#ffb070")
        }
      } else if (kind === "legend") {
        // the window dims, a light pillar comes down, the relic rises turning in its rays
        const dim = fxEl("bfxl-dim")
        dim.animate([{ opacity: 0 }, { opacity: 0.6, offset: 0.15 }, { opacity: 0.6, offset: 0.8 }, { opacity: 0 }], { duration: 4200 }).onfinish = gone(dim)
        const pillar = fxEl("bfxl-pillar", `left:${cx - 22}px`)
        pillar.animate([{ transform: "scaleY(0)", opacity: 0 }, { transform: "scaleY(1)", opacity: 1, offset: 0.12 }, { transform: "scaleY(1)", opacity: 0.9, offset: 0.75 }, { transform: "scaleY(1)", opacity: 0 }], { duration: 4000 }).onfinish = gone(pillar)
        later(350, () => {
          const rays = fxEl("bfxl-rays", `left:${cx - 60}px;top:${cy - 100}px`)
          rays.animate([{ transform: "rotate(0) scale(.3)", opacity: 0 }, { transform: "rotate(60deg) scale(1)", opacity: 1, offset: 0.2 }, { transform: "rotate(240deg) scale(1)", opacity: 1, offset: 0.85 }, { transform: "rotate(280deg) scale(1.2)", opacity: 0 }], { duration: 3600 }).onfinish = gone(rays)
          bigItem(g.id, cx, cy - 10, 48, "#fff3a0", 3600, 30)
          for (let i = 0; i < 6; i++) later(i * 450, () => burst("enhancing", cx + (Math.random() - 0.5) * 80, cy - 50 - Math.random() * 20, 6, true))
          const b = banner(L("传说掉落！", "Legendary!") + " " + label, "#fff")
          b?.classList.add("rainbow")
        })
      } else if (kind === "sage") {
        // a magic circle under the station, power spirals in, a white flash, the stone rises glowing crimson
        const full = true
        const ms = full ? 4200 : 2600
        const ccx = cx
        const ccy = cy + 30
        for (const [cls, sz, turn] of [["bfxl-circle", 150, 1], ["bfxl-circle inner", 100, -1]]) {
          const c = fxEl(cls, `width:${sz}px;height:${sz}px;left:${ccx - sz / 2}px;top:${ccy - sz / 2}px`)
          c.animate([{ transform: "scaleY(.35) rotate(0) scale(.2)", opacity: 0 }, { transform: `scaleY(.35) rotate(${turn * 90}deg) scale(1)`, opacity: 1, offset: 0.2 }, { transform: `scaleY(.35) rotate(${turn * 400}deg) scale(1)`, opacity: 1, offset: 0.85 }, { transform: `scaleY(.35) rotate(${turn * 460}deg) scale(1.3)`, opacity: 0 }], { duration: ms }).onfinish = gone(c)
        }
        const dim = fxEl("bfxl-dim", "background:#2a0018")
        dim.animate([{ opacity: 0 }, { opacity: 0.55, offset: 0.2 }, { opacity: 0.55, offset: 0.8 }, { opacity: 0 }], { duration: ms }).onfinish = gone(dim)
        // sparks spiralling into the middle
        const fx = el.querySelector(".bfxl-fx")
        for (let i = 0; i < (full ? 26 : 14); i++) {
          const p = document.createElement("i")
          const c = i % 3 ? "#ff3d6e" : "#ffd75a"
          p.style.cssText = `width:5px;height:5px;border-radius:50%;background:${c};box-shadow:0 0 6px ${c}`
          fx.appendChild(p)
          const a0 = Math.random() * Math.PI * 2
          const frames = []
          for (let k = 0; k <= 8; k++) {
            const r = 90 * (1 - k / 8)
            const a = a0 + k * 0.7
            frames.push({ transform: `translate(${ccx + Math.cos(a) * r}px,${cy - 10 + Math.sin(a) * r * 0.6}px)`, opacity: k === 8 ? 0 : 1 })
          }
          p.animate(frames, { duration: 900 + Math.random() * 500, delay: Math.random() * (full ? 900 : 500), easing: "ease-in", fill: "backwards" }).onfinish = gone(p)
        }
        later(full ? 1500 : 1000, () => {
          const f = fxEl("bfxl-flash", "background:radial-gradient(circle,#fff 0%,#ffd0dc 35%,transparent 70%)")
          f.animate([{ transform: `translate(${ccx - 60}px,${cy - 70}px) scale(.3)`, opacity: 1 }, { transform: `translate(${ccx - 60}px,${cy - 70}px) scale(2.2)`, opacity: 0 }], { duration: 600, easing: "ease-out" }).onfinish = gone(f)
          shake(full ? 4 : 2, 350)
          const st = bigItem(g.id, ccx, cy - 10, full ? 52 : 38, "#ff2d55", ms - (full ? 1500 : 1000), 26)
          st.animate([{ filter: "drop-shadow(0 0 4px #ff2d55) drop-shadow(0 0 2px #ffd75a)" }, { filter: "drop-shadow(0 0 14px #ff2d55) drop-shadow(0 0 6px #ffd75a)" }], { duration: 500, iterations: 8, direction: "alternate" })
          burst("alchemy", ccx, cy - 20, full ? 20 : 10, true)
          const b = banner(full ? L("贤者之石！", "Philosopher's Stone!") : label, "#ff6b8b")
          b?.classList.add("sage")
        })
      }
    }
    // one finished action: costs go into the station, gains come out, then experience / level-ups / results
    function play({ skill, gains, costs, exp, ups, enh, action }) {
      lastPlayAt = performance.now()
      setScene()
      const key = sceneKey
      const kind = SKILL[skill][2]
      const [cx, cy] = targetAt()
      const target = el.querySelector(".bfxl-target")
      let delay = 0
      if (kind === "make") {
        // the table's materials go in (or, without game data, the costs fly in from the hero)
        if (el.querySelector(".bfxl-mat")) useMaterials(0, kind, gains, key)
        else costs.forEach((c, i) => pop("-" + fmt(c.n), 100, 60 + i * 6, cx - 120, cy - 70, 650, { icon: c.id, color: "#ffb0a0", size: 11, delay: i * 90, from: 1 }))
        delay = 420
        target.animate([{ transform: "scale(1)" }, { transform: "scale(1.08,0.94)" }, { transform: "scale(1)" }], { duration: 300, delay })
      }
      if (kind === "enhancing" || kind === "alchemy") useMaterials(150, kind, gains, key)
      if (kind === "enhancing") {
        const [b, a] = enh
        showEnh()
        if (a > b) enhSuccess(b, a)
        else enhFail(b, a, a === b - 1 && b >= (action.enhancingProtectionMinLevel || Infinity))
      }
      if (kind === "alchemy") {
        const ok = gains.length > 0
        // a philosopher's stone has its own show
        if (!gains.some(g => rarity(g.id) === "sage")) banner(ok ? L("炼金成功", "Success") : L("炼金失败", "Failed"), ok ? "#ffe27a" : "#ff7a6a")
        if (ok) burst("alchemy", cx, cy - 20, 14, true)
        delay = 300
      }
      // gains (the enhanced item itself is shown by the +N above it, not as a gain)
      const shown = kind === "enhancing" ? gains.filter(g => g.id !== hashItem(action.primaryItemHash)?.id) : gains
      // the biggest find gets its own show; the rest pop up as usual
      const order = ["sage", "legend", "meteor", "crate"]
      const star = shown.filter(g => order.includes(rarity(g.id))).sort((a, b) => order.indexOf(rarity(a.id)) - order.indexOf(rarity(b.id)))[0]
      shown
        .filter(g => g !== star)
        .slice(0, 5)
        .forEach((g, i) => {
          const minor = rarity(g.id) === "minor"
          pop("+" + fmt(g.n), cx - 16 + i * 10, cy - 30, 60 - i * 6, -70, 1500, {
            icon: g.id,
            delay: delay + i * 160,
            color: minor ? "#8ff0e0" : "#fff",
            glow: minor ? "#3fe0c8" : null,
          })
        })
      if (star) later(delay + 250, () => key === sceneKey && rareShow(star, skill, cx, cy))
      // gatherers and crafters take the product away (on short actions only every third time; a crafter with a
      // storage does that on the way to the next materials)
      if ((kind === "gather" || (kind === "make" && !staged)) && gains.length && (dur() >= 2.5 || ++walk.carried % 3 === 0)) {
        const main = gains.find(g => !MINOR.test(g.id) && !RARE.test(g.id)) || gains[0]
        later(delay + 300, () => key === sceneKey && carryOut(main.id))
      }
      if (posed && !star) setPose(posed.kind === "cow" ? "happy" : "rustle", 900)
      if (exp > 0) pop(`+${exp >= 100 ? fmt(exp) : +exp.toFixed(1)} ${L("经验", "XP")}`, 46, 26, 0, -24, 1300, { color: "#9fd3ff", size: 11, delay: delay + 200 })
      // a switch to another action in between clears the scene: late banners are dropped
      for (const [s, lv] of ups) later(delay + 500, () => key === sceneKey && banner(`${SKILL[s] ? L(SKILL[s][0], SKILL[s][1]) : s} Lv.${lv}`))
    }
    // #dev-start
    // ----- 生活动画测试: any skill / action / tool tier / cycle, and buttons for every kind of result -----
    // The real action is put aside while testing (game messages still update the inventory and the queue)
    const LAB_ACTIONS = {"alchemy":[["coinify","点金"],["decompose","分解"],["transmute","转化"],["unrefine","解精炼"]],"brewing":[["milking_tea","挤奶茶"],["defense_coffee","防御咖啡"],["basic_tea_crate","基础茶叶箱"],["magic_coffee","魔法咖啡"],["processing_tea","加工茶"],["super_brewing_tea","超级冲泡茶"],["ultra_foraging_tea","究极采摘茶"],["super_crafting_tea","超级制作茶"],["super_tailoring_tea","超级缝纫茶"],["ultra_enhancing_tea","究极强化茶"]],"cheesesmithing":[["cheese","奶酪"],["cheese_plate_body","奶酪胸甲"],["verdant_plate_legs","翠绿腿甲"],["azure_enhancer","蔚蓝强化器"],["burble_mace","深紫钉头锤"],["crimson_pot","绛红壶"],["rainbow_hatchet","彩虹斧头"],["holy_sword","神圣剑"],["holy_plate_legs","神圣腿甲"],["anchorbound_plate_legs","锚定腿甲"]],"cooking":[["cupcake","纸杯蛋糕"],["yogurt","酸奶"],["blueberry_cake","蓝莓蛋糕"],["blackberry_cake","黑莓蛋糕"],["orange_yogurt","橙子酸奶"],["strawberry_cake","草莓蛋糕"],["mooberry_cake","哞莓蛋糕"],["peach_yogurt","桃子酸奶"],["marsberry_cake","火星莓蛋糕"],["spaceberry_cake","太空莓蛋糕"]],"crafting":[["advanced_task_badge","高级任务徽章"],["earrings_of_gathering","采集耳环"],["ring_of_essence_find","精华发现戒指"],["advanced_milking_charm","高级挤奶护符"],["ring_of_armor","护甲戒指"],["expert_foraging_charm","专家采摘护符"],["crushed_sunstone","太阳石碎片"],["master_enhancing_charm","大师强化护符"],["vampiric_bow","吸血弓"],["grandmaster_cooking_charm","宗师烹饪护符"]],"enhancing":[["enhance","强化"]],"foraging":[["cotton","棉花"],["sugar","糖"],["arabica_coffee_bean","低级咖啡豆"],["shimmering_lake","波光湖泊"],["robusta_coffee_bean","中级咖啡豆"],["liberica_coffee_bean","高级咖啡豆"],["cocoon","蚕茧"],["silly_cow_valley","傻牛山谷"],["marsberry","火星莓"],["radiant_fiber","光辉纤维"]],"milking":[["cow","奶牛"],["verdant_cow","翠绿奶牛"],["azure_cow","蔚蓝奶牛"],["burble_cow","深紫奶牛"],["crimson_cow","绛红奶牛"],["unicow","彩虹奶牛"],["holy_cow","神圣奶牛"]],"tailoring":[["cotton_boots","棉靴"],["linen_fabric","亚麻布料"],["bamboo_boots","竹靴"],["flaming_robe_bottoms","烈焰袍裙"],["silk_hat","丝帽"],["umbral_leather","暗影皮革"],["umbral_tunic","暗影皮衣"],["foragers_bottoms","采摘者下装"],["magicians_hat","魔术师帽"],["gatherer_cape_refined","采集者披风 ★"]],"woodcutting":[["tree","树"],["birch_tree","桦树"],["cedar_tree","雪松树"],["purpleheart_tree","紫心树"],["ginkgo_tree","银杏树"],["redwood_tree","红杉树"],["arcane_tree","奥秘树"]]}
    const LAB_TOOL = { milking: "brush", foraging: "shears", woodcutting: "hatchet", cheesesmithing: "hammer", crafting: "chisel", tailoring: "needle", cooking: "spatula", brewing: "pot", alchemy: "alembic", enhancing: "enhancer" }
    const LAB_TIERS = ["cheese", "verdant", "azure", "burble", "crimson", "rainbow", "holy", "celestial"]
    let labState = null
    function lab() {
      if (labState) return labEnd()
      labState = { saved: { cur, queue, tools: { ...tools }, toolEnh: { ...toolEnh }, measured }, skill: "milking", act: "cow", tier: "holy", dur: 3, auto: false, enh: 5, lv: 50, n: 0 }
      cfg.lifeIcon = false
      ensure()
      if (!el) build()
      const box = document.createElement("div")
      box.className = "bfxl-lab"
      const sel = (opts, val, on) => {
        const s = document.createElement("select")
        for (const [v, t] of opts) s.add(new Option(t, v, false, v === val))
        s.onchange = () => on(s.value)
        box.appendChild(s)
        return s
      }
      const btn = (t, on) => {
        const b = document.createElement("button")
        b.textContent = t
        b.onclick = on
        box.appendChild(b)
      }
      box.innerHTML = "<b>生活动画测试（只在开发版）</b>"
      let actSel
      sel(Object.keys(SKILL).map(k => [k, SKILL[k][0]]), labState.skill, v => {
        labState.skill = v
        labState.act = LAB_ACTIONS[v][0][0]
        actSel.innerHTML = ""
        for (const [id, n] of LAB_ACTIONS[v]) actSel.add(new Option(n, id))
        labApply()
      })
      actSel = sel(LAB_ACTIONS[labState.skill], labState.act, v => ((labState.act = v), labApply()))
      sel(LAB_TIERS.map(t => [t, t]), labState.tier, v => ((labState.tier = v), labApply()))
      sel([0, 5, 8, 10, 12, 15].map(n => [String(n), "工具 +" + n]), "0", v => ((labState.toolLv = +v), labApply()))
      sel([[1.5, "1.5s"], [3, "3s"], [6, "6s"], [12, "12s"]].map(([v, t]) => [String(v), t]), "3", v => ((labState.dur = +v), labApply()))
      const auto = document.createElement("label")
      auto.innerHTML = `<input type="checkbox"> 自动循环`
      auto.firstChild.onchange = e => (labState.auto = e.target.checked)
      box.appendChild(auto)
      btn("完成一次", () => labComplete({}))
      btn("精华", () => labComplete({ essence: true }))
      btn("小工匠匣", () => labComplete({ rare: "small_artisans_crate" }))
      btn("大工匠匣", () => labComplete({ rare: "large_artisans_crate" }))
      btn("陨石舱", () => labComplete({ rare: "medium_meteorite_cache" }))
      btn("精通之油", () => labComplete({ rare: "butter_of_proficiency" }))
      btn("洞察之枝", () => labComplete({ rare: "branch_of_insight" }))
      btn("贤者之石", () => labComplete({ sage: "philosophers_stone" }))
      btn("升级", () => labComplete({ up: true }))
      btn("强化成功", () => labComplete({ enh: 1 }))
      btn("福气", () => labComplete({ enh: 2 }))
      btn("物品+0", () => labSetEnh(0))
      btn("+9", () => labSetEnh(9))
      btn("+14", () => labSetEnh(14))
      btn("强化失败", () => labComplete({ enh: -1 }))
      btn("炼金成功", () => labComplete({ alch: true }))
      btn("炼金失败", () => labComplete({ alch: false }))
      btn("公会试炼", () => labTrial("guild"))
      btn("迷宫房间", () => labTrial("lab"))
      btn("结束测试", () => labEnd())
      el.appendChild(box)
      labApply()
    }
    function labSetEnh(n) {
      labState.enh = n
      enhLevel = n
      cur = { ...cur, primaryItemHash: `0::/item_locations/inventory::/items/holy_sword::${n}` }
      queue = [cur]
      showEnh()
    }
    // the trials the panel started (marked .lab) are dropped, the real ones and the real labyrinth kept
    function labStopTrials() {
      clearInterval(labTrialTimer)
      for (const [k, t] of Object.entries(trials)) if (t.lab) delete trials[k]
      if (trial?.lab) {
        trial = null
        cur = null
        sceneKey = ""
      }
      if ("realLab" in labState) {
        labyrinth = labState.realLab
        delete labState.realLab
      }
    }
    function labApply() {
      labStopTrials()
      const { skill, act, tier, dur: d } = labState
      tools[skill] = `${tier}_${LAB_TOOL[skill]}`
      toolEnh[skill] = labState.toolLv || 0
      const item = skill === "enhancing" ? "holy_sword" : skill === "alchemy" ? (act === "transmute" ? "blazing_trident_refined" : "star_fruit") : ""
      const fake = { id: -100 - ++labState.n, actionHrid: `/actions/${skill}/${act}`, currentCount: 0, hasMaxCount: false, maxCount: 0, ordinal: 0, isDone: false, primaryItemHash: item ? `0::/item_locations/inventory::/items/${item}::${skill === "enhancing" ? labState.enh : 0}` : "", enhancingProtectionMinLevel: 8 }
      cur = null
      setQueue([fake])
      measured = d
    }
    // what a completion of the test action gives
    function labProduct(skill, act) {
      if (skill === "milking") return { cow: "milk", unicow: "rainbow_milk" }[act] || act.replace(/_cow$/, "_milk")
      if (skill === "woodcutting") return act === "tree" ? "log" : act.replace(/_tree$/, "_log")
      if (skill === "foraging") return Object.keys(FORAGE_AREA).find(k => FORAGE_AREA[k] === act && k !== act) || act
      return act
    }
    function labComplete(o) {
      const { skill, act } = labState
      const kind = SKILL[skill][2]
      const gains = []
      const costs = []
      if (kind === "gather" || kind === "make") gains.push({ id: labProduct(skill, act), n: 1 + (Math.random() * 3) | 0 })
      if (kind === "make") costs.push({ id: { cheesesmithing: "cheese", crafting: "lumber", tailoring: "cotton_fabric", cooking: "milk", brewing: "tea_leaf" }[skill] || "milk", n: 3 })
      // auto: the game's chances, a bit generous
      if (o.essence || (labState.auto && Math.random() < 0.1)) gains.push({ id: `${skill}_essence`, n: 1 })
      if (labState.auto && !o.rare && Math.random() < 0.02) o.rare = ["small_artisans_crate", "medium_meteorite_cache", "thread_of_expertise"][(Math.random() * 3) | 0]
      if (o.rare) gains.push({ id: o.rare, n: 1 })
      const ups = o.up ? [[skill, ++labState.lv]] : []
      let enh = [labState.enh, labState.enh]
      if (kind === "enhancing") {
        const ok = o.enh ? o.enh > 0 : Math.random() < 0.5
        const after = ok ? labState.enh + (o.enh === 2 ? 2 : 1) : labState.enh >= 8 ? labState.enh - 1 : 0
        enh = [labState.enh, after]
        labState.enh = after
        cur = { ...cur, primaryItemHash: `0::/item_locations/inventory::/items/holy_sword::${after}` }
        queue = [cur]
      }
      if (kind === "alchemy") {
        const ok = o.sage || (o.alch ?? Math.random() < 0.5)
        if (o.sage) gains.push({ id: o.sage, n: 1 })
        else if (ok) {
          const outs = alchemyOutputs()
          const it = gameData()?.items[hashItem(cur.primaryItemHash)?.id]
          if (act === "coinify") gains.push({ id: "coin", n: 1200 })
          else if (act === "decompose") (it?.decompose?.length ? it.decompose : [[outs[0], 4]]).forEach(([id, n]) => gains.push({ id, n }))
          else gains.push({ id: outs[(Math.random() * outs.length) | 0], n: 1 })
        }
        costs.push({ id: hashItem(cur.primaryItemHash)?.id || "star_fruit", n: 1 })
      }
      cur = { ...cur, currentCount: cur.currentCount + 1 }
      queue = [cur]
      enhLevel = enh[1]
      cycleAt = performance.now()
      if (cfg.lifeIcon) return
      play({ skill, gains, costs, exp: 10 + Math.random() * 30, ups, enh, action: cur })
    }
    // a whole trial of the panel's skill: an attempt per cycle (75% success, 10% double), cleared after ~10
    let labTrialTimer = 0
    function labTrial(from) {
      labStopTrials()
      const skill = labState.skill
      // only a labyrinth enhancing room goes by levels; the guild's enhancing trial is progress like the rest
      const enh = skill === "enhancing" && from === "lab"
      const ppa = 160
      const msg = { trialHrid: "/guild_skilling/" + skill, tier: 1, successRate: 0.75, efficiency: 0.4, doubleProgressChance: 0.1, progressPerAction: ppa, targetLevel: enh ? 5 : null, actionTimeMs: labState.dur * 1000, timeoutAt: new Date(Date.now() + 600e3).toISOString(), targetWorkValue: enh ? 0 : ppa * 10, currentWorkValue: 0, currentEnhLevel: 0, actionCounter: 0 }
      if (from === "lab") labState.realLab = labyrinth
      if (from === "lab") labyrinth = { isActive: true, currentFloor: 1 + ((Math.random() * 20) | 0), pathData: [{ x: 0, y: 0 }], roomData: [[{ roomType: "/labyrinth_room_types/skilling", skillHrid: "/skills/" + skill, recommendedLevel: 80 }]] }
      else {
        // forty made-up members, their looks picked from the game's avatars and outfits
        const avatars = Doll.list("a_").map(k => k.slice(2))
        const outfits = Doll.list("o_").map(k => k.slice(2))
        const pick = (list, fallback) => (list.length ? list[(Math.random() * list.length) | 0] : fallback)
        const names = ["奶牛大王", "BigShield", "RizeBelieve", "Dawant", "挤奶工", "伐木累", "TeaTime", "Moo"]
        msg.participantIds = [myId]
        for (let i = 1; i <= 40; i++) {
          guildChars[-i] = { name: names[i - 1] || "成员" + i, avatarHrid: "/avatars/" + pick(avatars, ["blue_person_1", "green_person_2", "purple_person_1"][i % 3]), avatarOutfitHrid: Math.random() < 0.7 && outfits.length ? "/avatar_outfits/" + pick(outfits) : "" }
          msg.participantIds.push(-i)
        }
      }
      delete trials[from]
      onTrial(from, { ...msg })
      if (trials[from]) trials[from].lab = true
      labTrialTimer = setInterval(() => {
        if (!trials[from] || trials[from].ended) return clearInterval(labTrialTimer)
        msg.actionCounter++
        const r = Math.random()
        if (enh) msg.currentEnhLevel = r < 0.6 ? msg.currentEnhLevel + 1 : Math.max(0, msg.currentEnhLevel - 1)
        else if (r < 0.75) msg.currentWorkValue += ppa * (r < 0.1 ? 2 : 1)
        msg.currentProgress = msg.targetWorkValue ? msg.currentWorkValue / msg.targetWorkValue : 0
        onTrial(from, { ...msg })
      }, labState.dur * 1000)
    }
    function labEnd() {
      labStopTrials()
      const s = labState.saved
      labState = null
      el?.querySelector(".bfxl-lab")?.remove()
      Object.keys(tools).forEach(k => delete tools[k])
      Object.assign(tools, s.tools)
      Object.assign(toolEnh, s.toolEnh)
      cur = null
      setQueue(s.queue)
      measured = s.measured
    }
    // plays a few fake completions for the current action (or a cow) without the game
    function demo(hrid = cur?.actionHrid || "/actions/milking/cow") {
      if (!isLife(cur) || cur.actionHrid !== hrid) setQueue([{ id: -1, actionHrid: hrid, currentCount: 0, hasMaxCount: false }])
      const skill = skillOf(hrid)
      cycleAt = performance.now()
      play({ skill, gains: [{ id: shortId(hrid), n: 2 }, { id: skill + "_essence", n: 1 }], costs: [{ id: "cheese", n: 3 }], exp: 12.5, ups: [[skill, 10]], enh: [3, 4], action: cur })
    }
    // #dev-end
    setInterval(() => {
      trialTick()
      ensure()
      roomTick()
      if (el && !cfg.lifePos) place()
      if (raf === 0 && visible() && !cfg.lifeMin && (isLife(cur) || inTown())) raf = requestAnimationFrame(frame)
    }, 1000)
    // #dev-start
    return { onMessage, ensure, demo, lab, state: () => ({ cur, queue, tools, measured, dur: dur(), inv }) }
    // #dev-end
    // #release-start
    // return { onMessage, ensure }
    // #release-end
  })()

  // ---------- 动画测试: a sandbox for any location, line-up, skill and pose ----------
  // (the data below and the Arena ship in releases: the rigged stage plays real battles; only the lab is dev)
  const MONSTERS = {"abyssal_imp":["深渊小鬼","magic","fire"],"acrobat":["杂技师","smash","physical"],"alligator":["夏洛克","slash","physical"],"anchor_shark":["持锚鲨","smash","physical"],"aquahorse":["水马","ranged","water"],"black_bear":["黑熊","stab","physical"],"brine_marksman":["海盐射手","ranged","physical"],"butterjerry":["蝶鼠","stab","physical"],"captain_fishhook":["鱼钩船长","slash","physical"],"centaur_archer":["半人马弓箭手","ranged","physical"],"chronofrost_sorcerer":["霜时巫师","magic","water"],"crab":["螃蟹","smash","physical"],"crystal_colossus":["水晶巨像","stab","physical"],"cyclops":["独眼巨人","smash","physical"],"demonic_overlord":["恶魔霸主","magic","fire"],"deranged_jester":["小丑皇","smash","physical"],"dodocamel":["渡渡驼","smash","physical"],"dryad":["树精","magic","nature"],"dusk_revenant":["黄昏亡灵","ranged","physical"],"elementalist":["元素法师","magic","fire"],"enchanted_bishop":["秘法主教","magic","nature"],"enchanted_king":["秘法国王","slash","physical"],"enchanted_knight":["秘法骑士","slash","physical"],"enchanted_pawn":["秘法士兵","smash","physical"],"enchanted_queen":["秘法王后","magic","water"],"enchanted_rook":["秘法堡垒","ranged","physical"],"eye":["独眼","slash","physical"],"eyes":["叠眼","slash","physical"],"flame_sorcerer":["火焰巫师","magic","fire"],"fly":["苍蝇","smash","physical"],"frog":["青蛙","smash","physical"],"frost_sniper":["霜冻狙击手","ranged","water"],"giant_mantis":["巨螳螂","slash","physical"],"giant_scorpion":["巨蝎","stab","physical"],"giant_shoebill":["鲸头鹳","smash","physical"],"gobo_boomy":["轰轰","magic","fire"],"gobo_chieftain":["哥布林酋长","stab","physical"],"gobo_shooty":["咻咻","ranged","physical"],"gobo_slashy":["砍砍","slash","physical"],"gobo_smashy":["锤锤","smash","physical"],"gobo_stabby":["刺刺","stab","physical"],"granite_golem":["花岗岩魔像","smash","physical"],"griffin":["狮鹫","slash","physical"],"grizzly_bear":["棕熊","slash","physical"],"gummy_bear":["软糖熊","smash","physical"],"ice_sorcerer":["冰霜巫师","magic","water"],"infernal_warlock":["地狱术士","magic","fire"],"jackalope":["鹿角兔","magic","nature"],"juggler":["杂耍者","ranged","physical"],"jungle_sprite":["丛林精灵","magic","nature"],"luna_empress":["月神之蝶","magic","nature"],"magician":["魔术师","magic","fire"],"magnetic_golem":["磁力魔像","smash","physical"],"manticore":["狮蝎兽","ranged","physical"],"marine_huntress":["海洋猎手","ranged","water"],"mimic":["宝箱怪","stab","physical"],"myconid":["蘑菇人","magic","nature"],"nom_nom":["咬咬鱼","stab","physical"],"novice_sorcerer":["新手巫师","magic","water"],"panda":["熊猫","smash","physical"],"polar_bear":["北极熊","smash","physical"],"porcupine":["豪猪","ranged","physical"],"pyre_hunter":["火焰猎手","ranged","fire"],"rabid_rabbit":["疯魔兔","slash","physical"],"rat":["杰瑞","stab","physical"],"red_panda":["小熊猫","slash","physical"],"salamander":["火蜥蜴","magic","fire"],"sea_snail":["蜗牛","smash","physical"],"shadow_archer":["暗影弓手","ranged","physical"],"siren":["海妖","magic","water"],"skunk":["臭鼬","slash","physical"],"slimy":["史莱姆","magic","water"],"snake":["蛇","stab","physical"],"soul_hunter":["灵魂猎手","ranged","physical"],"squawker":["鹦鹉","magic","nature"],"stalactite_golem":["钟乳石魔像","stab","physical"],"swampy":["沼泽虫","smash","physical"],"the_kraken":["克拉肯","ranged","physical"],"the_watcher":["观察者","ranged","physical"],"tidal_conjuror":["潮汐召唤师","magic","water"],"treant":["树人","magic","nature"],"trial_badger":["试炼獾","slash","physical"],"trial_beetle":["试炼甲虫","smash","physical"],"trial_chameleon":["试炼变色龙","ranged","physical"],"trial_dragonfly":["试炼蜻蜓","ranged","physical"],"trial_firefly":["试炼萤火虫","magic","fire"],"trial_hedgehog":["试炼刺猬","magic","nature"],"trial_jellyfish":["试炼水母","magic","water"],"trial_wasp":["试炼黄蜂","stab","physical"],"turtle":["忍者龟","smash","physical"],"vampire":["吸血鬼","stab","physical"],"veyes":["复眼","slash","physical"],"werewolf":["狼人","slash","physical"],"zombie":["僵尸","slash","physical"],"zombie_bear":["僵尸熊","stab","physical"]}
  const LOCATIONS = {"aqua_planet":["海洋星球",["sea_snail","crab","aquahorse","nom_nom","turtle","marine_huntress"]],"bear_with_it":["熊熊星球",["gummy_bear","panda","black_bear","grizzly_bear","polar_bear","red_panda"]],"chimerical_den":["奇幻洞穴",["rat","skunk","porcupine","slimy","frog","snake","swampy","alligator","sea_snail","crab","aquahorse","jungle_sprite","myconid","nom_nom","turtle","centaur_archer","gobo_stabby","gobo_slashy","gobo_smashy","gobo_shooty","gobo_boomy","eye","butterjerry","eyes","veyes","jackalope","dodocamel","manticore","griffin"]],"enchanted_fortress":["秘法要塞",["novice_sorcerer","ice_sorcerer","flame_sorcerer","panda","black_bear","magnetic_golem","abyssal_imp","elementalist","grizzly_bear","polar_bear","stalactite_golem","soul_hunter","enchanted_pawn","enchanted_knight","enchanted_bishop","enchanted_rook","enchanted_queen","enchanted_king"]],"gobo_planet":["哥布林星球",["gobo_stabby","gobo_slashy","gobo_smashy","gobo_shooty","gobo_boomy","gobo_chieftain"]],"golem_cave":["魔像洞穴",["magnetic_golem","stalactite_golem","granite_golem","crystal_colossus"]],"infernal_abyss":["地狱深渊",["abyssal_imp","soul_hunter","infernal_warlock","demonic_overlord"]],"jungle_planet":["丛林星球",["jungle_sprite","myconid","treant","centaur_archer","luna_empress"]],"pirate_cove":["海盗基地",["eye","eyes","veyes","zombie","magnetic_golem","abyssal_imp","vampire","stalactite_golem","soul_hunter","squawker","werewolf","granite_golem","infernal_warlock","anchor_shark","brine_marksman","tidal_conjuror","captain_fishhook","the_kraken"]],"planet_of_the_eyes":["眼球星球",["eye","eyes","veyes","the_watcher"]],"sinister_circus":["阴森马戏团",["gobo_stabby","gobo_slashy","gobo_smashy","gobo_shooty","gobo_boomy","novice_sorcerer","gummy_bear","ice_sorcerer","flame_sorcerer","panda","black_bear","grizzly_bear","polar_bear","zombie","vampire","rabid_rabbit","elementalist","werewolf","zombie_bear","acrobat","juggler","magician","deranged_jester"]],"smelly_planet":["臭臭星球",["fly","rat","skunk","porcupine","slimy"]],"sorcerers_tower":["巫师之塔",["novice_sorcerer","ice_sorcerer","flame_sorcerer","elementalist","chronofrost_sorcerer"]],"swamp_planet":["沼泽星球",["frog","snake","swampy","alligator","giant_shoebill"]],"twilight_zone":["暮光之地",["zombie","vampire","werewolf","dusk_revenant"]]} // #dev
  // ---------- 动画测试: the rigged battle (PixiJS) with an auto battle ----------
  // the abilities each monster has in the game (game data: combatMonsterDetailMap[].abilities)
  const MONSTER_SKILLS = {"abyssal_imp":["quick_aid","firestorm","fireball"],"acrobat":["speed_aura","elusiveness","precision","smack","stunning_blow"],"alligator":["scratch"],"anchor_shark":["invincible","toughness","berserk","stunning_blow","shield_bash"],"aquahorse":["aqua_arrow"],"black_bear":["frenzy"],"brine_marksman":["critical_aura","rain_of_arrows","aqua_arrow","penetrating_shot","quick_shot"],"butterjerry":["fierce_aura","frenzy","poke","impale"],"captain_fishhook":["fierce_aura","frenzy","cleave","maim","fracturing_impact"],"centaur_archer":["elusiveness","rain_of_arrows","quick_shot"],"chronofrost_sorcerer":["mystic_aura","heal","elemental_affinity","frost_surge","ice_spear"],"crab":["smack"],"crystal_colossus":["invincible","toughness","spike_shell","puncture","impale"],"cyclops":["guardian_aura","toughness","sweep","stunning_blow","fracturing_impact"],"demonic_overlord":["mystic_aura","toughness","firestorm","flame_blast","fireball"],"deranged_jester":["insanity","vampirism","smoke_burst","sweep","stunning_blow"],"dodocamel":["invincible","toughness","berserk","sweep","shield_bash"],"dryad":["guardian_aura","toxic_pollen","natures_veil","life_drain","entangle"],"dusk_revenant":["critical_aura","vampirism","steady_shot","silencing_shot","rain_of_arrows"],"elementalist":["revive","elemental_affinity","ice_spear","flame_blast"],"enchanted_bishop":["revive","retribution","rejuvenate","heal","natures_veil"],"enchanted_king":["invincible","toughness","elusiveness","crippling_slash","cleave"],"enchanted_knight":["fierce_aura","toughness","frenzy","crippling_slash","maim"],"enchanted_pawn":["promote","elusiveness","precision","stunning_blow"],"enchanted_queen":["speed_aura","toxic_pollen","mana_spring","flame_blast","water_strike"],"enchanted_rook":["critical_aura","precision","rain_of_arrows","silencing_shot","penetrating_shot"],"eye":["precision"],"eyes":["precision"],"flame_sorcerer":["flame_blast","fireball"],"frog":["smack"],"frost_sniper":["critical_aura","silencing_shot","rain_of_arrows","aqua_arrow","quick_shot"],"giant_mantis":["fierce_aura","precision","cleave","maim","crippling_slash"],"giant_scorpion":["fierce_aura","berserk","impale","puncture","penetrating_strike"],"giant_shoebill":["speed_aura","elusiveness","sweep","smack"],"gobo_boomy":["revive","fireball"],"gobo_chieftain":["fierce_aura","berserk","puncture","impale","poke"],"gobo_shooty":["flame_arrow"],"gobo_slashy":["cleave"],"gobo_smashy":["berserk"],"gobo_stabby":["impale"],"granite_golem":["invincible","provoke","stunning_blow","sweep"],"griffin":["fierce_aura","berserk","frenzy","rain_of_arrows","crippling_slash"],"grizzly_bear":["frenzy"],"gummy_bear":["frenzy"],"ice_sorcerer":["ice_spear","water_strike"],"infernal_warlock":["mystic_aura","firestorm","flame_blast"],"jackalope":["guardian_aura","heal","natures_veil","entangle"],"juggler":["critical_aura","precision","frenzy","pestilent_shot","steady_shot"],"jungle_sprite":["rejuvenate","heal","entangle"],"luna_empress":["guardian_aura","rejuvenate","elusiveness","natures_veil","toxic_pollen"],"magician":["mystic_aura","elemental_affinity","rejuvenate","firestorm","fireball"],"magnetic_golem":["stunning_blow"],"manticore":["critical_aura","precision","pestilent_shot","steady_shot","rain_of_arrows"],"marine_huntress":["mystic_aura","silencing_shot","aqua_arrow","rain_of_arrows"],"mimic":["speed_aura","frenzy","elusiveness","impale","penetrating_strike"],"myconid":["toxic_pollen"],"nom_nom":["impale"],"novice_sorcerer":["quick_aid","water_strike"],"panda":["toughness"],"polar_bear":["fierce_aura","frenzy"],"porcupine":["quick_shot"],"pyre_hunter":["critical_aura","precision","steady_shot","rain_of_arrows","flame_arrow"],"rabid_rabbit":["insanity","berserk","frenzy","scratch"],"rat":["poke"],"red_panda":["insanity","berserk","frenzy","maim","cleave"],"salamander":["mystic_aura","elemental_affinity","firestorm","smoke_burst","fireball"],"sea_snail":["toughness"],"shadow_archer":["critical_aura","elusiveness","rain_of_arrows","penetrating_shot","steady_shot"],"siren":["mystic_aura","elemental_affinity","frost_surge","mana_spring","water_strike"],"skunk":["scratch"],"slimy":["minor_heal","water_strike"],"snake":["poke"],"soul_hunter":["critical_aura","silencing_shot","flame_arrow"],"squawker":["guardian_aura","life_drain","natures_veil","entangle"],"stalactite_golem":["guardian_aura","spike_shell","toughness"],"swampy":["sweep"],"the_kraken":["critical_aura","frenzy","aqua_arrow","penetrating_shot","fracturing_impact"],"the_watcher":["speed_aura","precision","steady_shot","aqua_arrow","flame_arrow"],"tidal_conjuror":["mystic_aura","elemental_affinity","frost_surge","ice_spear","water_strike"],"treant":["guardian_aura","toxic_pollen","entangle"],"trial_badger":["fierce_aura","berserk","maim","cleave","scratch"],"trial_beetle":["invincible","toughness","fracturing_impact","stunning_blow","sweep"],"trial_chameleon":["critical_aura","precision","penetrating_shot","rain_of_arrows","steady_shot"],"trial_dragonfly":["critical_aura","precision","steady_shot","rain_of_arrows","pestilent_shot"],"trial_firefly":["mystic_aura","elemental_affinity","firestorm","smoke_burst","fireball"],"trial_hedgehog":["guardian_aura","toughness","spike_shell","natures_veil","fracturing_impact"],"trial_jellyfish":["mystic_aura","elemental_affinity","frost_surge","mana_spring","water_strike"],"trial_wasp":["fierce_aura","frenzy","penetrating_strike","puncture","impale"],"turtle":["taunt","toughness"],"vampire":["fierce_aura","vampirism","puncture"],"veyes":["precision"],"werewolf":["insanity","berserk","maim"],"zombie":["toughness","maim","natures_veil"],"zombie_bear":["fierce_aura","berserk","puncture","penetrating_strike"]} // #dev
  // abilities that can stun: [chance, duration ms] (game data: abilityEffects stunChance / stunDuration)
  const STUNS = {"entangle":[0.1,2000],"stunning_blow":[0.7,3000]} // #dev
  // each held weapon piece's long axis [butt x, y, head x, y, break?] in piece pixels (tools/rig-weapon-geom.py); break =
  // where the art is broken along the shaft (0 butt … 1 head), when it is
  const WEAPON_AXIS = {"arcane_bow":[16,257,52,2],"arcane_crossbow":[5,88,128,88],"arcane_fire_staff":[13,379,58,8],"arcane_nature_staff":[26,270,26,2],"arcane_water_staff":[12,349,71,7],"azure_bulwark":[75,210,75,8],"azure_mace":[7,189,147,24],"azure_spear":[20,399,19,9],"azure_sword":[9,235,183,5,0.118],"birch_bow":[13,304,58,1,0.463],"birch_crossbow":[58,172,58,7],"birch_fire_staff":[17,397,30,8,0.765],"birch_nature_staff":[11,266,27,2],"birch_water_staff":[10,332,59,9],"blazing_trident":[10,402,46,12,0.295],"blooming_trident":[27,437,63,12],"burble_bulwark":[58,164,61,6],"burble_mace":[7,186,152,22],"burble_spear":[20,400,25,9],"burble_sword":[7,200,148,3,0.161],"cedar_bow":[10,269,60,1,0.418],"cedar_crossbow":[10,176,54,9,0.184],"cedar_fire_staff":[8,309,67,7],"cedar_nature_staff":[7,260,48,0],"cedar_water_staff":[7,336,67,4],"chaotic_flail":[-11,160,164,37],"cheese_bulwark":[65,178,65,7],"cheese_mace":[6,203,161,23],"cheese_spear":[24,378,25,9],"cheese_sword":[12,213,153,4,0.14],"crimson_bulwark":[65,180,65,7],"crimson_mace":[6,190,153,22],"crimson_spear":[18,371,19,9],"crimson_sword":[12,261,175,5,0.128],"cursed_bow":[24,337,65,10],"frost_staff":[12,360,64,3],"furious_spear":[42,436,40,12],"ginkgo_bow":[6,307,44,2,0.442],"ginkgo_crossbow":[46,203,46,8],"ginkgo_fire_staff":[10,295,63,7],"ginkgo_nature_staff":[13,353,43,3],"ginkgo_water_staff":[13,358,58,10],"gobo_boomstick":[6,279,81,13,0.661],"gobo_defender":[144,240,6,8,0.172],"gobo_shooter":[33,105,112,33],"gobo_slasher":[6,203,159,-6],"gobo_smasher":[1,214,163,4],"gobo_stabber":[6,184,139,3,0.172],"granite_bludgeon":[6,192,161,7],"griffin_bulwark":[75,211,75,11],"holy_bulwark":[73,196,75,8],"holy_mace":[7,208,156,21],"holy_spear":[23,390,25,10],"holy_sword":[8,222,176,6,0.117],"infernal_battlestaff":[-2,387,96,-1],"jackalope_staff":[10,353,60,0],"purpleheart_bow":[21,311,54,3,0.452],"purpleheart_crossbow":[10,99,126,99],"purpleheart_fire_staff":[15,406,37,8],"purpleheart_nature_staff":[27,271,25,2],"purpleheart_water_staff":[11,305,61,8],"rainbow_bulwark":[32,230,32,8],"rainbow_mace":[21,288,74,12],"rainbow_spear":[7,372,23,9],"rainbow_sword":[35,299,38,6,0.117],"redwood_bow":[13,309,100,1,0.424],"redwood_crossbow":[-1,169,72,13],"redwood_fire_staff":[11,288,30,8],"redwood_nature_staff":[12,304,48,2],"redwood_water_staff":[10,341,64,6],"regal_sword":[6,241,177,6,0.1],"rippling_trident":[14,375,63,10,0.324],"snake_fang_dirk":[4,14,184,62,0.214],"soul_hunter_crossbow":[21,168,56,5],"spiked_bulwark":[69,223,87,9],"stalactite_spear":[7,378,22,9],"sundering_crossbow":[44,237,44,8],"vampire_fang_dirk":[2,6,171,34,0.201],"vampiric_bow":[28,386,42,4],"verdant_bulwark":[70,195,72,8],"verdant_mace":[6,194,155,23],"verdant_spear":[6,374,25,8,0.723],"verdant_sword":[7,247,178,5,0.105],"werewolf_slasher":[15,273,205,35],"wooden_bow":[15,297,39,3,0.459],"wooden_crossbow":[23,186,71,8,0.202],"wooden_fire_staff":[8,319,62,7],"wooden_nature_staff":[27,251,28,2,0.602],"wooden_water_staff":[9,330,59,4],"rig:arcane_crossbow":[0,63,200,63],"rig:birch_crossbow":[0,57,200,57],"rig:cedar_crossbow":[0,46,200,46],"rig:ginkgo_crossbow":[0,43,200,43],"rig:purpleheart_crossbow":[0,39,200,39],"rig:redwood_crossbow":[0,47,200,47],"rig:soul_hunter_crossbow":[0,52,200,52],"rig:sundering_crossbow":[0,61,200,61],"rig:wooden_crossbow":[0,53,200,53]}
  // where the hand holds an item redrawn for the rig, in its pixels (books: the bottom of the spine, tools/rig-book-guide.py)
  const RIG_GRIP = {"rig:bishops_codex":[71,83],"rig:tome_of_healing":[71,83],"rig:tome_of_the_elements":[72,83]}
  // grip styles of the rigged player: at = where the hand holds the weapon (0 butt … 1 head), aim = its angle at rest
  // (degrees from straight down, 90 level forward, 180 straight up), hand = the hand it is in (hm back / ho front),
  // gap = held over a break in the art near the butt instead (a trident's loose spike), two = where the other hand takes
  // the weapon too when nothing is in the off hand, scale = drawn bigger, z = drawn over both hands (a great shield held
  // from behind); each style has its actions (ACTIONS["player:<style>"], the sword's set where it has none yet).
  // Crossbows are side views redrawn for the rig (assets/rig/weapons, axes "rig:<id>", tools/rig-weapons.py): the
  // paper-doll ones were seen from above.
  const GRIPS = {
    sword: { at: 0.12, aim: 172 },
    mace: { at: 0.12, aim: 172 },
    spear: { at: 0.3, aim: 96, two: 0.56 },
    staff: { at: 0.3, aim: 166, gap: true },
    bow: { at: 0.5, aim: 180, hand: "ho" },
    crossbow: { at: 0.4, aim: 90, scale: 1.25, z: 4.2 },
    bulwark: { at: 0.5, aim: 180, hand: "ho", two: 0.38, scale: 1.35, z: 4.3 },
    great: { at: 0.1, aim: 172, two: 0.24 },
    // the goblin sais: a pair, one in each hand (the icon's two crossed sais cut apart: ICON_CUT), the sword's moves
    // with a dagger in the front hand
    sai: { at: 0.14, aim: 172 },
  }
  // a weapon held at its own point instead of its style's: the goblin slingshot by its handle (it has its own band
  // drawn on, so no string), the short goblin boomstick low enough that its head clears the face
  const GRIP_AT = { gobo_shooter: 0.14, gobo_boomstick: 0.12 }
  function gripOf(items) {
    const id = String(items?.main_hand || items?.two_hand || "").split("/").pop().replace(/_refined$/, "")
    if (/crossbow/.test(id)) return "crossbow"
    if (/_bow$/.test(id) || id === "gobo_shooter") return "bow"
    if (/staff|trident|boomstick/.test(id)) return "staff"
    if (id === "gobo_stabber") return "sai"
    if (/spear/.test(id)) return "spear"
    if (/bulwark/.test(id)) return "bulwark"
    if (/slasher|smasher/.test(id)) return "great"
    if (/mace|flail|bludgeon/.test(id)) return "mace"
    return "sword"
  }
  // #dev-start
  // Only units that have a rig take part: 1号 is the drawn player pilot (blue hair, warrior outfit, holy sword +
  // knight's aegis, sword skills), the monsters are every rigged monster. The DOM stage still hangs in a hidden slot
  // (Stage.attach(Lab.render(), "test")) but gets no events.
  const Lab = (() => {
    // 1号's grip styles to try (the look stays the pilot's: avatar blue_person_1, outfit warrior_1)
    const PILOTS = [
      { name: "1号 剑盾", style: "slash", element: "physical", skills: ["cleave", "maim", "crippling_slash", "berserk", "fierce_aura"], items: { main_hand: "holy_sword", off_hand: "knights_aegis" } },
      { name: "1号 枪盾", style: "stab", element: "physical", skills: ["poke", "impale", "puncture", "penetrating_strike", "frenzy"], items: { main_hand: "holy_spear", off_hand: "holy_buckler" } },
      { name: "1号 锤盾", style: "smash", element: "physical", skills: ["smack", "stunning_blow", "sweep", "fracturing_impact", "shield_bash", "toughness"], items: { main_hand: "holy_mace", off_hand: "arcane_shield" } },
      { name: "1号 弩盾", style: "ranged", element: "physical", skills: ["quick_shot", "steady_shot", "penetrating_shot", "rain_of_arrows", "aqua_arrow", "precision"], items: { main_hand: "arcane_crossbow", off_hand: "holy_buckler" } },
      { name: "1号 法杖", style: "magic", element: "fire", skills: ["fireball", "smoke_burst", "flame_blast", "firestorm", "heal", "mystic_aura"], items: { main_hand: "blazing_trident", off_hand: "tome_of_the_elements" } },
      { name: "1号 剑+匕首", style: "slash", element: "physical", skills: ["cleave", "maim", "crippling_slash", "berserk"], items: { main_hand: "holy_sword", off_hand: "vampire_fang_dirk" } },
      { name: "1号 三叉戟+书", style: "magic", element: "water", skills: ["water_strike", "ice_spear", "frost_surge", "mana_spring", "heal"], items: { main_hand: "rippling_trident", off_hand: "bishops_codex" } },
      { name: "1号 三叉戟+遗物", style: "magic", element: "nature", skills: ["entangle", "life_drain", "toxic_pollen", "natures_veil", "rejuvenate"], items: { main_hand: "blooming_trident", off_hand: "watchful_relic" } },
      { name: "1号 弓", style: "ranged", element: "physical", skills: ["quick_shot", "steady_shot", "penetrating_shot", "rain_of_arrows", "flame_arrow", "silencing_shot", "critical_aura"], items: { two_hand: "cursed_bow" } },
      { name: "1号 重盾", style: "smash", element: "physical", skills: ["shield_bash", "stunning_blow", "sweep", "fracturing_impact", "guardian_aura"], items: { two_hand: "holy_bulwark" } },
      { name: "1号 双手斩", style: "slash", element: "physical", skills: ["cleave", "maim", "crippling_slash", "berserk"], items: { two_hand: "werewolf_slasher" } },
      { name: "1号 哥布林重锤", style: "smash", element: "physical", skills: ["smack", "stunning_blow", "sweep", "fracturing_impact", "berserk"], items: { two_hand: "gobo_smasher" } },
      { name: "1号 哥布林刺枪", style: "stab", element: "physical", skills: ["poke", "impale", "puncture", "penetrating_strike", "frenzy"], items: { two_hand: "gobo_stabber" } },
      { name: "1号 哥布林弹弓", style: "ranged", element: "physical", skills: ["quick_shot", "steady_shot", "penetrating_shot", "rain_of_arrows"], items: { two_hand: "gobo_shooter" } },
      { name: "1号 哥布林爆炸杖", style: "magic", element: "fire", skills: ["fireball", "flame_blast", "firestorm", "heal"], items: { two_hand: "gobo_boomstick" } },
    ]
    const st = { loc: "golem_cave", tier: 0, pilot: 0, ...GM_getValue("battle_fx_lab_v2", {}) }
    const PILOT = () => ({ ...(PILOTS[st.pilot] || PILOTS[0]), avatar: st.avatar || "blue_person_1", outfit: st.outfit || "warrior_1" })
    // the avatars and outfits drawn for the rig so far (rig/player/rig.json), to dress 1号 in
    let looks = null
    const loadLooks = () =>
      (looks ||= fetch(Assets.url("rig/player/rig.json"))
        .then(r => r.json())
        .then(j => ((looks = { avatars: j.avatars, outfits: j.outfits }), draw()))
        .catch(() => {}))
    const save = () => GM_setValue("battle_fx_lab_v2", st)
    const lab = { p: [], m: [] }
    let root = null
    let autoTimer = 0
    let pending = 0
    const zh = k => abilityInfo("/abilities/" + k)?.name || k
    const pick = arr => arr[Math.floor(Math.random() * arr.length)]
    const alive = side => lab[side].map((u, i) => (u.hp > 0 ? i : -1)).filter(i => i >= 0)
    // the rigged monsters of the chosen map (all of them where it has none), six at most
    const rigged = () => {
      const all = Assets.list("rig").filter(id => MONSTERS[id])
      const here = all.filter(id => LOCATIONS[st.loc]?.[1].includes(id))
      // (st.ids: a given list, for checking a batch)
      if (st.ids) return st.ids.filter(id => all.includes(id)).slice(0, 6)
      return (here.length ? here : all).slice(0, 6)
    }

    const unitP = () => ({ element: "physical", ...structuredClone(PILOT()), hp: 1500, mp: 1000, maxHp: 1500, maxMp: 1000, lab: true, counters: {} })
    function unitM(id) {
      const [name, style, element] = MONSTERS[id] || [id, "smash", "physical"]
      return { name, hrid: "/monsters/" + id, hp: 4000, mp: 1000, maxHp: 4000, maxMp: 1000, style, element, counters: {} }
    }
    function buildUnits() {
      lab.p = [unitP()]
      lab.m = rigged().map(unitM)
    }
    // a change of hp on one unit, in the shape the stage expects
    function change(side, i, d) {
      const u = lab[side][i]
      const before = u.hp
      u.hp = Math.max(0, Math.min(u.maxHp, u.hp + d))
      return { side, i, dHP: u.hp - before, hp: u.hp, maxHp: u.maxHp, died: before > 0 && u.hp <= 0, revived: before <= 0 && u.hp > 0, crit: d < 0 && Math.random() < 0.2 }
    }
    const hitAmount = (side, i) => (Math.random() < 0.1 ? 0 : -Math.round(lab[side][i].maxHp * (0.04 + Math.random() * 0.08)))
    const show = evs => Arena.play(evs)

    function act(side, i, key) {
      const u = lab[side][i]
      if (!u || u.hp <= 0) return
      const foe = side === "p" ? "m" : "p"
      const ab = key ? abilityInfo("/abilities/" + key) : null
      let effect = "damage"
      let targets = []
      if (!ab || ab.kind === "damage") {
        const f = alive(foe)
        if (!f.length) return
        targets = (ab?.target === "allEnemies" ? f : [pick(f)]).map(j => change(foe, j, Math.round(hitAmount(foe, j) * (ab ? 1.6 : 1))))
        // a stunning ability stuns a target it hits with its chance (STUNS), for its duration
        const stun = ab && STUNS[ab.key]
        if (stun) for (const tg of targets) if (tg.dHP < 0 && !tg.died && Math.random() < stun[0]) tg.stunned = stun[1]
      } else if (ab.kind === "heal" || ab.kind === "revive") {
        effect = "heal"
        targets = [change(side, i, Math.round(u.maxHp * 0.15))]
      } else effect = "buff"
      show([{ actor: { side, i }, ab, effect, style: ab?.style || u.style, element: ab?.kind === "damage" ? ab.element : u.element, targets }])
      afterTurn()
    }
    // a cleared wave respawns, a wiped party gets back up
    function afterTurn() {
      if (pending) return
      if (!alive("m").length && lab.m.length)
        pending = setTimeout(() => {
          pending = 0
          lab.m.forEach((u, j) => show([{ actor: null, ab: null, effect: "regen", style: "", element: "heal", targets: [change("m", j, u.maxHp)] }]))
        }, 2200)
      else if (!alive("p").length)
        pending = setTimeout(() => {
          pending = 0
          lab.p.forEach((u, j) => show([{ actor: null, ab: null, effect: "regen", style: "", element: "heal", targets: [change("p", j, u.maxHp)] }]))
        }, 2200)
    }
    const skillsOf = j => MONSTER_SKILLS[(lab.m[j]?.hrid || "").split("/").pop()] || []
    function autoTick() {
      const who = [...alive("p").map(i => ["p", i]), ...alive("m").map(i => ["m", i])]
      if (!who.length) return
      const [side, i] = pick(who)
      const skills = side === "p" ? lab.p[i].skills : skillsOf(i)
      act(side, i, skills.length && Math.random() < 0.4 ? pick(skills) : null)
    }
    function setAuto(on) {
      clearInterval(autoTimer)
      autoTimer = on ? setInterval(autoTick, 1100) : 0
      draw()
    }
    function reset() {
      clearTimeout(pending)
      pending = 0
      buildUnits()
      Arena.sync()
    }

    // ----- controls -----
    const el = (tag, cls, text) => {
      const e = document.createElement(tag)
      if (cls) e.className = cls
      if (text != null) e.textContent = text
      return e
    }
    function select(options, value, onChange) {
      const s = el("select")
      for (const [v, label] of options) {
        const o = el("option", null, label)
        o.value = v
        s.appendChild(o)
      }
      s.value = value ?? ""
      s.addEventListener("change", () => onChange(s.value))
      return s
    }
    const button = (label, onClick, cls) => {
      const b = el("button", cls, label)
      b.addEventListener("click", onClick)
      return b
    }
    const row = label => {
      const r = el("div", "row")
      r.appendChild(el("span", "lbl", label))
      root.appendChild(r)
      return r
    }
    function draw() {
      if (!root) return
      root.replaceChildren()
      row("战场").append(
        select(Object.entries(LOCATIONS).map(([k, [n]]) => [k, n]), st.loc, v => ((st.loc = v), save(), reset())),
        select([0, 1, 2, 3, 4, 5].map(t => [t, "T" + t]), st.tier, v => ((st.tier = +v), save(), Arena.background())),
        // 1号's weapon (grip style)
        select(PILOTS.map((p, k) => [k, p.name]), st.pilot, v => ((st.pilot = +v), save(), reset(), draw())),
      )
      // 1号's look (avatar, outfit)
      if (looks?.avatars)
        row("形象").append(
          select(looks.avatars.map(k => [k, k]), PILOT().avatar, v => ((st.avatar = v), save(), reset(), draw())),
          select(looks.outfits.map(k => [k, k]), PILOT().outfit, v => ((st.outfit = v), save(), reset(), draw())),
        )
      else loadLooks()
      row("操作").append(
        button("怪物普攻", () => alive("m").length && act("m", pick(alive("m")), null)),
        // a monster uses one of its own abilities (MONSTER_SKILLS); one without any just attacks
        button("怪物放技能", () => {
          if (!alive("m").length) return
          const j = pick(alive("m"))
          act("m", j, pick(skillsOf(j)) || null)
        }),
        button("全部击杀", () => {
          alive("m").forEach(j => show([{ actor: null, ab: null, effect: "damage", style: "dot", element: "physical", targets: [change("m", j, -99999)] }]))
          afterTurn()
        }),
        button("1号倒下", () => {
          alive("p").forEach(j => show([{ actor: null, ab: null, effect: "damage", style: "dot", element: "physical", targets: [change("p", j, -99999)] }]))
          afterTurn()
        }),
        button("全员复活", () => {
          for (const side of ["p", "m"]) lab[side].forEach((u, j) => u.hp <= 0 && show([{ actor: null, ab: null, effect: "regen", style: "", element: "heal", targets: [change(side, j, u.maxHp)] }]))
        }),
        button(autoTimer ? "停止自动战斗" : "自动战斗", () => setAuto(!autoTimer), autoTimer ? "on" : ""),
        button("重置", reset),
        button(Arena.armsOn() ? "胳膊：开" : "胳膊：关", () => {
          st.arms = !Arena.armsOn()
          save()
          Arena.setArms(st.arms)
          draw()
        }, Arena.armsOn() ? "on" : ""),
      )
      lab.p.forEach((u, i) => row(u.name).append(button("普攻", () => act("p", i, null)), ...u.skills.map(k => button(zh(k), () => act("p", i, k), "skill"))))
    }

    // builds the controls and the PixiJS view in the tab panel; returns the (hidden) slot the DOM stage hangs in
    function render(panel) {
      root = panel.querySelector(".bfx-lab")
      if (!root) {
        root = el("div", "bfx-lab")
        panel.prepend(root)
      }
      let view = panel.querySelector(".bfx-arena")
      if (!view) {
        view = el("div", "bfx-arena")
        view.style.height = cfg.stageH + "px"
        panel.appendChild(view)
      }
      let slot = panel.querySelector(".bfx-lab-stage")
      if (!slot) {
        slot = el("div", "bfx-lab-stage")
        panel.appendChild(slot)
      }
      buildUnits()
      draw()
      Arena.open(view, { units: lab, loc: () => st.loc, tier: () => st.tier })
      return slot
    }
    const stop = () => setAuto(false)
    return { units: lab, render, stop, redraw: () => draw(), loc: () => st.loc, tier: () => st.tier, startAuto: () => setAuto(true) }
  })()
  // #dev-end
  // #release-start
  // const Lab = { units: { p: [], m: [] }, render() {}, stop() {}, redraw() {}, loc: () => null, tier: () => 0 }
  // #release-end

  // ---------- Arena: rigged units in WebGL (PixiJS + pixi-filters) ----------
  // Bodies are cutout rigs (assets/rig/): parts on joints (a player: a body and two floating hands), moved by keyframed
  // ACTIONS. Effects: bloom on effect sheets and sparks, a per-body shader that flashes on
  // a hit and burns the body away on death, shockwave + camera punch on crits, lights that dim the scene around a cast.
  const Arena = (() => {
    // PixiJS and its filters, loaded only when a stage first opens (most pages never show one; the 900 KB would be
    // read on every page load as an @require). Greasy Fork allows code from its recognised CDNs, and these are jsDelivr
    // npm references at a fixed version; each file is also checked against its hash (subresource integrity), so what
    // runs is exactly the published library. cdn.jsdelivr.net first, then the other jsDelivr hosts Greasy Fork lists
    // for networks where the first one is blocked.
    const LIBS = [
      ["npm/pixi.js@8.14.0/dist/pixi.min.js", "sha384-bWuiWufOk9p58s6Ew+wuR8zsJWaXZtIdPoxS1Mi7yvN/eCGWJuj1uV2m1JGROLgV"],
      ["npm/pixi-filters@6.1.5/dist/pixi-filters.js", "sha384-wOxcZA+vaqcNDmX7OgdhG7HetEjyw12tVVIUix+CShtNNE3TJRSlg40M2bfkYpEg"],
    ]
    const LIB_HOSTS = ["https://cdn.jsdelivr.net/", "https://fastly.jsdelivr.net/", "https://gcore.jsdelivr.net/"]
    const COLOR = { fire: 0xff6a2b, water: 0x3fb4ff, nature: 0x62d65a, physical: 0xffe3a3, heal: 0x6cff9a, buff: 0xffd84a }
    // per-body shader: uFlash mixes in a solid colour, uDis burns the body away along value noise (orange edge)
    const FRAG = `in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uFlash;
uniform vec3 uColor;
uniform float uDis;
uniform float uSeed;
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233))+uSeed)*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);}
void main(){
  vec4 c=texture(uTexture,vTextureCoord);
  c.rgb=mix(c.rgb,uColor*c.a,uFlash);
  if(uDis>0.0){
    float n=noise(vTextureCoord*14.0)*0.65+noise(vTextureCoord*41.0)*0.35;
    float th=uDis*1.1;
    if(n<th-0.07) c=vec4(0.0);
    else if(n<th) c=vec4(vec3(1.0,0.55,0.15)*c.a*1.6,c.a);
  }
  finalColor=c;
}`

    // ----- actions -----
    // An action: { dur (ms), loop?, hit? (ms: the blow lands), lunge? (melee: runs to the target before the hit),
    // keys: [{ t (ms), e? ("inout" | "in" | "out" | "linear", easing into this key), a: { part: degrees }, x?, y? }] }.
    // Degrees turn a part toward the foe from its drawn rest (a part not named in a key is at rest); x / y move the
    // whole body forward / up, in body heights. Kinds: "player" (sword pilot), or a monster id.
    const ACTIONS = {
      player: {
        // Floating hands (Lost Castle style): hm = the main hand (sword, back), ho = the off hand (shield, front), each
        // [forward, up, degrees] from where it is drawn. The sword rests pointing up and forward; + turns it back
        // (+30 straight up, +80 back over the head), - forward and down (-60 level, -110 down-forward).
        // Timing after the 2D brawlers: a very short wind-up, the blow lands in one frame, a held follow-through.
        idle: { dur: 1400, loop: true, keys: [{ t: 0, a: { hm: [-0.04, 0.02, 0], ho: [0.06, -0.05, 0] } }, { t: 700, a: { body: 2, hm: [-0.04, 0.04, 4], ho: [0.06, -0.035, 2] }, y: -0.01 }, { t: 1400, a: { hm: [-0.04, 0.02, 0], ho: [0.06, -0.05, 0] } }] },
        // 普攻 1: the sword snaps up behind the head and chops down in front
        attack: {
          dur: 430, hit: 150, lunge: true,
          keys: [
            { t: 0, a: { hm: [-0.04, 0.02, 0], ho: [0.06, -0.05, 0] } },
            { t: 90, e: "out", a: { body: -8, hm: [0.1, 0.5, 80], ho: [0.04, 0.02, 0] }, x: -0.02 },
            { t: 150, e: "in", a: { body: 12, hm: [0.45, 0.12, -110], ho: [-0.04, 0, 0] }, x: 0.05 },
            { t: 330, a: { body: 10, hm: [0.44, 0.1, -112], ho: [-0.04, 0, 0] }, x: 0.045 },
            { t: 430, a: { hm: [-0.04, 0.02, 0], ho: [0.06, -0.05, 0] } },
          ],
        },
        // 普攻 2: low in front, then a rising cut
        attack2: {
          dur: 520, hit: 220, lunge: true,
          keys: [
            { t: 0, a: { hm: [-0.04, 0.02, 0], ho: [0.06, -0.05, 0] } },
            { t: 140, e: "out", a: { body: 8, hm: [0.3, -0.05, -175], ho: [0.02, -0.02, 0] }, y: -0.03 },
            { t: 220, e: "in", a: { body: -10, hm: [0.4, 0.5, 20], ho: [-0.03, 0.03, 0] }, x: 0.05, y: 0.03 },
            { t: 400, a: { body: -9, hm: [0.4, 0.48, 22], ho: [-0.03, 0.03, 0] }, x: 0.045, y: 0.02 },
            { t: 520, a: { hm: [-0.04, 0.02, 0], ho: [0.06, -0.05, 0] } },
          ],
        },
        // 普攻 3: a hop and a smash down, the shield thrown forward
        attack3: {
          dur: 560, hit: 200, ring: 200, lunge: true,
          keys: [
            { t: 0, a: { hm: [-0.04, 0.02, 0], ho: [0.06, -0.05, 0] } },
            { t: 100, e: "out", a: { body: -10, hm: [0.1, 0.55, 80], ho: [0.05, 0.1, 0] }, y: 0.25 },
            { t: 200, e: "in", a: { body: 22, hm: [0.5, 0.05, -120], ho: [0.1, 0, 0] }, x: 0.08 },
            { t: 420, a: { body: 20, hm: [0.49, 0.04, -121], ho: [0.1, 0, 0] }, x: 0.075 },
            { t: 560, a: { hm: [-0.04, 0.02, 0], ho: [0.06, -0.05, 0] } },
          ],
        },
        // 普攻 4: a shield bash, the sword held back
        attack4: {
          dur: 600, hit: 220, lunge: true,
          keys: [
            { t: 0, a: { hm: [-0.04, 0.02, 0], ho: [0.06, -0.05, 0] } },
            { t: 120, e: "out", a: { body: -6, hm: [-0.05, 0.05, 40], ho: [-0.1, 0, 0] }, x: -0.03 },
            { t: 220, e: "in", a: { body: 18, hm: [0, 0.05, 30], ho: [0.25, 0.03, 0] }, x: 0.1 },
            { t: 420, a: { body: 16, hm: [0, 0.05, 30], ho: [0.24, 0.03, 0] }, x: 0.095 },
            { t: 600, a: { hm: [-0.04, 0.02, 0], ho: [0.06, -0.05, 0] } },
          ],
        },
        // 分裂斩: the blade held out level, two whole spins, a slam with a shock ring
        "skill:cleave": {
          dur: 1250, hit: 760, ring: 760, lunge: true,
          keys: [
            { t: 0, a: { hm: [-0.04, 0.02, 0], ho: [0.06, -0.05, 0] } },
            { t: 220, e: "out", a: { body: -10, hm: [0.4, 0.25, -60], ho: [-0.05, 0.05, 0] }, y: -0.02 },
            { t: 300, a: { body: -6, hm: [0.45, 0.25, -60], ho: [-0.05, 0.05, 0] }, y: 0.04 },
            { t: 760, e: "linear", a: { body: -6, hm: [0.45, 0.25, -60], ho: [-0.05, 0.05, 0] }, y: 0.06, r: 720 },
            { t: 820, e: "out", a: { body: 15, hm: [0.45, 0.1, -100], ho: [0, 0, 0] }, x: 0.04, r: 720 },
            { t: 1000, a: { body: 14, hm: [0.44, 0.1, -102], ho: [0, 0, 0] }, x: 0.04, r: 720 },
            { t: 1250, a: { hm: [-0.04, 0.02, 0], ho: [0.06, -0.05, 0] }, r: 720 },
          ],
        },
        // 血刃斩: a storm of stabs, the last one driving through
        "skill:maim": {
          dur: 1200, hit: 800, hits: [380, 520, 660], lunge: true, color: 0xff3b3b,
          keys: [
            { t: 0, a: { hm: [-0.04, 0.02, 0], ho: [0.06, -0.05, 0] } },
            { t: 220, e: "out", a: { body: -8, hm: [0.15, 0.25, -60], ho: [-0.05, 0.03, 0] }, x: -0.03 },
            { t: 380, e: "in", a: { body: 14, hm: [0.6, 0.25, -60], ho: [-0.05, 0, 0] }, x: 0.06 },
            { t: 450, a: { body: 10, hm: [0.3, 0.27, -60], ho: [-0.05, 0, 0] }, x: 0.06 },
            { t: 520, e: "in", a: { body: 14, hm: [0.62, 0.22, -60], ho: [-0.05, 0, 0] }, x: 0.07 },
            { t: 590, a: { body: 10, hm: [0.3, 0.25, -60], ho: [-0.05, 0, 0] }, x: 0.07 },
            { t: 660, e: "in", a: { body: 14, hm: [0.63, 0.27, -60], ho: [-0.05, 0, 0] }, x: 0.08 },
            { t: 730, a: { body: 8, hm: [0.3, 0.25, -60], ho: [-0.05, 0, 0] }, x: 0.08 },
            { t: 800, e: "in", a: { body: 18, hm: [0.7, 0.25, -60], ho: [-0.08, 0, 0] }, x: 0.12 },
            { t: 1000, a: { body: 16, hm: [0.68, 0.25, -61], ho: [-0.08, 0, 0] }, x: 0.11 },
            { t: 1200, a: { hm: [-0.04, 0.02, 0], ho: [0.06, -0.05, 0] } },
          ],
        },
        // 致残斩: crouched with the blade trailing low behind, a sweep at the legs, raised back and a second, harder sweep
        "skill:crippling_slash": {
          dur: 1300, hit: 820, hits: [520], ring: 820, lunge: true, color: 0xff8a3b,
          keys: [
            { t: 0, a: { hm: [-0.04, 0.02, 0], ho: [0.06, -0.05, 0] } },
            { t: 220, e: "out", a: { body: -12, hm: [-0.12, 0, 130], ho: [0.08, 0.05, 0] }, y: -0.03 },
            { t: 420, a: { body: -13, hm: [-0.13, -0.01, 132], ho: [0.08, 0.05, 0] }, y: -0.03 },
            { t: 520, e: "in", a: { body: 16, hm: [0.5, -0.02, -125], ho: [-0.05, 0, 0] }, x: 0.06 },
            { t: 600, e: "out", a: { body: 12, hm: [0.46, 0.02, -132], ho: [-0.05, 0, 0] }, x: 0.06 },
            { t: 720, e: "out", a: { body: -8, hm: [0.02, 0.32, 90], ho: [0.04, 0.04, 0] }, x: 0.05 },
            { t: 820, e: "in", a: { body: 20, hm: [0.52, -0.05, -128], ho: [-0.06, 0, 0] }, x: 0.1 },
            { t: 1050, a: { body: 18, hm: [0.51, -0.05, -129], ho: [-0.06, 0, 0] }, x: 0.095 },
            { t: 1300, a: { hm: [-0.04, 0.02, 0], ho: [0.06, -0.05, 0] } },
          ],
        },
        // any other damage skill: the sword raised high, held (charging), then a slam
        skill: {
          dur: 1100, hit: 650, ring: 650, lunge: true,
          keys: [
            { t: 0, a: { hm: [-0.04, 0.02, 0], ho: [0.06, -0.05, 0] } },
            { t: 260, e: "out", a: { body: -8, hm: [0.1, 0.6, 30], ho: [0, 0.03, 0] }, y: 0.02 },
            { t: 560, a: { body: -9, hm: [0.1, 0.62, 32], ho: [0, 0.03, 0] }, y: 0.02 },
            { t: 650, e: "in", a: { body: 22, hm: [0.5, 0.05, -120], ho: [0.05, 0, 0] }, x: 0.08 },
            { t: 900, a: { body: 20, hm: [0.49, 0.04, -121], ho: [0.05, 0, 0] }, x: 0.075 },
            { t: 1100, a: { hm: [-0.04, 0.02, 0], ho: [0.06, -0.05, 0] } },
          ],
        },
        // the shield thrust out against the blow, knocked back a step
        hurt: {
          dur: 400,
          keys: [
            { t: 0, a: { hm: [-0.04, 0.02, 0], ho: [0.06, -0.05, 0] } },
            { t: 70, e: "out", a: { body: -12, hm: [-0.08, 0.05, 30], ho: [0.1, 0.08, 10] }, x: -0.05 },
            { t: 230, a: { body: -8, hm: [-0.06, 0.06, 25], ho: [0.09, 0.07, 8] }, x: -0.04 },
            { t: 400, a: { hm: [-0.04, 0.02, 0], ho: [0.06, -0.05, 0] } },
          ],
        },
        // the sword raised straight up overhead
        cast: {
          dur: 1100,
          keys: [
            { t: 0, a: { hm: [-0.04, 0.02, 0], ho: [0.06, -0.05, 0] } },
            { t: 280, e: "out", a: { hm: [0.1, 0.62, 30], ho: [0, 0.02, 0] }, y: 0.03 },
            { t: 800, a: { hm: [0.1, 0.63, 30], ho: [0, 0.02, 0] }, y: 0.03 },
            { t: 1100, a: { hm: [-0.04, 0.02, 0], ho: [0.06, -0.05, 0] } },
          ],
        },
        // falls on the back; the sword ends planted upright beside the body, the shield on the ground
        dead: {
          dur: 650,
          keys: [
            { t: 0, a: { hm: [-0.04, 0.02, 0], ho: [0.06, -0.05, 0] } },
            { t: 200, a: { body: -25, hm: [-0.1, 0.1, 20], ho: [-0.05, 0.05, 20] } },
            { t: 650, e: "in", a: { body: -84, hm: [-0.25, -0.25, 30], ho: [-0.2, -0.5, -90] } },
          ],
        },
      },
      // ----- bow (after Lost Castle's bow_*): the bow in the front hand (ho), upright at rest; the back hand (hm) draws
      // the string. Hand degrees + lean the bow's top back (its arrow points up), - forward. Idle: held low and slanted.
      "player:bow": {
        idle: { dur: 1400, loop: true, keys: [{ t: 0, a: { hm: [0.04, -0.02, 0], ho: [-0.09, -0.11, -120] } }, { t: 700, a: { body: 2, hm: [0.04, 0, 2], ho: [-0.09, -0.095, -118] }, y: -0.01 }, { t: 1400, a: { hm: [0.04, -0.02, 0], ho: [-0.09, -0.11, -120] } }] },
        // 普攻 1: the bow up in front, a full draw, the release snaps the hand back
        attack: {
          dur: 700, shot: 330, hit: 520, from: "ho",
          keys: [
            { t: 0, a: { hm: [0.04, -0.02, 0], ho: [-0.09, -0.11, -120] } },
            { t: 120, e: "out", a: { body: -3, hm: [0.5, 0.12, 0], ho: [0.09, 0.07, 0] } },
            { t: 300, a: { body: -6, hm: [0.24, 0.14, 0], ho: [0.1, 0.08, 0] } },
            { t: 330, e: "out", a: { body: -8, hm: [0.16, 0.17, 10], ho: [0.07, 0.09, 6] }, x: -0.01 },
            { t: 520, a: { body: -7, hm: [0.17, 0.16, 8], ho: [0.08, 0.085, 4] }, x: -0.01 },
            { t: 700, a: { hm: [0.04, -0.02, 0], ho: [-0.09, -0.11, -120] } },
          ],
        },
        // 普攻 2: a quick shot from the hip, the bow canted forward
        attack2: {
          dur: 520, shot: 200, hit: 360, from: "ho",
          keys: [
            { t: 0, a: { hm: [0.04, -0.02, 0], ho: [-0.09, -0.11, -120] } },
            { t: 90, e: "out", a: { body: 2, hm: [0.46, 0.08, 0], ho: [0.07, 0.01, -35] } },
            { t: 180, a: { body: -4, hm: [0.28, 0.11, 0], ho: [0.07, 0.01, -35] } },
            { t: 200, e: "out", a: { body: -5, hm: [0.2, 0.13, 15], ho: [0.05, 0.02, -30] } },
            { t: 360, a: { body: -4, hm: [0.21, 0.12, 12], ho: [0.05, 0.02, -31] } },
            { t: 520, a: { hm: [0.04, -0.02, 0], ho: [-0.09, -0.11, -120] } },
          ],
        },
        // 普攻 3: a hop back, shooting in the air
        attack3: {
          dur: 760, shot: 360, hit: 540, from: "ho",
          keys: [
            { t: 0, a: { hm: [0.04, -0.02, 0], ho: [-0.09, -0.11, -120] } },
            { t: 140, e: "out", a: { body: -8, hm: [0.5, 0.14, 0], ho: [0.09, 0.1, 10] }, x: -0.12, y: 0.18 },
            { t: 320, a: { body: -10, hm: [0.22, 0.16, 0], ho: [0.09, 0.1, 10] }, x: -0.15, y: 0.22 },
            { t: 360, e: "out", a: { body: -12, hm: [0.12, 0.2, 20], ho: [0.06, 0.12, 14] }, x: -0.16, y: 0.2 },
            { t: 560, e: "in", a: { body: 4, hm: [0.1, 0.05, 10], ho: [0.02, 0.02, -40] }, x: -0.1 },
            { t: 760, a: { hm: [0.04, -0.02, 0], ho: [-0.09, -0.11, -120] } },
          ],
        },
        // any other ranged skill: a long, deep draw held while it charges, a heavy release that rocks the body back
        skill: {
          dur: 1250, shot: 900, hit: 1080, from: "ho",
          keys: [
            { t: 0, a: { hm: [0.04, -0.02, 0], ho: [-0.09, -0.11, -120] } },
            { t: 200, e: "out", a: { body: -2, hm: [0.5, 0.12, 0], ho: [0.1, 0.08, 0] } },
            { t: 520, a: { body: -10, hm: [0.12, 0.16, 0], ho: [0.12, 0.08, 0] }, x: -0.03 },
            { t: 860, a: { body: -11, hm: [0.11, 0.165, 0], ho: [0.12, 0.08, 0] }, x: -0.03 },
            { t: 900, e: "out", a: { body: -16, hm: [0.02, 0.22, 30], ho: [0.06, 0.1, 10] }, x: -0.07 },
            { t: 1080, a: { body: -14, hm: [0.03, 0.21, 26], ho: [0.07, 0.095, 8] }, x: -0.065 },
            { t: 1250, a: { hm: [0.04, -0.02, 0], ho: [-0.09, -0.11, -120] } },
          ],
        },
        // 快速射击: two arrows loosed back to back (shots: the earlier release), barely drawn
        "skill:quick_shot": {
          dur: 720, shots: [165], shot: 335, hit: 520, from: "ho",
          keys: [
            { t: 0, a: { hm: [0.04, -0.02, 0], ho: [-0.09, -0.11, -120] } },
            { t: 80, e: "out", a: { body: 0, hm: [0.46, 0.1, 0], ho: [0.08, 0.06, -8] } },
            { t: 150, a: { body: -3, hm: [0.24, 0.14, 0], ho: [0.09, 0.07, -6] } },
            { t: 165, e: "out", a: { body: -5, hm: [0.15, 0.17, 12], ho: [0.08, 0.08, -4] } },
            { t: 250, e: "out", a: { body: -2, hm: [0.46, 0.1, 0], ho: [0.09, 0.07, -6] } },
            { t: 320, a: { body: -4, hm: [0.24, 0.14, 0], ho: [0.1, 0.08, -4] } },
            { t: 335, e: "out", a: { body: -7, hm: [0.14, 0.18, 15], ho: [0.08, 0.09, 0] }, x: -0.015 },
            { t: 520, a: { body: -6, hm: [0.15, 0.17, 12], ho: [0.08, 0.085, 0] }, x: -0.015 },
            { t: 720, a: { hm: [0.04, -0.02, 0], ho: [-0.09, -0.11, -120] } },
          ],
        },
        // 稳定射击: leaning into the bow, a full draw held dead still, a clean release that hardly moves the body
        "skill:steady_shot": {
          dur: 1300, shot: 950, hit: 1120, from: "ho",
          keys: [
            { t: 0, a: { hm: [0.04, -0.02, 0], ho: [-0.09, -0.11, -120] } },
            { t: 240, e: "out", a: { body: 4, hm: [0.52, 0.1, 0], ho: [0.13, 0.07, 0] }, x: 0.02 },
            { t: 560, a: { body: 6, hm: [0.1, 0.15, 0], ho: [0.14, 0.07, 0] }, x: 0.02 },
            { t: 940, a: { body: 6, hm: [0.095, 0.152, 0], ho: [0.14, 0.07, 0] }, x: 0.02 },
            { t: 960, e: "out", a: { body: 2, hm: [0.03, 0.17, 10], ho: [0.12, 0.075, 2] }, x: 0.01 },
            { t: 1120, a: { body: 2, hm: [0.035, 0.168, 8], ho: [0.12, 0.075, 2] }, x: 0.01 },
            { t: 1300, a: { hm: [0.04, -0.02, 0], ho: [-0.09, -0.11, -120] } },
          ],
        },
        // 贯穿射击: leaned far back for the deepest draw, the arrow goes through the foe and on off the stage (pierce)
        "skill:penetrating_shot": {
          dur: 1300, shot: 900, hit: 1000, from: "ho", pierce: true,
          keys: [
            { t: 0, a: { hm: [0.04, -0.02, 0], ho: [-0.09, -0.11, -120] } },
            { t: 220, e: "out", a: { body: -4, hm: [0.5, 0.12, 0], ho: [0.1, 0.08, 0] } },
            { t: 600, a: { body: -16, hm: [0.08, 0.16, 0], ho: [0.13, 0.1, 4] }, x: -0.05 },
            { t: 880, a: { body: -17, hm: [0.07, 0.162, 0], ho: [0.13, 0.1, 4] }, x: -0.055 },
            { t: 900, e: "out", a: { body: -24, hm: [0.0, 0.22, 34], ho: [0.04, 0.13, 16] }, x: -0.12 },
            { t: 1100, a: { body: -20, hm: [0.01, 0.21, 30], ho: [0.05, 0.12, 12] }, x: -0.11 },
            { t: 1300, a: { hm: [0.04, -0.02, 0], ho: [-0.09, -0.11, -120] } },
          ],
        },
        // 箭雨: the bow tilted back, a volley shot up out of sight, raining down on every foe
        "skill:rain_of_arrows": {
          dur: 1300, shot: 700, hit: 1150, from: "ho", rain: true,
          keys: [
            { t: 0, a: { hm: [0.04, -0.02, 0], ho: [-0.09, -0.11, -120] } },
            { t: 220, e: "out", a: { body: -6, hm: [0.44, 0.19, 0], ho: [0.03, 0.21, 45] } },
            { t: 600, a: { body: -12, hm: [0.29, 0.06, 0], ho: [0.03, 0.21, 45] }, x: -0.02 },
            { t: 700, e: "out", a: { body: -14, hm: [0.2, 0.02, 20], ho: [0.02, 0.23, 50] }, x: -0.03 },
            { t: 1150, a: { body: -12, hm: [0.21, 0.03, 18], ho: [0.02, 0.22, 48] }, x: -0.03 },
            { t: 1300, a: { hm: [0.04, -0.02, 0], ho: [-0.09, -0.11, -120] } },
          ],
        },
        hurt: {
          dur: 400,
          keys: [
            { t: 0, a: { hm: [0.04, -0.02, 0], ho: [-0.09, -0.11, -120] } },
            { t: 70, e: "out", a: { body: -12, hm: [0.05, 0, 10], ho: [-0.05, 0.02, -20] }, x: -0.05 },
            { t: 230, a: { body: -8, hm: [0.05, 0, 8], ho: [-0.05, 0.01, -25] }, x: -0.04 },
            { t: 400, a: { hm: [0.04, -0.02, 0], ho: [-0.09, -0.11, -120] } },
          ],
        },
        // the bow raised upright overhead
        cast: {
          dur: 1100,
          keys: [
            { t: 0, a: { hm: [0.04, -0.02, 0], ho: [-0.09, -0.11, -120] } },
            { t: 280, e: "out", a: { hm: [0.1, 0.1, 0], ho: [-0.05, 0.54, 0] }, y: 0.03 },
            { t: 800, a: { hm: [0.1, 0.1, 0], ho: [-0.05, 0.55, 0] }, y: 0.03 },
            { t: 1100, a: { hm: [0.04, -0.02, 0], ho: [-0.09, -0.11, -120] } },
          ],
        },
        // falls on the back, the bow left lying flat beside the body
        dead: {
          dur: 650,
          keys: [
            { t: 0, a: { hm: [0.04, -0.02, 0], ho: [-0.09, -0.11, -120] } },
            { t: 200, a: { body: -25, hm: [-0.05, 0.1, 10], ho: [-0.1, 0, -100] } },
            { t: 650, e: "in", a: { body: -84, hm: [-0.25, -0.25, 30], ho: [-0.1, -0.66, -90] } },
          ],
        },
      },
      // ----- mace (one hand, smash): rests on the shoulder, comes down hard; a shield in the front hand. + swings the
      // head back over the shoulder, - forward and down.
      "player:mace": {
        idle: { dur: 1600, loop: true, keys: [{ t: 0, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } }, { t: 800, a: { body: 2, hm: [0.1, 0.135, 62], ho: [0.06, -0.035, 2] }, y: -0.01 }, { t: 1600, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } }] },
        // 普攻 1: off the shoulder, up behind the head and straight down
        attack: {
          dur: 620, hit: 260, lunge: true,
          keys: [
            { t: 0, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
            { t: 140, e: "out", a: { body: -10, hm: [0.05, 0.5, 95], ho: [0.04, 0.02, 0] }, x: -0.02 },
            { t: 260, e: "in", a: { body: 18, hm: [0.45, 0.05, -115], ho: [-0.04, 0, 0] }, x: 0.06 },
            { t: 460, a: { body: 16, hm: [0.44, 0.05, -116], ho: [-0.04, 0, 0] }, x: 0.055 },
            { t: 620, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
          ],
        },
        // 普攻 2: a flat swing from behind
        attack2: {
          dur: 600, hit: 250, lunge: true,
          keys: [
            { t: 0, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
            { t: 140, e: "out", a: { body: -12, hm: [-0.1, 0.2, 90], ho: [0.04, 0, 0] }, x: -0.02 },
            { t: 250, e: "in", a: { body: 14, hm: [0.42, 0.22, -80], ho: [-0.04, 0, 0] }, x: 0.05 },
            { t: 450, a: { body: 12, hm: [0.41, 0.21, -81], ho: [-0.04, 0, 0] }, x: 0.045 },
            { t: 600, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
          ],
        },
        // 普攻 3: dropped low, an uppercut
        attack3: {
          dur: 600, hit: 250, lunge: true,
          keys: [
            { t: 0, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
            { t: 140, e: "out", a: { body: 8, hm: [0.2, -0.1, -150], ho: [0.04, -0.03, 0] } },
            { t: 250, e: "in", a: { body: -12, hm: [0.35, 0.45, 20], ho: [-0.02, 0.02, 0] }, x: 0.04, y: 0.05 },
            { t: 450, a: { body: -10, hm: [0.34, 0.44, 21], ho: [-0.02, 0.02, 0] }, x: 0.04, y: 0.03 },
            { t: 600, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
          ],
        },
        // 普攻 4: a shield bash, the mace kept on the shoulder
        attack4: {
          dur: 600, hit: 220, lunge: true,
          keys: [
            { t: 0, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
            { t: 120, e: "out", a: { body: -6, hm: [0.05, 0.12, 70], ho: [-0.1, 0, 0] }, x: -0.03 },
            { t: 220, e: "in", a: { body: 18, hm: [0.1, 0.14, 60], ho: [0.25, 0.03, 0] }, x: 0.1 },
            { t: 420, a: { body: 16, hm: [0.1, 0.14, 60], ho: [0.24, 0.03, 0] }, x: 0.095 },
            { t: 600, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
          ],
        },
        // 重锤: wound far back and held, then hammered down on the foe's head
        "skill:stunning_blow": {
          dur: 1300, hit: 800, ring: 800, lunge: true,
          keys: [
            { t: 0, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
            { t: 300, e: "out", a: { body: -14, hm: [0, 0.6, 120], ho: [0.03, 0.03, 0] }, y: 0.05 },
            { t: 700, a: { body: -15, hm: [0, 0.62, 122], ho: [0.03, 0.03, 0] }, y: 0.05 },
            { t: 800, e: "in", a: { body: 24, hm: [0.5, 0, -125], ho: [-0.05, 0, 0] }, x: 0.1 },
            { t: 1050, a: { body: 22, hm: [0.49, 0, -126], ho: [-0.05, 0, 0] }, x: 0.095 },
            { t: 1300, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
          ],
        },
        // 盾击: the shield driven into the foe with the whole body
        "skill:shield_bash": {
          dur: 1000, hit: 560, lunge: true,
          keys: [
            { t: 0, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
            { t: 300, e: "out", a: { body: -10, hm: [0.02, 0.12, 75], ho: [-0.12, 0.03, 0] }, x: -0.06 },
            { t: 480, a: { body: -11, hm: [0.02, 0.12, 76], ho: [-0.13, 0.03, 0] }, x: -0.065 },
            { t: 560, e: "in", a: { body: 22, hm: [0.12, 0.14, 60], ho: [0.32, 0.05, -10] }, x: 0.14 },
            { t: 800, a: { body: 20, hm: [0.12, 0.14, 60], ho: [0.31, 0.05, -10] }, x: 0.13 },
            { t: 1000, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
          ],
        },
        // 重扫: run in, wound far back, one wide flat swing through the whole line
        "skill:sweep": {
          dur: 1200, hit: 700, ring: 700, lunge: true,
          keys: [
            { t: 0, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
            { t: 260, e: "out", a: { body: -16, hm: [-0.18, 0.18, 110], ho: [0.08, 0.02, 0] }, x: -0.03 },
            { t: 580, a: { body: -17, hm: [-0.19, 0.18, 112], ho: [0.08, 0.02, 0] }, x: -0.035 },
            { t: 700, e: "in", a: { body: 16, hm: [0.5, 0.15, -95], ho: [-0.05, 0, 0] }, x: 0.07 },
            { t: 780, e: "out", a: { body: 20, hm: [0.42, 0.12, -115], ho: [-0.06, 0, 0] }, x: 0.08 },
            { t: 980, a: { body: 18, hm: [0.41, 0.12, -116], ho: [-0.06, 0, 0] }, x: 0.075 },
            { t: 1200, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
          ],
        },
        // 重碾: brought down on the foe, then dragged low and ground up through it
        "skill:smack": {
          dur: 1150, hit: 760, hits: [430], lunge: true,
          keys: [
            { t: 0, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
            { t: 220, e: "out", a: { body: -10, hm: [0.05, 0.5, 95], ho: [0.04, 0.02, 0] }, x: -0.02 },
            { t: 430, e: "in", a: { body: 18, hm: [0.45, 0.05, -115], ho: [-0.04, 0, 0] }, x: 0.06 },
            { t: 580, e: "out", a: { body: 8, hm: [0.25, -0.1, -160], ho: [-0.02, -0.02, 0] }, x: 0.06, y: -0.02 },
            { t: 760, e: "in", a: { body: -12, hm: [0.38, 0.45, 15], ho: [0, 0.02, 0] }, x: 0.08, y: 0.04 },
            { t: 950, a: { body: -10, hm: [0.37, 0.44, 16], ho: [0, 0.02, 0] }, x: 0.075, y: 0.03 },
            { t: 1150, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
          ],
        },
        // 碎裂冲击 and any other blow on every foe: run in, a leap, the mace raised, and a slam into the ground
        "skill:all": {
          dur: 1100, hit: 620, ring: 620, lunge: true,
          keys: [
            { t: 0, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
            { t: 250, e: "out", a: { body: -10, hm: [0.05, 0.55, 95], ho: [0.03, 0.05, 0] }, y: 0.3 },
            { t: 500, a: { body: -12, hm: [0.05, 0.57, 98], ho: [0.03, 0.05, 0] }, y: 0.3 },
            { t: 620, e: "in", a: { body: 26, hm: [0.42, -0.05, -125], ho: [-0.04, -0.02, 0] }, x: 0.08 },
            { t: 880, a: { body: 24, hm: [0.41, -0.05, -126], ho: [-0.04, -0.02, 0] }, x: 0.075 },
            { t: 1100, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
          ],
        },
        // any other skill: two whirls with the mace held out, then a slam
        skill: {
          dur: 1250, hit: 760, ring: 760, lunge: true,
          keys: [
            { t: 0, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
            { t: 220, e: "out", a: { body: -10, hm: [0.4, 0.25, -60], ho: [-0.05, 0.05, 0] }, y: -0.02 },
            { t: 300, a: { body: -6, hm: [0.45, 0.25, -60], ho: [-0.05, 0.05, 0] }, y: 0.04 },
            { t: 760, e: "linear", a: { body: -6, hm: [0.45, 0.25, -60], ho: [-0.05, 0.05, 0] }, y: 0.06, r: 720 },
            { t: 820, e: "out", a: { body: 18, hm: [0.45, 0.05, -115], ho: [0, 0, 0] }, x: 0.04, r: 720 },
            { t: 1000, a: { body: 16, hm: [0.44, 0.05, -116], ho: [0, 0, 0] }, x: 0.04, r: 720 },
            { t: 1250, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] }, r: 720 },
          ],
        },
        hurt: {
          dur: 400,
          keys: [
            { t: 0, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
            { t: 70, e: "out", a: { body: -12, hm: [0.02, 0.12, 70], ho: [0.1, 0.08, 10] }, x: -0.05 },
            { t: 230, a: { body: -8, hm: [0.04, 0.12, 66], ho: [0.09, 0.07, 8] }, x: -0.04 },
            { t: 400, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
          ],
        },
        // the mace raised straight up overhead
        cast: {
          dur: 1100,
          keys: [
            { t: 0, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
            { t: 280, e: "out", a: { hm: [0.1, 0.62, 8], ho: [0, 0.02, 0] }, y: 0.03 },
            { t: 800, a: { hm: [0.1, 0.63, 8], ho: [0, 0.02, 0] }, y: 0.03 },
            { t: 1100, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
          ],
        },
        dead: {
          dur: 650,
          keys: [
            { t: 0, a: { hm: [0.1, 0.12, 60], ho: [0.06, -0.05, 0] } },
            { t: 200, a: { body: -25, hm: [0, 0.15, 40], ho: [-0.05, 0.05, 20] } },
            { t: 650, e: "in", a: { body: -84, hm: [-0.1, -0.6, -82], ho: [-0.2, -0.5, -90] } },
          ],
        },
      },
      // ----- bulwark (two hands, smash): the great shield upright in front, in the front hand (ho); it bashes, crushes
      // from above and charges. + leans its top back, - forward.
      "player:bulwark": {
        idle: { dur: 1600, loop: true, keys: [{ t: 0, a: { hm: [0.04, -0.02, 0], ho: [0.02, -0.06, 0] } }, { t: 800, a: { body: 2, hm: [0.04, 0, 0], ho: [0.02, -0.045, 1] }, y: -0.01 }, { t: 1600, a: { hm: [0.04, -0.02, 0], ho: [0.02, -0.06, 0] } }] },
        // 普攻 1: drawn in, then rammed forward
        attack: {
          dur: 600, hit: 220, lunge: true,
          keys: [
            { t: 0, a: { hm: [0.04, -0.02, 0], ho: [0.02, -0.06, 0] } },
            { t: 120, e: "out", a: { body: -6, hm: [0.02, 0, 0], ho: [-0.06, -0.04, 8] }, x: -0.03 },
            { t: 220, e: "in", a: { body: 16, hm: [0.2, 0.02, 0], ho: [0.25, 0, -6] }, x: 0.1 },
            { t: 420, a: { body: 14, hm: [0.2, 0.02, 0], ho: [0.24, 0, -6] }, x: 0.095 },
            { t: 600, a: { hm: [0.04, -0.02, 0], ho: [0.02, -0.06, 0] } },
          ],
        },
        // 普攻 2: lifted overhead and brought down on the foe
        attack2: {
          dur: 720, hit: 300, ring: 300, lunge: true,
          keys: [
            { t: 0, a: { hm: [0.04, -0.02, 0], ho: [0.02, -0.06, 0] } },
            { t: 180, e: "out", a: { body: -10, hm: [0.1, 0.3, 0], ho: [0, 0.45, 30] }, y: 0.05 },
            { t: 300, e: "in", a: { body: 20, hm: [0.2, 0.05, 0], ho: [0.25, -0.05, -40] }, x: 0.07 },
            { t: 520, a: { body: 18, hm: [0.2, 0.05, 0], ho: [0.24, -0.05, -41] }, x: 0.065 },
            { t: 720, a: { hm: [0.04, -0.02, 0], ho: [0.02, -0.06, 0] } },
          ],
        },
        // 普攻 3: a full turn and a bash with the momentum
        attack3: {
          dur: 720, hit: 380, lunge: true,
          keys: [
            { t: 0, a: { hm: [0.04, -0.02, 0], ho: [0.02, -0.06, 0] } },
            { t: 100, e: "out", a: { body: -4, hm: [0.04, 0, 0], ho: [0, -0.04, 0] } },
            { t: 340, e: "linear", a: { body: 0, hm: [0.1, 0, 0], ho: [0.15, 0, 0] }, x: 0.04, r: 360 },
            { t: 380, e: "in", a: { body: 14, hm: [0.15, 0.02, 0], ho: [0.3, 0, -10] }, x: 0.08, r: 360 },
            { t: 560, a: { body: 12, hm: [0.15, 0.02, 0], ho: [0.29, 0, -10] }, x: 0.075, r: 360 },
            { t: 720, a: { hm: [0.04, -0.02, 0], ho: [0.02, -0.06, 0] }, r: 360 },
          ],
        },
        // any other skill: braced behind the shield, then a charge straight through the foe
        skill: {
          dur: 1150, hit: 780, lunge: true, through: true,
          keys: [
            { t: 0, a: { hm: [0.04, -0.02, 0], ho: [0.02, -0.06, 0] } },
            { t: 300, e: "out", a: { body: 10, hm: [0.1, 0, 0], ho: [0.05, 0, -5] }, x: -0.05 },
            { t: 700, a: { body: 11, hm: [0.1, 0, 0], ho: [0.05, 0, -5] }, x: -0.055 },
            { t: 780, e: "in", a: { body: 20, hm: [0.25, 0.02, 0], ho: [0.3, 0.02, -8] }, x: 0.14 },
            { t: 950, a: { body: 18, hm: [0.25, 0.02, 0], ho: [0.29, 0.02, -8] }, x: 0.13 },
            { t: 1150, a: { hm: [0.04, -0.02, 0], ho: [0.02, -0.06, 0] } },
          ],
        },
        // 盾击: drawn in behind the shield, then rammed into the foe with the whole body
        "skill:shield_bash": {
          dur: 1000, hit: 560, lunge: true,
          keys: [
            { t: 0, a: { hm: [0.04, -0.02, 0], ho: [0.02, -0.06, 0] } },
            { t: 280, e: "out", a: { body: -10, hm: [0, 0, 0], ho: [-0.1, -0.04, 10] }, x: -0.06 },
            { t: 480, a: { body: -11, hm: [0, 0, 0], ho: [-0.11, -0.04, 11] }, x: -0.065 },
            { t: 560, e: "in", a: { body: 22, hm: [0.25, 0.02, 0], ho: [0.35, 0.02, -10] }, x: 0.15 },
            { t: 800, a: { body: 20, hm: [0.25, 0.02, 0], ho: [0.34, 0.02, -10] }, x: 0.14 },
            { t: 1000, a: { hm: [0.04, -0.02, 0], ho: [0.02, -0.06, 0] } },
          ],
        },
        // 重锤: the shield hoisted overhead, held, and brought down edge first on the foe's head
        "skill:stunning_blow": {
          dur: 1300, hit: 800, ring: 800, lunge: true,
          keys: [
            { t: 0, a: { hm: [0.04, -0.02, 0], ho: [0.02, -0.06, 0] } },
            { t: 300, e: "out", a: { body: -14, hm: [0.1, 0.4, 0], ho: [-0.02, 0.6, 35] }, y: 0.06 },
            { t: 700, a: { body: -15, hm: [0.1, 0.41, 0], ho: [-0.02, 0.61, 37] }, y: 0.06 },
            { t: 800, e: "in", a: { body: 24, hm: [0.22, 0.05, 0], ho: [0.28, 0, -60] }, x: 0.08 },
            { t: 1050, a: { body: 22, hm: [0.22, 0.05, 0], ho: [0.27, 0, -61] }, x: 0.075 },
            { t: 1300, a: { hm: [0.04, -0.02, 0], ho: [0.02, -0.06, 0] } },
          ],
        },
        // 重扫: run in, the shield hauled back past the hip and swung round flat through the whole line
        "skill:sweep": {
          dur: 1200, hit: 720, ring: 720, lunge: true,
          keys: [
            { t: 0, a: { hm: [0.04, -0.02, 0], ho: [0.02, -0.06, 0] } },
            { t: 280, e: "out", a: { body: -14, hm: [-0.08, 0, 0], ho: [-0.2, 0.02, 45] }, x: -0.04 },
            { t: 600, a: { body: -15, hm: [-0.09, 0, 0], ho: [-0.21, 0.02, 47] }, x: -0.045 },
            { t: 720, e: "in", a: { body: 18, hm: [0.22, 0.02, 0], ho: [0.36, 0.03, -35] }, x: 0.09 },
            { t: 800, e: "out", a: { body: 20, hm: [0.24, 0.02, 0], ho: [0.33, 0.02, -50] }, x: 0.1 },
            { t: 1000, a: { body: 18, hm: [0.24, 0.02, 0], ho: [0.32, 0.02, -51] }, x: 0.095 },
            { t: 1200, a: { hm: [0.04, -0.02, 0], ho: [0.02, -0.06, 0] } },
          ],
        },
        // 碎裂冲击 and any other blow on every foe: run in, a leap and the shield slammed into the ground
        "skill:all": {
          dur: 1100, hit: 650, ring: 650, lunge: true,
          keys: [
            { t: 0, a: { hm: [0.04, -0.02, 0], ho: [0.02, -0.06, 0] } },
            { t: 260, e: "out", a: { body: -10, hm: [0.1, 0.35, 0], ho: [0, 0.5, 20] }, y: 0.3 },
            { t: 520, a: { body: -12, hm: [0.1, 0.36, 0], ho: [0, 0.52, 22] }, y: 0.3 },
            { t: 650, e: "in", a: { body: 18, hm: [0.2, 0, 0], ho: [0.25, -0.1, -20] }, x: 0.06 },
            { t: 900, a: { body: 16, hm: [0.2, 0, 0], ho: [0.24, -0.1, -20] }, x: 0.055 },
            { t: 1100, a: { hm: [0.04, -0.02, 0], ho: [0.02, -0.06, 0] } },
          ],
        },
        // braced: the shield takes it, barely a step back
        hurt: {
          dur: 400,
          keys: [
            { t: 0, a: { hm: [0.04, -0.02, 0], ho: [0.02, -0.06, 0] } },
            { t: 70, e: "out", a: { body: -6, hm: [0.04, 0, 0], ho: [0.06, 0.04, 4] }, x: -0.03 },
            { t: 230, a: { body: -4, hm: [0.04, 0, 0], ho: [0.05, 0.03, 3] }, x: -0.025 },
            { t: 400, a: { hm: [0.04, -0.02, 0], ho: [0.02, -0.06, 0] } },
          ],
        },
        // the shield raised overhead
        cast: {
          dur: 1100,
          keys: [
            { t: 0, a: { hm: [0.04, -0.02, 0], ho: [0.02, -0.06, 0] } },
            { t: 280, e: "out", a: { hm: [0.1, 0.4, 0], ho: [-0.05, 0.55, 0] }, y: 0.03 },
            { t: 800, a: { hm: [0.1, 0.41, 0], ho: [-0.05, 0.56, 0] }, y: 0.03 },
            { t: 1100, a: { hm: [0.04, -0.02, 0], ho: [0.02, -0.06, 0] } },
          ],
        },
        dead: {
          dur: 650,
          keys: [
            { t: 0, a: { hm: [0.04, -0.02, 0], ho: [0.02, -0.06, 0] } },
            { t: 200, a: { body: -25, hm: [-0.05, 0.1, 10], ho: [-0.05, 0.02, -20] } },
            { t: 650, e: "in", a: { body: -84, hm: [-0.25, -0.25, 30], ho: [-0.1, -0.66, -90] } },
          ],
        },
      },
      // ----- crossbow (Lost Castle's gun_* timing: a snap shot and a kick of recoil): level in the back hand (hm), the
      // front hand under its bolt when free; the bolt flies from its tip. + raises the bolt, - drops it.
      "player:crossbow": {
        idle: { dur: 1400, loop: true, keys: [{ t: 0, a: { hm: [0.36, -0.12, -12], ho: [0.06, -0.11, 0] } }, { t: 700, a: { body: 2, hm: [0.36, -0.105, -10], ho: [0.06, -0.095, 2] }, y: -0.01 }, { t: 1400, a: { hm: [0.36, -0.12, -12], ho: [0.06, -0.11, 0] } }] },
        // 普攻 1: up to the shoulder, aimed, a shot that kicks
        attack: {
          dur: 620, shot: 260, hit: 420,
          keys: [
            { t: 0, a: { hm: [0.36, -0.12, -12], ho: [0.06, -0.11, 0] } },
            { t: 140, e: "out", a: { body: -2, hm: [0.42, 0.06, 0], ho: [0.06, -0.01, 0] } },
            { t: 255, a: { body: -2, hm: [0.42, 0.06, 0], ho: [0.06, -0.01, 0] } },
            { t: 275, e: "out", a: { body: -6, hm: [0.36, 0.08, 14], ho: [0.04, 0, 0] }, x: -0.02 },
            { t: 420, a: { body: -4, hm: [0.38, 0.07, 8], ho: [0.05, -0.005, 0] }, x: -0.015 },
            { t: 620, a: { hm: [0.36, -0.12, -12], ho: [0.06, -0.11, 0] } },
          ],
        },
        // 普攻 2: a snap shot from the hip
        attack2: {
          dur: 480, shot: 150, hit: 300,
          keys: [
            { t: 0, a: { hm: [0.36, -0.12, -12], ho: [0.06, -0.11, 0] } },
            { t: 100, e: "out", a: { body: 2, hm: [0.4, -0.08, -2], ho: [0.06, -0.09, 0] } },
            { t: 165, e: "out", a: { body: -4, hm: [0.34, -0.06, 12], ho: [0.04, -0.08, 0] }, x: -0.015 },
            { t: 300, a: { body: -3, hm: [0.35, -0.07, 8], ho: [0.05, -0.085, 0] }, x: -0.01 },
            { t: 480, a: { hm: [0.36, -0.12, -12], ho: [0.06, -0.11, 0] } },
          ],
        },
        // 普攻 3: a step back to aim, then a shot that rocks the body
        attack3: {
          dur: 800, shot: 400, hit: 560,
          keys: [
            { t: 0, a: { hm: [0.36, -0.12, -12], ho: [0.06, -0.11, 0] } },
            { t: 180, e: "out", a: { body: -2, hm: [0.44, 0.04, 0], ho: [0.06, -0.02, 0] }, x: -0.08 },
            { t: 395, a: { body: -3, hm: [0.44, 0.045, 0], ho: [0.06, -0.02, 0] }, x: -0.08 },
            { t: 415, e: "out", a: { body: -8, hm: [0.38, 0.07, 16], ho: [0.04, -0.01, 0] }, x: -0.1 },
            { t: 560, a: { body: -6, hm: [0.39, 0.06, 10], ho: [0.05, -0.015, 0] }, x: -0.09 },
            { t: 800, a: { hm: [0.36, -0.12, -12], ho: [0.06, -0.11, 0] } },
          ],
        },
        // any other ranged skill: a long, steady aim while it charges, a heavy recoil that throws the body back
        skill: {
          dur: 1200, shot: 860, hit: 1040,
          keys: [
            { t: 0, a: { hm: [0.36, -0.12, -12], ho: [0.06, -0.11, 0] } },
            { t: 240, e: "out", a: { body: -3, hm: [0.44, 0.06, 0], ho: [0.06, -0.01, 0] } },
            { t: 820, a: { body: -4, hm: [0.445, 0.06, 0], ho: [0.06, -0.01, 0] } },
            { t: 860, e: "out", a: { body: -14, hm: [0.28, 0.14, 28], ho: [0.02, 0.02, 0] }, x: -0.08 },
            { t: 1040, a: { body: -11, hm: [0.3, 0.12, 22], ho: [0.03, 0.01, 0] }, x: -0.07 },
            { t: 1200, a: { hm: [0.36, -0.12, -12], ho: [0.06, -0.11, 0] } },
          ],
        },
        // 快速射击: two snap shots from the shoulder, one kick each
        "skill:quick_shot": {
          dur: 700, shots: [150], shot: 320, hit: 480,
          keys: [
            { t: 0, a: { hm: [0.36, -0.12, -12], ho: [0.06, -0.11, 0] } },
            { t: 100, e: "out", a: { body: -2, hm: [0.42, 0.05, 0], ho: [0.06, -0.02, 0] } },
            { t: 150, e: "out", a: { body: -5, hm: [0.36, 0.08, 13], ho: [0.04, -0.01, 0] }, x: -0.01 },
            { t: 250, a: { body: -2, hm: [0.42, 0.05, 0], ho: [0.06, -0.02, 0] }, x: -0.01 },
            { t: 320, e: "out", a: { body: -6, hm: [0.35, 0.08, 15], ho: [0.04, -0.01, 0] }, x: -0.025 },
            { t: 480, a: { body: -4, hm: [0.37, 0.07, 9], ho: [0.05, -0.015, 0] }, x: -0.02 },
            { t: 700, a: { hm: [0.36, -0.12, -12], ho: [0.06, -0.11, 0] } },
          ],
        },
        // 稳定射击: leaned in over the stock, the front hand braced under it, a long still aim and a clean shot
        "skill:steady_shot": {
          dur: 1250, shot: 900, hit: 1060,
          keys: [
            { t: 0, a: { hm: [0.36, -0.12, -12], ho: [0.06, -0.11, 0] } },
            { t: 260, e: "out", a: { body: 6, hm: [0.46, 0.03, 0], ho: [0.14, -0.02, 0] }, x: 0.02 },
            { t: 890, a: { body: 6, hm: [0.462, 0.03, 0], ho: [0.14, -0.02, 0] }, x: 0.02 },
            { t: 910, e: "out", a: { body: 2, hm: [0.42, 0.05, 8], ho: [0.12, -0.01, 0] }, x: 0.01 },
            { t: 1060, a: { body: 2, hm: [0.43, 0.045, 5], ho: [0.12, -0.015, 0] }, x: 0.01 },
            { t: 1250, a: { hm: [0.36, -0.12, -12], ho: [0.06, -0.11, 0] } },
          ],
        },
        // 贯穿射击: braced back on the heels, a bolt that goes through the foe and on off the stage, a kick that staggers
        "skill:penetrating_shot": {
          dur: 1250, shot: 860, hit: 960, pierce: true,
          keys: [
            { t: 0, a: { hm: [0.36, -0.12, -12], ho: [0.06, -0.11, 0] } },
            { t: 260, e: "out", a: { body: -8, hm: [0.4, 0.06, 0], ho: [0.06, -0.01, 0] }, x: -0.03 },
            { t: 850, a: { body: -9, hm: [0.4, 0.06, 0], ho: [0.06, -0.01, 0] }, x: -0.035 },
            { t: 870, e: "out", a: { body: -22, hm: [0.2, 0.18, 40], ho: [0, 0.04, 0] }, x: -0.13 },
            { t: 1060, a: { body: -16, hm: [0.24, 0.14, 30], ho: [0.02, 0.02, 0] }, x: -0.11 },
            { t: 1250, a: { hm: [0.36, -0.12, -12], ho: [0.06, -0.11, 0] } },
          ],
        },
        // 箭雨: aimed high, a volley up out of sight that rains down on every foe
        "skill:rain_of_arrows": {
          dur: 1300, shot: 640, hit: 1150, rain: true,
          keys: [
            { t: 0, a: { hm: [0.36, -0.12, -12], ho: [0.06, -0.11, 0] } },
            { t: 260, e: "out", a: { body: -8, hm: [0.36, 0.18, 45], ho: [0.04, 0.04, 0] } },
            { t: 635, a: { body: -9, hm: [0.36, 0.18, 46], ho: [0.04, 0.04, 0] } },
            { t: 655, e: "out", a: { body: -12, hm: [0.31, 0.22, 60], ho: [0.02, 0.06, 0] }, x: -0.03 },
            { t: 1150, a: { body: -10, hm: [0.32, 0.21, 55], ho: [0.03, 0.05, 0] }, x: -0.025 },
            { t: 1300, a: { hm: [0.36, -0.12, -12], ho: [0.06, -0.11, 0] } },
          ],
        },
        hurt: {
          dur: 400,
          keys: [
            { t: 0, a: { hm: [0.36, -0.12, -12], ho: [0.06, -0.11, 0] } },
            { t: 70, e: "out", a: { body: -12, hm: [0.26, -0.07, 25], ho: [0.08, 0, 8] }, x: -0.05 },
            { t: 230, a: { body: -8, hm: [0.27, -0.08, 20], ho: [0.07, -0.01, 6] }, x: -0.04 },
            { t: 400, a: { hm: [0.36, -0.12, -12], ho: [0.06, -0.11, 0] } },
          ],
        },
        // the crossbow raised upright overhead
        cast: {
          dur: 1100,
          keys: [
            { t: 0, a: { hm: [0.36, -0.12, -12], ho: [0.06, -0.11, 0] } },
            { t: 280, e: "out", a: { hm: [0.25, 0.45, 90], ho: [0.02, 0.04, 0] }, y: 0.03 },
            { t: 800, a: { hm: [0.25, 0.46, 90], ho: [0.02, 0.04, 0] }, y: 0.03 },
            { t: 1100, a: { hm: [0.36, -0.12, -12], ho: [0.06, -0.11, 0] } },
          ],
        },
        // falls on the back, the crossbow left lying on the ground
        dead: {
          dur: 650,
          keys: [
            { t: 0, a: { hm: [0.36, -0.12, -12], ho: [0.06, -0.05, 0] } },
            { t: 200, a: { body: -25, hm: [0.1, 0.08, 10], ho: [-0.05, 0.05, 20] } },
            { t: 650, e: "in", a: { body: -84, hm: [-0.05, -0.62, 0], ho: [-0.2, -0.5, -90] } },
          ],
        },
      },
      // ----- staff (after Lost Castle's staff_*): upright in the back hand (hm) like a walking staff, a book / relic in
      // the front hand; magic flies from the staff's head as an orb. + leans the staff back, - points it forward.
      "player:staff": {
        idle: { dur: 1600, loop: true, keys: [{ t: 0, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } }, { t: 800, a: { body: 2, hm: [0.02, 0.02, 3], ho: [0.06, -0.03, 2] }, y: -0.01 }, { t: 1600, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } }] },
        // 普攻 1: the staff drawn back, then thrust out level at the foe
        attack: {
          dur: 640, shot: 260, hit: 520, missile: "orb",
          keys: [
            { t: 0, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } },
            { t: 120, e: "out", a: { body: -6, hm: [-0.02, 0.12, 40], ho: [0.04, 0, 0] } },
            { t: 240, e: "in", a: { body: 10, hm: [0.49, 0.14, -70], ho: [-0.05, 0.03, 0] }, x: 0.03 },
            { t: 440, a: { body: 9, hm: [0.48, 0.14, -71], ho: [-0.05, 0.03, 0] }, x: 0.03 },
            { t: 640, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } },
          ],
        },
        // 普攻 2: swung from behind over the head, its head brought down toward the foe
        attack2: {
          dur: 720, shot: 330, hit: 560, missile: "orb",
          keys: [
            { t: 0, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } },
            { t: 150, e: "out", a: { body: -8, hm: [0.1, 0.3, 80], ho: [0.03, 0.02, 0] } },
            { t: 310, e: "in", a: { body: 14, hm: [0.4, 0.2, -100], ho: [-0.04, 0, 0] }, x: 0.04 },
            { t: 520, a: { body: 12, hm: [0.39, 0.19, -101], ho: [-0.04, 0, 0] }, x: 0.04 },
            { t: 720, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } },
          ],
        },
        // 普攻 3: a twirl in the hand, then pointed
        attack3: {
          dur: 820, shot: 480, hit: 700, missile: "orb",
          keys: [
            { t: 0, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } },
            { t: 100, e: "out", a: { hm: [0.2, 0.15, 0], ho: [0.04, 0, 0] } },
            { t: 380, e: "linear", a: { body: -4, hm: [0.25, 0.18, -360], ho: [0.04, 0.02, 0] } },
            { t: 460, e: "out", a: { body: 8, hm: [0.45, 0.14, -430], ho: [-0.03, 0.02, 0] }, x: 0.02 },
            { t: 680, a: { body: 7, hm: [0.44, 0.14, -431], ho: [-0.03, 0.02, 0] }, x: 0.02 },
            { t: 820, a: { hm: [0.02, 0, -360], ho: [0.06, -0.05, 0] } },
          ],
        },
        // any other single-target spell: the staff raised overhead and the book lifted while it charges, then thrust
        skill: {
          dur: 1200, shot: 820, hit: 1050, missile: "orb",
          keys: [
            { t: 0, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } },
            { t: 260, e: "out", a: { body: -5, hm: [0.19, 0.44, 0], ho: [0.05, 0.15, 0] }, y: 0.03 },
            { t: 740, a: { body: -6, hm: [0.19, 0.46, 4], ho: [0.05, 0.16, 0] }, y: 0.03 },
            { t: 800, e: "in", a: { body: 12, hm: [0.5, 0.2, -75], ho: [0, 0.05, 0] }, x: 0.04 },
            { t: 1000, a: { body: 11, hm: [0.49, 0.2, -76], ho: [0, 0.05, 0] }, x: 0.04 },
            { t: 1200, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } },
          ],
        },
        // 冰枪术: the staff drawn back level like a spear and thrust, a shard of ice flying off its head
        "skill:ice_spear": {
          dur: 1000, shot: 560, hit: 760, missile: "shard",
          keys: [
            { t: 0, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } },
            { t: 240, e: "out", a: { body: -8, hm: [-0.12, 0.05, -76], ho: [0.06, 0.06, 0] }, x: -0.03 },
            { t: 480, a: { body: -9, hm: [-0.13, 0.05, -76], ho: [0.06, 0.06, 0] }, x: -0.035 },
            { t: 560, e: "in", a: { body: 12, hm: [0.5, 0.06, -78], ho: [-0.04, 0.03, 0] }, x: 0.04 },
            { t: 780, a: { body: 11, hm: [0.49, 0.06, -79], ho: [-0.04, 0.03, 0] }, x: 0.04 },
            { t: 1000, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } },
          ],
        },
        // 缠绕: the staff lifted and its butt driven into the ground; the roots come up under the foe
        "skill:entangle": {
          dur: 1100, hit: 700, ring: 640,
          keys: [
            { t: 0, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } },
            { t: 250, e: "out", a: { body: -6, hm: [0.5, 0.33, -6], ho: [0.05, 0.12, 0] }, y: 0.04 },
            { t: 560, a: { body: -7, hm: [0.5, 0.34, -5], ho: [0.05, 0.13, 0] }, y: 0.04 },
            { t: 640, e: "in", a: { body: 10, hm: [0.46, -0.02, -10], ho: [0.02, 0, 0] } },
            { t: 880, a: { body: 9, hm: [0.46, -0.02, -10], ho: [0.02, 0, 0] } },
            { t: 1100, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } },
          ],
        },
        // 生命吸取: the staff pointed at the foe and held, then drawn back as its life streams over (drain)
        "skill:life_drain": {
          dur: 1400, hit: 600, drain: true,
          keys: [
            { t: 0, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } },
            { t: 240, e: "out", a: { body: 8, hm: [0.45, 0.2, -70], ho: [0.06, 0.06, 0] }, x: 0.02 },
            { t: 600, a: { body: 8, hm: [0.46, 0.2, -71], ho: [0.06, 0.06, 0] }, x: 0.02 },
            { t: 1100, e: "inout", a: { body: -8, hm: [0.44, 0.16, -55], ho: [0.04, 0.1, 0] }, x: -0.02 },
            { t: 1400, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } },
          ],
        },
        // 火焰风暴: the staff whirled overhead, then its head swung forward over the foes
        "skill:firestorm": {
          dur: 1400, hit: 950,
          keys: [
            { t: 0, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } },
            { t: 220, e: "out", a: { body: -5, hm: [0.5, 0.42, 0], ho: [0.05, 0.15, 0] }, y: 0.03 },
            { t: 760, e: "linear", a: { body: -6, hm: [0.5, 0.44, -720], ho: [0.05, 0.16, 0] }, y: 0.04 },
            { t: 880, e: "out", a: { body: 12, hm: [0.52, 0.3, -770], ho: [0, 0.06, 0] }, x: 0.03 },
            { t: 1150, a: { body: 11, hm: [0.51, 0.3, -771], ho: [0, 0.06, 0] }, x: 0.03 },
            { t: 1400, a: { hm: [0.02, 0, -720], ho: [0.06, -0.05, 0] } },
          ],
        },
        // 剧毒粉尘 / 自然菌幕: the staff tipped back, then swept out low across the foes, scattering the spores
        "skill:toxic_pollen": {
          dur: 1200, hit: 850,
          keys: [
            { t: 0, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } },
            { t: 260, e: "out", a: { body: -8, hm: [0.08, -0.04, 100], ho: [0.05, 0.1, 0] } },
            { t: 620, a: { body: -9, hm: [0.07, -0.04, 102], ho: [0.05, 0.1, 0] } },
            { t: 850, e: "inout", a: { body: 12, hm: [0.45, 0.12, -100], ho: [-0.02, 0.04, 0] }, x: 0.03 },
            { t: 1040, a: { body: 11, hm: [0.44, 0.12, -101], ho: [-0.02, 0.04, 0] }, x: 0.03 },
            { t: 1200, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } },
          ],
        },
        // a spell on every foe: the staff raised high, then its butt slammed on the ground
        "skill:all": {
          dur: 1300, hit: 900, ring: 900,
          keys: [
            { t: 0, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } },
            { t: 280, e: "out", a: { body: -6, hm: [0.2, 0.45, 0], ho: [0.05, 0.18, 0] }, y: 0.05 },
            { t: 820, a: { body: -7, hm: [0.2, 0.47, 2], ho: [0.05, 0.19, 0] }, y: 0.06 },
            { t: 900, e: "in", a: { body: 10, hm: [0.3, 0.05, -15], ho: [0.02, 0, 0] } },
            { t: 1100, a: { body: 9, hm: [0.3, 0.05, -15], ho: [0.02, 0, 0] } },
            { t: 1300, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } },
          ],
        },
        hurt: {
          dur: 400,
          keys: [
            { t: 0, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } },
            { t: 70, e: "out", a: { body: -12, hm: [-0.05, 0.04, 25], ho: [0.06, 0.06, 10] }, x: -0.05 },
            { t: 230, a: { body: -8, hm: [-0.04, 0.04, 20], ho: [0.06, 0.05, 8] }, x: -0.04 },
            { t: 400, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } },
          ],
        },
        // the staff held straight up overhead
        cast: {
          dur: 1100,
          keys: [
            { t: 0, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } },
            { t: 280, e: "out", a: { hm: [0.12, 0.5, 14], ho: [0.02, 0.12, 0] }, y: 0.03 },
            { t: 800, a: { hm: [0.12, 0.51, 14], ho: [0.02, 0.12, 0] }, y: 0.03 },
            { t: 1100, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } },
          ],
        },
        dead: {
          dur: 650,
          keys: [
            { t: 0, a: { hm: [0.02, 0, 0], ho: [0.06, -0.05, 0] } },
            { t: 200, a: { body: -25, hm: [-0.05, 0.1, 30], ho: [-0.05, 0.05, 20] } },
            { t: 650, e: "in", a: { body: -84, hm: [0.14, -0.6, 104], ho: [-0.2, -0.5, -90] } },
          ],
        },
      },
      // ----- spear (after Lost Castle's spear_*): held low and level in the back hand (hm), the front hand on the shaft
      // when it is free, else holding the off-hand (a buckler up front). + raises the point, - drops it.
      "player:spear": {
        idle: { dur: 1400, loop: true, keys: [{ t: 0, a: { hm: [0.06, -0.08, -4], ho: [0.1, 0.1, 0] } }, { t: 700, a: { body: 2, hm: [0.06, -0.065, -2], ho: [0.1, 0.115, 2] }, y: -0.01 }, { t: 1400, a: { hm: [0.06, -0.08, -4], ho: [0.1, 0.1, 0] } }] },
        // 普攻 1: a short draw back and a straight thrust
        attack: {
          dur: 460, hit: 170, lunge: true,
          keys: [
            { t: 0, a: { hm: [0.06, -0.08, -4], ho: [0.1, 0.1, 0] } },
            { t: 90, e: "out", a: { body: -6, hm: [-0.06, -0.05, -2], ho: [0.08, 0.13, 0] }, x: -0.03 },
            { t: 170, e: "in", a: { body: 12, hm: [0.42, -0.03, -4], ho: [0, 0.15, 0] }, x: 0.06 },
            { t: 330, a: { body: 11, hm: [0.41, -0.03, -4], ho: [0, 0.15, 0] }, x: 0.055 },
            { t: 460, a: { hm: [0.06, -0.08, -4], ho: [0.1, 0.1, 0] } },
          ],
        },
        // 普攻 2: two quick thrusts
        attack2: {
          dur: 640, hit: 380, hits: [190], lunge: true,
          keys: [
            { t: 0, a: { hm: [0.06, -0.08, -4], ho: [0.1, 0.1, 0] } },
            { t: 100, e: "out", a: { body: -4, hm: [-0.04, -0.02, 0], ho: [0.08, 0.13, 0] }, x: -0.02 },
            { t: 190, e: "in", a: { body: 10, hm: [0.4, 0, -2], ho: [0.01, 0.15, 0] }, x: 0.05 },
            { t: 280, a: { body: 4, hm: [0.05, -0.03, -2], ho: [0.04, 0.14, 0] }, x: 0.05 },
            { t: 380, e: "in", a: { body: 14, hm: [0.48, -0.05, -8], ho: [-0.01, 0.15, 0] }, x: 0.08 },
            { t: 520, a: { body: 13, hm: [0.47, -0.05, -8], ho: [-0.01, 0.15, 0] }, x: 0.075 },
            { t: 640, a: { hm: [0.06, -0.08, -4], ho: [0.1, 0.1, 0] } },
          ],
        },
        // 普攻 3: raised high and driven down at the foe
        attack3: {
          dur: 620, hit: 260, lunge: true,
          keys: [
            { t: 0, a: { hm: [0.06, -0.08, -4], ho: [0.1, 0.1, 0] } },
            { t: 130, e: "out", a: { body: -8, hm: [0, 0.34, 40], ho: [0.08, 0.19, 0] }, y: 0.04 },
            { t: 260, e: "in", a: { body: 18, hm: [0.35, 0.1, -40], ho: [0, 0.15, 0] }, x: 0.07 },
            { t: 440, a: { body: 16, hm: [0.34, 0.1, -41], ho: [0, 0.15, 0] }, x: 0.065 },
            { t: 620, a: { hm: [0.06, -0.08, -4], ho: [0.1, 0.1, 0] } },
          ],
        },
        // 普攻 4: the point dropped low, then swept up through the foe
        attack4: {
          dur: 600, hit: 240, lunge: true,
          keys: [
            { t: 0, a: { hm: [0.06, -0.08, -4], ho: [0.1, 0.1, 0] } },
            { t: 120, e: "out", a: { body: 6, hm: [0.1, -0.2, -50], ho: [0.08, 0.11, 0] }, y: -0.03 },
            { t: 240, e: "in", a: { body: -10, hm: [0.3, 0.22, 70], ho: [0.02, 0.18, 0] }, x: 0.05 },
            { t: 420, a: { body: -9, hm: [0.29, 0.21, 71], ho: [0.02, 0.18, 0] }, x: 0.045 },
            { t: 600, a: { hm: [0.06, -0.08, -4], ho: [0.1, 0.1, 0] } },
          ],
        },
        // 破甲之刺: three thrusts, the last one the hardest
        "skill:puncture": {
          dur: 1000, hit: 640, hits: [340, 480], lunge: true, color: 0xffb03b,
          keys: [
            { t: 0, a: { hm: [0.06, -0.08, -4], ho: [0.1, 0.1, 0] } },
            { t: 240, e: "out", a: { body: -8, hm: [-0.1, -0.03, 0], ho: [0.07, 0.13, 0] }, x: -0.04 },
            { t: 340, e: "in", a: { body: 12, hm: [0.45, 0.02, 2], ho: [0, 0.15, 0] }, x: 0.06 },
            { t: 410, a: { body: 6, hm: [0.1, -0.02, 0], ho: [0.04, 0.15, 0] }, x: 0.06 },
            { t: 480, e: "in", a: { body: 12, hm: [0.46, -0.06, -8], ho: [0, 0.15, 0] }, x: 0.07 },
            { t: 560, a: { body: 4, hm: [0.05, -0.03, -2], ho: [0.04, 0.15, 0] }, x: 0.07 },
            { t: 640, e: "in", a: { body: 18, hm: [0.58, -0.02, -4], ho: [-0.02, 0.15, 0] }, x: 0.1 },
            { t: 840, a: { body: 16, hm: [0.57, -0.02, -4], ho: [-0.02, 0.15, 0] }, x: 0.095 },
            { t: 1000, a: { hm: [0.06, -0.08, -4], ho: [0.1, 0.1, 0] } },
          ],
        },
        // 破胆之刺: a quick jab that makes the foe flinch, a half step back, then the real thrust
        "skill:poke": {
          dur: 820, hit: 470, hits: [250], lunge: true, color: 0xffe08a,
          keys: [
            { t: 0, a: { hm: [0.06, -0.08, -4], ho: [0.1, 0.1, 0] } },
            { t: 120, e: "out", a: { body: -6, hm: [-0.05, -0.05, -2], ho: [0.08, 0.13, 0] }, x: -0.02 },
            { t: 250, e: "in", a: { body: 8, hm: [0.3, -0.04, -4], ho: [0.03, 0.14, 0] }, x: 0.03 },
            { t: 340, e: "out", a: { body: -8, hm: [-0.1, -0.04, 2], ho: [0.08, 0.13, 0] }, x: -0.03 },
            { t: 470, e: "in", a: { body: 16, hm: [0.55, -0.02, -2], ho: [-0.02, 0.15, 0] }, x: 0.1 },
            { t: 650, a: { body: 14, hm: [0.54, -0.02, -2], ho: [-0.02, 0.15, 0] }, x: 0.095 },
            { t: 820, a: { hm: [0.06, -0.08, -4], ho: [0.1, 0.1, 0] } },
          ],
        },
        // 透骨之刺: a crouch, a leap with the spear raised, and the point driven down into the foe
        "skill:impale": {
          dur: 1150, hit: 680, ring: 680, lunge: true, color: 0xff5050,
          keys: [
            { t: 0, a: { hm: [0.06, -0.08, -4], ho: [0.1, 0.1, 0] } },
            { t: 200, e: "out", a: { body: -8, hm: [-0.05, -0.1, 0], ho: [0.08, 0.1, 0] }, y: -0.04 },
            { t: 420, e: "out", a: { body: -12, hm: [0, 0.45, 60], ho: [0.06, 0.25, 0] }, y: 0.35 },
            { t: 560, a: { body: -14, hm: [-0.02, 0.5, 65], ho: [0.05, 0.27, 0] }, y: 0.4 },
            { t: 680, e: "in", a: { body: 24, hm: [0.4, 0.05, -60], ho: [0, 0.12, 0] }, x: 0.08 },
            { t: 920, a: { body: 22, hm: [0.39, 0.04, -61], ho: [0, 0.12, 0] }, x: 0.075 },
            { t: 1150, a: { hm: [0.06, -0.08, -4], ho: [0.1, 0.1, 0] } },
          ],
        },
        // 贯心之刺 and any other stab skill: crouched and coiled back, then a charge that runs the spear through the foe
        skill: {
          dur: 1100, hit: 700, lunge: true, through: true,
          keys: [
            { t: 0, a: { hm: [0.06, -0.08, -4], ho: [0.1, 0.1, 0] } },
            { t: 260, e: "out", a: { body: -12, hm: [-0.15, -0.03, 0], ho: [0.06, 0.12, 0] }, x: -0.06, y: -0.03 },
            { t: 620, a: { body: -13, hm: [-0.16, -0.03, 0], ho: [0.06, 0.12, 0] }, x: -0.065, y: -0.03 },
            { t: 700, e: "in", a: { body: 18, hm: [0.55, -0.03, -4], ho: [-0.02, 0.15, 0] }, x: 0.12 },
            { t: 900, a: { body: 16, hm: [0.54, -0.03, -4], ho: [-0.02, 0.15, 0] }, x: 0.11 },
            { t: 1100, a: { hm: [0.06, -0.08, -4], ho: [0.1, 0.1, 0] } },
          ],
        },
        // the off hand (the buckler) thrust up against the blow
        hurt: {
          dur: 400,
          keys: [
            { t: 0, a: { hm: [0.06, -0.08, -4], ho: [0.1, 0.1, 0] } },
            { t: 70, e: "out", a: { body: -12, hm: [-0.06, -0.04, 20], ho: [0.14, 0.25, 10] }, x: -0.05 },
            { t: 230, a: { body: -8, hm: [-0.05, -0.04, 16], ho: [0.13, 0.24, 8] }, x: -0.04 },
            { t: 400, a: { hm: [0.06, -0.08, -4], ho: [0.1, 0.1, 0] } },
          ],
        },
        // the spear raised straight up overhead
        cast: {
          dur: 1100,
          keys: [
            { t: 0, a: { hm: [0.06, -0.08, -4], ho: [0.1, 0.1, 0] } },
            { t: 280, e: "out", a: { hm: [0.12, 0.45, 84], ho: [0, 0.08, 0] }, y: 0.03 },
            { t: 800, a: { hm: [0.12, 0.46, 84], ho: [0, 0.08, 0] }, y: 0.03 },
            { t: 1100, a: { hm: [0.06, 0, -4], ho: [0.06, 0, 0] } },
          ],
        },
        dead: {
          dur: 650,
          keys: [
            { t: 0, a: { hm: [0.06, 0, -4], ho: [0.06, -0.05, 0] } },
            { t: 200, a: { body: -25, hm: [-0.05, 0.08, 10], ho: [-0.05, 0.05, 20] } },
            { t: 650, e: "in", a: { body: -84, hm: [-0.2, -0.6, -6], ho: [-0.2, -0.5, -90] } },
          ],
        },
      },
    }
    ACTIONS["player:staff"]["skill:natures_veil"] = ACTIONS["player:staff"]["skill:toxic_pollen"]
    // ----- monster templates (rig.json tmpl, cut by tools/rig-monster.py): one set per body shape, the attacks by the
    // monster's style (MONSTERS); a monster's own ACTIONS[id] entries win. Parts: torso (pivot at the hips), arm_m (the
    // arm with the weapon), arm_o, weapon / weapon_o (in their fists), leg_f, leg_b (on the torso).
    // Arms and weapons are given as DIRECTIONS, the same for every monster: 0 = straight down, 90 = at the foe,
    // 180 = straight up, -90 = behind; arm_m / arm_o where the arm points, weapon where the weapon in arm_m points
    // ("rest": the way it is drawn)
    // (monsterActions turns them into turns from the monster's own rest). rel: the arms' values are turns from rest
    // (idle, a flinch, a fall). Legs: their own swing, kept on the ground whatever the torso does (fall: they go with it).
    // biped: a short goblin-like body on two feet, after Lost Castle's goblins: a sharp crouch back, a fast lunge with
    // the whole body behind it, a long hold.
    const MT = {
      biped: {
        idle: { rel: true, dur: 1600, loop: true, keys: [{ t: 0, a: { arm_m: 2, arm_o: -2 } }, { t: 800, a: { torso: -2, arm_m: -3, arm_o: 3 }, y: -0.012 }, { t: 1600, a: { arm_m: 2, arm_o: -2 } }] },
        hurt: { rel: true, dur: 480, keys: [{ t: 0, a: {} }, { t: 80, e: "out", a: { torso: -16, arm_m: -25, arm_o: -30, leg_f: 8 }, x: -0.05 }, { t: 230, a: { torso: -11, arm_m: -10, arm_o: -15, leg_f: 5 }, x: -0.045 }, { t: 480, a: {} }] },
        // a buff or a heal: the weapon thrust up overhead, a little hop
        cast: { dur: 1000, keys: [{ t: 0, a: {} }, { t: 160, e: "out", a: { torso: 6, leg_f: 5, leg_b: -5 }, y: -0.02 }, { t: 380, e: "out", a: { torso: -8, arm_m: 165, weapon: 178, arm_o: 150, leg_f: 12, leg_b: -8 }, y: 0.08 }, { t: 750, a: { torso: -8, arm_m: 168, weapon: 180, arm_o: 155 }, y: 0.02 }, { t: 1000, a: {} }] },
        // knocked flat on its back, the feet kicking up toward the foe
        dead: { rel: true, fall: true, dur: 800, keys: [{ t: 0, a: {} }, { t: 140, e: "out", a: { torso: -20, arm_m: -30, arm_o: -40, leg_f: 10 }, x: -0.05, y: 0.06 }, { t: 800, e: "in", a: { torso: -86, arm_m: -70, arm_o: -50, leg_f: 25, leg_b: 10 }, x: -0.12 }] },
      },
      // robed: a long robe to the ground, no feet to step with (the sorcerers): it sways from the hem, the attacks are
      // the biped's (a caster raises its staff, book or hand high and thrusts it at the foe)
      robed: {
        idle: { rel: true, dur: 2400, loop: true, keys: [{ t: 0, a: { torso: 1.5, arm_m: 2, arm_o: -2 } }, { t: 1200, a: { torso: -1.5, arm_m: -3, arm_o: 3 }, y: -0.008 }, { t: 2400, a: { torso: 1.5, arm_m: 2, arm_o: -2 } }] },
        hurt: { rel: true, dur: 520, keys: [{ t: 0, a: {} }, { t: 90, e: "out", a: { torso: -12, arm_m: -20, arm_o: -25 }, x: -0.04 }, { t: 260, a: { torso: -8, arm_m: -8, arm_o: -12 }, x: -0.035 }, { t: 520, a: {} }] },
        cast: { dur: 1100, keys: [{ t: 0, a: {} }, { t: 200, e: "out", a: { torso: 4 } }, { t: 450, e: "out", a: { torso: -8, arm_m: 165, weapon: 178, arm_o: 150 }, y: 0.05 }, { t: 850, a: { torso: -8, arm_m: 168, weapon: 180, arm_o: 155 }, y: 0.04 }, { t: 1100, a: {} }] },
        dead: { rel: true, fall: true, lift: 0.05, dur: 900, keys: [{ t: 0, a: {} }, { t: 180, e: "out", a: { torso: -15, arm_m: -20, arm_o: -30 }, x: -0.04, y: 0.03 }, { t: 900, e: "in", a: { torso: -86, arm_m: -60, arm_o: -45 }, x: -0.1 }] },
      },
      // quad: a four-legged beast (the bears), after Lost Castle's zombie boar. Parts: torso (turning on its back hips:
      // - rears up), head (+ nods down: a bite), leg_fn / leg_ff (front legs, nearer / farther), leg_bn / leg_bf (back);
      // legs swing forward with +, as their own direction on the ground.
      quad: {
        idle: { rel: true, dur: 2000, loop: true, keys: [{ t: 0, a: { head: 0 } }, { t: 1000, a: { torso: -1.5, head: 3 }, y: -0.006 }, { t: 2000, a: { head: 0 } }] },
        hurt: { rel: true, dur: 500, keys: [{ t: 0, a: {} }, { t: 90, e: "out", a: { torso: -8, head: -18, leg_fn: -10 }, x: -0.04 }, { t: 250, a: { torso: -5, head: -10, leg_fn: -5 }, x: -0.035 }, { t: 500, a: {} }] },
        // a buff (a roar): up on the hind legs a little, the head thrown back
        cast: { dur: 1100, keys: [{ t: 0, a: {} }, { t: 300, e: "out", a: { torso: -18, head: -28, leg_fn: 15, leg_ff: 10 } }, { t: 850, a: { torso: -19, head: -30, leg_fn: 16, leg_ff: 11 } }, { t: 1100, a: {} }] },
        // down on its belly, legs folded out
        dead: { rel: true, fall: true, lift: 0, dur: 800, keys: [{ t: 0, a: {} }, { t: 150, e: "out", a: { torso: -8, head: -20 }, x: -0.03 }, { t: 800, e: "in", a: { torso: 6, head: 30, leg_fn: 75, leg_ff: 65, leg_bn: -70, leg_bf: -60 }, x: -0.06, y: -0.2 }] },
      },
      "quad:stab": {
        // a bite: the head drawn back on a crouch, then a lunge with the jaws snapping down on the foe
        attack: {
          dur: 900, hit: 430, lunge: true,
          keys: [{ t: 0, a: {} }, { t: 300, e: "out", a: { torso: -6, head: -22, leg_fn: -12, leg_bn: 8 }, x: -0.05 }, { t: 360, a: { torso: -7, head: -24, leg_fn: -13 }, x: -0.055 }, { t: 430, e: "in", a: { torso: 10, head: 28, leg_fn: 28, leg_ff: 18, leg_bn: -18, leg_bf: -12 }, x: 0.14 }, { t: 700, a: { torso: 9, head: 26, leg_fn: 26, leg_ff: 16, leg_bn: -16, leg_bf: -10 }, x: 0.135 }, { t: 900, a: {} }],
        },
        // two snaps
        attack2: {
          dur: 1000, hit: 600, hits: [340], lunge: true,
          keys: [{ t: 0, a: {} }, { t: 240, e: "out", a: { torso: -5, head: -20 }, x: -0.03 }, { t: 340, e: "in", a: { torso: 8, head: 25, leg_fn: 20, leg_bn: -10 }, x: 0.09 }, { t: 470, e: "out", a: { torso: 0, head: -18, leg_fn: 5 }, x: 0.07 }, { t: 600, e: "in", a: { torso: 10, head: 30, leg_fn: 25, leg_ff: 15, leg_bn: -15 }, x: 0.13 }, { t: 820, a: { torso: 9, head: 28, leg_fn: 23, leg_ff: 14, leg_bn: -14 }, x: 0.125 }, { t: 1000, a: {} }],
        },
        // a skill: a pounce, all four legs stretched out, landing jaws first
        skill: {
          dur: 1300, hit: 720, lunge: true,
          keys: [{ t: 0, a: {} }, { t: 300, e: "out", a: { torso: 6, head: -10, leg_fn: -20, leg_ff: -15, leg_bn: 20, leg_bf: 15 }, x: -0.04 }, { t: 560, e: "out", a: { torso: -12, head: -15, leg_fn: 55, leg_ff: 45, leg_bn: -50, leg_bf: -40 }, x: 0.08, y: 0.25 }, { t: 720, e: "in", a: { torso: 14, head: 32, leg_fn: 30, leg_ff: 20, leg_bn: -20, leg_bf: -15 }, x: 0.16 }, { t: 1050, a: { torso: 12, head: 30, leg_fn: 28, leg_ff: 18, leg_bn: -18, leg_bf: -13 }, x: 0.155 }, { t: 1300, a: {} }],
        },
      },
      "quad:slash": {
        // up on the hind legs, the near forepaw raised high, raked down through the foe
        attack: {
          dur: 1000, hit: 520, lunge: true,
          keys: [{ t: 0, a: {} }, { t: 380, e: "out", a: { torso: -21, head: -12, leg_fn: 125, leg_ff: 40 }, x: -0.02 }, { t: 450, a: { torso: -22, head: -14, leg_fn: 130, leg_ff: 42 }, x: -0.025 }, { t: 520, e: "in", a: { torso: 8, head: 15, leg_fn: 25, leg_ff: 30 }, x: 0.1 }, { t: 780, a: { torso: 7, head: 13, leg_fn: 23, leg_ff: 28 }, x: 0.095 }, { t: 1000, a: {} }],
        },
        attack2: null,
        // a skill: reared right up, both forepaws high, brought down together with a shock ring
        skill: {
          dur: 1300, hit: 760, ring: 760, lunge: true,
          keys: [{ t: 0, a: {} }, { t: 500, e: "out", a: { torso: -32, head: -20, leg_fn: 135, leg_ff: 120 }, y: 0.02 }, { t: 660, a: { torso: -33, head: -22, leg_fn: 140, leg_ff: 125 }, y: 0.02 }, { t: 760, e: "in", a: { torso: 12, head: 20, leg_fn: 30, leg_ff: 25 }, x: 0.1 }, { t: 1050, a: { torso: 10, head: 18, leg_fn: 28, leg_ff: 23 }, x: 0.095 }, { t: 1300, a: {} }],
        },
      },
      "quad:smash": {
        // reared up on the hind legs, both forepaws slammed down on the foe
        attack: {
          dur: 1100, hit: 600, ring: 600, lunge: true,
          keys: [{ t: 0, a: {} }, { t: 420, e: "out", a: { torso: -28, head: -18, leg_fn: 70, leg_ff: 55 }, y: 0.02 }, { t: 520, a: { torso: -30, head: -20, leg_fn: 72, leg_ff: 57 }, y: 0.02 }, { t: 600, e: "in", a: { torso: 12, head: 18, leg_fn: 20, leg_ff: 15 }, x: 0.09 }, { t: 880, a: { torso: 10, head: 16, leg_fn: 18, leg_ff: 13 }, x: 0.085 }, { t: 1100, a: {} }],
        },
        attack2: null,
        skill: {
          dur: 1400, hit: 820, ring: 820, lunge: true,
          keys: [{ t: 0, a: {} }, { t: 300, e: "out", a: { torso: 6, head: 5, leg_fn: -15, leg_bn: 15 }, x: -0.03 }, { t: 600, e: "out", a: { torso: -30, head: -20, leg_fn: 80, leg_ff: 65, leg_bn: -20 }, x: 0.05, y: 0.25 }, { t: 720, a: { torso: -32, head: -22, leg_fn: 82, leg_ff: 67, leg_bn: -20 }, x: 0.07, y: 0.26 }, { t: 820, e: "in", a: { torso: 14, head: 22, leg_fn: 20, leg_ff: 15 }, x: 0.12 }, { t: 1150, a: { torso: 12, head: 20, leg_fn: 18, leg_ff: 13 }, x: 0.115 }, { t: 1400, a: {} }],
        },
      },
      // fly: a flier (insects, the butterfly-mouse, the moth). One body (torso, turning about its middle: + dips the head)
      // and wings beating on their own; it hangs in the air (rig.json hover), bobbing. Attacks: pull up and back, dive at
      // the foe (stab: a sting, smash: a ram), or rise and shoot / cast; it falls belly up to the ground.
      fly: {
        idle: { rel: true, dur: 900, loop: true, keys: [{ t: 0, a: { torso: 2 } }, { t: 450, e: "inout", a: { torso: -2 }, y: 0.035 }, { t: 900, e: "inout", a: { torso: 2 } }] },
        hurt: { rel: true, dur: 480, keys: [{ t: 0, a: {} }, { t: 80, e: "out", a: { torso: -25 }, x: -0.07, y: 0.04 }, { t: 240, a: { torso: -15 }, x: -0.06, y: 0.03 }, { t: 480, a: {} }] },
        cast: { rel: true, dur: 1000, keys: [{ t: 0, a: {} }, { t: 350, e: "out", a: { torso: -15 }, y: 0.15 }, { t: 700, a: { torso: -16 }, y: 0.16 }, { t: 1000, a: {} }] },
        dead: { rel: true, fall: true, dur: 900, keys: [{ t: 0, a: {} }, { t: 200, e: "out", a: { torso: -40 }, x: -0.04, y: 0.05 }, { t: 900, e: "in", a: { torso: -170 }, x: -0.08, g: 1 }] },
      },
      "fly:stab": {
        attack: {
          dur: 850, hit: 430, lunge: true,
          keys: [{ t: 0, a: {} }, { t: 320, e: "out", a: { torso: -25 }, x: -0.06, y: 0.12 }, { t: 370, a: { torso: -27 }, x: -0.065, y: 0.13 }, { t: 430, e: "in", a: { torso: 35 }, x: 0.15, y: -0.05 }, { t: 650, a: { torso: 30 }, x: 0.14, y: -0.04 }, { t: 850, a: {} }],
        },
        attack2: {
          dur: 950, hit: 560, hits: [330], lunge: true,
          keys: [{ t: 0, a: {} }, { t: 220, e: "out", a: { torso: -20 }, x: -0.04, y: 0.1 }, { t: 330, e: "in", a: { torso: 30 }, x: 0.12, y: -0.03 }, { t: 450, e: "out", a: { torso: -15 }, x: 0.04, y: 0.1 }, { t: 560, e: "in", a: { torso: 35 }, x: 0.15, y: -0.04 }, { t: 760, a: { torso: 30 }, x: 0.14, y: -0.03 }, { t: 950, a: {} }],
        },
        skill: {
          dur: 1200, hit: 700, lunge: true, through: true,
          keys: [{ t: 0, a: {} }, { t: 500, e: "out", a: { torso: -35 }, x: -0.08, y: 0.25 }, { t: 620, a: { torso: -37 }, x: -0.085, y: 0.26 }, { t: 700, e: "in", a: { torso: 45 }, x: 0.18, y: -0.05 }, { t: 950, a: { torso: 38 }, x: 0.17, y: -0.04 }, { t: 1200, a: {} }],
        },
      },
      "fly:smash": {
        // two rams with the whole body
        attack: {
          dur: 900, hit: 580, hits: [330], lunge: true,
          keys: [{ t: 0, a: {} }, { t: 230, e: "out", a: { torso: -15 }, x: -0.05, y: 0.06 }, { t: 330, e: "in", a: { torso: 20 }, x: 0.12 }, { t: 450, e: "out", a: { torso: -10 }, x: 0.02, y: 0.06 }, { t: 580, e: "in", a: { torso: 25 }, x: 0.14 }, { t: 760, a: { torso: 20 }, x: 0.13 }, { t: 900, a: {} }],
        },
        skill: {
          dur: 1200, hit: 720, ring: 720, lunge: true,
          keys: [{ t: 0, a: {} }, { t: 520, e: "out", a: { torso: -30 }, x: -0.04, y: 0.3 }, { t: 620, a: { torso: -32 }, y: 0.31 }, { t: 720, e: "in", a: { torso: 40 }, x: 0.14, y: -0.06 }, { t: 980, a: { torso: 35 }, x: 0.13, y: -0.05 }, { t: 1200, a: {} }],
        },
      },
      "fly:ranged": {
        // up and back, a dip of the head as it shoots
        attack: {
          dur: 900, shot: 470, hit: 680, missile: "orb",
          keys: [{ t: 0, a: {} }, { t: 380, e: "out", a: { torso: -20 }, x: -0.04, y: 0.12 }, { t: 470, e: "in", a: { torso: 15 }, y: 0.08 }, { t: 700, a: { torso: 12 }, y: 0.07 }, { t: 900, a: {} }],
        },
        skill: {
          dur: 1200, shot: 760, hit: 980, missile: "orb",
          keys: [{ t: 0, a: {} }, { t: 620, e: "out", a: { torso: -28 }, x: -0.06, y: 0.25 }, { t: 760, e: "in", a: { torso: 18 }, y: 0.18 }, { t: 1000, a: { torso: 14 }, y: 0.16 }, { t: 1200, a: {} }],
        },
      },
      "biped:slash": {
        // an overhead chop: the blade up behind the head, brought down through the foe
        attack: {
          dur: 900, hit: 430, lunge: true,
          keys: [{ t: 0, a: {} }, { t: 300, e: "out", a: { torso: -12, arm_m: 160, weapon: 225, arm_o: 30, leg_f: -6 }, x: -0.03, y: 0.02 }, { t: 360, a: { torso: -13, arm_m: 165, weapon: 232, arm_o: 32 }, x: -0.035, y: 0.02 }, { t: 430, e: "in", a: { torso: 18, arm_m: 70, weapon: 50, arm_o: -25, leg_f: 12, leg_b: -10 }, x: 0.08 }, { t: 680, a: { torso: 16, arm_m: 66, weapon: 46, arm_o: -22, leg_f: 10, leg_b: -9 }, x: 0.075 }, { t: 900, a: {} }],
        },
        // a flat sweep: wound back behind, swung round through the foe and up
        attack2: {
          dur: 900, hit: 420, lunge: true,
          keys: [{ t: 0, a: {} }, { t: 290, e: "out", a: { torso: -10, arm_m: -30, weapon: -85, arm_o: 25 }, x: -0.03, y: -0.02 }, { t: 340, a: { torso: -11, arm_m: -35, weapon: -90, arm_o: 27 }, x: -0.035, y: -0.02 }, { t: 420, e: "in", a: { torso: 14, arm_m: 105, weapon: 125, arm_o: -30, leg_f: 12 }, x: 0.07 }, { t: 680, a: { torso: 12, arm_m: 102, weapon: 122, arm_o: -28, leg_f: 10 }, x: 0.065 }, { t: 900, a: {} }],
        },
        // a skill: a leap with the blade high, crashing down with a shock ring
        skill: {
          dur: 1250, hit: 700, ring: 700, lunge: true,
          keys: [{ t: 0, a: {} }, { t: 220, e: "out", a: { torso: 10, leg_f: -10, leg_b: 10 }, y: -0.04 }, { t: 480, e: "out", a: { torso: -16, arm_m: 170, weapon: 235, arm_o: 150, leg_f: 25, leg_b: -20 }, x: 0.04, y: 0.35 }, { t: 590, a: { torso: -18, arm_m: 175, weapon: 240, arm_o: 155, leg_f: 25, leg_b: -20 }, x: 0.06, y: 0.36 }, { t: 700, e: "in", a: { torso: 24, arm_m: 65, weapon: 45, arm_o: -20, leg_f: 14, leg_b: -12 }, x: 0.11 }, { t: 1000, a: { torso: 22, arm_m: 62, weapon: 42, arm_o: -18, leg_f: 12, leg_b: -11 }, x: 0.105 }, { t: 1250, a: {} }],
        },
      },
      "biped:stab": {
        // a crouch back with the fist drawn in and the point on the foe, then the arm shot straight out (LC's knife attack)
        attack: {
          dur: 820, hit: 400, lunge: true,
          keys: [{ t: 0, a: {} }, { t: 280, e: "out", a: { torso: -14, arm_m: 15, weapon: 100, arm_o: 40, leg_f: -8 }, x: -0.06, y: -0.03 }, { t: 330, a: { torso: -15, arm_m: 10, weapon: 102, arm_o: 42 }, x: -0.065, y: -0.03 }, { t: 400, e: "in", a: { torso: 20, arm_m: 95, weapon: 90, arm_o: -30, leg_f: 18, leg_b: -14 }, x: 0.13 }, { t: 620, a: { torso: 18, arm_m: 94, weapon: 90, arm_o: -28, leg_f: 16, leg_b: -12 }, x: 0.125 }, { t: 820, a: {} }],
        },
        // two quick jabs
        attack2: {
          dur: 900, hit: 520, hits: [300], lunge: true,
          keys: [{ t: 0, a: {} }, { t: 200, e: "out", a: { torso: -10, arm_m: 25, weapon: 100, arm_o: 40 }, x: -0.04 }, { t: 300, e: "in", a: { torso: 14, arm_m: 90, weapon: 92, arm_o: 10, leg_f: 10 }, x: 0.07 }, { t: 420, e: "out", a: { torso: -4, arm_m: 35, weapon: 98, arm_o: 30 }, x: 0.03 }, { t: 520, e: "in", a: { torso: 18, arm_m: 95, weapon: 88, arm_o: -25, leg_f: 15, leg_b: -10 }, x: 0.1 }, { t: 720, a: { torso: 17, arm_m: 94, weapon: 88, arm_o: -23, leg_f: 13, leg_b: -9 }, x: 0.095 }, { t: 900, a: {} }],
        },
        // a skill: held long, drawn right back, then a dash through the foe
        skill: {
          dur: 1200, hit: 680, lunge: true, through: true,
          keys: [{ t: 0, a: {} }, { t: 420, e: "out", a: { torso: -20, arm_m: -10, weapon: 105, arm_o: 50, leg_f: -12, leg_b: 8 }, x: -0.1, y: -0.04 }, { t: 600, a: { torso: -22, arm_m: -15, weapon: 106, arm_o: 52, leg_f: -13, leg_b: 9 }, x: -0.11, y: -0.04 }, { t: 680, e: "in", a: { torso: 26, arm_m: 100, weapon: 90, arm_o: -40, leg_f: 25, leg_b: -20 }, x: 0.17 }, { t: 960, a: { torso: 24, arm_m: 98, weapon: 90, arm_o: -38, leg_f: 22, leg_b: -18 }, x: 0.16 }, { t: 1200, a: {} }],
        },
      },
      "biped:smash": {
        // the club heaved up behind the head and brought down on the foe's
        attack: {
          dur: 1000, hit: 520, ring: 520, lunge: true,
          keys: [{ t: 0, a: {} }, { t: 380, e: "out", a: { torso: -14, arm_m: 165, weapon: 210, arm_o: 30, leg_f: -6 }, x: -0.03, y: 0.03 }, { t: 450, a: { torso: -15, arm_m: 170, weapon: 216, arm_o: 32 }, x: -0.035, y: 0.03 }, { t: 520, e: "in", a: { torso: 22, arm_m: 70, weapon: 60, arm_o: -20, leg_f: 13, leg_b: -10 }, x: 0.08 }, { t: 800, a: { torso: 20, arm_m: 66, weapon: 56, arm_o: -18, leg_f: 11, leg_b: -9 }, x: 0.075 }, { t: 1000, a: {} }],
        },
        // swung low from behind and round
        attack2: {
          dur: 1000, hit: 500, lunge: true,
          keys: [{ t: 0, a: {} }, { t: 360, e: "out", a: { torso: -12, arm_m: -30, weapon: -85, arm_o: 30 }, x: -0.04, y: -0.02 }, { t: 420, a: { torso: -13, arm_m: -35, weapon: -90, arm_o: 32 }, x: -0.045, y: -0.02 }, { t: 500, e: "in", a: { torso: 16, arm_m: 100, weapon: 115, arm_o: -25, leg_f: 10 }, x: 0.07 }, { t: 780, a: { torso: 14, arm_m: 97, weapon: 111, arm_o: -22, leg_f: 9 }, x: 0.065 }, { t: 1000, a: {} }],
        },
        skill: {
          dur: 1350, hit: 780, ring: 780, lunge: true,
          keys: [{ t: 0, a: {} }, { t: 260, e: "out", a: { torso: 12, leg_f: -10, leg_b: 10 }, y: -0.05 }, { t: 560, e: "out", a: { torso: -18, arm_m: 172, weapon: 215, arm_o: 150, leg_f: 25, leg_b: -20 }, x: 0.04, y: 0.4 }, { t: 680, a: { torso: -20, arm_m: 176, weapon: 220, arm_o: 155, leg_f: 25, leg_b: -20 }, x: 0.06, y: 0.41 }, { t: 780, e: "in", a: { torso: 26, arm_m: 65, weapon: 55, arm_o: -20, leg_f: 14, leg_b: -12 }, x: 0.1 }, { t: 1100, a: { torso: 24, arm_m: 62, weapon: 52, arm_o: -18, leg_f: 12, leg_b: -11 }, x: 0.095 }, { t: 1350, a: {} }],
        },
      },
      "biped:ranged": {
        // the slingshot (or whatever it shoots with) held out at the foe, the other fist drawing back, let go
        attack: {
          dur: 900, shot: 480, hit: 700, missile: "orb",
          keys: [{ t: 0, a: {} }, { t: 200, e: "out", a: { torso: -4, arm_m: 92, weapon: "rest", arm_o: 70 } }, { t: 420, e: "out", a: { torso: -8, arm_m: 95, weapon: "rest", arm_o: -40 }, x: -0.02 }, { t: 480, e: "in", a: { torso: 6, arm_m: 90, weapon: "rest", arm_o: 30 }, x: 0.01 }, { t: 700, a: { torso: 5, arm_m: 90, weapon: "rest", arm_o: 25 }, x: 0.01 }, { t: 900, a: {} }],
        },
        skill: {
          dur: 1150, shot: 700, hit: 920, missile: "orb",
          keys: [{ t: 0, a: {} }, { t: 220, e: "out", a: { torso: -4, arm_m: 98, weapon: "rest", arm_o: 75 } }, { t: 600, e: "out", a: { torso: -14, arm_m: 102, weapon: "rest", arm_o: -55, leg_f: -8 }, x: -0.04 }, { t: 700, e: "in", a: { torso: 10, arm_m: 95, weapon: "rest", arm_o: 35, leg_f: 8 }, x: 0.02 }, { t: 950, a: { torso: 8, arm_m: 95, weapon: "rest", arm_o: 30 }, x: 0.02 }, { t: 1150, a: {} }],
        },
      },
      "biped:magic": {
        // LC's goblin mage: the staff raised up high, then thrust out at the foe
        attack: {
          dur: 1050, shot: 560, hit: 800, missile: "orb",
          keys: [{ t: 0, a: {} }, { t: 380, e: "out", a: { torso: -16, arm_m: 160, weapon: 225, arm_o: 30, leg_f: -8 }, x: -0.02, y: 0.02 }, { t: 480, a: { torso: -17, arm_m: 163, weapon: 230, arm_o: 32 }, x: -0.025, y: 0.02 }, { t: 560, e: "in", a: { torso: 14, arm_m: 100, weapon: 130, arm_o: -15, leg_f: 10 }, x: 0.03 }, { t: 840, a: { torso: 12, arm_m: 98, weapon: 128, arm_o: -13, leg_f: 9 }, x: 0.03 }, { t: 1050, a: {} }],
        },
        skill: {
          dur: 1400, shot: 820, hit: 1080, missile: "orb",
          keys: [{ t: 0, a: {} }, { t: 500, e: "out", a: { torso: -16, arm_m: 165, weapon: 215, arm_o: 150, leg_f: -6 }, y: 0.06 }, { t: 740, a: { torso: -17, arm_m: 168, weapon: 220, arm_o: 155 }, y: 0.07 }, { t: 820, e: "in", a: { torso: 16, arm_m: 100, weapon: 110, arm_o: 60, leg_f: 12 }, x: 0.04 }, { t: 1150, a: { torso: 14, arm_m: 98, weapon: 108, arm_o: 55, leg_f: 10 }, x: 0.04 }, { t: 1400, a: {} }],
        },
      },
    }
    // blob: a limbless one (slimes, eyeballs, a jellyfish, a coiled snake, a chest). One body (torso, standing on its
    // bottom middle: + leans at the foe) that squashes and stretches (sq, in percent: - squashed flat, + stretched tall),
    // maybe a top piece (head: a lid, a cap, a head on a neck; - thrown back / open, + snapped forward / shut), and
    // appendages swaying on their own (limbs: all of them reaching at the foe with +). Every blow is a squash and a spring.
    MT.blob = {
      idle: { rel: true, dur: 1800, loop: true, keys: [{ t: 0, a: { sq: 0 } }, { t: 900, e: "inout", a: { sq: 4, torso: -1, head: -3, limbs: -4 } }, { t: 1800, e: "inout", a: { sq: 0 } }] },
      hurt: { rel: true, dur: 520, keys: [{ t: 0, a: {} }, { t: 80, e: "out", a: { sq: -16, torso: -10, head: -15, limbs: -25 }, x: -0.05 }, { t: 240, a: { sq: 6, torso: -6, head: -8, limbs: -10 }, x: -0.045 }, { t: 520, a: {} }] },
      // a buff: squashed, then drawn up tall with the top piece thrown back
      cast: { rel: true, dur: 1100, keys: [{ t: 0, a: {} }, { t: 250, e: "out", a: { sq: -15 } }, { t: 500, e: "out", a: { sq: 18, torso: -4, head: -25, limbs: -35 }, y: 0.06 }, { t: 850, a: { sq: 16, torso: -4, head: -27, limbs: -38 }, y: 0.05 }, { t: 1100, a: {} }] },
      // a shudder, then it sags flat, the top piece and the appendages limp
      dead: { rel: true, fall: true, lift: 0, dur: 1000, keys: [{ t: 0, a: {} }, { t: 150, e: "out", a: { sq: -15, torso: -8, head: -20 }, x: -0.03 }, { t: 380, e: "out", a: { sq: 10, torso: -4, head: -25 }, x: -0.04 }, { t: 1000, e: "in", a: { sq: -42, torso: -10, head: 25, limbs: 35 }, x: -0.06, g: 1 }] },
    }
    MT["blob:stab"] = {
      // squashed down and back, the top piece drawn back (a lid open, a head reared), then a stretched lunge, snapping shut
      attack: {
        dur: 850, hit: 420, lunge: true,
        keys: [{ t: 0, a: {} }, { t: 300, e: "out", a: { sq: -20, torso: -12, head: -35, limbs: -25 }, x: -0.04 }, { t: 360, a: { sq: -22, torso: -13, head: -38, limbs: -28 }, x: -0.045 }, { t: 420, e: "in", a: { sq: 16, torso: 14, head: 15, limbs: 35 }, x: 0.15 }, { t: 650, a: { sq: 10, torso: 12, head: 12, limbs: 30 }, x: 0.14 }, { t: 850, a: {} }],
      },
      // two snaps
      attack2: {
        dur: 950, hit: 560, hits: [330], lunge: true,
        keys: [{ t: 0, a: {} }, { t: 220, e: "out", a: { sq: -15, torso: -8, head: -30 }, x: -0.03 }, { t: 330, e: "in", a: { sq: 12, torso: 10, head: 10, limbs: 25 }, x: 0.1 }, { t: 450, e: "out", a: { sq: -12, torso: -4, head: -30 }, x: 0.06 }, { t: 560, e: "in", a: { sq: 16, torso: 14, head: 15, limbs: 35 }, x: 0.15 }, { t: 760, a: { sq: 10, torso: 12, head: 12, limbs: 30 }, x: 0.14 }, { t: 950, a: {} }],
      },
      // a skill: a leap at the foe, landing on it squashed
      skill: {
        dur: 1250, hit: 720, lunge: true, through: true,
        keys: [{ t: 0, a: {} }, { t: 380, e: "out", a: { sq: -28, torso: -10, head: -35, limbs: -35 }, x: -0.05 }, { t: 560, e: "out", a: { sq: 22, torso: 10, head: -20, limbs: -20 }, x: 0.06, y: 0.3 }, { t: 720, e: "in", a: { sq: -18, torso: 16, head: 18, limbs: 40 }, x: 0.17 }, { t: 1000, a: { sq: -5, torso: 12, head: 12, limbs: 30 }, x: 0.16 }, { t: 1250, a: {} }],
      },
    }
    MT["blob:slash"] = {
      // leaned back, the appendages swept behind, then whipped through the foe with the whole body
      attack: {
        dur: 900, hit: 430, lunge: true,
        keys: [{ t: 0, a: {} }, { t: 300, e: "out", a: { sq: -10, torso: -16, head: -20, limbs: -50 }, x: -0.03 }, { t: 360, a: { sq: -12, torso: -17, head: -22, limbs: -55 }, x: -0.035 }, { t: 430, e: "in", a: { sq: 10, torso: 18, head: 12, limbs: 70 }, x: 0.12 }, { t: 680, a: { sq: 6, torso: 15, head: 10, limbs: 60 }, x: 0.11 }, { t: 900, a: {} }],
      },
      attack2: MT["blob:stab"].attack,
      // a skill: a spin through the foe
      skill: {
        dur: 1200, hit: 680, lunge: true, through: true,
        keys: [{ t: 0, a: {} }, { t: 400, e: "out", a: { sq: -22, torso: -12, limbs: -40 }, x: -0.05 }, { t: 680, e: "in", a: { sq: 12, torso: 8, limbs: 60 }, x: 0.16, y: 0.1, r: 360 }, { t: 950, a: { sq: 5, torso: 6, limbs: 40 }, x: 0.15, r: 360 }, { t: 1200, a: {}, r: 360 }],
      },
    }
    MT["blob:smash"] = {
      // a hop: squashed, sprung up tall, landing on the foe squashed flat
      attack: {
        dur: 1100, hit: 680, ring: 680, lunge: true,
        keys: [{ t: 0, a: {} }, { t: 260, e: "out", a: { sq: -25, torso: -6, head: -15, limbs: -20 } }, { t: 500, e: "out", a: { sq: 22, torso: -6, head: -20, limbs: -35 }, x: 0.05, y: 0.32 }, { t: 590, a: { sq: 18, torso: -4, head: -22, limbs: -38 }, x: 0.07, y: 0.33 }, { t: 680, e: "in", a: { sq: -30, torso: 10, head: 15, limbs: 30 }, x: 0.12 }, { t: 900, a: { sq: -8, torso: 8, head: 10, limbs: 20 }, x: 0.11 }, { t: 1100, a: {} }],
      },
      // two quick bounces into the foe
      attack2: {
        dur: 1000, hit: 640, hits: [340], lunge: true,
        keys: [{ t: 0, a: {} }, { t: 160, e: "out", a: { sq: -18 } }, { t: 260, e: "out", a: { sq: 15, torso: 6, limbs: -20 }, x: 0.05, y: 0.15 }, { t: 340, e: "in", a: { sq: -22, torso: 10, limbs: 25 }, x: 0.1 }, { t: 460, e: "out", a: { sq: 15, torso: 4, limbs: -20 }, x: 0.11, y: 0.15 }, { t: 640, e: "in", a: { sq: -26, torso: 12, limbs: 30 }, x: 0.14 }, { t: 820, a: { sq: -6, torso: 8, limbs: 20 }, x: 0.13 }, { t: 1000, a: {} }],
      },
      skill: {
        dur: 1400, hit: 860, ring: 860, lunge: true,
        keys: [{ t: 0, a: {} }, { t: 380, e: "out", a: { sq: -32, torso: -8, head: -20, limbs: -30 } }, { t: 660, e: "out", a: { sq: 28, torso: -8, head: -28, limbs: -45 }, x: 0.06, y: 0.5 }, { t: 760, a: { sq: 24, torso: -6, head: -30, limbs: -48 }, x: 0.08, y: 0.51 }, { t: 860, e: "in", a: { sq: -36, torso: 12, head: 18, limbs: 35 }, x: 0.13 }, { t: 1150, a: { sq: -10, torso: 10, head: 12, limbs: 25 }, x: 0.12 }, { t: 1400, a: {} }],
      },
    }
    MT["blob:ranged"] = {
      // squashed back, then stretched forward as it spits (or shoots) at the foe
      attack: {
        dur: 950, shot: 470, hit: 690, missile: "orb",
        keys: [{ t: 0, a: {} }, { t: 380, e: "out", a: { sq: -20, torso: -10, head: -25, limbs: -30 }, x: -0.02 }, { t: 470, e: "in", a: { sq: 16, torso: 12, head: 15, limbs: 30 }, x: 0.03 }, { t: 720, a: { sq: 12, torso: 10, head: 12, limbs: 25 }, x: 0.03 }, { t: 950, a: {} }],
      },
      skill: {
        dur: 1300, shot: 780, hit: 1020, missile: "orb",
        keys: [{ t: 0, a: {} }, { t: 300, e: "out", a: { sq: -18 } }, { t: 640, e: "out", a: { sq: 22, torso: -10, head: -30, limbs: -45 }, y: 0.06 }, { t: 780, e: "in", a: { sq: -10, torso: 14, head: 18, limbs: 35 }, x: 0.04 }, { t: 1050, a: { sq: -4, torso: 12, head: 15, limbs: 30 }, x: 0.04 }, { t: 1300, a: {} }],
      },
    }
    MT["blob:magic"] = MT["blob:ranged"]
    // fish: one body swimming in the air a little off the ground (rig.json hover), turning about its middle (+ dips its
    // nose), squashing and stretching like a blob (sq), its fins and tail beating all the time and reaching (limbs), a head
    // of its own if it has one (the aquahorse's: - reared back, + thrust at the foe). Attacks: a dart and a bite, or a
    // rear back and a spit from the mouth; it dies belly up and sinks to the ground.
    MT.fish = {
      idle: { rel: true, dur: 1400, loop: true, keys: [{ t: 0, a: { torso: 2 } }, { t: 700, e: "inout", a: { torso: -2, sq: 3, head: -4 }, y: 0.03 }, { t: 1400, e: "inout", a: { torso: 2 } }] },
      hurt: { rel: true, dur: 500, keys: [{ t: 0, a: {} }, { t: 80, e: "out", a: { torso: -22, sq: -12, head: -15, limbs: -30 }, x: -0.07, y: 0.03 }, { t: 250, a: { torso: -12, sq: 5, head: -8 }, x: -0.06, y: 0.02 }, { t: 500, a: {} }] },
      cast: { rel: true, dur: 1100, keys: [{ t: 0, a: {} }, { t: 300, e: "out", a: { sq: -10 } }, { t: 550, e: "out", a: { torso: -14, sq: 12, head: -25, limbs: -35 }, y: 0.12 }, { t: 850, a: { torso: -15, sq: 10, head: -27, limbs: -38 }, y: 0.13 }, { t: 1100, a: {} }] },
      dead: { rel: true, fall: true, dur: 1000, keys: [{ t: 0, a: {} }, { t: 180, e: "out", a: { torso: -30, sq: -10, head: -25 }, x: -0.04, y: 0.05 }, { t: 1000, e: "in", a: { torso: -170, sq: -8, head: 20, limbs: 30 }, x: -0.08, g: 1 }] },
    }
    MT["fish:stab"] = {
      // drawn back and up with a flick of the tail, then a dart at the foe, jaws first
      attack: {
        dur: 850, hit: 420, lunge: true,
        keys: [{ t: 0, a: {} }, { t: 300, e: "out", a: { torso: -16, sq: -12, head: -30, limbs: -35 }, x: -0.06, y: 0.06 }, { t: 360, a: { torso: -17, sq: -13, head: -32, limbs: -38 }, x: -0.065, y: 0.065 }, { t: 420, e: "in", a: { torso: 16, sq: 14, head: 15, limbs: 40 }, x: 0.17, y: -0.03 }, { t: 650, a: { torso: 13, sq: 9, head: 12, limbs: 32 }, x: 0.16, y: -0.02 }, { t: 850, a: {} }],
      },
      // two snaps
      attack2: {
        dur: 950, hit: 560, hits: [330], lunge: true,
        keys: [{ t: 0, a: {} }, { t: 220, e: "out", a: { torso: -12, sq: -10, head: -25, limbs: -30 }, x: -0.04, y: 0.05 }, { t: 330, e: "in", a: { torso: 12, sq: 10, head: 10, limbs: 30 }, x: 0.12 }, { t: 450, e: "out", a: { torso: -8, sq: -8, head: -25, limbs: -25 }, x: 0.06, y: 0.05 }, { t: 560, e: "in", a: { torso: 16, sq: 14, head: 15, limbs: 40 }, x: 0.16, y: -0.02 }, { t: 760, a: { torso: 13, sq: 9, head: 12, limbs: 32 }, x: 0.15 }, { t: 950, a: {} }],
      },
      // a skill: a long run up and a dash right through the foe
      skill: {
        dur: 1200, hit: 680, lunge: true, through: true,
        keys: [{ t: 0, a: {} }, { t: 450, e: "out", a: { torso: -22, sq: -18, head: -35, limbs: -45 }, x: -0.09, y: 0.12 }, { t: 600, a: { torso: -24, sq: -20, head: -37, limbs: -48 }, x: -0.1, y: 0.13 }, { t: 680, e: "in", a: { torso: 18, sq: 18, head: 18, limbs: 45 }, x: 0.19, y: -0.03 }, { t: 950, a: { torso: 14, sq: 10, head: 14, limbs: 35 }, x: 0.18 }, { t: 1200, a: {} }],
      },
    }
    MT["fish:slash"] = MT["fish:smash"] = MT["fish:stab"]
    MT["fish:ranged"] = {
      // reared back and up, then thrust forward spitting at the foe from the mouth
      attack: {
        dur: 950, shot: 470, hit: 690, missile: "orb", from: "head",
        keys: [{ t: 0, a: {} }, { t: 380, e: "out", a: { torso: -18, sq: -10, head: -28, limbs: -35 }, x: -0.03, y: 0.08 }, { t: 470, e: "in", a: { torso: 12, sq: 12, head: 20, limbs: 30 }, x: 0.02, y: 0.04 }, { t: 720, a: { torso: 10, sq: 8, head: 16, limbs: 25 }, x: 0.02, y: 0.04 }, { t: 950, a: {} }],
      },
      skill: {
        dur: 1300, shot: 780, hit: 1020, missile: "orb", from: "head",
        keys: [{ t: 0, a: {} }, { t: 300, e: "out", a: { sq: -12 } }, { t: 640, e: "out", a: { torso: -24, sq: 14, head: -35, limbs: -45 }, x: -0.04, y: 0.18 }, { t: 780, e: "in", a: { torso: 15, sq: -8, head: 22, limbs: 35 }, x: 0.03, y: 0.1 }, { t: 1050, a: { torso: 12, sq: -3, head: 18, limbs: 30 }, x: 0.03, y: 0.09 }, { t: 1300, a: {} }],
      },
    }
    MT["fish:magic"] = MT["fish:ranged"]
    // centaur: a biped's upper body (torso, turning on the horse's back) with its arms and bow on a horse (horse, standing
    // on its hindquarters: - rears up), each leg its own (the front ones on legs, the hind ones on legs_b, kept on the
    // ground as the horse leans; scut: a stamp). Its shots are the biped's, the skill reared up; it folds down to die.
    MT.centaur = {
      idle: { rel: true, dur: 1600, loop: true, keys: [{ t: 0, a: { arm_m: 2, arm_o: -2 } }, { t: 800, a: { torso: -2, horse: -1, arm_m: -3, arm_o: 3 }, y: -0.008 }, { t: 1600, a: { arm_m: 2, arm_o: -2 } }] },
      hurt: { rel: true, dur: 480, keys: [{ t: 0, a: {} }, { t: 80, e: "out", a: { torso: -14, horse: -6, arm_m: -20, arm_o: -25, scut: 8 }, x: -0.05 }, { t: 240, a: { torso: -9, horse: -4, arm_m: -8, arm_o: -12 }, x: -0.045 }, { t: 480, a: {} }] },
      // a buff: reared up, the bow thrust overhead
      cast: { dur: 1000, keys: [{ t: 0, a: {} }, { t: 160, e: "out", a: { torso: 4, horse: 4 } }, { t: 380, e: "out", a: { torso: -8, horse: -16, arm_m: 165, weapon: 178, arm_o: 150 } }, { t: 750, a: { torso: -8, horse: -17, arm_m: 168, weapon: 180, arm_o: 155 } }, { t: 1000, a: {} }] },
      // the upper body slumps back, the horse folds its legs and lies down
      dead: { rel: true, fall: true, lift: 0, dur: 900, keys: [{ t: 0, a: {} }, { t: 150, e: "out", a: { torso: -15, horse: -6, arm_m: -20, arm_o: -30, scut: 10 }, x: -0.03 }, { t: 900, e: "in", a: { torso: -35, horse: 5, arm_m: -45, arm_o: -55, legs: 75, legs_b: -70 }, x: -0.06, y: -0.2 }] },
    }
    MT["centaur:ranged"] = {
      attack: MT["biped:ranged"].attack,
      // the skill: reared up on the hind legs as it draws, coming down as it looses
      skill: { ...MT["biped:ranged"].skill, keys: MT["biped:ranged"].skill.keys.map(k => ({ ...k, a: { ...k.a, horse: { 220: -6, 600: -18, 700: -4, 950: -3 }[k.t] ?? 0 } })) },
    }
    MT["centaur:magic"] = MT["centaur:ranged"]
    // bug: an arthropod (a crab, a scorpion, a mantis, a beetle). One body on its walking legs (torso, standing on its
    // belly's bottom middle: + leans at the foe; the legs stay on the ground), its pincers / scythe arms (claws: - drawn
    // back and up, + struck at the foe), a scorpion's tail (tail: - curled back, + the sting), a head of its own (head: +
    // butts / nods at the foe), the legs scuttling (scut: how far each one kicks, in turn). It dies on its back, legs up.
    MT.bug = {
      idle: { rel: true, dur: 1600, loop: true, keys: [{ t: 0, a: { claws: 0 } }, { t: 800, e: "inout", a: { torso: -1.5, claws: -6, tail: -5, head: -3, sq: 2 } }, { t: 1600, e: "inout", a: { claws: 0 } }] },
      hurt: { rel: true, dur: 500, keys: [{ t: 0, a: {} }, { t: 80, e: "out", a: { torso: -10, claws: -25, tail: -20, head: -15, scut: 10, sq: -6 }, x: -0.05 }, { t: 250, a: { torso: -6, claws: -12, tail: -10, head: -8, scut: 6 }, x: -0.045 }, { t: 500, a: {} }] },
      // a buff: reared up, the claws flung up and back
      cast: { rel: true, dur: 1100, keys: [{ t: 0, a: {} }, { t: 300, e: "out", a: { torso: -12, claws: -50, tail: -30, head: -20, sq: 6 } }, { t: 800, a: { torso: -13, claws: -55, tail: -32, head: -22, sq: 6 } }, { t: 1100, a: {} }] },
      dead: { rel: true, fall: true, dur: 900, keys: [{ t: 0, a: {} }, { t: 150, e: "out", a: { torso: -15, claws: -30, tail: -20, scut: 15 }, x: -0.03 }, { t: 900, e: "in", a: { torso: -170, claws: 40, tail: 30, head: 20, scut: 25 }, x: -0.06 }] },
    }
    MT["bug:smash"] = {
      // the claws (or the horned head) raised high, a scuttle at the foe and slammed down on it
      attack: {
        dur: 1000, hit: 560, ring: 560, lunge: true,
        keys: [{ t: 0, a: {} }, { t: 380, e: "out", a: { torso: -12, claws: -60, head: -25, tail: -20, scut: 12 }, x: -0.02 }, { t: 470, a: { torso: -13, claws: -64, head: -27, tail: -22, scut: 12 }, x: -0.025 }, { t: 560, e: "in", a: { torso: 12, claws: 40, head: 25, tail: 10, sq: -6 }, x: 0.12 }, { t: 800, a: { torso: 10, claws: 35, head: 22, tail: 8 }, x: 0.115 }, { t: 1000, a: {} }],
      },
      // two snips (a butt and a butt)
      attack2: {
        dur: 950, hit: 560, hits: [330], lunge: true,
        keys: [{ t: 0, a: {} }, { t: 220, e: "out", a: { torso: -8, claws: -35, head: -20, scut: 10 }, x: -0.02 }, { t: 330, e: "in", a: { torso: 8, claws: 30, head: 18 }, x: 0.08 }, { t: 450, e: "out", a: { torso: -4, claws: -30, head: -18, scut: 10 }, x: 0.06 }, { t: 560, e: "in", a: { torso: 10, claws: 35, head: 22 }, x: 0.12 }, { t: 760, a: { torso: 9, claws: 32, head: 20 }, x: 0.115 }, { t: 950, a: {} }],
      },
      // a skill: a leap, everything up, crashing down with a shock ring
      skill: {
        dur: 1300, hit: 780, ring: 780, lunge: true,
        keys: [{ t: 0, a: {} }, { t: 300, e: "out", a: { torso: 6, sq: -12, scut: 8 } }, { t: 600, e: "out", a: { torso: -16, claws: -70, head: -30, tail: -25, sq: 8, legs: 25 }, x: 0.06, y: 0.3 }, { t: 690, a: { torso: -17, claws: -72, head: -32, tail: -26, sq: 8, legs: 25 }, x: 0.08, y: 0.31 }, { t: 780, e: "in", a: { torso: 14, claws: 45, head: 28, tail: 12, sq: -10 }, x: 0.13 }, { t: 1050, a: { torso: 12, claws: 40, head: 25, tail: 10 }, x: 0.125 }, { t: 1300, a: {} }],
      },
    }
    MT["bug:stab"] = {
      // the tail curled back over the body, then the sting driven at the foe (a crab or a mantis: a claw jab)
      attack: {
        dur: 900, hit: 450, lunge: true,
        keys: [{ t: 0, a: {} }, { t: 320, e: "out", a: { torso: -8, tail: -30, claws: -20, head: -10, scut: 10 }, x: -0.03 }, { t: 380, a: { torso: -9, tail: -33, claws: -22, head: -11, scut: 10 }, x: -0.035 }, { t: 450, e: "in", a: { torso: 10, tail: 60, claws: 30, head: 12 }, x: 0.1 }, { t: 700, a: { torso: 9, tail: 55, claws: 26, head: 10 }, x: 0.095 }, { t: 900, a: {} }],
      },
      // pinched twice
      attack2: {
        dur: 950, hit: 560, hits: [330], lunge: true,
        keys: [{ t: 0, a: {} }, { t: 220, e: "out", a: { torso: -6, claws: -35, tail: -10, scut: 10 }, x: -0.02 }, { t: 330, e: "in", a: { torso: 8, claws: 35, tail: 5 }, x: 0.09 }, { t: 450, e: "out", a: { torso: -2, claws: -30, scut: 10 }, x: 0.07 }, { t: 560, e: "in", a: { torso: 10, claws: 40, tail: 10 }, x: 0.12 }, { t: 760, a: { torso: 9, claws: 36, tail: 8 }, x: 0.115 }, { t: 950, a: {} }],
      },
      // a skill: a long wind-up, then the sting through the foe
      skill: {
        dur: 1250, hit: 720, lunge: true, through: true,
        keys: [{ t: 0, a: {} }, { t: 480, e: "out", a: { torso: -14, tail: -45, claws: -40, head: -15, scut: 14 }, x: -0.06 }, { t: 640, a: { torso: -15, tail: -48, claws: -42, head: -16, scut: 14 }, x: -0.065 }, { t: 720, e: "in", a: { torso: 14, tail: 75, claws: 40, head: 15 }, x: 0.16 }, { t: 1000, a: { torso: 12, tail: 70, claws: 36, head: 13 }, x: 0.15 }, { t: 1250, a: {} }],
      },
    }
    MT["bug:slash"] = {
      // the scythes raised high and back, swept down through the foe
      attack: {
        dur: 950, hit: 470, lunge: true,
        keys: [{ t: 0, a: {} }, { t: 340, e: "out", a: { torso: -15, claws: -70, head: -10, tail: -15, scut: 10 }, x: -0.02 }, { t: 400, a: { torso: -16, claws: -74, head: -11, tail: -16, scut: 10 }, x: -0.025 }, { t: 470, e: "in", a: { torso: 15, claws: 80, head: 12, tail: 10 }, x: 0.12 }, { t: 720, a: { torso: 13, claws: 72, head: 10, tail: 8 }, x: 0.115 }, { t: 950, a: {} }],
      },
      attack2: MT["bug:smash"].attack2,
      // a skill: two sweeps, the second through the foe
      skill: {
        dur: 1300, hit: 760, hits: [420], lunge: true, through: true,
        keys: [{ t: 0, a: {} }, { t: 300, e: "out", a: { torso: -15, claws: -70, scut: 12 }, x: -0.03 }, { t: 420, e: "in", a: { torso: 12, claws: 70 }, x: 0.08 }, { t: 640, e: "out", a: { torso: -12, claws: -75, scut: 12 }, x: 0.06 }, { t: 760, e: "in", a: { torso: 16, claws: 85, head: 12 }, x: 0.17 }, { t: 1050, a: { torso: 14, claws: 78, head: 10 }, x: 0.16 }, { t: 1300, a: {} }],
      },
    }
    MT["bug:ranged"] = MT["bug:magic"] = {
      attack: { ...MT["fish:ranged"].attack, keys: MT["bug:stab"].attack.keys.map(k => ({ ...k, x: (k.x || 0) * 0.3 })), shot: 450, hit: 670 },
      skill: { ...MT["fish:ranged"].skill, keys: MT["bug:stab"].skill.keys.map(k => ({ ...k, x: (k.x || 0) * 0.3 })), shot: 720, hit: 950, through: false },
    }
    // a beast that rakes or slams also bites
    MT["quad:slash"].attack2 = MT["quad:smash"].attack2 = MT["quad:stab"].attack
    // a beast that shoots or casts: the head drawn back and thrust at the foe, the shot (quills, spit, a spell) from its mouth
    MT["quad:ranged"] = {
      attack: {
        dur: 950, shot: 470, hit: 690, missile: "orb", from: "head",
        keys: [{ t: 0, a: {} }, { t: 380, e: "out", a: { torso: -10, head: -25, leg_fn: 10 }, x: -0.03 }, { t: 470, e: "in", a: { torso: 8, head: 22, leg_fn: -5, leg_bn: -8 }, x: 0.03 }, { t: 720, a: { torso: 7, head: 20 }, x: 0.03 }, { t: 950, a: {} }],
      },
      skill: {
        dur: 1250, shot: 760, hit: 1000, missile: "orb", from: "head",
        keys: [{ t: 0, a: {} }, { t: 620, e: "out", a: { torso: -20, head: -32, leg_fn: 25, leg_ff: 15 }, x: -0.04 }, { t: 760, e: "in", a: { torso: 10, head: 26, leg_fn: 5, leg_bn: -10 }, x: 0.05 }, { t: 1000, a: { torso: 9, head: 24 }, x: 0.05 }, { t: 1250, a: {} }],
      },
    }
    MT["quad:magic"] = MT["quad:ranged"]
    MT["fly:magic"] = MT["fly:ranged"]
    // a monster's set: its template, its style's attacks, then its own entries. Directions become turns from its rest
    // (rig.json aim: an arm's from shoulder to fist, a weapon's from grip to tip): the arm turns to its direction and
    // the wrist turns the weapon to its own; a two-handed weapon (rig.json two) keeps its grip, the arms turn it to its
    // direction together. Parts on the torso turn with it, and the torso's forward lean is the other way round from
    // theirs: its lean is added back so a direction stays one on the ground (the legs stay planted, except in a fall).
    function monsterActions(id, def) {
      const tmpl = def.tmpl
      if (!MT[tmpl] || ACTIONS[id]?.__tmpl) return
      const style = MONSTERS[id]?.[1] || "smash"
      // (a shape without attacks of its own for this style uses the biped's)
      const src = { ...MT[tmpl], ...(MT[tmpl + ":" + style] || MT["biped:" + style] || MT[tmpl + ":smash"] || MT["biped:smash"]) }
      const P = def.parts
      const rest = n => P[n]?.aim || 0
      const set = { __tmpl: tmpl }
      for (const [name, act] of Object.entries(src)) {
        const keys = act.keys.map(k => ({ ...k, a: { ...k.a } }))
        for (const k of keys) {
          const a = k.a
          // (a centaur's arms are on its upper body, on its horse: both leans; its legs only on the horse)
          const t = (a.torso || 0) + (a.horse || 0)
          if (!act.rel) {
            const A = a.arm_m
            // (weapon "rest": kept upright as drawn, whatever the arm does: a slingshot held out at the foe)
            const W = !P.weapon ? null : a.weapon === "rest" ? rest("weapon") : a.weapon
            delete a.weapon
            if (def.two && W != null) a.arm_m = W - rest("weapon") + t
            else if (A != null) {
              a.arm_m = A - rest("arm_m") + t
              if (W != null) a.weapon = W - rest("weapon") - A + rest("arm_m")
            }
            if (a.arm_o != null) a.arm_o += t - rest("arm_o")
          }
          if (def.two) a.arm_o = a.arm_m
          const lean = tmpl === "centaur" ? a.horse || 0 : t
          if (!act.fall && lean) for (const n of Object.keys(P)) if (n.startsWith("leg")) a[n] = (a[n] || 0) + lean
          // lying down, a beast sinks by its legs' length (rig.json legs; the template's -0.2 is for a bear's)
          if (act.fall && k.y < 0 && def.legs) k.y = (k.y * def.legs) / 0.45
          // a flier's fall: g of the way down from its hover
          if (k.g) k.y = (k.y || 0) - (def.hover || 0) * k.g
        }
        // whole turns taken off so the first move leaves the rest the short way round (the rest of the action follows on)
        if (!act.rel)
          for (const n of ["arm_m", "arm_o", "weapon"]) {
            const first = keys.find(k => k.a[n] != null)
            if (!first) continue
            const off = -Math.round(first.a[n] / 360) * 360
            for (const k of keys) if (k.a[n] != null) k.a[n] += off
          }
        set[name] = { ...act, keys }
      }
      ACTIONS[id] = Object.assign(set, ACTIONS[id])
    }
    // ----- two-handed slashers / smashers (werewolf, goblin; after Lost Castle's THW_*): both hands on the haft (the
    // front hand follows the weapon, def.two), so only the back hand moves. At rest the head trails low behind the body,
    // the haft across the hips; every blow is a big committed swing with a long hold after it.
    ACTIONS["player:great"] = {
      idle: { dur: 1800, loop: true, keys: [{ t: 0, a: { hm: [0.06, -0.05, 104] } }, { t: 900, a: { body: 2, hm: [0.06, -0.035, 102] }, y: -0.01 }, { t: 1800, a: { hm: [0.06, -0.05, 104] } }] },
      // 普攻 1: heaved up over the head and brought straight down in front, held in the ground, hauled back
      attack: {
        dur: 760, hit: 300, ring: 300, lunge: true,
        keys: [
          { t: 0, a: { hm: [0.06, -0.05, 104] } },
          { t: 180, e: "out", a: { body: -12, hm: [0.02, 0.45, 75] }, x: -0.03 },
          { t: 300, e: "in", a: { body: 20, hm: [0.48, 0.07, -112] }, x: 0.07 },
          { t: 560, a: { body: 18, hm: [0.47, 0.06, -113] }, x: 0.065 },
          { t: 760, a: { hm: [0.06, -0.05, 104] } },
        ],
      },
      // 普攻 2: wound back level and swung flat through the foe, carried on round and down
      attack2: {
        dur: 760, hit: 300, lunge: true,
        keys: [
          { t: 0, a: { hm: [0.06, -0.05, 104] } },
          { t: 180, e: "out", a: { body: -14, hm: [-0.16, 0.2, 98] }, x: -0.03 },
          { t: 300, e: "in", a: { body: 14, hm: [0.5, 0.22, -78] }, x: 0.06 },
          { t: 400, e: "out", a: { body: 18, hm: [0.38, 0.1, -124] }, x: 0.07 },
          { t: 580, a: { body: 17, hm: [0.37, 0.09, -125] }, x: 0.065 },
          { t: 760, a: { hm: [0.06, -0.05, 104] } },
        ],
      },
      // 普攻 3: dragged low and ripped up through the foe, then down on it again
      attack3: {
        dur: 1000, hit: 560, hits: [260], ring: 560, lunge: true,
        keys: [
          { t: 0, a: { hm: [0.06, -0.05, 104] } },
          { t: 160, e: "out", a: { body: 10, hm: [0.12, -0.12, 150] }, y: -0.03 },
          { t: 260, e: "in", a: { body: -14, hm: [0.4, 0.5, 15] }, x: 0.05, y: 0.04 },
          { t: 420, e: "out", a: { body: -12, hm: [0.05, 0.55, 80] }, x: 0.05, y: 0.08 },
          { t: 560, e: "in", a: { body: 22, hm: [0.48, 0.06, -114] }, x: 0.1 },
          { t: 800, a: { body: 20, hm: [0.47, 0.05, -115] }, x: 0.095 },
          { t: 1000, a: { hm: [0.06, -0.05, 104] } },
        ],
      },
      // 分裂斩: a leap with the blade raised behind, crashing down on the foe with a shock ring (Lost Castle's impact)
      "skill:cleave": {
        dur: 1300, hit: 700, ring: 700, lunge: true,
        keys: [
          { t: 0, a: { hm: [0.06, -0.05, 104] } },
          { t: 200, e: "out", a: { body: 8, hm: [0.0, -0.05, 130] }, x: -0.02, y: -0.04 },
          { t: 450, e: "out", a: { body: -18, hm: [0.0, 0.5, 95] }, x: 0.02, y: 0.35 },
          { t: 580, a: { body: -20, hm: [0.02, 0.58, 105] }, x: 0.05, y: 0.36 },
          { t: 700, e: "in", a: { body: 28, hm: [0.52, 0.04, -116] }, x: 0.12 },
          { t: 1050, a: { body: 26, hm: [0.51, 0.03, -117] }, x: 0.115 },
          { t: 1300, a: { hm: [0.06, -0.05, 104] } },
        ],
      },
      // 血刃斩: three heavy cuts, down, up, and down through
      "skill:maim": {
        dur: 1350, hit: 900, hits: [380, 640], lunge: true, color: 0xff3b3b,
        keys: [
          { t: 0, a: { hm: [0.06, -0.05, 104] } },
          { t: 240, e: "out", a: { body: -12, hm: [0.02, 0.48, 80] }, x: -0.03 },
          { t: 380, e: "in", a: { body: 18, hm: [0.48, 0.07, -112] }, x: 0.06 },
          { t: 520, e: "out", a: { body: 12, hm: [0.3, -0.1, -160] }, x: 0.06, y: -0.02 },
          { t: 640, e: "in", a: { body: -12, hm: [0.42, 0.5, 18] }, x: 0.08, y: 0.04 },
          { t: 770, e: "out", a: { body: -14, hm: [0.05, 0.56, 85] }, x: 0.08, y: 0.06 },
          { t: 900, e: "in", a: { body: 24, hm: [0.52, 0.05, -115] }, x: 0.13 },
          { t: 1150, a: { body: 22, hm: [0.51, 0.04, -116] }, x: 0.125 },
          { t: 1350, a: { hm: [0.06, -0.05, 104] } },
        ],
      },
      // 致残斩: crouched, the blade trailing low behind; a sweep at the legs, round again and a harder one
      "skill:crippling_slash": {
        dur: 1400, hit: 900, hits: [520], ring: 900, lunge: true, color: 0xff8a3b,
        keys: [
          { t: 0, a: { hm: [0.06, -0.05, 104] } },
          { t: 260, e: "out", a: { body: -14, hm: [-0.14, 0.02, 116] }, y: -0.04 },
          { t: 420, a: { body: -15, hm: [-0.15, 0.01, 117] }, y: -0.04 },
          { t: 520, e: "in", a: { body: 16, hm: [0.5, 0.0, -100] }, x: 0.06 },
          { t: 620, e: "out", a: { body: 14, hm: [0.42, -0.04, -130] }, x: 0.06 },
          { t: 780, e: "inout", a: { body: -16, hm: [-0.15, 0.02, 120] }, x: 0.04, y: -0.03 },
          { t: 900, e: "in", a: { body: 22, hm: [0.52, -0.01, -102] }, x: 0.11 },
          { t: 1150, a: { body: 20, hm: [0.51, -0.02, -103] }, x: 0.105 },
          { t: 1400, a: { hm: [0.06, -0.05, 104] } },
        ],
      },
      // 重锤: hoisted high and held, then hammered down on the foe's head
      "skill:stunning_blow": {
        dur: 1350, hit: 820, ring: 820, lunge: true,
        keys: [
          { t: 0, a: { hm: [0.06, -0.05, 104] } },
          { t: 320, e: "out", a: { body: -16, hm: [-0.02, 0.6, 115] }, y: 0.05 },
          { t: 720, a: { body: -17, hm: [-0.02, 0.62, 117] }, y: 0.05 },
          { t: 820, e: "in", a: { body: 26, hm: [0.5, 0.05, -115] }, x: 0.11 },
          { t: 1100, a: { body: 24, hm: [0.49, 0.04, -116] }, x: 0.105 },
          { t: 1350, a: { hm: [0.06, -0.05, 104] } },
        ],
      },
      // 重扫: wound far round behind and swung flat through the whole line
      "skill:sweep": {
        dur: 1300, hit: 720, ring: 720, lunge: true,
        keys: [
          { t: 0, a: { hm: [0.06, -0.05, 104] } },
          { t: 280, e: "out", a: { body: -18, hm: [-0.22, 0.16, 105] }, x: -0.04 },
          { t: 600, a: { body: -19, hm: [-0.23, 0.16, 107] }, x: -0.045 },
          { t: 720, e: "in", a: { body: 16, hm: [0.52, 0.16, -88] }, x: 0.07 },
          { t: 820, e: "out", a: { body: 20, hm: [0.42, 0.1, -122] }, x: 0.08 },
          { t: 1050, a: { body: 18, hm: [0.41, 0.09, -123] }, x: 0.075 },
          { t: 1300, a: { hm: [0.06, -0.05, 104] } },
        ],
      },
      // any other blow (and one on every foe): two whirls with the weapon swung out, then a slam
      skill: {
        dur: 1400, hit: 880, ring: 880, lunge: true,
        keys: [
          { t: 0, a: { hm: [0.06, -0.05, 104] } },
          { t: 220, e: "out", a: { body: -10, hm: [0.42, 0.18, -75] }, y: -0.02 },
          { t: 820, e: "linear", a: { body: -6, hm: [0.42, 0.18, -75] }, y: 0.05, r: 720 },
          { t: 880, e: "in", a: { body: 24, hm: [0.5, 0.05, -114] }, x: 0.06, r: 720 },
          { t: 1150, a: { body: 22, hm: [0.49, 0.04, -115] }, x: 0.06, r: 720 },
          { t: 1400, a: { hm: [0.06, -0.05, 104] }, r: 720 },
        ],
      },
      // the weapon planted in front against the blow, knocked back a step
      hurt: {
        dur: 450,
        keys: [
          { t: 0, a: { hm: [0.06, -0.05, 104] } },
          { t: 80, e: "out", a: { body: -12, hm: [0.06, 0.08, 20] }, x: -0.05 },
          { t: 250, a: { body: -8, hm: [0.06, 0.07, 25] }, x: -0.04 },
          { t: 450, a: { hm: [0.06, -0.05, 104] } },
        ],
      },
      // raised high overhead, head up (a war cry)
      cast: {
        dur: 1150,
        keys: [
          { t: 0, a: { hm: [0.06, -0.05, 104] } },
          { t: 300, e: "out", a: { body: -6, hm: [0.08, 0.6, 20] }, y: 0.03 },
          { t: 850, a: { body: -6, hm: [0.08, 0.61, 20] }, y: 0.03 },
          { t: 1150, a: { hm: [0.06, -0.05, 104] } },
        ],
      },
      // falls on the back; the weapon drops and lies on the ground beside the body
      dead: {
        dur: 700,
        keys: [
          { t: 0, a: { hm: [0.06, -0.05, 104] } },
          { t: 220, a: { body: -25, hm: [-0.05, 0.1, 60] } },
          { t: 700, e: "in", a: { body: -84, hm: [-0.15, -0.6, -84] } },
        ],
      },
    }
    // a spear with a shield: the shield back at the body as a guard, the spear (drawn over it) low at the hip as without one
    const shifted = (set, dhm, dho, skip) =>
      Object.fromEntries(
        Object.entries(set).map(([n, a]) => [
          n,
          skip.includes(n)
            ? a
            : { ...a, keys: a.keys.map(k => ({ ...k, a: { ...k.a, ...(k.a.hm && { hm: k.a.hm.map((v, i) => v + dhm[i]) }), ...(k.a.ho && { ho: k.a.ho.map((v, i) => v + dho[i]) }) } })) },
        ]),
      )
    ACTIONS["player:spear:shield"] = shifted(ACTIONS["player:spear"], [0, 0, 0], [-0.12, -0.15, 0], ["cast", "dead"])
    // ----- off hands: shields keep each set's own front-hand moves; a book, a relic or a dagger replaces them with its
    // own track (OFF_TRACKS, laid over whatever the back hand does), and a dagger adds its own strikes (OFF_ACTIONS).
    // Track keys: t = a share of the action's length, or "pre" (the wind-up before the blow), "hit", "hold" (half way
    // from the blow to the end); ho = [forward, up, degrees] like a floating hand (+ degrees tip it back).
    const offOf = id => {
      const k = String(id || "")
      return !k ? "" : /dirk|defender/.test(k) ? "dagger" : /codex|tome/.test(k) ? "book" : /eye_watch|relic/.test(k) ? "relic" : "shield"
    }
    const OFF_TRACKS = {
      // read at the chest, held by the bottom of the spine (the art faces the reader); pushed out at the foe with each
      // blow, raised high on a buff
      book: {
        idle: [{ t: 0, ho: [0.02, -0.03, 0] }, { t: 0.5, ho: [0.02, -0.015, 2] }, { t: 1, ho: [0.02, -0.03, 0] }],
        attack: [{ t: 0, ho: [0.02, -0.03, 0] }, { t: "pre", ho: [0.1, -0.06, -5] }, { t: "hit", ho: [0.26, -0.09, -15] }, { t: "hold", ho: [0.25, -0.09, -13] }, { t: 1, ho: [0.02, -0.03, 0] }],
        hurt: [{ t: 0, ho: [0.02, -0.03, 0] }, { t: 0.2, ho: [-0.02, 0.01, 15] }, { t: 1, ho: [0.02, -0.03, 0] }],
        cast: [{ t: 0, ho: [0.02, -0.03, 0] }, { t: 0.25, ho: [0, 0.33, -10] }, { t: 0.75, ho: [0, 0.34, -10] }, { t: 1, ho: [0.02, -0.03, 0] }],
        dead: [{ t: 0, ho: [0.02, -0.03, 0] }, { t: 0.3, ho: [-0.05, -0.02, 20] }, { t: 1, ho: [0.05, -0.6, -90] }],
      },
      // held up in front like a lantern; thrust high at the foe, raised overhead on a buff (it glows: see play)
      relic: {
        idle: [{ t: 0, ho: [0.04, 0.1, 0] }, { t: 0.5, ho: [0.04, 0.12, 0] }, { t: 1, ho: [0.04, 0.1, 0] }],
        attack: [{ t: 0, ho: [0.04, 0.1, 0] }, { t: "pre", ho: [0.06, 0.16, 0] }, { t: "hit", ho: [0.16, 0.22, 0] }, { t: "hold", ho: [0.15, 0.21, 0] }, { t: 1, ho: [0.04, 0.1, 0] }],
        hurt: [{ t: 0, ho: [0.04, 0.1, 0] }, { t: 0.2, ho: [-0.02, 0.12, 15] }, { t: 1, ho: [0.04, 0.1, 0] }],
        cast: [{ t: 0, ho: [0.04, 0.1, 0] }, { t: 0.25, ho: [-0.02, 0.5, 0] }, { t: 0.75, ho: [-0.02, 0.52, 0] }, { t: 1, ho: [0.04, 0.1, 0] }],
        dead: [{ t: 0, ho: [0.04, 0.1, 0] }, { t: 0.3, ho: [-0.05, 0.05, 20] }, { t: 1, ho: [0.08, -0.62, 0] }],
      },
      // held low, point forward; up on guard while the main weapon strikes
      dagger: {
        idle: [{ t: 0, ho: [0.05, -0.06, -15] }, { t: 0.5, ho: [0.05, -0.045, -13] }, { t: 1, ho: [0.05, -0.06, -15] }],
        attack: [{ t: 0, ho: [0.05, -0.06, -15] }, { t: "pre", ho: [0.02, 0.04, 20] }, { t: "hold", ho: [0.02, 0.04, 20] }, { t: 1, ho: [0.05, -0.06, -15] }],
        hurt: [{ t: 0, ho: [0.05, -0.06, -15] }, { t: 0.2, ho: [0.02, 0.06, 45] }, { t: 1, ho: [0.05, -0.06, -15] }],
        cast: [{ t: 0, ho: [0.05, -0.06, -15] }, { t: 0.25, ho: [0, 0.4, 80] }, { t: 0.75, ho: [0, 0.41, 80] }, { t: 1, ho: [0.05, -0.06, -15] }],
        dead: [{ t: 0, ho: [0.05, -0.06, -15] }, { t: 0.3, ho: [-0.05, 0.05, 20] }, { t: 1, ho: [0.1, -0.64, 0] }],
      },
    }
    // a dagger's own strikes (after Lost Castle's DB_*): the back hand keeps its set's guard (filled in from idle)
    const OFF_ACTIONS = {
      // a quick stab from the front hand
      "off:stab": {
        dur: 420, hit: 150, lunge: true, tip: "off", own: true,
        keys: [
          { t: 0, a: { ho: [0.05, -0.06, -15] } },
          { t: 80, e: "out", a: { body: -6, ho: [-0.04, 0.02, 5] }, x: -0.02 },
          { t: 150, e: "in", a: { body: 12, ho: [0.38, 0.06, -5] }, x: 0.06 },
          { t: 300, a: { body: 10, ho: [0.37, 0.06, -5] }, x: 0.055 },
          { t: 420, a: { ho: [0.05, -0.06, -15] } },
        ],
      },
      // a slash from high to low
      "off:slash": {
        dur: 480, hit: 200, lunge: true, tip: "off", own: true,
        keys: [
          { t: 0, a: { ho: [0.05, -0.06, -15] } },
          { t: 110, e: "out", a: { body: -8, ho: [0.1, 0.3, 70] }, y: 0.02 },
          { t: 200, e: "in", a: { body: 14, ho: [0.35, 0, -60] }, x: 0.05 },
          { t: 360, a: { body: 12, ho: [0.34, 0, -61] }, x: 0.045 },
          { t: 480, a: { ho: [0.05, -0.06, -15] } },
        ],
      },
    }
    // an off-hand track's keys in ms for one action (cached per action and off hand)
    const trackCache = new WeakMap()
    function offPose(off, name, act, at) {
      const cls = name === "idle" ? "idle" : name === "hurt" ? "hurt" : name === "cast" ? "cast" : name === "dead" ? "dead" : "attack"
      const tr = OFF_TRACKS[off]?.[cls]
      if (!tr || act.own) return null
      let per = trackCache.get(act)
      if (!per) trackCache.set(act, (per = {}))
      if (!per[off]) {
        const hit = act.hit ?? act.dur * 0.5
        const T = { pre: hit * 0.6, hit, hold: hit + (act.dur - hit) * 0.5 }
        per[off] = { keys: tr.map(k => ({ t: typeof k.t === "string" ? T[k.t] : k.t * act.dur, a: { ho: k.ho } })) }
      }
      return sample(per[off], at).a.ho
    }
    const actionOf = (kind, name) => ACTIONS[kind]?.[name] || OFF_ACTIONS[name] || null
    // a player's actions are its grip style's set ("player:bow" …), the sword's ("player") for styles without one yet
    const playerKind = u => {
      const g = gripOf(u.items?.main_hand || u.items?.two_hand ? u.items : null)
      if (g === "spear" && offOf(u.items?.off_hand) === "shield") return "player:spear:shield"
      return ACTIONS["player:" + g] ? "player:" + g : "player"
    }
    const EASE = {
      linear: p => p,
      in: p => p * p * p,
      out: p => 1 - Math.pow(1 - p, 3),
      inout: p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    }
    // a part's value: degrees, or [forward, up, degrees] for a floating hand (its move from rest in body heights)
    const vec = v => (Array.isArray(v) ? v : [0, 0, v || 0])
    const mix = (a, b, p) => (Array.isArray(a) || Array.isArray(b) ? vec(a).map((x, i) => lerp(x, vec(b)[i], p)) : lerp(a || 0, b || 0, p))
    // the pose of an action at time t: { a: { part: degrees | [forward, up, degrees] }, x, y, r }
    function sample(act, t) {
      const keys = act.keys
      if (!keys?.length) return { a: {}, x: 0, y: 0 }
      if (t <= keys[0].t) return { a: { ...keys[0].a }, x: keys[0].x || 0, y: keys[0].y || 0, r: keys[0].r || 0 }
      for (let k = 1; k < keys.length; k++) {
        const b = keys[k]
        if (t > b.t) continue
        const a = keys[k - 1]
        const p = (EASE[b.e] || EASE.inout)(b.t > a.t ? (t - a.t) / (b.t - a.t) : 1)
        const out = { a: {}, x: lerp(a.x || 0, b.x || 0, p), y: lerp(a.y || 0, b.y || 0, p), r: lerp(a.r || 0, b.r || 0, p) }
        for (const n of new Set([...Object.keys(a.a), ...Object.keys(b.a)])) out.a[n] = mix(a.a[n], b.a[n], p)
        return out
      }
      const z = keys[keys.length - 1]
      return { a: { ...z.a }, x: z.x || 0, y: z.y || 0, r: z.r || 0 }
    }

    let P, F, app, host, world, scene, back, bg, decalLayer, lights, unitsLayer, smokeLayer, shotLayer, fxLayer, partLayer, textLayer, bloom, glowLayer
    // how pieces are taken down: with their children, and each drawn shape with its context (PixiJS 8 frees a
    // Graphics' context, its geometry and its GPU buffers only when destroy gets no options or context: true;
    // { children: true } alone left them all behind, a few MB more with every set-up until the GPU gave out and the
    // whole page went white for a moment). Shared textures are kept.
    const GONE = { children: true, context: true }
    // a body part or a held piece is drawn big and shown small (a 280 px weapon at 40 px on a phone): with mipmaps (the
    // GPU's own smaller copies) it stays clean instead of breaking up into a few picked pixels; not for the effects'
    // own textures and buffers, which are drawn near their size or redrawn every frame
    const loadMip = url => P.Assets.load({ src: url, data: { autoGenerateMipmaps: true } })
    const mipTex = c => new P.Texture({ source: new P.CanvasSource({ resource: c, autoGenerateMipmaps: true }) })
    // what it shows: { units, loc(), tier(), live } (the lab's sandbox, or the real battle laid over the game's cards)
    let source = null
    let resizer = null
    let loading = null
    let starting = false
    let units = { p: [], m: [] }
    let dot, glow, smokeTex, streakTex, rayTex, hazeTex, leafTex, pillarTex
    let shock = null
    // filters on the whole scene (shockwave, heat haze, zoom blur), each running for a while; the numbers and names
    // over it stay sharp
    const worldFx = new Set()
    const setWorldFx = () => scene && (scene.filters = worldFx.size ? [...worldFx] : null)
    // heat haze only bends what is behind the flames (ground, bodies, smoke), never the effects themselves
    const hazeFx = new Set()
    const setHazeFx = () => back && (back.filters = hazeFx.size ? [...hazeFx] : null)
    let shake = 0
    let punch = 0
    let dim = 0
    const tweens = []
    const parts = []
    // the arena's clock: real time, slowed for a slow-motion beat (slow()); everything animated reads it
    let clock = performance.now()
    let slowUntil = 0
    let slowK = 1
    const now = () => clock
    // the camera leans in on a point for a moment (focusOn) on top of the punch
    let focus = null
    const later = (ms, f) => tweens.push({ t0: now() + ms, dur: 0, f: () => f() })
    const tween = (dur, f, delay = 0) => tweens.push({ t0: now() + delay, dur, f })
    const lerp = (a, b, p) => a + (b - a) * p
    const ease = p => 1 - (1 - p) * (1 - p)

    function loadScript(src, integrity) {
      return new Promise((ok, fail) => {
        const s = document.createElement("script")
        s.src = src
        if (integrity) {
          s.integrity = integrity
          s.crossOrigin = "anonymous"
        }
        s.onload = ok
        s.onerror = () => fail(new Error(src))
        document.head.appendChild(s)
      })
    }
    async function libs() {
      const load = async ([path, hash]) => {
        for (let k = 0; ; k++)
          try {
            return await loadScript(LIB_HOSTS[k] + path, hash)
          } catch (e) {
            if (k === LIB_HOSTS.length - 1) throw e
          }
      }
      if (!W.PIXI?.Application) await load(LIBS[0])
      if (!W.PIXI?.filters) await load(LIBS[1])
      P = W.PIXI
      F = W.PIXI.filters
    }
    function canvasTex(size, paint) {
      const c = document.createElement("canvas")
      c.width = c.height = size
      paint(c.getContext("2d"), size)
      return P.Texture.from(c)
    }
    function stripTex(w, h, paint) {
      const c = document.createElement("canvas")
      c.width = w
      c.height = h
      paint(c.getContext("2d"), w, h)
      return P.Texture.from(c)
    }
    const radial = (stops, size) =>
      canvasTex(size, (c, s) => {
        const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
        stops.forEach(([o, col]) => g.addColorStop(o, col))
        c.fillStyle = g
        c.fillRect(0, 0, s, s)
      })

    async function open(view, from) {
      if (from) source = from
      // a guild trial: the whole roster in formation, its camera moved by hand (the class gives the zoom buttons, the
      // grab cursor, and touch dragging that doesn't scroll the page)
      view.classList.toggle("bfx-guild", !!source?.guild)
      if (host === view && app) return
      host = view
      setView(1, 0, 0)
      if (app) {
        app.resizeTo = view
        resizer?.observe(view)
        view.appendChild(app.canvas)
        app.ticker.start()
        return sync()
      }
      // (asked again while PixiJS loads, as the page is checked every second: the one start under way takes it; a second
      // start made a second application, each one more drawing every frame)
      if (starting) return
      starting = true
      view.textContent = "载入 PixiJS…"
      try {
        loading = loading || libs()
        await loading
      } catch (e) {
        loading = null
        starting = false
        view.textContent = "PixiJS 载入失败：" + e.message
        return
      }
      view.textContent = ""
      app = new P.Application()
      await app.init({ resizeTo: view, backgroundColor: 0x10142a, antialias: true, resolution: Math.max(1, Math.min(3, (devicePixelRatio || 1) * (view.clientWidth ? view.getBoundingClientRect().width / view.clientWidth : 1))), autoDensity: true, preference: "webgl" })
      view.appendChild(app.canvas)
      dot = radial([[0, "rgba(255,255,255,1)"], [0.35, "rgba(255,255,255,.8)"], [1, "rgba(255,255,255,0)"]], 32)
      glow = radial([[0, "rgba(255,255,255,.9)"], [0.4, "rgba(255,255,255,.35)"], [1, "rgba(255,255,255,0)"]], 256)
      // a soft lumpy puff (several overlapping blobs) for smoke and dust
      smokeTex = canvasTex(96, (c, n) => {
        for (let k = 0; k < 7; k++) {
          const x = n * (0.3 + Math.random() * 0.4)
          const y = n * (0.3 + Math.random() * 0.4)
          const r = n * (0.18 + Math.random() * 0.14)
          const g = c.createRadialGradient(x, y, 0, x, y, r)
          g.addColorStop(0, "rgba(255,255,255,.55)")
          g.addColorStop(1, "rgba(255,255,255,0)")
          c.fillStyle = g
          c.fillRect(0, 0, n, n)
        }
      })
      // a column of light: brightest at its foot and along its middle, fading up and out to the sides
      pillarTex = (() => {
        const c = document.createElement("canvas")
        c.width = 64
        c.height = 256
        const x = c.getContext("2d")
        const im = x.createImageData(64, 256)
        for (let y = 0; y < 256; y++)
          for (let i = 0; i < 64; i++) {
            const v = Math.pow(y / 255, 1.4) * Math.pow(Math.max(0, 1 - Math.abs(i - 31.5) / 32), 1.6)
            const o = (y * 64 + i) * 4
            im.data[o] = im.data[o + 1] = im.data[o + 2] = 255
            im.data[o + 3] = Math.round(255 * v)
          }
        x.putImageData(im, 0, 0)
        return P.Texture.from(c)
      })()
      // a leaf / petal: a pointed oval with a paler midrib
      leafTex = canvasTex(32, (c, n) => {
        c.fillStyle = "#fff"
        c.beginPath()
        c.moveTo(n * 0.08, n / 2)
        c.quadraticCurveTo(n / 2, n * 0.12, n * 0.92, n / 2)
        c.quadraticCurveTo(n / 2, n * 0.88, n * 0.08, n / 2)
        c.fill()
        c.strokeStyle = "rgba(255,255,255,.5)"
        c.lineWidth = 1.5
        c.beginPath()
        c.moveTo(n * 0.15, n / 2)
        c.lineTo(n * 0.85, n / 2)
        c.stroke()
      })
      // a spark streak (bright head on the right, long fading tail), and a light ray (a thin taper)
      streakTex = stripTex(64, 8, (c, w, h) => {
        const g = c.createLinearGradient(0, 0, w, 0)
        g.addColorStop(0, "rgba(255,255,255,0)")
        g.addColorStop(0.8, "rgba(255,255,255,.9)")
        g.addColorStop(1, "rgba(255,255,255,1)")
        c.fillStyle = g
        c.beginPath()
        c.moveTo(0, h / 2)
        c.lineTo(w * 0.85, 0)
        c.lineTo(w, h / 2)
        c.lineTo(w * 0.85, h)
        c.fill()
      })
      rayTex = stripTex(128, 16, (c, w, h) => {
        const g = c.createLinearGradient(0, 0, w, 0)
        g.addColorStop(0, "rgba(255,255,255,1)")
        g.addColorStop(1, "rgba(255,255,255,0)")
        c.fillStyle = g
        c.beginPath()
        c.moveTo(0, 0)
        c.lineTo(w, h / 2)
        c.lineTo(0, h)
        c.fill()
      })
      // heat haze: a displacement map (grey = no shift) of wavy noise that fades to grey at the edges
      hazeTex = canvasTex(128, (c, n) => {
        const im = c.createImageData(n, n)
        for (let y = 0; y < n; y++)
          for (let x = 0; x < n; x++) {
            const d = Math.min(1, Math.hypot(x - n / 2, y - n / 2) / (n / 2))
            const fall = Math.max(0, 1 - d * d)
            const i = (y * n + x) * 4
            im.data[i] = 128 + 110 * fall * Math.sin(x * 0.35 + Math.sin(y * 0.21) * 2)
            im.data[i + 1] = 128 + 110 * fall * Math.sin(y * 0.42 + Math.cos(x * 0.17) * 2)
            im.data[i + 2] = 128
            im.data[i + 3] = 255
          }
        c.putImageData(im, 0, 0)
      })
      world = new P.Container()
      bg = new P.Sprite()
      lights = new P.Container()
      unitsLayer = new P.Container()
      unitsLayer.sortableChildren = true
      shotLayer = new P.Container()
      fxLayer = new P.Container()
      partLayer = new P.Container()
      textLayer = new P.Container()
      lights.blendMode = fxLayer.blendMode = partLayer.blendMode = "add"
      bloom = new F.AdvancedBloomFilter({ threshold: 0.45, bloomScale: 1, brightness: 1, blur: 8, quality: 6 })
      bloom.blendMode = "add"
      // (one bloom over the effects and the particles together: a filter is a pass over the whole stage, two of them
      // cost twice the one)
      glowLayer = new P.Container()
      glowLayer.addChild(fxLayer, partLayer)
      glowLayer.blendMode = "add"
      glowLayer.filters = [bloom]
      // ground marks (scorches, cracks, spent arrows) under everyone; smoke over the bodies, not glowing
      decalLayer = new P.Container()
      smokeLayer = new P.Container()
      scene = new P.Container()
      back = new P.Container()
      back.addChild(bg, decalLayer, lights, unitsLayer, smokeLayer)
      scene.addChild(back, shotLayer, glowLayer)
      world.addChild(scene, textLayer)
      app.stage.addChild(world)
      setFxAlpha()
      warmUp()
      app.ticker.add(frame)
      camera(app.canvas)
      // (the canvas follows its box whenever the box changes size: PixiJS's own resizeTo only listens for the window's
      // resize event, and the game lays its battle panel out by itself, before or after that event or without one)
      resizer = new ResizeObserver(() =>
        requestAnimationFrame(() => {
          if (!app || !host) return
          if (app.screen.width !== host.clientWidth || app.screen.height !== host.clientHeight) app.renderer.resize(host.clientWidth, host.clientHeight)
          sharp()
          layout()
        }),
      )
      resizer.observe(view)
      starting = false
      // (closed, or moved to another view, while PixiJS was loading)
      if (host !== view) {
        const next = host
        host = view
        close()
        return next && open(next)
      }
      sync()
    }

    // ----- scene -----
    // taken off the page (the real battle left, the lab closed, the old stage chosen): stopped until opened again
    function close(view) {
      if (view && host !== view) return
      host = null
      if (!app) return
      app.ticker.stop()
      app.canvas.remove()
    }
    const liveOn = () => !!(app && source?.live && host?.isConnected)
    // a new wave (or a new battle): everyone set up again from the battle's units
    function newBattle(U) {
      if (U && source?.units !== U) return
      sideAuras.m = {}
      statuses.m = {}
      if (liveOn()) sync()
    }
    // not on screen (the browser tab in the background, another game tab open): nothing is played, or it would all
    // be queued on the stopped clock and go off at once on coming back; set up again from the battle as it is then
    let stale = false
    const onScreen = () => !document.hidden && !!host?.offsetParent
    function freshen() {
      if (!stale || !onScreen()) return
      stale = false
      sync()
    }
    // the real battle's actions: its line-up first brought up to date (a unit joined, a wave came in)
    // (U: the battle they come from, the own one or a guild trial: only the one on the stage is played)
    function playLive(actions, U = source?.units) {
      if (!liveOn() || source.units !== U) return
      if (!onScreen()) return void (stale = true)
      if (stale) return freshen()
      if (["p", "m"].some(side => units[side].length !== U[side].length || units[side].some((a, i) => a.u !== U[side][i]))) sync()
      try {
        play(actions)
      } catch (e) {
        console.warn("[战斗动画] arena", e)
      }
    }
    // the badge in the corner, as the old stage's: where we fight and the difficulty tier (coloured by band)
    let locEl = null
    function setLoc() {
      if (!host || !source) return
      if (!locEl) {
        locEl = document.createElement("div")
        locEl.className = "bfx-loc"
      }
      if (locEl.parentElement !== host) host.appendChild(locEl)
      const title = id => (zhUI() && ZONE_ZH[id]) || (id || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
      let text = ""
      let tier = null
      if (!source.live) (text = title(source.loc())), (tier = source.tier())
      else if (source.guild) {
        const bosses = [...new Set(source.units.m.map(u => nameOf("m", u)).filter(Boolean))]
        text = L("公会试炼", "Guild Trial") + (bosses.length ? " · " + bosses.join(" / ") : "")
        tier = source.tier()
      } else if (where.labyrinth) text = L("迷宫", "Labyrinth") + (where.floor ? L(` · 第${where.floor}层`, ` · Floor ${where.floor}`) : "")
      else {
        const zone = where.zone && ZONE_ZH[where.zone] ? where.zone : stageLocation()
        text = zone ? title(zone) : ""
        tier = where.tier ?? null
      }
      locEl.style.display = text ? "" : "none"
      locEl.textContent = text
      if (text && tier != null) {
        const b = document.createElement("b")
        b.textContent = " T" + tier
        b.style.color = tier >= 4 ? "#ff6a5a" : tier >= 2 ? "#ffcf5a" : "#cfe0ff"
        locEl.appendChild(b)
      }
    }
    function background() {
      if (!app || !source) return
      setLoc()
      const loc = source.loc()
      const t = source.tier()
      const band = t >= 4 ? "__nightmare" : t >= 2 ? "__elite" : ""
      const name = Assets.has("bg", loc + band) ? loc + band : Assets.has("bg", loc) ? loc : null
      if (name) P.Assets.load(Assets.url("bg/" + name + ".webp")).then(tex => ((bg.texture = tex), layout()))
    }
    let syncing = 0
    // a unit taken down with its GPU filters (its body shader, buff glows, enhancement glows): left behind, every
    // set-up again would pile more of them up until the WebGL context gives out
    function teardown(a) {
      const fs = new Set([a.filter])
      a.cont.destroy(GONE)
      for (const f of fs) f?.destroy?.()
    }
    // every effect still on the stage finished at once and swept away (its last step is what removes it: an effect
    // left half way, or whose unit is gone, would stay on the stage for good)
    function clearFx() {
      for (const w of tweens.splice(0))
        if (w.dur)
          try {
            w.f(1)
          } catch (e) {}
      for (const q of parts.splice(0)) q.s.destroy()
      for (const layer of [fxLayer, shotLayer, partLayer, textLayer, lights, decalLayer, smokeLayer])
        for (const c of layer.removeChildren()) if (c !== trailG) c.destroy(GONE)
      if (trailG) fxLayer.addChild(trailG)
      worldFx.clear()
      setWorldFx()
      hazeFx.clear()
      setHazeFx()
      shock = null
      focus = null
      slowUntil = 0
      punch = shake = dim = 0
    }
    async function sync() {
      if (!app || !source) return
      settle()
      const run = ++syncing
      // (put in here, not on opening: the first opening's "载入 PixiJS…" text replaces what the view holds)
      if (source.guild) zoomButtons(host)
      background()
      clearFx()
      for (const side of ["p", "m"]) {
        units[side].forEach(teardown)
        units[side] = []
      }
      for (const side of ["p", "m"]) source.units[side].forEach((u, i) => units[side].push(makeUnit(side, i, u)))
      layout()
      for (const side of ["p", "m"])
        for (const a of units[side]) {
          const r = await (side === "p" ? loadPlayerRig(a.u) : loadRig(a.kind)).catch(e => console.warn("[动画测试] rig", a.kind, e))
          if (run !== syncing) return
          if (r) buildRig(a, r)
          else if (side === "m") {
            const f = await loadFlat(a.kind)
            if (run !== syncing) return
            buildFlat(a, f)
          }
        }
    }
    const DUNGEON_ZONES = new Set(["chimerical_den", "enchanted_fortress", "pirate_cove", "sinister_circus"])
    function tierOfU(u) {
      const own = u?.raw?.difficultyTier
      if (typeof own === "number") return own
      if (!source?.live || source.guild) return source?.tier() ?? null
      return where.labyrinth || DUNGEON_ZONES.has(where.zone) ? null : where.tier ?? null
    }
    function makeUnit(side, i, u) {
      const a = { side, i, u, kind: side === "p" ? playerKind(u) : (u.hrid || "").split("/").pop(), off: side === "p" ? (gripOf(u.items) === "sai" ? "dagger" : offOf(u.items?.off_hand)) : "", dead: u.hp <= 0, hp: u.hp, maxHp: u.maxHp, jig: 0, dash: 0, act: null, life: 0 }
      a.cont = new P.Container()
      // (at the screen's density: a filter draws its object at 1x by default, soft on a phone's 3x screen)
      a.filter = P.Filter.from({
        resolution: "inherit",
        gl: { vertex: F.vertex, fragment: FRAG, name: "bfx-body" },
        resources: { u: { uFlash: { value: 0, type: "f32" }, uColor: { value: new Float32Array([1, 1, 1]), type: "vec3<f32>" }, uDis: { value: a.dead ? 1 : 0, type: "f32" }, uSeed: { value: Math.random() * 50, type: "f32" } } },
      })
      a.uni = a.filter.resources.u.uniforms
      a.shadow = new P.Sprite(dot)
      a.shadow.anchor.set(0.5)
      a.shadow.tint = 0x000000
      a.shadow.alpha = 0.45
      a.hpBar = new P.Graphics()
      // (a monster by its Chinese name on a Chinese page, as the old stage does)
      // the HUD under the feet, as on the old stage: status chips, the name (a monster's tier after it), the HP bar with
      // its numbers, the MP bar
      a.hud = new P.Container()
      a.label = new P.Text({ text: nameOf(side, u), style: { fontFamily: "sans-serif", fontSize: 11, fontWeight: "700", fill: "#eef2ff", stroke: { color: "#000", width: 3 } } })
      a.label.anchor.set(0.5, 0)
      const tier = side === "m" ? tierOfU(u) : null
      a.tierT = new P.Text({ text: tier != null ? " T" + tier : "", style: { fontFamily: "sans-serif", fontSize: 11, fontWeight: "700", fill: tier >= 4 ? "#ff6a5a" : tier >= 2 ? "#ffcf5a" : "#cfe0ff", stroke: { color: "#000", width: 3 } } })
      a.tierT.anchor.set(0, 0)
      const numStyle = { fontFamily: "sans-serif", fontSize: 8, fontWeight: "700", fill: "#ffffff", stroke: { color: "#000", width: 2.5 } }
      a.hpT = new P.Text({ text: "", style: numStyle })
      a.hpT.anchor.set(0.5, 0.5)
      a.mpT = new P.Text({ text: "", style: numStyle })
      a.mpT.anchor.set(0.5, 0.5)
      a.chips = new P.Container()
      a.chipKey = ""
      // aura rings under the feet, a shield bubble over the body
      a.rings = new P.Graphics()
      a.over = new P.Graphics()
      a.hud.addChild(a.chips, a.label, a.tierT, a.hpBar, a.hpT, a.mpT)
      a.cont.addChild(a.rings, a.shadow, a.hud, a.over)
      unitsLayer.addChild(a.cont)
      return a
    }
    function layout() {
      if (!app) return
      const W2 = app.screen.width
      const H = app.screen.height
      if (bg.texture && bg.texture !== P.Texture.EMPTY) {
        const k = Math.max(W2 / bg.texture.width, H / bg.texture.height)
        bg.scale.set(k)
        bg.position.set((W2 - bg.texture.width * k) / 2, (H - bg.texture.height * k) * 0.85)
      }
      // sized and placed as on the old stage: a box per unit by the head count (unitSize), a monster's 400 px pose frame
      // drawn at 1.375 boxes (its 512 px cell fills the box), a player's box three quarters of that and filled by the
      // figure; each side in a row on one ground line, the first nearest the middle, every other one a step back
      const ground = Math.min(H * 0.84, H - 40) // (the HUD, with its MP numbers, fits under it)
      const formed = source?.guild ? formation(W2, H, ground) : null
      for (const side of ["p", "m"])
        units[side].forEach((a, i, all) => {
          const n = all.length
          const box = side === "p" && formed ? formed.box : unitSize(W2, H, n) * cfg.scale * (side === "p" ? 0.75 : 1)
          const step = n > 1 ? Math.min(box * 0.78, (W2 * 0.44 - box) / (n - 1)) : 0
          a.h = side === "p" ? box * 1.08 : ((a.rig?.def.h || 220) * box * 1.375) / 400
          a.x0 = side === "p" ? W2 * 0.46 - box / 2 - i * step : W2 * 0.54 + box / 2 + i * step
          a.y0 = ground - (i % 2) * H * 0.035
          if (side === "p" && formed) [a.x0, a.y0] = formed.at.get(a)
          a.dir = side === "p" ? 1 : -1
          a.cont.position.set(a.x0, a.y0)
          a.cont.zIndex = a.y0
          a.shadow.width = a.h * 0.6
          a.shadow.height = a.h * 0.12
          a.box = box
          a.label.position.set(-a.tierT.width / 2, 2)
          a.tierT.position.set(a.label.x + a.label.width / 2, 2)
          a.hudKey = ""
          drawHp(a)
          if (a.rig) rigScale(a)
          if (a.flat) a.flat.k = 0
        })
      hudSize()
    }
    // the guild trial's formation (as the old stage's guildLayout): tanks in front, then melee, ranged and magic at the
    // back, each group in columns of up to `rows`, back rows higher and a little to the left; as many rows as make the
    // units biggest while the formation fits the left half across and about 60% of the height
    function formation(SW, SH, ground) {
      const list = units.p
      const groups = ROLE_ORDER.map(r => list.filter(a => roleOf(a.u) === r)).filter(g => g.length)
      let rows = 1
      let s = 0
      for (let r = 1; r <= Math.min(8, list.length); r++) {
        const cols = groups.reduce((c, g) => c + Math.ceil(g.length / r), 0)
        const size = Math.min(SH * 0.4, (SW * 0.44) / (cols * 0.68 + (groups.length - 1) * 0.3 + 0.15 * (r - 1) + 0.9), (SH * 0.62) / (1 + 0.34 * (r - 1)))
        if (size > s * 1.02) (s = size), (rows = r)
      }
      s *= cfg.scale
      const at = new Map()
      let col = 0
      for (const g of groups) {
        g.forEach((a, k) => {
          const c = col + Math.floor(k / rows)
          const r = k % rows
          at.set(a, [SW * 0.46 - s / 2 - c * s * 0.68 - r * s * 0.15, ground - r * s * 0.34])
        })
        col += Math.ceil(g.length / rows) + 0.3
      }
      return { box: s * 0.8, at }
    }
    // a crowd (a guild trial of more than 12): fewer particles, no slow motion, camera moves, dimming, screen
    // ripples, skill names or weapon glows, and no HP / MP numbers on the players
    const crowd = () => !!source?.guild && units.p.length > 12
    // names only while the players are big enough on screen to carry them (the camera zoom enlarges both together)
    function hudSize() {
      const many = crowd()
      for (const a of units.p) {
        a.hpT.visible = a.mpT.visible = !many
        a.label.visible = !many || (a.box || 0) * view.z >= 60
      }
    }
    // ----- the guild trial's camera: the wheel zooms about the cursor, a drag pans, a double click (or ⟲) resets -----
    const view = { z: 1, x: 0, y: 0 }
    function setView(z, x, y) {
      if (!app) return
      const SW = app.screen.width
      const SH = app.screen.height
      view.z = Math.max(1, Math.min(4, z))
      view.x = Math.min(0, Math.max(SW - SW * view.z, x))
      view.y = Math.min(0, Math.max(SH - SH * view.z, y))
      app.stage.scale.set(view.z)
      app.stage.position.set(view.x, view.y)
      hudSize()
    }
    const zoomAt = (f, mx, my) => {
      const z = Math.max(1, Math.min(4, view.z * f))
      setView(z, mx - ((mx - view.x) / view.z) * z, my - ((my - view.y) / view.z) * z)
    }
    function camera(cv) {
      const on = () => !!source?.guild && host?.contains(cv)
      const at = e => {
        const r = cv.getBoundingClientRect()
        return [e.clientX - r.left, e.clientY - r.top]
      }
      cv.addEventListener(
        "wheel",
        e => {
          if (!on()) return
          e.preventDefault()
          zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, ...at(e))
        },
        { passive: false },
      )
      // (two fingers pinch, one drags)
      const touches = new Map()
      let drag = null
      let pinch = null
      cv.addEventListener("pointerdown", e => {
        if (!on() || (e.pointerType === "mouse" && e.button !== 0)) return
        touches.set(e.pointerId, at(e))
        try {
          cv.setPointerCapture(e.pointerId)
        } catch (err) {}
        const pts = [...touches.values()]
        if (pts.length === 2) {
          drag = null
          pinch = { d: Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]) || 1, z: view.z }
        } else if (pts.length === 1) drag = { p: pts[0], vx: view.x, vy: view.y }
      })
      cv.addEventListener("pointermove", e => {
        if (!touches.has(e.pointerId)) return
        touches.set(e.pointerId, at(e))
        const pts = [...touches.values()]
        if (pinch && pts.length >= 2) {
          const d = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1])
          zoomAt((pinch.z * d) / pinch.d / view.z, (pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2)
        } else if (drag) setView(view.z, drag.vx + pts[0][0] - drag.p[0], drag.vy + pts[0][1] - drag.p[1])
      })
      const up = e => {
        touches.delete(e.pointerId)
        if (touches.size < 2) pinch = null
        drag = null
      }
      cv.addEventListener("pointerup", up)
      cv.addEventListener("pointercancel", up)
      cv.addEventListener("dblclick", () => on() && setView(1, 0, 0))
    }
    function zoomButtons(view2) {
      if (view2.querySelector(".bfx-zoom")) return
      const z = document.createElement("div")
      z.className = "bfx-zoom"
      z.innerHTML = '<button data-z="1.4">+</button><button data-z="0.714">−</button><button data-z="0">⟲</button>'
      z.addEventListener("click", e => {
        e.stopPropagation()
        const f = +e.target.closest("button")?.dataset.z
        if (!app) return
        if (f === 0) setView(1, 0, 0)
        else if (f) zoomAt(f, app.screen.width / 2, app.screen.height / 2)
      })
      view2.appendChild(z)
    }
    function drawHp(a) {
      // (redrawn only when something on it changed: the MP is read from the battle's unit each frame)
      const mp = a.u.mp ?? 0
      const maxMp = a.u.maxMp || 1
      const key = [a.dead, a.hp, a.maxHp, mp, maxMp, a.box].join()
      if (key === a.hudKey) return
      a.hudKey = key
      a.hud.visible = !a.dead
      const w = Math.min((a.box || a.h) * 0.84, 140)
      const g = a.hpBar
      g.clear()
      // (tall enough to carry their numbers)
      const bar = (y, f, c1) => {
        g.roundRect(-w / 2 - 1, y - 1, w + 2, 9, 2).fill({ color: 0x000000, alpha: 0.6 })
        if (f > 0) g.roundRect(-w / 2, y, w * Math.min(1, f), 7, 2).fill(c1)
      }
      bar(16, Math.max(0, a.hp) / (a.maxHp || 1), 0xd93b3b)
      bar(25, mp / maxMp, 0x2f6fd9)
      // (a crowd's players carry none: a number redrawn is a new texture)
      if (!a.hpT.visible) return
      a.hpT.text = `${fmt(Math.max(0, a.hp))}/${fmt(a.maxHp)}`
      a.hpT.position.set(0, 19.5)
      a.mpT.text = `${fmt(mp)}/${fmt(maxMp)}`
      a.mpT.position.set(0, 28.5)
    }

    // ----- rigs (assets/rig/<id>/rig.json): parts on joints -----
    // rig.json: foot = the ground point under the body, h = body height, face = "right" for player art (monsters face
    // left), parts { img, pivot (in the part image), at (where that pivot sits in the assembled body), z, parent, rot?, scale? }
    const rigs = {} // monster id -> Promise<{ def, tex }>
    function loadRig(id) {
      if (!Assets.has("rig", id)) return Promise.resolve(null)
      if (!rigs[id])
        rigs[id] = (async () => {
          const def = await (await fetch(Assets.url(`rig/${id}/rig.json`))).json()
          if (def.tmpl) monsterActions(id, def)
          const tex = {}
          for (const [n, q] of Object.entries(def.parts)) tex[n] = await loadMip(Assets.url(`rig/${id}/${q.img}`))
          return { def, tex }
        })().catch(e => {
          delete rigs[id]
          throw e
        })
      return rigs[id]
    }
    // a pole weapon (staff, trident, spear) is the game's own item icon: a straight pole drawn on the diagonal, the same
    // from any side (the paper-doll ones were drawn with breaks and kinks). Rendered from the items sprite sheet at
    // 2x into a canvas; its axis runs from the lowest-left pixel (butt) to the highest-right one (head).
    const iconTex = {}
    let itemsSvg = null
    // game icons drawn the other way round, or holding two weapons (cut apart: keep = [line, half width] of the one
    // kept, drop = [line, half width] of the other, core = the kept one's own half width where they cross; axis = butt → head)
    const ICON_FLIP = new Set(["gobo_boomstick"])
    const ICON_CUT = { gobo_stabber: { keep: [3, 48.3, 27.5, 5, 9.7], drop: [48.7, 37, 13, 2, 8.7], core: 1.05, axis: [3, 48.3, 27.5, 5] } }
    // unstrung: a bow without its string (the straight two-point paths between its ends), its axis along where the
    // string ran (the stage draws the string itself)
    async function gameIcon(id, unstrung = false) {
      const key = unstrung ? id + "|bare" : id
      if (iconTex[key] !== undefined) return iconTex[key]
      const url = Stage.sheet("items")
      if (!url) return null
      try {
        itemsSvg = itemsSvg || new DOMParser().parseFromString(await (await fetch(url)).text(), "image/svg+xml")
        const sym = itemsSvg.getElementById(id)
        if (!sym) return (iconTex[key] = null)
        const N = 560
        // everything it refers to (gradients, clip paths, shared shapes: url(#id) / href="#id"), wherever the sheet keeps it
        const refs = new Map()
        const scan = html => {
          for (const m of html.matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g)) {
            const rid = m[1] || m[2]
            if (refs.has(rid)) continue
            const el = itemsSvg.getElementById(rid)
            refs.set(rid, el ? el.outerHTML : "")
            if (el) scan(el.outerHTML)
          }
        }
        scan(sym.outerHTML)
        const defs = "<defs>" + [...refs.values()].join("") + "</defs>"
        // the symbol's own paint (fill="none" on it: paths without a fill of their own would turn black)
        const attrs = [...sym.attributes].filter(x => !/^(id|viewBox|xmlns.*)$/.test(x.name)).map(x => `${x.name}="${x.value}"`).join(" ")
        let inner = sym.innerHTML
        let line = null
        if (unstrung)
          inner = inner.replace(/<path d="M\s*(-?[\d.]+)[ ,]+(-?[\d.]+)[ ,]*(?:L\s*)?(-?[\d.]+)[ ,]+(-?[\d.]+)\s*"[^>]*?(?:\/>|><\/path>)/g, (m, a, b, c, d) => ((line ||= [+a, +b, +c, +d]), ""))
        if (unstrung && !line) return (iconTex[key] = null)
        const vb = (sym.getAttribute("viewBox") || "0 0 100 100").split(/[ ,]+/).map(Number)
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${vb.join(" ")}" width="${N}" height="${N}">${defs}<g ${attrs}>${inner}</g></svg>`
        const img = new Image()
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg)
        await img.decode()
        const c = document.createElement("canvas")
        c.width = c.height = N
        const g = c.getContext("2d")
        g.drawImage(img, 0, 0, N, N)
        const px = g.getImageData(0, 0, N, N).data
        let lo = [0, 0, Infinity]
        let hi = [0, 0, -Infinity]
        for (let y = 0; y < N; y += 2)
          for (let x = 0; x < N; x += 2)
            if (px[(y * N + x) * 4 + 3] > 128) {
              const t = x - y
              if (t < lo[2]) lo = [x, y, t]
              if (t > hi[2]) hi = [x, y, t]
            }
        const cut = ICON_CUT[id]
        if (cut) {
          // keep the pixels near one line (and off another), in icon units (viewBox 0..50)
          const q = N / 50
          const near = (x, y, [ax, ay, bx, by]) => {
            const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy)
            const t = ((x - ax) * dx + (y - ay) * dy) / L / L
            return t < -0.05 || t > 1.05 ? Infinity : Math.abs((x - ax) * dy - (y - ay) * dx) / L
          }
          const im = g.getImageData(0, 0, N, N)
          for (let y = 0; y < N; y++)
            for (let x = 0; x < N; x++) {
              const d1 = near(x / q, y / q, cut.keep)
              const d2 = near(x / q, y / q, cut.drop)
              if (!(d1 < cut.keep[4] && (d2 > cut.drop[4] || d1 < cut.core))) im.data[(y * N + x) * 4 + 3] = 0
            }
          g.putImageData(im, 0, 0)
          return (iconTex[key] = { tex: mipTex(c), axis: cut.axis.map(v => v * q), k: 0.5 })
        }
        // the head is at the top right in most icons, the bottom left in a few (ICON_FLIP)
        let axis = ICON_FLIP.has(id) ? [hi[0], hi[1], lo[0], lo[1]] : [lo[0], lo[1], hi[0], hi[1]]
        // (a bow's: the string's two ends, in canvas pixels (the viewBox fitted into the square, centred), lower left first)
        if (line) {
          const sc = N / Math.max(vb[2], vb[3])
          const px = (x, y) => [(x - vb[0]) * sc + (N - vb[2] * sc) / 2, (y - vb[1]) * sc + (N - vb[3] * sc) / 2]
          const A = px(line[0], line[1])
          const B = px(line[2], line[3])
          axis = A[0] - A[1] < B[0] - B[1] ? [...A, ...B] : [...B, ...A]
        }
        return (iconTex[key] = { tex: mipTex(c), axis, k: 0.5 })
      } catch (e) {
        console.warn("[动画测试] icon", id, e)
        return (iconTex[key] = null)
      }
    }
    // a tower shield held out at the foe, seen three-quarters on: its icon's face squeezed to 60 % of its width and a
    // darker copy of it just behind, showing the rim's thickness on the near side; held upright by its middle (the axis
    // runs straight up it)
    const shieldTex = {}
    async function turnedShield(id) {
      if (shieldTex[id] !== undefined) return shieldTex[id]
      const ic = await gameIcon(id)
      if (!ic) return (shieldTex[id] = null)
      const src = ic.tex.source.resource
      const N = src.width
      const px = src.getContext("2d").getImageData(0, 0, N, N).data
      let x0 = N, x1 = 0, y0 = N, y1 = 0
      for (let y = 0; y < N; y += 2)
        for (let x = 0; x < N; x += 2)
          if (px[(y * N + x) * 4 + 3] > 64) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y))
      const w = x1 - x0 + 2
      const h = y1 - y0 + 2
      const fw = Math.round(w * 0.6)
      const t = Math.round(w * 0.09)
      const c = document.createElement("canvas")
      c.width = fw + t
      c.height = h
      const g = c.getContext("2d")
      // the rim: the face's shape, darkened, one thickness nearer
      g.filter = "brightness(0.55)"
      g.drawImage(src, x0, y0, w, h, 0, 0, fw, h)
      g.filter = "brightness(0.7)"
      g.drawImage(src, x0, y0, w, h, t * 0.5, 0, fw, h)
      g.filter = "none"
      g.drawImage(src, x0, y0, w, h, t, 0, fw, h)
      const cx = t + fw / 2
      return (shieldTex[id] = { tex: mipTex(c), grip: [cx, h / 2], axis: [cx, h, cx, 0], k: ic.k })
    }
    // a player: the shared 3/4 battle-view template with this avatar's and outfit's registered layers (body, upper
    // arm, forearm), the paper-doll weapon piece in the fist (turned from the doll's arm angle) and the off-hand behind
    let playerBase = null
    const FULL_OUTFITS = new Set(["halloween_ghost"])
    async function loadPlayerRig(u) {
      if (!Assets.has("rig", "player")) return null
      if (!playerBase)
        playerBase = fetch(Assets.url("rig/player/rig.json"))
          .then(r => r.json())
          .catch(e => ((playerBase = null), Promise.reject(e)))
      const base = await playerBase
      const avatar = base.avatars.includes(u.avatar) ? u.avatar : base.avatars[0]
      const outfit = base.outfits.includes(u.outfit) ? u.outfit : base.outfits[0]
      const def = { ...base, parts: { ...base.parts } }
      const L = n => loadMip(Assets.url(`rig/player/${n}.webp`))
      const tex = {}
      // (an outfit that covers the whole figure, the ghost sheet, is drawn alone: no hair, skin or limbs of the avatar
      // under it to show through)
      const whole = FULL_OUTFITS.has(outfit)
      for (const part of Object.keys(base.parts)) tex[part] = [!whole && (await L(`a_${avatar}_${part}`)), outfit && (await L(`o_${outfit}_${part}`))]
      // the weapon pieces come with the paper-doll index
      for (let k = 0; k < 30 && !Doll.ready(); k++) await new Promise(r => setTimeout(r, 200))
      const piece = async id => {
        // (a refined item drawn as its plain one: the game's refined icon carries a 精 mark)
        id = id && String(id).replace(/_refined$/, "")
        // the game's own icon wherever it is the weapon seen from the side: poles, and swords, maces, bows, the two-handed
        // weapons and the slingshot (crisp from the vector art, in the same flat style; the paper-doll pieces were redrawn
        // with outlines and shading and some had broken bits); a tower shield's front-on icon turned three-quarters
        const iid = id && String(id).split("/").pop()
        const pole = iid && /staff|trident|spear|boomstick|stabber|sword|mace|bludgeon|slasher|smasher|shooter|(^|_)bow$/.test(iid) && (await gameIcon(iid))
        // (a bow without the icon's own string: the stage draws it, straight at rest and pulled back when it shoots)
        if (pole && /(^|_)bow$/.test(iid)) {
          const bare = await gameIcon(iid, true)
          if (bare) return { tex: bare.tex, grip: [0, 0], axis: bare.axis, k: bare.k, unstrung: true }
        }
        if (pole) return { tex: pole.tex, grip: [0, 0], axis: pole.axis, k: pole.k }
        const shield = iid && /bulwark/.test(iid) && (await turnedShield(iid))
        if (shield) return shield
        // an item redrawn for the rig (assets/rig/weapons: side-view crossbows, their axes in WEAPON_AXIS too; books
        // read by the character, painted over a parallel-projection layout: RIG_GRIP)
        const k = String(id || "").replace(/_refined$/, "")
        if (k && Assets.list("weapons").includes(k)) {
          const t = await loadMip(Assets.url(`rig/weapons/${k}.webp`))
          const axis = WEAPON_AXIS["rig:" + k]
          return { tex: t, grip: RIG_GRIP["rig:" + k] || [t.width / 2, t.height / 2], axis }
        }
        const h = id && Doll.held(id)
        if (!h) return null
        const t = await loadMip(h.url)
        return { tex: new P.Texture({ source: t.source, frame: new P.Rectangle(...h.rect) }), grip: h.grip, axis: WEAPON_AXIS[String(id).replace(/_refined$/, "")] }
      }
      // a point along the weapon's axis (0 butt … 1 head) and the axis's angle (degrees from straight down, + forward)
      const along = (ax, f) => [ax[0] + (ax[2] - ax[0]) * f, ax[1] + (ax[3] - ax[1]) * f]
      const angle = ax => (Math.atan2(ax[2] - ax[0], ax[3] - ax[1]) * 180) / Math.PI
      const items = u.items?.main_hand || u.items?.two_hand ? u.items : { main_hand: "holy_sword" }
      const G = GRIPS[gripOf(items)]
      const w = await piece(items.main_hand || items.two_hand)
      if (w) {
        tex.weapon = w.tex
        // the main weapon in its grip style's hand (the back hand, a bow in the front one), held at the style's point
        // and turned to its angle; a free front hand takes the shaft of a weapon held in both hands
        if (base.parts.hm) {
          const ax = G.at != null && w.axis
          const ho = G.hand === "ho"
          const wid = String(items.main_hand || items.two_hand).split("/").pop().replace(/_refined$/, "")
          const at = GRIP_AT[wid] ?? (ax && G.gap && ax[4] > 0.15 && ax[4] < 0.5 ? ax[4] : G.at)
          def.parts.weapon = { pivot: ax ? along(ax, at) : w.grip, tip: ax && along(ax, 1), at: ho ? base.fist : base.back, parent: ho ? "ho" : "hm", z: G.z || (G === GRIPS.spear && offOf(u.items?.off_hand) === "shield" ? 4.2 : ho ? 3.95 : 2.9), rot: ax ? angle(ax) - G.aim : -30, scale: base.scale * (G.scale || 1) * (w.k || 1) }
          if (ax && G.two && !u.items?.off_hand) def.two = along(ax, G.two)
          // a bow's string runs between its two ends (pulled back by the drawing hand)
          if (ax && G === GRIPS.bow && wid !== "gobo_shooter") def.string = [ax.slice(0, 2), ax.slice(2)]
          if (w.unstrung) def.stringAlways = true
        } else def.parts.weapon = base.parts.bfore
          ? // at rest the blade points up and forward from the back hand
            { pivot: w.grip, at: base.back, parent: "bfore", z: 2.2, rot: -60, scale: base.scale }
          : { pivot: w.grip, at: base.fist, parent: base.parts.fore ? "fore" : "arm", z: 5, rot: 58 - base.armAngle - 40, scale: base.scale }
      }
      // arm colours: the outfit's sleeve where it has one, else the avatar's skin; the far arm a shade darker
      if (base.arms) {
        // the drawn upper arm and forearm of each arm (avatar + outfit layers), laid along the arm by the stage
        def.armTex = {}
        for (const arm of Object.keys(base.arms))
          for (const seg of ["up", "lo"]) def.armTex[arm + "_" + seg] = [!whole && (await L(`a_${avatar}_${arm}_${seg}`).catch(() => null)), outfit && (await L(`o_${outfit}_${arm}_${seg}`).catch(() => null))].filter(Boolean)
        const C = base.armColors || {}
        const sleeve = outfit && C["o_" + outfit]?.armf?.cover > 0.5 ? C["o_" + outfit].armf : C["a_" + avatar]?.armf
        def.armColor = sleeve || { fill: "#c8c8c8", line: "#6e6e6e" }
      }
      // (the second sai of the goblin pair in the front hand)
      const off = await piece(u.items?.off_hand || (G === GRIPS.sai && items.two_hand))
      if (off) {
        tex.off = off.tex
        // the off-hand in the front hand (over the fist with floating hands; else upright on the forearm); a dagger by
        // its hilt, a shield / book / relic in the middle; a book between the front arm and the fist (held by the bottom of its
        // spine: drawn over the fist it hid the wrist, and forearm and fist showed as two hands; under the forearm it was
        // covered by it), over the arm and under the fist
        def.parts.off = base.parts.ho
          ? // (a dagger turned to point forward, held over the break between its pommel and grip where the art has one,
            // its point for the blade's light trail)
            { pivot: off.axis ? along(off.axis, off.axis[4] < 0.4 ? off.axis[4] : 0.08) : off.grip, tip: off.axis && along(off.axis, 1), rot: off.axis ? angle(off.axis) - 90 : 0, at: base.fist, parent: "ho", z: offOf(u.items?.off_hand) === "book" ? 3.7 : 4.1, scale: base.scale * (off.k || 1) }
          : base.parts.bfore
          ? { pivot: off.grip, at: base.fist, parent: "fore", z: 4.5, upright: true, scale: base.scale }
          : { pivot: off.grip, at: base.back, parent: "body", z: 0, scale: base.scale }
      }
      return { def, tex }
    }
    const FALLERS = new Set(["quad", "centaur"])
    function buildRig(a, { def, tex }) {
      // (the old body's glow filters freed with it; its body shader a.filter goes on to the new one)
      for (const h of a.halos || []) h.destroy()
      a.halos = []
      a.glowKey = ""
      a.rig?.root.destroy(GONE)
      const root = new P.Container()
      const list = Object.entries(def.parts)
        .sort((x, y) => x[1].z - y[1].z)
        .map(([name, p]) => {
          // a part may be several registered layers (a player's avatar and outfit), all on the same pivot
          const layers = [].concat(tex[name]).filter(Boolean)
          const s = new P.Container()
          for (const t of layers) {
            const sp = new P.Sprite(t)
            sp.pivot.set(p.pivot[0], p.pivot[1])
            sp.scale.set(p.scale || 1)
            s.addChild(sp)
          }
          root.addChild(s)
          const w = layers[0]?.width || 0
          const h = layers[0]?.height || 0
          // a part hanging below its joint swings forward with a clockwise turn (art facing left), one standing on it counterclockwise
          // (rig.json may set sign itself where that guess fails: a forearm held out sideways)
          const sign = (p.sign ?? (h / 2 > p.pivot[1] ? 1 : -1)) * (def.face === "right" ? -1 : 1)
          // a weapon's tip: the corner of its piece farthest from the grip (for the blade's light trail)
          const tip = (name === "weapon" || (name === "off" && p.tip)) && (p.tip || [[0, 0], [w, 0], [0, h], [w, h]].sort((u, v) => Math.hypot(v[0] - p.pivot[0], v[1] - p.pivot[1]) - Math.hypot(u[0] - p.pivot[0], u[1] - p.pivot[1]))[0])
          return { name, s, p, w, h, tip, sign, rest: ((p.rot || 0) * Math.PI) / 180, x: 0, y: 0, wr: 0, fall: null }
        })
      const by = Object.fromEntries(list.map(q => [q.name, q]))
      const order = []
      const add = q => {
        if (order.includes(q)) return
        if (q.p.parent) add(by[q.p.parent])
        order.push(q)
      }
      list.forEach(add)
      // arms (floating-hand rigs): a tube drawn each frame from the shoulder to the hand, between the parts by z
      root.sortableChildren = true
      list.forEach(q => (q.s.zIndex = q.p.z))
      const arms = Object.entries(def.arms || {}).map(([name, arm]) => {
        const g = new P.Graphics()
        g.zIndex = arm.z
        root.addChild(g)
        // textured segments when the layers have drawn arms (the joint end of a strip sits arm.pad from its left: one
        // for both, or [upper arm, forearm])
        const seg = k => {
          const pad = Array.isArray(arm.pad) ? arm.pad[k === "up" ? 0 : 1] : arm.pad
          const ts = def.armTex?.[name + "_" + k]
          if (!ts?.length) return null
          const c = new P.Container()
          for (const t of ts) {
            const sp = new P.Sprite(t)
            sp.anchor.set(pad / t.width, 0.5)
            c.addChild(sp)
          }
          c.zIndex = arm.z + (k === "lo" ? 0.02 : 0.01)
          root.addChild(c)
          return c
        }
        return { name, arm, g, up: seg("up"), lo: seg("lo") }
      })
      let str = null
      if (def.string) {
        str = new P.Graphics()
        str.zIndex = 3.92
        root.addChild(str)
      }
      // (the body shader is put on by bodyFilters only while it shows something)
      a.bodyOn = null
      a.cont.addChildAt(root, a.cont.getChildIndex(a.shadow) + 1)
      a.glowKey = ""
      // a monster shatters when it dies (its pieces tumble back, bounce and burn away), except a four-legged beast, which
      // lies down on its belly, and a centaur, which folds its legs and goes down; a player falls (its rig faces right).
      // (rig.json crumble, written false by tools/rig-monster.py, is not asked any more)
      a.rig = { root, parts: list, by, order, def, arms, str, fallen: false, back: 0, crumble: def.face !== "right" && !FALLERS.has(def.tmpl) }
      enchGlow(a)
      layout()
      if (a.dead) {
        if (a.rig.crumble) rigCrumble(a, true)
        else play1(a, "dead", { at: 1e6 })
      } else play1(a, "idle")
    }
    // ----- a monster without a rig (one the game added since): the old stage's pose pictures, else a plain shape -----
    // The pictures (assets/m/<id>/<pose>.webp, 400 px, the body standing in the middle 1 / 1.375 of the frame, feet on
    // its bottom edge) are swapped by the action's phase: wound up before the blow, striking as it lands. A melee
    // monster runs in like a rigged one; the rest shoot from the middle of the body.
    const FLAT_POSES = ["idle", "windup", "strike", "hurt", "cast", "dead"]
    const flats = {}
    function loadFlat(id) {
      if (!Assets.has("m", id)) return Promise.resolve(null)
      flats[id] ||= Promise.all(FLAT_POSES.map(n => loadMip(Assets.url(`m/${id}/${n}.webp`)).catch(() => null))).then(list => (list[0] ? Object.fromEntries(FLAT_POSES.map((n, k) => [n, list[k] || list[0]])) : null))
      return flats[id]
    }
    function buildFlat(a, tex) {
      a.flat?.root.destroy(GONE)
      const root = new P.Container()
      let body
      if (tex) {
        body = new P.Sprite(tex.idle)
        body.anchor.set(0.5, 0.5 + 0.5 / 1.375)
      } else {
        // the old stage's stand-in: a hump in the unit's element colour with two eyes, in a 100 unit box, feet at 0
        body = new P.Graphics()
        body.moveTo(-32, 0).quadraticCurveTo(-36, -52, 0, -62).quadraticCurveTo(36, -52, 32, 0).closePath()
        body.fill(COLOR[a.u.element] || 0x99aaaa).stroke({ color: 0x000000, width: 2, alpha: 0.4 })
        for (const x of [-12, 12]) body.circle(x, -37, 5).fill(0xffffff).circle(x - 2, -37, 2.5).fill(0x000000)
      }
      root.addChild(body)
      a.cont.addChildAt(root, a.cont.getChildIndex(a.shadow) + 1)
      a.bodyOn = null
      a.flat = { root, body, tex, melee: !/ranged|magic/.test(a.u.style || "") }
      layout()
      play1(a, a.dead ? "dead" : "idle")
    }
    function flatScale(a) {
      const F2 = a.flat
      // (a picture: its frame at 1.375 boxes; the shape: about the body height of a rigged monster)
      F2.k = F2.tex ? (a.box * 1.375) / F2.tex.idle.width : a.h / 62
    }
    function playFlat(a, name, at = 0) {
      const F2 = a.flat
      const strike = /^(attack|skill)/.test(name)
      const def =
        name === "dead" ? { dur: 1 } : name === "hurt" ? { dur: 320 } : name === "cast" ? { dur: 800 }
        : strike && F2.melee ? { dur: 900, hit: 450, lunge: true }
        : strike ? { dur: 900, hit: 560, shot: 300, missile: a.u.style === "magic" ? "orb" : "arrow" }
        : { dur: 1e9 }
      a.act = { name, def, t0: now() - at }
      return def
    }
    function flatFrame(a, t) {
      const F2 = a.flat
      if (!F2.k) flatScale(a)
      const A = a.act
      const at = A ? t - A.t0 : 0
      let pose = "idle"
      let lean = 0
      if (a.dead) pose = "dead"
      else if (A && at < A.def.dur) {
        if (A.name === "hurt") (pose = "hurt"), (lean = -0.12 * (1 - at / A.def.dur))
        else if (A.name === "cast") pose = "cast"
        else if (A.def.hit != null) {
          const go = A.def.shot ?? A.def.hit - 120
          if (at < go) (pose = A.name.startsWith("skill") && !F2.melee ? "cast" : "windup"), (lean = -0.1 * Math.min(1, at / go))
          else if (at < A.def.hit + 260) (pose = "strike"), (lean = 0.12)
        }
      }
      if (F2.tex) {
        F2.body.texture = F2.tex[pose]
        lean *= 0.4
      }
      // breathing while it stands, a shudder when hit; the pictures face left, turned to face the foe
      const k = F2.k
      const breathe = a.dead ? 0 : 0.015 * Math.sin(t / 420 + a.i)
      F2.root.scale.set((a.dir < 0 ? 1 : -1) * k, k * (1 + breathe))
      F2.root.rotation = lean * a.dir
      F2.root.x = a.jig * a.h * 0.04 * Math.sin(t / 30)
      if (!F2.tex && a.dead) F2.root.rotation = -a.dir * 1.3
    }
    // art faces left unless rig.json says face: "right"; mirrored to face the foe
    function rigScale(a) {
      const k = a.h / a.rig.def.h
      a.rig.root.scale.set((a.rig.def.face === "right") === a.dir > 0 ? k : -k, k)
      const cy = a.rig.def.h * 0.45
      a.rig.root.pivot.set(0, -cy)
      a.rig.root.position.set(0, -cy * k)
      a.rig.k = [a.rig.root.scale.x, k, cy]
    }
    // starts an action on a unit; the pose it leaves is blended out over the first `blend` ms
    function play1(a, name, { at = 0, blend = 120 } = {}) {
      if (a.flat) return playFlat(a, name, at)
      const act = actionOf(a.kind, name) || actionOf(a.kind, "idle")
      if (!act) return null
      a.from = a.pose ? { ...a.pose, a: { ...a.pose.a } } : null
      a.blend = blend
      a.act = { name, def: act, t0: now() - at }
      return act
    }
    function rigFrame(a, t) {
      const R = a.rig
      if (R.fallen) return rigDebris(a)
      // a.still = [action, ms]: held on one frame (Arena.still, for checking poses)
      const A = a.still ? { name: a.still[0], def: actionOf(a.kind, a.still[0]) || actionOf(a.kind, "idle"), t0: t - a.still[1] } : a.act
      let at = A ? t - A.t0 : 0
      if (A && at >= A.def.dur) {
        if (A.def.loop) at %= A.def.dur
        else if (A.name === "dead") at = A.def.dur
        else {
          play1(a, "idle")
          return rigFrame(a, t)
        }
      }
      let pose = A ? sample(A.def, at) : { a: {}, x: 0, y: 0 }
      // the off hand's own track; a dagger strike leaves the back hand on its set's guard
      if (A && a.off) {
        const ho = offPose(a.off, A.name, A.def, at)
        if (ho) pose.a.ho = ho
        if (A.def.own && pose.a.hm == null) pose.a.hm = actionOf(a.kind, "idle")?.keys[0].a.hm
      }
      if (a.from && A && t - A.t0 < a.blend) {
        const p = ease((t - A.t0) / a.blend)
        const b = pose
        const short = (from, to) => to + ((((from || 0) - to) % 360) + 540) % 360 - 180
        pose = { a: {}, x: lerp(a.from.x, b.x, p), y: lerp(a.from.y, b.y, p), r: lerp(short(a.from.r, b.r || 0), b.r || 0, p) }
        // the short way round: an action may end a whole turn (or more) away from where the next starts
        for (const n of new Set([...Object.keys(a.from.a), ...Object.keys(b.a)])) {
          const f = a.from.a[n]
          const to = b.a[n]
          if (Array.isArray(f) || Array.isArray(to)) {
            const A = vec(f)
            const B = vec(to)
            pose.a[n] = [lerp(A[0], B[0], p), lerp(A[1], B[1], p), lerp(short(A[2], B[2]), B[2], p)]
          } else pose.a[n] = lerp(short(f, to || 0), to || 0, p)
        }
      }
      a.pose = pose
      const D = Math.PI / 180
      // r: the whole body turns about its middle (a spin, a flip); + turns forward
      R.root.rotation = (pose.r || 0) * D * a.dir
      // sq: squashed (-) or stretched (+) by that many percent, standing on its feet (a slime's hop), the width the other way
      if (R.k) {
        const sq = (pose.a.sq || 0) / 100
        R.root.scale.set(R.k[0] * (1 - sq * 0.5), R.k[1] * (1 + sq))
        R.root.position.y = -R.k[2] * R.k[1] * (1 + sq)
      }
      const wob = a.jig * 10 * Math.sin(t / 30)
      const h = R.def.h
      for (const q of R.order) {
        const v = vec(pose.a[q.name])
        let deg = v[2]
        // lying flat is as far as a body goes (a fall can tip past it, head below the feet)
        if (q.name === "body") deg = Math.max(-88, Math.min(88, deg))
        // a stiff top piece (rig.json headk: a tower on a rook) turns only that share of the way
        if (q.name === "head" && R.def.headk != null) deg *= R.def.headk
        // the hit wobble: on the trunk, and on a monster's own head; a player's head is cut from its body
        // drawing (long hair stays on the body) and must move with it exactly or the head looks split
        if (q.name === "body" || q.name === "torso" || (q.name === "head" && !R.def.hands)) deg -= wob
        // a flier's wing (rig.json wing = its phase) beats all the time, folded still once it has fallen
        if (q.p.wing != null && !a.dead && A?.name !== "dead") deg += Math.sin(t / 38 + q.p.wing) * 28
        // a limbless one's appendage (rig.json sway = its phase): sways slowly on its root, and all of them reach
        // together by the action's limbs (+ toward the foe); limp once it has fallen
        // (a fish's fins and tail beat faster and wider: it swims; an arthropod's kinds each follow a channel of their own,
        // rig.json ch, with their own sway, amp degrees every per ms a radian, and its legs scuttle by the action's scut)
        if (q.p.sway != null) {
          const fish = R.def.tmpl === "fish"
          deg += (pose.a[q.p.ch || "limbs"] || 0) * (R.def.chk?.[q.p.ch] ?? 1) + (a.dead ? 0 : Math.sin(t / (q.p.per || (fish ? 130 : 320)) + q.p.sway) * (q.p.amp ?? (fish ? 16 : 9)))
          if (q.p.ch?.startsWith("legs") && pose.a.scut && !(A?.name === "dead" && at >= A.def.dur)) deg += Math.sin(t / 40 + q.p.sway * 1.6) * pose.a.scut
        }
        const r = deg * q.sign * D
        const par = q.p.parent && R.by[q.p.parent]
        if (par) {
          const dx = q.p.at[0] - par.p.at[0]
          const dy = q.p.at[1] - par.p.at[1]
          const c = Math.cos(par.wr)
          const s = Math.sin(par.wr)
          q.x = par.x + dx * c - dy * s
          q.y = par.y + dx * s + dy * c
          // upright: keeps the body's tilt only (a shield held level with the body, whatever the arm does)
          q.wr = q.p.upright ? (R.by.body || R.by.torso || par).wr + q.rest : par.wr + r + q.rest
        } else {
          // forward is -x in the art for a left-facing rig
          const fwd = R.def.face === "right" ? 1 : -1
          // a floating hand also moves by its own [forward, up]
          q.x = q.p.at[0] - R.def.foot[0] + (pose.x + v[0]) * h * fwd
          // a body tipped over turns about its feet and would sink: it is lifted to lie on the ground instead (in a fall by
          // rig.json lie, worked out from its shape, which a body on long legs may make negative; else the action's lift)
          const tip = Math.max(0, Math.min(1, (Math.abs(pose.a.body || pose.a.torso || 0) - 30) / 58))
          // (a fall may sink below the feet' line: a beast lying down with its legs folded)
          // (a flier hangs rig.json hover above the ground; its fall brings it down: the action's keys say how far, g)
          q.y = q.p.at[1] - R.def.foot[1] - ((A?.def.fall ? pose.y : Math.max(0, pose.y)) + (R.def.hover || 0) + v[1] + (A?.def.fall && R.def.lie != null ? R.def.lie : A?.def.lift ?? 0.3) * tip) * h
          q.wr = r + q.rest
          // something floating round a monster (rig.json float = its phase): bobs on its own, gone when it falls
          if (q.p.float != null) {
            q.y += Math.sin(t / 650 + q.p.float) * h * 0.03
            q.wr += Math.sin(t / 900 + q.p.float * 2) * 0.12
            q.s.alpha = a.dead ? Math.max(0, q.s.alpha - 0.04) : Math.min(1, q.s.alpha + 0.04)
          }
        }
        // getting back up: fly from where the piece lay into place
        const b = R.back
        q.s.position.set(b ? lerp(q.x, q.fx, b) : q.x, b ? lerp(q.y, q.fy, b) : q.y)
        q.s.rotation = b ? lerp(q.wr, q.fr, b) : q.wr
      }
      // a floating hand goes no farther from its shoulder than the arm reaches (its keys are moves from rest, laid over
      // whatever the body does: raised overhead on a leaning body they would pull the arm long); past it, the hand and
      // what it holds are drawn back toward the shoulder along the same line
      const body = R.by.body
      // an arm's shoulder where the body is now, and how far its hand can be from it
      const shoulder = arm => {
        const dx0 = arm.shoulder[0] - body.p.at[0]
        const dy0 = arm.shoulder[1] - body.p.at[1]
        const c = Math.cos(body.wr)
        const s = Math.sin(body.wr)
        return [body.x + dx0 * c - dy0 * s, body.y + dx0 * s + dy0 * c]
      }
      const reachOf = arm => (arm.len[0] + arm.len[1]) * 1.15 + (R.by[arm.hand]?.w || 0) * 0.32
      if (R.def.arms && body && !R.back)
        for (const arm of Object.values(R.def.arms)) {
          const hand = R.by[arm.hand]
          if (!hand) continue
          const [Sx, Sy] = shoulder(arm)
          const d = Math.hypot(hand.x - Sx, hand.y - Sy)
          const reach = reachOf(arm)
          if (d <= reach) continue
          const mx = (Sx - hand.x) * (1 - reach / d)
          const my = (Sy - hand.y) * (1 - reach / d)
          const moved = new Set([hand])
          for (const q of R.order)
            if (moved.has(q) || moved.has(R.by[q.p.parent])) {
              moved.add(q)
              q.x += mx
              q.y += my
              q.s.position.set(q.x, q.y)
            }
        }
      // a bow's string: drawn from its two ends to the back hand while that hand is pulling it (close behind the bow)
      if (R.str) {
        R.str.clear()
        const q = R.by.weapon
        const hm = R.by.hm
        const k = q.p.scale || 1
        const c = Math.cos(q.wr)
        const s = Math.sin(q.wr)
        const [E, F2] = R.def.string.map(([px, py]) => {
          const dx = (px - q.p.pivot[0]) * k
          const dy = (py - q.p.pivot[1]) * k
          return { x: q.x + dx * c - dy * s, y: q.y + dx * s + dy * c }
        })
        // the hand's distance behind the bow's line (+ = on the string side, away from the foe)
        const L = Math.hypot(F2.x - E.x, F2.y - E.y) || 1
        const behind = ((F2.y - E.y) * (hm.x - E.x) - (F2.x - E.x) * (hm.y - E.y)) / L
        if (!R.back && A?.def.shot != null && behind > 4 && behind < h * 0.7) R.str.moveTo(E.x, E.y).lineTo(hm.x, hm.y).lineTo(F2.x, F2.y).stroke({ width: 3, color: 0xf4efe0, alpha: 0.95 })
        // (a bow drawn from its icon has had its own string taken off: at rest it is drawn straight between the ends)
        else if (R.def.stringAlways && !R.back) R.str.moveTo(E.x, E.y).lineTo(F2.x, F2.y).stroke({ width: 2, color: 0xf4efe0, alpha: 0.9 })
      }
      // a weapon held in both hands: the other hand on it too (def.two, piece pixels), turned with the holding hand
      const w = R.def.two && R.by.weapon
      if (w && R.by.ho && !R.back) {
        const lead = R.by[w.p.parent]
        const ho = lead === R.by.ho ? R.by.hm : R.by.ho
        const k = w.p.scale || 1
        const dx = (R.def.two[0] - w.p.pivot[0]) * k
        const dy = (R.def.two[1] - w.p.pivot[1]) * k
        const c = Math.cos(w.wr)
        const s = Math.sin(w.wr)
        // (at its place on the haft, or slid along it to where its arm reaches: from the holding hand to a little past)
        const arm = body && Object.values(R.def.arms || {}).find(m => R.by[m.hand] === ho)
        let f = 1
        if (arm) {
          const [Sx, Sy] = shoulder(arm)
          const reach = reachOf(arm)
          const at = t => [w.x + (dx * c - dy * s) * t, w.y + (dx * s + dy * c) * t]
          const dist = t => Math.hypot(at(t)[0] - Sx, at(t)[1] - Sy)
          if (dist(1) > reach) {
            let best = 1
            for (let t = 0; t <= 1.4001; t += 0.05) {
              const fits = dist(t) <= reach
              if ((fits && (dist(best) > reach || Math.abs(t - 1) < Math.abs(best - 1))) || (!fits && dist(best) > reach && dist(t) < dist(best))) best = t
            }
            f = best
          }
        }
        ho.x = w.x + (dx * c - dy * s) * f
        ho.y = w.y + (dx * s + dy * c) * f
        ho.s.position.set(ho.x, ho.y)
        ho.s.rotation = ho.wr = lead.wr
      }
    }
    // an arm from the shoulder (riding on the body) to the hand: two segments of the drawn lengths bending at the
    // elbow (downward), straight and stretched when the hand is farther away; outline first, then the sleeve colour
    function rigArms(a) {
      const R = a.rig
      const body = R.by.body
      for (const { arm, g, up, lo } of R.arms) {
        g.visible = armsOn && !up
        if (up) up.visible = lo.visible = armsOn
        if (!armsOn) continue
        const hand = R.by[arm.hand]
        const dx0 = arm.shoulder[0] - body.p.at[0]
        const dy0 = arm.shoulder[1] - body.p.at[1]
        const c = Math.cos(body.s.rotation)
        const s = Math.sin(body.s.rotation)
        const S = { x: body.s.x + dx0 * c - dy0 * s, y: body.s.y + dx0 * s + dy0 * c }
        const Hx = hand.s.x
        const Hy = hand.s.y
        // the wrist: the fist's edge toward the shoulder
        const fr = hand.w * 0.32
        const dH = Math.hypot(S.x - Hx, S.y - Hy) || 1
        const W = { x: Hx + ((S.x - Hx) / dH) * fr, y: Hy + ((S.y - Hy) / dH) * fr }
        const d = Math.hypot(W.x - S.x, W.y - S.y) || 1
        // a hand close to its shoulder shortens the arm (a rubber-hose arm) instead of throwing the elbow out
        const k = Math.max(0.35, Math.min(1, d / (0.75 * (arm.len[0] + arm.len[1]) * 1.15)))
        const [L1, L2] = arm.len.map(l => l * 1.15 * k)
        let E
        if (d >= L1 + L2 - 0.5) E = { x: S.x + ((W.x - S.x) * L1) / (L1 + L2), y: S.y + ((W.y - S.y) * L1) / (L1 + L2) }
        else {
          const along = Math.max(-L1, Math.min(L1, (d * d + L1 * L1 - L2 * L2) / (2 * d)))
          const off = Math.sqrt(Math.max(0, L1 * L1 - along * along))
          const ux = (W.x - S.x) / d
          const uy = (W.y - S.y) / d
          // the elbow on the lower side of the shoulder-wrist line
          const side = ux >= 0 ? 1 : -1
          E = { x: S.x + ux * along - uy * off * side, y: S.y + uy * along + ux * off * side }
        }
        // drawn segments: each from its joint, turned along the bone and stretched to its length
        if (up) {
          const lay = (c, A, B, len) => {
            c.position.set(A.x, A.y)
            c.rotation = Math.atan2(B.y - A.y, B.x - A.x)
            c.scale.set(Math.max(0.6, Math.hypot(B.x - A.x, B.y - A.y) / len), 1)
          }
          lay(up, S, E, arm.len[0])
          lay(lo, E, W, arm.len[1])
          continue
        }
        // a plain tube otherwise: a shade darker than the sleeve on the body (the far arm darker still)
        const col = R.def.armColor
        const shade = arm.hand === "hm" ? 0xb0b0b0 : 0xd0d0d0
        const w = arm.width[0]
        g.clear()
        g.moveTo(S.x, S.y).lineTo(E.x, E.y).lineTo(W.x, W.y).stroke({ width: w + 7, color: new P.Color(col.line).multiply(0xb0b0b0).toNumber(), cap: "round", join: "round" })
        g.moveTo(S.x, S.y).lineTo(E.x, E.y).lineTo(W.x, W.y).stroke({ width: w, color: new P.Color(col.fill).multiply(shade).toNumber(), cap: "round", join: "round" })
      }
    }
    let armsOn = GM_getValue("battle_fx_lab_v2", {}).arms !== false
    function setArms(on) {
      armsOn = on
    }

    // a monster's death: it falls apart, pieces tumble backward, bounce and settle
    function rigCrumble(a, instant) {
      const R = a.rig
      R.fallen = true
      for (const q of R.parts) {
        // the arms come off first, the head and body topple after them, the legs last (Lost Castle's giant)
        const wait = /^arm/.test(q.name) ? 0 : q.name === "head" || q.name === "torso" ? 0.35 : 0.5
        const arm = /^arm/.test(q.name)
        q.fall = { vx: arm ? 30 + Math.random() * 120 : 60 + Math.random() * 220, vy: arm ? -(40 + Math.random() * 80) : -(120 + Math.random() * 260), vr: (Math.random() - 0.5) * (arm ? 6 : 12), floor: -Math.min(q.w, q.h) * 0.3, wait }
        if (instant) {
          q.s.position.set(q.p.at[0] - R.def.foot[0] + 80 + Math.random() * 120, q.fall.floor)
          q.s.rotation = (Math.random() - 0.5) * 3
          q.fall = null
        }
      }
    }
    let dt = 0.016
    function rigDebris(a) {
      for (const q of a.rig.parts) {
        const f = q.fall
        if (!f) continue
        if (f.wait > 0) {
          f.wait -= dt
          continue
        }
        f.vy += 1500 * dt
        q.s.x += f.vx * dt
        q.s.y += f.vy * dt
        q.s.rotation += f.vr * dt
        if (q.s.y > f.floor) {
          q.s.y = f.floor
          f.vy *= -0.32
          f.vx *= 0.55
          f.vr *= 0.5
          if (Math.abs(f.vy) < 40) q.fall = null
        }
      }
    }
    function rigRise(a) {
      const R = a.rig
      R.fallen = false
      for (const q of R.parts) {
        q.fx = q.s.x
        q.fy = q.s.y
        q.fr = q.s.rotation
        q.fall = null
      }
      R.back = 1
      tween(650, p => (R.back = 1 - ease(p)))
    }

    // ----- effects -----
    // ----- drawn effects (no sprite sheets): fire, water, ice, nature, blows, light, circles -----
    // particle sizes are tuned for a body 120 px tall
    const K = h => h / 120
    const ELEM_COL = { mana: 0x8f9cff, fire: 0xff7a2a, water: 0x5ac8ff, nature: 0x62d65a, heal: 0x6cff9a, buff: 0xffd84a, physical: 0xffe3a3 }
    // fire is big soft motes on the glowing layer: white-yellow when born, cooling through orange to a dark red
    // (thin and translucent: piled up on the glowing layer they burn white)
    const FIRE = [0xffb848, 0xff8a2a, 0xff6a1a, 0xffd070]
    // flames licking up out of the ground over a w-wide base for dur ms
    function flameColumn(x, y, w, h, dur, { rate = 3 } = {}) {
      light(x, y - h * 0.4, 0xff7a2a, Math.max(w, h) * 0.8, dur, 1.2)
      tween(dur, p => {
        if (p >= 1) return
        const f = p < 0.12 ? p / 0.12 : p > 0.7 ? (1 - p) / 0.3 : 1
        for (let k = 0; k < rate * f * 0.6; k++) {
          const off = (Math.random() - 0.5) * w
          emit(x + off, y - Math.random() * h * 0.08, { n: 1, color: FIRE, color1: 0x5a0800, alpha: 0.42, size: 0.85 * K(h) * (1 - Math.abs(off) / w), size1: 0.15, speed: 20, angle: -Math.PI / 2, up: h * 1.1, gravity: -h * 1.1, drag: 0.5, life: 700 })
        }
      })
    }
    // a ball of fire bursting outward from a point
    function fireExplosion(x, y, r) {
      light(x, y, 0xff9a3a, r * 2.4, 420, 1.3)
      emit(x, y, { n: 22, color: FIRE, color1: 0x5a0800, alpha: 0.5, size: 0.8 * K(r * 2.4), size1: 0.2, speed: r * 5, drag: 0.02, gravity: -r * 2, life: 560 })
      emit(x, y, { n: 6, color: 0xfff0c0, alpha: 0.7, size: 0.5 * K(r * 2.4), size1: 0.1, speed: r * 2, drag: 0.02, life: 220 })
    }
    // a column of fire spinning up into the air (flames orbiting round its axis, the spiral widening as it rises)
    function fireTornado(x, y, h, dur) {
      light(x, y - h * 0.5, 0xff7a2a, h, dur, 1.2)
      tween(dur, p => {
        if (p >= 1) return
        const f = p < 0.12 ? p / 0.12 : p > 0.75 ? (1 - p) / 0.25 : 1
        for (let k = 0; k < 3 * f; k++) emit(x, y, { n: 1, color: FIRE, color1: 0x5a0800, alpha: 0.55, size: 0.42 * K(h), size1: 0.3, life: 850, orbit: { cx: x, y, r: h * 0.2, spin: 7 + Math.random() * 2, rise: h * 1.25, widen: 1.3 } })
      })
    }
    // water: a column of water bursting up out of the ground (a translucent body with a paler core and white streaks
    // of flow running up it), spray thrown off its crown, falling back
    function waterColumn(x, y, w, h, dur, { body = 0x2f8fe8, core = 0x9fd8ff, spray = [0x5ab8ff, 0xbfe8ff, 0xffffff] } = {}) {
      light(x, y - h * 0.4, 0x3fb4ff, Math.max(w, h) * 0.5, dur, 0.7)
      const g = new P.Graphics()
      smokeLayer.addChild(g)
      const flows = Array.from({ length: 6 }, () => ({ u: Math.random() - 0.5, ph: Math.random(), len: 0.12 + Math.random() * 0.12 }))
      tween(dur, p => {
        g.clear()
        // shoots up fast, stands, then sinks back thinner
        const up = Math.min(1, p / 0.18)
        const H = h * (1 - Math.pow(1 - up, 3)) * (p > 0.7 ? 1 - (p - 0.7) / 0.3 * 0.6 : 1)
        const W = w * 0.5 * (p > 0.7 ? 1 - (p - 0.7) / 0.3 * 0.7 : 1)
        const a = p > 0.8 ? (1 - p) / 0.2 : 1
        const top = y - H
        g.moveTo(x - W, y).bezierCurveTo(x - W * 0.8, y - H * 0.5, x - W * 0.6, top + W * 0.3, x, top).bezierCurveTo(x + W * 0.6, top + W * 0.3, x + W * 0.8, y - H * 0.5, x + W, y).closePath().fill({ color: body, alpha: 0.5 * a })
        g.moveTo(x - W * 0.45, y).bezierCurveTo(x - W * 0.35, y - H * 0.5, x - W * 0.2, top + W * 0.5, x, top + W * 0.3).bezierCurveTo(x + W * 0.2, top + W * 0.5, x + W * 0.35, y - H * 0.5, x + W * 0.45, y).closePath().fill({ color: core, alpha: 0.45 * a })
        for (const f of flows) {
          const v = (f.ph + p * dur * 0.0025) % 1
          const fy = y - H * v
          g.moveTo(x + f.u * W * 1.2 * (1 - v * 0.5), fy).lineTo(x + f.u * W * 1.2 * (1 - v * 0.5), fy - H * f.len).stroke({ color: 0xffffff, width: Math.max(1.5, w * 0.03), alpha: 0.7 * a, cap: "round" })
        }
        // spray off the crown while it stands
        if (p < 0.75 && H > h * 0.5 && Math.random() < 0.8) emit(x, top + W * 0.2, { n: 2, color: spray, alpha: 0.85, size: 0.35, speed: h * 1.4, angle: -Math.PI / 2, spread: 2.4, gravity: h * 4, life: 600 })
        if (p >= 1) g.destroy()
      })
    }
    // a wave rising at from (x) and rolling travel ms toward the foe, rearing up and curling over as it goes, breaking
    // on it in spray as it arrives
    function waveCrash(a, dir, { from = a.x0 - dir * a.h * 1.45, travel = 280 } = {}) {
      const g = new P.Graphics()
      smokeLayer.addChild(g)
      const y = a.y0
      const W = a.h * 1.1
      const H = a.h * 1.15
      const dur = travel + 520
      const end = a.x0 - dir * a.h * 0.15
      let broke = false
      tween(dur, p => {
        g.clear()
        const t = p * dur
        const e = 1 - Math.pow(1 - Math.min(1, t / travel), 2)
        const cx = from + (end - from) * e
        const hh = H * (0.3 + 0.7 * e)
        const al = t < travel + 120 ? 1 : 1 - (t - travel - 120) / (dur - travel - 120)
        // drawn facing right, mirrored for a wave rolling left: back slope, the crest curling over, the hollow front face
        const X = u => cx + dir * u
        g.moveTo(X(-W * 0.75), y)
          .bezierCurveTo(X(-W * 0.4), y - hh * 0.2, X(-W * 0.2), y - hh * 1.05, X(W * 0.12), y - hh)
          .bezierCurveTo(X(W * 0.38), y - hh * 0.95, X(W * 0.45), y - hh * 0.62, X(W * 0.3), y - hh * 0.55)
          .bezierCurveTo(X(W * 0.2), y - hh * 0.5, X(W * 0.12), y - hh * 0.3, X(W * 0.25), y)
          .closePath()
          .fill({ color: 0x2f8fe8, alpha: 0.62 * al })
        g.moveTo(X(-W * 0.5), y)
          .bezierCurveTo(X(-W * 0.3), y - hh * 0.25, X(-W * 0.15), y - hh * 0.8, X(W * 0.08), y - hh * 0.82)
          .bezierCurveTo(X(W * 0.0), y - hh * 0.5, X(W * 0.05), y - hh * 0.2, X(W * 0.12), y)
          .closePath()
          .fill({ color: 0x8fd0ff, alpha: 0.5 * al })
        // white foam along the crest and its lip
        g.moveTo(X(-W * 0.3), y - hh * 0.78)
          .bezierCurveTo(X(-W * 0.12), y - hh * 1.04, X(W * 0.25), y - hh * 1.02, X(W * 0.36), y - hh * 0.7)
          .stroke({ color: 0xffffff, width: a.h * 0.05, alpha: 0.9 * al, cap: "round" })
        if (t < travel && Math.random() < 0.7) emit(X(W * 0.2), y - hh * 0.95, { n: 1, color: [0xffffff, 0xbfe8ff], size: 0.35, speed: 120, angle: dir > 0 ? -0.6 : Math.PI + 0.6, spread: 0.8, gravity: 900, life: 450 })
        if (!broke && t >= travel) {
          broke = true
          splash(a, true)
          emit(a.x0, y - a.h * 0.5, { n: 26, color: [0x5ab8ff, 0xbfe8ff, 0xffffff], alpha: 0.9, size: 0.45, speed: a.h * 3.5, angle: dir > 0 ? -0.5 : Math.PI + 0.5, spread: 1.6, gravity: a.h * 6, life: 700 })
        }
        if (p >= 1) g.destroy()
      })
    }
    // ice: crystal spikes shooting up out of the ground in a row, standing a moment, then shattering
    function iceSpikes(x, y, w, h, { n = 7, dur = 1100 } = {}) {
      const g = new P.Graphics()
      smokeLayer.addChild(g)
      const sp = Array.from({ length: n }, (_, k) => {
        const u = n > 1 ? k / (n - 1) - 0.5 : 0
        return { x: x + u * w + (Math.random() - 0.5) * w * 0.08, h: h * (0.5 + Math.random() * 0.5) * (1 - Math.abs(u) * 0.9), lean: u * 0.6 + (Math.random() - 0.5) * 0.3, wd: h * (0.07 + Math.random() * 0.05), t: Math.random() * 0.12 }
      })
      light(x, y - h * 0.4, 0x9fe6ff, w * 0.7 + h * 0.3, dur, 1.1)
      tween(dur, p => {
        g.clear()
        for (const s of sp) {
          const e = 1 - Math.pow(1 - Math.min(1, Math.max(0, (p - s.t) / 0.1)), 3)
          const hh = s.h * e
          const tx = s.x + s.lean * hh
          const ty = y - hh
          g.poly([s.x - s.wd, y, tx, ty, s.x, y]).fill({ color: 0xd8f6ff, alpha: 0.95 })
          g.poly([s.x, y, tx, ty, s.x + s.wd, y]).fill({ color: 0x5fb8e8, alpha: 0.95 })
          g.moveTo(s.x, y).lineTo(tx, ty).stroke({ color: 0xffffff, width: 1.5, alpha: 0.9 })
        }
        g.alpha = p > 0.8 ? (1 - p) / 0.2 : 1
        if (p >= 1) g.destroy()
      })
      later(dur * 0.8, () => sp.forEach(s => emit(s.x + s.lean * s.h * 0.5, y - s.h * 0.5, { n: 6, tex: "streak", color: [0xd8f6ff, 0xffffff], size: 0.45, speed: 320, gravity: 900, life: 450, jitter: s.h * 0.5 })))
    }
    // nature: thick thorny vines bursting out of cracked ground and winding up round the body (a turn passing behind
    // it is drawn behind it), tightening, then torn apart in a shower of leaves
    function vinesGrow(x, y, w, h, dur) {
      const back = new P.Graphics()
      const front = new P.Graphics()
      decalLayer.addChild(back)
      smokeLayer.addChild(front)
      decal("crack", x, y, w * 0.9, { dur: dur + 600 })
      debris(x, y, h, 12)
      const vs = Array.from({ length: 4 }, (_, k) => ({ ph: (k / 4) * Math.PI * 2 + Math.random() * 0.8, turns: 0.9 + Math.random() * 0.35, R: w * 0.55 * (0.85 + Math.random() * 0.3), H: h * (0.8 + Math.random() * 0.35), t0: k * 0.05 }))
      const N = 30
      let burst = false
      tween(dur, p => {
        back.clear()
        front.clear()
        // grows up and round, then pulls tight
        const squeeze = p < 0.45 ? 1 : 1 - 0.18 * Math.min(1, (p - 0.45) / 0.15)
        for (const v of vs) {
          const e = 1 - Math.pow(1 - Math.min(1, Math.max(0, (p - v.t0) / 0.32)), 2)
          if (e <= 0) continue
          const pt = t => {
            const an = v.ph + t * v.turns * Math.PI * 2
            return { x: x + Math.sin(an) * v.R * squeeze * (1 - t * 0.3), y: y - t * v.H, front: Math.cos(an) > 0 }
          }
          // the stem in runs (a new run where it passes in front of / behind the body, or every few points so it tapers),
          // all its dark outline first and then its light core over that, so the joins do not show
          const runs = []
          let run = null
          for (let i = 0; i <= N; i++) {
            const q = pt((i / N) * e)
            if (!run || run.front !== q.front || run.pts.length > 6) {
              if (run) run.pts.push(q)
              run = { front: q.front, pts: run ? [run.pts[run.pts.length - 2], q] : [q], wd: h * 0.075 * (1 - (i / N) * 0.75) }
              runs.push(run)
            } else run.pts.push(q)
          }
          for (const pass of [0, 1])
            for (const r of runs) {
              if (r.pts.length < 2) continue
              const g = r.front ? front : back
              g.moveTo(r.pts[0].x, r.pts[0].y)
              for (const q of r.pts.slice(1)) g.lineTo(q.x, q.y)
              g.stroke(pass ? { color: r.front ? 0x5fb84a : 0x3f8a36, width: r.wd, cap: "round", join: "round" } : { color: 0x24561f, width: r.wd + 3, cap: "round", join: "round" })
            }
          let q0 = pt(0)
          for (let i = 1; i <= N; i++) {
            const q = pt((i / N) * e)
            const g = q.front ? front : back
            const wd = h * 0.075 * (1 - (i / N) * 0.75)
            // thorns sticking out, leaves along the stem
            if (i % 5 === 0) g.poly([q.x - wd * 0.4, q.y, q.x + (q.x >= x ? 1 : -1) * wd * 1.4, q.y - wd * 0.8, q.x + wd * 0.4, q.y]).fill(0x24561f)
            if (i % 7 === 3) {
              const s2 = q.x >= x ? 1 : -1
              g.poly([q.x, q.y, q.x + s2 * h * 0.08, q.y - h * 0.06, q.x + s2 * h * 0.16, q.y - h * 0.02, q.x + s2 * h * 0.07, q.y + h * 0.02]).fill(q.front ? 0x7fd85a : 0x4f9a40)
            }
            q0 = q
          }
        }
        const al = p > 0.82 ? (1 - p) / 0.18 : 1
        back.alpha = front.alpha = al
        if (!burst && p >= 0.82) {
          burst = true
          emit(x, y - h * 0.5, { n: 26, tex: "leaf", color: [0x5fd35a, 0x8fe86a, 0x3f9a3a], size: 0.55, speed: 260, up: 120, gravity: 260, drag: 0.5, life: 1300, jitter: h * 0.5 })
        }
        if (p >= 1) {
          back.destroy()
          front.destroy()
        }
      })
    }
    // a veil: a sheet of green light let down over a row (S: its span), glowing threads swaying in it, spores drifting
    // down through it, little mushrooms springing up at the foes' feet; then it lifts and fades, the spores lingering
    function veil(S, feet, dur = 1700) {
      const g = new P.Graphics()
      fxLayer.addChild(g)
      const caps = new P.Graphics()
      smokeLayer.addChild(caps)
      const top = S.ground - S.h * 2
      const L = S.cx - S.w * 0.6
      const R = S.cx + S.w * 0.6
      const threads = Array.from({ length: 14 }, () => ({ u: Math.random(), ph: Math.random() * 6, len: 0.6 + Math.random() * 0.4 }))
      const shrooms = feet.flatMap(a => Array.from({ length: 4 }, () => ({ x: a.x0 + (Math.random() - 0.5) * a.h * 0.9, y: a.y0 + (Math.random() - 0.4) * a.h * 0.1, s: a.h * (0.07 + Math.random() * 0.06), t: 0.15 + Math.random() * 0.2, c: Math.random() < 0.5 ? 0xc8f06a : 0x8fe0a0 })))
      light(S.cx, S.ground - S.h * 0.8, 0x7fe86a, S.w * 0.6, dur, 0.9)
      tween(dur, p => {
        g.clear()
        caps.clear()
        const t = p * dur
        // let down over 450 ms, hangs, lifts away over the last 30 %
        const down = 1 - Math.pow(1 - Math.min(1, t / 450), 3)
        const lift = p > 0.7 ? (p - 0.7) / 0.3 : 0
        const bottom = top + (S.ground - S.h * 0.05 - top) * down - lift * S.h * 0.6
        const al = 1 - lift
        const pts = [L, top, R, top]
        for (let i = 0; i <= 16; i++) {
          const x = R - (R - L) * (i / 16)
          pts.push(x, bottom - S.h * 0.08 * (1 + Math.sin(i * 1.3 + t * 0.006)))
        }
        g.poly(pts).fill({ color: 0x4fc84a, alpha: 0.2 * al })
        for (const th of threads) {
          const x = L + (R - L) * th.u
          const sway = Math.sin(t * 0.004 + th.ph) * S.h * 0.06
          g.moveTo(x, top).quadraticCurveTo(x + sway, top + (bottom - top) * 0.5, x - sway * 0.5, top + (bottom - top) * th.len).stroke({ color: 0xc8ff9a, width: 2, alpha: 0.55 * al })
        }
        // mushrooms: a stem and a round cap with pale spots, popping up and shrinking away at the end
        for (const m of shrooms) {
          const k = Math.min(1, Math.max(0, (p - m.t) / 0.1)) * (p > 0.85 ? (1 - p) / 0.15 : 1)
          if (k <= 0) continue
          const sz = m.s * k
          caps.rect(m.x - sz * 0.22, m.y - sz * 1.1, sz * 0.44, sz * 1.1).fill(0xf0f0d8)
          caps.ellipse(m.x, m.y - sz * 1.1, sz * 0.75, sz * 0.5).fill(m.c)
          caps.circle(m.x - sz * 0.25, m.y - sz * 1.25, sz * 0.12).fill(0xffffff)
          caps.circle(m.x + sz * 0.2, m.y - sz * 1.15, sz * 0.09).fill(0xffffff)
        }
        if (p < 0.9 && Math.random() < 0.8) emit(L + Math.random() * (R - L), top + Math.random() * (bottom - top) * 0.6, { n: 1, color: [0xd8ff9a, 0xa8f07a, 0xffffff], size: 0.32, size1: 0.1, speed: 15, angle: Math.PI / 2, spread: 1, gravity: 25, life: 1600, fadeIn: 0.2 })
        if (p >= 1) {
          g.destroy()
          caps.destroy()
        }
      })
    }
    // a soft column of light standing on the ground (heals, buffs, revivals, under a geyser)
    function pillar(x, y, w, h, color, dur, peak = 1) {
      const s = new P.Sprite(pillarTex)
      s.anchor.set(0.5, 1)
      s.tint = color
      s.position.set(x, y)
      fxLayer.addChild(s)
      tween(dur, p => {
        const f = Math.sin(Math.PI * Math.min(1, p))
        s.width = w * (0.4 + 0.6 * f)
        s.height = h * (0.7 + 0.3 * Math.min(1, p * 3))
        s.alpha = f * peak
        if (p >= 1) s.destroy()
      })
    }
    // a blade's cut: a crescent swept across the foe, white at its core; tilt turns the swing (+ flatter)
    function slashArc(x, y, r, dir, color, { tilt = 0, dur = 300, width = 1 } = {}) {
      const g = new P.Graphics()
      g.position.set(x, y)
      g.scale.x = dir
      g.rotation = dir * tilt
      fxLayer.addChild(g)
      const start = -2.1
      const sweep = 2.5
      const arc = (e, th, color, alpha) => {
        const N = 16
        const out = []
        const inn = []
        for (let i = 0; i <= N; i++) {
          const u = (i / N) * e
          const an = start + sweep * u
          const t = th * Math.sin(Math.PI * (i / N))
          out.push(Math.cos(an) * r, Math.sin(an) * r)
          inn.unshift(Math.cos(an) * (r - t), Math.sin(an) * (r - t))
        }
        for (let i = 0; i < inn.length; i += 2) out.push(inn[i], inn[i + 1])
        g.poly(out).fill({ color, alpha })
      }
      tween(dur, p => {
        g.clear()
        const e = Math.min(1, p / 0.4)
        const a = p < 0.4 ? 1 : 1 - (p - 0.4) / 0.6
        arc(1 - Math.pow(1 - e, 3), r * 0.22 * width, color, a)
        arc(1 - Math.pow(1 - e, 3), r * 0.08 * width, 0xffffff, a)
        if (p >= 1) g.destroy()
      })
    }
    // a thrust: a spike of light driven forward through the foe
    function thrust(x, y, dir, len, color, dur = 260) {
      const g = new P.Graphics()
      g.position.set(x, y)
      g.scale.x = dir
      fxLayer.addChild(g)
      const w = len * 0.07
      tween(dur, p => {
        g.clear()
        const e = Math.min(1, p / 0.3)
        const L = len * (1 - Math.pow(1 - e, 3))
        const a = p < 0.3 ? 1 : 1 - (p - 0.3) / 0.7
        g.poly([0, -w, L, 0, 0, w]).fill({ color, alpha: a })
        g.poly([L * 0.2, -w * 0.4, L, 0, L * 0.2, w * 0.4]).fill({ color: 0xffffff, alpha: a })
        if (p >= 1) g.destroy()
      })
    }
    // a heavy blow landing: a flash, short thick rays, a ring standing across it, sparks
    function impactStar(x, y, r, color) {
      light(x, y, color, r * 2, 260, 1.5)
      rays(x, y, color, r * 1.4, { n: 7, dur: 240 })
      shockRing(x, y, r * 1.6, color)
      emit(x, y, { n: 12, tex: "streak", color: [color, 0xffffff], size: 0.45, speed: r * 7, gravity: 600, drag: 0.08, life: 320 })
    }
    // claws: three cuts side by side
    const claws = (x, y, r, dir, color) => [-1, 0, 1].forEach(k => slashArc(x + dir * k * r * 0.12, y + k * r * 0.22, r, dir, color, { tilt: 0.5, width: 0.6, dur: 280 }))
    // a magic circle turning flat on the ground under a caster: rings, ticks, a six-pointed star, in its element's colour
    function circle(a, element, dur) {
      const color = ELEM_COL[element] ?? 0xffe680
      const R = a.h * 0.75
      const c = new P.Container()
      c.position.set(a.x0 + (a.dash || 0), a.y0)
      c.scale.set(1, 0.32)
      const g = new P.Graphics()
      g.circle(0, 0, R).stroke({ color, width: R * 0.035 })
      g.circle(0, 0, R * 0.86).stroke({ color, width: R * 0.018 })
      g.circle(0, 0, R * 0.5).stroke({ color, width: R * 0.02 })
      for (let k = 0; k < 24; k++) {
        const an = (k / 24) * Math.PI * 2
        const r1 = R * (k % 2 ? 0.92 : 0.96)
        g.moveTo(Math.cos(an) * R * 0.86, Math.sin(an) * R * 0.86).lineTo(Math.cos(an) * r1, Math.sin(an) * r1)
      }
      g.stroke({ color, width: R * 0.015 })
      for (const off of [0, Math.PI / 3]) {
        const pts = [0, 1, 2].flatMap(k => {
          const an = off + (k / 3) * Math.PI * 2 - Math.PI / 2
          return [Math.cos(an) * R * 0.86, Math.sin(an) * R * 0.86]
        })
        g.poly(pts).stroke({ color, width: R * 0.02 })
      }
      for (let k = 0; k < 6; k++) {
        const an = (k / 6) * Math.PI * 2
        g.circle(Math.cos(an) * R * 0.68, Math.sin(an) * R * 0.68, R * 0.06).stroke({ color, width: R * 0.015 })
      }
      c.addChild(g)
      fxLayer.addChild(c)
      tween(dur, p => {
        g.rotation = (p * dur) / 900
        const s = p < 0.15 ? 0.6 + 0.4 * (p / 0.15) : 1
        g.scale.set(s)
        c.alpha = p < 0.15 ? p / 0.15 : 1 - Math.max(0, p - 0.6) / 0.4
        if (p >= 1) c.destroy(GONE)
      })
      emit(a.x0, a.y0 - a.h * 0.2, { n: 12, color: [color, 0xffffff], size: 0.35, speed: 60, up: 120, gravity: -120, life: dur, jitter: a.h * 0.4 })
    }
    // the blow on a foe for a hit with no drawn effect of its own: its element's burst and its style's cut
    function hitFx(a, src, style, el, big, crit) {
      const m = mid(a)
      const dir = src ? src.dir : -(a.dir || 1)
      const k = (big ? 1.25 : 1) * (crit ? 1.2 : 1)
      if (el === "fire") fireExplosion(m.x, m.y, a.h * 0.35 * k)
      else if (el === "water") splash(a, big)
      else if (el === "nature") leaves(a, big)
      const c = el !== "physical" ? ELEM_COL[el] || 0xeef4ff : 0xeef4ff
      if (style === "slash") slashArc(m.x, m.y, a.h * 0.5 * k, dir, c, { tilt: (Math.random() - 0.5) * 0.7 })
      else if (style === "stab") thrust(m.x - dir * a.h * 0.35, m.y, dir, a.h * 0.9 * k, c)
      else if (style === "magic") light(m.x, m.y, c, a.h * 0.8 * k, 300, 1.4)
      else impactStar(m.x, m.y, a.h * (style === "ranged" ? 0.3 : 0.45) * k, el !== "physical" ? c : 0xffe3a3)
    }
    // a shot leaving: a flash and a ring standing across the line of flight, sparks thrown forward
    function muzzle(pt, a, color, big) {
      light(pt.x, pt.y, color, a.h * (big ? 0.45 : 0.3), big ? 320 : 220, 1.4)
      const g = new P.Graphics()
      g.position.set(pt.x, pt.y)
      fxLayer.addChild(g)
      tween(big ? 320 : 240, p => {
        g.clear()
        const r = a.h * (0.05 + (big ? 0.42 : 0.26) * ease(p))
        g.ellipse(0, 0, r * 0.55, r).stroke({ color, width: a.h * 0.035 * (1 - p) + 1, alpha: 1 - p })
        if (p >= 1) g.destroy()
      })
      for (let k = 0; k < (big ? 12 : 7); k++) {
        const s = new P.Sprite(dot)
        s.anchor.set(0.5)
        s.tint = color
        s.position.set(pt.x, pt.y)
        s.scale.set(0.35)
        partLayer.addChild(s)
        const an = (Math.random() - 0.5) * 0.9
        const v = 190 * (0.5 + Math.random())
        parts.push({ s, vx: Math.cos(an) * v * a.dir, vy: Math.sin(an) * v, t0: now(), life: 260, g: 0 })
      }
    }
    // a shot that goes through: a beam from the shooter on past the target to the edge of the stage
    function beam(from, to, color, h) {
      const dx = to.x - from.x
      const dy = to.y - from.y
      const len = Math.hypot(dx, dy) || 1
      const W = app.screen.width
      const end = { x: to.x + (dx / len) * W, y: to.y + (dy / len) * W }
      const g = new P.Graphics()
      fxLayer.addChild(g)
      tween(340, p => {
        g.clear()
        g.moveTo(from.x, from.y).lineTo(end.x, end.y).stroke({ color, width: h * 0.07 * (1 - p) + 2, alpha: 1 - p, cap: "round" })
        g.moveTo(from.x, from.y).lineTo(end.x, end.y).stroke({ color: 0xffffff, width: 2, alpha: 1 - p })
        if (p >= 1) g.destroy()
      })
    }
    // ----- effect toolkit -----
    const mixColor = (a, b, p) => {
      const c = sh => Math.round(lerp((a >> sh) & 255, (b >> sh) & 255, p)) << sh
      return c(16) | c(8) | c(0)
    }
    // (at most this many sparks at once, fewer as the quality steps down: firestorm alone put up 1600)
    const MAX_PARTS = 700
    // particles: n of them from (x, y); angle / spread in radians (0 = right, -PI/2 = up, none = all round); size /
    // size1 and color / color1 change over the life; drag slows them (share of speed kept per second); to() pulls them
    // toward a moving point; tex "streak" draws them as streaks along their flight, "smoke" as puffs that do not glow
    function emit(x, y, o = {}) {
      const n = Math.min(Math.ceil((o.n ?? 10) * (many ? 0.35 : 1) * perf.fx), Math.floor(MAX_PARTS * perf.fx) - parts.length)
      const tex = o.tex === "smoke" ? smokeTex : o.tex === "streak" ? streakTex : o.tex === "leaf" ? leafTex : dot
      // smoke and leaves are solid things: drawn over the bodies without glowing
      const layer = o.tex === "smoke" || o.tex === "leaf" ? smokeLayer : partLayer
      const cols = [].concat(o.color ?? 0xffffff)
      for (let k = 0; k < n; k++) {
        const s = new P.Sprite(tex)
        s.anchor.set(o.tex === "streak" ? 1 : 0.5, 0.5)
        const c0 = cols[Math.floor(Math.random() * cols.length)]
        s.tint = c0
        const j = o.jitter || 0
        s.position.set(x + (Math.random() - 0.5) * j, y + (Math.random() - 0.5) * j * (o.flat ?? 1))
        const ang = o.angle == null ? Math.random() * Math.PI * 2 : o.angle + (Math.random() - 0.5) * (o.spread ?? 0.6)
        const v = (o.speed ?? 200) * (0.4 + Math.random() * 0.8)
        const s0 = (o.size ?? 0.5) * (0.6 + Math.random() * 0.8)
        s.scale.set(s0)
        if (o.tex === "smoke" || o.tex === "leaf") s.rotation = Math.random() * 6.3
        layer.addChild(s)
        parts.push({
          s,
          vx: Math.cos(ang) * v,
          vy: Math.sin(ang) * v - (o.up || 0),
          t0: now(),
          life: (o.life ?? 600) * (0.6 + Math.random() * 0.6),
          g: o.gravity ?? 0,
          drag: o.drag,
          s0,
          s1: o.size1 != null ? (o.size1 * s0) / (o.size ?? 0.5) : null,
          c0,
          c1: o.color1 ?? null,
          a0: o.alpha,
          fadeIn: o.fadeIn,
          to: o.to,
          pull: o.pull || 0,
          spin: o.tex === "smoke" ? (Math.random() - 0.5) * 1.2 : o.tex === "leaf" ? (Math.random() - 0.5) * 8 : 0,
          stretch: o.tex === "streak" ? (o.stretch ?? 0.004) : 0,
          orb: o.orbit && { ...o.orbit, ang: Math.random() * Math.PI * 2 },
        })
      }
    }
    // energy drawn in to a point while a skill gathers: motes start on a ring round it and fall inward
    function gather(at, color, h, ms) {
      tween(ms, p => {
        const T = at()
        if (!T || p >= 1) return
        for (let k = 0; k < 2; k++) {
          const an = Math.random() * Math.PI * 2
          const r = h * (0.35 + Math.random() * 0.3)
          emit(T.x + Math.cos(an) * r, T.y + Math.sin(an) * r, { n: 1, color: [color, 0xffffff], size: 0.32, speed: 1, life: 320, to: at, pull: 38, drag: 0.02, fadeIn: 0.3 })
        }
      })
    }
    // light rays bursting out of a point
    function rays(x, y, color, h, { n = 9, dur = 260 } = {}) {
      for (let k = 0; k < n; k++) {
        const s = new P.Sprite(rayTex)
        s.anchor.set(0, 0.5)
        s.tint = k % 3 ? color : 0xffffff
        s.position.set(x, y)
        s.rotation = (k / n) * Math.PI * 2 + Math.random() * 0.5
        const len = h * (0.5 + Math.random() * 0.5)
        fxLayer.addChild(s)
        tween(dur, p => {
          s.scale.set((len / 128) * ease(p), (0.25 + 0.5 * (1 - p)) * (h / 160))
          s.alpha = 1 - p
          if (p >= 1) s.destroy()
        })
      }
    }
    // a slow-motion beat: k of real speed for ms of real time
    function slow(ms, k) {
      if (many) return
      slowUntil = Math.max(slowUntil, performance.now() + ms)
      slowK = k
    }
    function focusOn(x, y, amt, ms) {
      if (many) return
      focus = { x, y, amt, t0: now(), until: now() + ms }
    }
    // the air shimmers over a hot area (a displacement filter on the scene, its map drifting) for dur ms
    function haze(x, y, w, h, dur, amp = 7) {
      if (perf.level >= 2) return
      const map = new P.Sprite(hazeTex)
      map.anchor.set(0.5)
      map.position.set(x, y)
      map.width = w
      map.height = h
      map.alpha = 0
      fxLayer.addChild(map)
      const f = new P.DisplacementFilter({ sprite: map, scale: 0 })
      hazeFx.add(f)
      setHazeFx()
      tween(dur, p => {
        const a = amp * Math.sin(Math.PI * Math.min(1, p * 1.4)) * (p > 0.7 ? (1 - p) / 0.3 : 1)
        f.scale.x = a * (1 + 0.3 * Math.sin(p * dur * 0.02))
        f.scale.y = a
        map.position.set(x + Math.sin(p * dur * 0.006) * w * 0.06, y - p * h * 0.15)
        if (p >= 1) {
          hazeFx.delete(f)
          setHazeFx()
          map.destroy()
        }
      })
    }
    // a radial blur punched out from a point (a heavy blow)
    // (the passes over the whole scene, a radial blur, a shockwave, heat haze, are left out from quality step 2: on a weak
    // phone GPU they cost more than anything else drawn)
    function zoomBlur(x, y, dur, strength = 0.05) {
      if (!F.ZoomBlurFilter || perf.level >= 2) return
      const f = new F.ZoomBlurFilter({ strength, center: { x, y }, innerRadius: 90 })
      worldFx.add(f)
      setWorldFx()
      tween(dur, p => {
        f.strength = strength * (1 - p) * (1 - p)
        if (p >= 1) {
          worldFx.delete(f)
          setWorldFx()
        }
      })
    }
    // a mark on the ground that fades out: a scorch (dark, its glowing rim cooling), a crack, a spent arrow
    function decal(kind, x, y, r, { color = 0xff7a2a, dir = 1, dur = 2600 } = {}) {
      const g = new P.Graphics()
      g.position.set(x, y)
      if (kind === "scorch") {
        for (let k = 0; k < 4; k++) g.ellipse((Math.random() - 0.5) * r * 0.3, 0, r * (1 - k * 0.2), r * 0.24 * (1 - k * 0.2)).fill({ color: 0x140804, alpha: 0.22 })
        const rim = new P.Graphics()
        rim.ellipse(0, 0, r * 0.85, r * 0.2).stroke({ color, width: r * 0.08, alpha: 0.9 })
        rim.blendMode = "add"
        g.addChild(rim)
        tween(900, p => (rim.alpha = 1 - p))
      } else if (kind === "crack") {
        for (let k = 0; k < 7; k++) {
          const an = (k / 7) * Math.PI * 2 + Math.random() * 0.4
          g.moveTo(0, 0)
          for (let st = 1; st <= 3; st++) g.lineTo(Math.cos(an + (Math.random() - 0.5) * 0.5) * r * st * 0.33, Math.sin(an + (Math.random() - 0.5) * 0.5) * r * st * 0.33 * 0.25)
        }
        g.stroke({ color: 0x1a120c, width: r * 0.035, alpha: 0.75 })
      } else if (kind === "frost") {
        // a pale icy patch with spikes standing up round it
        g.ellipse(0, 0, r, r * 0.24).fill({ color: 0xcff2ff, alpha: 0.35 })
        for (let k = 0; k < 9; k++) {
          const x = (Math.random() - 0.5) * r * 1.6
          const sh = r * (0.12 + Math.random() * 0.22)
          g.poly([x - r * 0.04, 0, x, -sh, x + r * 0.04, 0]).fill({ color: k % 2 ? 0xe8fbff : 0x9fe6ff, alpha: 0.85 })
        }
      } else if (kind === "vines") {
        // green tendrils curling up out of the ground round the legs
        for (let k = 0; k < 6; k++) {
          const x = (k / 5 - 0.5) * r * 0.8
          const hh = r * (0.35 + Math.random() * 0.3)
          const bend = (Math.random() - 0.5) * r * 0.4
          g.moveTo(x, 0).quadraticCurveTo(x + bend, -hh * 0.6, x - bend * 0.5, -hh).stroke({ color: k % 2 ? 0x3f9a3a : 0x5fc350, width: r * 0.035, cap: "round" })
          g.ellipse(x - bend * 0.5, -hh, r * 0.05, r * 0.025).fill(0x8fe86a)
        }
      } else if (kind === "arrow") {
        // stuck in the ground at a slant, fletching up
        const ex = -dir * r * 0.45
        const ey = -r * 0.8
        g.moveTo(0, 0).lineTo(ex, ey).stroke({ color: 0x8a5a2b, width: r * 0.05 })
        g.moveTo(ex, ey).lineTo(ex - dir * r * 0.08, ey - r * 0.12).stroke({ color, width: r * 0.09 })
      }
      // vines wind round the legs, in front of the body; the rest lie under everyone
      ;(kind === "vines" ? smokeLayer : decalLayer).addChild(g)
      tween(dur, p => {
        g.alpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3
        if (p >= 1) g.destroy(GONE)
      })
    }
    // a crescent of light (a blade's wave) thrown forward through the foes
    function crescent(from, dir, color, h, dist, dur) {
      const g = new P.Graphics()
      const R = h * 0.6
      g.arc(0, 0, R, -1.2, 1.2).arc(-R * 0.35, 0, R * 0.85, 1.05, -1.05, true).fill(color)
      g.arc(0, 0, R * 0.92, -0.9, 0.9).arc(-R * 0.2, 0, R * 0.8, 0.8, -0.8, true).fill(0xffffff)
      g.position.set(from.x, from.y)
      g.scale.set(dir * 0.6, 0.6)
      partLayer.addChild(g)
      tween(dur, p => {
        g.x = from.x + dir * dist * ease(p)
        g.scale.set(dir * (0.6 + 0.7 * p), 0.6 + 0.7 * p)
        g.alpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3
        if (Math.random() < 0.7) emit(g.x, g.y + (Math.random() - 0.5) * R, { n: 1, tex: "streak", color, size: 0.4, speed: 120, angle: dir > 0 ? Math.PI : 0, spread: 0.4, life: 260 })
        if (p >= 1) g.destroy()
      })
    }
    function sparks(x, y, color, n, { speed = 260, up = 0, life = 600, size = 0.5, gravity = 500 } = {}) {
      if (many) n = Math.ceil(n * 0.35)
      for (let k = 0; k < n; k++) {
        const s = new P.Sprite(dot)
        s.anchor.set(0.5)
        s.tint = color
        s.position.set(x, y)
        const ang = Math.random() * Math.PI * 2
        const v = speed * (0.3 + Math.random() * 0.9)
        s.scale.set(size * (0.5 + Math.random()))
        partLayer.addChild(s)
        parts.push({ s, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v - up, t0: now(), life: life * (0.6 + Math.random() * 0.6), g: gravity })
      }
    }
    function light(x, y, color, r, dur, peak = 1) {
      // (a crowd's dozens of blows at once would light the whole stage white)
      if (many) return
      const s = new P.Sprite(glow)
      s.anchor.set(0.5)
      s.tint = color
      s.position.set(x, y)
      s.width = s.height = r * 2
      s.alpha = 0
      lights.addChild(s)
      tween(dur, p => {
        s.alpha = peak * Math.sin(Math.PI * Math.min(1, p))
        if (p >= 1) s.destroy()
      })
      if (!many) tween(dur, p => (dim = Math.max(dim, 0.45 * Math.sin(Math.PI * Math.min(1, p)))))
    }
    // the numbers and skill names sized to the stage: as drawn on a stage 760 px wide or more, smaller on a narrower one
    // (a phone's, about 340 px: at full size they covered the show), down to 55 %
    const textK = () => Math.max(0.55, Math.min(1, app.screen.width / 760))
    function number(a, text, color, big) {
      const k = textK()
      const tx = new P.Text({ text, style: { fontFamily: "sans-serif", fontSize: (big ? 30 : 20) * (many ? 0.65 : 1) * k, fontWeight: "900", fill: color, stroke: { color: "#000", width: (big ? 6 : 4) * k }, dropShadow: { color: "#000", blur: 4 * k, distance: 0, alpha: 0.8 } } })
      tx.anchor.set(0.5)
      const x = a.x0 + (Math.random() - 0.5) * a.h * 0.3
      const y = a.y0 - a.h * 0.95
      tx.position.set(x, y)
      textLayer.addChild(tx)
      tween(big ? 1100 : 850, p => {
        tx.position.y = y - 46 * k * ease(p)
        tx.scale.set(p < 0.15 ? lerp(big ? 2.2 : 1.5, 1, p / 0.15) : 1)
        tx.alpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3
        if (p >= 1) tx.destroy()
      })
    }
    function flash(a, color, dur = 220) {
      const c = new P.Color(color).toArray()
      a.uni.uColor = new Float32Array([c[0], c[1], c[2]])
      tween(dur, p => (a.uni.uFlash = p >= 1 ? 0 : 0.9 * (1 - p)))
    }
    function crit(a) {
      if (many || perf.level >= 2) return
      shake = Math.max(shake, 1)
      punch = 1
      const f = new F.ShockwaveFilter({ center: { x: a.x0, y: a.y0 - a.h * 0.4 }, amplitude: 14, wavelength: 110, speed: 560, brightness: 1.05, radius: a.h * 2.4 })
      if (shock) worldFx.delete(shock.f)
      shock = { f, t0: now() }
      worldFx.add(f)
      setWorldFx()
    }
    const mid = a => ({ x: a.x0 + (a.dash || 0), y: a.y0 - a.h * 0.45 })
    // the weapon's tip and grip in world coordinates (null without a weapon)
    function tipOf(a, inner = 1) {
      const q = a.rig?.by[a.act?.def.tip === "off" ? "off" : "weapon"]
      // (a unit set up again while something still follows it, a skill's motes drawn to its blade: gone)
      if (!q?.tip || a.rig.fallen || q.s.destroyed) return null
      const sp = q.s.children[0]
      if (!sp) return null
      const g = sp.toGlobal(new P.Point(q.p.pivot[0] + (q.tip[0] - q.p.pivot[0]) * inner, q.p.pivot[1] + (q.tip[1] - q.p.pivot[1]) * inner))
      return world.toLocal(g)
    }
    // a beast's mouth (act.from "head": what it spits or breathes leaves from there): the front of its head piece, low
    function mouthOf(a) {
      // (a fish without a head of its own: the front of its body)
      const q = a.rig?.by.head || (a.rig?.def.tmpl === "fish" && a.rig.by.torso)
      if (!q || a.rig.fallen || q.s.destroyed) return null
      const sp = q.s.children[0]
      if (!sp) return null
      // (rig art faces left: the front is the piece's left edge)
      return world.toLocal(sp.toGlobal(new P.Point(sp.texture.width * 0.1, sp.texture.height * 0.6)))
    }
    // a hand's place in world coordinates (a bow's grip: where its arrows leave from)
    function handOf(a, name) {
      const q = a.rig?.by[name]
      if (!q || a.rig.fallen || q.s.destroyed) return null
      return world.toLocal(q.s.toGlobal(new P.Point(0, 0)))
    }
    // a missile from A to B over dur ms along an arc (arc: the rise as a share of the distance): "arrow" (a drawn shaft,
    // coloured head and fletching), "orb" (a glowing ball trailing sparks); big for a skill
    // arrows and orbs leave a fading streak with sparks hanging in the air; an orb trails its element (flames, drops,
    // leaves)
    function shoot(kind, A, B, dur, { color = 0xffffff, big = false, arc = 0.12, h = 100, element = "", onFly = null, onLand = null } = {}) {
      const dist = Math.hypot(B.x - A.x, B.y - A.y)
      let s
      if (kind === "arrow") {
        s = new P.Graphics()
        const L = h * (big ? 0.42 : 0.32)
        const wd = h * (big ? 0.022 : 0.016)
        s.moveTo(-L, 0).lineTo(0, 0).stroke({ width: wd, color: 0x8a5a2b, cap: "round" })
        s.poly([0, -wd * 2.6, L * 0.2, 0, 0, wd * 2.6]).fill(big ? color : 0xdfe6f0)
        s.poly([-L, 0, -L * 0.82, -wd * 2.4, -L * 0.7, -wd * 2.4, -L * 0.86, 0, -L * 0.7, wd * 2.4, -L * 0.82, wd * 2.4]).fill(big ? color : 0xf2f2f2)
        shotLayer.addChild(s)
      } else if (kind === "shard") {
        // a long pointed shard of ice, pale at the core, flown flat (no arc)
        s = new P.Graphics()
        const L = h * 0.5
        const wd = h * 0.05
        s.poly([L * 0.5, 0, 0, -wd, -L * 0.5, 0, 0, wd]).fill(color)
        s.poly([L * 0.4, 0, 0, -wd * 0.4, -L * 0.3, 0, 0, wd * 0.4]).fill(0xeaf8ff)
        partLayer.addChild(s)
        arc = 0
      } else {
        s = new P.Container()
        const halo = new P.Sprite(glow)
        halo.anchor.set(0.5)
        halo.tint = color
        halo.width = halo.height = h * (big ? 0.62 : 0.42)
        const core = new P.Sprite(glow)
        core.anchor.set(0.5)
        core.width = core.height = h * (big ? 0.26 : 0.18)
        s.addChild(halo, core)
        partLayer.addChild(s)
      }
      s.position.set(A.x, A.y)
      const at = p => ({ x: lerp(A.x, B.x, p), y: lerp(A.y, B.y, p) - arc * dist * 4 * p * (1 - p) })
      const streak = kind === "arrow" || kind === "orb" ? new P.Graphics() : null
      if (streak) fxLayer.addChild(streak)
      const pts = []
      tween(dur, p => {
        const q = at(p)
        const n = at(Math.min(1, p + 0.02))
        s.position.set(q.x, q.y)
        if (kind !== "orb") s.rotation = Math.atan2(n.y - q.y, n.x - q.x)
        else {
          s.scale.set(1 + 0.12 * Math.sin(p * dur * 0.05))
          if (element === "fire") emit(q.x, q.y, { n: 1, color: FIRE, color1: 0x5a0800, alpha: 0.55, size: 0.6 * K(h) * (big ? 1 : 0.7), size1: 0.1, speed: 30, gravity: -h * 0.8, life: 380, jitter: h * 0.08 })
          else if (element === "water" && Math.random() < 0.7) emit(q.x, q.y, { n: 1, color: [0x8fdcff, 0xffffff], size: 0.35, speed: 40, gravity: 600, life: 400, jitter: h * 0.1 })
          else if (element === "nature" && Math.random() < 0.5) emit(q.x, q.y, { n: 1, tex: "leaf", color: [0x5fd35a, 0x8fe86a], size: 0.35, speed: 40, gravity: 150, life: 600 })
        }
        if (kind !== "arrow" && Math.random() < 0.8) sparks(q.x, q.y, color, 1, { speed: 30, gravity: 0, life: 350, size: big ? 0.5 : 0.35 })
        if (streak) {
          // a ribbon over the last few points, white toward the head
          pts.push(q)
          if (pts.length > 10) pts.shift()
          streak.clear()
          for (let k = 1; k < pts.length; k++)
            streak.moveTo(pts[k - 1].x, pts[k - 1].y).lineTo(pts[k].x, pts[k].y).stroke({ color: k > pts.length - 3 ? 0xffffff : color, width: (1 + (k / pts.length) * (big ? 5 : 3)) * (h / 100), alpha: (k / pts.length) * 0.85, cap: "round" })
          if (Math.random() < 0.5) sparks(q.x, q.y, color, 1, { speed: 40, gravity: 0, life: 300, size: 0.25 })
        }
        onFly?.(q)
        if (p >= 1) {
          s.destroy()
          streak?.destroy()
          onLand?.(B)
        }
      })
    }
    function relicGlow(a) {
      const h = handOf(a, "ho")
      if (!h) return
      light(h.x, h.y, 0xffe9a0, a.h * 0.4, 600, 1.3)
      sparks(h.x, h.y, 0xffe9a0, 14, { speed: 90, gravity: 0, life: 500, size: 0.35 })
    }
    function banner(a, text, color) {
      if (!text || many) return
      const k = textK()
      const tx = new P.Text({ text, style: { fontFamily: "sans-serif", fontSize: 22 * k, fontWeight: "900", fill: new P.Color(color).toHex(), stroke: { color: "#000", width: 5 * k }, dropShadow: { color: "#000", blur: 6 * k, distance: 0, alpha: 0.9 } } })
      tx.anchor.set(0.5)
      const y = a.y0 - a.h * 1.25
      tx.position.set(a.x0, y)
      textLayer.addChild(tx)
      tween(1000, p => {
        tx.scale.set(p < 0.12 ? lerp(1.8, 1, p / 0.12) : 1)
        tx.position.y = y - 14 * k * p
        tx.alpha = p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25
        if (p >= 1) tx.destroy()
      })
    }
    // a shock ring along the ground where the unit lands
    function ring(a, color) {
      const g = new P.Graphics()
      g.position.set(a.x0 + (a.dash || 0), a.y0)
      fxLayer.addChild(g)
      tween(520, p => {
        g.clear()
        const r = a.h * (0.3 + 1.4 * ease(p))
        g.ellipse(0, 0, r, r * 0.22).stroke({ color, width: a.h * 0.06 * (1 - p), alpha: 1 - p })
        if (p >= 1) g.destroy()
      })
      sparks(a.x0 + (a.dash || 0), a.y0, 0xd8c8a8, 26, { speed: 220, up: 120, gravity: 600, life: 600, size: 0.4 })
      shake = Math.max(shake, 0.8)
    }
    // the blade's light trail: a ribbon between the tip and a point down the blade, fading over trail.life ms
    let trailG = null
    function trails(t) {
      if (!trailG) {
        trailG = new P.Graphics()
        fxLayer.addChild(trailG)
      }
      trailG.clear()
      for (const side of ["p", "m"])
        for (const a of units[side]) {
          const T = a.trail
          if (!T) continue
          if (T.on) {
            const o = tipOf(a)
            const i = tipOf(a, 0.35)
            const last = T.pts[T.pts.length - 1]
            if (o && i && (!last || Math.hypot(o.x - last.o.x, o.y - last.o.y) > 2)) T.pts.push({ o, i, t })
          }
          while (T.pts.length && t - T.pts[0].t > T.life) T.pts.shift()
          for (let k = 1; k < T.pts.length; k++) {
            const A = T.pts[k - 1]
            const B = T.pts[k]
            // only fast swings leave light (a slow drift of the blade does not)
            if (Math.hypot(B.o.x - A.o.x, B.o.y - A.o.y) < 6) continue
            const age = 1 - (t - B.t) / T.life
            const ii = { x: lerp(B.o.x, B.i.x, T.w), y: lerp(B.o.y, B.i.y, T.w) }
            const ia = { x: lerp(A.o.x, A.i.x, T.w), y: lerp(A.o.y, A.i.y, T.w) }
            trailG.poly([A.o.x, A.o.y, B.o.x, B.o.y, ii.x, ii.y, ia.x, ia.y]).fill({ color: T.color, alpha: 0.6 * age * age })
            const ci = { x: lerp(B.o.x, B.i.x, T.w * 0.3), y: lerp(B.o.y, B.i.y, T.w * 0.3) }
            const ca = { x: lerp(A.o.x, A.i.x, T.w * 0.3), y: lerp(A.o.y, A.i.y, T.w * 0.3) }
            trailG.poly([A.o.x, A.o.y, B.o.x, B.o.y, ci.x, ci.y, ca.x, ca.y]).fill({ color: 0xffffff, alpha: 0.85 * age * age * age })
          }
        }
    }

    function hit(a, tg, src, e, isSkill, shown) {
      if (!a) return
      const el = e.element || "physical"
      const color = COLOR[el] || COLOR.physical
      const m = mid(a)
      a.hp = tg.hp
      if (tg.dHP === 0) return number(a, "Miss", "#cfd6ff", false)
      // the skill's own body was drawn already (shown); else its element's burst and its style's cut
      if (!shown) hitFx(a, src, e.style || "smash", el, isSkill, tg.crit)
      sparks(m.x, m.y, color, tg.crit ? 70 : 18, { speed: tg.crit ? 420 : 240, size: tg.crit ? 0.7 : 0.45 })
      flash(a, tg.crit ? 0xfff2a0 : 0xffffff)
      a.jig = tg.crit ? 1.3 : 0.9
      number(a, String(-tg.dHP), tg.crit ? "#ffd84a" : "#ffffff", tg.crit)
      if (tg.crit) {
        crit(a)
        slow(160, 0.3)
        focusOn(m.x, m.y, 0.06, 420)
      }
      if (tg.died) {
        slow(280, 0.25)
        focusOn(m.x, m.y, 0.08, 600)
      }
      // (the test page's own stun lasts its set time; a real one shows from the blow that brought it)
      if (tg.stunned && !tg.died) a.stunUntil = now() + tg.stunned
      if (a.u.stunned) a.stunSeen = a.u.stunned
      if (isSkill && !tg.died) afflict(a, e.ab)
      drawHp(a)
      if (tg.died) die(a)
      else if ((a.rig || a.flat) && !a.act?.def.hit) play1(a, "hurt")
    }
    // a.life counts deaths and revivals: a burn-away or rebuild still running from an earlier one leaves the body
    // alone (a revival during the 2.4 s burn used to be burnt away again, the unit invisible until its next death)
    // stunned: three stars circling over the head while it lasts. A real stun (the battle flags the unit) shows from
    // the blow that brought it (a second at the latest, when that blow was not drawn) until the flag goes, and never
    // longer than the game's longest stun (stunning blow, 3 s) since its start, in case the update ending it is missed.
    const STUN_MAX = 3300
    function isStunned(a, t) {
      if (a.dead) return false
      if (a.stunUntil > t) return true
      const s = a.u.stunned
      if (!s) return false
      const age = Date.now() - s
      return age < STUN_MAX && (a.stunSeen === s || age > 1000)
    }
    function stunFrame(a, t) {
      const on = isStunned(a, t)
      if (!on && !a.stars?.visible) return
      if (!a.stars) {
        a.stars = new P.Container()
        for (let k = 0; k < 3; k++) {
          const s = new P.Text({ text: "★", style: { fontFamily: "sans-serif", fontSize: 18 * textK(), fill: "#ffe14a", stroke: { color: "#6b4a00", width: 3 } } })
          s.anchor.set(0.5)
          a.stars.addChild(s)
        }
        a.cont.addChild(a.stars)
        a.stars.alpha = 0
      }
      // (fading in and out over a fifth of a second)
      a.stars.visible = true
      a.stars.alpha = Math.max(0, Math.min(1, a.stars.alpha + (on ? dt : -dt) * 5))
      if (!on && a.stars.alpha <= 0) return void (a.stars.visible = false)
      a.stars.children.forEach((s, k) => {
        const an = (t * Math.PI) / 300 + (k * Math.PI * 2) / 3
        s.position.set(Math.cos(an) * a.h * 0.28, -a.h * 1.02 + Math.sin(an) * a.h * 0.07)
        s.scale.set(Math.sin(an) > 0 ? 1 : 0.75)
      })
    }
    function die(a) {
      a.dead = true
      const life = ++a.life
      drawHp(a)
      a.hud.visible = false
      if (a.flat) {
        play1(a, "dead")
        return tween(1500, p => a.life === life && (a.uni.uDis = ease(p)), 900)
      }
      if (!a.rig) return
      if (a.rig.crumble) {
        rigCrumble(a)
        tween(1500, p => a.life === life && (a.uni.uDis = ease(p)), 900)
        for (let k = 0; k < 6; k++) later(900 + k * 180, () => a.life === life && sparks(a.x0 + (Math.random() - 0.5) * a.h * 0.4, a.y0 - Math.random() * a.h * 0.6, 0xff8a3a, 10, { speed: 50, up: 90, gravity: -60, life: 1200, size: 0.35 }))
      } else play1(a, "dead")
    }
    function revive(a, tg) {
      a.dead = false
      const life = ++a.life
      a.hp = tg.hp
      a.hud.visible = true
      a.hudKey = ""
      light(a.x0, a.y0 - a.h * 0.4, COLOR.heal, a.h * 0.9, 900)
      if (a.flat) {
        play1(a, "idle")
        tween(900, p => a.life === life && (a.uni.uDis = 1 - ease(p)))
      }
      if (a.rig) {
        if (a.rig.fallen) {
          rigRise(a)
          tween(900, p => a.life === life && (a.uni.uDis = 1 - ease(p)))
        } else {
          a.uni.uDis = 0
          // getting up: a slow blend out of the lying pose
          play1(a, "idle", { blend: 650 })
        }
      }
      drawHp(a)
    }
    function heal(a, tg) {
      if (!a) return
      if (tg.revived) return revive(a, tg)
      a.hp = tg.hp
      drawHp(a)
      flash(a, COLOR.heal, 380)
      light(a.x0, a.y0 - a.h * 0.4, COLOR.heal, a.h * 0.7, 700, 0.8)
      sparks(a.x0, a.y0 - a.h * 0.2, COLOR.heal, 24, { speed: 60, up: 140, gravity: -80, life: 900, size: 0.4 })
      if (tg.dHP > 0) number(a, "+" + tg.dHP, "#6cff9a", false)
    }

    // ----- skills with their own effects on top (fly: each frame of the missile; hit: as the blow lands) -----
    const fireBurst = (a, big) => {
      const m = mid(a)
      emit(m.x, m.y, { n: big ? 40 : 26, color: [0xffe08a, 0xff9a3a, 0xff5a1a], color1: 0x601000, size: 0.4, size1: 0.08, speed: 300, up: 140, gravity: -160, drag: 0.25, life: 1200, jitter: a.h * 0.3 })
      emit(m.x, m.y - a.h * 0.35, { n: big ? 8 : 5, tex: "smoke", color: [0x5a4a42, 0x6a5a50], alpha: 0.4, size: 0.6, size1: 1.7, speed: 40, up: 70, drag: 0.4, life: 1500, jitter: a.h * 0.4 })
      decal("scorch", a.x0, a.y0, a.h * (big ? 0.75 : 0.55), { dur: 3200 })
      rays(m.x, m.y, 0xff8a3a, a.h * (big ? 1.5 : 1.1), { n: 11, dur: 320 })
    }
    const span = list => {
      const xs = list.map(a => a.x0)
      const h = Math.max(...list.map(a => a.h))
      return { cx: (Math.min(...xs) + Math.max(...xs)) / 2, w: Math.max(...xs) - Math.min(...xs) + h * 1.6, h, ground: Math.max(...list.map(a => a.y0)) }
    }
    // a blaze over the whole row: the air shimmers over it, embers keep rising, the ground left scorched
    const blaze = ({ tgs }) => {
      if (!tgs.length) return
      const list = tgs.map(([a]) => a)
      const S = span(list)
      haze(S.cx, S.ground - S.h * 0.7, S.w, S.h * 2, 1600, 9)
      zoomBlur(S.cx, S.ground - S.h * 0.5, 260, 0.06)
      shake = Math.max(shake, 1)
      list.forEach(a => fireBurst(a, true))
      tween(1300, p => {
        if (p < 1 && Math.random() < 0.7) emit(S.cx + (Math.random() - 0.5) * S.w, S.ground - Math.random() * S.h * 0.3, { n: 1, color: [0xffb04a, 0xff6a2a], color1: 0x501000, size: 0.3, size1: 0.05, speed: 30, up: 160, gravity: -60, life: 1100 })
      })
    }
    // ----- element kits (what a hit of each element throws off) -----
    // rings spreading flat on the ground (water, shock)
    function ripple(x, y, r, color, { n = 2, dur = 900, gap = 160 } = {}) {
      for (let k = 0; k < n; k++)
        later(k * gap, () => {
          const g = new P.Graphics()
          fxLayer.addChild(g)
          tween(dur, p => {
            g.clear()
            const R = r * (0.2 + 0.8 * ease(p))
            g.ellipse(x, y, R, R * 0.22).stroke({ color, width: r * 0.05 * (1 - p) + 1, alpha: (1 - p) * 0.9 })
            if (p >= 1) g.destroy()
          })
        })
    }
    // water: a splash of drops thrown up and falling, spray off the ground, a little mist, ripples underfoot
    const splash = (a, big, color = 0x5ac8ff) => {
      const m = mid(a)
      emit(m.x, m.y, { n: big ? 34 : 20, color: [color, 0xbfefff, 0xffffff], size: 0.4, size1: 0.15, speed: 340, up: 220, gravity: 900, drag: 0.4, life: 800, jitter: a.h * 0.3 })
      emit(a.x0, a.y0, { n: big ? 14 : 8, color: [color, 0xffffff], size: 0.35, speed: 260, angle: -Math.PI / 2, spread: 1.6, gravity: 1000, life: 600, jitter: a.h * 0.5, flat: 0.3 })
      emit(m.x, m.y, { n: 4, tex: "smoke", color: 0xbfe8ff, alpha: 0.3, size: 0.6, size1: 1.5, speed: 40, up: 20, drag: 0.3, life: 1100, jitter: a.h * 0.3 })
      ripple(a.x0, a.y0, a.h * (big ? 1 : 0.7), color)
    }
    // ice: shards flying off, frost glitter hanging in the air, cold mist, a frosted patch, the foe tinged blue
    const shatter = (a, big) => {
      const m = mid(a)
      emit(m.x, m.y, { n: big ? 26 : 16, tex: "streak", color: [0xbff4ff, 0x7fd8ff, 0xffffff], size: 0.45, speed: 480, up: 120, gravity: 900, drag: 0.2, life: 600, jitter: a.h * 0.2 })
      emit(m.x, m.y, { n: big ? 14 : 8, color: [0xe8fbff, 0x9fe6ff], size: 0.3, size1: 0.05, speed: 60, gravity: -20, life: 1400, jitter: a.h * 0.6 })
      emit(a.x0, a.y0 - a.h * 0.2, { n: 5, tex: "smoke", color: 0xdff6ff, alpha: 0.3, size: 0.7, size1: 1.8, speed: 30, drag: 0.3, life: 1500, jitter: a.h * 0.5, flat: 0.5 })
      decal("frost", a.x0, a.y0, a.h * (big ? 0.8 : 0.6), { dur: 3200 })
      flash(a, 0x9fe6ff, 600)
    }
    // nature: leaves torn loose and drifting down, green motes rising
    const leaves = (a, big) => {
      const m = mid(a)
      emit(m.x, m.y, { n: big ? 18 : 11, tex: "leaf", color: [0x5fd35a, 0x8fe86a, 0x3fae4a], size: 0.5, speed: 220, up: 160, gravity: 220, drag: 0.5, life: 1500, jitter: a.h * 0.3 })
      emit(m.x, m.y, { n: 10, color: [0xb8ff9a, 0xffffff], size: 0.3, size1: 0.05, speed: 80, gravity: -60, life: 1000, jitter: a.h * 0.5 })
    }
    // a cloud lingering over an area: puffs drifting up for dur ms (spores, smoke)
    const cloud = (x, y, w, h, dur, colors, alpha = 0.35) =>
      tween(dur, p => {
        if (p < 1 && Math.random() < 0.8) emit(x + (Math.random() - 0.5) * w, y - Math.random() * h, { n: 1, tex: "smoke", color: colors, alpha, size: 0.5, size1: 1.4, speed: 20, up: 15, drag: 0.5, life: 1300, fadeIn: 0.3 })
      })
    // rock and earth thrown up by a heavy blow
    const debris = (x, y, h, n = 14) => emit(x, y, { n, color: [0x8a7458, 0x6a5840, 0xb09a78], size: 0.35, speed: 320, angle: -Math.PI / 2, spread: 1.8, gravity: 1300, life: 700, jitter: h * 0.4, flat: 0.3 })
    // a blade's spray carried on through the foe out of its back
    const through = (a, dir, color, n = 18) => {
      const m = mid(a)
      emit(m.x + dir * a.h * 0.2, m.y, { n, tex: "streak", color: [color, 0xffffff], size: 0.5, speed: 760, angle: dir > 0 ? 0 : Math.PI, spread: 0.35, drag: 0.05, life: 280 })
    }
    // a ring standing up across a blow (a shield's shock, an arrow's punch)
    // ----- the spear: every thrust a lance of light along the spear, from the hand out through the tip and on past the
    // foe, cone rings rippling along it and a spray out of the foe's back; a skill's twice as long and thick -----
    function lance(from, to, color, h, { over = 1.3, w = 0.08, dur = 320, delay = 0 } = {}) {
      const dx = to.x - from.x
      const dy = to.y - from.y
      const len = Math.hypot(dx, dy) + h * over
      const g = new P.Graphics()
      g.position.set(from.x, from.y)
      g.rotation = Math.atan2(dy, dx)
      g.visible = false
      fxLayer.addChild(g)
      tween(
        dur,
        p => {
          g.visible = true
          g.clear()
          const e = Math.min(1, p / 0.25)
          const L = len * (1 - Math.pow(1 - e, 3))
          const a = p < 0.25 ? 1 : 1 - (p - 0.25) / 0.75
          const th = h * w * (p < 0.25 ? 1 : 1 - (0.6 * (p - 0.25)) / 0.75)
          g.poly([0, -th * 2.4, L, 0, 0, th * 2.4]).fill({ color, alpha: a * 0.3 })
          g.poly([0, -th, L, 0, 0, th]).fill({ color, alpha: a })
          g.poly([L * 0.1, -th * 0.35, L, 0, L * 0.1, th * 0.35]).fill({ color: 0xffffff, alpha: a })
          if (p >= 1) g.destroy()
        },
        delay,
      )
    }
    // shock rings one after another along a line (the air the thrust punched through)
    function coneRings(x, y, ang, color, h, n = 3) {
      for (let k = 0; k < n; k++) later(k * 45, () => shockRing(x + Math.cos(ang) * k * h * 0.38, y + Math.sin(ang) * k * h * 0.38, h * (1 - k * 0.18), color))
    }
    const SPEAR_COL = 0xa8dcff
    const isSpear = a => /^player:spear/.test(a?.kind || "")
    // one blow of the spear on each foe it lands on; big for a skill's last blow; name: the action (its own extras)
    function spearBlow(src, tgs, color, big, name) {
      const hand = handOf(src, "hm") || mid(src)
      const tip = tipOf(src) || mid(src)
      const ang = Math.atan2(tip.y - hand.y, tip.x - hand.x)
      for (const [a] of tgs) {
        const m = mid(a)
        // (along the spear, aimed through the foe's middle; run past it already, a dash through: from behind it)
        const to = { x: m.x, y: (m.y + tip.y) / 2 }
        const past = (hand.x - m.x) * src.dir > -a.h * 0.2
        lance(past ? { x: m.x - src.dir * a.h * 1.2, y: to.y } : hand, to, color, a.h, big ? { over: 2.4, w: 0.14, dur: 460 } : { over: 1.2, w: 0.075, dur: 280 })
        coneRings(m.x, m.y, ang, color, a.h * (big ? 1.2 : 0.8), big ? 4 : 2)
        through(a, src.dir, color, big ? 28 : 12)
        light(m.x, m.y, color, a.h * (big ? 1.5 : 0.8), big ? 320 : 220, 1.5)
        if (big) rays(m.x, m.y, color, a.h * 1.4, { n: 12, dur: 320 })
        // the overhead drive cracks the ground, the upward sweep leaves its arc
        if (name === "attack3") (decal("crack", a.x0, a.y0, a.h * 0.6), debris(a.x0, a.y0, a.h, 8))
        if (name === "attack4") slashArc(m.x, m.y, a.h * 0.55, src.dir, color, { tilt: -0.9 })
      }
      punch = Math.max(punch, big ? 0.9 : 0.4)
      shake = Math.max(shake, big ? 0.7 : 0.25)
    }
    // ----- lasting effects (as the old stage): aura rings under every ally while a side aura lasts, a glow round a unit
    // while a self buff lasts (two at most), a shield bubble while invincible; and the enhancement glow round a
    // player's weapon and off hand (+5 blue, +8 purple, +10 orange breathing, +12 red, +15 rainbow) -----
    const AURA_C = { critical_aura: 0xff8a3c, fierce_aura: 0xff3c5a, mystic_aura: 0x9a7cff, guardian_aura: 0x4aa8ff, speed_aura: 0x9cff4a }
    const BUFF_C = { berserk: 0xff3b2f, frenzy: 0xffd23c, vampirism: 0xb0102a, spike_shell: 0xff8a2a, retribution: 0xffd76a, elemental_affinity: 0xc77dff, precision: 0x5ad6ff, insanity: 0xd23cff, provoke: 0xff4040, taunt: 0xff4040, invincible: 0xffe27a }
    const sideAuras = { p: {}, m: {} } // aura key -> until (arena ms)
    const statuses = { p: {}, m: {} } // slot -> { buff key -> until }
    function grant(src, ab) {
      if (!src || !ab) return
      const until = now() + (BUFF_SECONDS[ab.key] || (AURA_C[ab.key] ? 120 : 10)) * 1000
      if (AURA_C[ab.key]) sideAuras[src.side][ab.key] = until
      else if (BUFF_SECONDS[ab.key]) (statuses[src.side][src.i] ||= {})[ab.key] = { until, kind: "buff" }
    }
    // a damage skill that lasts on the foes it hits (maim, puncture, frost surge…)
    function afflict(a, ab) {
      if (a && ab && BUFF_SECONDS[ab.key]) (statuses[a.side][a.i] ||= {})[ab.key] = { until: now() + BUFF_SECONDS[ab.key] * 1000, kind: "debuff" }
    }
    // the chips over the name: auras and buffs coloured, debuffs dark red; what doesn't fit one row folds into "+N"
    function drawChips(a, list) {
      const key = list.join() + "|" + Math.round(a.box || 0)
      if (key === a.chipKey) return
      a.chipKey = key
      a.chips.removeChildren().forEach(c => c.destroy(GONE))
      const size = Math.max(8, Math.min(14, Math.round((a.box || a.h) * 0.16)))
      const fit = Math.max(1, Math.floor(((a.box || a.h) + 2) / (size + 2)))
      const vis = list.length > fit ? list.slice(0, fit - 1) : list
      const items = vis.map(([k, kind]) => [kind, kind === "debuff" ? 0x5a1a24 : AURA_C[k] ?? 0xffd76a, (abilityInfo("/abilities/" + k)?.name || "?")[0]])
      if (list.length > vis.length) items.push(["more", 0x141828, "+" + (list.length - vis.length)])
      const total = items.length * (size + 2) - 2
      items.forEach(([kind, bg, text], n) => {
        const c = new P.Container()
        const g = new P.Graphics()
        const x = -total / 2 + n * (size + 2) + size / 2
        if (kind === "more") g.roundRect(-size / 2 - 2, -size / 2, size + 4, size, size / 2).fill({ color: bg, alpha: 0.85 }).stroke({ color: 0xffffff, width: 1, alpha: 0.35 })
        else g.circle(0, 0, size / 2).fill(bg).stroke(kind === "debuff" ? { color: 0xff5a6a, width: 1 } : { color: 0x000000, width: 1, alpha: 0.5 })
        const t = new P.Text({ text, style: { fontFamily: "sans-serif", fontSize: Math.round(size * 0.64), fontWeight: "700", fill: kind === "buff" ? "#1a1a1a" : "#ffffff" } })
        t.anchor.set(0.5)
        c.position.set(x, 0)
        c.addChild(g, t)
        a.chips.addChild(c)
      })
      a.chips.y = -size / 2 - 1
    }
    function statusFrame(a, t) {
      const st = statuses[a.side][a.i] || {}
      const auras = a.dead ? [] : Object.keys(AURA_C).filter(k => sideAuras[a.side][k] > t)
      const live = a.dead ? [] : Object.keys(st).filter(k => st[k].until > t)
      const buffs = live.filter(k => st[k].kind === "buff")
      drawChips(a, [...auras.map(k => [k, "buff"]), ...live.map(k => [k, st[k].kind])])
      drawHp(a)
      // (the rings and the shield are redrawn each frame only while there are some: an empty Graphics cleared every
      // frame is rebuilt every frame all the same)
      if (auras.length || a.ringsOn) a.rings.clear()
      a.ringsOn = auras.length > 0
      auras.forEach((k, n) => {
        const w = a.h * (0.8 + n * 0.2)
        const al = 0.55 + 0.4 * Math.sin(t / 400 - n * 0.9)
        a.rings.ellipse(0, -2, w / 2, w * 0.13).stroke({ color: AURA_C[k], width: 7, alpha: al * 0.3 })
        a.rings.ellipse(0, -2, w / 2, w * 0.13).stroke({ color: AURA_C[k], width: 2, alpha: al })
      })
      const shield = buffs.includes("invincible")
      if (shield || a.overOn) a.over.clear()
      a.overOn = shield
      if (shield) {
        const r = a.h * 0.62
        const al = 0.5 + 0.2 * Math.sin(t / 300)
        a.over.circle(0, -a.h * 0.5, r).fill({ color: 0xfff2b0, alpha: 0.1 }).stroke({ color: 0xffe27a, width: 3, alpha: al })
      }
      if (a.flat) return bodyFilters(a)
      if (!a.rig) return
      a.rig.root.alpha = buffs.includes("elusiveness") ? 0.72 : 1
      // a self buff: a soft halo of its colour behind the body, pulsing (a glow filter round the body was a render of the
      // whole body into a texture with a many-sample shader every frame, and drew it at 1x)
      const glows = many && a.side === "p" ? [] : buffs.filter(k => BUFF_C[k]).slice(0, 2)
      const key = glows.join()
      if (key !== a.glowKey) {
        a.glowKey = key
        for (const h of a.halos || []) h.destroy()
        a.halos = glows.map(k => {
          const h = new P.Sprite(glow)
          h.anchor.set(0.5)
          h.tint = BUFF_C[k]
          h.blendMode = "add"
          a.cont.addChildAt(h, a.cont.getChildIndex(a.shadow) + 1)
          return h
        })
      }
      ;(a.halos || []).forEach((h, n) => {
        const r = a.h * (1.15 + n * 0.25)
        h.width = r
        h.height = r * 1.15
        h.position.set(0, -a.h * 0.5)
        h.alpha = 0.55 + 0.25 * Math.sin(t / 320 + n)
      })
      bodyFilters(a)
      // the enhancement glow breathes from +10, cycles the rainbow from +15
      for (const g of a.ench || []) {
        if (g.breathe) g.s.alpha = 0.5 + 0.5 * Math.sin(t / g.breathe)
        if (g.rainbow) g.s.tint = new P.Color({ h: (t / 8) % 360, s: 90, l: 60 }).toNumber()
      }
    }
    // The body shader (a flash, burning away) costs a render of the whole body into a texture of its own every frame, so
    // it is on only while it shows something: ten bodies under it all the time took a fifth of a frame at 5 v 5.
    // A body burnt away completely is simply hidden.
    function bodyFilters(a) {
      const root = a.rig?.root || a.flat.root
      const on = a.uni.uFlash > 0 || (a.uni.uDis > 0 && a.uni.uDis < 1)
      root.visible = a.uni.uDis < 1
      if (on === a.bodyOn) return
      a.bodyOn = on
      root.filters = on ? [a.filter] : null
    }
    // a held piece's glow, made once per texture: its silhouette in white, spread out and softened (copies of it round a
    // few rings, fading outward), tinted by the tier when drawn
    const haloTex = new Map()
    function haloOf(tex) {
      if (haloTex.has(tex.uid)) return haloTex.get(tex.uid)
      let out = null
      try {
        const f = tex.frame
        const src = tex.source.resource
        const pad = Math.ceil(Math.max(f.width, f.height) * 0.06) + 4
        const w = Math.ceil(f.width) + pad * 2
        const h = Math.ceil(f.height) + pad * 2
        const sil = document.createElement("canvas")
        sil.width = w
        sil.height = h
        const sg = sil.getContext("2d")
        sg.drawImage(src, f.x, f.y, f.width, f.height, pad, pad, f.width, f.height)
        sg.globalCompositeOperation = "source-in"
        sg.fillStyle = "#fff"
        sg.fillRect(0, 0, w, h)
        const c = document.createElement("canvas")
        c.width = w
        c.height = h
        const g = c.getContext("2d")
        for (const [r, al] of [[pad * 0.95, 0.12], [pad * 0.7, 0.18], [pad * 0.45, 0.25], [pad * 0.22, 0.3]])
          for (let k = 0; k < 16; k++) {
            g.globalAlpha = al
            g.drawImage(sil, Math.cos((k / 16) * Math.PI * 2) * r, Math.sin((k / 16) * Math.PI * 2) * r)
          }
        out = { tex: mipTex(c), pad }
      } catch (e) {
        console.warn("[战斗动画] glow", e)
      }
      haloTex.set(tex.uid, out)
      return out
    }
    const ENCH_T = [[15, "rainbow", 4, 260], [12, 0xff5a3c, 3.6, 220], [10, 0xffa53a, 3.2, 380], [8, 0xc07bff, 2.8, 0], [5, 0x6fb6ff, 2.4, 0]]
    function enchGlow(a) {
      a.ench = []
      if (a.side !== "p" || crowd()) return
      const it = a.u.items || {}
      const enh = a.u.enh || {}
      for (const [part, level] of [["weapon", it.main_hand ? enh.main_hand : enh.two_hand], ["off", enh.off_hand]]) {
        const q = a.rig.by[part]
        const tier = ENCH_T.find(([n]) => (level || 0) >= n)
        if (!q || !tier) continue
        const [, color, , breathe] = tier
        const sp = q.s.children[0]
        const g = sp && haloOf(sp.texture)
        if (!g) continue
        // (behind the piece, on its pivot and scale: the piece itself stays a plain sprite, sharp and cheap)
        const s = new P.Sprite(g.tex)
        s.pivot.set(sp.pivot.x + g.pad, sp.pivot.y + g.pad)
        s.scale.copyFrom(sp.scale)
        s.tint = color === "rainbow" ? 0xff4d4d : color
        q.s.addChildAt(s, 0)
        a.ench.push({ s, breathe: breathe || (color === "rainbow" ? 300 : 0), rainbow: color === "rainbow" })
      }
    }
    function shockRing(x, y, h, color) {
      const g = new P.Graphics()
      g.position.set(x, y)
      fxLayer.addChild(g)
      tween(300, p => {
        g.clear()
        const r = h * (0.1 + 0.55 * ease(p))
        g.ellipse(0, 0, r * 0.4, r).stroke({ color, width: h * 0.05 * (1 - p) + 1, alpha: 1 - p })
        if (p >= 1) g.destroy()
      })
    }
    // a bubble of light round a body for a while (a shield, invulnerability)
    function bubble(a, color, dur) {
      const g = new P.Graphics()
      fxLayer.addChild(g)
      tween(dur, p => {
        g.clear()
        const x = a.x0 + (a.dash || 0)
        const y = a.y0 - a.h * 0.45
        const al = (p < 0.15 ? p / 0.15 : 1 - Math.max(0, p - 0.6) / 0.4) * (0.75 + 0.25 * Math.sin(p * dur * 0.02))
        g.ellipse(x, y, a.h * 0.42, a.h * 0.58).fill({ color, alpha: 0.12 * al }).stroke({ color, width: a.h * 0.025, alpha: 0.9 * al })
        if (p >= 1) g.destroy()
      })
    }
    const spanOf = tgs => span(tgs.map(([a]) => a))
    const each = f => ({ tgs, src, color }) => tgs.forEach(([a]) => f(a, src, color))
    // a buff: a ring spreading underfoot, motes and streaks rising round the body in its colour
    function buffFx(a, color, { motes = 26, streaks = 10 } = {}) {
      ripple(a.x0, a.y0, a.h * 0.9, color, { n: 2, dur: 700, gap: 140 })
      tween(700, p => {
        if (p < 1 && Math.random() < 0.8) emit(a.x0 + (Math.random() - 0.5) * a.h * 0.6, a.y0, { n: 1, color: [color, 0xffffff], size: 0.35, size1: 0.05, speed: 20, up: 260, gravity: -80, life: 800 })
      })
      emit(a.x0, a.y0 - a.h * 0.3, { n: streaks, tex: "streak", color: [color, 0xffffff], size: 0.5, speed: 420, angle: -Math.PI / 2, spread: 0.7, drag: 0.1, life: 420, jitter: a.h * 0.5 })
      emit(a.x0, a.y0 - a.h * 0.5, { n: motes, color, size: 0.3, size1: 0.05, speed: 90, gravity: -40, life: 900, jitter: a.h * 0.5 })
    }
    // buffs: their colour, and what each adds
    const BUFF_FX = {
      berserk: [0xff3b2a, a => cloud(a.x0, a.y0, a.h * 0.6, a.h * 0.8, 900, [0xff4a2a, 0xff8a3a], 0.25)],
      frenzy: [0xffd84a, a => emit(a.x0 - a.dir * a.h * 0.4, a.y0 - a.h * 0.45, { n: 16, tex: "streak", color: [0xffe680, 0xffffff], size: 0.6, speed: 700, angle: a.dir > 0 ? Math.PI : 0, spread: 0.25, life: 300, jitter: a.h * 0.8 })],
      toughness: [0x8fb4ff, a => bubble(a, 0x8fb4ff, 1100)],
      invincible: [0xffe680, a => bubble(a, 0xffe680, 1500)],
      spike_shell: [0xc8b090, a => emit(a.x0, a.y0 - a.h * 0.45, { n: 14, tex: "streak", color: [0xe0d0b0, 0xffffff], size: 0.5, speed: 300, drag: 0.02, life: 360 })],
      precision: [0xff8a3c, a => ripple(a.x0, a.y0 - a.h * 0.5, a.h * 0.5, 0xff8a3c, { n: 3, dur: 500, gap: 100 })],
      elusiveness: [0x9cff9a, a => emit(a.x0, a.y0 - a.h * 0.4, { n: 14, tex: "streak", color: [0xc8ffc8, 0xffffff], size: 0.5, speed: 380, angle: a.dir > 0 ? Math.PI : 0, spread: 0.6, life: 360, jitter: a.h * 0.7 })],
      vampirism: [0xd01a3a, a => gather(() => mid(a), 0xff2a4a, a.h * 1.4, 600)],
      insanity: [0xc040ff, a => cloud(a.x0, a.y0, a.h * 0.6, a.h * 0.9, 900, [0x8a2ad0, 0xc040ff], 0.25)],
      elemental_affinity: [0x9a7cff, a => gather(() => mid(a), 0x9a7cff, a.h * 1.4, 600)],
      retribution: [0xff9a3c, a => bubble(a, 0xff9a3c, 1000)],
      provoke: [0xff5050, a => ripple(a.x0, a.y0, a.h * 1.4, 0xff5050, { n: 3, dur: 600, gap: 120 })],
      taunt: [0xff5050, a => ripple(a.x0, a.y0, a.h * 1.4, 0xff5050, { n: 3, dur: 600, gap: 120 })],
      critical_aura: [0xff8a3c],
      fierce_aura: [0xff3c5a],
      mystic_aura: [0x9a7cff],
      guardian_aura: [0x4aa8ff],
      speed_aura: [0x9cff4a],
    }
    // heals: green motes rising, a soft ripple; a revive: a pillar of gold light
    function healFx(a, key) {
      if (key === "revive") {
        light(a.x0, a.y0 - a.h * 0.6, 0xffe680, a.h * 1.2, 1100, 1.3)
        emit(a.x0, a.y0, { n: 40, tex: "streak", color: [0xffe680, 0xffffff], size: 0.5, speed: 500, angle: -Math.PI / 2, spread: 0.3, drag: 0.15, life: 700, jitter: a.h * 0.4 })
        ripple(a.x0, a.y0, a.h * 1.3, 0xffe680, { n: 3 })
        return
      }
      ripple(a.x0, a.y0, a.h * 0.8, COLOR.heal, { n: 1, dur: 700 })
      tween(800, p => {
        if (p < 1 && Math.random() < 0.7) emit(a.x0 + (Math.random() - 0.5) * a.h * 0.6, a.y0 - Math.random() * a.h * 0.3, { n: 1, color: [COLOR.heal, 0xffffff], size: 0.35, size1: 0.05, speed: 15, up: 150, gravity: -40, life: 1000 })
      })
      if (key === "rejuvenate") emit(a.x0, a.y0 - a.h * 0.9, { n: 10, tex: "leaf", color: [0xffb0d0, 0xfff0f6, 0x9fe88a], size: 0.4, speed: 60, gravity: 90, drag: 0.6, life: 1600, jitter: a.h * 0.8 })
    }

    const SKILL_FX = {
      // 火球: a smoking trail behind it; it bursts in flame, scorching the ground and heating the air
      fireball: {
        fly: (q, src) => {
          if (Math.random() < 0.6) emit(q.x, q.y, { n: 1, tex: "smoke", color: 0x2e2420, alpha: 0.45, size: 0.3, size1: 0.9, speed: 15, up: 25, life: 650 })
          if (Math.random() < 0.8) emit(q.x, q.y, { n: 1, color: [0xffd27a, 0xff7a2a], color1: 0x601000, size: 0.3, size1: 0.05, speed: 60, gravity: -40, life: 500, jitter: src.h * 0.1 })
        },
        hit: ({ tgs }) =>
          tgs.forEach(([a]) => {
            fireBurst(a, false)
            haze(a.x0, a.y0 - a.h * 0.6, a.h * 1.4, a.h * 1.6, 1000, 6)
          }),
      },
      flame_blast: { hit: blaze },
      firestorm: { hit: blaze },
      // 分裂斩: a crescent of light flung through the whole line; time slows on the blow, the camera leans in
      cleave: {
        hit: ({ src, tgs, color }) => {
          if (!tgs.length) return
          const list = tgs.map(([a]) => a)
          const far = list.reduce((b, a) => (Math.abs(a.x0 - src.x0) > Math.abs(b.x0 - src.x0) ? a : b))
          const from = mid(src)
          crescent(from, src.dir, color, src.h * 1.3, Math.abs(far.x0 - from.x) + far.h * 0.8, 380)
          const m = mid(list[0])
          slow(240, 0.22)
          focusOn(m.x, m.y, 0.1, 700)
          zoomBlur(m.x, m.y, 240, 0.05)
          decal("crack", src.x0 + (src.dash || 0), src.y0, src.h * 0.9)
        },
      },
      // ----- fire -----
      // 烟爆灭影: the foe swallowed in a burst of black smoke shot through with embers
      smoke_burst: {
        hit: each(a => {
          const m = mid(a)
          emit(m.x, m.y, { n: 14, tex: "smoke", color: [0x1e1818, 0x2a2222, 0x3a2e2a], alpha: 0.75, size: 0.7, size1: 2, speed: 160, drag: 0.15, life: 1500, jitter: a.h * 0.3 })
          emit(m.x, m.y, { n: 20, color: [0xffb04a, 0xff5a1a], color1: 0x401000, size: 0.3, size1: 0.05, speed: 260, gravity: -80, drag: 0.3, life: 900 })
          cloud(a.x0, a.y0, a.h * 0.8, a.h * 0.8, 900, [0x1e1818, 0x2a2222], 0.5)
        }),
      },
      // ----- water / ice -----

      // 冰枪术: frost mist and glitter trailing the shard; it shatters on the foe and frosts the ground
      ice_spear: {
        fly: q => {
          if (Math.random() < 0.6) emit(q.x, q.y, { n: 1, tex: "smoke", color: 0xdff6ff, alpha: 0.35, size: 0.25, size1: 0.8, speed: 10, life: 500 })
          if (Math.random() < 0.7) emit(q.x, q.y, { n: 1, color: [0xe8fbff, 0x9fe6ff], size: 0.28, size1: 0.05, speed: 40, life: 600 })
        },
        hit: each(a => shatter(a, false)),
      },
      // 冰霜爆裂: the whole row shatters and frosts over, cold mist rolling along the ground
      frost_surge: {
        hit: ({ tgs }) => {
          if (!tgs.length) return
          const S = spanOf(tgs)
          tgs.forEach(([a]) => shatter(a, true))
          cloud(S.cx, S.ground, S.w, S.h * 0.3, 1200, [0xdff6ff, 0xc8eeff], 0.35)
          zoomBlur(S.cx, S.ground - S.h * 0.5, 240, 0.05)
          shake = Math.max(shake, 0.8)
        },
      },
      // 法力喷泉: ripples of mana spreading out under every foe
      mana_spring: { hit: ({ tgs }) => tgs.forEach(([a]) => ripple(a.x0, a.y0, a.h * 1.2, 0x8f9cff, { n: 3 })) },
      // ----- nature -----
      // 缠绕: vines grow up round the foe's legs, leaves torn loose
      entangle: {
        hit: each(a => {
          leaves(a, false)
        }),
      },
      // 生命吸取: green motes and leaves torn off the foe (the stream back is the action's drain)
      life_drain: { hit: each(a => leaves(a, false)) },
      // 剧毒粉尘: a green-yellow cloud of spores hangs over the row, poison bubbles rising
      toxic_pollen: {
        hit: ({ tgs }) => {
          if (!tgs.length) return
          const S = spanOf(tgs)
          cloud(S.cx, S.ground - S.h * 0.2, S.w, S.h * 0.8, 1800, [0x8fd14a, 0xb6e05a, 0x6fae3a], 0.75)
          tgs.forEach(([a]) => emit(a.x0, a.y0 - a.h * 0.3, { n: 16, color: [0xb6ff5a, 0x6fd13a], size: 0.35, size1: 0.1, speed: 40, up: 90, gravity: -30, life: 1400, jitter: a.h * 0.6 }))
        },
      },
      // 自然菌幕: each foe dimmed green under the veil, a puff of spores off it
      natures_veil: {
        hit: each(a => {
          flash(a, 0x7fe86a, 700)
          emit(mid(a).x, mid(a).y, { n: 14, color: [0xd8ff9a, 0xa8f07a], size: 0.3, size1: 0.08, speed: 90, gravity: -20, drag: 0.4, life: 1200, jitter: a.h * 0.4 })
        }),
      },
      // ----- arrows -----
      // 快速射击: speed lines on the arrows, a punch ring where they land
      quick_shot: {
        fly: q => Math.random() < 0.5 && emit(q.x, q.y, { n: 1, tex: "streak", color: 0xffffff, size: 0.35, speed: 10, life: 160 }),
        hit: ({ tgs, src, color }) => tgs.forEach(([a]) => shockRing(mid(a).x - src.dir * a.h * 0.15, mid(a).y, a.h * 0.8, color)),
      },
      // 稳定射击: a hard punch: a ring, the spray carried on through
      steady_shot: {
        hit: ({ tgs, src, color }) =>
          tgs.forEach(([a]) => {
            shockRing(mid(a).x - src.dir * a.h * 0.15, mid(a).y, a.h * 1.1, color)
            through(a, src.dir, color, 14)
          }),
      },
      // 贯穿射击: the beam (the action's pierce) and the foe torn through, sparks carried far behind
      penetrating_shot: {
        hit: ({ tgs, src, color }) =>
          tgs.forEach(([a]) => {
            through(a, src.dir, color, 28)
            shockRing(mid(a).x, mid(a).y, a.h * 1.2, color)
          }),
      },
      // 流水箭: drops trailing the arrow, a splash where it lands
      aqua_arrow: {
        fly: q => Math.random() < 0.7 && emit(q.x, q.y, { n: 1, color: [0x5ac8ff, 0xbfefff], size: 0.28, speed: 50, gravity: 500, life: 400 }),
        hit: each(a => splash(a, false)),
      },
      // 烈焰箭: embers and smoke trailing it, a small fire burst
      flame_arrow: {
        fly: q => {
          if (Math.random() < 0.7) emit(q.x, q.y, { n: 1, color: [0xffd27a, 0xff7a2a], color1: 0x601000, size: 0.28, size1: 0.05, speed: 40, gravity: -40, life: 450 })
          if (Math.random() < 0.35) emit(q.x, q.y, { n: 1, tex: "smoke", color: 0x2e2420, alpha: 0.35, size: 0.2, size1: 0.6, speed: 10, up: 20, life: 500 })
        },
        hit: each(a => fireBurst(a, false)),
      },
      // 沉默之箭: purple motes trailing it; a seal ring closes round the foe's head
      silencing_shot: {
        fly: q => Math.random() < 0.6 && emit(q.x, q.y, { n: 1, color: [0xc48cff, 0xffffff], size: 0.28, size1: 0.05, speed: 30, life: 450 }),
        hit: each(a => {
          const g = new P.Graphics()
          fxLayer.addChild(g)
          tween(1000, p => {
            g.clear()
            const r = a.h * (0.5 - 0.22 * ease(Math.min(1, p * 2)))
            const x = a.x0
            const y = a.y0 - a.h * 0.85
            g.ellipse(x, y, r, r * 0.3).stroke({ color: 0xc48cff, width: a.h * 0.03, alpha: p < 0.7 ? 1 : (1 - p) / 0.3 })
            if (p >= 1) g.destroy()
          })
          emit(a.x0, a.y0 - a.h * 0.85, { n: 14, color: [0xc48cff, 0xffffff], size: 0.3, size1: 0.05, speed: 120, life: 600 })
        }),
      },
      // 疫病射击: a green trail; a puff of poison clings to the foe
      pestilent_shot: {
        fly: q => Math.random() < 0.6 && emit(q.x, q.y, { n: 1, tex: "smoke", color: 0x8fd14a, alpha: 0.35, size: 0.2, size1: 0.6, speed: 10, life: 500 }),
        hit: each(a => {
          cloud(a.x0, a.y0, a.h * 0.6, a.h * 0.8, 1300, [0x8fd14a, 0x6fae3a], 0.7)
          emit(a.x0, a.y0 - a.h * 0.4, { n: 12, color: [0xb6ff5a, 0x6fd13a], size: 0.3, size1: 0.1, speed: 30, up: 80, gravity: -30, life: 1200, jitter: a.h * 0.5 })
        }),
      },
      // ----- slash -----
      // 血刃斩: red sparks spraying with each cut, a red mist hanging after
      maim: {
        hit: ({ tgs, src }) =>
          tgs.forEach(([a]) => {
            through(a, src.dir, 0xff3b3b, 22)
            emit(mid(a).x, mid(a).y, { n: 5, tex: "smoke", color: [0x8a1020, 0xb01a2a], alpha: 0.35, size: 0.5, size1: 1.3, speed: 40, drag: 0.4, life: 1100, jitter: a.h * 0.3 })
          }),
      },
      // 致残斩: sparks skidding low along the ground at the foes' legs, dust kicked up
      crippling_slash: {
        hit: ({ tgs, src, color }) =>
          tgs.forEach(([a]) => {
            emit(a.x0, a.y0 - a.h * 0.12, { n: 22, tex: "streak", color: [color, 0xffffff], size: 0.5, speed: 600, angle: src.dir > 0 ? 0 : Math.PI, spread: 0.3, drag: 0.05, life: 320, jitter: a.h * 0.3, flat: 0.2 })
            emit(a.x0, a.y0, { n: 6, tex: "smoke", color: 0xb8a68a, alpha: 0.45, size: 0.4, size1: 1.1, speed: 120, angle: src.dir > 0 ? -0.3 : Math.PI + 0.3, spread: 0.8, drag: 0.1, life: 800 })
          }),
      },
      // ----- stab -----
      // 破胆之刺: a sharp spray out of the foe's back, the air around it shaken
      poke: {
        hit: ({ tgs, src, color }) =>
          tgs.forEach(([a]) => {
            through(a, src.dir, color, 14)
            zoomBlur(mid(a).x, mid(a).y, 180, 0.035)
          }),
      },
      // 透骨之刺: driven down through the foe: a long spray behind, the ground cracked under it
      impale: {
        hit: ({ tgs, src }) =>
          tgs.forEach(([a]) => {
            through(a, src.dir, 0xff5050, 26)
            decal("crack", a.x0, a.y0, a.h * 0.7)
            debris(a.x0, a.y0, a.h, 8)
            zoomBlur(mid(a).x, mid(a).y, 200, 0.04)
            // a giant spear of light stabbing down out of the sky with it, a column where it lands
            const m = mid(a)
            lance({ x: m.x - src.dir * a.h * 0.5, y: m.y - a.h * 2.6 }, { x: m.x, y: a.y0 - a.h * 0.1 }, 0xff6a5a, a.h, { over: 0.15, w: 0.2, dur: 520 })
            pillar(a.x0, a.y0, a.h * 0.55, a.h * 2.2, 0xff5050, 650)
            shockRing(a.x0, a.y0 - a.h * 0.05, a.h * 1.6, 0xff8a7a)
            shake = Math.max(shake, 1)
          }),
      },
      // 破甲之刺: bits of armour knocked off, grey and glinting
      puncture: {
        hit: ({ tgs, src }) =>
          tgs.forEach(([a]) => {
            const m = mid(a)
            emit(m.x, m.y, { n: 16, color: [0xc8ccd4, 0x9aa0aa, 0xffffff], size: 0.32, speed: 380, angle: src.dir > 0 ? -0.5 : Math.PI + 0.5, spread: 1.6, gravity: 1100, life: 700 })
            through(a, src.dir, 0xffb03b, 12)
          }),
      },
      // 贯心之刺: run clean through: a long spray and a ring where the spear went in
      penetrating_strike: {
        hit: ({ tgs, src, color }) =>
          tgs.forEach(([a]) => {
            through(a, src.dir, color, 30)
            shockRing(mid(a).x, mid(a).y, a.h * 1.1, color)
            // run clean through: a beam across the whole stage, a slow-motion beat on the foe
            beam({ x: mid(a).x - src.dir * a.h * 2, y: mid(a).y }, mid(a), color, a.h * 1.6)
            zoomBlur(mid(a).x, mid(a).y, 260, 0.06)
            slow(220, 0.3)
            focusOn(mid(a).x, mid(a).y, 0.07, 520)
          }),
      },
      // ----- smash -----
      // 重碾: earth thrown up
      smack: { hit: ({ tgs }) => tgs.forEach(([a]) => debris(a.x0, a.y0, a.h, 12)) },
      // 重扫: a wave of dust rolling along the ground through the whole row
      sweep: {
        hit: ({ tgs, src }) => {
          if (!tgs.length) return
          const S = spanOf(tgs)
          for (let k = 0; k < 10; k++) emit(S.cx - src.dir * S.w * 0.5, S.ground, { n: 1, tex: "smoke", color: [0xb8a68a, 0xc8b89a], alpha: 0.5, size: 0.6, size1: 1.5, speed: 380, angle: src.dir > 0 ? 0 : Math.PI, spread: 0.2, drag: 0.15, life: 1000, jitter: S.h * 0.2, flat: 0.2 })
          tgs.forEach(([a]) => debris(a.x0, a.y0, a.h, 8))
          shake = Math.max(shake, 0.8)
        },
      },
      // 重锤: a heavy blow on the head: a ring, the ground cracked, the camera jolted
      stunning_blow: {
        hit: ({ tgs, color }) =>
          tgs.forEach(([a]) => {
            const m = mid(a)
            ripple(a.x0, a.y0, a.h * 1.2, color, { n: 2, dur: 600 })
            debris(a.x0, a.y0, a.h, 14)
            zoomBlur(m.x, m.y, 220, 0.05)
            focusOn(m.x, m.y, 0.06, 450)
          }),
      },
      // 碎裂冲击: the ground breaks under the whole row: wide cracks, rocks and dust everywhere
      fracturing_impact: {
        hit: ({ tgs }) => {
          if (!tgs.length) return
          const S = spanOf(tgs)
          tgs.forEach(([a]) => {
            decal("crack", a.x0, a.y0, a.h * 1.2, { dur: 3200 })
            debris(a.x0, a.y0, a.h, 22)
            emit(a.x0, a.y0, { n: 8, tex: "smoke", color: [0xb8a68a, 0xa08c70], alpha: 0.55, size: 0.6, size1: 1.6, speed: 160, angle: -Math.PI / 2, spread: 2.6, drag: 0.15, life: 1200, flat: 0.3, jitter: a.h * 0.5 })
          })
          zoomBlur(S.cx, S.ground - S.h * 0.3, 280, 0.06)
          shake = Math.max(shake, 1.2)
        },
      },
      // 盾击: a shock ring off the shield's face, sparks
      shield_bash: {
        hit: ({ tgs, src, color }) =>
          tgs.forEach(([a]) => {
            shockRing(mid(a).x - src.dir * a.h * 0.25, mid(a).y, a.h * 1.2, color)
            through(a, src.dir, 0xffffff, 12)
          }),
      },
    }

    // ----- each skill's own body (main), drawn where its blow lands on every foe it was cast at; skills without one
    // get their element's burst and their style's cut, made bigger (hitFx) -----
    const onEach = f => ({ all, src, color }) => all.forEach(a => f(a, src, color))
    const MAIN = {
      fireball: onEach(a => fireExplosion(mid(a).x, mid(a).y, a.h * 0.55)),
      smoke_burst: onEach(a => fireExplosion(mid(a).x, mid(a).y, a.h * 0.4)),
      flame_blast: onEach(a => {
        flameColumn(a.x0, a.y0, a.h * 0.8, a.h * 1.7, 950, { rate: 4 })
        fireExplosion(a.x0, a.y0 - a.h * 0.3, a.h * 0.5)
      }),
      firestorm: onEach(a => fireTornado(a.x0, a.y0, a.h * 1.9, 1200)),
      // 流水冲击: a wave rolling in from the caster's side and breaking over the foe
      water_strike: () => {},
      // 法力喷泉: a tall blue-violet spring of mana out of a glowing circle under every foe, sparkles rising
      mana_spring: onEach(a => {
        circle(a, "mana", 1300)
        waterColumn(a.x0, a.y0, a.h * 1, a.h * 2.3, 1200, { body: 0x4a62f0, core: 0xc0ccff, spray: [0x8f9cff, 0xd8d0ff, 0xffffff] })
        tween(1100, p => p < 1 && Math.random() < 0.7 && emit(a.x0 + (Math.random() - 0.5) * a.h, a.y0, { n: 1, color: [0xc8b8ff, 0xffffff, 0x8fdcff], size: 0.3, size1: 0.05, speed: 20, up: a.h * 1.6, gravity: -a.h * 0.5, life: 900 }))
      }),
      ice_spear: onEach(a => iceSpikes(a.x0, a.y0, a.h * 0.5, a.h * 0.6, { n: 4, dur: 900 })),
      frost_surge: onEach(a => iceSpikes(a.x0, a.y0, a.h * 1.1, a.h * 1.2, { n: 8 })),
      entangle: onEach(a => vinesGrow(a.x0, a.y0, a.h * 0.75, a.h * 1.0, 1900)),
      natures_veil: () => {},
      toxic_pollen: onEach(a => emit(mid(a).x, mid(a).y, { n: 30, color: [0xb6ff5a, 0x8fd14a, 0xe0ff8a], size: 0.4, size1: 0.1, speed: 220, drag: 0.1, gravity: -40, life: 900 })),
      life_drain: onEach(a => impactStar(mid(a).x, mid(a).y, a.h * 0.35, 0x62d65a)),
      cleave: onEach((a, src, color) => slashArc(mid(a).x, mid(a).y, a.h * 0.75, src.dir, color, { width: 1.3, tilt: 0.3 })),
      // two red cuts crossing
      maim: onEach((a, src) => {
        slashArc(mid(a).x, mid(a).y, a.h * 0.6, src.dir, 0xff3b3b, { tilt: -0.4 })
        later(60, () => slashArc(mid(a).x, mid(a).y, a.h * 0.6, src.dir, 0xff3b3b, { tilt: 0.9 }))
      }),
      // a flat cut low across the legs
      crippling_slash: onEach((a, src, color) => slashArc(a.x0, a.y0 - a.h * 0.15, a.h * 0.6, src.dir, color, { tilt: 1.15, width: 1.2 })),
      scratch: onEach((a, src) => claws(mid(a).x, mid(a).y, a.h * 0.5, src.dir, 0xffe3a3)),
    }
    for (const [k, f] of Object.entries(MAIN)) (SKILL_FX[k] ||= {}).main = f
    // skills whose body comes first (pre: [ms before the blow, draw]): 自然菌幕's veil is let down as the blow lands
    SKILL_FX.natures_veil.pre = [450, ({ all }) => all.length && veil(span(all), all)]
    // skills whose body travels to the foe itself (release: at the shot, flight = ms to the blow): no missile
    SKILL_FX.water_strike.release = ({ src, all, flight }) => {
      const from = (tipOf(src) || mid(src)).x
      all.forEach(a => waveCrash(a, src.dir, { from, travel: flight }))
    }

    function play(evs) {
      if (!app) return
      for (const e of evs) {
        const src = e.actor ? units[e.actor.side]?.[e.actor.i] : null
        const tgs = (e.targets || []).map(tg => [units[tg.side]?.[tg.i], tg]).filter(([a]) => a)
        const isSkill = !!e.ab
        const color = COLOR[e.element] || COLOR.physical
        if (e.effect === "heal" || e.effect === "regen") {
          if (src) {
            play1(src, "cast")
            light(src.x0, src.y0 - src.h * 0.4, COLOR.heal, src.h, 600)
            circle(src, "heal", 900)
            // a column of light on each one healed
            later(300, () => tgs.forEach(([a]) => pillar(a.x0, a.y0, a.h * 0.8, a.h * 1.8, e.ab?.key === "revive" ? 0xffe680 : COLOR.heal, 950)))
            later(300, () => tgs.forEach(([a]) => healFx(a, e.ab?.key)))
          }
          tgs.forEach(([a, tg]) => later(src ? 300 : 0, () => heal(a, tg)))
          continue
        }
        if (e.effect !== "damage") {
          if (src) {
            later(260, () => grant(src, e.ab))
            play1(src, "cast")
            circle(src, "buff", 900)
            // on the caster, or the whole side for an aura: a column of light, its colour rising round each, and what that
            // buff adds
            const allies = e.ab?.target === "allAllies" ? units[e.actor.side].filter(a => !a.dead) : [src]
            const [bc, extra] = BUFF_FX[e.ab?.key] || [COLOR.buff]
            later(260, () => allies.forEach(a => (pillar(a.x0, a.y0, a.h * 0.75, a.h * 1.7, bc, 900), buffFx(a, bc), extra?.(a))))
            if (src.off === "relic") later(300, () => relicGlow(src))
            // the sword held high catches the light
            later(300, () => {
              light(src.x0, src.y0 - src.h * 1.05, COLOR.buff, src.h * 0.7, 800, 1.2)
              light(src.x0, src.y0 - src.h * 0.5, COLOR.buff, src.h * 0.9, 700)
              sparks(src.x0, src.y0 - src.h * 1.05, COLOR.buff, 34, { speed: 110, up: 60, gravity: -40, life: 900, size: 0.4 })
            })
          }
          continue
        }
        if (!src) {
          tgs.forEach(([a, tg]) => hit(a, tg, null, e, false))
          continue
        }
        // the attacker's action: wind up, run in (lunge) before the blow lands at act.hit, come back after
        // a skill plays its own action ("skill:<key>") when it has one, else the generic skill; a plain attack picks
        // one of its sets at random (attack, attack2, …)
        // (a dagger in the off hand adds its own strikes)
        const sets = ["attack", "attack2", "attack3", "attack4"].filter(n => actionOf(src.kind, n)).concat(src.off === "dagger" ? ["off:stab", "off:slash"] : [])
        // (a skill on every foe: "skill:all" where the set has one)
        const name = isSkill ? (actionOf(src.kind, "skill:" + e.ab.key) ? "skill:" + e.ab.key : e.ab.target === "allEnemies" && actionOf(src.kind, "skill:all") ? "skill:all" : "skill") : sets[Math.floor(Math.random() * sets.length)] || "attack"
        const act = play1(src, name)
        const recipe = isSkill ? SKILL_FX[e.ab.key] : null
        // a spell: a magic circle turns under the caster while it gathers
        if (e.style === "magic") circle(src, e.element, (act?.hit ?? 300) + 300)
        // a relic in the off hand flares as the blow lands
        if (src.off === "relic") later(act?.hit ?? 300, () => relicGlow(src))
        const at = act?.hit ?? 300
        // earlier blows of a multi-blow action (hits: [ms, …]): a slash and a flinch, the damage lands at hit
        for (const t of act?.hits || [])
          if (t < at)
            later(t, () => {
              tgs.forEach(([a]) => {
                hitFx(a, src, e.style, e.element, false, false)
                flash(a, 0xffffff, 160)
                a.jig = 0.7
              })
              if (isSpear(src)) spearBlow(src, tgs, isSkill ? tcol : SPEAR_COL, false, name)
            })
        // the blade leaves a light trail while it swings: thin and white for an attack, broad and coloured for a skill
        const tcol = act?.color != null ? act.color : isSkill ? (e.element && e.element !== "physical" ? color : 0xffd84a) : 0xeef4ff
        // (a shot leaves none: its missile carries the light)
        if (act?.shot == null) {
          src.trail = { on: true, color: tcol, w: isSkill ? 0.6 : 0.4, life: isSkill ? 220 : 150, pts: src.trail?.pts || [] }
          later(act?.dur || 800, () => src.trail && (src.trail.on = false))
        }
        if (isSkill) {
          // the skill's name pops up, the blade gathers light before the release
          banner(src, e.ab.name || "", tcol)
          const charge = Math.max(200, at * 0.6)
          gather(() => (act?.from === "ho" ? handOf(src, "ho") : act?.from === "head" ? mouthOf(src) : tipOf(src)) || mid(src), tcol, src.h, charge)
          later(charge * 0.5, () => {
            const tp = tipOf(src)
            if (tp) light(tp.x, tp.y, tcol, src.h * 0.5, charge, 1.2)
          })
          light(src.x0, src.y0 - src.h * 0.4, color, src.h * 1.2, Math.max(500, at))
        }
        if (act?.ring != null) later(act.ring, () => ring(src, tcol))
        // a shot (act.shot: the release, ms): a missile from the bow hand (from: "ho") or the weapon's tip to each target,
        // landing at act.hit; a volley (rain) goes up out of sight and comes down on every target
        if (recipe?.pre) later(Math.max(0, at - recipe.pre[0]), () => recipe.pre[1]({ src, all: tgs.map(([a]) => a) }))
        if (act?.shot != null && recipe?.release) {
          const flight = Math.max(80, at - act.shot)
          later(act.shot, () => recipe.release({ src, all: tgs.map(([a]) => a), flight }))
        } else if (act?.shot != null) {
          const flight = Math.max(80, at - act.shot)
          const kind = act.missile || "arrow"
          const opt = { color: kind !== "arrow" ? (isSkill ? tcol : color) : tcol, big: isSkill, h: src.h, element: e.element, onFly: recipe?.fly && (q => recipe.fly(q, src)) }
          const fromOf = () => (act.from === "ho" ? handOf(src, "ho") : act.from === "head" ? mouthOf(src) : tipOf(src)) || mid(src)
          // earlier shots of a volley (shots: [ms, …]): each flies as long as the last, the foe flinches where it lands
          for (const t of act.shots || [])
            later(t, () =>
              tgs.forEach(([a]) => {
                shoot(kind, fromOf(), mid(a), flight, opt)
                later(flight, () => {
                  flash(a, 0xffffff, 160)
                  a.jig = 0.7
                })
              }),
            )
          later(act.shot, () => {
            const from = fromOf()
            muzzle(from, src, opt.color, isSkill)
            if (act.pierce) later(flight, () => tgs.forEach(([a]) => beam(from, mid(a), opt.color, src.h)))
            // a piercing shot carries on past the foe, straight, off the side of the stage
            if (act.pierce)
              return tgs.forEach(([a]) => {
                const m = mid(a)
                const far = { x: m.x + src.dir * app.screen.width, y: m.y + ((m.y - from.y) * app.screen.width) / Math.max(1, Math.abs(m.x - from.x)) }
                shoot(kind, from, far, (flight * Math.hypot(far.x - from.x, far.y - from.y)) / Math.max(1, Math.hypot(m.x - from.x, m.y - from.y)), { ...opt, arc: 0 })
              })
            if (!act.rain) return tgs.forEach(([a]) => shoot(kind, from, mid(a), flight, opt))
            for (let n = 0; n < 3; n++) shoot(kind, from, { x: from.x + src.dir * src.h * (0.3 + n * 0.15), y: from.y - src.h * 2.5 }, flight * 0.4, { ...opt, arc: 0 })
            tgs.forEach(([a]) => {
              // a long, dense volley: arrows keep landing from a little before the blow to a little after it
              for (let n = 0; n < 14; n++)
                later(Math.max(0, flight - 140 - n * 35), () => {
                  // every other arrow into the ground round the foe's feet, where it stays standing
                  const ground = n % 2 === 0
                  const x = a.x0 + (Math.random() - 0.5) * a.h * (ground ? 1.3 : 0.6)
                  const y = ground ? a.y0 + (Math.random() - 0.3) * a.h * 0.12 : a.y0 - a.h * (0.15 + Math.random() * 0.45)
                  shoot(kind, { x: x - src.dir * a.h * 0.5, y: y - a.h * 2.4 }, { x, y }, 260, {
                    ...opt,
                    arc: 0,
                    onLand: B => {
                      emit(B.x, a.y0, { n: 3, tex: "smoke", color: 0xb8a68a, alpha: 0.5, size: 0.25, size1: 0.6, speed: 50, angle: -Math.PI / 2, spread: 2.4, life: 700 })
                      sparks(B.x, B.y, opt.color, 4, { speed: 160, up: 80, life: 300, size: 0.3 })
                      if (ground) decal("arrow", B.x, B.y, a.h * 0.4, { color: opt.color, dir: src.dir, dur: 2800 })
                    },
                  })
                })
            })
          })
        }
        // a drain: the foe's life streams back over to the caster after the blow
        if (act?.drain)
          for (let n = 0; n < 7; n++)
            later(at + 80 + n * 60, () => tgs.forEach(([a]) => shoot("orb", mid(a), mid(src), 420, { color, h: src.h * 0.6, arc: (Math.random() - 0.5) * 0.5 })))
        const tgt = tgs[0]?.[0]
        if (act?.lunge && tgt) {
          // reach: stop in front of the target, or (act.through) run past it
          const reach = act.through ? tgt.x0 - src.x0 + src.dir * tgt.h * 0.55 : tgt.x0 - src.x0 - src.dir * (tgt.h + src.h) * 0.3
          tween(at * 0.45, p => (src.dash = reach * ease(p)), at * 0.55)
          tween(Math.max(200, act.dur - at - 80), p => (src.dash = reach * (1 - ease(p))), at + 80)
          src.cont.zIndex = 1e4
          later(act.dur, () => (src.cont.zIndex = src.y0))
        }
        later(at, () => {
          // the skill's own body, drawn on every foe it was cast at (then the hits leave out their plain bursts)
          const shown = !!recipe?.main
          if (shown) recipe.main({ src, all: tgs.map(([a]) => a), color: tcol })
          tgs.forEach(([a, tg]) => hit(a, tg, src, e, isSkill, shown))
          if (isSpear(src) && act?.shot == null) spearBlow(src, tgs.filter(([, tg]) => tg.dHP), isSkill ? tcol : SPEAR_COL, isSkill, name)
          // a skill's blow: light rays and white-hot sparks out of each foe it lands on, dust and a crack under a smash
          if (isSkill)
            tgs.forEach(([a, tg]) => {
              if (!tg.dHP) return
              const m = mid(a)
              rays(m.x, m.y, tcol, a.h * 1.1)
              emit(m.x, m.y, { n: 16, tex: "streak", color: [tcol, 0xffffff], size: 0.5, speed: 520, angle: src.dir > 0 ? 0 : Math.PI, spread: 2.2, gravity: 700, drag: 0.08, life: 380 })
              if (e.style === "smash") {
                emit(a.x0, a.y0, { n: 8, tex: "smoke", color: 0xb8a68a, alpha: 0.55, size: 0.5, size1: 1.3, speed: 120, angle: -Math.PI / 2, spread: 2.6, drag: 0.1, life: 900, flat: 0.3, jitter: a.h * 0.4 })
                decal("crack", a.x0, a.y0, a.h * 0.7)
              }
            })
          recipe?.hit?.({ src, tgs: tgs.filter(([, tg]) => tg.dHP), color: tcol })
          // a skill's blow freezes both sides for a moment and punches the camera in
          if (isSkill && !many) {
            for (const u of [src, ...tgs.map(([a]) => a)]) if (u.act) u.act.t0 += 90
            punch = Math.max(punch, 0.7)
            shake = Math.max(shake, 0.6)
          }
        })
      }
    }

    // one frame; an error in it is logged and the next frame goes on (thrown out of the ticker's listener, it would stop
    // the ticker for good: the stage frozen)
    function frame() {
      try {
        frameBody()
      } catch (e) {
        console.warn("[战斗动画] frame", e)
      }
    }
    // (crowd(), kept for the frame: asked by every effect)
    let many = false
    // a phone drawn at its full pixel density (3) that cannot keep up drops to 2: under 45 frames a second for two
    // 3-second spells in a row (the picture a little softer, smooth again)
    // (real time between frames: the ticker's deltaMS is capped at 100 ms, a slow frame would count for too little; not
    // judged in the first 8 s after the stage opens, is set up again or comes back on screen: loading the parts, making
    // their mipmaps and compiling the shaders is slow on any phone, and used to drop it to 2 for good at once)
    // quality steps down, one step for each two 3-second spells under 45 frames a second: 1 at most 2x, 2 half the
    // particles and a lighter glow, 3 at most 1.5x, a third of the particles and no glow pass, 4 at 1x
    const perf = { t: 0, n: 0, low: 0, last: 0, cap: 3, grace: 0, dropped: false, check: 0, level: 0, fx: 1 }
    function stepDown() {
      perf.level++
      perf.dropped = true
      if (perf.level === 1) perf.cap = 2
      if (perf.level === 2) (perf.fx = 0.5), (bloom.quality = 3), (bloom.blur = 6)
      if (perf.level === 3) (perf.cap = 1.5), (perf.fx = 0.33), (glowLayer.filters = null)
      if (perf.level === 4) perf.cap = 1
      settle()
      sharp()
    }
    const settle = () => ((perf.grace = performance.now() + 8000), (perf.t = perf.n = perf.low = 0))
    // the density to draw at: the screen's pixels per CSS pixel times the scale the page shows the stage at (a zoomed
    // page or panel: drawn for its own size and shown bigger it would be soft), at most perf.cap
    function wantRes() {
      const scale = host?.clientWidth ? host.getBoundingClientRect().width / host.clientWidth : 1
      return Math.max(1, Math.min(perf.cap, (devicePixelRatio || 1) * (scale || 1)))
    }
    function sharp() {
      if (!app || !host?.clientWidth) return
      const want = wantRes()
      if (Math.abs(want - app.renderer.resolution) < 0.05) return
      app.renderer.resolution = want
      app.renderer.resize(host.clientWidth, host.clientHeight)
      layout()
    }
    function keepUp() {
      const at = performance.now()
      const gap = at - perf.last
      perf.last = at
      // (the density looked at again every 2 s: the page zoomed, the phone turned)
      if (at - perf.check > 2000) (perf.check = at), sharp()
      if (perf.level >= 4 || gap > 1000 || !onScreen() || at < perf.grace) return
      perf.t += gap
      perf.n++
      if (perf.t < 3000) return
      const fps = (perf.n * 1000) / perf.t
      perf.t = perf.n = 0
      perf.low = fps < 45 ? perf.low + 1 : 0
      if (perf.low < 2) return
      perf.low = 0
      // (a step that changes nothing here, 2x on a screen drawn at 2 or less, is passed over)
      if (perf.level === 0 && app.renderer.resolution <= 2) perf.level = 1
      stepDown()
    }
    // every filter's shader compiled once while the stage opens (a tiny hidden render through each): compiled on first use
    // instead, the first heavy blow, crit or fire skill of a battle stalled the stage for up to a tenth of a second
    function warmUp() {
      try {
        const rt = P.RenderTexture.create({ width: 8, height: 8 })
        const c = new P.Container()
        const s = new P.Sprite(dot)
        s.width = s.height = 8
        c.addChild(s)
        const map = new P.Sprite(hazeTex)
        const fs = [bloom, new P.DisplacementFilter({ sprite: map, scale: 1 }), F.ZoomBlurFilter && new F.ZoomBlurFilter({ strength: 0.01 }), new F.ShockwaveFilter({ center: { x: 4, y: 4 } }), P.Filter.from({ resolution: "inherit", gl: { vertex: F.vertex, fragment: FRAG, name: "bfx-body" }, resources: { u: { uFlash: { value: 0, type: "f32" }, uColor: { value: new Float32Array([1, 1, 1]), type: "vec3<f32>" }, uDis: { value: 0, type: "f32" }, uSeed: { value: 0, type: "f32" } } } })].filter(Boolean)
        for (const f of fs) {
          c.filters = [f]
          app.renderer.render({ container: c, target: rt })
        }
        c.filters = null
        for (const f of fs) if (f !== bloom) f.destroy()
        c.destroy(GONE)
        map.destroy()
        rt.destroy(true)
      } catch (e) {
        console.warn("[战斗动画] warm up", e)
      }
    }
    // how see-through the skill effects are (cfg.fxAlpha, 0–1): the glowing effects and sparks, missiles, lights,
    // smoke and ground marks; the numbers, skill names, aura rings and buff glows stay as they are
    function setFxAlpha() {
      if (!app) return
      for (const l of [glowLayer, shotLayer, lights, smokeLayer, decalLayer]) l.alpha = cfg.fxAlpha
    }
    // what the stage draws at, for the menu: the screen's density, the page's scale, the density drawn at, and why
    function info() {
      if (!app || !host) return null
      const r = host.getBoundingClientRect()
      return { dpr: devicePixelRatio || 1, scale: host.clientWidth ? r.width / host.clientWidth : 1, res: app.renderer.resolution, cap: perf.cap, dropped: perf.dropped, level: perf.level, canvas: [app.canvas.width, app.canvas.height], shown: [Math.round(r.width), Math.round(r.height)] }
    }
    function frameBody() {
      keepUp()
      many = crowd()
      if (stale) freshen()
      const k = performance.now() < slowUntil ? slowK : 1
      clock += Math.min(50, app.ticker.deltaMS) * k
      const t = now()
      dt = Math.min(0.05, app.ticker.deltaMS / 1000) * k
      for (let k = 0; k < tweens.length; k++) {
        const w = tweens[k]
        if (t < w.t0) continue
        const p = w.dur ? Math.min(1, (t - w.t0) / w.dur) : 1
        try {
          w.f(p)
        } catch (e) {
          console.warn("[战斗动画]", e)
          tweens.splice(k--, 1)
          continue
        }
        if (p >= 1) tweens.splice(k--, 1)
      }
      for (let k = 0; k < parts.length; k++) {
        const q = parts[k]
        const age = (t - q.t0) / q.life
        if (age >= 1) {
          q.s.destroy()
          parts.splice(k--, 1)
          continue
        }
        // circling an axis as it rises (orbit), else drawn toward a point (to: a function giving it), slowed by drag;
        // sized / coloured over its life
        if (q.orb) {
          const o = q.orb
          o.ang += o.spin * dt
          o.y -= o.rise * dt
          const R = o.r * (1 + o.widen * age)
          q.s.position.set(o.cx + Math.cos(o.ang) * R, o.y + Math.sin(o.ang) * R * 0.3)
          q.vx = q.vy = q.g = 0
        }
        if (q.to) {
          const T = q.to()
          if (T) {
            q.vx += (T.x - q.s.x) * q.pull * dt
            q.vy += (T.y - q.s.y) * q.pull * dt
          }
        }
        if (q.drag) {
          const f = Math.pow(q.drag, dt)
          q.vx *= f
          q.vy *= f
        }
        q.vy += q.g * dt
        q.s.x += q.vx * dt
        q.s.y += q.vy * dt
        if (q.s1 != null) q.s.scale.set(lerp(q.s0, q.s1, age))
        if (q.c1 != null) q.s.tint = mixColor(q.c0, q.c1, age)
        if (q.spin) q.s.rotation += q.spin * dt
        if (q.stretch) {
          // a streak lies along its flight, longer the faster it goes
          q.s.rotation = Math.atan2(q.vy, q.vx)
          q.s.scale.set(q.s0 * (1 + Math.hypot(q.vx, q.vy) * q.stretch), q.s0)
        }
        q.s.alpha = (q.a0 ?? 1) * (q.fadeIn && age < q.fadeIn ? age / q.fadeIn : 1) * (1 - age)
      }
      for (const side of ["p", "m"])
        for (const a of units[side]) {
          a.jig *= Math.pow(0.02, dt)
          if (a.jig < 0.01) a.jig = 0
          a.cont.x = a.x0 + (a.dash || 0)
          if (a.rig) {
            rigFrame(a, t)
            if (a.rig.arms.length) rigArms(a)
          } else if (a.flat) flatFrame(a, t)
          statusFrame(a, t)
          stunFrame(a, t)
        }
      trails(t)
      // camera: shake and a short zoom punch toward the middle
      shake *= Math.pow(0.004, dt)
      punch *= Math.pow(0.01, dt)
      const W2 = app.screen.width
      const H = app.screen.height
      // a focus leans the zoom in on its point (it stays put on screen while the rest grows around it)
      const fz = focus && t < focus.until ? focus.amt * Math.sin(Math.PI * Math.min(1, (t - focus.t0) / (focus.until - focus.t0))) : 0
      const z = 1 + 0.05 * punch + fz
      const fx = fz ? focus.x : W2 / 2
      const fy = fz ? focus.y : H / 2
      world.scale.set(z)
      world.position.set(fx - fx * z + (Math.random() - 0.5) * 14 * shake, fy - fy * z + (Math.random() - 0.5) * 10 * shake)
      if (shock) {
        const age = (t - shock.t0) / 1000
        shock.f.time = age
        if (age > 0.9) {
          worldFx.delete(shock.f)
          setWorldFx()
          shock = null
        }
      }
      dim *= Math.pow(0.05, dt)
      const d = Math.round(255 * (1 - dim * cfg.fxAlpha))
      bg.tint = (d << 16) | (d << 8) | Math.min(255, Math.round(d + 30 * dim))
    }

    const still = (side, i, name, ms) => units[side]?.[i] && (units[side][i].still = name ? [name, ms] : null)
    // (what is on the stage right now: for checking that effects go away and nothing piles up)
    const stats = () => app && { fx: fxLayer.children.length, shots: shotLayer.children.length, parts: parts.length, text: textLayer.children.length, tweens: tweens.length, lost: !!app.renderer.gl?.isContextLost?.(), running: app.ticker.started, textures: app.renderer.texture?.managedTextures?.length, heapMB: Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576), units: units.p.length + units.m.length, unitLayer: unitsLayer.children.length }
    return { setFxAlpha, info, open, close, sync, play, playLive, newBattle, liveOn, background, units: () => units, still, setArms, armsOn: () => armsOn, stats, view: () => ({ ...view }) }
  })()

  // #dev-start
  // ---------- demo: plays a scripted sequence (stage works without a battle) ----------
  function demo() {
    if (!Stage.open()) return alert(L("先进入战斗页面（能看到“交战”标签）", "Open the combat page first (the Battle tab)"))
    Lab.startAuto()
  }
  // #dev-end

  // #dev-start
  // ---------- 录制战斗消息: samples of every websocket message type plus the battle panels' DOM ----------
  // For supporting a new mode (labyrinth, guild trials): record while fighting there, the file shows which
  // messages drive it and where its battle cards sit. Chat is counted, never stored.
  const Recorder = (() => {
    let rec = null
    let timer = 0
    const RE = /Battle|Combat|Labyrinth|Guild|Header|Navigation|Chat|GamePage/
    // class name -> count over the elements whose classes mention battle / combat / labyrinth / guild
    function classes() {
      const out = {}
      for (const el of document.querySelectorAll('[class*="Battle"],[class*="Combat"],[class*="Labyrinth"],[class*="Guild"],[class*="Header"],[class*="Navigation"],[class*="Chat"],[class*="GamePage"]'))
        for (const c of el.classList) if (RE.test(c)) out[c] = (out[c] || 0) + 1
      return out
    }
    // indented tag.class tree (with svg use hrefs and short texts) of the outermost battle-ish containers
    function outline() {
      const lines = []
      const walk = (el, d) => {
        if (lines.length > 4000 || d > 12) return
        const cls = typeof el.className === "string" ? el.className : el.getAttribute?.("class") || ""
        const href = el.tagName === "use" ? " href=" + (el.getAttribute("href") || el.getAttribute("xlink:href") || "") : ""
        const text = el.children.length ? "" : (el.textContent || "").trim().slice(0, 40)
        lines.push("  ".repeat(d) + el.tagName.toLowerCase() + (cls ? "." + cls.trim().split(/\s+/).join(".") : "") + href + (text ? ` "${text}"` : ""))
        for (const ch of el.children) walk(ch, d + 1)
      }
      const ROOTS = '[class*="BattlePanel"],[class*="Labyrinth"],[class*="GuildTrial"],[class*="Guild_"],[class*="GuildPanel_inProgressTab"]'
      const roots = [...document.querySelectorAll(ROOTS)].filter(el => !el.parentElement?.closest(ROOTS))
      roots.slice(0, 6).forEach(r => walk(r, 0))
      return lines.join("\n")
    }
    function on(type, msg) {
      if (!rec) return
      const t = (rec.types[type] ||= { n: 0, bytes: 0, samples: [] })
      t.n++
      t.bytes += msg.length
      if (!t.classes) t.classes = classes()
      if (/chat/.test(type) || t.samples.length >= 25 || rec.size > 8e6) return
      const m = msg.length > 300000 ? msg.slice(0, 300000) : msg
      t.samples.push({ at: Date.now() - rec.t0, msg: m })
      rec.size += m.length
    }
    function start() {
      rec = { version: GM_info?.script?.version, url: location.href, t0: Date.now(), size: 0, types: {}, snapshots: [] }
      const snap = () => rec && rec.snapshots.push({ at: Date.now() - rec.t0, classes: classes() }) && rec.snapshots.length > 120 && rec.snapshots.shift()
      snap()
      timer = setInterval(snap, 10000)
    }
    function stop() {
      clearInterval(timer)
      const data = { ...rec, seconds: Math.round((Date.now() - rec.t0) / 1000), outline: outline(), classesEnd: classes() }
      rec = null
      const a = document.createElement("a")
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }))
      a.download = `mwi-battle-rec-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      return data
    }
    return { on, start, stop, active: () => !!rec }
  })()
  // #dev-end

  // ---------- in-page dialogs for the menu ----------
  // The menu's settings ask in a small panel on the page, not with prompt() / alert(): some mobile browsers' userscript
  // menus (Reynard on iOS) hang on a second prompt() opened from a menu command.
  function panel(title, build) {
    document.querySelector(".bfx-dlg")?.remove()
    const wrap = document.createElement("div")
    wrap.className = "bfx-dlg"
    Object.assign(wrap.style, { position: "fixed", inset: "0", zIndex: "2147483000", background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", font: "14px/1.5 sans-serif" })
    const box = document.createElement("div")
    Object.assign(box.style, { background: "#1d2440", color: "#e6ebff", border: "1px solid #4a5590", borderRadius: "10px", padding: "14px 16px", width: "min(320px, 86vw)", boxShadow: "0 6px 30px rgba(0,0,0,.6)" })
    const h = document.createElement("div")
    h.textContent = title
    Object.assign(h.style, { fontWeight: "700", marginBottom: "10px" })
    box.appendChild(h)
    const close = () => wrap.remove()
    wrap.addEventListener("click", e => e.target === wrap && close())
    build(box, close)
    wrap.appendChild(box)
    document.body.appendChild(wrap)
  }
  const dlgButton = (text, onClick, main) => {
    const b = document.createElement("button")
    b.textContent = text
    Object.assign(b.style, { padding: "6px 14px", borderRadius: "6px", border: "1px solid #4a5590", background: main ? "#3f5bd8" : "#2a3460", color: "#fff", font: "14px sans-serif", cursor: "pointer" })
    b.addEventListener("click", onClick)
    return b
  }
  function showInfo(title, text) {
    panel(title, (box, close) => {
      const t = document.createElement("div")
      t.textContent = text
      Object.assign(t.style, { whiteSpace: "pre-wrap", fontSize: "13px", marginBottom: "12px" })
      const row = document.createElement("div")
      Object.assign(row.style, { display: "flex", justifyContent: "flex-end" })
      row.appendChild(dlgButton(L("关闭", "Close"), close, true))
      box.append(t, row)
    })
  }
  // a number by a slider (min … max by step), shown as it would be; onSet(value) when confirmed
  function askNumber(title, value, min, max, step, fmtV, onSet) {
    panel(title, (box, close) => {
      const v = document.createElement("div")
      Object.assign(v.style, { textAlign: "center", fontSize: "20px", fontWeight: "700", margin: "4px 0 8px" })
      const r = document.createElement("input")
      Object.assign(r, { type: "range", min, max, step, value })
      Object.assign(r.style, { width: "100%" })
      const show = () => (v.textContent = fmtV(+r.value))
      r.addEventListener("input", show)
      show()
      const row = document.createElement("div")
      Object.assign(row.style, { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" })
      row.append(dlgButton(L("取消", "Cancel"), close), dlgButton(L("确定", "OK"), () => (close(), onSet(+r.value)), true))
      box.append(v, r, row)
    })
  }
  // ---------- menu ----------
  let menuIds = []
  // the menu rebuilt after the command that changed it has returned (rebuilt from inside it, some managers hang)
  const menuSoon = () => setTimeout(menu, 50)
  function menu() {
    menuIds.forEach(id => GM_unregisterMenuCommand?.(id))
    const toggle = (key, label, after) =>
      GM_registerMenuCommand(`${cfg[key] ? "✅" : "⬜"} ${label}`, () => {
        cfg[key] = !cfg[key]
        saveCfg()
        after?.()
        menuSoon()
      })
    menuIds = [
      // #dev-start
      GM_registerMenuCommand(L(`当前版本 v${GM_info?.script?.version || "?"}（点击检查素材）`, `Version ${GM_info?.script?.version || "?"} (check assets)`), () => {
        Assets.refresh(true)
        const n = ["fx", "m", "bg"].map(k => `${k}:${Assets.list(k).length}`).join(" ") + ` 纸娃娃:${Assets.get("doll") || 0}`
        const i = Assets.info()
        alert(`脚本 v${GM_info?.script?.version || "?"}\n素材清单 ${n}\n清单版本 ${i.rev || "?"}（${i.source || "本地缓存"}，${i.fetchedAt ? new Date(i.fetchedAt).toLocaleString() : "-"}）\n素材地址 ${i.base || (i.mirror ? "默认（jsDelivr 连不上，走 gh-proxy 镜像）" : "默认")}\n（正在重新拉取清单，几秒后再点一次可看新结果）`)
      }),
      // #dev-end
      // #release-start
      // GM_registerMenuCommand(L(`当前版本 v${GM_info?.script?.version || "?"}`, `Version ${GM_info?.script?.version || "?"}`), () => Assets.refresh(true)),
      // #release-end
      toggle("enabled", L("战斗动画", "Battle animations"), () => Stage.ensureTab()),
      // the rigged stage (new, the default) or the pose-picture one (old)
      GM_registerMenuCommand(L(`战斗舞台：${cfg.stageEngine === "classic" ? "老版（整张立绘）" : "新版（骨骼动画）"}（点击切换）`, `Battle stage: ${cfg.stageEngine === "classic" ? "old (pose pictures)" : "new (rigged)"} (click to switch)`), () =>
        Live.setEngine(cfg.stageEngine === "classic" ? "rig" : "classic"),
      ),
      // what the rigged stage draws at (for a report of a soft picture)
      GM_registerMenuCommand(L("战斗舞台清晰度信息", "Battle stage sharpness info"), () => {
        const i = Arena.info()
        const title = L("战斗舞台清晰度信息", "Battle stage sharpness info")
        if (!i) return showInfo(title, L("新版舞台还没打开：进入战斗页面、看到舞台后再点", "The new stage is not open yet: open the battle page first"))
        showInfo(
          title,
          L(
            `屏幕像素密度 ${i.dpr}\n页面缩放 ${i.scale.toFixed(2)}\n舞台绘制倍率 ${i.res.toFixed(2)}（上限 ${i.cap}）\n画布 ${i.canvas.join("×")} 像素，显示 ${i.shown.join("×")}\n${i.level ? `因为帧率低，画质已自动降到第 ${i.level} 级（共 4 级：1 最高 2 倍，2 减少粒子和光晕，3 最高 1.5 倍且关掉光晕，4 为 1 倍）` : "画质没有因为帧率降低"}`,
            `Screen density ${i.dpr}\nPage scale ${i.scale.toFixed(2)}\nStage drawn at ${i.res.toFixed(2)}x (cap ${i.cap})\nCanvas ${i.canvas.join("x")} px, shown ${i.shown.join("x")}\n${i.level ? `Quality lowered to step ${i.level} of 4 for a low frame rate` : "Quality not lowered for frame rate"}`,
          ),
        )
      }),
      toggle("life", L("生活技能动画（小窗）", "Skilling animation window"), () => Life.ensure()),
      toggle("lifeTown", L("小窗：空闲 / 战斗时显示小镇", "Window: show the town when idle / fighting"), () => Life.ensure()),
      // #dev-start
      GM_registerMenuCommand(`角色形象：${cfg.lookMode === "outfit" ? "按服装" : "按装备"}（点击切换）`, () => {
        cfg.lookMode = cfg.lookMode === "outfit" ? "equip" : "outfit"
        saveCfg()
        if (Stage.modeOf() === "live") Stage.reload()
        menuSoon()
      }),
      GM_registerMenuCommand("导出待生成形象（复制到剪贴板）", () => {
        const n = Looks.exportMissing()
        alert(n ? `已复制 ${n} 个还没有立绘的形象，发给 Claude 生成即可` : "当前没有缺立绘的形象")
      }),
      GM_registerMenuCommand("素材地址", () => {
        const v = prompt("立绘素材的地址（留空 = 默认 CDN）", cfg.assetBase || DEFAULT_ASSET_BASE)
        if (v === null) return
        cfg.assetBase = v.trim() === DEFAULT_ASSET_BASE ? "" : v.trim()
        saveCfg()
        Assets.refresh(true)
      }),
      // #dev-end
      // how see-through the skill effects are, on both stages
      GM_registerMenuCommand(L(`技能特效透明度：${Math.round(cfg.fxAlpha * 100)}%（点击调整）`, `Skill effect opacity: ${Math.round(cfg.fxAlpha * 100)}% (click to change)`), () =>
        askNumber(L("技能特效的不透明度（100% = 原样，0% = 不显示）", "Skill effect opacity (100% = as is, 0% = hidden)"), Math.round(cfg.fxAlpha * 100), 0, 100, 5, v => v + "%", v => {
          cfg.fxAlpha = v / 100
          saveCfg()
          Arena.setFxAlpha()
          document.querySelectorAll(".bfx-stage canvas").forEach(c => (c.style.opacity = cfg.fxAlpha))
          menuSoon()
        }),
      ),
      GM_registerMenuCommand(L(`动画大小：${cfg.scale}`, `Animation size: ${cfg.scale}`), () =>
        askNumber(L("动画大小倍率", "Animation size"), cfg.scale, 0.5, 2, 0.05, v => v.toFixed(2) + "×", v => {
          cfg.scale = Math.round(v * 100) / 100
          saveCfg()
          Stage.layout()
          menuSoon()
        }),
      ),
      GM_registerMenuCommand(L("打开动画测试（自动战斗）", "Open the FX lab (auto battle)"), demo), // #dev
      GM_registerMenuCommand("生活动画测试（小窗）", () => Life.lab()), // #dev
      GM_registerMenuCommand(Recorder.active() ? L("⏹ 停止录制并下载文件", "⏹ Stop recording and download") : L("⏺ 录制战斗消息（迷宫 / 公会战）", "⏺ Record battle messages (labyrinth / guild)"), () => (Recorder.active() ? Recorder.stop() : Recorder.start(), menuSoon())), // #dev
      toggle("debug", L("调试：控制台打印战斗消息", "Debug: log battle messages")), // #dev
    ]
  }
  menu()
  Stage.start()
  setInterval(() => (GuildLive.ensure(), Live.ensure()), 1000)
  // always fetch a fresh manifest on page load: a cached one from an older release lacks the new art
  Assets.refresh(true)
  Assets.probe()

  // ---------- websocket hook ----------
  // battle ticks drive the stage; character / profile / item / action messages feed looks and the location
  const WANTED = /^(new_battle|battle_updated|new_guild_battle|guild_battle_updated|labyrinth_updated|init_character_data|profile_shared|items_updated|actions_updated|action_completed|new_guild_skilling|guild_skilling_updated|labyrinth_room_progress|guild_updated|guild_characters_updated|chat_message_received)$|party|buff|house/
  function onCharacterMessage(obj) {
    // completions only carry inventory counts (and the tools' slots), never the visible gear
    if (obj.type !== "action_completed") Looks.onMessage(obj)
    Life.onMessage(obj)
    if (obj.type === "action_completed") return
    const act = combatActionIn(obj)
    if (act) {
      where.zone = shortId(act.actionHrid)
      where.tier = act.difficultyTier || 0
      Stage.setBackground()
    }
  }
  // the hook itself is installed at the top of the script
  onWsMessage = msg => {
    const type = (/"type":"([a-z_]+)"/.exec(msg.slice(0, 200)) || (msg.length < 20000 && /"type":"([a-z_]+)"/.exec(msg)) || [])[1]
    Recorder.on(type || "?", msg) // #dev
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
            where.floor = obj.labyrinth?.currentFloor || 0
            Stage.setBackground()
            Life.onMessage(obj) // the skilling rooms are the window's
          }
          else onCharacterMessage(obj)
        } catch (e) {
          if (cfg.debug) console.warn("[战斗动画]", e) // #dev
        }
      }, 0)
    }
  }
  for (const msg of earlyWs.splice(0)) onWsMessage(msg)

  W.__mwiBattleFx = { demo, units, cfg, Stage, Doll, Recorder, Life, Arena } // #dev
})()
