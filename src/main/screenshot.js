// ───────────────────────────────────────────────────────────────────
//  screenshot.js — full-screen capture via desktopCapturer (needs the
//  macOS Screen Recording permission).  Page-scoped capture is done in
//  the renderer with <webview>.capturePage(), so this is only the
//  "capture the whole screen" path.
// ───────────────────────────────────────────────────────────────────
const { desktopCapturer, screen } = require("electron")

async function captureScreen () {
  try {
    const primary = screen.getPrimaryDisplay()
    const { width, height } = primary.size
    const scale = primary.scaleFactor || 1
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: Math.round(width * scale), height: Math.round(height * scale) }
    })
    const src = sources[0]
    if (!src) return { ok: false, text: "No screen source available." }
    return { ok: true, dataUrl: src.thumbnail.toDataURL() }
  } catch (e) {
    return { ok: false, text: `Screen capture failed (grant Screen Recording in System Settings): ${e.message}` }
  }
}

module.exports = { captureScreen }
