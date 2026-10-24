// ───────────────────────────────────────────────────────────────────
//  titlebar.js — the chrome.  Row 1 (window title bar): pinned-tab
//  capsule, tab pills, + and a right cluster (bookmark, downloads, AI,
//  overview).  Toolbar (inside the content frame): nav, the omnibox
//  with site/zoom/shield chips, and page actions.  Tabs render keyed so
//  they animate in/out and FLIP when reordered.
// ───────────────────────────────────────────────────────────────────
import { h, mount } from "../core/dom.js"
import { bus, toast } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { state } from "../core/state.js"
import { flip, leave } from "../core/motion.js"
import { fillActiveTab } from "./passwords.js"
import { attachOmnibox } from "./omnibox.js"
import { menu } from "./popover.js"
import { toggleBookmark, isBookmarked } from "./library.js"
import { openSiteInfo } from "./siteinfo.js"
import { openDownloads, downloadsBadge } from "./downloads.js"
import * as T from "../core/tabs.js"

const els = new Map()       // tabId -> element
let strip, pinnedBox, address, omni, btnStar, btnDl, btnBack, btnFwd, btnReload, chipZoom, chipShield, chipSite, addrWrap, crumb, btnStar2, btnDl2
let dragId = null

function iconBtn (name, title, onclick, cls = "") {
  return h(`button.tb-btn.no-drag${cls}`, { title, "aria-label": title, onclick }, [ico(name, 16)])
}

export function openDownloadsPopover () { openDownloads(btnDl2?.offsetParent ? btnDl2 : btnDl) }

export function tabMenu (t, anchor) {
  menu(anchor, [
    { label: "New Tab to the Right", icon: "plus", run: () => T.newTab(null, { index: T.getTabs().findIndex((x) => x.id === t.id) + 1 }) },
    "-",
    { label: t.pinned ? "Unpin Tab" : "Pin Tab", icon: "pin", run: () => T.setPinned(t.id, !t.pinned), disabled: t.isHome },
    { label: t.muted ? "Unmute Tab" : "Mute Tab", icon: t.muted ? "volume" : "volumeX", run: () => T.setMuted(t.id) },
    { label: "Duplicate", icon: "copy", run: () => T.duplicate(t.id), disabled: t.isHome },
    { label: t.inSplit ? "Exit Split View" : "Open in Split View", icon: "split", disabled: t.isHome, run: () => {
      if (t.inSplit) return T.clearSplit()
      const cur = T.getActive()
      if (cur && cur.id !== t.id && !cur.isHome) T.setSplit(cur.id, t.id); else { T.setActive(t.id); T.toggleSplit() }
    } },
    { label: "Reload", icon: "reload", run: () => T.reload(t.id), disabled: t.isHome },
    { label: "Sleep Tab", icon: "sleep", run: () => T.sleepTab(t.id), disabled: t.id === T.getActiveId() || t.isHome },
    { label: "Copy Link", icon: "link", run: () => { navigator.clipboard.writeText(t.url); toast("Link copied") }, disabled: t.isHome },
    { label: "Ask Flux AI About This Tab", icon: "spark", disabled: t.isHome, run: () => { T.setActive(t.id); bus.emit("ai:ask", { text: "Summarize this page.", withPage: true }) } },
    "-",
    { label: "Close Other Tabs", icon: "layers", run: () => T.closeOthers(t.id) },
    { label: "Close Tabs to the Right", icon: "forward", run: () => T.closeRight(t.id) },
    { label: "Close Tab", icon: "close", kbd: "⌘W", danger: true, run: () => T.closeTab(t.id) }
  ])
}

function favNode (t) {
  if (t.isHome) return ico("spark", 13)
  if (t.asleep && !t.favicon) return ico("sleep", 13)
  if (t.favicon) return h("img", { src: t.favicon, draggable: false, onerror: (e) => e.target.replaceWith(ico("globe", 13)) })
  return ico("globe", 13)
}

