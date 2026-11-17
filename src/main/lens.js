// ───────────────────────────────────────────────────────────────────
//  lens.js — search by image with Google Lens.  The image is POSTed
//  (multipart, field "encoded_image") from inside the tab itself, so
//  the results load with that profile's Google cookies and consent.
//  Lens answers 303 → a google.com results page.
// ───────────────────────────────────────────────────────────────────
const { app, clipboard, dialog, ipcMain, nativeImage, webContents } = require("electron")
const crypto = require("node:crypto")

const MAX_SIDE = 1600
const MAX_BYTES = 20 * 1024 * 1024
const uploadUrl = () => `https://lens.google.com/v3/upload?hl=${encodeURIComponent((app.getLocale() || "en").split("-")[0])}&re=df&st=${Date.now()}&ep=gsbubb`

// any nativeImage → JPEG bytes no bigger than Lens needs
function jpeg (img) {
  if (img.isEmpty()) throw new Error("That isn't an image Comet can read")
  const { width, height } = img.getSize()
  const k = Math.min(1, MAX_SIDE / Math.max(width, height))
  return (k < 1 ? img.resize({ width: Math.round(width * k), height: Math.round(height * k), quality: "best" }) : img).toJPEG(90)
}

// hostId: the Comet window that asked; it may only drive its own tabs
function upload (hostId, wcId, bytes) {
  const wc = webContents.fromId(Number(wcId))
  if (!wc || wc.isDestroyed() || wc.getType() !== "webview" || wc.hostWebContents?.id !== hostId) return { ok: false, text: "That tab is gone" }
  const buf = Buffer.from(bytes ?? [])
  if (!buf.length || buf.length > MAX_BYTES) return { ok: false, text: "That image is empty or too large" }
  const boundary = `----CometLens${crypto.randomBytes(12).toString("hex")}`
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="encoded_image"; filename="image.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    buf,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ])
  wc.loadURL(uploadUrl(), {
    postData: [{ type: "rawData", bytes: body }],
    extraHeaders: `Content-Type: multipart/form-data; boundary=${boundary}`
  }).catch(() => {})   // the 303 shows up as an aborted first load; the results page still loads
  return { ok: true }
}

function registerLensIpc ({ winFor }) {
  ipcMain.handle("flux:lens:upload", (e, wcId, bytes) => upload(e.sender.id, wcId, bytes))

  // what's on the clipboard: an image (bytes) or an image link (url)
  ipcMain.handle("flux:lens:clipboard", () => {
    const img = clipboard.readImage()
    if (!img.isEmpty()) return { ok: true, bytes: jpeg(img) }
    const text = clipboard.readText().trim()
    if (/^https?:\/\/\S+$/i.test(text)) return { ok: true, url: text }
    return { ok: false, text: "Copy an image (or an image link) first" }
  })

  // choose a file — HEIC too (macOS decodes it)
  ipcMain.handle("flux:lens:pick", async (e) => {
    const r = await dialog.showOpenDialog(winFor(e), {
      title: "Search with Google Lens",
      defaultPath: app.getPath("pictures"),
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "heic", "gif", "tif", "tiff", "bmp"] }]
    })
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true }
    try { return { ok: true, bytes: jpeg(nativeImage.createFromPath(r.filePaths[0])) } } catch (e) { return { ok: false, text: e.message } }
  })
}

module.exports = { registerLensIpc }
