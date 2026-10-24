// static server + headless Chrome via CDP; captures frames of the stage demo
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
const logs = []
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } else if (m.method === "Runtime.consoleAPICalled" || m.method === "Runtime.exceptionThrown") logs.push(JSON.stringify(m.params).slice(0, 400)) }
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
await send("Runtime.enable")
await send("Emulation.setDeviceMetricsOverride", { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false })
await send("Page.navigate", { url: "http://127.0.0.1:8799/mock.html" })
await sleep(1500)
await send("Runtime.evaluate", { expression: "start()" })
const t0 = Date.now()
let n = 0
while (Date.now() - t0 < (+process.env.DUR || 18000)) {
  const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 80 })
  fs.writeFileSync(path.join(frames, `f${String(n).padStart(4, "0")}_${Date.now() - t0}.jpg`), Buffer.from(r.result.data, "base64"))
  n++
  await sleep(40)
}
await send("Runtime.evaluate", { expression: "back()" })
await sleep(800)
{ const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 80 }); fs.writeFileSync(path.join(frames, "zz_back.jpg"), Buffer.from(r.result.data, "base64")) }
const st = await send("Runtime.evaluate", { expression: "JSON.stringify({tab: !!document.querySelector('.bfx-tab'), sel: [...document.querySelectorAll('.MuiTab-root')].map(b=>b.textContent.trim()+(b.classList.contains('Mui-selected')?'*':'')), gp0: getComputedStyle(document.getElementById('gp0')).display, panel: getComputedStyle(document.querySelector('.bfx-panel')).display, raf: 0})", returnByValue: true })
console.log(st.result.result.value)
fs.writeFileSync(path.join(dir, "console.txt"), logs.join("\n"))
console.log("frames", n, "logs", logs.length)
chrome.kill()
srv.close()
process.exit(0)
