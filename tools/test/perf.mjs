// static server + headless Chrome via CDP; measures the page's main-thread cost in the phases the mock sets up
// (mock page: start() sets up, PHASES = [names], phase(i) switches). Prints one line per phase.
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"))
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" }
const srv = http.createServer((q, r) => {
  const f = path.join(dir, decodeURIComponent(q.url.split("?")[0]))
  fs.readFile(f, (e, b) => (e ? (r.writeHead(404), r.end()) : (r.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }), r.end(b))))
}).listen(8799)
const frames = path.join(dir, "frames")
fs.rmSync(frames, { recursive: true, force: true })
fs.mkdirSync(frames)
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--remote-debugging-port=9333", "--window-size=1100,900", "--hide-scrollbars", "--user-data-dir=" + path.join(dir, "prof"), "about:blank"], { stdio: "ignore" })
const sleep = ms => new Promise(r => setTimeout(r, ms))
let list
for (let k = 0; k < 50; k++) { try { list = await (await fetch("http://127.0.0.1:9333/json/list")).json(); if (list.find(t => t.type === "page")) break } catch {} await sleep(200) }
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl)
await new Promise(r => (ws.onopen = r))
let id = 0
const pend = new Map()
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } }
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result.result.value
await send("Runtime.enable")
await send("Performance.enable")
await send("Emulation.setDeviceMetricsOverride", { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false })
await send("Page.navigate", { url: "http://127.0.0.1:8799/mock.html" })
await sleep(1500)
await ev("start()")
const metrics = async () => Object.fromEntries((await send("Performance.getMetrics")).result.metrics.map(m => [m.name, m.value]))
const names = await ev("PHASES")
const SEC = 5
for (let i = 0; i < names.length; i++) {
  await ev(`phase(${i})`)
  await sleep(2000)
  await ev("window.__f=[];(function t(n){__f.push(n);t.perf=1;if(__f.length<100000)requestAnimationFrame(t)})(performance.now());0")
  const a = await metrics()
  await sleep(SEC * 1000)
  const b = await metrics()
  await send("HeapProfiler.collectGarbage")
  const dom = await ev("document.getElementsByTagName('*').length")
  const f = await ev("(()=>{const d=__f.slice(1).map((v,i)=>v-__f[i]);__f.length=1e9;return [d.length, Math.max(...d)]})()")
  const d = k => b[k] - a[k]
  console.log(`${names[i].padEnd(28)} script ${(d("ScriptDuration") * 1000 / SEC).toFixed(1)}ms/s  layout ${(d("LayoutDuration") * 1000 / SEC).toFixed(1)}ms/s (${(d("LayoutCount") / SEC).toFixed(0)}/s)  style ${(d("RecalcStyleDuration") * 1000 / SEC).toFixed(1)}ms/s (${(d("RecalcStyleCount") / SEC).toFixed(0)}/s)  task ${(d("TaskDuration") * 1000 / SEC).toFixed(1)}ms/s  fps ${(f[0] / SEC).toFixed(0)} worst ${f[1].toFixed(0)}ms  dom ${dom}`)
}
chrome.kill()
srv.close()
process.exit(0)
