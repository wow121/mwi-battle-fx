// static server + headless Chrome via CDP: one full-page screenshot per page.
// usage: node shot.mjs <out_dir> <url-path>... (each path relative to this folder, hash allowed)
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"))
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json", ".webp": "image/webp" }
const srv = http.createServer((q, r) => {
  const f = path.join(dir, decodeURIComponent(q.url.split("?")[0]))
  fs.readFile(f, (e, b) => (e ? (r.writeHead(404), r.end()) : (r.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }), r.end(b))))
}).listen(8799)
const [out, ...pages] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--remote-debugging-port=9334", "--hide-scrollbars", "--user-data-dir=" + path.join(dir, "prof2"), "about:blank"], { stdio: "ignore" })
const sleep = ms => new Promise(r => setTimeout(r, ms))
let list
for (let k = 0; k < 50; k++) { try { list = await (await fetch("http://127.0.0.1:9334/json/list")).json(); if (list.find(t => t.type === "page")) break } catch {} await sleep(200) }
const ws = new WebSocket(list.find(t => t.type === "page").webSocketDebuggerUrl)
await new Promise(r => (ws.onopen = r))
let id = 0
const pend = new Map()
const logs = []
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } else if (m.method === "Runtime.consoleAPICalled" || m.method === "Runtime.exceptionThrown") logs.push(JSON.stringify(m.params).slice(0, 400)) }
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
await send("Runtime.enable")
let n = 0
for (const p of pages) {
  await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false })
  await send("Page.navigate", { url: "http://127.0.0.1:8799/" + p.replace(/^([^#?]*)/, `$1?n=${n}`) })
  await sleep(200)
  for (let k = 0; k < 150; k++) { const r = await send("Runtime.evaluate", { expression: "document.title", returnByValue: true }); if (r.result?.result?.value === "ready") break; await sleep(100) }
  const h = (await send("Runtime.evaluate", { expression: "document.body.scrollHeight", returnByValue: true })).result.result.value
  await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: Math.min(8000, h), deviceScaleFactor: 1, mobile: false })
  await sleep(300)
  const r = await send("Page.captureScreenshot", { format: "png" })
  fs.writeFileSync(path.join(out, `shot${String(n++).padStart(2, "0")}.png`), Buffer.from(r.result.data, "base64"))
}
fs.writeFileSync(path.join(out, "console.txt"), logs.join("\n"))
chrome.kill()
srv.close()
process.exit(0)
