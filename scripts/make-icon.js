// ───────────────────────────────────────────────────────────────────
//  make-icon.js — renders build/icon.svg into build/comet.icns.
//  Run with Electron (it is the renderer):  Electron scripts/make-icon.js
//  Uses only macOS's own sips + iconutil afterwards.
// ───────────────────────────────────────────────────────────────────
const { app, BrowserWindow } = require("electron")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const BUILD = path.join(__dirname, "..", "build")
const SIZES = [16, 32, 128, 256, 512]

app.dock?.hide()
app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(BUILD, "icon.svg"), "utf8")
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } })
  win.webContents.setFrameRate(1)
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<html><body style="margin:0;background:transparent;overflow:hidden">${svg}</body></html>`)}`)
  await new Promise((r) => setTimeout(r, 400))
  let img = await win.webContents.capturePage()
  if (img.getSize().width !== 1024) img = img.resize({ width: 1024, height: 1024, quality: "best" })

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "comet-icon-"))
  const master = path.join(tmp, "icon-1024.png")
  fs.writeFileSync(master, img.toPNG())
  const set = path.join(tmp, "flux.iconset")
  fs.mkdirSync(set)
  for (const s of SIZES) {
    execFileSync("sips", ["-z", String(s), String(s), master, "--out", path.join(set, `icon_${s}x${s}.png`)], { stdio: "ignore" })
    execFileSync("sips", ["-z", String(s * 2), String(s * 2), master, "--out", path.join(set, `icon_${s}x${s}@2x.png`)], { stdio: "ignore" })
  }
  execFileSync("iconutil", ["-c", "icns", set, "-o", path.join(BUILD, "comet.icns")])
  fs.copyFileSync(master, path.join(BUILD, "icon-1024.png"))
  console.log("wrote build/comet.icns")
  app.quit()
}).catch((e) => { console.error("[make-icon]", e.message); app.exit(1) })
