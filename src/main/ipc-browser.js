// ───────────────────────────────────────────────────────────────────
//  ipc-browser.js — v0.4 channels: history, downloads, shield stats,
//  screenshots to disk, and browsing-data clearing for the web session.
// ───────────────────────────────────────────────────────────────────
const { ipcMain, app, shell, clipboard, nativeImage, BrowserWindow } = require("electron")
const fs = require("node:fs")
const path = require("node:path")
const { downloads } = require("./downloads")
const { shieldStats } = require("./shield")

// ctxFor(e): the profile context of the window that asked
function registerBrowserIpc ({ ctxFor }) {
  // ---- history (this window's profile) -----------------------------
  // (not from a window mid profile-switch: its old UI would record into the new profile)
  const switching = (e) => !!BrowserWindow.fromWebContents(e.sender)?.switching
  ipcMain.on("flux:history:record", (e, entry) => { const ctx = ctxFor(e); if (!switching(e) && ctx.store.get("privacy.recordHistory") !== false) ctx.history.record(entry ?? {}) })
  ipcMain.on("flux:history:title", (e, entry) => ctxFor(e).history.title(entry ?? {}))
  ipcMain.handle("flux:history:search", (e, opts) => ctxFor(e).history.search(opts ?? {}))
  ipcMain.handle("flux:history:remove", (e, url) => ctxFor(e).history.remove(url))
  ipcMain.handle("flux:history:clear", (e, opts) => ctxFor(e).history.clear(opts ?? {}))

  // ---- downloads (this window's profile) ---------------------------
  ipcMain.handle("flux:dl:list", (e) => downloads.list(ctxFor(e)))
  ipcMain.handle("flux:dl:action", (e, id, verb) => downloads.action(ctxFor(e), id, verb))
  ipcMain.handle("flux:dl:clear", (e) => downloads.clearFinished(ctxFor(e)))

  // ---- shield -------------------------------------------------------
  ipcMain.handle("flux:shield:stats", () => shieldStats())

  // ---- screenshots --------------------------------------------------
  ipcMain.handle("flux:shot:save", (_e, { dataUrl, name }) => {
    try {
      const img = nativeImage.createFromDataURL(dataUrl)
      if (img.isEmpty()) return { ok: false, text: "Empty image" }
      const safe = String(name || "Comet screenshot").replace(/[/\\:*?"<>|]+/g, "-").slice(0, 80)
      let p = path.join(app.getPath("downloads"), `${safe}.png`)
      for (let i = 1; fs.existsSync(p); i++) p = path.join(app.getPath("downloads"), `${safe} (${i}).png`)
      fs.writeFileSync(p, img.toPNG())
      clipboard.writeImage(img)
      return { ok: true, path: p }
    } catch (e) { return { ok: false, text: e.message } }
  })
  ipcMain.handle("flux:shot:reveal", (_e, p) => { if (p) shell.showItemInFolder(p) })

  // ---- browsing data (the web session, not the UI's) -----------------
  ipcMain.handle("flux:web:clearData", async (e, kinds) => {
    const ctx = ctxFor(e)
    try {
      const storages = []
      if (kinds?.cookies) storages.push("cookies")
      if (kinds?.storage) storages.push("localstorage", "indexdb", "websql", "filesystem", "serviceworkers", "cachestorage")
      const ses = ctx.session
      if (kinds?.cache) await ses.clearCache()
      if (storages.length) await ses.clearStorageData({ storages })
      if (kinds?.history) ctx.history.clear()
      return { ok: true }
    } catch (e) { return { ok: false, text: e.message } }
  })
}

module.exports = { registerBrowserIpc }
