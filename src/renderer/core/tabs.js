// ───────────────────────────────────────────────────────────────────
//  tabs.js — browser tab model.  Each tab owns one <webview>.
//  Pinned / muted / audible state, split view, session restore (lazy:
//  restored tabs stay asleep until clicked), per-site zoom + dark mode,
//  history recording, thumbnails, shield counts, idle sleeping.
// ───────────────────────────────────────────────────────────────────
import { bus } from "./bus.js"
import { state } from "./state.js"
import { sfx } from "../audio/sfx.js"
import { queryTemplate } from "../data/engines.js"
import { DARK_CSS } from "./pagescripts.js"

const host = () => document.getElementById("tabs-host")
const tabs = []
const closedStack = []
const byWc = new Map()           // webContentsId -> tab
let activeId = null
let seq = 0
let split = null                 // { a, b, ratio }
let divider = null

const faviconByHost = new Map()

// ── input → URL ───────────────────────────────────────────────────
export function engineSearch (q) {
  const tpl = queryTemplate(state.get("general.searchEngineId"), state.get("general.customSearchUrl"))
  return tpl.replace("%s", encodeURIComponent(q))
}

export function keywordFor (raw) {
  const m = /^!?(\S+)\s+(.+)$/.exec((raw ?? "").trim())
  if (!m) return null
  const kw = (state.get("keywords") ?? []).find((k) => k.key.toLowerCase() === m[1].toLowerCase())
  return kw ? { ...kw, query: m[2], url: kw.url.replace("%s", encodeURIComponent(m[2])) } : null
}

export function looksLikeUrl (s) {
  return /^(https?|file|about|chrome|view-source|data):/i.test(s) ||
    /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(s) || /^localhost(:\d+)?(\/\S*)?$/.test(s) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/\S*)?$/.test(s)
}

export function normalizeInput (raw, { search = false } = {}) {
  const s = (raw ?? "").trim()
  if (!s) return "about:blank"
  if (search) return engineSearch(s)
  if (/^(https?|file|about|chrome|view-source|data):/i.test(s)) return s
  if (looksLikeUrl(s)) return /^localhost|^\d/.test(s) ? `http://${s}` : `https://${s}`
  const kw = keywordFor(s)
  if (kw) return kw.url
  return engineSearch(s)
}

export function hostOf (url) { try { return new URL(url).host } catch { return "" } }

// ── reads ─────────────────────────────────────────────────────────
const pub = (t) => ({
  id: t.id, title: t.title, url: t.url, favicon: t.favicon, loading: t.loading, asleep: t.asleep, isHome: t.isHome,
  pinned: t.pinned, muted: t.muted, audible: t.audible, blocked: t.blocked, thumb: t.thumb, inSplit: isInSplit(t.id)
})
export function getTabs () { return tabs.map(pub) }
export function getTab (id) { const t = tabs.find((x) => x.id === id); return t ? pub(t) : null }
export function getActiveId () { return activeId }
export function getActive () { return tabs.find((t) => t.id === activeId) ?? null }
export function rawTab (id) { return id ? tabs.find((t) => t.id === id) ?? null : getActive() }
export function faviconFor (url) { return faviconByHost.get(hostOf(url)) ?? null }
export const getSplit = () => split

let emitQueued = false
function emit () {
  if (emitQueued) return
  emitQueued = true
  queueMicrotask(() => { emitQueued = false; bus.emit("tabs", { tabs: getTabs(), activeId }); saveSession() })
}
function touch (tab) { tab.lastActive = Date.now() }

function applyPerfFlags (wv) {
  const p = state.get("perf") ?? {}
  wv.setAttribute("webpreferences", `contextIsolation=yes,sandbox=yes,backgroundThrottling=${p.backgroundThrottle !== false}`)
  if (p.blockAutoplay) wv.setAttribute("autoplaypolicy", "user-gesture-required")
}

function site (url) { return (state.get("siteSettings") ?? {})[hostOf(url)] ?? {} }

export async function setSite (url, patch) {
  const h = hostOf(url); if (!h) return
  const all = { ...(state.get("siteSettings") ?? {}) }
  all[h] = { ...(all[h] ?? {}), ...patch }
  await state.set("siteSettings", all)
}

