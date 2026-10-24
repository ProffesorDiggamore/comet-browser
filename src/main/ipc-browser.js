// ───────────────────────────────────────────────────────────────────
//  ipc-browser.js — v0.4 channels: history, downloads, shield stats,
//  screenshots to disk, and browsing-data clearing for the web session.
// ───────────────────────────────────────────────────────────────────
const { ipcMain, app, shell, clipboard, nativeImage } = require("electron")
const fs = require("node:fs")
const path = require("node:path")
const { history } = require("./history")
const { downloads } = require("./downloads")
const { shieldStats } = require("./shield")
const { store } = require("./store")

function registerBrowserIpc ({ ses }) {
  // ---- history ------------------------------------------------------
  ipcMain.on("flux:history:record", (_e, entry) => { if (store.get("privacy.recordHistory") !== false) history.record(entry ?? {}) })
  ipcMain.on("flux:history:title", (_e, entry) => history.title(entry ?? {}))
  ipcMain.handle("flux:history:search", (_e, opts) => history.search(opts ?? {}))
  ipcMain.handle("flux:history:remove", (_e, url) => history.remove(url))
  ipcMain.handle("flux:history:clear", (_e, opts) => history.clear(opts ?? {}))

  // ---- downloads ----------------------------------------------------
  ipcMain.handle("flux:dl:list", () => downloads.list())
  ipcMain.handle("flux:dl:action", (_e, id, verb) => downloads.action(id, verb))
  ipcMain.handle("flux:dl:clear", () => downloads.clearFinished())

  // ---- shield -------------------------------------------------------
  ipcMain.handle("flux:shield:stats", () => shieldStats())

  // ---- screenshots --------------------------------------------------
  ipcMain.handle("flux:shot:save", (_e, { dataUrl, name }) => {
    try {
      const img = nativeImage.createFromDataURL(dataUrl)
      if (img.isEmpty()) return { ok: false, text: "Empty image" }
      const safe = String(name || "Flux screenshot").replace(/[/\\:*?"<>|]+/g, "-").slice(0, 80)
      let p = path.join(app.getPath("downloads"), `${safe}.png`)
      for (let i = 1; fs.existsSync(p); i++) p = path.join(app.getPath("downloads"), `${safe} (${i}).png`)
      fs.writeFileSync(p, img.toPNG())
      clipboard.writeImage(img)
      return { ok: true, path: p }
    } catch (e) { return { ok: false, text: e.message } }
  })
  ipcMain.handle("flux:shot:reveal", (_e, p) => { if (p) shell.showItemInFolder(p) })

  // ---- browsing data (the web session, not the UI's) -----------------
  ipcMain.handle("flux:web:clearData", async (_e, kinds) => {
    try {
      const storages = []
      if (kinds?.cookies) storages.push("cookies")
      if (kinds?.storage) storages.push("localstorage", "indexdb", "websql", "filesystem", "serviceworkers", "cachestorage")
      if (kinds?.cache) await ses.clearCache()
      if (storages.length) await ses.clearStorageData({ storages })
      if (kinds?.history) history.clear()
      return { ok: true }
    } catch (e) { return { ok: false, text: e.message } }
  })
}

module.exports = { registerBrowserIpc }
