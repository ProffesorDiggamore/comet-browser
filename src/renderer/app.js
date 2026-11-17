// ───────────────────────────────────────────────────────────────────
//  app.js — renderer bootstrap.  Loads config, wires components, owns
//  view switching, and dispatches menu-bar actions (the app menu is
//  where every browser shortcut lives, so they work with a page
//  focused too).
// ───────────────────────────────────────────────────────────────────
import { state } from "./core/state.js"
import { bus, toast, actionToast } from "./core/bus.js"
import { sfx } from "./audio/sfx.js"
import * as T from "./core/tabs.js"
import { startPerfLoop } from "./core/perf.js"
import { initMotion } from "./core/motion.js"
import { initBackdrop } from "./core/backdrop.js"
import { pipScript } from "./core/pagescripts.js"
import { initTitlebar, openDownloadsPopover } from "./components/titlebar.js"
import { initSidebar } from "./components/sidebar.js"
import { initVTabs } from "./components/vtabs.js"
import { initHome } from "./components/home.js"
import { initSettings } from "./components/settings.js"
import { initLibrary, toggleBookmark } from "./components/library.js"
import { initAIPanel } from "./components/aipanel.js"
import { initDownloads } from "./components/downloads.js"
import { initOverlays } from "./components/overlays.js"
import { matchHotkey } from "./components/hottabs.js"
import { openFind, closeFind } from "./components/findbar.js"
import { openPalette, closePalette } from "./components/palette.js"
import { closeOverview } from "./components/overview.js"
import { closeReader } from "./components/reader.js"
import { closePopover, isPopoverOpen } from "./components/popover.js"
import { initSchematic } from "./components/schematic.js"
import { initEasyFiles } from "./components/easyfiles.js"
import { initProfiles, switchProfile, openProfileSheet } from "./components/profiles.js"
import { initTooltips } from "./components/tooltip.js"
import { initAutofill } from "./components/passwords.js"

const PANES = ["home", "library", "settings"]

function showView (v) {
  const prev = window.__fluxView
  window.__fluxView = v
  document.body.dataset.view = v
  for (const p of PANES) {
    const el = document.getElementById(p)
    const show = p === v
    el.hidden = !show
    if (show && prev !== v) { el.classList.remove("pane-enter"); void el.offsetWidth; el.classList.add("pane-enter") }
  }
}

async function screenshot () {
  const a = T.getActive()
  if (!a || a.isHome) return toast("Open a page to screenshot it")
  const d = await T.capturePage(a.id, { raw: true })
  if (!d) return toast("Couldn't capture this page")
  const r = await window.flux.shot.save(d, `${a.title || T.hostOf(a.url)} ${new Date().toLocaleString().replace(/[/:]/g, "-")}`)
  if (r.ok) actionToast("Screenshot saved to Downloads + copied", "Show", () => window.flux.shot.reveal(r.path), 5000)
  else toast(`Screenshot failed: ${r.text}`)
}

async function pip () {
  const a = T.getActive()
  if (!a || a.isHome) return
  const r = await T.exec(a.id, pipScript()).catch((e) => `error: ${e.message}`)
  if (r === "no-video") toast("No video on this page")
  else if (String(r).startsWith("error")) toast(r)
}

function runAction (action, extra = {}) {
  const a = T.getActive()
  const web = a && !a.isHome
  switch (action) {
    case "new-tab": return T.newTab()
    case "new-private-tab": return T.newTab(null, { private: true })
    case "copy-url": if (web) { navigator.clipboard.writeText(a.url); toast("Link copied") } return
    case "reopen": return T.reopenClosed()
    case "close-tab": return a && T.closeTab(a.id)
    case "focus-address": return bus.emit("focus-address")
    case "palette": return openPalette()
    case "screenshot": return screenshot()
    case "print": return web && T.rawTab(a.id).wv.print()
    case "find": if (web) { bus.emit("view", "tabs"); openFind() } return
    case "reload": return web ? T.reload() : null
    case "reload-ui": return window.flux.reloadUi()
    case "zoom-in": return T.zoomIn()
    case "zoom-out": return T.zoomOut()
    case "zoom-reset": return T.zoomReset()
    case "reader": return bus.emit("reader:toggle")
    case "split": return T.toggleSplit()
    case "split-with-url": { const id = T.newTab(extra.url, { background: true }); if (web) T.setSplit(a.id, id); return }
    case "overview": return bus.emit("overview:open")
    case "sidebar": return bus.emit("sidebar:toggle")
    case "focus": return bus.emit("focus:toggle")
    case "devtools": return web && T.rawTab(a.id).wv.openDevTools()
    case "back": return T.back()
    case "forward": return T.forward()
    case "home": return bus.emit("view", "home")
    case "history": return bus.emit("library:open", "history")
    case "bookmark": return toggleBookmark()
    case "bookmarks": return bus.emit("library:open", "bookmarks")
    case "next-tab": return T.cycle(1)
    case "prev-tab": return T.cycle(-1)
    case "pin": return web && T.setPinned(a.id, !a.pinned)
    case "duplicate": return T.duplicate(a?.id)
    case "mute": return a && T.setMuted(a.id)
    case "pip": return pip()
    case "sleep-all": T.sleepAllBackground(); return toast("Background tabs asleep")
    case "downloads": return openDownloadsPopover()
    case "ai": return bus.emit("ai:toggle")
    case "ai-page": return bus.emit("ai:ask", { focusOnly: true, withPage: true })
    case "ai-new": return bus.emit("ai:new")
    case "ai-summarize": return bus.emit("ai:ask", { text: "Summarize this page: key points, then anything I should act on.", withPage: true })
    case "ai-organize": return bus.emit("ai:ask", { text: "Look at my open tabs. Close exact duplicates, then tell me how you'd group the rest and which ones look finished." })
    case "settings": return bus.emit("view", "settings")
    case "profile-switch": return switchProfile(extra.id)
    case "profile-add": return openProfileSheet()
    case "profile-manage": return bus.emit("settings:goto", "profiles")
  }
}

