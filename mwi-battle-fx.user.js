// ==UserScript==
// @name         MWI 战斗动画
// @namespace    mwi-battle-fx
// @version      0.4.1
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
  const DEFAULTS = { enabled: true, scale: 1, debug: false, stageH: 360, lookMode: "equip", assetBase: "" }
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
        const c = { side, i, dHP: 0, dMP: 0, hp: u.hp, maxHp: u.maxHp, acted: false, prevAbility: u.ability, died: false, revived: false }
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
        // any "...Counter" field that ticks up marks the unit that just acted (used when present)
        for (const key of Object.keys(e)) {
          if (!/counter/i.test(key) || typeof e[key] !== "number") continue
          if (u.counters[key] !== undefined && e[key] > u.counters[key]) c.acted = true
          u.counters[key] = e[key]
        }
        if ("abilityHrid" in e) u.ability = e.abilityHrid || null
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
    const casters = changes.filter(c => c.dMP < 0 && c.prevAbility)
    const hurt = changes.filter(c => c.dHP < 0)
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

    // auto attacks (and damage whose source is unclear, e.g. DoT ticks)
    const bySrc = new Map()
    for (const t of hurt) {
      if (used.has(t)) continue
      const foes = units[other(t.side)]
      const acted = changes.filter(c => c.side === other(t.side) && c.acted)
      let src = acted.length === 1 ? acted[0].i : -1
      if (src < 0) {
        const alive = foes.map((u, i) => (u.hp > 0 ? i : -1)).filter(i => i >= 0)
        if (alive.length === 1) src = alive[0]
      }
      if (src < 0) {
        actions.push({ actor: null, ab: null, effect: "damage", style: "dot", element: "physical", targets: [t] })
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
      if (loading || (!force && manifest && Date.now() - fetchedAt < 3 * 3600e3)) return
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
    const url = path => base() + "/assets/" + path
    return { refresh, has, url, onChange: f => listeners.push(f) }
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

  // ---------- side-view stage: Slay-the-Spire style, heroes on the left, monsters on the right ----------
  const Stage = (() => {
    const SVGNS = "http://www.w3.org/2000/svg"
    const actors = { p: [], m: [] }
    const fx = [] // canvas effects {t0, dur, draw(ctx, p, now), done}
    let stageEl, canvas, ctx, banner, waitEl, bgEl
    let bgKey = ""
    let tabBtn, panel, indicator
    let active = false
    let restore = [] // [element, prop, value] to undo when leaving our tab
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
.bfx-stage{position:relative;width:100%;min-height:200px;overflow:hidden;resize:vertical;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:
 radial-gradient(ellipse 60% 30% at 50% 100%,rgba(120,140,255,.18),transparent),
 linear-gradient(180deg,#141b38 0%,#22305e 48%,#3a3a62 64%,#2b2742 65%,#1e1b30 100%)}
.bfx-bg{position:absolute;inset:0;background:center 85%/cover no-repeat;opacity:0;transition:opacity .6s}
.bfx-bg:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.15),transparent 30%,transparent 70%,rgba(0,0,0,.35))}
/* frames are the 512px pose cell plus a 96px margin all round: scale up so the cell fills the actor box */
.bfx-sprite img{position:absolute;left:-18.75%;top:-18.75%;width:137.5%;height:137.5%;display:block}
.bfx-art .bfx-shadow{bottom:2%;height:10%;width:56%}
.bfx-hpt{position:absolute;left:0;right:0;top:-1px;font-size:9px;line-height:5px;text-align:center;text-shadow:0 0 2px #000,0 0 2px #000}
.bfx-stage>*{pointer-events:none}
.bfx-stage canvas{position:absolute;inset:0;width:100%;height:100%;z-index:5000}
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
.bfx-wait{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:.5}`
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
        n.nodeValue = labeled ? "" : zhUI() ? "舞台" : "Stage"
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
      const set = (el, prop, val) => {
        restore.push([el, prop, el.style[prop]])
        el.style[prop] = val
      }
      for (const c of panel.parentElement.children) if (c !== panel) set(c, "display", "none")
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
      mount()
    }
    function deactivate() {
      active = false
      for (const [el, prop, val] of restore.reverse()) {
        if (prop === "class") el.classList.add(val)
        else el.style[prop] = val
      }
      restore = []
      tabBtn?.classList.remove("Mui-selected")
      tabBtn?.setAttribute("aria-selected", "false")
      if (panel) panel.style.display = "none"
      // nothing runs while hidden: drop pending effects and the frame loop
      fx.length = 0
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }
    function open() {
      ensureTab()
      if (!tabBtn) return false
      activate()
      return true
    }
    function mount() {
      if (!stageEl || !panel.contains(stageEl)) {
        panel.innerHTML = '<div class="bfx-stage"><div class="bfx-bg"></div><canvas></canvas><div class="bfx-banner"></div><div class="bfx-wait">等待战斗…</div></div>'
        stageEl = panel.querySelector(".bfx-stage")
        bgEl = stageEl.querySelector(".bfx-bg")
        stageEl.style.height = cfg.stageH + "px"
        canvas = stageEl.querySelector("canvas")
        ctx = canvas.getContext("2d")
        banner = stageEl.querySelector(".bfx-banner")
        waitEl = stageEl.querySelector(".bfx-wait")
        actors.p = []
        actors.m = []
        playersKey = ""
        let hTimer = 0
        new ResizeObserver(() => {
          layout()
          clearTimeout(hTimer)
          hTimer = setTimeout(() => {
            const h = Math.round(stageEl.getBoundingClientRect().height)
            if (active && h > 0 && h !== cfg.stageH) {
              cfg.stageH = h
              saveCfg()
            }
          }, 400)
        }).observe(stageEl)
      }
      units.p.forEach((u, i) => Looks.assign(u, i))
      rebuild(true)
      setBackground()
      for (const side of ["p", "m"]) actors[side].forEach(a => (setBars(a), units[side][a.i]?.hp <= 0 && die(a, true)))
      Assets.refresh()
    }
    // location art, the elite / nightmare variant for higher tiers, plus a slight per-tier grade
    function setBackground() {
      if (!bgEl) return
      const loc = stageLocation()
      const t = where.tier || 0
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
    const visible = () => cfg.enabled && active && !!stageEl && !document.hidden

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
      const u = units[side][i]
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
      const u = units[side][i]
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
      a.img.src = frameUrl(a, pose)
      if (ms > 0) a.poseTimer = setTimeout(() => (a.img.src = frameUrl(a, a.dead ? "dead" : "idle")), ms)
    }
    function refreshSprite(a) {
      const art = artFor(a.side, a.i)
      if (art && art !== a.art) {
        a.art = art
        a.img = document.createElement("img")
        a.img.decoding = "async"
        a.img.src = frameUrl(a, a.dead ? "dead" : "idle")
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
      const u = units[side][i] || {}
      const el = document.createElement("div")
      el.className = "bfx-actor bfx-" + side
      el.innerHTML =
        '<div class="bfx-shadow"></div><div class="bfx-move"><div class="bfx-pose"><div class="bfx-hit"><div class="bfx-idle"><div class="bfx-sprite"></div></div></div></div></div>' +
        '<div class="bfx-hud"><div class="bfx-name"></div><div class="bfx-bar"><i style="background:linear-gradient(#ff7a7a,#d93b3b)"></i><span class="bfx-hpt"></span></div><div class="bfx-bar"><i style="background:linear-gradient(#7ab8ff,#2f6fd9)"></i></div></div>'
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
      stageEl.appendChild(el)
      return a
    }
    function rebuild(all) {
      const key = units.p.map(u => u.name).join("|")
      if (all || key !== playersKey) {
        actors.p.forEach(a => a.el.remove())
        actors.p = units.p.map((_, i) => makeActor("p", i))
        playersKey = key
      }
      actors.m.forEach(a => a.el.remove())
      actors.m = units.m.map((_, i) => makeActor("m", i))
      waitEl.style.display = units.p.length || units.m.length ? "none" : ""
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
      const u = units[a.side][a.i]
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
            const u = units[side][a.i]
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
    function circleFx(a, color, dur) {
      const r = a.s * 0.55
      addFx(dur, (c, p, t) => {
        c.globalCompositeOperation = "lighter"
        c.globalAlpha = p < 0.15 ? p / 0.15 : 1 - Math.max(0, p - 0.6) / 0.4
        c.translate(a.x, a.y)
        c.scale(1, 0.32)
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
    function projectile(from, to, { kind, color, dur, arc = 0, size = 1 }, onHit) {
      const trail = []
      const f = addFx(dur, (c, p) => {
        const e = kind === "meteor" ? p * p : p
        const x = from.x + (to.x - from.x) * e
        const y = from.y + (to.y - from.y) * e - arc * 4 * e * (1 - e)
        const ang = Math.atan2(to.y - from.y - arc * 4 * (1 - 2 * e), to.x - from.x)
        c.globalCompositeOperation = "lighter"
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
    function shake(amp = 5, dur = 260) {
      stageEl.animate(
        [0, 1, 2, 3, 4, 5].map(k => ({ transform: k === 5 ? "none" : `translate(${(Math.random() - 0.5) * amp * 2}px,${(Math.random() - 0.5) * amp}px)` })),
        { duration: dur },
      )
    }

    // ----- dom bits -----
    function number(a, text, kind) {
      const n = document.createElement("div")
      n.className = "bfx-num"
      n.textContent = text
      n.style.color = kind === "heal" ? "#7dffa5" : a.side === "p" ? "#ffb0a8" : "#fff"
      n.style.fontSize = 16 * cfg.scale * (kind === "big" ? 1.25 : 1) + "px"
      stageEl.appendChild(n)
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
      const u = units[a.side][a.i]
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
    function castPose(a, color, dur) {
      setPose(a, "cast", dur + 260)
      a.pose.animate(
        [
          { transform: "translateY(0)", filter: "none" },
          { transform: `translateY(-10%) rotate(${-a.dir * 4}deg)`, filter: `brightness(1.3) drop-shadow(0 0 6px ${color})`, offset: 0.6 },
          { transform: "translateY(0)", filter: "none" },
        ],
        { duration: dur + 200, easing: "ease-in-out" },
      )
      circleFx(a, color, dur + 300)
      burst(a.x, a.y - a.s * 0.2, { n: 10, color, speed: 60, gravity: -120, life: dur + 200, size: 2.5, spread: 1.6 })
    }

    // ----- reactions -----
    function impact(a, t, style, element, big) {
      const color = ELEMENT_COLOR[element] || ELEMENT_COLOR.physical
      const m = mid(a)
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
      else burst(m.x, m.y, { n: big ? 22 : 14, color, speed: big ? 200 : 150, life: 480 })
      if (style === "smash") {
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
      const m = mid(a)
      if (!quiet) burst(m.x, m.y, { n: 18, color: "#ddd", speed: 90, gravity: -80, life: 800, size: 3 })
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
      if (a.art) a.img.src = frameUrl(a, "idle")
      if (!quiet) {
        pillarFx(a.x, a.y, a.s * 0.9, a.s * 2.2, "#fff6c0", 900)
        burst(a.x, a.y - a.s * 0.3, { n: 18, color: "#fff6c0", speed: 80, gravity: -140, life: 900, size: 2.5 })
      }
    }

    // ----- actions -----
    function play(actions) {
      if (!visible()) return
      if (actors.p.length !== units.p.length || actors.m.length !== units.m.length) rebuild()
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
        for (const { t, a } of tg) impact(a, t, "dot", act.element)
        return
      }
      refreshSprite(src)
      const quick = src.busyUntil > T || src.dead
      const ab = act.ab
      if (ab) showBanner(src, ab)
      let dur
      if (act.effect === "damage") {
        const aoe = ab?.target === "allEnemies" || tg.length > 1
        if (act.style === "magic") dur = magic(src, tg, act.element, aoe, quick)
        else if (act.style === "ranged") dur = ranged(src, tg, act.element, aoe, quick)
        else dur = melee(src, tg, act.style, act.element, aoe, quick, !!ab)
      } else if (act.effect === "heal") dur = heal(src, tg, quick)
      else dur = buff(src, ab, quick)
      src.busyUntil = T + dur
    }

    function magic(src, tg, element, aoe, quick) {
      const color = ELEMENT_COLOR[element] || ELEMENT_COLOR.physical
      const castT = quick ? 120 : 360
      castPose(src, color, castT)
      later(castT, () => {
        if (!aoe) {
          for (const { t, a } of tg) projectile(mid(src), mid(a), { kind: "orb", color, dur: 380, arc: Math.min(40, SH * 0.12) }, () => impact(a, t, "magic", element, true))
          return
        }
        tg.forEach(({ t, a }, n) => {
          const m = mid(a)
          const d = n * 90
          if (element === "fire") {
            later(d, () => projectile({ x: m.x - a.dir * a.s * 0.9, y: -20 }, m, { kind: "meteor", color, dur: 320, size: 1.3 }, () => impact(a, t, "magic", element, true)))
          } else if (element === "water") {
            spikesFx(a, color, d)
            later(d + 120, () => impact(a, t, "magic", element))
          } else if (element === "nature") {
            burst(m.x, m.y, { n: 26, color, speed: 50, gravity: -30, life: 900, size: 4, delay: d })
            later(d + 200, () => impact(a, t, "magic", element))
          } else {
            later(d, () => projectile(mid(src), m, { kind: "orb", color, dur: 360, arc: 30 }, () => impact(a, t, "magic", element)))
          }
        })
      })
      return castT + 380 + tg.length * 90
    }

    function ranged(src, tg, element, aoe, quick) {
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
          if (aoe) {
            for (let k = 0; k < 3; k++) {
              const from = { x: m.x - a.dir * (20 + k * 14), y: -10 - k * 25 }
              const to = { x: m.x + (k - 1) * a.s * 0.25, y: a.y - a.s * 0.15 }
              later(n * 70 + k * 60, () => projectile(from, to, { kind: "arrow", color, dur: 260 }, () => (k === 0 ? impact(a, t, "ranged", element) : burst(to.x, to.y, { n: 5, color, life: 300, speed: 80 }))))
            }
          } else {
            later(n * 70, () => projectile(mid(src), m, { kind: "arrow", color, dur: 300, arc: Math.min(30, SW * 0.04) }, () => impact(a, t, "ranged", element)))
          }
        })
      })
      return drawT + 300 + tg.length * 70
    }

    // melee: run up to the target (or the middle of the group for AoE), strike, run back
    function melee(src, tg, style, element, aoe, quick, isSkill) {
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
          for (const { t, a } of tg) {
            const m = mid(a)
            if (style === "stab") thrustFx(m.x, m.y, src.dir, color, a.s * 0.6)
            else if (style === "slash" && !aoe) slashFx(m.x, m.y, a.s * 0.5, src.dir, isSkill ? color : "#e8f0ff")
            impact(a, t, style, element, isSkill)
          }
          if (aoe && style === "slash") slashFx(cx, cy - lead.s * 0.5, lead.s * 1.2, src.dir, color, 1.1)
          if (style === "smash") shake(isSkill ? 8 : 5)
        })
      })
      return run + 320 + 250
    }

    function heal(src, tg, quick) {
      const color = ELEMENT_COLOR.heal
      const castT = quick ? 100 : 300
      castPose(src, color, castT)
      later(castT, () => {
        const list = tg.length ? tg : [{ a: src, t: null }]
        list.forEach(({ t, a }, n) => {
          pillarFx(a.x, a.y, a.s * 0.8, a.s * 1.6, color, 700, n * 80)
          burst(a.x, a.y - a.s * 0.3, { n: 12, color, speed: 50, gravity: -160, life: 900, size: 3, shape: "plus", delay: n * 80 })
          if (t) {
            later(n * 80 + 150, () => {
              if (t.revived) revive(a)
              number(a, "+" + fmt(t.dHP), "heal")
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
      castPose(src, color, castT)
      const allies = ab?.target === "allAllies" ? actors[src.side].filter(a => !a.dead) : [src]
      later(castT, () =>
        allies.forEach((a, n) => {
          ringFx(a.x, a.y, a.s * 0.2, a.s * 0.75, color, 600, 0.3, 3, n * 60)
          pillarFx(a.x, a.y, a.s * 0.7, a.s * 1.4, color, 600, n * 60)
          burst(a.x, a.y - a.s * 0.2, { n: 10, color, speed: 40, gravity: -150, life: 800, size: 2.5, delay: n * 60 })
        }),
      )
      return castT + 500
    }

    function newBattle() {
      if (!visible()) return
      setBackground()
      const keepPlayers = units.p.map(u => u.name).join("|") === playersKey
      rebuild(false)
      if (keepPlayers) actors.p.forEach(a => units.p[a.i]?.hp > 0 && revive(a, true))
      // monsters walk in from the right
      actors.m.forEach((a, n) =>
        a.move.animate([{ transform: `translateX(${SW * 0.35}px)`, opacity: 0 }, { transform: "translateX(0)", opacity: 1 }], {
          duration: 600,
          delay: n * 90,
          fill: "backwards",
          easing: "ease-out",
        }),
      )
      for (const side of ["p", "m"]) actors[side].forEach(a => (setBars(a), units[side][a.i]?.hp <= 0 && die(a, true)))
    }

    function start() {
      setInterval(ensureTab, 1000)
      Assets.onChange(() => {
        if (!active) return
        units.p.forEach((u, i) => Looks.assign(u, i))
        for (const side of ["p", "m"]) actors[side].forEach(refreshSprite)
        bgKey = ""
        setBackground()
      })
    }

    return { play, newBattle, layout, open, start, ensureTab, actors, setBackground }
  })()

  // ---------- demo: plays a scripted sequence (stage works without a battle) ----------
  function demo() {
    if (!Stage.open()) return alert("先进入战斗页面（能看到“交战”标签）再演示")
    if (!units.p.length || !units.m.length) {
      const P = (name, style, element, hp = 1200) => ({ name, hrid: null, hp, mp: 600, maxHp: 1200, maxMp: 800, ability: null, style, element, counters: {} })
      units.p = [P("战士", "slash", "physical"), P("弓手", "ranged", "physical"), P("法师", "magic", "fire")]
      units.m = [
        { ...P("花岗岩魔像", "smash", "physical", 3000), hrid: "/monsters/granite_golem", maxHp: 3000 },
        { ...P("磁力魔像", "smash", "physical", 3000), hrid: "/monsters/magnetic_golem", maxHp: 3000 },
        { ...P("钟乳石魔像", "stab", "physical", 3000), hrid: "/monsters/stalactite_golem", maxHp: 3000 },
      ]
      if (!where.zone) where.zone = "golem_cave"
      Stage.newBattle()
    }
    const np = units.p.length
    const nm = units.m.length
    const T = (side, i, dHP, extra = {}) => {
      const u = units[side][i % (side === "p" ? np : nm)]
      return { side, i: i % (side === "p" ? np : nm), dHP, hp: Math.max(0, u.hp + dHP), maxHp: u.maxHp, died: false, revived: false, ...extra }
    }
    const A = (side, i, abKey, targets, style, element) => {
      const ab = abKey ? abilityInfo("/abilities/" + abKey) : null
      const effect = ab ? (ab.kind === "damage" ? "damage" : ab.kind === "heal" ? "heal" : "buff") : "damage"
      return { actor: { side, i: i % (side === "p" ? np : nm) }, ab, effect, style: style || ab?.style, element: element || ab?.element || "physical", targets }
    }
    const allM = dmg => units.m.map((_, i) => T("m", i, dmg))
    const allP = dmg => units.p.map((_, i) => T("p", i, dmg))
    const steps = [
      [A("p", 0, null, [T("m", 0, -180)], "slash", "physical")],
      [A("m", 1, null, [T("p", 0, -120)], "smash", "physical")],
      [A("p", 1, null, [T("m", 1, -150)], "ranged", "physical")],
      [A("p", 2, "fireball", [T("m", 0, -420)])],
      [A("m", 2, null, [T("p", 2, -90)], "stab", "physical")],
      [A("p", 2, "firestorm", allM(-300))],
      [A("p", 1, "rain_of_arrows", allM(-220))],
      [A("p", 0, "cleave", allM(-260))],
      [A("p", 2, "frost_surge", allM(-280))],
      [A("p", 2, "toxic_pollen", allM(-200))],
      [A("p", 0, "stunning_blow", [T("m", 1, -500)])],
      [A("p", 1, "flame_arrow", [T("m", 2, -350)])],
      [A("p", 2, "rejuvenate", allP(150))],
      [A("p", 0, "berserk", [])],
      [A("p", 0, "impale", [T("m", 0, -999, { died: true, hp: 0 })])],
    ]
    steps.forEach((acts, n) =>
      setTimeout(() => Stage.play(acts), n * 1300),
    )
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
        units.p.forEach((u, i) => Looks.assign(u, i))
        Stage.newBattle()
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
      GM_registerMenuCommand("演示一遍", demo),
      toggle("debug", "调试：控制台打印战斗消息"),
    ]
  }
  menu()
  Stage.start()
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
