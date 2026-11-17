// ───────────────────────────────────────────────────────────────────
//  vtabs.js — the Dia-style sidebar: pinned sites as big tiles, a calm
//  vertical tab list with tab groups (folders), "New Tab", a Now
//  Playing card, and Settings / Bookmarks / Downloads / appearance at
//  the bottom (the Library is ⌘Y, the menu and the command palette).  Drag to reorder (onto a group to file it), drop a tab on
//  the tiles to pin it, right-click for the tab menu, drag the right
//  edge to resize.
// ───────────────────────────────────────────────────────────────────
import { h, mount } from "../core/dom.js"
import { bus } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { flip, effectiveMode, ms } from "../core/motion.js"
import { tabMenu, openDownloadsPopover, moreMenu } from "./titlebar.js"
import { state, resolvedMode } from "../core/state.js"
import { themeById } from "../data/themes.js"
import * as T from "../core/tabs.js"
import * as G from "../core/groups.js"
import { profileButton } from "./profiles.js"
import { headerFor, paintHeader, dropHeader, inlineEdit, renameHeader } from "./vgroups.js"
import { nowPlaying } from "./nowplaying.js"
import { openBookmarks } from "./bookmarks.js"

let root, tiles, list, ind, btnNew
const rows = new Map()      // tabId -> row element
const heads = new Map()     // groupId -> header element (in the list)

// one highlight that glides to whichever row is active, instead of each row
// switching its own background on and off
function placeIndicator () {
  const on = list.querySelector(".vt-row.is-active:not(.is-leaving):not(.is-folded)")
  if (!on) { ind.classList.remove("is-on"); return }
  const first = !ind.classList.contains("is-on")
  if (first) ind.style.transition = "none"
  ind.style.transform = `translateY(${on.offsetTop}px)`
  ind.style.height = `${on.offsetHeight}px`
  ind.classList.add("is-on")
  if (first) { void ind.offsetWidth; ind.style.transition = "" }
}
let dragId = null
let lastOrder = "", lastActive = null

function fav (t, size = 16) {
  if (t.pane === "settings") return ico("gear", size - 2)
  if (t.isHome) return ico(t.private ? "eyeoff" : "home", size - 2)     // the comet mark read as a loading spinner here
  if (t.favicon) return h("img", { src: t.favicon, draggable: false, onerror: (e) => e.target.replaceWith(ico("globe", size - 2)) })
  return ico(t.asleep ? "sleep" : "globe", size - 2)
}

export function renameTab (id) {
  const el = rows.get(id)
  const t = T.getTab(id)
  if (!el || !t) return
  inlineEdit(el.querySelector(".vt-title"), t.customTitle || t.pageTitle || "", (v) => T.patchTab(id, { customTitle: v && v !== t.pageTitle ? v : null }), t.pageTitle || "Tab name")
}

// rows animate out by folding their height, so the ones below glide up
// instead of jumping once the fade ends
function collapseOut (el) {
  el.classList.add("is-leaving")
  if (effectiveMode() === "off") { el.remove(); return Promise.resolve() }
  const hgt = el.offsetHeight
  return el.animate(
    [{ opacity: 1, height: `${hgt}px`, marginBottom: "0px", transform: "none" }, { opacity: 0, height: "0px", marginBottom: "-2px", transform: "translateX(-10px)" }],
    { duration: ms("med"), easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" }
  ).finished.catch(() => {}).then(() => el.remove())
}

function dropOnRow (targetId, after) {
  if (!dragId || dragId === targetId) return
  const all = T.getTabs()
  const from = all.findIndex((x) => x.id === dragId)
  let to = all.findIndex((x) => x.id === targetId) + (after ? 1 : 0)
  if (from < to) to--
  const target = T.getTab(targetId)
  const moving = dragId
  T.move(moving, to)
  // landing among a group's tabs files it there; anywhere else takes it out
  G.setGroupOf(moving, target?.group ?? null)
}

function row (t) {
  const el = h("div.vt-row", {
    draggable: true, tabindex: 0, role: "tab", "aria-selected": "false",
    onclick: () => T.setActive(t.id),
    onkeydown: (e) => { if (e.target === el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); T.setActive(t.id) } },
    ondblclick: (e) => { if (e.target.closest(".vt-title")) renameTab(t.id) },
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
      dropOnRow(t.id, after)
    }
  }, [
    h("span.vt-fav"),
    h("span.vt-title"),
    // right beside the title ("YouTube 🔊"), not pushed to the far edge
    h("button.vt-audio", { title: "Mute", onclick: (e) => { e.stopPropagation(); T.setMuted(t.id) } }),
    h("span.vt-gap"),
    h("span.vt-thumb"),
    h("span.vt-priv", { title: "Private tab" }, [ico("eyeoff", 13)]),
    h("button.vt-x", { title: "Close tab (⌘W)", onclick: (e) => { e.stopPropagation(); T.closeTab(t.id) } }, [ico("close", 12)])
  ])
  el.dataset.id = t.id
  return el
}

