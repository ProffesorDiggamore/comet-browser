// ───────────────────────────────────────────────────────────────────
//  windows.js — window lifecycle.  At most one window per profile:
//  opening a profile that already has one focuses it.  Windows are
//  titled "Comet — <Profile>" (just "Comet" with one profile), so the
//  Window menu and the Dock list them by profile.  The profiles whose
//  windows are open at quit come back on launch, each with its tabs.
// ───────────────────────────────────────────────────────────────────
const { app, BrowserWindow } = require("electron")
const path = require("node:path")
const { profiles } = require("./profiles")
const C = require("./contexts")
const { buildMenu, buildDockMenu } = require("./menu")
const { themeSource, solidBgFor, applyAppearance } = require("./appearance")

const ROOT = path.resolve(__dirname, "..", "..")
const isDev = process.argv.includes("--dev")

let quitting = false
let restoring = false
const focusOrder = []          // profile ids, last = most recently focused
app.on("before-quit", () => { quitting = true })

const ownerOf = (wcId) => C.contexts.get(C.uiOwner.get(wcId)) ?? null
const liveCtxs = () => [...C.contexts.values()].filter((c) => C.alive(c.win))
const liveIds = () => liveCtxs().map((c) => c.id)
const isUi = (w) => !!w && !w.isDestroyed() && C.uiOwner.has(w.webContents.id)

function titleFor (ctx) {
  const p = profiles.get(ctx.id)
  return profiles.list().length > 1 && p ? `Comet — ${p.name}` : "Comet"
}
function retitleAll () { for (const c of liveCtxs()) c.win.setTitle(titleFor(c)) }

function focusWin (w) {
  if (!C.alive(w)) return
  if (w.isMinimized()) w.restore()
  w.show(); w.focus()
}

function lastFocusedWin () {
  for (let i = focusOrder.length - 1; i >= 0; i--) {
    const w = C.alive(C.contexts.get(focusOrder[i])?.win)
    if (w) return w
  }
  return liveCtxs()[0]?.win ?? null
}

// a menu click's window → the Comet window it should act on: a pop-up maps
// to its parent, nothing focused maps to the last-focused window
function targetWin (bw) {
  if (C.alive(bw)) {
    if (isUi(bw)) return bw
    const parent = bw.getParentWindow()
    if (isUi(parent)) return parent
    const w = C.windowForContents(bw.webContents)
    if (w) return w
  }
  return lastFocusedWin()
}
const focusedProfileId = () => {
  const w = targetWin(BrowserWindow.getFocusedWindow())
  return (w && C.uiOwner.get(w.webContents.id)) ?? profiles.activeId()
}

// which profiles have windows, in focus order (last = front); restored on launch
function persistOpen () {
  if (quitting || restoring) return
  const live = new Set(liveIds())
  const ids = focusOrder.filter((id) => live.has(id))
  for (const id of live) if (!ids.includes(id)) ids.unshift(id)
  profiles.setOpen(ids)
}

function broadcastProfiles () {
  const list = profiles.list().filter((p) => !C.removing.has(p.id))
  const open = liveIds()
  for (const c of liveCtxs()) c.win.webContents.send("flux:profiles:changed", { active: c.id, open, list })
}

// ⌘N / Dock "New Window…": the focused window shows its profile picker;
// with no window open, the last profile's window comes back
function newWindow () {
  const w = lastFocusedWin()
  if (!w) return openProfileWindow(profiles.activeId())
  focusWin(w)
  w.webContents.send("flux:menu", { action: "new-window" })
}

function rebuildMenus () {
  retitleAll()
  const api = { targetWin, openProfileWindow, newWindow, focusedProfileId, openIds: liveIds, removing: C.removing }
  buildMenu(api)
  buildDockMenu(api)
}

function setLastFocused (ctx) {
  if (!ctx) return
  const i = focusOrder.indexOf(ctx.id)
  if (i >= 0) focusOrder.splice(i, 1)
  focusOrder.push(ctx.id)
  if (restoring || quitting) return
  profiles.setActive(ctx.id)
  // light/dark is per window (appearance.js); this only re-checks it
  applyAppearance()
  persistOpen()
  rebuildMenus()
}

