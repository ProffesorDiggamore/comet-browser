// ───────────────────────────────────────────────────────────────────
//  Comet — main process.  Window lifecycle, webview host, IPC wiring,
//  global hotkeys, extension loading.  Local-first: nothing leaves the
//  machine unless the user configures a cloud key.
//
//  The browser was called Flux until v0.8.  The data folder and web
//  partitions moved to Comet names (profiles.js does it once, on launch).
//  package.json's productName (= app.name) stays "Flux" on purpose:
//  Electron names the keychain entry that decrypts cookies and saved
//  passwords ("Flux Safe Storage") and the user-agent token the Google
//  sign-in fix was measured with after it.  Renaming it would sign
//  everyone out and orphan the vault.  Same for the bundle id, `flux:` IPC
//  channels and window.flux.
// ───────────────────────────────────────────────────────────────────
const { app, BrowserWindow, dialog, ipcMain, globalShortcut, nativeTheme, session, powerMonitor } = require("electron")
const path = require("node:path")
const { profiles } = require("./profiles")   // first: store/history/vault read their dir from it
const { store } = require("./store")
const { registerIpc } = require("./ipc")
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
const { registerLensIpc } = require("./lens")
const { registerWeatherIpc } = require("./weather")
const { chats } = require("./assistant/chats")

const isDev = process.argv.includes("--dev")
const ROOT = path.resolve(__dirname, "..", "..")
const WEBVIEW_PRELOAD = path.join(__dirname, "..", "preload", "webview-preload.js")

// perf: hardware acceleration must be decided before app is ready
if (store.get("perf.hardwareAccel") === false) app.disableHardwareAcceleration()

let win = null

// one Comet per data folder: opening it again (Spotlight, the Dock, npm start
// beside the installed app) brings the window forward instead of a second
// copy fighting over the same profile files
if (!app.requestSingleInstanceLock()) app.exit(0)
app.on("second-instance", () => {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show(); win.focus()
})