async function applySite (tab) {
  const s = site(tab.url)
  try {
    const z = s.zoom ?? Number(state.get("general.defaultZoom") ?? 1)
    tab.wv.setZoomFactor(z)
    tab.zoom = z
  } catch {}
  try {
    if (s.dark && !tab.darkKey) tab.darkKey = await tab.wv.insertCSS(DARK_CSS)
    else if (!s.dark && tab.darkKey) { await tab.wv.removeInsertedCSS(tab.darkKey); tab.darkKey = null }
  } catch {}
}
export function refreshSite (id) { const t = rawTab(id); if (t) applySite(t) }

// ── lifecycle ─────────────────────────────────────────────────────
export function newTab (url = null, { activate = true, background = false, pinned = false, asleep = false, index = null, search = false, title = null, favicon = null } = {}) {
  const id = `tab_${++seq}`
  const wv = document.createElement("webview")
  wv.setAttribute("partition", "persist:flux")
  wv.setAttribute("allowpopups", "")
  wv.setAttribute("preload", `file://${window.flux.paths.webviewPreload}`)
  applyPerfFlags(wv)
  wv.className = "is-hidden"
  const isHome = !url
  const target = url ? normalizeInput(url, { search }) : "about:blank"

  const tab = {
    id, wv, title: title ?? (isHome ? "New Tab" : target), url: isHome ? "" : target, favicon: favicon ?? faviconFor(target),
    loading: false, asleep: false, isHome, pinned, muted: false, audible: false, blocked: 0, thumb: null, lastActive: Date.now()
  }
  if (asleep && !isHome) { tab.asleep = true; tab.sleptUrl = target; wv.src = "about:blank" } else wv.src = target

  let idx = index
  if (idx == null) {
    if (pinned) idx = tabs.filter((t) => t.pinned).length
    else if (state.get("general.newTabPosition") === "afterCurrent" && activeId) idx = Math.max(tabs.findIndex((t) => t.id === activeId) + 1, tabs.filter((t) => t.pinned).length)
    else idx = tabs.length
  }
  tabs.splice(idx, 0, tab)
  host().append(wv)
  wire(tab)

  if (activate && !background) setActive(id)
  else emit()
  sfx.play("tabOpen")
  return id
}

function wire (tab) {
  const { wv } = tab
  wv.addEventListener("dom-ready", () => {
    try { const wc = wv.getWebContentsId(); if (wc && tab.wcId !== wc) { tab.wcId = wc; byWc.set(wc, tab) } } catch {}
    const cap = Number(state.get("perf.fpsCap") ?? 0)
    if (cap) try { wv.setFrameRate(cap) } catch {}
    if (tab.muted) try { wv.setAudioMuted(true) } catch {}
    tab.darkKey = null
    applySite(tab)
  })
  wv.addEventListener("page-title-updated", (e) => {
    tab.title = e.title || tab.title
    if (!tab.asleep && /^https?:/.test(tab.url)) window.flux.history.title({ url: tab.url, title: tab.title })
    emit()
  })
  wv.addEventListener("did-start-loading", () => { if (tab.asleep) return; tab.loading = true; emit(); bus.emit("loading", { id: tab.id, on: true }) })
  wv.addEventListener("did-stop-loading", () => {
    tab.loading = false
    try { const u = wv.getURL(); if (u && u !== "about:blank") tab.url = u } catch {}
    emit()
    bus.emit("loading", { id: tab.id, on: false })
    if (tab.id === activeId) setTimeout(() => snapThumb(tab), 700)
  })
  wv.addEventListener("did-fail-load", (e) => {
    if (e.isMainFrame && e.errorCode !== -3) bus.emit("load-error", { id: tab.id, code: e.errorCode, desc: e.errorDescription, url: e.validatedURL })
  })
  wv.addEventListener("did-navigate", (e) => {
    if (tab.asleep || e.url === "about:blank") return
    tab.url = e.url
    tab.isHome = false
    window.flux.history.record({ url: e.url, title: tab.title })
    applySite(tab)
    emit()
  })
  wv.addEventListener("did-navigate-in-page", (e) => {
    if (!e.isMainFrame || tab.asleep) return
    tab.url = e.url
    window.flux.history.record({ url: e.url, title: tab.title })
    emit()
  })
  wv.addEventListener("page-favicon-updated", (e) => {
    const icon = e.favicons?.[0] ?? null
    tab.favicon = icon
    if (icon) faviconByHost.set(hostOf(tab.url), icon)
    emit()
  })
  wv.addEventListener("media-started-playing", () => { tab.audible = true; emit() })
  wv.addEventListener("media-paused", () => { tab.audible = false; emit() })
  wv.addEventListener("update-target-url", (e) => { if (tab.id === activeId) bus.emit("hover-url", e.url) })
  wv.addEventListener("enter-html-full-screen", () => document.body.classList.add("is-page-fullscreen"))
  wv.addEventListener("leave-html-full-screen", () => document.body.classList.remove("is-page-fullscreen"))
  wv.addEventListener("ipc-message", (e) => {
    if (e.channel === "flux-key") bus.emit("page-key", e.args[0])
    else if (e.channel === "flux-webauthn") bus.emit("webauthn", e.args[0])
    else if (e.channel === "flux-file-pick") bus.emit("file-pick", { wv, ...e.args[0] })
  })
  wv.addEventListener("focus", () => { if (isInSplit(tab.id) && activeId !== tab.id) setActive(tab.id) })
}

