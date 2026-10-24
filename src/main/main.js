// ───────────────────────────────────────────────────────────────────
//  Flux — main process.  Window lifecycle, webview host, IPC wiring,
//  global hotkeys, extension loading.  Local-first: nothing leaves the
//  machine unless the user configures a cloud key.
// ───────────────────────────────────────────────────────────────────
const { app, BrowserWindow, ipcMain, session, globalShortcut, nativeTheme } = require("electron")
const path = require("node:path")
const { store } = require("./store")
const { registerIpc } = require("./ipc")
const { registerShortcuts } = require("./shortcuts")
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

const isDev = process.argv.includes("--dev")
const ROOT = path.resolve(__dirname, "..", "..")
const WEBVIEW_PRELOAD = path.join(__dirname, "..", "preload", "webview-preload.js")

// perf: hardware acceleration must be decided before app is ready
if (store.get("perf.hardwareAccel") === false) app.disableHardwareAcceleration()

let win = null

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
    fluxSelf: ROOT
  }
})

app.whenReady().then(async () => {
  // drives the native window glass AND prefers-color-scheme inside pages
  nativeTheme.themeSource = themeSource()

  // default companion target = Flux's own source, so it can extend itself
  if (!store.get("companion.projectPath")) store.set("companion.projectPath", ROOT)

  // the web lives in its own persistent partition — every browsing feature hooks it
  const webSes = session.fromPartition("persist:flux")
  // drop the Electron/app tokens so sites see a normal Chrome (fixes "unsupported browser" walls)
  webSes.setUserAgent(webSes.getUserAgent().replace(/\s(flux-browser|Flux|Electron)\/\S+/g, ""))
  const getWin = () => win
  initShield(webSes, getWin)
  initDownloads(webSes, getWin)
  initPermissions(webSes, getWin)

  registerIpc({ getWin, ROOT, WEBVIEW_PRELOAD })
  registerBrowserIpc({ ses: webSes })
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

  try { await loadSavedExtensions(webSes) } catch (e) { console.error("[ext]", e.message) }

  createWindow()
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit() })
app.on("will-quit", () => { globalShortcut.unregisterAll(); store.saveNow(); history.flush(); flushChats() })

// harden: block new-window popups into OS browser; route them as tabs instead
app.on("web-contents-created", (_e, contents) => {
  contents.setWindowOpenHandler(({ url, disposition }) => {
    const background = disposition === "background-tab"
    if (win && !win.isDestroyed()) win.webContents.send("flux:open-tab", { url, background })
    return { action: "deny" }
  })
  attachContextMenu(contents, () => win)
})