function update (el, t, activeId, g) {
  const on = t.id === activeId
  el.classList.toggle("is-active", on)
  el.setAttribute("aria-selected", String(on))
  el.classList.toggle("is-asleep", !!t.asleep)
  el.classList.toggle("is-loading", !!t.loading)
  el.classList.toggle("is-split", !!t.inSplit)
  el.classList.toggle("is-private", !!t.private)
  el.classList.toggle("in-group", !!g)
  // a folded group still shows the tab you're on
  el.classList.toggle("is-folded", !!g?.collapsed && !on)
  if (g) el.style.setProperty("--g", G.colorVar(g.color)); else el.style.removeProperty("--g")
  const title = t.pane === "settings" ? "Settings" : t.isHome ? (t.customTitle || (t.private ? "Private Tab" : "New Tab")) : (t.title || t.url)
  el.title = t.customTitle && !t.isHome ? `${title}\n${t.pageTitle || t.url}` : title
  const f = el.querySelector(".vt-fav")
  const fk = `${t.isHome}|${t.pane}|${t.favicon}|${t.asleep}|${t.private}`
  if (f.dataset.k !== fk) { f.dataset.k = fk; f.replaceChildren(fav(t)) }
  const tt = el.querySelector(".vt-title")
  if (tt && tt.textContent !== title) tt.textContent = title
  const th = el.querySelector(".vt-thumb")
  const showThumb = on && t.thumb && !t.isHome && state.get("layout.tabThumbs") !== false
  if (th.dataset.k !== String(showThumb && t.thumb)) {
    th.dataset.k = String(showThumb && t.thumb)
    th.replaceChildren(showThumb ? h("img", { src: t.thumb, draggable: false }) : "")
  }
  const au = el.querySelector(".vt-audio")
  const ak = t.muted ? "m" : t.audible ? "a" : ""
  if (au.dataset.k !== ak) { au.dataset.k = ak; au.replaceChildren(ak ? ico(t.muted ? "volumeX" : "volume", 12) : ""); au.hidden = !ak; au.title = t.muted ? "Unmute tab" : "Mute tab" }
}

// the list in sidebar order: ungrouped tabs, and each group's header
// followed by all of its tabs, at the place of the group's first tab
function sequence (normal) {
  const out = []
  const seen = new Set()
  for (const t of normal) {
    const g = t.group ? G.getGroup(t.group) : null
    if (!g) { out.push({ tab: t }); continue }
    if (seen.has(g.id)) continue
    seen.add(g.id)
    const members = normal.filter((x) => x.group === g.id)
    out.push({ group: g, count: members.length })
    for (const m of members) out.push({ tab: m, g })
  }
  return out
}

