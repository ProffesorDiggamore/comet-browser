// ───────────────────────────────────────────────────────────────────
//  bmbar.js — the bookmarks bar: one slim row under the top bar with
//  every bookmark (⌘D adds one).  Click opens it here, ⌘-click opens a
//  background tab; what doesn't fit goes under » (the Bookmarks
//  popover, limited to those).  Right-click › Rename… names one in
//  place.  Show / hide with ⇧⌘B, View → Bookmarks Bar, More, or
//  Settings → Layout.
// ───────────────────────────────────────────────────────────────────
import { h, mount } from "../core/dom.js"
import { state } from "../core/state.js"
import { bus, toast } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { menu } from "./popover.js"
import { removeBookmark, renameBookmark, inlineRename, bookmarkLabel, bookmarkName, bookmarkPlaceholder } from "./library.js"
import { openBookmarks } from "./bookmarks.js"
import * as T from "../core/tabs.js"

export const bmBarOn = () => state.get("layout.bookmarksBar") !== false
export function toggleBmBar () {
  const on = !bmBarOn()
  state.set("layout.bookmarksBar", on)
  const none = !(state.get("bookmarks") ?? []).length
  toast(on ? (none ? "Bookmarks bar on — it appears once you bookmark a page (⌘D)" : "Bookmarks bar on (⇧⌘B hides it)") : "Bookmarks bar hidden (⇧⌘B shows it)")
}

const short = (s, n = 22) => { const t = String(s ?? "").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t }
// bar order: oldest first, so new bookmarks land at the end like Chrome
const marks = () => [...(state.get("bookmarks") ?? [])].reverse()

function favFor (url) {
  const f = T.faviconFor(url)
  return f ? h("img", { src: f, draggable: false, onerror: (e) => e.target.replaceWith(ico("globe", 13)) }) : ico("globe", 13)
}

function open (b, e) {
  if (e?.metaKey || e?.button === 1) T.newTab(b.url, { background: true })
  else T.navigate(b.url)
}

// edit the name right on the bar: the button becomes a field until Enter / Esc / click away
function renameItem (el, b) {
  const name = h("span.bm-name")
  const box = h("span.bm-item.is-editing", {}, [h("span.bm-fav", {}, [favFor(b.url)]), name])
  el.replaceWith(box)
  inlineRename(name, {
    value: bookmarkName(b), placeholder: bookmarkPlaceholder(b),
    onDone: (v) => { if (box.isConnected) box.replaceWith(el); if (v !== null) renameBookmark(b.url, v) }
  })
}

function itemMenu (anchor, b) {
  menu(anchor, [
    { label: "Open", icon: "arrowRight", run: () => T.navigate(b.url) },
    { label: "Open in New Tab", icon: "plus", run: () => T.newTab(b.url) },
    { label: "Open in Private Tab", icon: "eyeoff", run: () => T.newTab(b.url, { private: true }) },
    { label: "Copy Link", icon: "link", run: () => { navigator.clipboard.writeText(b.url); toast("Link copied") } },
    "-",
    { label: "Rename…", icon: "edit", run: () => renameItem(anchor, b) },
    { label: "Remove Bookmark", icon: "trash", danger: true, run: () => removeBookmark(b.url) },
    "-",
    { label: "Hide Bookmarks Bar", icon: "eyeoff", kbd: "⇧⌘B", run: toggleBmBar }
  ])
}

export function initBmBar () {
  const content = document.getElementById("content")
  const bar = h("div#bmbar", { role: "toolbar", "aria-label": "Bookmarks bar" })
  content.append(bar)
  const items = h("div.bm-items")
  const more = h("button.bm-more", { title: "More bookmarks", "aria-label": "More bookmarks" }, [ico("chevron", 13)])
  // the ones that didn't fit, in the Bookmarks popover (search, rename, right-click there too)
  more.addEventListener("click", () => openBookmarks(more, { only: marks().slice(more._from ?? 0).map((b) => b.url) }))
  bar.addEventListener("contextmenu", (e) => {
    if (e.target.closest(".bm-item")) return
    e.preventDefault()
    menu(bar, [{ label: "Hide Bookmarks Bar", icon: "eyeoff", kbd: "⇧⌘B", run: toggleBmBar }, { label: "Show All Bookmarks", icon: "bookmarks", kbd: "⌥⌘B", run: () => openBookmarks() }, { label: "Manage in Library…", icon: "clock", run: () => bus.emit("library:open", "bookmarks") }])
  })
  mount(bar, h("div.bm-row", {}, [items, more]))

  // hide what doesn't fit; it moves under »
  const fit = () => {
    const kids = [...items.children].filter((k) => k.classList.contains("bm-item"))
    for (const k of kids) k.hidden = false
    more.hidden = true
    const max = items.clientWidth
    let from = kids.length
    for (let i = 0; i < kids.length; i++) {
      if (kids[i].offsetLeft + kids[i].offsetWidth > max) { from = i; break }
    }
    if (from < kids.length) {
      more.hidden = false
      // the » button takes room too: recheck with it showing
      const max2 = items.clientWidth
      while (from > 0 && kids[from - 1].offsetLeft + kids[from - 1].offsetWidth > max2) from--
      kids.slice(from).forEach((k) => { k.hidden = true })
    }
    more._from = from
  }

  const render = () => {
    // an empty bar only said "bookmarks show up here" and cost every page a row
    const list = marks()
    const on = bmBarOn() && list.length > 0
    document.body.classList.toggle("has-bmbar", on)
    if (!on) return
    items.replaceChildren(...(list.length
      ? list.map((b) => {
        const el = h("button.bm-item", { title: `${bookmarkLabel(b)}\n${b.url}` }, [h("span.bm-fav", {}, [favFor(b.url)]), h("span.bm-name", { text: short(bookmarkLabel(b)) })])
        el.addEventListener("click", (e) => open(b, e))
        el.addEventListener("auxclick", (e) => { if (e.button === 1) { e.preventDefault(); open(b, e) } })
        el.addEventListener("contextmenu", (e) => { e.preventDefault(); itemMenu(el, b) })
        return el
      })
      : [h("span.bm-empty", { text: "Bookmarks you add with ⌘D show up here." })]))
    requestAnimationFrame(fit)
  }

  let sig = ""
  const check = () => {
    const s = JSON.stringify([bmBarOn(), (state.get("bookmarks") ?? []).map((b) => [b.url, b.title, T.faviconFor(b.url)])])
    if (s !== sig) { sig = s; render() }
  }
  bus.on("config", check)
  bus.on("tabs", check)   // a bookmarked site's favicon is learned once one of its pages loads
  bus.on("bookmarks", render)
  let rf = 0      // next frame: fitting changes the row's own width (» appears), which would loop the observer
  new ResizeObserver(() => { if (!bmBarOn() || rf) return; rf = requestAnimationFrame(() => { rf = 0; fit() }) }).observe(items)
  render()
}
