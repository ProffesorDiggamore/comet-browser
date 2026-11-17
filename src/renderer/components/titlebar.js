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
import { flip, leave, effectiveMode, ms } from "../core/motion.js"
import { attachOmnibox } from "./omnibox.js"
import { menu } from "./popover.js"
import { toggleBookmark, isBookmarked } from "./library.js"
import { openSiteInfo } from "./siteinfo.js"
import { openDownloads, downloadsBadge } from "./downloads.js"
import * as T from "../core/tabs.js"
import { profileButton } from "./profiles.js"
import * as G from "../core/groups.js"

const els = new Map()       // tabId -> element
let strip, pinnedBox, address, omni, btnStar, btnDl, btnBack, btnFwd, btnReload, chipZoom, chipShield, chipSite, chipCopy, addrWrap, crumb, btnStar2
let crumbKey = ""
let lastOrder = "", lastActive = null
let dragId = null

function iconBtn (name, title, onclick, cls = "") {
  return h(`button.tb-btn.no-drag${cls}`, { title, "aria-label": title, onclick }, [ico(name, 16)])
}

// restart a one-shot CSS animation class (icon spin, bookmark pop)
function kick (el, cls) {
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls)
  el.addEventListener("animationend", () => el.classList.remove(cls), { once: true })
}

// sidebar layout: from the sidebar's Downloads button; classic: the title bar's
export function openDownloadsPopover () {
  const side = document.querySelector('.vt-bottom [aria-label^="Downloads"]')
  openDownloads(side?.offsetParent ? side : btnDl)
}

// group entries for the tab menu: new group, move to another, or out
function groupItems (t) {
  if (t.pinned) return []
  const others = G.getGroups().filter((g) => g.id !== t.group)
  return [
    "-",
    { label: "Add Tab to New Group", icon: "folder", kbd: "⌥⌘G", run: () => G.createGroup([t.id]) },
    ...others.slice(0, 8).map((g) => ({ label: `Move to “${g.name || "Untitled group"}”`, swatch: G.colorVar(g.color), run: () => G.addToGroup(t.id, g.id) })),
    t.group && { label: "Remove from Group", icon: "layers", run: () => G.removeFromGroup(t.id) }
  ]
}

export function tabMenu (t, anchor) {
  const dia = document.body.dataset.layout === "dia"
  menu(anchor, [
    { label: dia ? "New Tab Below" : "New Tab to the Right", icon: "plus", run: () => T.newTab(null, { index: T.getTabs().findIndex((x) => x.id === t.id) + 1, group: t.group }) },
    dia && { label: "Rename Tab…", icon: "edit", run: () => bus.emit("tab:rename", t.id) },
    dia && t.customTitle && { label: "Restore Page Title", icon: "reset", run: () => T.patchTab(t.id, { customTitle: null }) },
    ...(dia ? groupItems(t) : []),
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
    { label: "Ask Comet AI About This Tab", icon: "spark", disabled: t.isHome, run: () => { T.setActive(t.id); bus.emit("ai:ask", { text: "Summarize this page.", withPage: true }) } },
    "-",
    { label: "Close Other Tabs", icon: "layers", run: () => T.closeOthers(t.id) },
    { label: dia ? "Close Tabs Below" : "Close Tabs to the Right", icon: dia ? "chevronDown" : "forward", run: () => T.closeRight(t.id) },
    { label: "Close Tab", icon: "close", kbd: "⌘W", danger: true, run: () => T.closeTab(t.id) }
  ])
}

function favNode (t) {
  if (t.pane === "settings") return ico("gear", 13)
  if (t.isHome) return ico("home", 13)       // the comet mark read as a loading spinner at this size
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
  el.append(h("span.tab-fav"), h("span.tab-title"), h("button.tab-audio.no-drag", { title: "Mute tab", onclick: (e) => { e.stopPropagation(); T.setMuted(t.id) } }), h("span.tab-gap"), h("button.x.no-drag", { title: "Close (⌘W)", onclick: (e) => { e.stopPropagation(); T.closeTab(t.id) } }, [ico("close", 12)]))
  return el
}

