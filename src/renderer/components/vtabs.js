// ───────────────────────────────────────────────────────────────────
//  vtabs.js — the Dia-style sidebar: pinned sites as big tiles, a calm
//  vertical tab list (active tab shows a live thumbnail), "New Tab",
//  and Settings / Library / Downloads / appearance / AI at the bottom.  Drag to reorder, drop a tab on
//  the tiles to pin it, right-click for the tab menu.
// ───────────────────────────────────────────────────────────────────
import { h, mount } from "../core/dom.js"
import { bus } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { flip, leave } from "../core/motion.js"
import { tabMenu, openDownloadsPopover } from "./titlebar.js"
import { state, resolvedMode } from "../core/state.js"
import { themeById } from "../data/themes.js"
import * as T from "../core/tabs.js"

let root, tiles, list
const rows = new Map()
let dragId = null

function fav (t, size = 16) {
  if (t.isHome) return ico("spark", size - 2)
  if (t.favicon) return h("img", { src: t.favicon, draggable: false, onerror: (e) => e.target.replaceWith(ico("globe", size - 2)) })
  return ico(t.asleep ? "sleep" : "globe", size - 2)
}

function row (t) {
  const el = h("div.vt-row", {
    draggable: true,
    onclick: () => T.setActive(t.id),
    onauxclick: (e) => { if (e.button === 1) { e.preventDefault(); T.closeTab(t.id) } },
    oncontextmenu: (e) => { e.preventDefault(); tabMenu(T.getTab(t.id), { x: e.clientX, y: e.clientY }) },
    ondragstart: (e) => { dragId = t.id; e.dataTransfer.effectAllowed = "move"; el.classList.add("is-dragging"); document.body.classList.add("vt-dragging") },
    ondragend: () => { dragId = null; el.classList.remove("is-dragging"); document.body.classList.remove("vt-dragging"); root.querySelectorAll(".drop-before,.drop-after").forEach((x) => x.classList.remove("drop-before", "drop-after")) },
    ondragover: (e) => {
      if (!dragId || dragId === t.id) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const after = e.clientY > r.top + r.height / 2
      el.classList.toggle("drop-after", after); el.classList.toggle("drop-before", !after)
    },
    ondragleave: () => el.classList.remove("drop-before", "drop-after"),
    ondrop: (e) => {
      e.preventDefault()
      const after = el.classList.contains("drop-after")
      el.classList.remove("drop-before", "drop-after")
      if (!dragId || dragId === t.id) return
      const all = T.getTabs()
      const from = all.findIndex((x) => x.id === dragId)
      let to = all.findIndex((x) => x.id === t.id) + (after ? 1 : 0)
      if (from < to) to--
      T.move(dragId, to)
    }
  }, [
    h("span.vt-fav"),
    h("span.vt-title"),
    h("span.vt-thumb"),
    h("button.vt-audio", { title: "Mute", onclick: (e) => { e.stopPropagation(); T.setMuted(t.id) } }),
    h("button.vt-x", { title: "Close tab (⌘W)", onclick: (e) => { e.stopPropagation(); T.closeTab(t.id) } }, [ico("close", 12)])
  ])
  el.dataset.id = t.id
  return el
}

function update (el, t, activeId) {
  const on = t.id === activeId
  el.classList.toggle("is-active", on)
  el.classList.toggle("is-asleep", !!t.asleep)
  el.classList.toggle("is-loading", !!t.loading)
  el.classList.toggle("is-split", !!t.inSplit)
  const title = t.isHome ? "New Tab" : (t.title || t.url)
  el.title = title
  const f = el.querySelector(".vt-fav")
  const fk = `${t.isHome}|${t.favicon}|${t.asleep}`
  if (f.dataset.k !== fk) { f.dataset.k = fk; f.replaceChildren(fav(t)) }
  const tt = el.querySelector(".vt-title")
  if (tt.textContent !== title) tt.textContent = title
  const th = el.querySelector(".vt-thumb")
  const showThumb = on && t.thumb && !t.isHome
  if (th.dataset.k !== String(showThumb && t.thumb)) {
    th.dataset.k = String(showThumb && t.thumb)
    th.replaceChildren(showThumb ? h("img", { src: t.thumb, draggable: false }) : "")
  }
  const au = el.querySelector(".vt-audio")
  const ak = t.muted ? "m" : t.audible ? "a" : ""
  if (au.dataset.k !== ak) { au.dataset.k = ak; au.replaceChildren(ak ? ico(t.muted ? "volumeX" : "volume", 12) : ""); au.hidden = !ak }
}

