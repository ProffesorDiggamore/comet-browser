// ───────────────────────────────────────────────────────────────────
//  Flux — main process.  Window lifecycle, webview host, IPC wiring,
//  global hotkeys, extension loading.  Local-first: nothing leaves the
//  machine unless the user configures a cloud key.
// ───────────────────────────────────────────────────────────────────
const { app, BrowserWindow, ipcMain, globalShortcut, nativeTheme } = require("electron")
const path = require("node:path")
const { profiles } = require("./profiles")   // first: store/history/vault read their dir from it
const { store } = require("./store")
const { registerIpc } = require("./ipc")
const { registerShortcuts, applyVisionHotkey } = require("./shortcuts")
const { loadSavedExtensions } = require("./extensions")
const { registerBrowserIpc } = require("./ipc-browser")
const { registerAssistantIpc, flushChats } = require("./assistant/agent")
const { registerVoiceIpc } = require("./assistant/voice")
const { registerOllamaIpc } = require("./assistant/ollama")
const { initShield } = require("./shield")
const { initDownloads } = require("./downloads")
const { initPermissions } = require("./permissions")
const { attachContextMenu } = require("./contextmenu")
const { buildMenu } = require("./menu")
const { history } = require("./history")
const { registerEasyFilesIpc } = require("./easyfiles")
const { registerWallpaperIpc } = require("./wallpaper")
const { registerWeatherIpc } = require("./weather")
const { chats } = require("./assistant/chats")

const isDev = process.argv.includes("--dev")
const ROOT = path.resolve(__dirname, "..", "..")
const WEBVIEW_PRELOAD = path.join(__dirname, "..", "preload", "webview-preload.js")

// perf: hardware acceleration must be decided before app is ready
if (store.get("perf.hardwareAccel") === false) app.disableHardwareAcceleration()

let win = null

// one Flux per data folder: opening it again (Spotlight, the Dock, npm start
// beside the installed app) brings the window forward instead of a second
// copy fighting over the same profile files
if (!app.requestSingleInstanceLock()) app.exit(0)
app.on("second-instance", () => {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show(); win.focus()
})

// classic themes have one fixed mode; everything else follows theme.mode
const FIXED_MODE = { nebula: "dark", ember: "dark", midnight: "dark", aurora: "dark", carbon: "dark", blackline: "light", "blackline-noir": "dark" }
function themeSource () {
  const fixed = FIXED_MODE[store.get("theme.active")]
  if (fixed) return fixed
  const m = store.get("theme.mode")
  return m === "light" || m === "dark" ? m : "system"
}
const solidBg = () => (nativeTheme.shouldUseDarkColors ? "#1c1c1e" : "#ececef")

function createWindow () {
  const w = store.get("window") ?? {}
  win = new BrowserWindow({
    width: w.width ?? 1360,
    height: w.height ?? 900,
    x: w.x ?? undefined,
    y: w.y ?? undefined,
    minWidth: 900,
    minHeight: 600,
    show: false,
    // real macOS glass: the window material shows through the chrome
    backgroundColor: store.get("theme.vibrancy") === false ? solidBg() : "#00000000",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 19 },
    vibrancy: store.get("theme.vibrancy") === false ? undefined : "under-window",
    visualEffectState: "followWindow",
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,               // preload needs node:path for webview preload path
      webviewTag: true,             // <webview> is how Flux renders the web
      spellcheck: true
    }
  })

  win.loadFile(path.join(ROOT, "src", "renderer", "index.html"))
  win.once("ready-to-show", () => win.show())
  if (isDev) win.webContents.openDevTools({ mode: "detach" })

  const persist = () => {
    if (!win || win.isDestroyed()) return
    const b = win.getBounds()
    store.set("window", b)
  }
  win.on("resize", persist)
  win.on("move", persist)
  win.on("close", () => store.saveNow())
  win.on("closed", () => { win = null })
}

// expose resolved paths to preload synchronously
ipcMain.on("flux:paths", (e) => {
  e.returnValue = {
    root: ROOT,
    userData: app.getPath("userData"),
    webviewPreload: WEBVIEW_PRELOAD,
    fluxSelf: ROOT,
    partition: profiles.partition(),   // <webview> partition = this profile's cookies & site data
    profile: profiles.current()
  }
})

// every profile's web partition gets the same hooks, once, the first time it is used
const prepared = new WeakSet()
async function prepareSession (ses) {
  if (prepared.has(ses)) return ses
  prepared.add(ses)
  // drop the Electron/app tokens so sites see a normal Chrome (fixes "unsupported browser" walls)
  ses.setUserAgent(ses.getUserAgent().replace(/\s(flux-browser|Flux|Electron)\/\S+/g, ""))
  initShield(ses, () => win)
  initDownloads(ses, () => win)
  initPermissions(ses, () => win)
  try { await loadSavedExtensions(ses) } catch (e) { console.error("[ext]", e.message) }
  return ses
}

