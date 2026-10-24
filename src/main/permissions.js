// ───────────────────────────────────────────────────────────────────
//  permissions.js — sites must ASK for camera / mic / location /
//  notifications / screen / MIDI.  Electron grants everything by
//  default; this routes each request to a glass prompt in the UI and
//  remembers the answer per site (siteSettings[host].perms).
// ───────────────────────────────────────────────────────────────────
const { ipcMain } = require("electron")
const { store } = require("./store")

const ALWAYS = new Set(["fullscreen", "clipboard-sanitized-write", "pointerLock", "window-management"])
const ASK = new Set(["media", "geolocation", "notifications", "midi", "midiSysex", "clipboard-read", "display-capture", "idle-detection", "speaker-selection"])

function hostOf (url) { try { return new URL(url).host } catch { return "" } }

function key (permission, details) {
  if (permission !== "media") return permission
  const types = details?.mediaTypes ?? []
  return types.includes("video") ? (types.includes("audio") ? "camera+mic" : "camera") : "microphone"
}

function remembered (host, k) {
  return store.get("siteSettings")?.[host]?.perms?.[k] ?? null
}

function remember (host, k, value) {
  const all = { ...(store.get("siteSettings") ?? {}) }
  const site = { ...(all[host] ?? {}) }
  site.perms = { ...(site.perms ?? {}), [k]: value }
  all[host] = site
  store.set("siteSettings", all)
}

function initPermissions (ses, getWin) {
  const waiting = new Map()   // id -> resolve
  let seq = 0

  ipcMain.on("flux:perm:reply", (_e, { id, allow, remember: rem }) => {
    const r = waiting.get(id)
    if (r) { waiting.delete(id); r(Boolean(allow), Boolean(rem)) }
  })

  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    if (ALWAYS.has(permission)) return callback(true)
    if (!ASK.has(permission)) return callback(false)
    const url = details?.requestingUrl || wc.getURL()
    const host = hostOf(url)
    const k = key(permission, details)
    const prior = remembered(host, k)
    if (prior === "allow") return callback(true)
    if (prior === "block") return callback(false)

    const w = getWin()
    if (!w || w.isDestroyed()) return callback(false)
    const id = `perm_${++seq}`
    const timer = setTimeout(() => { if (waiting.has(id)) { waiting.delete(id); callback(false) } }, 60_000)
    waiting.set(id, (allow, rem) => {
      clearTimeout(timer)
      if (rem) remember(host, k, allow ? "allow" : "block")
      callback(allow)
    })
    w.webContents.send("flux:perm:ask", { id, host, permission: k, webContentsId: wc.id })
  })

  ses.setPermissionCheckHandler((_wc, permission, origin, details) => {
    if (ALWAYS.has(permission)) return true
    const host = hostOf(origin || details?.requestingUrl)
    const k = permission === "media" ? (details?.mediaType === "video" ? "camera" : "microphone") : permission
    return remembered(host, k) === "allow" || remembered(host, "camera+mic") === "allow"
  })
}

module.exports = { initPermissions }