function render ({ tabs, activeId }) {
  const pinned = tabs.filter((t) => t.pinned)
  const normal = tabs.filter((t) => !t.pinned)

  tiles.replaceChildren(...pinned.map((t) => h(`button.vt-tile${t.id === activeId ? ".is-active" : ""}${t.audible ? ".is-audible" : ""}`, {
    title: t.title || t.url,
    onclick: () => T.setActive(t.id),
    oncontextmenu: (e) => { e.preventDefault(); tabMenu(t, { x: e.clientX, y: e.clientY }) }
  }, [fav(t, 20)])))
  tiles.classList.toggle("is-empty", !pinned.length)

  const before = flip([...list.querySelectorAll(".vt-row:not(.is-leaving)")])
  const keep = new Set(normal.map((t) => t.id))
  for (const [id, el] of rows) {
    if (keep.has(id)) continue
    rows.delete(id)
    el.classList.add("is-leaving")
    leave(el, "fade").then(() => el.remove())
  }
  let prev = null
  for (const t of normal) {
    let el = rows.get(t.id)
    if (!el) { el = row(t); rows.set(t.id, el); el.classList.add("is-entering"); setTimeout(() => el.classList.remove("is-entering"), 600) }
    update(el, t, activeId)
    const want = prev ? prev.nextSibling : list.firstChild
    if (want !== el) list.insertBefore(el, want)
    prev = el
  }
  before()
  list.querySelector(".vt-row.is-active")?.scrollIntoView({ block: "nearest" })
}

const foot = (icon, title, onclick, cls = "") => h(`button.vt-foot.vt-icon${cls}`, { title, "aria-label": title, onclick }, [ico(icon, 16)])

// one click cycles Auto → Light → Dark (classic themes are dark-only)
const MODES = ["auto", "light", "dark"]
const MODE_LABEL = { auto: "Appearance: Auto (follows macOS)", light: "Appearance: Light", dark: "Appearance: Dark" }
const modeBtn = foot("contrast", "", () => {
  if (themeById(state.get("theme.active")).family === "classic") { state.set("theme.active", "glass"); return }
  const cur = state.get("theme.mode") ?? "auto"
  state.set("theme.mode", MODES[(MODES.indexOf(cur) + 1) % MODES.length])
})
function paintMode () {
  const classic = themeById(state.get("theme.active")).family === "classic"
  const m = classic ? resolvedMode() : state.get("theme.mode") ?? "auto"
  modeBtn.title = classic ? "This theme has one fixed look — click for Glass (light + dark)" : MODE_LABEL[m]
  modeBtn.replaceChildren(ico(m === "auto" ? "contrast" : resolvedMode() === "light" ? "sun" : "moon", 16))
}

export function initVTabs () {
  root = document.getElementById("vtabs")
  tiles = h("div.vt-tiles", {
    ondragover: (e) => { if (dragId) { e.preventDefault(); tiles.classList.add("is-drop") } },
    ondragleave: () => tiles.classList.remove("is-drop"),
    ondrop: (e) => { e.preventDefault(); tiles.classList.remove("is-drop"); if (dragId) T.setPinned(dragId, true) }
  })
  list = h("div.vt-list")
  mount(root, h("div.vt", {}, [
    h("div.vt-top"),
    tiles,
    h("div.vt-sep"),
    h("div.vt-scroll", {}, [
      list,
      h("button.vt-row.vt-new", { onclick: () => T.newTab() }, [h("span.vt-fav", {}, [ico("plus", 15)]), h("span.vt-title", { text: "New Tab" })])
    ]),
    h("div.vt-bottom", {}, [
      foot("gear", "Settings (⌘,)", () => bus.emit("view", "settings")),
      foot("clock", "Library (⌘Y)", () => bus.emit("library:open", "history")),
      foot("download", "Downloads (⌥⌘L)", () => openDownloadsPopover()),
      h("span.vt-flex"),
      modeBtn,
      foot("chat", "Flux AI (⌘J)", () => bus.emit("ai:toggle"), ".vt-ai")
    ])
  ]))
  bus.on("config", paintMode)
  paintMode()
  bus.on("tabs", render)
  bus.on("thumb", () => render({ tabs: T.getTabs(), activeId: T.getActiveId() }))
  render({ tabs: T.getTabs(), activeId: T.getActiveId() })
}
