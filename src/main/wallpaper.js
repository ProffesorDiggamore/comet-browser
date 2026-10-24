// ───────────────────────────────────────────────────────────────────
//  wallpaper.js — the Home wallpaper lives as one JPEG in userData so
//  config.json stays small.  Sources: any image (HEIC too, via macOS),
//  your Home Widgets photos, or the current desktop picture.
// ───────────────────────────────────────────────────────────────────
const { app, dialog, ipcMain, nativeImage } = require("electron")
const { execFile } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const FILE = () => path.join(app.getPath("userData"), "wallpaper.jpg")
const HOME_WIDGETS_IMAGES = path.join(os.homedir(), "Library", "Application Support", "HomeWidgets", "Images")
const MAX_W = 2880

function save (src) {
  const img = nativeImage.createFromPath(src)
  if (img.isEmpty()) throw new Error("macOS couldn't read that image")
  const { width } = img.getSize()
  const out = width > MAX_W ? img.resize({ width: MAX_W, quality: "best" }) : img
  fs.writeFileSync(FILE(), out.toJPEG(86))
  return current()
}

function current () {
  try { return `data:image/jpeg;base64,${fs.readFileSync(FILE()).toString("base64")}` } catch { return null }
}

function desktopPicture () {
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", 'tell application "System Events" to get picture of current desktop'], { timeout: 4000 }, (err, out) => {
      const p = String(out || "").trim()
      if (err || !p) reject(new Error("Couldn't read your desktop picture"))
      else resolve(p)
    })
  })
}

function registerWallpaperIpc (getWin) {
  ipcMain.handle("flux:wallpaper:get", () => current())

  ipcMain.handle("flux:wallpaper:pick", async () => {
    const r = await dialog.showOpenDialog(getWin(), {
      title: "Choose a wallpaper",
      defaultPath: fs.existsSync(HOME_WIDGETS_IMAGES) ? HOME_WIDGETS_IMAGES : app.getPath("pictures"),
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "heic", "tif", "tiff", "gif", "bmp"] }]
    })
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true }
    try { return { ok: true, dataUrl: save(r.filePaths[0]) } } catch (e) { return { ok: false, text: e.message } }
  })

  ipcMain.handle("flux:wallpaper:desktop", async () => {
    try { return { ok: true, dataUrl: save(await desktopPicture()) } } catch (e) { return { ok: false, text: e.message } }
  })

  // photos you already gave Home Widgets, offered as one-click wallpapers
  ipcMain.handle("flux:wallpaper:homeWidgets", () => {
    let names = []
    try { names = fs.readdirSync(HOME_WIDGETS_IMAGES).filter((n) => /\.(png|jpe?g|heic|webp)$/i.test(n)) } catch { return [] }
    return names.slice(0, 24).map((n) => {
      const p = path.join(HOME_WIDGETS_IMAGES, n)
      const img = nativeImage.createFromPath(p)
      return img.isEmpty() ? null : { name: n, thumb: img.resize({ height: 90 }).toDataURL() }
    }).filter(Boolean)
  })

  ipcMain.handle("flux:wallpaper:useHomeWidgets", (_e, name) => {
    const p = path.join(HOME_WIDGETS_IMAGES, path.basename(String(name)))
    try { return { ok: true, dataUrl: save(p) } } catch (e) { return { ok: false, text: e.message } }
  })
}

module.exports = { registerWallpaperIpc }
