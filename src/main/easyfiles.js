// ───────────────────────────────────────────────────────────────────
//  easyfiles.js — Opera GX-style "Easy Files".  When a page opens a
//  file picker, Comet offers what you just copied (an image, Finder
//  files, text) and your newest downloads, so a screenshot on the
//  clipboard becomes an upload even on sites that block paste.
//  Only paths from the latest listing (or a native dialog the user
//  answered) can be read; nothing leaves the machine except the file
//  the user picks, handed to the page that asked.
// ───────────────────────────────────────────────────────────────────
const { app, clipboard, dialog, ipcMain, nativeImage } = require("electron")
const fs = require("node:fs")
const path = require("node:path")
const { store } = require("./store")

const MAX_BYTES = 200 * 1024 * 1024   // per pick, across all files
const RECENT_DOWNLOADS = 6

const MIME = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", heic: "image/heic",
  svg: "image/svg+xml", bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff", avif: "image/avif",
  pdf: "application/pdf", txt: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json",
  html: "text/html", zip: "application/zip", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
}
const mimeOf = (p) => MIME[path.extname(p).slice(1).toLowerCase()] ?? "application/octet-stream"

let allowed = new Map()   // id -> { kind, path? } from the latest listing

// Finder "Copy" puts file URLs on the pasteboard; the plist form carries all of them
function copiedPaths () {
  const out = []
  try {
    const plist = clipboard.read("NSFilenamesPboardType")
    for (const m of plist.matchAll(/<string>([^<]+)<\/string>/g)) out.push(m[1].replace(/&amp;/g, "&"))
  } catch {}
  if (!out.length) {
    try {
      const u = clipboard.read("public.file-url")
      if (u) out.push(decodeURIComponent(new URL(u).pathname))
    } catch {}
  }
  return out.filter((p) => { try { return fs.statSync(p).isFile() } catch { return false } })
}

function thumbOf (p) {
  try {
    const img = nativeImage.createFromPath(p)
    if (img.isEmpty()) return null
    return img.resize({ height: 72 }).toDataURL()
  } catch { return null }
}

function fileItem (id, p, source) {
  const st = fs.statSync(p)
  const type = mimeOf(p)
  return { id, source, name: path.basename(p), type, size: st.size, mtime: st.mtimeMs, thumb: type.startsWith("image/") ? thumbOf(p) : null }
}

function recentDownloads () {
  const dir = app.getPath("downloads")
  let names = []
  try { names = fs.readdirSync(dir) } catch { return [] }
  return names
    .filter((n) => !n.startsWith(".") && !/\.(crdownload|download|part)$/i.test(n))
    .map((n) => { const p = path.join(dir, n); try { const st = fs.statSync(p); return st.isFile() ? { p, t: st.mtimeMs } : null } catch { return null } })
    .filter(Boolean)
    .sort((a, b) => b.t - a.t)
    .slice(0, RECENT_DOWNLOADS)
    .map((x) => x.p)
}

function list () {
  allowed = new Map()
  const clip = []
  copiedPaths().forEach((p, i) => {
    const id = `cf_${i}`
    allowed.set(id, { kind: "path", path: p })
    clip.push(fileItem(id, p, "clipboard"))
  })
  if (!clip.length) {
    const img = clipboard.readImage()
    if (!img.isEmpty()) {
      const { width, height } = img.getSize()
      allowed.set("ci", { kind: "image" })
      clip.push({ id: "ci", source: "clipboard", name: `Pasted image ${width}×${height}.png`, type: "image/png", size: null, thumb: img.resize({ height: 72 }).toDataURL() })
    }
  }
  if (!clip.length) {
    const text = clipboard.readText()
    if (text && text.trim()) {
      allowed.set("ct", { kind: "text" })
      clip.push({ id: "ct", source: "clipboard", name: "Clipboard text.txt", type: "text/plain", size: Buffer.byteLength(text), preview: text.trim().slice(0, 140) })
    }
  }
  const downloads = recentDownloads().map((p, i) => {
    const id = `dl_${i}`
    allowed.set(id, { kind: "path", path: p })
    return fileItem(id, p, "downloads")
  })
  return { clipboard: clip, downloads }
}

function readPath (p) {
  return { name: path.basename(p), type: mimeOf(p), lastModified: fs.statSync(p).mtimeMs, data: fs.readFileSync(p) }
}

function readOne (id) {
  const a = allowed.get(id)
  if (!a) throw new Error("That file is no longer offered — reopen the picker")
  if (a.kind === "path") return readPath(a.path)
  if (a.kind === "image") {
    const img = clipboard.readImage()
    if (img.isEmpty()) throw new Error("The clipboard image is gone")
    const { width, height } = img.getSize()
    return { name: `Pasted image ${width}x${height}.png`, type: "image/png", lastModified: Date.now(), data: img.toPNG() }
  }
  if (a.kind === "text") return { name: "Clipboard text.txt", type: "text/plain", lastModified: Date.now(), data: Buffer.from(clipboard.readText(), "utf8") }
  throw new Error("Unknown item")
}

function capped (files) {
  const total = files.reduce((n, f) => n + f.data.length, 0)
  if (total > MAX_BYTES) throw new Error(`Too big to hand to a page (${Math.round(total / 1048576)} MB, limit ${MAX_BYTES / 1048576} MB)`)
  return files
}

// accept="image/*,.pdf" → dialog filter extensions (empty = anything)
function acceptExtensions (accept) {
  const exts = new Set()
  for (const raw of String(accept || "").split(",")) {
    const a = raw.trim().toLowerCase()
    if (!a) continue
    if (a.startsWith(".")) exts.add(a.slice(1))
    else if (a.endsWith("/*")) { const pre = a.slice(0, -1); for (const [e, m] of Object.entries(MIME)) if (m.startsWith(pre)) exts.add(e) }
    else for (const [e, m] of Object.entries(MIME)) if (m === a) exts.add(e)
  }
  return [...exts]
}

function registerEasyFilesIpc (getWin) {
  // the page preload asks once at load whether to intercept pickers
  ipcMain.on("flux:files:enabled", (e) => { e.returnValue = store.get("general.easyFiles") !== false })

  ipcMain.handle("flux:files:list", () => {
    try { return { ok: true, ...list() } } catch (e) { return { ok: false, text: e.message } }
  })

  ipcMain.handle("flux:files:read", (_e, ids) => {
    try { return { ok: true, files: capped((ids ?? []).map(readOne)) } } catch (e) { return { ok: false, text: e.message } }
  })

  ipcMain.handle("flux:files:browse", async (_e, { accept, multiple } = {}) => {
    const exts = acceptExtensions(accept)
    const r = await dialog.showOpenDialog(getWin(), {
      title: "Choose a file to upload",
      properties: ["openFile", ...(multiple ? ["multiSelections"] : [])],
      filters: exts.length ? [{ name: "Accepted files", extensions: exts }, { name: "All files", extensions: ["*"] }] : []
    })
    if (r.canceled || !r.filePaths.length) return { ok: false, canceled: true }
    try { return { ok: true, files: capped(r.filePaths.map(readPath)) } } catch (e) { return { ok: false, text: e.message } }
  })
}

module.exports = { registerEasyFilesIpc }