function tabEl (t) {
  const el = h("div.tab.no-drag", {
    draggable: true,
    onclick: () => T.setActive(t.id),
    onauxclick: (e) => { if (e.button === 1) { e.preventDefault(); T.closeTab(t.id) } },
    oncontextmenu: (e) => { e.preventDefault(); tabMenu(T.getTab(t.id), { x: e.clientX, y: e.clientY }) },
    ondragstart: (e) => { dragId = t.id; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/flux-tab", t.id); el.classList.add("is-dragging") },
    ondragend: () => { dragId = null; el.classList.remove("is-dragging"); strip.querySelectorAll(".drop-before,.drop-after").forEach((x) => x.classList.remove("drop-before", "drop-after")) },
    ondragover: (e) => {
      if (!dragId || dragId === t.id) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const after = e.clientX > r.left + r.width / 2
      el.classList.toggle("drop-after", after); el.classList.toggle("drop-before", !after)
    },
    ondragleave: () => el.classList.remove("drop-before", "drop-after"),
    ondrop: (e) => {
      e.preventDefault()
      const after = el.classList.contains("drop-after")
      el.classList.remove("drop-before", "drop-after")
      if (!dragId || dragId === t.id) return
      const list = T.getTabs()
      const from = list.findIndex((x) => x.id === dragId)
      let to = list.findIndex((x) => x.id === t.id) + (after ? 1 : 0)
      if (from < to) to--
      T.move(dragId, to)
    }
  })
  el.dataset.id = t.id
  el.append(h("span.tab-fav"), h("span.tab-title"), h("button.tab-audio.no-drag", { title: "Mute tab", onclick: (e) => { e.stopPropagation(); T.setMuted(t.id) } }), h("button.x.no-drag", { title: "Close (⌘W)", onclick: (e) => { e.stopPropagation(); T.closeTab(t.id) } }, [ico("close", 12)]))
  return el
}

function updateTabEl (el, t, activeId) {
  el.classList.toggle("is-active", t.id === activeId)
  el.classList.toggle("is-asleep", !!t.asleep)
  el.classList.toggle("is-loading", !!t.loading)
  el.classList.toggle("is-split", !!t.inSplit)
  el.classList.toggle("is-pinned", !!t.pinned)
  const title = t.isHome ? "New Tab" : (t.title || t.url || "New Tab")
  el.title = t.asleep ? `${title} — sleeping (click to wake)` : title
  const fav = el.querySelector(".tab-fav")
  const favKey = `${t.isHome}|${t.asleep}|${t.favicon}`
  if (fav.dataset.k !== favKey) { fav.dataset.k = favKey; fav.replaceChildren(favNode(t)) }
  const tt = el.querySelector(".tab-title")
  if (tt.textContent !== title) tt.textContent = title
  const au = el.querySelector(".tab-audio")
  const audioKey = t.muted ? "m" : t.audible ? "a" : ""
  if (au.dataset.k !== audioKey) { au.dataset.k = audioKey; au.replaceChildren(audioKey ? ico(t.muted ? "volumeX" : "volume", 12) : h("span")); au.hidden = !audioKey }
}

function renderTabs ({ tabs, activeId }) {
  const pinned = tabs.filter((t) => t.pinned)
  const normal = tabs.filter((t) => !t.pinned)

  // pinned capsule: favicon-only buttons
  pinnedBox.hidden = !pinned.length
  pinnedBox.replaceChildren(...pinned.map((t) => h(`button.pinned-tab.no-drag${t.id === activeId ? ".is-active" : ""}${t.audible ? ".is-audible" : ""}`, {
    title: t.title || t.url, onclick: () => T.setActive(t.id),
    oncontextmenu: (e) => { e.preventDefault(); tabMenu(t, { x: e.clientX, y: e.clientY }) }
  }, [favNode(t)])))

  // keyed tab pills
  const before = flip([...strip.querySelectorAll(".tab:not(.is-leaving)")])
  const keep = new Set(normal.map((t) => t.id))
  for (const [id, el] of els) {
    if (keep.has(id)) continue
    els.delete(id)
    el.classList.add("is-leaving")
    el.style.pointerEvents = "none"
    leave(el, document.body.dataset.animTabClose === "none" ? "none" : document.body.dataset.animTabClose).then(() => el.remove())
  }
  let prev = null
  for (const t of normal) {
    let el = els.get(t.id)
    if (!el) {
      el = tabEl(t)
      els.set(t.id, el)
      el.classList.add("is-entering")
      setTimeout(() => el.classList.remove("is-entering"), 700)
    }
    updateTabEl(el, t, activeId)
    const want = prev ? prev.nextSibling : strip.firstChild
    if (want !== el) strip.insertBefore(el, want)
    prev = el
  }
  before()

  const a = tabs.find((t) => t.id === activeId)
  const web = a && !a.isHome
  document.body.classList.toggle("on-home", !web)
  if (document.activeElement !== address) setAddress(a)
  btnBack.toggleAttribute("disabled", !web)
  btnFwd.toggleAttribute("disabled", !web)
  btnReload.replaceChildren(ico(a?.loading ? "close" : "reload", 16))
  btnReload.title = a?.loading ? "Stop" : "Reload (⌘R)"
  btnStar.classList.toggle("is-on", !!(web && isBookmarked(a.url)))
  btnStar2?.classList.toggle("is-on", !!(web && isBookmarked(a.url)))
  chipShield.hidden = !web || !a.blocked
  chipShield.querySelector("span").textContent = a?.blocked ?? ""
  strip.querySelector(".tab.is-active")?.scrollIntoView({ inline: "nearest", block: "nearest" })
  updateZoomChip()
}

function setAddress (a) {
  const url = a && !a.isHome && a.url && a.url !== "about:blank" ? a.url : ""
  address.dataset.full = url
  let shown = url
  if (url && !state.get("layout.showFullUrl")) {
    try { const u = new URL(url); shown = /^https?:$/.test(u.protocol) ? u.host.replace(/^www\./, "") + (u.pathname !== "/" ? u.pathname : "") : url } catch {}
  }
  address.value = shown
  // Dia-style breadcrumb: "site / page title"
  if (crumb) {
    let hostName = ""
    try { hostName = url ? new URL(url).host.replace(/^www\./, "") : "" } catch {}
    const title = a && !a.isHome ? (a.title && a.title !== url ? a.title : "") : ""
    crumb.replaceChildren(
      hostName ? h("span.crumb-host", { text: hostName }) : h("span.crumb-host", { text: "Search or enter address" }),
      title ? h("span.crumb-sep", { text: "/" }) : "",
      title ? h("span.crumb-title", { text: title }) : ""
    )
  }
  const secure = url.startsWith("https:")
  chipSite.replaceChildren(ico(!url ? "search" : secure ? "lock" : "info", 13))
  chipSite.classList.toggle("is-insecure", !!url && !secure)
}

function updateZoomChip () {
  const a = T.getActive()
  const z = a && !a.isHome ? T.zoomOf(a.id) : 1
  chipZoom.hidden = Math.abs(z - 1) < 0.01
  chipZoom.textContent = `${Math.round(z * 100)}%`
}

export function initTitlebar () {
  const bar = document.getElementById("titlebar")
  const toolbar = document.getElementById("toolbar")

  pinnedBox = h("div.pinned-box.no-drag")
  strip = h("div#tabstrip.no-drag")
  const btnNew = iconBtn("plus", "New tab (⌘T)", () => T.newTab(), ".tab-new")
  btnStar = iconBtn("bookmark", "Bookmark this page (⌘D)", () => toggleBookmark(), ".tb-circle")
  btnDl = iconBtn("download", "Downloads (⌥⌘L)", () => openDownloads(btnDl), ".tb-circle")
  btnDl.append(downloadsBadge())
  const btnAI = iconBtn("spark", "Flux AI (⌘J)", () => bus.emit("ai:toggle"), ".tb-circle.tb-ai")
  const btnOverview = iconBtn("overview", "Tab overview (⇧⌘\\)", () => bus.emit("overview:open"), ".tb-circle")

  mount(bar, h("div.tb-row", {}, [
    h("div.tb-traffic"),
    pinnedBox,
    h("div.tb-tabs", {}, [strip, btnNew]),
    h("div.tb-fill"),
    h("div.tb-cluster.no-drag", {}, [btnStar, btnDl]),
    h("div.tb-cluster.no-drag", {}, [btnAI, btnOverview])
  ]))

  // ── toolbar inside the frame ─────────────────────────────────────
  btnBack = iconBtn("back", "Back (⌘[)", () => T.back())
  btnFwd = iconBtn("forward", "Forward (⌘])", () => T.forward())
  btnReload = iconBtn("reload", "Reload (⌘R)", () => (T.getActive()?.loading ? T.stop() : T.reload()))
  const btnShare = iconBtn("share", "Copy link", () => { const u = T.getActive()?.url; if (u) { navigator.clipboard.writeText(u); toast("Link copied") } })
  btnBack.addEventListener("contextmenu", (e) => { e.preventDefault(); bus.emit("view", "library") })

  address = h("input#address.no-drag", {
    type: "text", placeholder: "Search, ask, or enter address",
    spellcheck: false, autocapitalize: "off", autocomplete: "off",
    onfocus: () => { address.value = address.dataset.full || address.value; requestAnimationFrame(() => address.select()) },
    onblur: () => setTimeout(() => { if (document.activeElement !== address) setAddress(T.getActive()) }, 150),
    onkeydown: (e) => { if (e.key === "Escape") { setAddress(T.getActive()); address.blur() } }
  })
  chipSite = h("button.ob-chip.no-drag", { title: "Site info & permissions", onclick: () => openSiteInfo(chipSite) })
  chipZoom = h("button.ob-chip.ob-zoom.no-drag", { title: "Reset zoom", hidden: true, onclick: () => T.zoomReset() })
  chipShield = h("button.ob-chip.ob-shield.no-drag", { title: "Trackers blocked on this page", hidden: true, onclick: () => openSiteInfo(chipSite) }, [ico("shield", 13), h("span")])
  const chipAI = h("button.ob-chip.ob-ask.no-drag", { title: "Ask Flux AI about this page (⇧⌘J)", onclick: () => bus.emit("ai:ask", { text: "", focusOnly: true, withPage: true }) }, [ico("spark", 13), h("span", { text: "Ask" })])
  crumb = h("button.crumb.no-drag", { title: "Edit address (⌘L)", onclick: () => { address.focus(); address.select() } })
  addrWrap = h("div#address-wrap.no-drag", {}, [chipSite, address, crumb, chipZoom, chipShield, chipAI])
  omni = attachOmnibox(address, { anchor: addrWrap, place: "toolbar" })

  const btnReader = iconBtn("book", "Reader mode (⌥⌘R)", () => bus.emit("reader:toggle"))
  const btnKey = iconBtn("key", "Fill saved login", () => fillActiveTab())
  const btnMore = iconBtn("more", "More", () => moreMenu(btnMore))

  // Dia-only pieces (hidden in the classic layout)
  const btnSide = iconBtn("sidebar", "Toggle sidebar (⌘B)", () => bus.emit("sidebar:toggle"), ".dia-only")
  btnStar2 = iconBtn("bookmark", "Bookmark (⌘D)", () => toggleBookmark(), ".dia-only")
  btnDl2 = iconBtn("download", "Downloads (⌥⌘L)", () => openDownloads(btnDl2), ".dia-only")
  btnDl2.append(downloadsBadge())

  mount(toolbar, h("div.tl-inner", {}, [
    h("div.tl-nav", {}, [btnSide, btnBack, h("span.tl-sep"), btnFwd, btnReload, btnShare]),
    addrWrap,
    h("div.tl-actions", {}, [btnReader, btnKey, btnStar2, btnDl2, btnMore])
  ]))

  bus.on("tabs", renderTabs)
  bus.on("shield", () => renderTabs({ tabs: T.getTabs(), activeId: T.getActiveId() }))
  bus.on("bookmarks", () => renderTabs({ tabs: T.getTabs(), activeId: T.getActiveId() }))
  bus.on("zoom", updateZoomChip)
  bus.on("focus-address", () => {
    if (T.getActive()?.isHome) { bus.emit("home:focus"); return }
    address.focus(); address.select()
  })
  // double-click empty title bar = zoom window (macOS convention)
  bar.addEventListener("dblclick", (e) => { if (e.target.closest(".tb-fill, .tb-row") === e.target) window.flux.win.max() })
  renderTabs({ tabs: T.getTabs(), activeId: T.getActiveId() })
}

function moreMenu (anchor) {
  const a = T.getActive()
  const web = a && !a.isHome
  menu(anchor, [
    { label: "New Tab", icon: "plus", kbd: "⌘T", run: () => T.newTab() },
    { label: "Command Palette", icon: "grid", kbd: "⌘K", run: () => bus.emit("palette:open") },
    "-",
    { label: "Find in Page", icon: "search", kbd: "⌘F", disabled: !web, run: () => bus.emit("find:open") },
    { label: "Split View", icon: "split", kbd: "⌘\\", disabled: !web, run: () => T.toggleSplit() },
    { label: "Picture in Picture", icon: "pip", disabled: !web, run: () => bus.emit("menu", { action: "pip" }) },
    { label: "Save Screenshot", icon: "image", kbd: "⇧⌘S", disabled: !web, run: () => bus.emit("menu", { action: "screenshot" }) },
    { label: "Print…", icon: "note", kbd: "⌘P", disabled: !web, run: () => a?.id && T.rawTab(a.id)?.wv.print() },
    { label: "Open in System Browser", icon: "external", disabled: !web, run: () => window.flux.openExternal(a.url) },
    "-",
    { label: "History", icon: "clock", kbd: "⌘Y", run: () => bus.emit("library:open", "history") },
    { label: "Bookmarks", icon: "bookmark", kbd: "⌥⌘B", run: () => bus.emit("library:open", "bookmarks") },
    { label: "Downloads", icon: "download", run: () => openDownloads(anchor) },
    "-",
    { label: "Ask Flux AI", icon: "spark", kbd: "⌘J", run: () => bus.emit("ai:toggle") },
    { label: "Focus Mode", icon: "focus", kbd: "⇧⌘F", run: () => bus.emit("focus:toggle") },
    { label: "Settings", icon: "gear", kbd: "⌘,", run: () => bus.emit("view", "settings") }
  ], { align: "end" })
}