const groupDrop = {
  active: () => !!dragId,
  drop: (gid) => { if (dragId) { const id = dragId; G.addToGroup(id, gid) } }
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

  const seq = sequence(normal)
  // only measure rows (FLIP) when the set or order of rows changed; title,
  // favicon and loading updates stream in constantly and need no layout reads
  const orderKey = seq.map((x) => (x.group ? `g:${x.group.id}:${x.group.collapsed ? 1 : 0}` : x.tab.id)).join(",")
  const reordered = orderKey !== lastOrder
  lastOrder = orderKey
  const before = reordered ? flip([...list.querySelectorAll(".vt-row:not(.is-leaving):not(.is-folded), .vt-group-h:not(.is-leaving)")]) : () => {}

  const keepTabs = new Set(normal.map((t) => t.id))
  for (const [id, el] of rows) {
    if (keepTabs.has(id)) continue
    rows.delete(id)
    collapseOut(el).then(placeIndicator)
  }
  const keepGroups = new Set(seq.filter((x) => x.group).map((x) => x.group.id))
  for (const [gid, el] of heads) {
    if (keepGroups.has(gid)) continue
    heads.delete(gid); dropHeader(gid)
    collapseOut(el)
  }

  let prev = null
  for (const item of seq) {
    let el
    if (item.group) {
      el = headerFor(item.group, { onDropTab: groupDrop })
      if (!heads.has(item.group.id)) { heads.set(item.group.id, el); el.classList.add("is-entering"); setTimeout(() => el.classList.remove("is-entering"), 600) }
      paintHeader(el, item.group, item.count)
    } else {
      const t = item.tab
      el = rows.get(t.id)
      if (!el) { el = row(t); rows.set(t.id, el); el.classList.add("is-entering"); setTimeout(() => el.classList.remove("is-entering"), 600) }
      update(el, t, activeId, item.g ?? null)
    }
    const want = prev ? prev.nextSibling : ind.nextSibling
    if (want !== el) list.insertBefore(el, want)
    prev = el
  }
  before()
  placeIndicator()     // the active row's height changes when its thumbnail arrives

  // already on an empty New Tab: a second "New Tab" button right under it is noise
  const a = tabs.find((t) => t.id === activeId)
  btnNew.classList.toggle("is-hidden", !!a && a.isHome && !a.pane && !a.private)

  if (reordered || activeId !== lastActive) list.querySelector(".vt-row.is-active")?.scrollIntoView({ block: "nearest" })
  lastActive = activeId
}

const foot = (icon, title, onclick, cls = "") => h(`button.vt-foot.vt-icon${cls}`, { title, "aria-label": title, onclick }, [ico(icon, 16)])

// one click cycles Auto → Light → Dark (classic themes are dark-only)
const MODES = ["auto", "light", "dark"]
const MODE_LABEL = { auto: "Appearance: Auto (follows macOS)", light: "Appearance: Light", dark: "Appearance: Dark" }
const modeBtn = foot("auto", "", () => {
  if (themeById(state.get("theme.active")).family === "classic") { state.set("theme.active", "glass"); return }
  const cur = state.get("theme.mode") ?? "auto"
  state.set("theme.mode", MODES[(MODES.indexOf(cur) + 1) % MODES.length])
}, ".vt-mode")
let paintedMode = ""
function paintMode () {
  const classic = themeById(state.get("theme.active")).family === "classic"
  const m = classic ? resolvedMode() : state.get("theme.mode") ?? "auto"
  const icon = m === "auto" ? "auto" : resolvedMode() === "light" ? "sun" : "moon"
  modeBtn.title = classic ? "This theme has one fixed look — click for Glass (light + dark)" : MODE_LABEL[m]
  modeBtn.setAttribute("aria-label", modeBtn.title)
  if (icon === paintedMode) return
  const first = !paintedMode
  paintedMode = icon
  modeBtn.replaceChildren(ico(icon, 16))
  if (!first) { modeBtn.classList.remove("is-turn"); void modeBtn.offsetWidth; modeBtn.classList.add("is-turn") }
}

// a second click on Settings closes it again
function toggleView (v, open) {
  const a = T.getActive()
  if (v === "settings" && a?.pane === "settings") T.closeTab(a.id)      // Settings is a tab: closing it goes back
  else if (window.__fluxView === v) bus.emit("view", T.viewFor(a))
  else open()
}

const moreBtn = foot("more", "More", () => moreMenu(moreBtn, { align: "start" }), ".vt-more")

