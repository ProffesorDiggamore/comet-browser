// ───────────────────────────────────────────────────────────────────
//  toolbar-items.js — the buttons on the right of the toolbar are
//  yours to choose (Settings → Layout → Toolbar).  Reader and Bookmark
//  are built by titlebar.js; the rest live here and fire the same menu
//  actions as their keyboard shortcuts.  "More" always stays last.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { bus } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { state } from "../core/state.js"
import { menu } from "./popover.js"
import { openDownloads, downloadsBadge } from "./downloads.js"

// order here = order in the toolbar and in Settings; web = page-only (hidden on Home)
export const TOOL_ITEMS = [
  { id: "reader", icon: "book", label: "Reader", title: "Reader mode (⌥⌘R)", builtin: true },
  { id: "bookmark", icon: "bookmark", label: "Bookmark", title: "Bookmark this page (⌘D)", builtin: true },
  { id: "home", icon: "home", label: "Home", title: "Home (⇧⌘H)", action: "home" },
  { id: "split", icon: "split", label: "Split View", title: "Split view (⌘\\)", action: "split", web: true },
  { id: "overview", icon: "overview", label: "Tab Overview", title: "Tab overview (⇧⌘\\)", action: "overview" },
  { id: "history", icon: "clock", label: "History", title: "History (⌘Y)", action: "history" },
  { id: "downloads", icon: "download", label: "Downloads", title: "Downloads (⌥⌘L)" },
  { id: "screenshot", icon: "image", label: "Screenshot", title: "Save screenshot (⇧⌘S)", action: "screenshot", web: true },
  { id: "pip", icon: "pip", label: "Picture in Picture", title: "Picture in Picture (⌥⌘P)", action: "pip", web: true },
  { id: "share", icon: "copy", label: "Copy Link", title: "Copy link (⇧⌘C)", action: "copy-url", web: true }
]
export const TOOL_DEFAULTS = Object.fromEntries(TOOL_ITEMS.map((t) => [t.id, !!t.builtin]))

export function toolOn (id) {
  const v = state.get(`layout.toolbar.${id}`)
  return typeof v === "boolean" ? v : TOOL_DEFAULTS[id]
}

function makeBtn (it) {
  const b = h(`button.tb-btn.no-drag${it.web ? ".web-only" : ""}`, {
    title: it.title, "aria-label": it.title, dataset: { tool: it.id },
    onclick: () => (it.id === "downloads" ? openDownloads(b) : bus.emit("menu", { action: it.action }))
  }, [ico(it.icon, 16)])
  if (it.id === "downloads") { b.dataset.downloadsBtn = ""; b.append(downloadsBadge()) }
  return b
}

// actions = the .tl-actions box; builtin = { reader, bookmark } buttons; more = the More button
export function initToolbarItems (actions, builtin, more) {
  for (const [id, el] of Object.entries(builtin)) el.dataset.tool = id
  const extras = new Map()   // id -> button, created on first use
  let sig = ""
  const paint = (animate) => {
    const on = TOOL_ITEMS.map((t) => toolOn(t.id))
    const s = on.join("")
    if (s === sig) return
    sig = s
    for (const [i, it] of TOOL_ITEMS.entries()) {
      if (it.builtin) { builtin[it.id]?.classList.toggle("is-tool-off", !on[i]); continue }
      let b = extras.get(it.id)
      if (!on[i]) { b?.remove(); continue }
      if (!b) { b = makeBtn(it); extras.set(it.id, b) }
      if (!b.isConnected) {
        actions.insertBefore(b, more ?? null)
        if (animate) { b.classList.add("is-entering"); b.addEventListener("animationend", () => b.classList.remove("is-entering"), { once: true }) }
      }
    }
    // keep registry order (a button switched on later lands in its slot, not at the end)
    for (const it of TOOL_ITEMS) { const b = extras.get(it.id); if (b?.isConnected) actions.insertBefore(b, more ?? null) }
  }
  actions.addEventListener("contextmenu", (e) => {
    e.preventDefault()
    const anchor = e.target.closest("button") ?? actions
    menu(anchor, [{ label: "Customize Toolbar…", icon: "gear", run: () => bus.emit("settings:goto", "layout") }], { align: "end" })
  })
  bus.on("config", () => paint(true))
  paint(false)
}
