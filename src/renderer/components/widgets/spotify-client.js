// ───────────────────────────────────────────────────────────────────
//  widgets/spotify-client.js — the renderer's one view of the Spotify
//  app (main/spotify.js does the talking).  Everything in this window
//  that shows Spotify listens here: the Home widget asks for fast
//  updates, the sidebar player for slow ones; the window holds ONE
//  subscription at the higher rate, and drops it while hidden.
//  Also: the playhead between polls, artwork as data: URLs, and the
//  artwork's colour for tinted backgrounds.
// ───────────────────────────────────────────────────────────────────
import { state as cfg } from "../../core/state.js"

const api = () => window.flux?.spotify

// The first AppleScript to Spotify brings up macOS's "Comet wants to control Spotify" prompt, so
// nothing reads the app until the user asks for it: a Spotify widget on Home, or Settings → Layout →
// Spotify in Now Playing (unset = follows the widget).  Commands the user runs are their own ask.
const hasWidget = () => (cfg.get("home.widgets") ?? []).some((w) => w?.kind === "spotify")
const sidebarOn = () => cfg.get("layout.nowPlayingSpotify") ?? hasWidget()

let state = null
const listeners = new Map()   // cb -> "fast" | "slow"
let held = null               // the mode main currently has for this window

function sync () {
  const want = document.hidden || !listeners.size ? null : [...listeners.values()].includes("fast") ? "fast" : "slow"
  if (want === held) return
  held = want
  if (!want) { api()?.unsubscribe(); return }
  api()?.subscribe(want).then(set).catch(() => {})
}
function set (s) {
  if (!s || typeof s !== "object") return
  state = s
  for (const cb of [...listeners.keys()]) { try { cb(s) } catch (e) { console.error("[spotify]", e) } }
}

let wired = false
function wire () {
  if (wired || !api()) return
  wired = true
  api().onState(set)
  document.addEventListener("visibilitychange", sync)
}

export const spotify = {
  get state () { return state },
  // cb(state) now (when known) and on every change; returns off()
  subscribe (cb, { fast = false } = {}) {
    wire()
    listeners.set(cb, fast ? "fast" : "slow")
    if (state) queueMicrotask(() => listeners.has(cb) && cb(state))
    sync()
    return () => { listeners.delete(cb); sync() }
  },
  async command (name, arg) {
    const r = await api()?.command(name, arg).catch((e) => ({ ok: false, text: e.message }))
    if (r?.state) set(r.state)
    return r ?? { ok: false }
  },
  // the playhead right now, between polls
  position (s = state) {
    if (!s?.track) return 0
    const p = s.position + (s.status === "playing" ? (Date.now() - s.at) / 1000 : 0)
    return Math.max(0, Math.min(s.track.duration || p, p))
  },
  // one fresh read (the palette, before it lists Spotify's commands)
  refresh () { wire(); return api()?.state().then(set).catch(() => {}) },
  // the user has opted in (see above); `sidebar`: the Now Playing card may show Spotify
  enabled: () => cfg.get("layout.nowPlayingSpotify") === true || hasWidget(),
  sidebar: () => sidebarOn() === true,
  // installed / running, from pgrep + the app's path only (no AppleScript): "notInstalled" | "notRunning" | "running"
  probe () { return (api()?.probe?.() ?? Promise.resolve(null)).then((r) => r?.status ?? null).catch(() => null) },
  live: (s = state) => s?.status === "playing" || s?.status === "paused",
  art: (url) => artData(url),
  tint: (dataUrl) => tintOf(dataUrl)
}

// ── artwork ───────────────────────────────────────────────────────
const artMemo = new Map()
function artData (url) {
  if (!url) return Promise.resolve(null)
  if (!artMemo.has(url)) {
    artMemo.set(url, (api()?.art(url) ?? Promise.resolve(null)).then((r) => r?.ok ? r.dataUrl : null).catch(() => null))
    if (artMemo.size > 16) artMemo.delete(artMemo.keys().next().value)
  }
  return artMemo.get(url)
}

// the artwork's colour: an average that leans on its saturated pixels
// (the colour you notice, not the grey you'd get from a plain mean) → [h, s, l]
const tintMemo = new Map()
function tintOf (dataUrl) {
  if (!dataUrl) return Promise.resolve(null)
  if (tintMemo.has(dataUrl)) return tintMemo.get(dataUrl)
  const p = new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const N = 24
        const c = document.createElement("canvas")
        c.width = c.height = N
        const g = c.getContext("2d", { willReadFrequently: true })
        g.drawImage(img, 0, 0, N, N)
        const d = g.getImageData(0, 0, N, N).data
        let r = 0, gg = 0, b = 0, w = 0
        for (let i = 0; i < d.length; i += 4) {
          const [, s, l] = hsl(d[i], d[i + 1], d[i + 2])
          const k = 0.08 + s * s * (1 - Math.abs(l - 0.5) * 1.6)
          r += d[i] * k; gg += d[i + 1] * k; b += d[i + 2] * k; w += k
        }
        resolve(w ? hsl(r / w, gg / w, b / w) : null)
      } catch { resolve(null) }
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
  tintMemo.set(dataUrl, p)
  if (tintMemo.size > 16) tintMemo.delete(tintMemo.keys().next().value)
  return p
}
function hsl (r, g, b) {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  if (mx === mn) return [0, 0, l]
  const d = mx - mn
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

export const fmtTime = (sec) => {
  sec = Math.max(0, Math.floor(sec || 0))
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`
}