// a new profile starts with the current look and app settings, but its own
// bookmarks, tabs, history, Home and logins; its color becomes the accent
const SEED_KEYS = ["theme", "layout", "motion", "audio", "perf", "ai", "general", "privacy", "vision", "window"]
function seedConfig (color) {
  const seed = { meta: { schema: store.DEFAULTS.meta.schema } }
  for (const k of SEED_KEYS) seed[k] = structuredClone(store.get(k))
  if (color) seed.theme = { ...seed.theme, accent: color, accentCustom: true }
  return seed
}

// no await from the first save to the reload: a config write from the old UI
// must not be able to slip in between and land in the new profile
function switchProfile (id) {
  if (id === profiles.activeId()) return { ok: true }
  if (!profiles.get(id)) return { ok: false, text: "No such profile." }
  const bounds = win && !win.isDestroyed() ? win.getBounds() : null
  store.saveNow(); history.flush(); flushChats()
  profiles.setActive(id)
  const dir = profiles.dir()
  store.useDir(dir); history.useDir(dir); chats.useDir(dir)
  if (bounds) store.set("window", bounds)
  prepareSession(profiles.session())   // hooks attach synchronously; extensions finish loading after
  nativeTheme.themeSource = themeSource()
  if (win && !win.isDestroyed()) {
    const glass = store.get("theme.vibrancy") !== false
    win.setVibrancy(glass ? "under-window" : null)
    win.setBackgroundColor(glass ? "#00000000" : solidBg())
  }
  applyVisionHotkey(() => win)
  buildMenu(() => win)
  win?.webContents.reloadIgnoringCache()
  return { ok: true }
}

function registerProfileIpc () {
  const listing = () => ({ active: profiles.activeId(), list: profiles.list() })
  ipcMain.handle("flux:profiles:list", listing)
  ipcMain.handle("flux:profiles:create", async (_e, patch, { open } = {}) => {
    const p = profiles.create(patch, seedConfig(patch?.color))
    buildMenu(() => win)
    if (open) await switchProfile(p.id)
    return { ok: true, profile: p, ...listing() }
  })
  ipcMain.handle("flux:profiles:update", (_e, id, patch) => {
    const p = profiles.update(id, patch)
    buildMenu(() => win)
    return p ? { ok: true, profile: p, ...listing() } : { ok: false, text: "No such profile." }
  })
  ipcMain.handle("flux:profiles:remove", async (_e, id) => {
    const r = await profiles.remove(id)
    buildMenu(() => win)
    return { ...r, ...listing() }
  })
  ipcMain.handle("flux:profiles:switch", (_e, id) => switchProfile(id))
}

app.whenReady().then(async () => {
  // drives the native window glass AND prefers-color-scheme inside pages
  nativeTheme.themeSource = themeSource()

  // default companion target = Flux's own source, so it can extend itself
  if (!store.get("companion.projectPath")) store.set("companion.projectPath", ROOT)

  // the web lives in the active profile's persistent partition — every browsing feature hooks it
  await prepareSession(profiles.session())
  const getWin = () => win

  registerIpc({ getWin, ROOT, WEBVIEW_PRELOAD })
  registerProfileIpc()
  registerBrowserIpc({ getSes: () => profiles.session() })
  registerAssistantIpc()
  registerVoiceIpc()
  registerOllamaIpc()
  registerEasyFilesIpc(getWin)
  registerWallpaperIpc(getWin)
  registerWeatherIpc()
  ipcMain.handle("flux:win:vibrancy", (_e, on) => {
    if (!win || win.isDestroyed()) return
    win.setVibrancy(on ? "under-window" : null)
    win.setBackgroundColor(on ? "#00000000" : solidBg())
  })
  ipcMain.handle("flux:win:appearance", () => {
    nativeTheme.themeSource = themeSource()
    if (win && !win.isDestroyed() && store.get("theme.vibrancy") === false) win.setBackgroundColor(solidBg())
    return nativeTheme.shouldUseDarkColors
  })
  registerShortcuts({ getWin })
  buildMenu(getWin)

  createWindow()
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit() })
app.on("will-quit", () => { globalShortcut.unregisterAll(); store.saveNow(); history.flush(); flushChats() })

// links that open a new window become tabs; sized pop-ups (window.open with
// features) stay real windows, because "Sign in with Google" and other OAuth
// pop-ups hand the result back through window.opener, which a tab doesn't have
app.on("web-contents-created", (_e, contents) => {
  contents.setWindowOpenHandler(({ url, disposition }) => {
    if (disposition === "new-window" && /^https?:/.test(url) && contents !== win?.webContents) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          parent: win && !win.isDestroyed() ? win : undefined,
          backgroundColor: solidBg(),
          autoHideMenuBar: true,
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
        }
      }
    }
    const background = disposition === "background-tab"
    if (win && !win.isDestroyed()) win.webContents.send("flux:open-tab", { url, background })
    return { action: "deny" }
  })
  attachContextMenu(contents, () => win)
})
