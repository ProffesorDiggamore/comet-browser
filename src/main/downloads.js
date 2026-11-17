// ───────────────────────────────────────────────────────────────────
//  downloads.js — tracks every download in the browsing session and
//  streams progress to the UI.  Files land in ~/Downloads (unique name);
//  the UI can pause / resume / cancel / open / reveal.
// ───────────────────────────────────────────────────────────────────
const { app, shell } = require("electron")
const fs = require("node:fs")
const path = require("node:path")

// each profile context keeps its own list (ctx.downloads: id -> { item, info });
// ids stay unique across profiles
let seq = 0

function uniquePath (dir, name) {
  const ext = path.extname(name)
  const base = path.basename(name, ext) || "download"
  let p = path.join(dir, name || "download")
  let i = 1
  while (fs.existsSync(p)) p = path.join(dir, `${base} (${i++})${ext}`)
  return p
}

function snapshot (items, id) {
  const rec = items.get(id)
  if (!rec) return null
  const { item, info } = rec
  let received = info.received
  let total = info.total
  try { received = item.getReceivedBytes(); total = item.getTotalBytes() } catch {}
  return { ...info, received, total }
}

function initDownloads (ses, ctx) {
  const items = ctx.downloads
  const send = (id) => {
    const w = ctx.win
    if (w && !w.isDestroyed()) w.webContents.send("flux:dl:update", snapshot(items, id))
  }

  ses.on("will-download", (_e, item) => {
    const id = `dl_${++seq}`
    const savePath = uniquePath(app.getPath("downloads"), item.getFilename())
    item.setSavePath(savePath)
    const info = {
      id, name: path.basename(savePath), path: savePath, url: item.getURL(),
      mime: item.getMimeType(), state: "progressing", paused: false,
      received: 0, total: item.getTotalBytes(), started: Date.now(), speed: 0
    }
    items.set(id, { item, info })

    let lastBytes = 0
    let lastT = Date.now()
    let lastSend = 0
    item.on("updated", (_ev, state) => {
      info.state = state
      info.paused = item.isPaused()
      const now = Date.now()
      const got = item.getReceivedBytes()
      if (now - lastT >= 500) {
        info.speed = Math.max(0, Math.round((got - lastBytes) / ((now - lastT) / 1000)))
        lastBytes = got; lastT = now
      }
      if (now - lastSend > 180) { lastSend = now; send(id) }
    })
    item.once("done", (_ev, state) => {
      info.state = state          // completed | cancelled | interrupted
      info.finished = Date.now()
      send(id)
      if (state === "completed" && process.platform === "darwin") {
        try { app.dock?.downloadFinished(savePath) } catch {}
      }
    })
    send(id)
  })
}

const downloads = {
  list (ctx) { return [...ctx.downloads.keys()].map((id) => snapshot(ctx.downloads, id)).filter(Boolean).reverse() },
  action (ctx, id, verb) {
    const items = ctx.downloads
    const rec = items.get(id)
    if (!rec) return { ok: false }
    const { item, info } = rec
    try {
      if (verb === "pause") item.pause()
      else if (verb === "resume" && item.canResume()) item.resume()
      else if (verb === "cancel") item.cancel()
      else if (verb === "open") shell.openPath(info.path)
      else if (verb === "reveal") shell.showItemInFolder(info.path)
      else if (verb === "forget") items.delete(id)
      return { ok: true }
    } catch (e) { return { ok: false, text: e.message } }
  },
  clearFinished (ctx) {
    for (const [id, { info }] of ctx.downloads) if (info.state !== "progressing") ctx.downloads.delete(id)
    return { ok: true }
  },
  // profile removed: stop what is still running
  cancelAll (ctx) {
    for (const { item, info } of ctx.downloads.values()) if (info.state === "progressing") try { item.cancel() } catch {}
  }
}

module.exports = { initDownloads, downloads }
