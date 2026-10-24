// Rasterizes game sprite symbols into 512x512 reference PNGs for Codex (runs on the Windows box, see render-refs.sh).
// usage: node render-refs.mjs <sprites_dir> <out_dir> <sheet/id>...    e.g. combat_monsters/gummy_bear items/frost_staff
// Each <symbol> becomes a standalone <svg> that KEEPS the symbol's own attributes: the game puts fill="none"
// on every symbol, and children that rely on inheriting it turn solid black when only the children are copied.
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"

const [spritesDir, outDir, ...want] = process.argv.slice(2)
const NS = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
const svgs = {}
const sheets = {}
for (const key of want) {
  const [sheet, id] = key.split("/")
  sheets[sheet] ??= fs.readFileSync(path.join(spritesDir, sheet + ".svg"), "utf8")
  const m = new RegExp(`<symbol([^>]*\\bid="${id}"[^>]*)>([\\s\\S]*?)</symbol>`).exec(sheets[sheet])
  if (!m) {
    console.log("missing", key)
    continue
  }
  const vb = (/viewBox="([^"]+)"/.exec(m[1]) || [, "0 0 100 100"])[1]
  const keep = m[1].replace(/\s(id|viewBox|xmlns(:\w+)?)="[^"]*"/g, "")
  svgs[key] = `<svg ${NS} viewBox="${vb}"${keep}>${m[2]}</svg>`
}

const page = `<!doctype html><body><script>
async function run(svgs){const N=512,c=document.createElement('canvas');c.width=c.height=N;const x=c.getContext('2d');const out={}
for(const [k,s] of Object.entries(svgs)){const im=new Image();im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s);await im.decode();x.clearRect(0,0,N,N);x.drawImage(im,0,0,N,N);out[k]=c.toDataURL('image/png')}
return JSON.stringify(out)}
</script></body>`
const srv = http.createServer((q, r) => (r.writeHead(200, { "content-type": "text/html" }), r.end(page))).listen(8796)
const prof = path.join(outDir, ".chrome-prof")
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--remote-debugging-port=9336", "--user-data-dir=" + prof, "about:blank"], { stdio: "ignore" })
const sleep = ms => new Promise(r => setTimeout(r, ms))
let list
for (let k = 0; k < 50; k++) {
  try {
    list = await (await fetch("http://127.0.0.1:9336/json/list")).json()
    if (list.find(t => t.type === "page")) break
  } catch {}
  await sleep(200)
}
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl)
await new Promise(r => (ws.onopen = r))
let id = 0
const pend = new Map()
ws.onmessage = e => {
  const m = JSON.parse(e.data)
  if (m.id && pend.has(m.id)) (pend.get(m.id)(m), pend.delete(m.id))
}
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
await send("Page.navigate", { url: "http://127.0.0.1:8796/" })
await sleep(1000)
const r = await send("Runtime.evaluate", { expression: `run(${JSON.stringify(svgs)})`, awaitPromise: true, returnByValue: true })
const out = JSON.parse(r.result.result.value)
for (const [k, url] of Object.entries(out)) {
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, k.replace("/", "__") + ".png"), Buffer.from(url.split(",")[1], "base64"))
}
console.log("rendered", Object.keys(out).length)
chrome.kill()
srv.close()
process.exit(0)