// Comet as the default browser: macOS hands over links clicked in other apps
// as open-url, sometimes before the window exists.  They wait here until the
// UI asks for them (flux:open-urls:take), then go straight to a new tab.
const IS_FLUX_APP = /\/(Comet|Flux)\.app\/Contents\/MacOS\//.test(process.execPath)   // installed bundle, not `npm start`
const pendingUrls = []
let uiReady = false
function openFromOutside (url) {
  if (!/^https?:\/\//i.test(url ?? "")) return
  if (win && !win.isDestroyed() && uiReady) {
    win.webContents.send("flux:open-tab", { url })
    if (win.isMinimized()) win.restore()
    win.show(); win.focus()
    return
  }
  pendingUrls.push(url)
  if (app.isReady() && (!win || win.isDestroyed())) createWindow()
}
app.on("open-url", (e, url) => { e.preventDefault(); openFromOutside(url) })

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
  uiReady = false
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
      webviewTag: true,             // <webview> is how Comet renders the web
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
  // native fullscreen: no traffic lights and nothing to drag, so the chrome re-lays itself out
  const tellFullscreen = () => { if (win && !win.isDestroyed()) win.webContents.send("flux:win:fullscreen", win.isFullScreen()) }
  win.on("enter-full-screen", tellFullscreen)
  win.on("leave-full-screen", tellFullscreen)
  // "active" = Comet is the app in front and its window is showing; the UI stops
  // every always-running effect (ambient, Style backdrop, widget timers) when it isn't
  const tellActive = () => { if (win && !win.isDestroyed()) win.webContents.send("flux:win:active", win.isFocused() && win.isVisible() && !win.isMinimized()) }
  for (const ev of ["focus", "blur", "show", "hide", "minimize", "restore"]) win.on(ev, tellActive)
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
async function prepareSession (ses, { extensions = true } = {}) {
  if (prepared.has(ses)) return ses
  prepared.add(ses)
  // drop the Electron/app tokens so sites see a normal Chrome (fixes "unsupported browser" walls)
  ses.setUserAgent(ses.getUserAgent().replace(/\s(flux-browser|Flux|Comet|Electron)\/\S+/g, ""))
  initShield(ses, () => win)
  initDownloads(ses, () => win)
  initPermissions(ses, () => win)
  if (extensions) try { await loadSavedExtensions(ses) } catch (e) { console.error("[ext]", e.message) }
  return ses
}

// a new profile starts with the current look and app settings, but its own
// bookmarks, tabs, history, Home and logins; its color becomes the accent
const SEED_KEYS = ["theme", "layout", "motion", "audio", "perf", "ai", "general", "privacy", "window"]
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
    let p
    try { p = profiles.update(id, patch) } catch (e) { return { ok: false, text: e.message } }
    buildMenu(() => win)
    return p ? { ok: true, profile: p, ...listing() } : { ok: false, text: "No such profile." }
  })
  // choose a picture (PNG, JPEG, HEIC…) for the sheet's Move & Scale step; saved on Done
  ipcMain.handle("flux:profiles:pickPicture", async () => {
    const r = await dialog.showOpenDialog(win, {
      title: "Choose a profile picture",
      defaultPath: app.getPath("pictures"),
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "heic", "gif", "tif", "tiff", "bmp"] }]
    })
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true }
    // the whole image (≤1600px), so the sheet can move & scale it; nothing keeps pointing at the file
    try { return { ok: true, dataUrl: `data:image/png;base64,${profiles.fitPng(r.filePaths[0]).toString("base64")}` } } catch (e) { return { ok: false, text: e.message } }
  })
  ipcMain.handle("flux:profiles:pictureOriginal", (_e, id) => profiles.original(String(id)))
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

  // the web lives in the active profile's persistent partition — every browsing feature hooks it
  await prepareSession(profiles.session())
  // private tabs: one in-memory partition (no "persist:"), same shield / downloads /
  // permission hooks, no extensions.  Nothing it stores survives quitting Comet, and
  // the UI clears it as soon as the last private tab closes.
  const privateSession = () => session.fromPartition("comet-private")
  await prepareSession(privateSession(), { extensions: false })
  ipcMain.handle("flux:private:clear", async () => {
    try { await privateSession().clearStorageData(); await privateSession().clearCache() } catch (e) { console.error("[private] clear", e.message) }
  })
  const getWin = () => win

  registerIpc({ getWin, ROOT, WEBVIEW_PRELOAD })
  registerProfileIpc()
  registerBrowserIpc({ getSes: () => profiles.session() })
  registerAssistantIpc()
  registerVoiceIpc()
  registerOllamaIpc()
  registerEasyFilesIpc(getWin)
  registerWallpaperIpc(getWin)
  registerLensIpc(getWin)
  registerWeatherIpc()
  ipcMain.handle("flux:open-urls:take", () => { uiReady = true; return pendingUrls.splice(0) })
  const defaultBrowser = () => ({ can: IS_FLUX_APP, is: IS_FLUX_APP && app.isDefaultProtocolClient("http") && app.isDefaultProtocolClient("https") })
  ipcMain.handle("flux:default-browser:get", defaultBrowser)
  ipcMain.handle("flux:default-browser:set", () => {
    // macOS shows its own "change your default web browser?" prompt; the answer lands later
    if (IS_FLUX_APP) { app.setAsDefaultProtocolClient("http"); app.setAsDefaultProtocolClient("https") }
    return defaultBrowser()
  })
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
  // productName stays "Flux" (keychain), so name the About panel ourselves
  app.setAboutPanelOptions({ applicationName: "Comet", applicationVersion: app.getVersion(), version: "" })
  buildMenu(getWin)

  // battery saver follows the power source
  ipcMain.handle("flux:power:battery", () => powerMonitor.isOnBatteryPower())
  const tellPower = () => { if (win && !win.isDestroyed()) win.webContents.send("flux:power", powerMonitor.isOnBatteryPower()) }
  powerMonitor.on("on-battery", tellPower)
  powerMonitor.on("on-ac", tellPower)

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
    if (win && !win.isDestroyed()) win.webContents.send("flux:open-tab", { url, background, from: contents.id })
    return { action: "deny" }
  })
  attachContextMenu(contents, () => win)
})