function updateTabEl (el, t, activeId) {
  el.classList.toggle("is-active", t.id === activeId)
  el.classList.toggle("is-asleep", !!t.asleep)
  el.classList.toggle("is-loading", !!t.loading)
  el.classList.toggle("is-split", !!t.inSplit)
  el.classList.toggle("is-pinned", !!t.pinned)
  el.classList.toggle("is-private", !!t.private)
  const title = t.pane === "settings" ? "Settings" : t.isHome ? "New Tab" : (t.title || t.url || "New Tab")
  el.title = t.asleep ? `${title} — sleeping (click to wake)` : title
  const fav = el.querySelector(".tab-fav")
  const favKey = `${t.isHome}|${t.pane}|${t.asleep}|${t.favicon}`
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
  const orderKey = normal.map((t) => t.id).join(",")
  const reordered = orderKey !== lastOrder
  lastOrder = orderKey
  const before = reordered ? flip([...strip.querySelectorAll(".tab:not(.is-leaving)")]) : () => {}
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
  // New Tab has its own big search field: the toolbar's pill would be a second copy of it
  document.body.classList.toggle("on-newtab", !!a && a.isHome && !a.pane && state.get("home.showSearch") !== false)
  document.body.classList.toggle("is-private-tab", !!a?.private)
  if (document.activeElement !== address) setAddress(a)
  btnBack.toggleAttribute("disabled", !web)
  btnFwd.toggleAttribute("disabled", !web)
  btnReload.replaceChildren(ico(a?.loading ? "close" : "reload", 16))
  btnReload.title = a?.loading ? "Stop" : "Reload (⌘R)"
  btnStar.classList.toggle("is-on", !!(web && isBookmarked(a.url)))
  btnStar2?.classList.toggle("is-on", !!(web && isBookmarked(a.url)))
  chipShield.hidden = !web || !a.blocked
  chipShield.querySelector("span").textContent = a?.blocked ?? ""
  if (reordered || activeId !== lastActive) strip.querySelector(".tab.is-active")?.scrollIntoView({ inline: "nearest", block: "nearest" })
  lastActive = activeId
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
    if (a?.pane === "settings") hostName = "Comet"
    const title = a?.pane === "settings" ? "Settings" : a && !a.isHome ? (a.title && a.title !== url ? a.title : "") : ""
    const key = `${hostName}\n${title}`
    if (key !== crumbKey) {
      const swapSite = key.split("\n")[0] !== crumbKey.split("\n")[0]
      crumbKey = key
      crumb.replaceChildren(
        hostName ? h("span.crumb-host", { text: hostName }) : h("span.crumb-host.is-empty", { text: "Search or enter address" }),
        title ? h("span.crumb-sep", { text: "/" }) : "",
        title ? h("span.crumb-title", { text: title }) : ""
      )
      // a new site slides in; a new title on the same site just settles
      if (effectiveMode() !== "off") {
        (swapSite ? crumb : crumb.lastElementChild)?.animate(
          [{ opacity: 0, transform: `translateY(${swapSite ? 5 : 3}px)` }, { opacity: 1, transform: "none" }],
          { duration: ms("med"), easing: "cubic-bezier(0.22, 1, 0.36, 1)" })
      }
    }
  }
  if (chipCopy) chipCopy.hidden = !url
  const secure = url.startsWith("https:")
  chipSite.replaceChildren(ico(a?.pane === "settings" ? "gear" : !url ? "search" : secure ? "lock" : "info", 13))
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
  const btnAI = iconBtn("spark", "Comet AI (⌘J)", () => bus.emit("ai:toggle"), ".tb-circle.tb-ai")
  const btnOverview = iconBtn("overview", "Tab overview (⇧⌘\\)", () => bus.emit("overview:open"), ".tb-circle")

  mount(bar, h("div.tb-row", {}, [
    h("div.tb-traffic"),
    pinnedBox,
    h("div.tb-tabs", {}, [strip, btnNew]),
    h("div.tb-fill"),
    h("div.tb-cluster.no-drag", {}, [btnStar, btnDl]),
    h("div.tb-cluster.no-drag", {}, [btnAI, btnOverview]),
    h("div.tb-cluster.no-drag", {}, [profileButton({ compact: true })])
  ]))

  // ── toolbar inside the frame ─────────────────────────────────────
  btnBack = iconBtn("back", "Back (⌘[)", () => T.back(), ".tb-back")
  btnFwd = iconBtn("forward", "Forward (⌘])", () => T.forward(), ".tb-fwd")
  btnReload = iconBtn("reload", "Reload (⌘R)", () => { if (T.getActive()?.loading) T.stop(); else { kick(btnReload, "is-spin"); T.reload() } })
  btnBack.addEventListener("contextmenu", (e) => { e.preventDefault(); bus.emit("view", "library") })

  address = h("input#address.no-drag", {
    type: "text", placeholder: "Search, ask, or enter address",
    spellcheck: false, autocapitalize: "off", autocomplete: "off",
    onfocus: () => { addrWrap.classList.add("is-editing"); address.value = address.dataset.full || address.value; address.select() },
    onblur: () => { addrWrap.classList.remove("is-editing"); setTimeout(() => { if (document.activeElement !== address) setAddress(T.getActive()) }, 150) },
    onkeydown: (e) => { if (e.key === "Escape") { setAddress(T.getActive()); address.blur() } }
  })
  chipSite = h("button.ob-chip.no-drag", { title: "Site info & permissions", onclick: () => openSiteInfo(chipSite) })
  // while you type something new, the lock would vouch for a page you haven't gone to yet
  address.addEventListener("input", () => { if (address.value !== address.dataset.full) chipSite.replaceChildren(ico("search", 13)) })
  chipZoom = h("button.ob-chip.ob-zoom.no-drag", { title: "Reset zoom", hidden: true, onclick: () => T.zoomReset() })
  chipShield = h("button.ob-chip.ob-shield.no-drag", { title: "Trackers blocked on this page", hidden: true, onclick: () => openSiteInfo(chipSite) }, [ico("shield", 13), h("span")])
  chipCopy = h("button.ob-chip.ob-copy.no-drag", { title: "Copy link", hidden: true, onclick: () => {
    const u = T.getActive()?.url
    if (!u) return
    navigator.clipboard.writeText(u); toast("Link copied")
    chipCopy.replaceChildren(ico("check", 13)); setTimeout(() => chipCopy.replaceChildren(ico("link", 13)), 1200)
  } }, [ico("link", 13)])
  const chipAI = h("button.ob-chip.ob-ask.no-drag", { title: "Ask Comet AI about this page (⇧⌘J)", onclick: () => bus.emit("ai:ask", { text: "", focusOnly: true, withPage: true }) }, [ico("spark", 13), h("span", { text: "Ask" })])
  // mousedown, not click: focusing the crumb flips #address-wrap to :focus-within,
  // which hides the crumb before mouseup, so a click event would never land
  crumb = h("button.crumb.no-drag", { "aria-label": "Edit address", tabindex: -1, onmousedown: (e) => { e.preventDefault(); address.focus() } })
  // shown while the active tab is private (body.is-private-tab)
  const chipPrivate = h("span.ob-chip.ob-private", { title: "Private tab: no history, and its cookies and logins are forgotten when you close it" }, [ico("eyeoff", 13), h("span", { text: "Private" })])
  addrWrap = h("div#address-wrap.no-drag", {}, [chipSite, address, crumb, chipPrivate, chipZoom, chipShield, chipCopy, chipAI])
  // the chips act without taking focus (which would flip the pill in or out of editing);
  // any other click on the pill starts editing
  for (const c of [chipSite, chipZoom, chipShield, chipCopy]) c.addEventListener("mousedown", (e) => e.preventDefault())
  addrWrap.addEventListener("mousedown", (e) => { if (e.target === addrWrap) { e.preventDefault(); address.focus() } })
  omni = attachOmnibox(address, { anchor: addrWrap, place: "toolbar" })

  const btnReader = iconBtn("book", "Reader mode (⌥⌘R)", () => bus.emit("reader:toggle"), ".web-only")
  // the sidebar layout has More at the bottom of the sidebar instead
  const btnMore = iconBtn("more", "More", () => moreMenu(btnMore), ".classic-only")

  // Dia-only pieces (hidden in the classic layout)
  const btnSide = iconBtn("sidebar", "Toggle sidebar (⌘B)", () => bus.emit("sidebar:toggle"), ".dia-only")
  btnStar2 = iconBtn("bookmark", "Bookmark this page (⌘D)", () => toggleBookmark(), ".dia-only.web-only")

  mount(toolbar, h("div.tl-inner", {}, [
    h("div.tl-nav", {}, [btnSide, btnBack, h("span.tl-sep"), btnFwd, btnReload]),
    addrWrap,
    h("div.tl-actions", {}, [btnReader, btnStar2, btnMore])
  ]))

  bus.on("tabs", renderTabs)
  bus.on("shield", () => renderTabs({ tabs: T.getTabs(), activeId: T.getActiveId() }))
  bus.on("bookmarks", () => {
    const was = btnStar2.classList.contains("is-on")
    renderTabs({ tabs: T.getTabs(), activeId: T.getActiveId() })
    if (!was && btnStar2.classList.contains("is-on")) { kick(btnStar2, "is-pop"); kick(btnStar, "is-pop") }
  })
  bus.on("zoom", updateZoomChip)
  bus.on("config", () => { const a = T.getActive(); document.body.classList.toggle("on-newtab", !!a && a.isHome && !a.pane && state.get("home.showSearch") !== false) })
  bus.on("focus-address", () => {
    if (T.getActive()?.isHome) { bus.emit("home:focus"); return }
    address.focus(); address.select()
  })
  // double-click empty title bar = zoom window (macOS convention)
  bar.addEventListener("dblclick", (e) => { if (e.target.closest(".tb-fill, .tb-row") === e.target) window.flux.win.max() })
  renderTabs({ tabs: T.getTabs(), activeId: T.getActiveId() })
}

export function moreMenu (anchor, opts = {}) {
  const a = T.getActive()
  const web = a && !a.isHome
  menu(anchor, [
    { label: "New Tab", icon: "plus", kbd: "⌘T", run: () => T.newTab() },
    { label: "New Private Tab", icon: "eyeoff", kbd: "⇧⌘N", run: () => T.newTab(null, { private: true }) },
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
    { label: "Bookmarks Bar", checked: state.get("layout.bookmarksBar") !== false, kbd: "⇧⌘B", run: () => bus.emit("menu", { action: "bookmarks-bar" }) },
    { label: "Downloads", icon: "download", run: () => openDownloads(anchor) },
    "-",
    { label: "Ask Comet AI", icon: "spark", kbd: "⌘J", run: () => bus.emit("ai:toggle") },
    { label: "Focus Mode", icon: "focus", kbd: "⇧⌘F", run: () => bus.emit("focus:toggle") },
    { label: "Settings", icon: "gear", kbd: "⌘,", run: () => bus.emit("view", "settings") }
  ], { align: "end", ...opts })
}