// drag the sidebar's right edge to resize it; double-click puts it back
const VT_MIN = 190, VT_MAX = 420, VT_DEFAULT = 240
function resizeHandle () {
  // no hover tooltip: anchored to this full-height strip it landed on the toolbar
  const grip = h("div.vt-resize", { "aria-hidden": "true" })
  let x0 = 0, w0 = 0, w = 0, dragging = false
  const apply = (px) => document.documentElement.style.setProperty("--vt-w", `${px}px`)
  grip.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    grip.setPointerCapture(e.pointerId)
    dragging = true
    x0 = e.clientX; w0 = w = root.getBoundingClientRect().width
    document.body.classList.add("vt-resizing")
  })
  grip.addEventListener("pointermove", (e) => {
    if (!dragging) return
    const dx = document.body.dataset.vtSide === "right" ? x0 - e.clientX : e.clientX - x0   // sidebar on the right grows leftward
    w = Math.round(Math.min(VT_MAX, Math.max(VT_MIN, w0 + dx)))
    apply(w)
  })
  // Chromium has already dropped the capture by pointerup, so track the drag ourselves
  const end = () => {
    if (!dragging) return
    dragging = false
    document.body.classList.remove("vt-resizing")
    if (w !== w0) state.set("layout.vtabsWidth", w)
  }
  grip.addEventListener("pointerup", end)
  grip.addEventListener("pointercancel", end)
  grip.addEventListener("lostpointercapture", end)
  grip.addEventListener("dblclick", () => { apply(VT_DEFAULT); state.set("layout.vtabsWidth", VT_DEFAULT) })
  return grip
}

export function initVTabs () {
  root = document.getElementById("vtabs")
  tiles = h("div.vt-tiles", {
    ondragover: (e) => { if (dragId) { e.preventDefault(); tiles.classList.add("is-drop") } },
    ondragleave: () => tiles.classList.remove("is-drop"),
    ondrop: (e) => { e.preventDefault(); tiles.classList.remove("is-drop"); if (dragId) T.setPinned(dragId, true) }
  })
  ind = h("div.vt-ind", { "aria-hidden": "true" })
  list = h("div.vt-list", {}, [ind])
  const btnMarks = foot("bookmarks", "Bookmarks (⌥⌘B)", () => openBookmarks(btnMarks), ".vt-marks")
  btnMarks.dataset.bookmarksBtn = ""
  btnNew = h("button.vt-row.vt-new", { title: "New tab (⌘T)", onclick: () => T.newTab() }, [h("span.vt-fav", {}, [ico("plus", 15)]), h("span.vt-title", { text: "New Tab" })])
  mount(root, h("div.vt", {}, [
    h("div.vt-top", {}, [profileButton()]),
    tiles,
    h("div.vt-sep"),
    h("div.vt-scroll", {}, [list, btnNew]),
    nowPlaying(),
    h("div.vt-bottom", {}, [
      foot("gear", "Settings (⌘,)", () => toggleView("settings", () => bus.emit("view", "settings"))),
      btnMarks,
      foot("download", "Downloads (⌥⌘L)", () => openDownloadsPopover()),
      foot("eyeoff", "New private tab (⇧⌘N)", () => T.newTab(null, { private: true })),
      h("span.vt-flex"),
      modeBtn,
      moreBtn
    ])
  ]))
  root.append(resizeHandle())
  // rows change height without a tabs event (compact rows, a group folding,
  // a thumbnail arriving): the highlight follows the list's size, every frame
  let rif = 0
  new ResizeObserver(() => { if (!rif) rif = requestAnimationFrame(() => { rif = 0; placeIndicator() }) }).observe(list)
  bus.on("config", paintMode)
  paintMode()
  bus.on("tabs", render)
  bus.on("thumb", () => render({ tabs: T.getTabs(), activeId: T.getActiveId() }))
  // a group was just made: put its name up for editing once its header exists
  bus.on("group:rename", (gid) => setTimeout(() => renameHeader(gid), 30))
  bus.on("tab:rename", (id) => setTimeout(() => renameTab(id), 30))
  render({ tabs: T.getTabs(), activeId: T.getActiveId() })
}
