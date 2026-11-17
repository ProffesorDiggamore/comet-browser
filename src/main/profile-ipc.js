// ───────────────────────────────────────────────────────────────────
//  profile-ipc.js — the renderer's profile channels.  "active" in every
//  reply is the asking window's own profile; "open" lists the profiles
//  that have a window.  Profiles can switch this window in place or
//  open in a window of their own (one window per profile).
// ───────────────────────────────────────────────────────────────────
const { app, BrowserWindow, dialog, ipcMain } = require("electron")
const { profiles } = require("./profiles")
const { DEFAULTS } = require("./store")
const { downloads } = require("./downloads")
const C = require("./contexts")
const W = require("./windows")

// a new profile starts with the asking window's look and app settings, but its
// own bookmarks, tabs, history, Home and logins; its color becomes the accent
const SEED_KEYS = ["theme", "layout", "motion", "audio", "perf", "ai", "general", "privacy", "window"]
function seedConfig (store, color) {
  const seed = { meta: { schema: DEFAULTS.meta.schema } }
  for (const k of SEED_KEYS) seed[k] = structuredClone(store.get(k))
  if (color) seed.theme = { ...seed.theme, accent: color, accentCustom: true }
  return seed
}

// Electron sessions can't be destroyed: unload what runs in them and empty
// them before the profile's folders go to the Trash
async function quiesce (ctx) {
  for (const ses of [ctx.session, ctx.privateSession]) {
    try {
      const api = ses.extensions ?? ses
      for (const x of api.getAllExtensions()) try { api.removeExtension(x.id) } catch {}
    } catch {}
  }
  try { await ctx.privateSession.clearStorageData(); await ctx.privateSession.clearCache() } catch {}
  try { await ctx.session.flushStorageData() } catch {}
}

function closeAndWait (win) {
  return new Promise((resolve) => {
    if (!C.alive(win)) return resolve()
    win.once("closed", resolve)
    win.close()
  })
}

function registerProfileIpc () {
  const listing = (e) => ({
    active: C.ctxFor(e).id,
    open: W.liveCtxs().map((c) => c.id),
    list: profiles.list().filter((p) => !C.removing.has(p.id))
  })
  const changed = () => { W.rebuildMenus(); W.broadcastProfiles() }

  ipcMain.handle("flux:profiles:list", (e) => listing(e))

  // open: true → this window becomes the new profile (as before);
  // open: "window" → it gets a window of its own
  ipcMain.handle("flux:profiles:create", (e, patch, { open } = {}) => {
    const p = profiles.create(patch, seedConfig(C.ctxFor(e).store, patch?.color))
    changed()
    let r = { ok: true }
    if (open === "window") r = W.openProfileWindow(p.id)
    else if (open) r = W.switchWindowProfile(W.targetWin(BrowserWindow.fromWebContents(e.sender)), p.id)
    return { ...r, ok: true, profile: p, ...listing(e) }
  })
  ipcMain.handle("flux:profiles:update", (e, id, patch) => {
    let p
    try { p = profiles.update(id, patch) } catch (err) { return { ok: false, text: err.message } }
    changed()
    return p ? { ok: true, profile: p, ...listing(e) } : { ok: false, text: "No such profile." }
  })
  // choose a picture (PNG, JPEG, HEIC…) for the sheet's Move & Scale step; saved on Done
  ipcMain.handle("flux:profiles:pickPicture", async (e) => {
    const r = await dialog.showOpenDialog(C.winFor(e), {
      title: "Choose a profile picture",
      defaultPath: app.getPath("pictures"),
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "heic", "gif", "tif", "tiff", "bmp"] }]
    })
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true }
    // the whole image (≤1600px), so the sheet can move & scale it; nothing keeps pointing at the file
    try { return { ok: true, dataUrl: `data:image/png;base64,${profiles.fitPng(r.filePaths[0]).toString("base64")}` } } catch (err) { return { ok: false, text: err.message } }
  })
  ipcMain.handle("flux:profiles:pictureOriginal", (_e, id) => profiles.original(String(id)))

  ipcMain.handle("flux:profiles:remove", async (e, id) => {
    id = String(id)
    if (id === C.ctxFor(e).id) return { ok: false, text: "Switch this window to another profile first.", ...listing(e) }
    if (id === profiles.DEFAULT_ID) return { ok: false, text: "The first profile can be renamed but not removed.", ...listing(e) }
    if (!C.usable(id)) return { ok: false, text: "No such profile.", ...listing(e) }
    // from here on nothing may open or re-create it; the pickers drop it now
    C.removing.add(id)
    changed()
    try {
      const ctx = C.contexts.get(id)
      if (ctx) {
        await closeAndWait(ctx.win)     // its renderer saves its tabs first; they go to the Trash with it
        downloads.cancelAll(ctx)
        ctx.dispose()
        await quiesce(ctx)
      }
      C.contexts.delete(id)          // disposed: a later contextFor builds a fresh one
      const r = await profiles.remove(id)
      return { ...r, ...listing(e) }
    } finally {
      C.removing.delete(id)
      W.persistOpen()
      changed()
    }
  })
  // drag to reorder: the pickers send the ids they show; one being removed
  // (hidden from them) keeps its place at the end until it's gone
  ipcMain.handle("flux:profiles:reorder", (e, ids) => {
    if (!Array.isArray(ids) || ids.length > 500) return { ok: false, text: "Couldn't reorder profiles.", ...listing(e) }
    ids = ids.map(String)
    const r = profiles.reorder([...ids, ...[...C.removing].filter((id) => profiles.get(id) && !ids.includes(id))])
    if (r.changed) changed()
    return r.ok ? { ok: true, ...listing(e) } : { ok: false, text: "Couldn't reorder profiles.", ...listing(e) }
  })
  ipcMain.handle("flux:profiles:switch", (e, id) => W.switchWindowProfile(W.targetWin(BrowserWindow.fromWebContents(e.sender)), String(id)))
  ipcMain.handle("flux:profiles:openWindow", (_e, id) => W.openProfileWindow(String(id)))
}

module.exports = { registerProfileIpc }