export function setActive (id) {
  const tab = tabs.find((t) => t.id === id)
  if (!tab) return
  const prev = getActive()
  if (prev && prev !== tab && !prev.isHome && !prev.asleep) snapThumb(prev)
  activeId = id
  if (tab.asleep) wakeTab(id)
  touch(tab)
  layout(prev?.id !== id)
  bus.emit("view", tab.isHome ? "home" : "tabs")
  bus.emit("hover-url", "")
  emit()
}

export function closeTab (id) {
  const idx = tabs.findIndex((t) => t.id === id)
  if (idx === -1) return
  const [tab] = tabs.splice(idx, 1)
  if (tab.url && tab.url !== "about:blank") closedStack.push({ url: tab.url, title: tab.title, pinned: tab.pinned, index: idx })
  if (closedStack.length > 50) closedStack.shift()
  if (tab.wcId) byWc.delete(tab.wcId)
  if (isInSplit(id)) clearSplit()
  tab.wv.remove()
  sfx.play("tabClose")
  if (activeId === id) {
    const next = tabs[idx] ?? tabs[idx - 1] ?? null
    if (next) setActive(next.id)
    else { activeId = null; newTab() }
  }
  emit()
}

export function closeOthers (id) { for (const t of [...tabs]) if (t.id !== id && !t.pinned) closeTab(t.id) }
export function closeRight (id) {
  const i = tabs.findIndex((t) => t.id === id)
  for (const t of tabs.slice(i + 1)) if (!t.pinned) closeTab(t.id)
}

export function reopenClosed () {
  const last = closedStack.pop()
  if (last) newTab(last.url, { pinned: last.pinned, index: Math.min(last.index ?? tabs.length, tabs.length) })
}

export function navigate (input, tabId = null, opts = {}) {
  const url = normalizeInput(input, opts)
  const tab = rawTab(tabId)
  if (!tab) { newTab(url); return }
  if (tab.asleep) wakeTab(tab.id)
  tab.isHome = false
  tab.wv.src = url
  tab.url = url
  touch(tab)
  if (tab.id === activeId) bus.emit("view", "tabs")
  emit()
}

export function move (fromId, toIndex) {
  const i = tabs.findIndex((t) => t.id === fromId)
  if (i === -1) return
  const [t] = tabs.splice(i, 1)
  const pinnedCount = tabs.filter((x) => x.pinned).length
  const at = t.pinned ? Math.min(toIndex, pinnedCount) : Math.max(toIndex, pinnedCount)
  tabs.splice(Math.min(at, tabs.length), 0, t)
  emit()
}

export function cycle (dir = 1) {
  if (!tabs.length) return
  const i = tabs.findIndex((t) => t.id === activeId)
  setActive(tabs[(i + dir + tabs.length) % tabs.length].id)
}

export function setPinned (id, pinned = true) {
  const t = rawTab(id); if (!t || t.isHome) return
  t.pinned = pinned
  tabs.splice(tabs.indexOf(t), 1)
  tabs.splice(tabs.filter((x) => x.pinned).length, 0, t)   // pinned block end / first unpinned slot
  emit()
}

export function setMuted (id, muted) {
  const t = rawTab(id); if (!t) return
  t.muted = muted ?? !t.muted
  try { t.wv.setAudioMuted(t.muted) } catch {}
  emit()
}

export function duplicate (id) {
  const t = rawTab(id); if (!t || t.isHome) return null
  return newTab(t.url, { index: tabs.indexOf(t) + 1 })
}

