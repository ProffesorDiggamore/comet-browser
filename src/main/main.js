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
const { app, BrowserWindow, ipcMain, globalShortcut, nativeTheme, powerMonitor } = require("electron")
const path = require("node:path")
const { profiles } = require("./profiles")   // first: it may move the data folder (Flux → Comet)
const { appPrefs } = require("./store")
const C = require("./contexts")
const W = require("./windows")
const A = require("./appearance")
const { registerIpc } = require("./ipc")
const { registerBrowserIpc } = require("./ipc-browser")
const { registerProfileIpc } = require("./profile-ipc")
const { registerAssistantIpc } = require("./assistant/agent")
const { registerVoiceIpc } = require("./assistant/voice")
const { registerOllamaIpc } = require("./assistant/ollama")
const { attachContextMenu } = require("./contextmenu")
const { registerEasyFilesIpc } = require("./easyfiles")
const { registerWallpaperIpc } = require("./wallpaper")
const { registerLensIpc } = require("./lens")
const { registerWeatherIpc } = require("./weather")
const { registerSpotifyIpc } = require("./spotify")
const { registerSuggestIpc } = require("./suggest")

const ROOT = path.resolve(__dirname, "..", "..")
const WEBVIEW_PRELOAD = path.join(__dirname, "..", "preload", "webview-preload.js")

// Several profiles can each have a window at the same time (one window per
// profile).  contexts.js holds each profile's data and sessions; windows.js
// the windows; every IPC handler resolves the profile from its sender.

// perf: hardware acceleration is app-wide and must be decided before ready.
// It used to live in each profile's config: the first read adopts the
// last-used profile's choice.
let hwAccel = appPrefs.get("hardwareAccel")
if (typeof hwAccel !== "boolean") {
  hwAccel = C.contextFor(profiles.activeId())?.store.get("perf.hardwareAccel") !== false
  appPrefs.set("hardwareAccel", hwAccel)
}
if (hwAccel === false) app.disableHardwareAcceleration()

// one Comet per data folder: opening it again (Spotlight, the Dock, npm start
// beside the installed app) brings a window forward instead of a second
// copy fighting over the same profile files
if (!app.requestSingleInstanceLock()) app.exit(0)
app.on("second-instance", () => {
  if (!app.isReady() || W.isRestoring()) return
  const w = W.lastFocusedWin()
  if (w) W.focusWin(w)
  else W.openProfileWindow(profiles.activeId())
})

