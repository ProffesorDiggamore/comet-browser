// ───────────────────────────────────────────────────────────────────
//  spotify.js — the Spotify desktop app, driven over AppleScript.  No
//  Web API, no account: osascript talks to the local app.  It never
//  launches Spotify just to look: `pgrep` first, AppleScript only when
//  the app is already running.  Polls only while a window subscribes
//  (Home widget = fast, sidebar player = slow), backs off when Spotify
//  is closed, and pushes changes to the subscribed windows.
//  States: playing | paused | stopped | notRunning | notInstalled |
//  denied (Automation permission, -1743) | error.
//  COMET_SPOTIFY_MOCK=1 → no osascript at all, a simulated player
//  (COMET_SPOTIFY_MOCK_STATE=notRunning|denied|notInstalled|stopped|paused).
// ───────────────────────────────────────────────────────────────────
const { ipcMain, shell, nativeImage } = require("electron")
const { execFile } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const MOCK = process.env.COMET_SPOTIFY_MOCK === "1"
const APP_ID = "com.spotify.client"
const SETTINGS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"
const SEP = "\u001f"

// ── helpers ───────────────────────────────────────────────────────
function run (file, args, timeout = 4000) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout }, (err, stdout, stderr) => resolve({ err, out: String(stdout ?? "").trim(), errText: String(stderr ?? err?.message ?? "") }))
  })
}
// an AppleScript string literal: quotes and backslashes escaped, control characters dropped
const asStr = (s) => `"${String(s).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const num = (s) => { const n = Number(String(s ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0 }

let installedAt = 0
let installed = false
async function isInstalled () {
  if (Date.now() - installedAt < 60_000) return installed
  installedAt = Date.now()
  installed = ["/Applications/Spotify.app", path.join(os.homedir(), "Applications/Spotify.app")].some((p) => fs.existsSync(p))
  if (!installed) { const r = await run("/usr/bin/mdfind", [`kMDItemCFBundleIdentifier == "${APP_ID}"`], 3000); installed = !!r.out }
  return installed
}
const isRunning = async () => !(await run("/usr/bin/pgrep", ["-x", "Spotify"], 2000)).err

// AppleScript, only ever sent to a Spotify that is already running
async function osa (body) {
  const r = await run("/usr/bin/osascript", ["-e", `tell application id "${APP_ID}"\n${body}\nend tell`])
  if (!r.err) return { ok: true, out: r.out }
  const t = r.errText
  if (/-1743|not authori[sz]ed/i.test(t)) return { ok: false, status: "denied" }
  if (/-600|isn.t running/i.test(t)) return { ok: false, status: "notRunning" }
  return { ok: false, status: "error", text: t.split("\n")[0].slice(0, 200) }
}

const READ = `set ps to player state as string
if ps is "stopped" then return "stopped"
set t to current track
set s to (character id 31)
return ps & s & (name of t) & s & (artist of t) & s & (album of t) & s & (artwork url of t) & s & ((duration of t) as string) & s & (id of t) & s & (spotify url of t) & s & ((player position) as string) & s & ((sound volume) as string) & s & (shuffling as string) & s & (repeating as string)`

function blank (status, extra) {
  return { status, track: null, position: 0, at: Date.now(), volume: 0, shuffle: false, repeat: false, mock: MOCK, ...extra }
}

async function readReal () {
  if (!(await isInstalled())) return blank("notInstalled")
  if (!(await isRunning())) return blank("notRunning")
  const r = await osa(READ)
  if (!r.ok) return blank(r.status, r.text ? { text: r.text } : {})
  if (r.out === "stopped") return blank("stopped")
  const f = r.out.split(SEP)
  if (f.length < 12) return blank("stopped")
  const dur = num(f[5])
  return {
    status: f[0] === "playing" ? "playing" : "paused",
    track: { title: f[1], artist: f[2], album: f[3], art: f[4], duration: dur > 10_000 ? dur / 1000 : dur, uri: f[6], url: f[7] },
    position: num(f[8]), at: Date.now(), volume: Math.round(num(f[9])),
    shuffle: f[10] === "true", repeat: f[11] === "true", mock: false
  }
}

// ── mock player (tests; never touches the real app) ───────────────
const MOCK_TRACKS = [
  { title: "Golden Hour Drive", artist: "The Midnight Arcade", album: "Neon Coastline", duration: 214, colors: [[255, 149, 64], [214, 48, 120]] },
  { title: "Paper Planes in June", artist: "Lumen & Vale", album: "Weather Systems", duration: 187, colors: [[64, 200, 224], [36, 84, 196]] },
  { title: "Slow Motion City", artist: "Ari Kestrel", album: "Afterlight", duration: 241, colors: [[150, 110, 255], [40, 30, 110]] }
]
const mockArt = new Map()
function artFor (i) {
  if (mockArt.has(i)) return mockArt.get(i)
  const [a, b] = MOCK_TRACKS[i].colors
  const N = 160
  const buf = Buffer.alloc(N * N * 4)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const t = (x + y) / (2 * N)
      const d = Math.hypot(x - N * 0.62, y - N * 0.38) / N
      const glow = Math.max(0, 0.42 - d) * 1.6
      const o = (y * N + x) * 4
      for (let c = 0; c < 3; c++) {
        const v = a[c] * (1 - t) + b[c] * t + glow * 255
        buf[o + (2 - c)] = clamp(Math.round(v), 0, 255)   // BGRA
      }
      buf[o + 3] = 255
    }
  }
  const url = nativeImage.createFromBitmap(buf, { width: N, height: N }).toDataURL()
  mockArt.set(i, url)
  return url
}
const mock = {
  status: ({ notRunning: "notRunning", denied: "denied", notInstalled: "notInstalled", stopped: "stopped", paused: "paused" })[process.env.COMET_SPOTIFY_MOCK_STATE] ?? "playing",
  i: 0, pos: 37, at: Date.now(), volume: 64, shuffle: false, repeat: false, log: []
}
function mockPos () { return mock.status === "playing" ? mock.pos + (Date.now() - mock.at) / 1000 : mock.pos }
function mockSettle () {
  const p = mockPos()
  const d = MOCK_TRACKS[mock.i].duration
  if (p >= d) { mock.i = (mock.i + 1) % MOCK_TRACKS.length; mock.pos = 0 } else mock.pos = p
  mock.at = Date.now()
}
function readMock () {
  if (mock.status !== "playing" && mock.status !== "paused") return blank(mock.status)
  mockSettle()
  const t = MOCK_TRACKS[mock.i]
  return {
    status: mock.status, position: mock.pos, at: mock.at, volume: mock.volume, shuffle: mock.shuffle, repeat: mock.repeat, mock: true,
    track: { title: t.title, artist: t.artist, album: t.album, art: artFor(mock.i), duration: t.duration, uri: `spotify:track:mock${mock.i}`, url: `https://open.spotify.com/track/mock${mock.i}` }
  }
}
function commandMock (name, arg) {
  mock.log.push({ name, arg })
  console.log("[spotify mock]", name, arg ?? "")
  const live = mock.status === "playing" || mock.status === "paused"
  if (name === "open" || name === "search" || name === "playUri") { if (!live) mock.status = "paused"; if (name === "playUri") mock.status = "playing"; return }
  if (name === "openSettings") { if (mock.status === "denied") mock.status = "paused"; return }
  if (!live) return
  mockSettle()
  if (name === "toggle") mock.status = mock.status === "playing" ? "paused" : "playing"
  else if (name === "play") mock.status = "playing"
  else if (name === "pause") mock.status = "paused"
  else if (name === "next") { mock.i = (mock.i + 1) % MOCK_TRACKS.length; mock.pos = 0 }
  else if (name === "previous") { if (mock.pos < 3) mock.i = (mock.i + MOCK_TRACKS.length - 1) % MOCK_TRACKS.length; mock.pos = 0 }
  else if (name === "seek") mock.pos = clamp(num(arg), 0, MOCK_TRACKS[mock.i].duration - 0.5)
  else if (name === "volume") mock.volume = Math.round(clamp(num(arg), 0, 100))
  else if (name === "shuffle") mock.shuffle = !!arg
  else if (name === "repeat") mock.repeat = !!arg
  mock.at = Date.now()
}

