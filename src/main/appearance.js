// ───────────────────────────────────────────────────────────────────
//  appearance.js — light / dark per window.  nativeTheme.themeSource is
//  app-wide: it drives the native glass, every page's
//  prefers-color-scheme and the solid fill of every window.  With one
//  profile window it simply follows that window, as before.  With several
//  it stays "system" (macOS decides, and nothing flips when focus moves),
//  and a window whose profile pins light or dark gets that per
//  webContents: prefers-color-scheme is emulated through the DevTools
//  protocol for its UI, its tabs and its pop-ups, and its solid fill uses
//  its own mode.  The native glass can't be themed per window, so each UI
//  is told the glass's real mode and thickens its tint when they disagree.
// ───────────────────────────────────────────────────────────────────
const { app, webContents, nativeTheme, systemPreferences } = require("electron")
const { profiles } = require("./profiles")
const C = require("./contexts")

// classic themes have one fixed mode; everything else follows theme.mode
const FIXED_MODE = { nebula: "dark", ember: "dark", midnight: "dark", aurora: "dark", carbon: "dark", blackline: "light", "blackline-noir": "dark" }
function themeSource (store) {
  const fixed = FIXED_MODE[store.get("theme.active")]
  if (fixed) return fixed
  const m = store.get("theme.mode")
  return m === "light" || m === "dark" ? m : "system"
}

const liveCtxs = () => [...C.contexts.values()].filter((c) => C.alive(c.win))
const shared = () => liveCtxs().length > 1     // several profile windows side by side

// macOS's own appearance, even while themeSource overrides the app's
function osDark () {
  if (nativeTheme.themeSource === "system") return nativeTheme.shouldUseDarkColors
  try { return systemPreferences.getUserDefault("AppleInterfaceStyle", "string") === "Dark" } catch { return nativeTheme.shouldUseDarkColors }
}
function modeFor (ctx) {
  if (!ctx) return nativeTheme.shouldUseDarkColors ? "dark" : "light"
  const s = themeSource(ctx.store)
  return s === "system" ? (osDark() ? "dark" : "light") : s
}
const SOLID = { dark: "#1c1c1e", light: "#ececef" }
const solidBgFor = (ctx) => SOLID[modeFor(ctx)]

// ── per-webContents prefers-color-scheme ──
const emulated = new Map()     // webContents id → "light" | "dark"
const ours = new WeakSet()     // debuggers this module attached

function wanted (wc) {
  if (!shared()) return null
  const s = C.ctxForContents(wc)
  if (!s) return null
  const src = themeSource(s.store)
  return src === "system" ? null : src
}

function syncContents (wc) {
  try {
    if (!wc || wc.isDestroyed()) return
    const t = wc.getType()
    if (t !== "window" && t !== "webview") return
    const want = wanted(wc)
    if ((emulated.get(wc.id) ?? null) === want) return
    const dbg = wc.debugger
    const media = (features) => dbg.sendCommand("Emulation.setEmulatedMedia", { features }).catch(() => emulated.delete(wc.id))
    if (!want) {
      emulated.delete(wc.id)
      if (!dbg.isAttached()) return
      if (ours.has(wc)) { ours.delete(wc); dbg.detach() }   // detaching drops the override
      else media([])
      return
    }
    if (!dbg.isAttached()) {
      dbg.attach("1.3")
      ours.add(wc)
      dbg.once("detach", () => { emulated.delete(wc.id); ours.delete(wc) })
    }
    emulated.set(wc.id, want)
    media([{ name: "prefers-color-scheme", value: want }])
  } catch { /* gone, or a debugger it won't share */ }
}

function tellGlass (ctx) {
  ctx.win.webContents.send("flux:win:glass", nativeTheme.shouldUseDarkColors)
}

// recompute everything: called on focus, open, close, switch and theme change
function applyAppearance () {
  const live = liveCtxs()
  const src = live.length > 1 ? "system" : live.length === 1 ? themeSource(live[0].store) : null
  if (src && nativeTheme.themeSource !== src) nativeTheme.themeSource = src
  for (const c of live) {
    if (c.store.get("theme.vibrancy") === false) c.win.setBackgroundColor(solidBgFor(c))
    tellGlass(c)
  }
  for (const wc of webContents.getAllWebContents()) syncContents(wc)
}

function initAppearance () {
  // before any window exists: the windows coming back decide
  const open = profiles.openIds().filter(C.usable)
  const first = C.contextFor(C.usable(profiles.activeId()) ? profiles.activeId() : profiles.DEFAULT_ID)
  nativeTheme.themeSource = open.length > 1 ? "system" : themeSource(first.store)
  // macOS switching light/dark: solid fills of Auto windows and the glass flag
  nativeTheme.on("updated", () => {
    for (const c of liveCtxs()) {
      if (c.store.get("theme.vibrancy") === false) c.win.setBackgroundColor(solidBgFor(c))
      tellGlass(c)
    }
  })
  // tabs and pop-ups pick up their window's mode as they appear
  app.on("web-contents-created", (_e, wc) => {
    wc.once("destroyed", () => emulated.delete(wc.id))
    const t = wc.getType()
    if (t === "webview") wc.once("did-attach", () => syncContents(wc))
    else if (t === "window") wc.once("did-start-loading", () => syncContents(wc))
  })
}

module.exports = { themeSource, modeFor, solidBgFor, applyAppearance, initAppearance }