// Comet as the default browser: macOS hands over links clicked in other apps
// as open-url, sometimes before any window exists (or before the app is
// ready).  They go to the last-focused profile's window; until its UI asks
// for them (flux:open-urls:take) they wait here.
const IS_FLUX_APP = /\/(Comet|Flux)\.app\/Contents\/MacOS\//.test(process.execPath)   // installed bundle, not `npm start`
let pendingUrls = []   // { url, profileId }
function openFromOutside (url) {
  if (!/^https?:\/\//i.test(url ?? "")) return
  const ctx = C.contextFor(profiles.activeId()) ?? C.contextFor(profiles.DEFAULT_ID)
  if (C.alive(ctx.win) && ctx.uiReady) {
    ctx.win.webContents.send("flux:open-tab", { url })
    W.focusWin(ctx.win)
    return
  }
  pendingUrls.push({ url, profileId: ctx.id })
  // before ready, restoreWindows opens the target and its take() picks the URL up
  if (app.isReady() && !W.isRestoring() && !C.alive(ctx.win)) W.openProfileWindow(ctx.id)
}
app.on("open-url", (e, url) => { e.preventDefault(); openFromOutside(url) })

// expose resolved paths to preload synchronously: this window's profile
ipcMain.on("flux:paths", (e) => {
  const ctx = C.ctxFor(e)
  e.returnValue = {
    root: ROOT,
    userData: app.getPath("userData"),
    webviewPreload: WEBVIEW_PRELOAD,
    fluxSelf: ROOT,
    partition: ctx.partition,                 // <webview> partition = this profile's cookies & site data
    privatePartition: ctx.privatePartition,   // its private tabs (in memory, per profile)
    profile: profiles.list().find((p) => p.id === ctx.id) ?? null
  }
})

// restart keeps every window: a normal quit lets each window save its tabs
function restart () {
  C.flushAll()
  W.persistOpen()
  app.relaunch()
  app.quit()
  setTimeout(() => app.exit(0), 5000).unref?.()   // only if the quit was blocked
}

app.whenReady().then(async () => {
  const deps = { ctxFor: C.ctxFor, winFor: C.winFor }
  registerIpc({ ...deps, ROOT, restart })
  registerProfileIpc()
  registerBrowserIpc(deps)
  registerAssistantIpc(deps)
  registerVoiceIpc()
  registerOllamaIpc(deps)
  registerEasyFilesIpc(deps)
  registerWallpaperIpc(deps)
  registerLensIpc(deps)
  registerWeatherIpc()
  registerSpotifyIpc()
  registerSuggestIpc(deps)

  // private tabs: each profile has one in-memory partition (no "persist:"), with
  // the same shield / downloads / permission hooks and no extensions.  Nothing
  // it stores survives the window, and the UI clears it when its last private tab closes.
  ipcMain.handle("flux:private:clear", async (e) => {
    const ses = C.ctxFor(e).privateSession
    try { await ses.clearStorageData(); await ses.clearCache() } catch (err) { console.error("[private] clear", err.message) }
  })
  ipcMain.handle("flux:open-urls:take", (e) => {
    const ctx = C.ctxFor(e)
    ctx.uiReady = true
    const mine = []
    const rest = []
    for (const p of pendingUrls) {
      // aimed here, or at a profile with no window to take it
      if (p.profileId === ctx.id || !C.alive(C.contexts.get(p.profileId)?.win)) mine.push(p.url)
      else rest.push(p)
    }
    pendingUrls = rest
    return mine
  })
  const defaultBrowser = () => ({ can: IS_FLUX_APP, is: IS_FLUX_APP && app.isDefaultProtocolClient("http") && app.isDefaultProtocolClient("https") })
  ipcMain.handle("flux:default-browser:get", defaultBrowser)
  ipcMain.handle("flux:default-browser:set", () => {
    // macOS shows its own "change your default web browser?" prompt; the answer lands later
    if (IS_FLUX_APP) { app.setAsDefaultProtocolClient("http"); app.setAsDefaultProtocolClient("https") }
    return defaultBrowser()
  })
  ipcMain.handle("flux:win:vibrancy", (e, on) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w || w.isDestroyed()) return
    w.setVibrancy(on ? "under-window" : null)
    w.setBackgroundColor(on ? "#00000000" : A.solidBgFor(C.ctxFor(e)))
  })
  // a window's theme mode changed: light/dark is per window (appearance.js).
  // Answers the native glass's mode, which the UI tints against.
  ipcMain.handle("flux:win:appearance", () => {
    A.applyAppearance()
    return nativeTheme.shouldUseDarkColors
  })
  // productName stays "Flux" (keychain), so name the About panel ourselves
  app.setAboutPanelOptions({ applicationName: "Comet", applicationVersion: app.getVersion(), version: "" })

  // battery saver follows the power source
  ipcMain.handle("flux:power:battery", () => powerMonitor.isOnBatteryPower())
  const tellPower = () => { for (const c of W.liveCtxs()) c.win.webContents.send("flux:power", powerMonitor.isOnBatteryPower()) }
  powerMonitor.on("on-battery", tellPower)
  powerMonitor.on("on-ac", tellPower)

  // the native window glass AND prefers-color-scheme inside pages
  A.initAppearance()
  W.rebuildMenus()
  // pop-ups don't count: only a profile window keeps Comet "open"
  app.on("activate", () => { if (!W.isRestoring() && !W.liveCtxs().length) W.openProfileWindow(profiles.activeId()) })
  try { await W.restoreWindows() } catch (e) { console.error("[windows] restore", e); if (!W.liveCtxs().length) W.openProfileWindow(profiles.activeId()) }
})

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit() })
app.on("will-quit", () => { globalShortcut.unregisterAll(); C.flushAll() })

// links that open a new window become tabs of the window they came from;
// sized pop-ups (window.open with features) stay real windows, because
// "Sign in with Google" and other OAuth pop-ups hand the result back through
// window.opener, which a tab doesn't have.  The pop-up inherits its opener's
// partition, so it belongs to the same profile.
app.on("web-contents-created", (_e, contents) => {
  C.notePrivateUse(contents)
  contents.setWindowOpenHandler(({ url, disposition }) => {
    // checked per call: a new window's UI is registered only after it's created
    const isUi = C.uiOwner.has(contents.id)
    const win = C.windowForContents(contents)
    if (disposition === "new-window" && /^https?:/.test(url) && !isUi) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          parent: win ?? undefined,
          backgroundColor: A.solidBgFor(C.ctxForContents(contents)),
          autoHideMenuBar: true,
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
        }
      }
    }
    const background = disposition === "background-tab"
    if (win) win.webContents.send("flux:open-tab", { url, background, from: contents.id })
    return { action: "deny" }
  })
  attachContextMenu(contents, () => C.windowForContents(contents))
})
