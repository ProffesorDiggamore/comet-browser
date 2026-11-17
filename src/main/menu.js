// ───────────────────────────────────────────────────────────────────
//  menu.js — the macOS menu bar is the single source of truth for
//  browser shortcuts.  Menu accelerators fire no matter which surface
//  has focus (the Comet UI or a web page), so ⌘T / ⌘L / ⌘F / ⌘J … always
//  work.  Each item forwards an action to the renderer bus of the window
//  it was pressed in (several profile windows can be open at once).
// ───────────────────────────────────────────────────────────────────
const { app, Menu } = require("electron")
const { profiles } = require("./profiles")

const label = (p) => (p.emoji ? `${p.emoji}  ${p.name}` : p.name)

// api (windows.js): targetWin(bw) maps the clicked-in window (a pop-up → its
// parent, none → the last-focused window); openProfileWindow(id) opens or
// focuses a profile's window; newWindow() is ⌘N; focusedProfileId(); openIds()
function buildMenu (api) {
  const send = (payload) => (_mi, bw) => {
    const w = api.targetWin(bw)
    if (w && !w.isDestroyed()) w.webContents.send("flux:menu", payload)
  }
  const go = (action) => send({ action })
  const item = (label, accelerator, action) => ({ label, accelerator, click: go(action) })
  // shortcut-only items: the accelerator works, the menu doesn't show a duplicate row
  const hidden = (label, accelerator, action) => ({ ...item(label, accelerator, action), visible: false, acceleratorWorksWhenHidden: true })
  // ⌘1–⌘8 pick that tab, ⌘9 the last one (every browser does this)
  const selectTab = Array.from({ length: 9 }, (_, i) => ({
    ...hidden(i === 8 ? "Select Last Tab" : `Select Tab ${i + 1}`, `CmdOrCtrl+${i + 1}`, "select-tab"),
    click: send({ action: "select-tab", index: i === 8 ? -1 : i })
  }))
  // ⌃⌘1…9 switch THIS window (through the renderer, which saves its tabs first);
  // a profile already open elsewhere is focused instead of duplicated
  const list = profiles.list().filter((p) => !api.removing?.has(p.id))
  const here = api.focusedProfileId()
  const open = new Set(api.openIds())
  const profileItems = list.map((p, i) => ({
    label: label(p),
    type: "checkbox",
    checked: p.id === here,
    accelerator: i < 9 ? `Ctrl+CmdOrCtrl+${i + 1}` : undefined,
    click: send({ action: "profile-switch", id: p.id })
  }))
  // a window of its own: checked = already open (clicking focuses it)
  const windowItems = list.length > 1
    ? [{ type: "separator" }, {
        label: "Open in New Window",
        submenu: list.map((p) => ({ label: label(p), type: "checkbox", checked: open.has(p.id), click: () => api.openProfileWindow(p.id) }))
      }]
    : []
  // ⌘W closes a pop-up itself, not the tab behind it
  const closeTab = { ...item("Close Tab", "CmdOrCtrl+W", "close-tab"), click: (mi, bw) => (bw && !bw.isDestroyed() && api.targetWin(bw) !== bw ? bw.close() : go("close-tab")(mi, bw)) }

  const template = [
    {
      label: "Comet",
      submenu: [
        { role: "about", label: "About Comet" },
        { type: "separator" },
        item("Settings…", "CmdOrCtrl+,", "settings"),
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide", label: "Hide Comet" }, { role: "hideOthers" }, { role: "unhide" },
        { type: "separator" },
        { role: "quit", label: "Quit Comet" }
      ]
    },
    {
      label: "File",
      submenu: [
        item("New Tab", "CmdOrCtrl+T", "new-tab"),
        { label: "New Window…", accelerator: "CmdOrCtrl+N", click: () => api.newWindow() },
        item("New Private Tab", "Shift+CmdOrCtrl+N", "new-private-tab"),
        item("Reopen Closed Tab", "Shift+CmdOrCtrl+T", "reopen"),
        closeTab,
        { role: "close", label: "Close Window", accelerator: "Shift+CmdOrCtrl+W" },
        { type: "separator" },
        item("Open Location…", "CmdOrCtrl+L", "focus-address"),
        item("Copy Link to This Page", "Shift+CmdOrCtrl+C", "copy-url"),
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
        item("Reload Page Ignoring Cache", "Shift+CmdOrCtrl+R", "hard-reload"),
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
        item("Show / Hide Bookmarks Bar", "Shift+CmdOrCtrl+B", "bookmarks-bar"),
        item("Focus Mode", "Shift+CmdOrCtrl+F", "focus"),
        { type: "separator" },
        { role: "togglefullscreen" },
        item("Developer Tools (Page)", "Alt+CmdOrCtrl+I", "devtools"),
        { role: "toggleDevTools", label: "Developer Tools (Comet UI)", accelerator: "Alt+Shift+CmdOrCtrl+I" },
        item("Reload Comet UI", "Alt+Shift+CmdOrCtrl+R", "reload-ui")
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
        hidden("Next Tab", "Alt+CmdOrCtrl+Right", "next-tab"),
        hidden("Previous Tab", "Alt+CmdOrCtrl+Left", "prev-tab"),
        ...selectTab,
        { type: "separator" },
        item("Pin / Unpin Tab", "", "pin"),
        item("Duplicate Tab", "", "duplicate"),
        item("Add Tab to New Group", "Alt+CmdOrCtrl+G", "group-tab"),
        item("Rename Tab…", "", "rename-tab"),
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
        item("Ask Comet AI", "CmdOrCtrl+J", "ai"),
        item("Ask About This Page", "Shift+CmdOrCtrl+J", "ai-page"),
        item("New AI Chat", "Alt+CmdOrCtrl+J", "ai-new"),
        { type: "separator" },
        item("Summarize Page", "", "ai-summarize"),
        item("Organize My Tabs", "", "ai-organize")
      ]
    },
    {
      label: "Profiles",
      submenu: [
        ...profileItems,
        ...windowItems,
        { type: "separator" },
        item("Add Profile…", "", "profile-add"),
        item("Manage Profiles…", "", "profile-manage")
      ]
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        item("Welcome Tour…", "", "welcome"),
        item("Keyboard Shortcuts", "", "shortcuts")
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// right-click the Dock icon: every profile (checked = has a window) opens or
// focuses its window.  One profile: nothing extra.
function buildDockMenu (api) {
  if (process.platform !== "darwin" || !app.dock) return
  const list = profiles.list().filter((p) => !api.removing?.has(p.id))
  if (list.length < 2) { app.dock.setMenu(Menu.buildFromTemplate([])); return }
  const open = new Set(api.openIds())
  app.dock.setMenu(Menu.buildFromTemplate([
    ...list.map((p) => ({ label: label(p), type: "checkbox", checked: open.has(p.id), click: () => api.openProfileWindow(p.id) })),
    { type: "separator" },
    { label: "New Window…", click: () => api.newWindow() }
  ]))
}

module.exports = { buildMenu, buildDockMenu }