// ── commands ──────────────────────────────────────────────────────
const URI_RE = /^spotify:[A-Za-z0-9:._-]{3,200}$/
async function commandReal (name, arg) {
  if (name === "openSettings") return shell.openExternal(SETTINGS_URL)
  if (name === "open") return run("/usr/bin/open", ["-b", APP_ID])
  if (name === "search") {
    const q = String(arg ?? "").trim().slice(0, 200)
    return shell.openExternal(q ? `spotify:search:${encodeURIComponent(q)}` : "spotify:")
  }
  if (name === "playUri") {
    if (!URI_RE.test(String(arg ?? ""))) throw new Error("Not a Spotify link")
    if (!(await isRunning())) { await run("/usr/bin/open", ["-b", APP_ID]); return shell.openExternal(String(arg)) }
    return osa(`play track ${asStr(arg)}`)
  }
  if (!(await isRunning())) return run("/usr/bin/open", ["-b", APP_ID])   // a control press with Spotify closed opens it
  const body = {
    toggle: "playpause", play: "play", pause: "pause", next: "next track", previous: "previous track",
    seek: `set player position to ${clamp(num(arg), 0, 86_400).toFixed(2)}`,
    volume: `set sound volume to ${Math.round(clamp(num(arg), 0, 100))}`,
    shuffle: `set shuffling to ${arg ? "true" : "false"}`,
    repeat: `set repeating to ${arg ? "true" : "false"}`
  }[name]
  if (!body) throw new Error(`Unknown command “${name}”`)
  const r = await osa(body)
  if (!r.ok && r.status === "denied") throw Object.assign(new Error("denied"), { status: "denied" })
}

