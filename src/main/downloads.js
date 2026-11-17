// ───────────────────────────────────────────────────────────────────
//  downloads.js — tracks every download in the browsing session and
//  streams progress to the UI.  Files land in ~/Downloads (unique name);
//  the UI can pause / resume / cancel / retry / open / reveal.
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
  // an interrupted item reports 0 bytes: keep the last count it had
  try { received = item.getReceivedBytes() || info.received; total = item.getTotalBytes() || info.total } catch {}
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
    items.set(id, { item, info, ses })

    let lastBytes = 0
    let lastT = Date.now()
    let lastSend = 0
    let trail = null
    let stall = null
    item.on("updated", (_ev, state) => {
      const changed = state !== info.state || item.isPaused() !== info.paused
      info.state = state
      info.paused = item.isPaused()
      const now = Date.now()
      const got = item.getReceivedBytes()
      if (got) info.received = got
      if (now - lastT >= 500) {
        info.speed = Math.max(0, Math.round((got - lastBytes) / ((now - lastT) / 1000)))
        lastBytes = got; lastT = now
      }
      // Chromium retries a dropped connection by itself and, once it gives
      // up, leaves the item "interrupted" without a "done": after a few
      // quiet seconds that counts as failed (the UI offers Retry)
      clearTimeout(stall)
      info.failed = false
      if (state === "interrupted") {
        info.speed = 0
        stall = setTimeout(() => { if (item.getState() === "interrupted" && !info.finished) { info.failed = true; send(id) } }, 4000)
      }
      // a state change always goes out; progress is throttled, with a trailing send
      clearTimeout(trail)
      if (changed || now - lastSend > 180) { lastSend = now; send(id) } else trail = setTimeout(() => { lastSend = Date.now(); send(id) }, 200)
    })
    item.once("done", (_ev, state) => {
      clearTimeout(trail); clearTimeout(stall)
      info.state = state          // completed | cancelled | interrupted
      info.failed = state === "interrupted"
      info.finished = Date.now()
      info.paused = false
      info.speed = 0
      send(id)
      if (state === "completed" && process.platform === "darwin") {
        try { app.dock?.downloadFinished(savePath) } catch {}
      }
    })
    send(id)
  })
}

// a failed / cancelled download starts over as a new entry (will-download
// above picks it up); the old row goes.  Nothing is deleted from disk here:
// Chromium removes its own partial on cancel / non-resumable failure, and the
// old path may now hold a different download or a file the user saved there
function retry (items, id) {
  const { item, info, ses } = items.get(id)
  if (info.state === "progressing" || info.state === "completed") return { ok: false }
  // given up but not finished: the same item can pick up where it stopped
  if (!info.finished && info.state === "interrupted") {
    try { if (item.canResume()) { info.failed = false; item.resume(); return { ok: true, same: true } } } catch {}
  }
  if (!/^(https?|data|blob):/i.test(info.url)) return { ok: false }
  items.delete(id)
  if (!info.finished) try { item.cancel() } catch {}
  ses.downloadURL(info.url)
  return { ok: true }
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
      else if (verb === "forget") { items.delete(id); if (!info.finished && info.failed) item.cancel() }
      else if (verb === "retry") return retry(items, id)
      return { ok: true }
    } catch (e) { return { ok: false, text: e.message } }
  },
  clearFinished (ctx) {
    for (const [id, { item, info }] of ctx.downloads) {
      if (!info.finished && !info.failed) continue
      ctx.downloads.delete(id)
      if (!info.finished) try { item.cancel() } catch {}
    }
    return { ok: true }
  },
  // profile removed: stop what is still running
  cancelAll (ctx) {
    for (const { item, info } of ctx.downloads.values()) if (!info.finished) try { item.cancel() } catch {}
  }
}

module.exports = { initDownloads, downloads }
