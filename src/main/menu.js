// ───────────────────────────────────────────────────────────────────
//  menu.js — the macOS menu bar is the single source of truth for
//  browser shortcuts.  Menu accelerators fire no matter which surface
//  has focus (the Flux UI or a web page), so ⌘T / ⌘L / ⌘F / ⌘J … always
//  work.  Each item forwards an action to the renderer bus.
// ───────────────────────────────────────────────────────────────────
const { app, Menu } = require("electron")

function buildMenu (getWin) {
  const go = (action) => () => {
    const w = getWin()
    if (w && !w.isDestroyed()) w.webContents.send("flux:menu", { action })
  }
  const item = (label, accelerator, action) => ({ label, accelerator, click: go(action) })

  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        item("Settings…", "CmdOrCtrl+,", "settings"),
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" }, { role: "hideOthers" }, { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "File",
      submenu: [
        item("New Tab", "CmdOrCtrl+T", "new-tab"),
        item("Reopen Closed Tab", "Shift+CmdOrCtrl+T", "reopen"),
        item("Close Tab", "CmdOrCtrl+W", "close-tab"),
        { type: "separator" },
        item("Open Location…", "CmdOrCtrl+L", "focus-address"),
        item("Command Palette…", "CmdOrCtrl+K", "palette"),
        { type: "separator" },
        item("Save Page Screenshot", "Shift+CmdOrCtrl+S", "screenshot"),
        item("Print…", "CmdOrCtrl+P", "print")
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" }, { role: "redo" }, { type: "separator" },
        { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "pasteAndMatchStyle" },
        { role: "delete" }, { role: "selectAll" },
        { type: "separator" },
        item("Find in Page…", "CmdOrCtrl+F", "find"),
        { type: "separator" },
        { label: "Speech", submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }] }
      ]
    },
    {
      label: "View",
      submenu: [
        item("Reload Page", "CmdOrCtrl+R", "reload"),
        item("Reload Flux UI", "Shift+CmdOrCtrl+R", "reload-ui"),
        { type: "separator" },
        item("Zoom In", "CmdOrCtrl+=", "zoom-in"),
        item("Zoom In (+)", "CmdOrCtrl+Plus", "zoom-in"),
        item("Zoom Out", "CmdOrCtrl+-", "zoom-out"),
        item("Actual Size", "CmdOrCtrl+0", "zoom-reset"),
        { type: "separator" },
        item("Reader Mode", "Alt+CmdOrCtrl+R", "reader"),
        item("Split View", "CmdOrCtrl+\\", "split"),
        item("Tab Overview", "Shift+CmdOrCtrl+\\", "overview"),
        item("Toggle Sidebar", "CmdOrCtrl+B", "sidebar"),
        item("Focus Mode", "Shift+CmdOrCtrl+F", "focus"),
        { type: "separator" },
        { role: "togglefullscreen" },
        item("Developer Tools (Page)", "Alt+CmdOrCtrl+I", "devtools"),
        { role: "toggleDevTools", label: "Developer Tools (Flux UI)", accelerator: "Alt+Shift+CmdOrCtrl+I" }
      ]
    },
    {
      label: "History",
      submenu: [
        item("Back", "CmdOrCtrl+[", "back"),
        item("Forward", "CmdOrCtrl+]", "forward"),
        item("Home", "Shift+CmdOrCtrl+H", "home"),
        { type: "separator" },
        item("Show History", "CmdOrCtrl+Y", "history")
      ]
    },
    {
      label: "Bookmarks",
      submenu: [
        item("Bookmark This Page", "CmdOrCtrl+D", "bookmark"),
        item("Show Bookmarks", "Alt+CmdOrCtrl+B", "bookmarks")
      ]
    },
    {
      label: "Tab",
      submenu: [
        item("Next Tab", "Ctrl+Tab", "next-tab"),
        item("Previous Tab", "Ctrl+Shift+Tab", "prev-tab"),
        item("Next Tab ", "Alt+CmdOrCtrl+Right", "next-tab"),
        item("Previous Tab ", "Alt+CmdOrCtrl+Left", "prev-tab"),
        { type: "separator" },
        item("Pin / Unpin Tab", "", "pin"),
        item("Duplicate Tab", "", "duplicate"),
        item("Mute / Unmute Tab", "Ctrl+M", "mute"),
        item("Picture in Picture", "Alt+CmdOrCtrl+P", "pip"),
        item("Sleep Background Tabs", "", "sleep-all"),
        { type: "separator" },
        item("Show Downloads", "Alt+CmdOrCtrl+L", "downloads")
      ]
    },
    {
      label: "AI",
      submenu: [
        item("Ask Flux AI", "CmdOrCtrl+J", "ai"),
        item("Ask About This Page", "Shift+CmdOrCtrl+J", "ai-page"),
        item("New AI Chat", "Alt+CmdOrCtrl+J", "ai-new"),
        { type: "separator" },
        item("Summarize Page", "", "ai-summarize"),
        item("Organize My Tabs", "", "ai-organize")
      ]
    },
    { role: "windowMenu" }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

module.exports = { buildMenu }
