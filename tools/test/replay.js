const src = require("fs").readFileSync(process.argv[2], "utf8")
const cut = (a, b) => src.slice(src.indexOf(a), src.indexOf(b))
const code = cut("  const ABILITIES = {", "  // ---------- helpers ----------")
const out = []
const W = { localStorage: { getItem: () => "zh" } }, document = { documentElement: { lang: "zh" }, hidden: false }
const cfg = { enabled: true, debug: false }
const Looks = { assign() {} }, Stage = { newBattle() {}, play: a => out.push(a) }
eval(code + "; globalThis.T = { units, onBattleUpdated }")
const P = (hp, mp) => ({ name: "p", currentHitpoints: hp, currentManapoints: mp, combatDetails: { maxHitpoints: 1700, combatStats: { combatStyleHrids: ["/combat_styles/magic"], damageType: "/damage_types/nature" } } })
const U = T.units, onUpd = T.onBattleUpdated
U.p = [P(1537, 692), P(1716, 649), P(1397, 546)].map(u => ({ ...u, hp: u.currentHitpoints, mp: u.currentManapoints, maxHp: 1700, style: "magic", element: "nature", ability: null, counters: {} }))
U.m = [{ name: "boss", hp: 8452, mp: 15900, maxHp: 15900, style: "stab", element: "physical", ability: null, counters: {} }]
const show = acts => acts.map(x => (x.actor ? x.actor.side + x.actor.i + (x.ab ? "[" + x.ab.key + "]" : "[auto]") : "-") + ":" + x.style + "->" + x.targets.map(t => t.side + t.i + "(" + t.dHP + ")").join(",")).join("  |  ")
const msgs = require("fs").readFileSync(process.argv[3], "utf8").trim().split("\n")
for (const [k, line] of msgs.entries()) {
  const [label, json] = line.split("\t")
  out.length = 0
  onUpd(JSON.parse(json))
  console.log(String(k).padStart(2), label.padEnd(28), out.length ? show(out[0]) : "(nothing)")
}