// show: false leaves showing to the caller (restore); resolves when ready to show
function createWindow (ctx, { show = true } = {}) {
  ctx.uiReady = false
  const w = ctx.store.get("window") ?? {}
  let x = w.x ?? undefined
  let y = w.y ?? undefined
  // a new profile is seeded with its source's bounds: don't stack exactly on top
  if (x != null && y != null) {
    const taken = () => liveCtxs().some((c) => { const b = c.win.getBounds(); return b.x === x && b.y === y })
    for (let n = 0; n < 20 && taken(); n++) { x += 26; y += 26 }
  }
  const glass = ctx.store.get("theme.vibrancy") !== false
  const win = new BrowserWindow({
    width: w.width ?? 1360,
    height: w.height ?? 900,
    x, y,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: titleFor(ctx),
    // real macOS glass: the window material shows through the chrome
    backgroundColor: glass ? "#00000000" : solidBgFor(ctx),
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 19 },
    vibrancy: glass ? "under-window" : undefined,
    visualEffectState: "followWindow",
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,               // preload needs node:path for webview preload path
      webviewTag: true,             // <webview> is how Comet renders the web
      spellcheck: true
    }
  })
  // the webContents is gone by 'closed', and an in-place switch re-points this id
  const wcId = win.webContents.id
  C.uiOwner.set(wcId, ctx.id)
  ctx.win = win
  const owner = () => ownerOf(wcId)

  // main owns the title (the page's <title> doesn't name the profile)
  win.on("page-title-updated", (e) => e.preventDefault())
  win.loadFile(path.join(ROOT, "src", "renderer", "index.html"))
  const ready = new Promise((resolve) => {
    const t = setTimeout(resolve, 6000)
    win.once("ready-to-show", () => { clearTimeout(t); resolve() })
  })
  if (show) ready.then(() => { if (!win.isDestroyed()) win.show() })
  if (isDev) win.webContents.openDevTools({ mode: "detach" })

  const persist = () => {
    if (win.isDestroyed()) return
    const o = owner()
    if (o && !o.disposed) o.store.set("window", win.getBounds())
  }
  win.on("resize", persist)
  win.on("move", persist)
  // native fullscreen: no traffic lights and nothing to drag, so the chrome re-lays itself out
  const tellFullscreen = () => { if (!win.isDestroyed()) win.webContents.send("flux:win:fullscreen", win.isFullScreen()) }
  win.on("enter-full-screen", tellFullscreen)
  win.on("leave-full-screen", tellFullscreen)
  // "active" = this window is in front and showing; the UI stops every
  // always-running effect (ambient, Style backdrop, widget timers) when it isn't
  const tellActive = () => { if (!win.isDestroyed()) win.webContents.send("flux:win:active", win.isFocused() && win.isVisible() && !win.isMinimized()) }
  for (const ev of ["focus", "blur", "show", "hide", "minimize", "restore"]) win.on(ev, tellActive)
  win.on("focus", () => setLastFocused(owner()))
  // an in-place switch drops config writes until the new UI is up (any outcome)
  const doneSwitching = () => { win.switching = false }
  for (const ev of ["did-finish-load", "did-fail-load", "dom-ready", "render-process-gone"]) win.webContents.on(ev, doneSwitching)
  win.on("close", () => owner()?.flush())
  win.on("closed", () => {
    const o = owner()
    C.uiOwner.delete(wcId)
    if (o) {
      if (o.win === win) o.win = null
      o.uiReady = false
      o.flush()
      C.clearPrivate(o)
    }
    // the last window closed (not quit) stays listed, so it comes back like today
    if (!quitting && liveCtxs().length) persistOpen()
    if (!quitting) applyAppearance()      // back to one window: it drives the app's appearance again
    rebuildMenus()
    broadcastProfiles()
  })
  return ready
}

function openProfileWindow (id) {
  if (!app.isReady() || !C.usable(id)) return { ok: false, text: "No such profile." }
  const ctx = C.contextFor(id)
  if (C.alive(ctx.win)) { focusWin(ctx.win); return { ok: true, focused: true } }
  C.prepareCtx(ctx)   // hooks attach now; extensions finish loading after
  createWindow(ctx)
  applyAppearance()   // a second window: each keeps its own mode from here on
  persistOpen()
  rebuildMenus()
  broadcastProfiles()
  return { ok: true, opened: true }
}

// the window `win` becomes profile `id`.  A profile that already has a window
// is focused instead.  No await from the flush to the reload, so nothing
// from the old UI can slip in between.
function switchWindowProfile (win, id) {
  if (!C.alive(win) || !isUi(win)) return { ok: false, text: "No window." }
  const wcId = win.webContents.id
  const from = ownerOf(wcId)
  if (from?.id === id) return { ok: true }
  if (!C.usable(id)) return { ok: false, text: "No such profile." }
  const to = C.contextFor(id)
  if (C.alive(to.win)) { focusWin(to.win); return { ok: true, focused: true } }

  const bounds = win.getBounds()
  if (from) {
    from.flush()
    if (from.win === win) from.win = null
    from.uiReady = false
    C.clearPrivate(from)
  }
  C.uiOwner.set(wcId, to.id)
  to.win = win
  to.uiReady = false
  to.store.set("window", bounds)
  C.prepareCtx(to)
  const glass = to.store.get("theme.vibrancy") !== false
  win.setVibrancy(glass ? "under-window" : null)
  win.setBackgroundColor(glass ? "#00000000" : solidBgFor(to))
  win.setTitle(titleFor(to))
  setLastFocused(to)        // active profile, open list, menus, appearance
  broadcastProfiles()
  win.switching = true
  win.webContents.reloadIgnoringCache()
  return { ok: true }
}

// launch: the windows that were open at quit (or the last profile's), each
// restoring its own tabs.  Only the front one takes focus, once all are up.
async function restoreWindows () {
  const active = profiles.activeId()
  let ids = profiles.openIds().filter(C.usable)
  if (!ids.length) ids = [C.usable(active) ? active : profiles.DEFAULT_ID]
  const front = ids.includes(active) ? active : ids[ids.length - 1]
  restoring = true
  try {
    const ctxs = ids.map((id) => C.contextFor(id)).filter(Boolean)
    await Promise.all(ctxs.map((c) => C.prepareCtx(c)))   // extensions are in before the first page loads
    const waits = []
    for (const c of ctxs) {
      if (C.alive(c.win)) continue
      const ready = createWindow(c, { show: false })
      if (c.id !== front) ready.then(() => { if (C.alive(c.win)) c.win.showInactive() })
      waits.push(ready)
    }
    await Promise.all(waits)
    focusOrder.length = 0
    focusOrder.push(...ids.filter((id) => id !== front), front)
  } finally { restoring = false }
  const f = C.contexts.get(front)
  if (C.alive(f?.win)) focusWin(f.win)
  setLastFocused(f)
  broadcastProfiles()
}

module.exports = {
  themeSource, solidBgFor, createWindow, openProfileWindow, switchWindowProfile, restoreWindows,
  persistOpen, broadcastProfiles, rebuildMenus, newWindow, targetWin, lastFocusedWin, focusWin,
  liveCtxs, isRestoring: () => restoring, isQuitting: () => quitting, setQuitting: () => { quitting = true }
}
