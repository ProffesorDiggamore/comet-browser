// ───────────────────────────────────────────────────────────────────
//  shortcuts.js — global (OS-wide) hotkeys.  Currently one: the Vision
//  AI capture key.  Re-registers whenever the user changes it.
// ───────────────────────────────────────────────────────────────────
const { globalShortcut } = require("electron")
const { store } = require("./store")

let current = null

function registerShortcuts ({ getWin }) {
  apply(getWin)
  store._onVisionHotkey = () => apply(getWin)
}

function apply (getWin) {
  if (current) { try { globalShortcut.unregister(current) } catch {} }
  const accel = store.get("vision.hotkey") || "CmdOrCtrl+Shift+Space"
  try {
    const ok = globalShortcut.register(accel, () => {
      const win = getWin()
      if (!win || win.isDestroyed()) return
      if (!win.isVisible()) win.show()
      win.focus()
      win.webContents.send("flux:hotkey:vision")
    })
    current = ok ? accel : null
    if (!ok) console.error("[shortcuts] failed to register", accel)
  } catch (e) {
    console.error("[shortcuts]", e.message)
  }
}

module.exports = { registerShortcuts, applyVisionHotkey: apply }
