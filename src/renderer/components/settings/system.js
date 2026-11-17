// ───────────────────────────────────────────────────────────────────
//  settings/system.js — Settings → Shortcuts and Settings → About.
//  The shortcut list mirrors main/menu.js (the menu bar is the source
//  of truth for accelerators); everyday keys first, AI near the end.
// ───────────────────────────────────────────────────────────────────
import { h, clear } from "../../core/dom.js"
import { group, row, btn } from "./kit.js"

const SHORTCUTS = [
  ["New tab", "⌘T"], ["New private tab", "⇧⌘N"], ["Close tab", "⌘W"], ["Reopen closed tab", "⇧⌘T"],
  ["New window (choose profile)", "⌘N"], ["Close window", "⇧⌘W"],
  ["Go to tab 1–8 / last tab", "⌘1 – ⌘8  /  ⌘9"], ["Next / previous tab", "⌃Tab  /  ⌃⇧Tab"],
  ["Move through tabs", "⌘↑ ⌘↓ (sidebar) · ⌘← ⌘→ (tabs on top)"], ["Command palette", "⌘K"],
  ["Open location", "⌘L"], ["Copy link to this page", "⇧⌘C"], ["Back / forward", "⌘[  /  ⌘]"],
  ["Reload page", "⌘R"], ["Reload ignoring cache", "⇧⌘R"], ["Find in page", "⌘F"], ["Print", "⌘P"],
  ["Bookmark page", "⌘D"], ["Show all bookmarks", "⌥⌘B"], ["Bookmarks bar", "⇧⌘B"], ["History", "⌘Y"], ["Downloads", "⌥⌘L"],
  ["Home", "⇧⌘H"], ["Toggle sidebar", "⌘B"], ["Tab overview", "⇧⌘\\"], ["Split view", "⌘\\"],
  ["Reader mode", "⌥⌘R"], ["Focus mode", "⇧⌘F"], ["Add tab to new group", "⌥⌘G"],
  ["Picture in picture", "⌥⌘P"], ["Mute tab", "⌃M"], ["Save screenshot", "⇧⌘S"],
  ["Zoom in / out / actual size", "⌘+  /  ⌘-  /  ⌘0"], ["Switch this window's profile", "⌃⌘1 – ⌃⌘9"], ["Settings", "⌘,"],
  ["Peek at a link", "⇧-click"], ["Address bar: open in new tab", "⌥⏎"],
  ["Ask Comet AI", "⌘J"], ["Ask about this page", "⇧⌘J"], ["New AI chat", "⌥⌘J"],
  ["Inspect page", "⌥⌘I"]
]

export function catShortcuts () {
  return [group("Keyboard shortcuts", [
    h("div.kbd-list", { dataset: { search: "shortcuts keyboard hotkeys" } },
      SHORTCUTS.map(([k, v]) => h("div", {}, [h("span", { text: k }), h("kbd", { text: v })])))
  ])]
}

export function catAbout () {
  const version = h("span.rdesc", { text: "…" })
  const folder = h("span")
  window.flux.info().then((i) => {
    version.textContent = `Comet ${i.version ?? ""}`.trim()
    clear(folder)
    // reveals config.json inside the data folder
    folder.append(btn("Show in Finder", () => window.flux.shot.reveal(i.config), "btn btn--ghost"))
  })
  return [group("About", [
    row("Version", version),
    row("Data folder", folder, "Where your settings, history and saved logins are stored.")
  ])]
}