// ── polling + subscribers ─────────────────────────────────────────
const subs = new Map()   // webContents id -> { wc, mode: "fast" | "slow" }
const hooked = new WeakSet()   // windows whose close already drops their subscription
let last = null
let timer = null
let busy = null

const read = () => MOCK ? readMock() : readReal()
async function poll () {
  if (busy) return busy
  busy = (async () => {
    try { return await read() } catch (e) { return blank("error", { text: e.message }) }
  })()
  const s = await busy
  busy = null
  const prev = last
  last = s
  if (changed(prev, s)) push(s)
  return s
}
// worth a push: anything but the clock moved, or the position jumped (a seek)
function changed (a, b) {
  if (!a) return true
  const strip = ({ position, at, ...rest }) => JSON.stringify(rest)
  if (strip(a) !== strip(b)) return true
  const predicted = a.position + (a.status === "playing" ? (b.at - a.at) / 1000 : 0)
  return Math.abs(predicted - b.position) > 1.5
}
function push (s) {
  for (const [id, { wc }] of subs) {
    if (wc.isDestroyed()) { subs.delete(id); continue }
    wc.send("flux:spotify:state", s)
  }
}
function interval () {
  const st = last?.status
  if (st === "notInstalled") return 30_000
  if (st === "notRunning" || st === "denied" || st === "error") return 5000
  const fast = [...subs.values()].some((x) => x.mode === "fast")
  if (st === "stopped") return fast ? 2000 : 5000
  return fast ? 1000 : 3000
}
function schedule (delay) {
  clearTimeout(timer)
  timer = null
  if (!subs.size) return
  timer = setTimeout(async () => { await poll(); schedule() }, delay ?? interval())
}

async function command (name, arg) {
  try {
    if (MOCK) commandMock(name, arg)
    else await commandReal(name, arg)
  } catch (e) {
    if (e.status === "denied") { last = blank("denied"); push(last); return { ok: false, state: last } }
    return { ok: false, text: e.message, state: last }
  }
  // Spotify applies a command a beat later; read back, then keep the normal rhythm
  await new Promise((r) => setTimeout(r, MOCK ? 0 : 180))
  const s = await poll()
  push(s)
  schedule()
  return { ok: true, state: s }
}

// art as a data: URL, so the renderer can sample its colour on a canvas
const artCache = new Map()
async function art (url) {
  url = String(url ?? "")
  if (url.startsWith("data:image/")) return { ok: true, dataUrl: url }
  let u
  try { u = new URL(url) } catch { return { ok: false } }
  if (u.protocol !== "https:" || !/(^|\.)(scdn\.co|spotifycdn\.com)$/.test(u.hostname)) return { ok: false }
  if (artCache.has(url)) return { ok: true, dataUrl: artCache.get(url) }
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return { ok: false }
    const type = (r.headers.get("content-type") ?? "image/jpeg").split(";")[0]
    if (!type.startsWith("image/")) return { ok: false }
    const dataUrl = `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`
    artCache.set(url, dataUrl)
    if (artCache.size > 12) artCache.delete(artCache.keys().next().value)
    return { ok: true, dataUrl }
  } catch { return { ok: false } }
}

// installed / running without any AppleScript (no Automation prompt): for UI that hasn't been opted in
async function probe () {
  if (MOCK) return { status: mock.status === "notInstalled" || mock.status === "notRunning" ? mock.status : "running" }
  if (!(await isInstalled())) return { status: "notInstalled" }
  return { status: (await isRunning()) ? "running" : "notRunning" }
}

function registerSpotifyIpc () {
  ipcMain.handle("flux:spotify:state", () => poll())
  ipcMain.handle("flux:spotify:probe", () => probe())
  ipcMain.handle("flux:spotify:subscribe", (e, mode) => {
    const wc = e.sender
    subs.set(wc.id, { wc, mode: mode === "fast" ? "fast" : "slow" })
    if (!hooked.has(wc)) { hooked.add(wc); wc.once("destroyed", () => { subs.delete(wc.id); if (!subs.size) schedule() }) }
    schedule(0)
    return last ?? poll()
  })
  ipcMain.handle("flux:spotify:unsubscribe", (e) => { subs.delete(e.sender.id); if (!subs.size) schedule() })
  ipcMain.handle("flux:spotify:command", (_e, name, arg) => command(String(name ?? ""), arg))
  ipcMain.handle("flux:spotify:art", (_e, url) => art(url))
}

// tests (mock mode only): flip the simulated player's state
function mockSet (patch) { if (MOCK) { Object.assign(mock, patch); poll() } }

module.exports = { registerSpotifyIpc, mockSet, mockLog: () => mock.log }
