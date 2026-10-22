// ==UserScript==
// @name         MWI 战斗动画
// @namespace    mwi-battle-fx
// @version      0.8.0
// @description  银河奶牛放置：在战斗页"交战"旁加一个"舞台"标签，用杀戮尖塔式的侧视画面播放战斗（AI 生成的角色/怪物立绘与地点背景，攻击、弹道、受击、阵亡）。只在打开该标签时运行；不改游戏原有界面，只读游戏消息；立绘从素材 CDN 加载。
// @match        https://www.milkywayidle.com/*
// @match        https://milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @match        https://milkywayidlecn.com/*
// @run-at       document-start
// @updateURL    https://cdn.jsdelivr.net/gh/wow121/mwi-battle-fx@main/mwi-battle-fx.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/wow121/mwi-battle-fx@main/mwi-battle-fx.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @connect      cdn.jsdelivr.net
// @connect      *
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  "use strict"
  const W = typeof unsafeWindow !== "undefined" ? unsafeWindow : window

  // ---------- settings ----------
  const DEFAULTS = { enabled: true, scale: 1, debug: false, stageH: 360, lookMode: "equip", assetBase: "", overlay: true, liveH: 300 }
  const DEFAULT_ASSET_BASE = "https://cdn.jsdelivr.net/gh/wow121/mwi-battle-fx@main"
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
    if (cfg.debug) console.log("[战斗动画] new_battle", obj)
    if (cfg.enabled) Stage.newBattle()
  }

  const other = side => (side === "p" ? "m" : "p")

  function onBattleUpdated(obj) {
    if (!units.p.length && !units.m.length) return
    const changes = [] // {side, i, dHP, dMP, hp, maxHp, acted, prevAbility, died, revived}
    for (const side of ["p", "m"]) {
      const map = obj[side + "Map"] || {}
      for (const k of Object.keys(map)) {
        const i = +k
        const e = map[k]
        const u = units[side][i]
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
        for (const key of ["atkCounter", "dmgCounter"]) if (typeof e[key] === "number") u.counters[key] = e[key]
        // abilityHrid / isAutoAtk describe the NEXT action
        if ("abilityHrid" in e) u.ability = e.abilityHrid || null
        else if (e.isAutoAtk) u.ability = null
        changes.push(c)
      }
    }
    const actions = resolve(changes)
    if (cfg.debug) console.log("[战斗动画]", JSON.stringify(obj), changes, actions)
    if (cfg.enabled) Stage.play(actions)
  }

  // turns raw hp/mp deltas into actions:
  // {actor: {side,i}|null, ab, effect: damage|heal|buff|regen, style, element, targets: [change]}
  function resolve(changes) {
    const actions = []
    // with action counters a cast is "acted while an ability was prepared"; without them, an MP drop
    const countersKnown = changes.some(c => units[c.side][c.i]?.counters?.atkCounter !== undefined)
    const casters = changes.filter(c => c.prevAbility && (countersKnown ? c.acted : c.dMP < 0))
    // misses (struck without HP loss) travel with the hits so they still get a "MISS"
    const hurt = changes.filter(c => c.dHP < 0 || (c.struck && c.dHP === 0))
    const healed = changes.filter(c => c.dHP > 0)
    const used = new Set()

    for (const c of casters) {
      const ab = abilityInfo(c.prevAbility)
      const u = units[c.side][c.i]
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
      const foes = units[other(t.side)]
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
    // life drain / regen ticks
    for (const h of healed) if (!used.has(h)) actions.push({ actor: null, ab: null, effect: "regen", style: "", element: "heal", targets: [h] })
    return actions
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
  const where = { zone: null, tier: 0 }
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
      GM_xmlhttpRequest({
        method: "GET",
        url: base() + "/assets/manifest.json?t=" + Math.floor(Date.now() / 600e3),
        timeout: 20000,
        onload: r => {
          loading = false
          try {
            manifest = JSON.parse(r.responseText)
            fetchedAt = Date.now()
            GM_setValue("battle_fx_manifest_v1", manifest)
            GM_setValue("battle_fx_manifest_at_v1", fetchedAt)
            listeners.forEach(f => f())
          } catch (e) {
            if (cfg.debug) console.warn("[战斗动画] manifest", e)
          }
        },
        onerror: () => (loading = false),
        ontimeout: () => (loading = false),
      })
    }
    const has = (kind, id) => !!id && !!manifest?.[kind]?.includes(id)
    // files come from the commit the manifest was published at, so the CDN can never serve stale art
    const url = path => (manifest?.rev && !cfg.assetBase ? DEFAULT_ASSET_BASE.replace(/@main$/, "@" + manifest.rev) : base()) + "/assets/" + path
    return { refresh, has, url, list: kind => manifest?.[kind] || [], onChange: f => listeners.push(f) }
  })()

  // ---------- player looks: by equipment or by avatar + outfit (per-viewer setting) ----------
  const VISIBLE_SLOTS = ["head", "body", "legs", "feet", "hands", "main_hand", "two_hand", "off_hand", "back"]
  const Looks = (() => {
    const me = { name: null, avatar: null, outfit: null, items: {} }
    const profiles = GM_getValue("battle_fx_profiles_v1", {}) // player name -> {avatar, outfit, items}
    const missing = GM_getValue("battle_fx_missing_v1", {}) // look id -> spec, for 导出待生成形象
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
    function onMessage(obj) {
      if (obj.type === "init_character_data") {
        me.name = obj.character?.name || me.name
        Object.assign(me, avatarOf(obj.character || {}))
        if (!me.avatar) Object.assign(me, avatarOf(obj))
        me.items = itemsFrom(obj.characterItems)
      } else if (obj.type === "profile_shared") {
        const p = obj.profile || {}
        const name = p.sharableCharacter?.name
        if (name) {
          profiles[name] = { ...avatarOf(p.sharableCharacter), items: itemsFrom(p.wearableItemMap) }
          GM_setValue("battle_fx_profiles_v1", profiles)
        }
      } else if (Array.isArray(obj.endCharacterItems)) {
        // equipping moves the item into a visible slot; unequipping moves it back to the inventory
        for (const it of obj.endCharacterItems) {
          const slot = shortId(it.itemLocationHrid)
          const id = shortId(it.itemHrid)
          if (VISIBLE_SLOTS.includes(slot) && it.count > 0) me.items[slot] = id
          else for (const s of VISIBLE_SLOTS) if (me.items[s] === id) delete me.items[s]
        }
      }
    }
    // avatar/outfit layers drawn on the game's battle card
    function cardLook(i) {
      const out = {}
      for (const u of cardEl("p", i)?.querySelectorAll("use") || []) {
        const h = u.getAttribute("href") || u.getAttribute("xlink:href") || ""
        if (/avatar_outfits/.test(h)) out.outfit = h.split("#")[1]
        else if (/avatars?_/.test(h) && !/background|border/.test(h)) out.avatar = h.split("#")[1]
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
        if (m === modes[0] && !missing[id]) {
          missing[id] = { id, ...sp, name: u.name }
          GM_setValue("battle_fx_missing_v1", missing)
        }
      }
    }
    function exportMissing() {
      const list = Object.values(missing).filter(x => !Assets.has("p", x.id))
      GM_setClipboard(JSON.stringify(list, null, 1))
      return list.length
    }
    return { onMessage, assign, exportMissing, me }
  })()

  // ---------- pose flips picked in the lab's gallery (per viewer, on top of the shipped flips) ----------
  const Flips = (() => {
    const f = GM_getValue("battle_fx_flips_v1", {}) // monster id -> [poses]
    const has = (art, pose) => !!art && art.startsWith("m/") && (f[art.slice(2)] || []).includes(pose)
    function toggle(id, pose, on) {
      const set = new Set(f[id] || [])
      if (on) set.add(pose)
      else set.delete(pose)
      if (set.size) f[id] = [...set]
      else delete f[id]
      GM_setValue("battle_fx_flips_v1", f)
    }
    const text = () => Object.entries(f).map(([id, ps]) => id + ":" + ps.join(",")).join("\n")
    return { has, toggle, text, of: id => f[id] || [] }
  })()

  // ---------- side-view stage: Slay-the-Spire style, heroes on the left, monsters on the right ----------
  const Stage = (() => {
    const SVGNS = "http://www.w3.org/2000/svg"
    const actors = { p: [], m: [] }
    const fx = [] // canvas effects {t0, dur, draw(ctx, p, now), done}
    let stageEl, worldEl, canvas, ctx, banner, waitEl, bgEl
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
.bfx-world{position:absolute;inset:0}
.bfx-bg{position:absolute;inset:0;background:center 85%/cover no-repeat;opacity:0;transition:opacity .6s}
.bfx-bg:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.15),transparent 30%,transparent 70%,rgba(0,0,0,.35))}
/* frames are the 512px pose cell plus a 96px margin all round: scale up so the cell fills the actor box */
.bfx-sprite img{position:absolute;left:-18.75%;top:-18.75%;width:137.5%;height:137.5%;display:block}
.bfx-art .bfx-shadow{bottom:2%;height:10%;width:56%}
.bfx-rings{position:absolute;left:50%;bottom:0;width:0;height:0}
.bfx-ring{position:absolute;border-radius:50%;border:2px solid;transform:translate(-50%,-50%);animation:bfx-ring 2.4s ease-in-out infinite}
@keyframes bfx-ring{0%,100%{opacity:.45}50%{opacity:.95}}
.bfx-chips{display:flex;justify-content:center;flex-wrap:wrap;gap:2px;margin-bottom:2px;min-height:0}
.bfx-chip{width:14px;height:14px;border-radius:50%;font:700 9px/14px sans-serif;text-align:center;color:#1a1a1a;box-shadow:0 0 3px rgba(0,0,0,.8)}
.bfx-chip.debuff{color:#fff;background:#5a1a24!important;border:1px solid #ff5a6a;line-height:12px}
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
.bfx-hud{position:absolute;left:50%;top:100%;width:min(84%,140px);transform:translateX(-50%);margin-top:2px}
.bfx-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;font-size:11px;font-weight:600;text-shadow:0 1px 2px #000,0 0 3px #000}
.bfx-bar{position:relative;height:4px;margin-top:2px;background:rgba(0,0,0,.6);border-radius:2px;overflow:visible;box-shadow:0 0 0 1px rgba(0,0,0,.4)}
.bfx-bar i{display:block;height:100%;width:100%;border-radius:2px;transition:width .3s}
.bfx-num{position:absolute;left:0;top:0;z-index:6000;font:900 16px/1 sans-serif;white-space:nowrap;-webkit-text-stroke:1px rgba(0,0,0,.85);paint-order:stroke fill;text-shadow:0 2px 3px rgba(0,0,0,.6)}
.bfx-banner{position:absolute;left:50%;top:8px;z-index:6000;transform:translateX(-50%);padding:4px 14px;border:1px solid rgba(255,255,255,.35);border-radius:4px;background:linear-gradient(#26306a,#121a3c);font-weight:700;font-size:13px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.5);opacity:0}
.bfx-wait{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:.5}
.bfx-live-slot{position:absolute;inset:0;z-index:5}
.bfx-stage.bfx-live{position:absolute;inset:0;height:auto;min-height:0;resize:none;border-radius:6px}
.bfx-toggle{position:absolute;top:2px;right:4px;z-index:20;padding:2px 8px;font:12px/18px sans-serif;color:#dfe6ff;background:rgba(20,26,52,.85);border:1px solid #4a5590;border-radius:10px;cursor:pointer}
.bfx-toggle:hover{background:#2a3460}
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
.bfx-lab .gal label{font-size:11px;cursor:pointer}`
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
      if (!cfg.enabled) return
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
      stageEl.innerHTML = '<div class="bfx-world"><div class="bfx-bg"></div><canvas></canvas></div><div class="bfx-banner"></div><div class="bfx-wait">等待战斗…</div>'
      worldEl = stageEl.querySelector(".bfx-world")
      bgEl = stageEl.querySelector(".bfx-bg")
      canvas = stageEl.querySelector("canvas")
      ctx = canvas.getContext("2d")
      banner = stageEl.querySelector(".bfx-banner")
      waitEl = stageEl.querySelector(".bfx-wait")
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
    function attach(newHost, newMode) {
      injectCss()
      if (!stageEl) createStage()
      if (host === newHost && mode === newMode && stageEl.parentElement === newHost) return
      host = newHost
      mode = newMode
      shown = mode === "test" ? Lab.units : units
      fx.length = 0
      stageEl.classList.toggle("bfx-live", mode === "live")
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
      playersKey = ""
      rebuild(true)
      setBackground()
      for (const side of ["p", "m"]) actors[side].forEach(a => (setBars(a), shown[side][a.i]?.hp <= 0 && die(a, true), renderStatus(a)))
    }
    // location art, the elite / nightmare variant for higher tiers, plus a slight per-tier grade
    function setBackground() {
      if (!bgEl) return
      const loc = mode === "test" ? Lab.loc() : stageLocation()
      const t = mode === "test" ? Lab.tier() : where.tier || 0
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
    // monsters: sheet + hrid (cards may still show the previous wave); players: the avatar/outfit layers on their card
    function spriteFor(side, i) {
      const u = shown[side][i]
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
      const d = "default_" + (u?.style || "slash")
      return Assets.has("p", d) ? "p/" + d : null
    }
    const frameUrl = (a, pose) => Assets.url(`${a.art}/${pose}.webp`)
    // swaps to a pose frame; ms > 0 falls back to idle (or dead) afterwards
    function setPose(a, pose, ms) {
      if (!a.art || !a.img) return
      clearTimeout(a.poseTimer)
      if (a.dead && pose !== "dead") return
      showFrame(a, pose)
      if (ms > 0) a.poseTimer = setTimeout(() => showFrame(a, a.dead ? "dead" : "idle"), ms)
    }
    function showFrame(a, pose) {
      a.img.src = frameUrl(a, pose)
      a.img.style.transform = Flips.has(a.art, pose) ? "scaleX(-1)" : ""
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
      if (a.real) return
      const sp = spriteFor(a.side, a.i)
      if (sp.key === a.spriteKey) return
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
      el.querySelector(".bfx-name").textContent = u.name || ""
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
      canvas.width = Math.round(SW * dpr)
      canvas.height = Math.round(SH * dpr)
      // each side stands in a row on the same ground line, first unit nearest the middle;
      // every other unit steps a little back so a crowded row still reads
      const ground = SH * 0.84
      for (const side of ["p", "m"]) {
        const list = actors[side]
        const n = list.length
        // shrink with the head count so neighbours overlap by at most ~30%
        const s = Math.min(SH * 0.5, SW * 0.21, (SW * 0.44) / (1 + 0.72 * Math.max(0, n - 1))) * cfg.scale
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
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
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
    function preloadFx() {
      for (const n of ["entangle", "water_strike", "life_drain", "smoke_burst", "firestorm", "flame_blast", "natures_veil", "toxic_pollen", "mana_spring", "fire_orb", "ice_orb", "nature_orb", "fire_burst", "water_burst", "nature_burst", "phys_hit", "slash", "stab", "smash", "fire_pillar", "ice_spikes", "poison_cloud", "heal", "buff", "revive", "death", "circles"]) fxImg(n)
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
    function projectile(from, to, { kind, color, dur, arc = 0, size = 1, art }, onHit) {
      const trail = []
      const im = art && fxImg(art)
      const f = addFx(dur, (c, p) => {
        const e = kind === "meteor" ? p * p : p
        const x = from.x + (to.x - from.x) * e
        const y = from.y + (to.y - from.y) * e - arc * 4 * e * (1 - e)
        const ang = Math.atan2(to.y - from.y - arc * 4 * (1 - 2 * e), to.x - from.x)
        c.globalCompositeOperation = "lighter"
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
          const L = 26 * cfg.scale * size
          c.translate(x, y)
          c.rotate(ang)
          const g = c.createLinearGradient(-L * 2.2, 0, 0, 0)
          g.addColorStop(0, "rgba(255,255,255,0)")
          g.addColorStop(1, color)
          c.strokeStyle = g
          c.lineWidth = 2.5 * cfg.scale
          c.beginPath()
          c.moveTo(-L * 2.2, 0)
          c.lineTo(0, 0)
          c.stroke()
          c.fillStyle = "#fff"
          c.beginPath()
          c.moveTo(4 * cfg.scale, 0)
          c.lineTo(-5 * cfg.scale, -3.5 * cfg.scale)
          c.lineTo(-5 * cfg.scale, 3.5 * cfg.scale)
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
      n.className = "bfx-num"
      n.textContent = text
      n.style.color = kind === "heal" ? "#7dffa5" : kind === "miss" ? "#c8d2e8" : a.side === "p" ? "#ffb0a8" : "#fff"
      n.style.fontSize = 16 * cfg.scale * (kind === "big" ? 1.25 : 1) + "px"
      worldEl.appendChild(n)
      const x = a.x + (Math.random() - 0.5) * a.s * 0.5
      const y = a.y - a.s * 0.85
      const tr = (dy, s) => `translate(${x}px,${y + dy}px) translate(-50%,-50%) scale(${s})`
      n.animate(
        [
          { transform: tr(0, 0.4), opacity: 0 },
          { transform: tr(-26, 1.3), opacity: 1, offset: 0.16 },
          { transform: tr(-12, 1), opacity: 1, offset: 0.3 },
          { transform: tr(-16, 1), opacity: 1, offset: 0.8 },
          { transform: tr(-30, 1), opacity: 0 },
        ],
        { duration: 1100, fill: "forwards", easing: "ease-out" },
      ).onfinish = () => n.remove()
    }
    function showBanner(a, ab) {
      const u = shown[a.side][a.i]
      banner.textContent = (u?.name ? u.name + "：" : "") + ab.name
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
      if (t && !t.dHP) {
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
      if (style === "smash" && !sprite("smash", a.x, a.y + a.s * 0.05, a.s * 0.9, { dur: 560, anchor: "bottom" })) {
        ringFx(a.x, a.y, a.s * 0.1, a.s * 0.8, "#fff", 380, 0.3, 4)
        burst(a.x, a.y, { n: 12, color: "#c9b38a", angle: -Math.PI / 2, spread: 2.6, speed: 120, gravity: 300, life: 500, size: 3 })
      }
      if (t) {
        number(a, fmt(t.dHP), big ? "big" : "")
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

    function ranged(src, tg, element, aoe, quick, ab) {
      const spec = fxSpec(ab)
      let rainShown = false
      const color = element === "physical" ? "#ffe9b0" : ELEMENT_COLOR[element]
      const drawT = quick ? 60 : 200
      setPose(src, "windup", drawT)
      later(drawT, () => setPose(src, "strike", 320))
      src.pose.animate(
        [{ transform: "none" }, { transform: `translateX(${-src.dir * 8}%) rotate(${-src.dir * 8}deg)`, offset: 0.7 }, { transform: "none" }],
        { duration: drawT + 160, easing: "ease-out" },
      )
      later(drawT, () => {
        tg.forEach(({ t, a }, n) => {
          const m = mid(a)
          if (spec?.ground) {
            const shown = n === 0 ? (rainShown = groupFx(spec, tg.map(x => x.a), 0, 900)) : rainShown
            later(260 + n * 50, () => impact(a, t, "ranged", element, true, shown))
          } else if (aoe) {
            for (let k = 0; k < 3; k++) {
              const from = { x: m.x - a.dir * (20 + k * 14), y: -10 - k * 25 }
              const to = { x: m.x + (k - 1) * a.s * 0.25, y: a.y - a.s * 0.15 }
              later(n * 70 + k * 60, () => projectile(from, to, { kind: "arrow", color, dur: 260 }, () => (k === 0 ? impact(a, t, "ranged", element) : burst(to.x, to.y, { n: 5, color, life: 300, speed: 80 }))))
            }
          } else {
            later(n * 70, () => projectile(mid(src), m, { kind: "arrow", color, dur: 300, arc: Math.min(30, SW * 0.04), art: spec?.proj, size: 0.8 }, () => impact(a, t, "ranged", element, !!ab)))
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
        if (!mode) return
        if (mode === "live") shown.p.forEach((u, i) => Looks.assign(u, i))
        for (const side of ["p", "m"]) actors[side].forEach(refreshSprite)
        bgKey = ""
        setBackground()
      })
    }

    const refreshArt = () => ["p", "m"].forEach(side => actors[side].forEach(a => (a.art = null, a.real = false, refreshSprite(a))))
    return { play, newBattle, layout, open, start, ensureTab, actors, setBackground, attach, detach, reload, refreshArt, isTestActive: () => active, modeOf: () => mode }
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
      if (!Stage.isTestActive()) Stage.attach(slot, "live")
    }
    return { ensure }
  })()

  // ---------- 动画测试: a sandbox for any location, line-up, skill and pose ----------
  const MONSTERS = {"abyssal_imp":["深渊小鬼","magic","fire"],"acrobat":["杂技师","smash","physical"],"alligator":["夏洛克","slash","physical"],"anchor_shark":["持锚鲨","smash","physical"],"aquahorse":["水马","ranged","water"],"black_bear":["黑熊","stab","physical"],"brine_marksman":["海盐射手","ranged","physical"],"butterjerry":["蝶鼠","stab","physical"],"captain_fishhook":["鱼钩船长","slash","physical"],"centaur_archer":["半人马弓箭手","ranged","physical"],"chronofrost_sorcerer":["霜时巫师","magic","water"],"crab":["螃蟹","smash","physical"],"crystal_colossus":["水晶巨像","stab","physical"],"cyclops":["独眼巨人","smash","physical"],"demonic_overlord":["恶魔霸主","magic","fire"],"deranged_jester":["小丑皇","smash","physical"],"dodocamel":["渡渡驼","smash","physical"],"dryad":["树精","magic","nature"],"dusk_revenant":["黄昏亡灵","ranged","physical"],"elementalist":["元素法师","magic","fire"],"enchanted_bishop":["秘法主教","magic","nature"],"enchanted_king":["秘法国王","slash","physical"],"enchanted_knight":["秘法骑士","slash","physical"],"enchanted_pawn":["秘法士兵","smash","physical"],"enchanted_queen":["秘法王后","magic","water"],"enchanted_rook":["秘法堡垒","ranged","physical"],"eye":["独眼","slash","physical"],"eyes":["叠眼","slash","physical"],"flame_sorcerer":["火焰巫师","magic","fire"],"fly":["苍蝇","smash","physical"],"frog":["青蛙","smash","physical"],"frost_sniper":["霜冻狙击手","ranged","water"],"giant_mantis":["巨螳螂","slash","physical"],"giant_scorpion":["巨蝎","stab","physical"],"giant_shoebill":["鲸头鹳","smash","physical"],"gobo_boomy":["轰轰","magic","fire"],"gobo_chieftain":["哥布林酋长","stab","physical"],"gobo_shooty":["咻咻","ranged","physical"],"gobo_slashy":["砍砍","slash","physical"],"gobo_smashy":["锤锤","smash","physical"],"gobo_stabby":["刺刺","stab","physical"],"granite_golem":["花岗岩魔像","smash","physical"],"griffin":["狮鹫","slash","physical"],"grizzly_bear":["棕熊","slash","physical"],"gummy_bear":["软糖熊","smash","physical"],"ice_sorcerer":["冰霜巫师","magic","water"],"infernal_warlock":["地狱术士","magic","fire"],"jackalope":["鹿角兔","magic","nature"],"juggler":["杂耍者","ranged","physical"],"jungle_sprite":["丛林精灵","magic","nature"],"luna_empress":["月神之蝶","magic","nature"],"magician":["魔术师","magic","fire"],"magnetic_golem":["磁力魔像","smash","physical"],"manticore":["狮蝎兽","ranged","physical"],"marine_huntress":["海洋猎手","ranged","water"],"mimic":["宝箱怪","stab","physical"],"myconid":["蘑菇人","magic","nature"],"nom_nom":["咬咬鱼","stab","physical"],"novice_sorcerer":["新手巫师","magic","water"],"panda":["熊猫","smash","physical"],"polar_bear":["北极熊","smash","physical"],"porcupine":["豪猪","ranged","physical"],"pyre_hunter":["火焰猎手","ranged","fire"],"rabid_rabbit":["疯魔兔","slash","physical"],"rat":["杰瑞","stab","physical"],"red_panda":["小熊猫","slash","physical"],"salamander":["火蜥蜴","magic","fire"],"sea_snail":["蜗牛","smash","physical"],"shadow_archer":["暗影弓手","ranged","physical"],"siren":["海妖","magic","water"],"skunk":["臭鼬","slash","physical"],"slimy":["史莱姆","magic","water"],"snake":["蛇","stab","physical"],"soul_hunter":["灵魂猎手","ranged","physical"],"squawker":["鹦鹉","magic","nature"],"stalactite_golem":["钟乳石魔像","stab","physical"],"swampy":["沼泽虫","smash","physical"],"the_kraken":["克拉肯","ranged","physical"],"the_watcher":["观察者","ranged","physical"],"tidal_conjuror":["潮汐召唤师","magic","water"],"treant":["树人","magic","nature"],"trial_badger":["试炼獾","slash","physical"],"trial_beetle":["试炼甲虫","smash","physical"],"trial_chameleon":["试炼变色龙","ranged","physical"],"trial_dragonfly":["试炼蜻蜓","ranged","physical"],"trial_firefly":["试炼萤火虫","magic","fire"],"trial_hedgehog":["试炼刺猬","magic","nature"],"trial_jellyfish":["试炼水母","magic","water"],"trial_wasp":["试炼黄蜂","stab","physical"],"turtle":["忍者龟","smash","physical"],"vampire":["吸血鬼","stab","physical"],"veyes":["复眼","slash","physical"],"werewolf":["狼人","slash","physical"],"zombie":["僵尸","slash","physical"],"zombie_bear":["僵尸熊","stab","physical"]}
  const LOCATIONS = {"aqua_planet":["海洋星球",["sea_snail","crab","aquahorse","nom_nom","turtle","marine_huntress"]],"bear_with_it":["熊熊星球",["gummy_bear","panda","black_bear","grizzly_bear","polar_bear","red_panda"]],"chimerical_den":["奇幻洞穴",["rat","skunk","porcupine","slimy","frog","snake","swampy","alligator","sea_snail","crab","aquahorse","jungle_sprite","myconid","nom_nom","turtle","centaur_archer","gobo_stabby","gobo_slashy","gobo_smashy","gobo_shooty","gobo_boomy","eye","butterjerry","eyes","veyes","jackalope","dodocamel","manticore","griffin"]],"enchanted_fortress":["秘法要塞",["novice_sorcerer","ice_sorcerer","flame_sorcerer","panda","black_bear","magnetic_golem","abyssal_imp","elementalist","grizzly_bear","polar_bear","stalactite_golem","soul_hunter","enchanted_pawn","enchanted_knight","enchanted_bishop","enchanted_rook","enchanted_queen","enchanted_king"]],"gobo_planet":["哥布林星球",["gobo_stabby","gobo_slashy","gobo_smashy","gobo_shooty","gobo_boomy","gobo_chieftain"]],"golem_cave":["魔像洞穴",["magnetic_golem","stalactite_golem","granite_golem","crystal_colossus"]],"infernal_abyss":["地狱深渊",["abyssal_imp","soul_hunter","infernal_warlock","demonic_overlord"]],"jungle_planet":["丛林星球",["jungle_sprite","myconid","treant","centaur_archer","luna_empress"]],"pirate_cove":["海盗基地",["eye","eyes","veyes","zombie","magnetic_golem","abyssal_imp","vampire","stalactite_golem","soul_hunter","squawker","werewolf","granite_golem","infernal_warlock","anchor_shark","brine_marksman","tidal_conjuror","captain_fishhook","the_kraken"]],"planet_of_the_eyes":["眼球星球",["eye","eyes","veyes","the_watcher"]],"sinister_circus":["阴森马戏团",["gobo_stabby","gobo_slashy","gobo_smashy","gobo_shooty","gobo_boomy","novice_sorcerer","gummy_bear","ice_sorcerer","flame_sorcerer","panda","black_bear","grizzly_bear","polar_bear","zombie","vampire","rabid_rabbit","elementalist","werewolf","zombie_bear","acrobat","juggler","magician","deranged_jester"]],"smelly_planet":["臭臭星球",["fly","rat","skunk","porcupine","slimy"]],"sorcerers_tower":["巫师之塔",["novice_sorcerer","ice_sorcerer","flame_sorcerer","elementalist","chronofrost_sorcerer"]],"swamp_planet":["沼泽星球",["frog","snake","swampy","alligator","giant_shoebill"]],"twilight_zone":["暮光之地",["zombie","vampire","werewolf","dusk_revenant"]]}
  const Lab = (() => {
    const STYLES = ["slash", "stab", "smash", "ranged", "magic"]
    const STYLE_ZH = { slash: "斩击", stab: "刺击", smash: "钝击", ranged: "远程", magic: "魔法" }
    const POSES = ["idle", "windup", "strike", "hurt", "cast", "dead"]
    const POSE_ZH = { idle: "待机", windup: "蓄力", strike: "出手", hurt: "受击", cast: "施法", dead: "倒下" }
    const DEF = {
      loc: "golem_cave",
      tier: 0,
      monsters: ["granite_golem", "magnetic_golem", "stalactite_golem", "", ""],
      players: [
        { look: "default_slash", style: "slash", skills: ["cleave", "maim", "berserk", "fierce_aura"] },
        { look: "default_ranged", style: "ranged", skills: ["quick_shot", "rain_of_arrows", "flame_arrow", "speed_aura"] },
        { look: "default_magic", style: "magic", skills: ["fireball", "entangle", "toxic_pollen", "heal"] },
      ],
      gallery: "magnetic_golem",
    }
    const st = { ...structuredClone(DEF), ...GM_getValue("battle_fx_lab_v1", {}) }
    const save = () => GM_setValue("battle_fx_lab_v1", st)
    const lab = { p: [], m: [] }
    let root = null
    let autoTimer = 0
    const zh = k => abilityInfo("/abilities/" + k)?.name || k
    const pick = arr => arr[Math.floor(Math.random() * arr.length)]
    const alive = side => lab[side].map((u, i) => (u.hp > 0 ? i : -1)).filter(i => i >= 0)

    function unitP(pl, i) {
      const magicSkill = pl.skills.find(k => ABILITIES[k]?.[3] === "magic")
      return {
        name: `${i + 1}号 ${STYLE_ZH[pl.style]}`,
        hp: 1500, mp: 1000, maxHp: 1500, maxMp: 1000,
        style: pl.style,
        element: pl.style === "magic" ? ABILITIES[magicSkill]?.[4] || "fire" : "physical",
        lookId: pl.look,
        counters: {},
      }
    }
    function unitM(id) {
      const [name, style, element] = MONSTERS[id] || [id, "smash", "physical"]
      return { name, hrid: "/monsters/" + id, hp: 4000, mp: 1000, maxHp: 4000, maxMp: 1000, style, element, counters: {} }
    }
    function buildUnits() {
      lab.p = st.players.map(unitP)
      lab.m = st.monsters.filter(Boolean).map(unitM)
    }
    // a change of hp on one unit, in the shape the stage expects
    function change(side, i, d) {
      const u = lab[side][i]
      const before = u.hp
      u.hp = Math.max(0, Math.min(u.maxHp, u.hp + d))
      return { side, i, dHP: u.hp - before, hp: u.hp, maxHp: u.maxHp, died: before > 0 && u.hp <= 0, revived: before <= 0 && u.hp > 0 }
    }
    const hitAmount = (side, i) => (Math.random() < 0.1 ? 0 : -Math.round(lab[side][i].maxHp * (0.04 + Math.random() * 0.08)))

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
        targets = (ab?.target === "allEnemies" ? f : [pick(f)]).map(j => change(foe, j, hitAmount(foe, j)))
      } else if (ab.kind === "heal") {
        effect = "heal"
        const al = alive(side)
        const low = [...al].sort((a, b) => lab[side][a].hp / lab[side][a].maxHp - lab[side][b].hp / lab[side][b].maxHp)[0]
        const ids = ab.target === "allAllies" ? al : ab.target === "lowestHpAlly" ? [low] : [i]
        targets = ids.map(j => change(side, j, Math.round(lab[side][j].maxHp * 0.15)))
      } else if (ab.kind === "revive") {
        effect = "heal"
        const dead = lab[side].map((x, j) => (x.hp <= 0 ? j : -1)).filter(j => j >= 0)
        targets = dead.slice(0, 1).map(j => change(side, j, Math.round(lab[side][j].maxHp * 0.5)))
      } else effect = "buff"
      Stage.play([{ actor: { side, i }, ab, effect, style: ab?.style || u.style, element: ab?.kind === "damage" ? ab.element : u.element, targets }], "test")
      afterTurn()
    }
    // a cleared wave respawns, a wiped party gets back up
    let pending = 0
    function afterTurn() {
      if (pending) return
      if (!alive("m").length && lab.m.length)
        pending = setTimeout(() => {
          pending = 0
          lab.m = st.monsters.filter(Boolean).map(unitM)
          Stage.newBattle("test")
        }, 1600)
      else if (!alive("p").length)
        pending = setTimeout(() => {
          pending = 0
          lab.p.forEach((_, j) => Stage.play([{ actor: null, ab: null, effect: "regen", style: "", element: "heal", targets: [change("p", j, lab.p[j].maxHp)] }], "test"))
        }, 1600)
    }
    function autoTick() {
      const who = [...alive("p").map(i => ["p", i]), ...alive("m").map(i => ["m", i])]
      if (!who.length) return
      const [side, i] = pick(who)
      const skills = side === "p" ? st.players[i].skills.filter(Boolean) : []
      act(side, i, skills.length && Math.random() < 0.4 ? pick(skills) : null)
    }
    function setAuto(on) {
      clearInterval(autoTimer)
      autoTimer = on ? setInterval(autoTick, 750) : 0
      draw()
    }
    function reset() {
      clearTimeout(pending)
      pending = 0
      buildUnits()
      Stage.reload()
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
    const monsterOptions = () => {
      const here = LOCATIONS[st.loc]?.[1] || []
      const rest = Object.keys(MONSTERS).filter(id => !here.includes(id)).sort((a, b) => MONSTERS[a][0].localeCompare(MONSTERS[b][0], "zh"))
      return [["", "—"], ...[...here, ...rest].map(id => [id, MONSTERS[id][0]])]
    }
    const skillOptions = () => {
      const order = { damage: 0, heal: 1, revive: 1, buff: 2 }
      const keys = Object.keys(ABILITIES).sort((a, b) => (order[ABILITIES[a][1]] ?? 3) - (order[ABILITIES[b][1]] ?? 3) || ABILITIES[a][0].localeCompare(ABILITIES[b][0], "zh"))
      return [["", "—"], ...keys.map(k => [k, ABILITIES[k][0]])]
    }

    function draw() {
      if (!root) return
      root.replaceChildren()
      const r1 = row("战场")
      r1.append(
        select(Object.entries(LOCATIONS).map(([k, [n]]) => [k, n]), st.loc, v => {
          st.loc = v
          st.monsters = [...LOCATIONS[v][1].slice(0, 3), "", ""]
          save()
          draw()
          reset()
        }),
        select([0, 1, 2, 3, 4, 5].map(t => [t, "T" + t]), st.tier, v => {
          st.tier = +v
          save()
          Stage.setBackground()
        }),
      )
      for (let k = 0; k < 5; k++)
        r1.appendChild(
          select(monsterOptions(), st.monsters[k] || "", v => {
            st.monsters[k] = v
            save()
            reset()
          }),
        )

      const looks = Assets.list("p")
      st.players.forEach((pl, i) => {
        const r = row(`${i + 1}号`)
        r.append(
          select((looks.length ? looks : [pl.look]).map(id => [id, id.replace(/^default_/, "通用·")]), pl.look, v => ((pl.look = v), save(), reset())),
          select(STYLES.map(x => [x, STYLE_ZH[x]]), pl.style, v => ((pl.style = v), save(), reset())),
          ...[0, 1, 2, 3].map(k => select(skillOptions(), pl.skills[k] || "", v => ((pl.skills[k] = v), save(), draw()))),
          button("普攻", () => act("p", i, null)),
          ...pl.skills.filter(Boolean).map(k => button(zh(k), () => act("p", i, k), "skill")),
          button("移除", () => {
            if (st.players.length > 1) st.players.splice(i, 1)
            save()
            draw()
            reset()
          }),
        )
      })

      const r3 = row("操作")
      r3.append(
        button("+ 我方", () => {
          if (st.players.length < 5) st.players.push(structuredClone(DEF.players[st.players.length % 3]))
          save()
          draw()
          reset()
        }),
        button("怪物普攻", () => alive("m").length && act("m", pick(alive("m")), null)),
        button("怪物放技能", () => {
          const dmg = Object.keys(ABILITIES).filter(k => ABILITIES[k][1] === "damage")
          if (alive("m").length) act("m", pick(alive("m")), pick(dmg))
        }),
        button("全部击杀", () => {
          for (const side of ["m"]) alive(side).forEach(j => Stage.play([{ actor: null, ab: null, effect: "damage", style: "dot", element: "physical", targets: [change(side, j, -99999)] }], "test"))
          afterTurn()
        }),
        button("全员复活", () => {
          for (const side of ["p", "m"]) lab[side].forEach((u, j) => u.hp <= 0 && Stage.play([{ actor: null, ab: null, effect: "regen", style: "", element: "heal", targets: [change(side, j, u.maxHp)] }], "test"))
        }),
        button(autoTimer ? "停止自动战斗" : "自动战斗", () => setAuto(!autoTimer), autoTimer ? "on" : ""),
        button("重置", reset),
      )

      // gallery: every pose of one monster, with per-pose flips that apply right away
      const r4 = row("图鉴")
      const gal = el("div", "gal")
      r4.append(
        select(Object.keys(MONSTERS).sort((a, b) => MONSTERS[a][0].localeCompare(MONSTERS[b][0], "zh")).map(id => [id, MONSTERS[id][0]]), st.gallery, v => ((st.gallery = v), save(), draw())),
        button("复制翻转清单", () => {
          const t = Flips.text()
          GM_setClipboard(t)
          alert(t ? "已复制，发给 Claude 即可：\n" + t : "还没有勾选任何翻转")
        }),
      )
      root.appendChild(gal)
      for (const pose of POSES) {
        const fig = el("figure")
        const img = el("img")
        img.src = Assets.url(`m/${st.gallery}/${pose}.webp`)
        img.style.transform = Flips.has("m/" + st.gallery, pose) ? "scaleX(-1)" : ""
        const lab2 = el("label")
        const cb = el("input")
        cb.type = "checkbox"
        cb.checked = Flips.has("m/" + st.gallery, pose)
        cb.addEventListener("change", () => {
          Flips.toggle(st.gallery, pose, cb.checked)
          img.style.transform = cb.checked ? "scaleX(-1)" : ""
          Stage.refreshArt()
        })
        lab2.append(cb, ` ${POSE_ZH[pose]} 翻转`)
        fig.append(img, lab2)
        gal.appendChild(fig)
      }
    }

    // builds the controls in the tab panel and returns the element the stage hangs in
    function render(panel) {
      root = panel.querySelector(".bfx-lab")
      if (!root) {
        root = el("div", "bfx-lab")
        panel.prepend(root)
      }
      let slot = panel.querySelector(".bfx-lab-stage")
      if (!slot) {
        slot = el("div", "bfx-lab-stage")
        panel.appendChild(slot)
      }
      buildUnits()
      draw()
      return slot
    }
    const stop = () => setAuto(false)
    return { units: lab, render, stop, loc: () => st.loc, tier: () => st.tier, startAuto: () => setAuto(true) }
  })()

  // ---------- demo: plays a scripted sequence (stage works without a battle) ----------
  function demo() {
    if (!Stage.open()) return alert("先进入战斗页面（能看到“交战”标签）")
    Lab.startAuto()
  }

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
      toggle("enabled", "战斗动画“舞台”标签", () => Stage.ensureTab()),
      GM_registerMenuCommand(`角色形象：${cfg.lookMode === "outfit" ? "按服装" : "按装备"}（点击切换）`, () => {
        cfg.lookMode = cfg.lookMode === "outfit" ? "equip" : "outfit"
        saveCfg()
        if (Stage.modeOf() === "live") Stage.reload()
        menu()
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
      GM_registerMenuCommand(`动画大小：${cfg.scale}`, () => {
        const v = parseFloat(prompt("动画大小倍率（0.5 ~ 2）", cfg.scale))
        if (v >= 0.3 && v <= 3) {
          cfg.scale = v
          saveCfg()
          Stage.layout()
          menu()
        }
      }),
      GM_registerMenuCommand("打开动画测试（自动战斗）", demo),
      toggle("debug", "调试：控制台打印战斗消息"),
    ]
  }
  menu()
  Stage.start()
  setInterval(() => Live.ensure(), 1000)
  Assets.refresh()

  // ---------- websocket hook ----------
  // battle ticks drive the stage; character / profile / item / action messages feed looks and the location
  const WANTED = /^(new_battle|battle_updated|init_character_data|profile_shared|items_updated|actions_updated)$|party/
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
                else onCharacterMessage(obj)
              } catch (e) {
                if (cfg.debug) console.warn("[战斗动画]", e)
              }
            }, 0)
          }
        }
      }
    } catch {}
    return msg
  }
  Object.defineProperty(W.MessageEvent.prototype, "data", desc)

  W.__mwiBattleFx = { demo, units, cfg, Stage }
})()
