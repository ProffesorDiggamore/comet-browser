// ───────────────────────────────────────────────────────────────────
//  ipc.js — every channel the renderer can call, in one place.
//  Naming: "flux:<area>:<verb>".  Handlers never throw across the
//  boundary; they return { ok, ... } shapes.
// ───────────────────────────────────────────────────────────────────
const { ipcMain, dialog, shell, session, app, BrowserWindow } = require("electron")
const fs = require("node:fs")
const path = require("node:path")
const { store } = require("./store")
const { addExtension, removeExtension, listExtensions } = require("./extensions")
const importer = require("./import-browser")
const { vault } = require("./vault")
const { profiles } = require("./profiles")

function registerIpc ({ getWin, ROOT }) {
  // ---- config -------------------------------------------------------
  ipcMain.handle("flux:config:all", () => store.all())
  ipcMain.handle("flux:config:defaults", () => store.DEFAULTS)
  ipcMain.handle("flux:config:get", (_e, key) => store.get(key))
  ipcMain.handle("flux:config:set", (_e, key, value) => {
    store.set(key, value)
    broadcast(getWin, "flux:config:changed", { key, value })
    return store.get(key)
  })
  ipcMain.handle("flux:config:merge", (_e, partial) => {
    store.merge(partial)
    broadcast(getWin, "flux:config:changed", { key: "*", value: null })
    return store.all()
  })

  // ---- secrets (write-only from renderer; values never read back) ---
  ipcMain.handle("flux:secret:set", (_e, name, value) => ({ ok: store.setSecret(name, value) }))
  ipcMain.handle("flux:secret:status", () => ({ anthropic: store.hasSecret("anthropic"), openai: store.hasSecret("openai"), gemini: store.hasSecret("gemini") }))

  // ---- file pickers ----------------------------------------------
  ipcMain.handle("flux:pick:image", async () => {
    const win = getWin()
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

  ipcMain.handle("flux:pick:folder", async (_e, title) => {
    const r = await dialog.showOpenDialog(getWin(), { title: title ?? "Choose a folder", properties: ["openDirectory"] })
    return r.canceled ? { ok: false } : { ok: true, path: r.filePaths[0] }
  })

  ipcMain.handle("flux:pick:json", async (_e, { title, defaultName, save, data }) => {
    const win = getWin()
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
  const webSes = () => profiles.session()
  ipcMain.handle("flux:ext:list", () => listExtensions(webSes()))
  ipcMain.handle("flux:ext:add", async () => {
    const r = await dialog.showOpenDialog(getWin(), { title: "Pick an unpacked extension folder", properties: ["openDirectory"] })
    if (r.canceled || !r.filePaths[0]) return { ok: false }
    return addExtension(webSes(), r.filePaths[0])
  })
  ipcMain.handle("flux:ext:remove", (_e, id) => removeExtension(webSes(), id))

  // ---- window controls / misc ------------------------------
  ipcMain.handle("flux:win:min", () => getWin()?.minimize())
  ipcMain.handle("flux:win:max", () => {
    const w = getWin(); if (!w) return
    w.isMaximized() ? w.unmaximize() : w.maximize()
  })
  ipcMain.handle("flux:win:close", () => getWin()?.close())
  ipcMain.handle("flux:win:is-fullscreen", () => !!getWin()?.isFullScreen())
  ipcMain.handle("flux:open-external", (_e, url) => { if (/^https?:/.test(url ?? "")) shell.openExternal(url) })
  ipcMain.handle("flux:reload-ui", () => { store.saveNow(); getWin()?.webContents.reloadIgnoringCache() })
  ipcMain.handle("flux:paths:info", () => ({ root: ROOT, userData: app.getPath("userData"), config: store.paths.CONFIG_PATH }))

  // ---- optimization / maintenance --------------------------------
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
  ipcMain.handle("flux:app:restart", () => { app.relaunch(); app.exit(0) })

  // ---- browser import (Opera GX etc.) ---------------------------
  ipcMain.handle("flux:import:sources", () => importer.listSources())
  ipcMain.handle("flux:import:run", async (_e, { sourceId, kinds }) => {
    const result = { passwords: null, bookmarks: [], history: [], errors: [] }
    if (kinds?.passwords) {
      const r = importer.readLogins(sourceId)
      if (r.ok) result.passwords = vault.addMany(r.entries, sourceId)
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
  ipcMain.handle("flux:vault:list", () => vault.list())
  ipcMain.handle("flux:vault:reveal", (_e, id) => vault.reveal(id))
  ipcMain.handle("flux:vault:add", (_e, entry) => vault.add(entry))
  ipcMain.handle("flux:vault:remove", (_e, id) => vault.remove(id))
  ipcMain.handle("flux:vault:clear", () => vault.clear())
  ipcMain.handle("flux:vault:match", (_e, url) => vault.match(url))
  ipcMain.handle("flux:vault:match-all", (_e, url) => vault.matchAll(String(url ?? "")))
  ipcMain.handle("flux:vault:fill", (_e, profileId, id) => vault.fill(String(profileId), String(id)))
  ipcMain.handle("flux:vault:known", (_e, url, username, password) => vault.known(String(url ?? ""), String(username ?? ""), String(password ?? "")))
}

function broadcast (getWin, channel, payload) {
  const w = getWin()
  if (w && !w.isDestroyed()) w.webContents.send(channel, payload)
}

module.exports = { registerIpc }