// ── sleeping ──────────────────────────────────────────────────────
export function sleepTab (id) {
  const tab = rawTab(id)
  if (!tab || tab.asleep || tab.id === activeId || tab.isHome || tab.audible) return
  tab.sleptUrl = (() => { try { return tab.wv.getURL() } catch { return tab.url } })()
  tab.asleep = true
  tab.wv.src = "about:blank"
  emit()
}

export function wakeTab (id) {
  const tab = rawTab(id)
  if (!tab || !tab.asleep) return
  tab.asleep = false
  if (tab.sleptUrl && tab.sleptUrl !== "about:blank") tab.wv.src = tab.sleptUrl
  tab.sleptUrl = null
  touch(tab)
  emit()
}

export function sweepIdle () {
  if (!state.get("perf.sleepEnabled")) return
  const limit = Math.max(1, Number(state.get("perf.sleepAfterMin") ?? 15)) * 60_000
  const now = Date.now()
  for (const t of tabs) {
    if (t.id === activeId || t.asleep || t.loading || t.pinned || isInSplit(t.id)) continue
    if (now - (t.lastActive ?? now) > limit) sleepTab(t.id)
  }
}
export function sleepAllBackground () { for (const t of tabs) if (t.id !== activeId && !isInSplit(t.id)) sleepTab(t.id) }
export function refreshPerfFlags () { for (const t of tabs) applyPerfFlags(t.wv) }

// ── layout + split view ───────────────────────────────────────────
function isInSplit (id) { return !!split && (split.a === id || split.b === id) }

function layout (animate = false) {
  const showSplit = split && isInSplit(activeId)
  for (const t of tabs) {
    const visible = t.id === activeId || (showSplit && isInSplit(t.id))
    const wasHidden = t.wv.classList.contains("is-hidden")
    t.wv.classList.toggle("is-hidden", !visible)
    t.wv.classList.toggle("is-split-focus", !!showSplit && t.id === activeId)
    if (showSplit && visible) {
      const left = t.id === split.a
      const pct = split.ratio * 100
      Object.assign(t.wv.style, left ? { left: "0", right: "auto", width: `calc(${pct}% - 3px)` } : { left: `calc(${pct}% + 3px)`, right: "0", width: "auto" })
    } else Object.assign(t.wv.style, { left: "", right: "", width: "" })
    if (visible && animate && wasHidden && !showSplit) {
      t.wv.classList.remove("wv-enter"); void t.wv.offsetWidth; t.wv.classList.add("wv-enter")
    }
  }
  if (showSplit) {
    if (!divider) divider = makeDivider()
    divider.hidden = false
    divider.style.left = `calc(${split.ratio * 100}% - 3px)`
    host().append(divider)
  } else if (divider) divider.hidden = true
}

function makeDivider () {
  const d = document.createElement("div")
  d.className = "split-divider"
  d.addEventListener("pointerdown", (e) => {
    d.setPointerCapture(e.pointerId)
    host().classList.add("is-resizing")
    const r = host().getBoundingClientRect()
    const mv = (ev) => { split.ratio = Math.min(0.8, Math.max(0.2, (ev.clientX - r.left) / r.width)); layout() }
    const up = () => { host().classList.remove("is-resizing"); d.removeEventListener("pointermove", mv); d.removeEventListener("pointerup", up) }
    d.addEventListener("pointermove", mv)
    d.addEventListener("pointerup", up)
  })
  d.addEventListener("dblclick", () => { split.ratio = 0.5; layout() })
  return d
}

export function setSplit (a, b) {
  const ta = rawTab(a); const tb = rawTab(b)
  if (!ta || !tb || a === b || ta.isHome || tb.isHome) return false
  split = { a, b, ratio: 0.5 }
  if (ta.asleep) wakeTab(a)
  if (tb.asleep) wakeTab(b)
  activeId = a
  layout()
  bus.emit("view", "tabs")
  emit()
  return true
}
export function clearSplit () { split = null; layout(); emit() }
export function toggleSplit () {
  if (split) return clearSplit()
  const cur = getActive()
  if (!cur || cur.isHome) return
  const i = tabs.indexOf(cur)
  const other = tabs.slice(i + 1).find((t) => !t.isHome) ?? tabs.slice(0, i).reverse().find((t) => !t.isHome)
  if (other) setSplit(cur.id, other.id)
  else { const id = newTab(null, { background: true }); bus.emit("split:pick", { a: cur.id, newId: id }) }
}

