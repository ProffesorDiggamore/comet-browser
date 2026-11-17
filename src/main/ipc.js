// ───────────────────────────────────────────────────────────────────
//  ipc.js — every channel the renderer can call, in one place.
//  Naming: "flux:<area>:<verb>".  Handlers never throw across the
//  boundary; they return { ok, ... } shapes.
// ───────────────────────────────────────────────────────────────────
const { ipcMain, dialog, shell, session, app, BrowserWindow } = require("electron")
const fs = require("node:fs")
const path = require("node:path")
const { secrets, appPrefs, DEFAULTS } = require("./store")
const { addExtension, removeExtension, listExtensions } = require("./extensions")
const importer = require("./import-browser")
const { vault } = require("./vault")
const { contexts } = require("./contexts")

// every handler resolves the window/profile it came from: ctxFor(e) is the
// sender's profile context, winFor(e) its window (dialog parent)
function registerIpc ({ ctxFor, winFor, ROOT, restart }) {
  // a window mid profile-switch still runs the old UI for a moment: its
  // writes would land in the new profile, so they are dropped (the current
  // value comes back, so the renderer's promise still settles)
  const switching = (e) => !!BrowserWindow.fromWebContents(e.sender)?.switching

  // ---- config -------------------------------------------------------
  ipcMain.handle("flux:config:all", (e) => ctxFor(e).store.all())
  ipcMain.handle("flux:config:defaults", () => DEFAULTS)
  ipcMain.handle("flux:config:get", (e, key) => ctxFor(e).store.get(key))
  ipcMain.handle("flux:config:set", (e, key, value) => {
    const ctx = ctxFor(e)
    if (switching(e)) return ctx.store.get(key)
    ctx.store.set(key, value)
    send(ctx.win, "flux:config:changed", { key, value })
    syncAppPrefs(ctx)
    return ctx.store.get(key)
  })
  ipcMain.handle("flux:config:merge", (e, partial) => {
    const ctx = ctxFor(e)
    if (switching(e)) return ctx.store.all()
    ctx.store.merge(partial)
    send(ctx.win, "flux:config:changed", { key: "*", value: null })
    syncAppPrefs(ctx)
    return ctx.store.all()
  })
  // the renderer's last tab snapshot, synchronously on window close / quit
  ipcMain.on("flux:session:save", (e, snapshot) => {
    try {
      const ctx = ctxFor(e)
      if (!switching(e) && snapshot && typeof snapshot === "object") { ctx.store.set("session", snapshot); ctx.store.saveNow() }
    } catch (err) { console.error("[session] save", err.message) }
    e.returnValue = true
  })

  // ---- secrets (write-only from renderer; values never read back) ---
  ipcMain.handle("flux:secret:set", (_e, name, value) => ({ ok: secrets.setSecret(name, value) }))
  ipcMain.handle("flux:secret:status", () => ({ anthropic: secrets.hasSecret("anthropic"), openai: secrets.hasSecret("openai"), gemini: secrets.hasSecret("gemini") }))

  // ---- file pickers ----------------------------------------------
  ipcMain.handle("flux:pick:image", async (e) => {
    const win = winFor(e)
    const r = await dialog.showOpenDialog(win, {
      title: "Choose an image",
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"] }]
    })
    if (r.canceled || !r.filePaths[0]) return { ok: false }
    try {
      const p = r.filePaths[0]
      const ext = path.extname(p).slice(1).toLowerCase()
      const mime = ext === "svg" ? "image/svg+xml" : ext === "jpg" ? "image/jpeg" : `image/${ext}`
      const b64 = fs.readFileSync(p).toString("base64")
      return { ok: true, dataUrl: `data:${mime};base64,${b64}`, name: path.basename(p) }
    } catch (e) {
      return { ok: false, text: e.message }
    }
  })

  ipcMain.handle("flux:pick:folder", async (e, title) => {
    const r = await dialog.showOpenDialog(winFor(e), { title: title ?? "Choose a folder", properties: ["openDirectory"] })
    return r.canceled ? { ok: false } : { ok: true, path: r.filePaths[0] }
  })

  ipcMain.handle("flux:pick:json", async (e, { title, defaultName, save, data }) => {
    const win = winFor(e)
    if (save) {
      const r = await dialog.showSaveDialog(win, { title, defaultPath: defaultName, filters: [{ name: "JSON", extensions: ["json"] }] })
      if (r.canceled) return { ok: false }
      fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2))
      return { ok: true, path: r.filePath }
    }
    const r = await dialog.showOpenDialog(win, { title, properties: ["openFile"], filters: [{ name: "JSON", extensions: ["json"] }] })
    if (r.canceled || !r.filePaths[0]) return { ok: false }
    try { return { ok: true, data: JSON.parse(fs.readFileSync(r.filePaths[0], "utf8")) } }
    catch (e) { return { ok: false, text: e.message } }
  })

  // ---- extensions ---------------------------------------------
  // ---- extensions (this window's profile session) ------------------
  ipcMain.handle("flux:ext:list", (e) => listExtensions(ctxFor(e).session))
  ipcMain.handle("flux:ext:add", async (e) => {
    const ctx = ctxFor(e)
    const r = await dialog.showOpenDialog(winFor(e), { title: "Pick an unpacked extension folder", properties: ["openDirectory"] })
    if (r.canceled || !r.filePaths[0]) return { ok: false }
    return addExtension(ctx.session, ctx.store, r.filePaths[0])
  })
  ipcMain.handle("flux:ext:remove", (e, id) => { const ctx = ctxFor(e); return removeExtension(ctx.session, ctx.store, id) })

  // ---- window controls / misc (the sender's own window) ------------
  const own = (e) => BrowserWindow.fromWebContents(e.sender)
  ipcMain.handle("flux:win:min", (e) => own(e)?.minimize())
  ipcMain.handle("flux:win:max", (e) => {
    const w = own(e); if (!w) return
    w.isMaximized() ? w.unmaximize() : w.maximize()
  })
  ipcMain.handle("flux:win:close", (e) => own(e)?.close())
  ipcMain.handle("flux:win:is-fullscreen", (e) => !!own(e)?.isFullScreen())
  ipcMain.handle("flux:open-external", (_e, url) => { if (/^https?:/.test(url ?? "")) shell.openExternal(url) })
  ipcMain.handle("flux:reload-ui", (e) => { ctxFor(e).store.saveNow(); e.sender.reloadIgnoringCache() })
  ipcMain.handle("flux:paths:info", (e) => ({ root: ROOT, userData: app.getPath("userData"), config: ctxFor(e).store.paths.CONFIG_PATH, version: app.getVersion() }))

  // ---- optimization / maintenance --------------------------------
  // app:clearData targets defaultSession: the Comet UI's own storage, which
  // every window shares (the web partitions are cleared by web:clearData)
  ipcMain.handle("flux:app:metrics", () => {
    try {
      return app.getAppMetrics().map((m) => ({
        pid: m.pid,
        type: m.type,
        name: m.name ?? m.serviceName ?? "",
        cpu: Math.round((m.cpu?.percentCPUUsage ?? 0) * 10) / 10,
        memMB: Math.round((m.memory?.workingSetSize ?? 0) / 1024)
      }))
    } catch { return [] }
  })
  ipcMain.handle("flux:app:clearData", async (_e, kinds) => {
    try {
      const storages = []
      if (kinds?.cache) storages.push("shadercache", "serviceworkers", "cachestorage")
      if (kinds?.cookies) storages.push("cookies")
      if (kinds?.storage) storages.push("localstorage", "indexdb", "websql", "filesystem")
      if (kinds?.cache) await session.defaultSession.clearCache()
      if (storages.length) await session.defaultSession.clearStorageData({ storages })
      return { ok: true }
    } catch (e) { return { ok: false, text: e.message } }
  })
  ipcMain.handle("flux:app:restart", () => restart())

  // ---- browser import (Opera GX etc.) ---------------------------
  ipcMain.handle("flux:import:sources", () => importer.listSources())
  ipcMain.handle("flux:import:run", async (e, { sourceId, kinds }) => {
    const pid = ctxFor(e).id
    const result = { passwords: null, bookmarks: [], history: [], errors: [] }
    if (kinds?.passwords) {
      const r = importer.readLogins(sourceId)
      if (r.ok) result.passwords = vault.addMany(pid, r.entries, sourceId)
      else result.errors.push(`Passwords: ${r.error}`)
    }
    if (kinds?.bookmarks) {
      const r = importer.readBookmarks(sourceId)
      if (r.ok) result.bookmarks = r.bookmarks
      else result.errors.push(`Bookmarks: ${r.error}`)
    }
    if (kinds?.history) {
      const r = importer.readHistory(sourceId)
      if (r.ok) result.history = r.history
      else result.errors.push(`History: ${r.error}`)
    }
    return result
  })

  // ---- password vault ---------------------------------------
  // ---- password vault: the sender's profile only ---------------
  const pid = (e) => ctxFor(e).id
  ipcMain.handle("flux:vault:list", (e) => vault.list(pid(e)))
  ipcMain.handle("flux:vault:reveal", (e, id) => vault.reveal(pid(e), id))
  ipcMain.handle("flux:vault:add", (e, entry) => vault.add(pid(e), entry ?? {}))
  ipcMain.handle("flux:vault:remove", (e, id) => vault.remove(pid(e), id))
  ipcMain.handle("flux:vault:clear", (e) => vault.clear(pid(e)))
  ipcMain.handle("flux:vault:match", (e, url) => vault.match(pid(e), url))
  ipcMain.handle("flux:vault:match-all", (e, url) => vault.matchAll(String(url ?? ""), pid(e)))
  // fill only from the window's own profile, whatever id the renderer passes
  ipcMain.handle("flux:vault:fill", (e, profileId, id) => (String(profileId) === pid(e) ? vault.fill(pid(e), String(id)) : null))
  ipcMain.handle("flux:vault:known", (e, url, username, password) => vault.known(String(url ?? ""), String(username ?? ""), String(password ?? ""), pid(e)))
}

function send (w, channel, payload) {
  if (w && !w.isDestroyed()) w.webContents.send(channel, payload)
}

// hardware acceleration is one switch for the whole app: a change in any
// window is saved app-wide and reaches every other profile's settings
function syncAppPrefs (ctx) {
  const hw = ctx.store.get("perf.hardwareAccel")
  if (typeof hw !== "boolean" || appPrefs.get("hardwareAccel") === hw) return
  appPrefs.set("hardwareAccel", hw)
  for (const other of contexts.values()) {
    if (other === ctx || other.disposed || other.store.get("perf.hardwareAccel") === hw) continue
    other.store.set("perf.hardwareAccel", hw)
    send(other.win, "flux:config:changed", { key: "perf.hardwareAccel", value: hw })
  }
}

module.exports = { registerIpc }