function escape () {
  if (isPopoverOpen()) return closePopover()
  closePalette(); closeFind(); closeOverview(); closeReader()
}

async function main () {
  await state.load()
  initMotion()
  initBackdrop()
  sfx.bindGlobal()
  startPerfLoop()
  await initProfiles()
  initTooltips()

  initTitlebar()
  initSidebar()
  initVTabs()
  initHome()
  initSettings()
  initLibrary()
  initAIPanel()
  initDownloads()
  initOverlays()
  initSchematic()
  initEasyFiles()
  initAutofill()

  // "home" is the New Tab page — asking for it with no home tab active opens one
  bus.on("view", (v) => {
    if (v === "ai") { bus.emit("ai:toggle"); return }
    if (v === "home" && !T.getActive()?.isHome) { T.newTab(); return }
    showView(v)
  })
  bus.on("toast", (m) => toast(m))
  bus.on("menu", ({ action, ...extra }) => runAction(action, extra))
  bus.on("split:pick", () => toast("Open another page first, then split"))
  window.flux.onMenu(({ action, ...extra }) => runAction(action, extra))
  const setFullscreen = (on) => document.body.classList.toggle("is-fullscreen", !!on)
  window.flux.win.onFullscreen(setFullscreen)
  window.flux.win.isFullscreen().then(setFullscreen)
  window.flux.onOpenTab(({ url, background, search, from, private: priv }) => T.newTab(url, { background: !!background, search: !!search, private: !!priv || T.isPrivateWc(from) }))
  // links clicked in other apps while Comet was still starting (default browser)
  window.flux.takeOpenUrls().then((urls) => { for (const url of urls) T.newTab(url) })

  // passkey / WebAuthn attempt inside a webview never resolves — offer the OS browser
  let lastWa = 0
  bus.on("webauthn", (url) => {
    if (Date.now() - lastWa < 10_000) return
    lastWa = Date.now()
    actionToast("Passkeys don't work inside Comet yet.", "Finish in Safari", () => window.flux.openExternal(url || T.getActive()?.url))
  })

  // keys from inside a page: Escape + user Hot Tab hotkeys
  // ⌘ + arrow along the tab strip (sidebar ↑ ↓, top ← →) moves between tabs
  // a field with text keeps ⌘-arrow for its caret; an empty one (like a New Tab's search) switches tabs
  const editableEl = (el) => !!el && (el.isContentEditable ? !!el.textContent : /^(INPUT|TEXTAREA)$/.test(el.tagName) ? el.value !== "" : el.tagName === "SELECT")
  const tabArrow = (k, editable) => {
    if (!k.meta || k.ctrl || k.alt || k.shift || editable) return false
    const step = T.arrowStep(k.key)
    if (step) T.cycle(step)
    return !!step
  }
  let lastAxis = T.tabAxis()
  bus.on("config", () => { const a = T.tabAxis(); if (a !== lastAxis) { lastAxis = a; T.sendTabAxis() } })

  bus.on("page-key", (k) => {
    if (k.key === "Escape") { escape(); return }
    if (tabArrow(k, k.editable)) return
    matchHotkey({ key: k.key, metaKey: k.meta ?? true, ctrlKey: !!k.ctrl, shiftKey: !!k.shift, altKey: !!k.alt })
  })
  // capture phase: fields like the omnibox handle arrows themselves
  window.addEventListener("keydown", (e) => {
    if (tabArrow({ key: e.key, meta: e.metaKey, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey }, editableEl(e.target))) { e.preventDefault(); e.stopPropagation() }
  }, true)
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { escape(); return }
    if (e.metaKey && matchHotkey(e)) e.preventDefault()
  })

  if (!T.restoreSession()) T.newTab()
  document.getElementById("app").dataset.ready = "1"
}

main().catch((e) => {
  console.error("[flux] startup:", e?.name, e?.message, e?.stack)
  toast(`Startup error: ${e?.message || e?.name || e}`)
})