// ── nav / zoom ────────────────────────────────────────────────────
export const back = (id) => { const t = rawTab(id); if (t?.wv.canGoBack()) t.wv.goBack() }
export const forward = (id) => { const t = rawTab(id); if (t?.wv.canGoForward()) t.wv.goForward() }
export const reload = (id) => { const t = rawTab(id); if (t?.asleep) wakeTab(t.id); else t?.wv.reload() }
export const stop = (id) => rawTab(id)?.wv.stop()

function zoom (delta, id) {
  const t = rawTab(id); if (!t || t.isHome) return
  const cur = (() => { try { return t.wv.getZoomFactor() } catch { return 1 } })()
  const next = delta === 0 ? 1 : Math.min(3, Math.max(0.3, Math.round((cur + delta) * 20) / 20))
  try { t.wv.setZoomFactor(next) } catch {}
  t.zoom = next
  setSite(t.url, { zoom: next === 1 ? undefined : next })
  bus.emit("zoom", { id: t.id, zoom: next })
}
export const zoomIn = (id) => zoom(0.1, id)
export const zoomOut = (id) => zoom(-0.1, id)
export const zoomReset = (id) => zoom(0, id)
export const zoomOf = (id) => rawTab(id)?.zoom ?? 1

// ── page access ───────────────────────────────────────────────────
export async function exec (id, code) {
  const t = rawTab(id)
  if (!t || t.isHome) throw new Error("That tab has no web page.")
  if (t.asleep) { wakeTab(t.id); await new Promise((r) => t.wv.addEventListener("did-stop-loading", r, { once: true })) }
  return t.wv.executeJavaScript(code, true)
}

export function downscale (dataUrl, maxW = 1280, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const s = Math.min(1, maxW / img.width)
      const c = document.createElement("canvas")
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s)
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height)
      resolve(c.toDataURL("image/jpeg", quality))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

export async function capturePage (id = null, { maxW = 1600, raw = false } = {}) {
  const tab = rawTab(id)
  if (!tab || tab.isHome) return null
  try {
    const d = (await tab.wv.capturePage()).toDataURL()
    return raw ? d : downscale(d, maxW)
  } catch (e) { console.error("[tabs] capturePage", e.message); return null }
}

async function snapThumb (tab) {
  if (!tab || tab.isHome || tab.asleep) return
  try {
    const d = (await tab.wv.capturePage()).toDataURL()
    if (d.length > 2000) { tab.thumb = await downscale(d, 480, 0.7); bus.emit("thumb", { id: tab.id }) }
  } catch {}
}
export function snapActive () { return snapThumb(getActive()) }

export function openMacro (urls = []) {
  urls.forEach((u, i) => newTab(u, { activate: i === 0, background: i !== 0 }))
}

// ── shield counts (from main, keyed by webContentsId) ─────────────
window.flux.shield.onCounts(({ counts }) => {
  for (const [wc, n] of Object.entries(counts ?? {})) {
    const t = byWc.get(Number(wc))
    if (t) t.blocked = n
  }
  bus.emit("shield")
})

// ── session save / restore ────────────────────────────────────────
let saveT = null
let restoring = false
function saveSession () {
  if (restoring) return
  clearTimeout(saveT)
  saveT = setTimeout(() => {
    const list = tabs.filter((t) => !t.isHome || t.pinned).map((t) => ({ url: t.asleep ? t.sleptUrl : t.url, title: t.title, pinned: t.pinned, favicon: (t.favicon ?? "").length < 600 ? t.favicon : null }))
      .filter((t) => t.url && t.url !== "about:blank")
    const active = Math.max(0, tabs.filter((t) => !t.isHome).findIndex((t) => t.id === activeId))
    state.set("session", { tabs: list.slice(0, 200), active })
  }, 1200)
}

export function restoreSession () {
  const s = state.get("session")
  if (!state.get("general.restoreTabs") || !s?.tabs?.length) return false
  restoring = true
  const ids = s.tabs.map((t, i) => newTab(t.url, { background: true, pinned: !!t.pinned, asleep: i !== s.active, title: t.title, favicon: t.favicon }))
  restoring = false
  setActive(ids[Math.min(s.active ?? 0, ids.length - 1)])
  return true
}
