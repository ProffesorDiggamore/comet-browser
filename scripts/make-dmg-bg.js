// ───────────────────────────────────────────────────────────────────
//  make-dmg-bg.js — renders scripts/dmg-background.html into
//  build/dmg-background.tiff (a 1x + 2x pair, so Retina Finder windows
//  stay sharp).  Run with Electron:  Electron scripts/make-dmg-bg.js
// ───────────────────────────────────────────────────────────────────
const { app, BrowserWindow } = require("electron")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const W = 660, H = 400
const BUILD = path.join(__dirname, "..", "build")

app.dock?.hide()
app.whenReady().then(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "comet-dmgbg-"))
  const out = []
  // one window for both sizes: a second offscreen window in the same run fails to load
  const win = new BrowserWindow({ width: W, height: H, show: false, frame: false, webPreferences: { offscreen: true } })
  win.webContents.setFrameRate(1)
  // load a temp copy: Chromium fails file:// loads under this project's path (the "&")
  const page = path.join(tmp, "bg.html")
  fs.copyFileSync(path.join(__dirname, "dmg-background.html"), page)
  await win.loadFile(page)
  for (const scale of [1, 2]) {
    // render at scale by zooming the page into a scale× larger viewport
    win.setContentSize(W * scale, H * scale)
    win.webContents.setZoomFactor(scale)
    await new Promise((r) => setTimeout(r, 800))
    let img = await win.webContents.capturePage()
    if (img.getSize().width !== W * scale) img = img.resize({ width: W * scale, height: H * scale, quality: "best" })
    const file = path.join(tmp, `bg@${scale}x.png`)
    fs.writeFileSync(file, img.toPNG())
    // tag the 2x image as 144 dpi so tiffutil pairs it as the Retina variant
    if (scale === 2) execFileSync("sips", ["-s", "dpiWidth", "144", "-s", "dpiHeight", "144", file], { stdio: "ignore" })
    out.push(file)
  }
  win.destroy()
  execFileSync("tiffutil", ["-cathidpicheck", out[0], out[1], "-out", path.join(BUILD, "dmg-background.tiff")], { stdio: "ignore" })
  fs.copyFileSync(out[1], path.join(BUILD, "dmg-background@2x.png"))
  console.log("wrote build/dmg-background.tiff")
  app.quit()
}).catch((e) => { console.error("[make-dmg-bg]", e.message); app.exit(1) })
