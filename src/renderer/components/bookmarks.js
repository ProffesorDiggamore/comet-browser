// ───────────────────────────────────────────────────────────────────
//  bookmarks.js — the Bookmarks popover: a compact glass list of every
//  bookmark, anchored to the bookmarks button (sidebar footer, or the
//  toolbar in the tabs-on-top layout and when the sidebar is folded
//  away) or opened with ⌥⌘B.  Type to filter; ↑↓ (←→ in the grid) and
//  ⏎ open in a new tab (an empty New Tab is reused); ⌘-click opens in
//  the background, ⇧-click in Peek.  Rename
//  with a double-click or right-click › Rename….  The bar's » opens
//  the same popover with just the bookmarks that didn't fit.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { state } from "../core/state.js"
import { bus, toast, actionToast } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { popover, closePopover } from "./popover.js"
import { addBookmark, removeBookmark, renameBookmark, isBookmarked, inlineRename, hostLabel, bookmarkLabel, bookmarkName, bookmarkPlaceholder, openBookmarkUrl } from "./library.js"
import * as T from "../core/tabs.js"

const GRID_KEY = "comet.bookmarks.grid"
const COLS = 4             // grid columns (matches .bmp-list.is-grid)
const CLICK_DELAY = 240    // a single click waits this long to see if it's a double-click (rename)

let cur = null             // the open popover's handle

const readGrid = () => { try { return localStorage.getItem(GRID_KEY) === "1" } catch { return false } }
const saveGrid = (v) => { try { localStorage.setItem(GRID_KEY, v ? "1" : "0") } catch {} }
const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s)
// bar order: oldest first, like the bookmarks bar
const allMarks = () => [...(state.get("bookmarks") ?? [])].reverse()

function favNode (url, size) {
  const mono = () => h("span.bmp-mono", { text: (hostLabel(url)[0] || "•").toUpperCase() })
  const f = T.faviconFor(url)
  return f ? h("img", { src: f, width: size, height: size, alt: "", draggable: false, onerror: (e) => e.target.replaceWith(mono()) }) : mono()
}

// the bookmarks button that's on screen right now (sidebar footer or toolbar)
function visibleButton () {
  return [...document.querySelectorAll("[data-bookmarks-btn]")].find((el) =>
    el.getBoundingClientRect().width > 0 && (el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) ?? !!el.offsetParent)) ?? null
}

export const isBookmarksOpen = () => !!cur

// delete with an Undo toast that puts it back where it was
export async function deleteBookmark (b) {
  const idx = (state.get("bookmarks") ?? []).findIndex((x) => x.url === b.url)
  await removeBookmark(b.url)
  actionToast(`Removed “${short(bookmarkLabel(b), 34)}”`, "Undo", async () => {
    const now = state.get("bookmarks") ?? []
    if (now.some((x) => x.url === b.url)) return
    const next = [...now]
    next.splice(Math.max(0, Math.min(idx, next.length)), 0, b)
    await state.set("bookmarks", next)
    bus.emit("bookmarks")
  }, 6000)
}

// anchor: the button it hangs from (null = whichever bookmarks button is
// showing).  only: a list of URLs to limit it to (the bar's » overflow).
export function openBookmarks (anchor = null, { only = null } = {}) {
  // the shortcut / a second press closes it again
  if (cur && (!anchor || anchor === cur.anchor)) { closePopover(); return }
  // where focus goes back to on close: the button it was opened from, else where it was (⌥⌘B)
  const back = anchor ?? document.activeElement
  anchor = anchor ?? visibleButton()
  const onlySet = only ? new Set(only) : null
  let q = ""
  let sel = 0
  let grid = readGrid()
  let items = []
  let editing = null
  let ctx = null
  let clickT = 0
  let focusUrl = null
  let popEl = null
  let hereKey = ""
  let leaving = false        // closing to open a bookmark: focus belongs to the page, not the button

  const search = h("input.bmp-search", {
    type: "text", placeholder: onlySet ? "Filter these bookmarks" : "Search bookmarks", spellcheck: false, autocomplete: "off",
    role: "combobox", "aria-label": "Search bookmarks", "aria-controls": "bmp-list", "aria-expanded": "true"
  })
  const viewBtn = h("button.bmp-view", { onclick: () => { grid = !grid; saveGrid(grid); render(); search.focus() } })
  const here = h("div.bmp-here")
  const list = h("div#bmp-list.bmp-list", { role: "listbox", "aria-label": "Bookmarks" })
  const foot = h("div.bmp-foot")
  const root = h("div.bmp", {}, [
    h("div.bmp-head", {}, [h("label.bmp-searchbox", {}, [ico("search", 14), search]), viewBtn]),
    here, list, foot
  ])

  // ── rendering ─────────────────────────────────────────────────────
  function render () {
    if (editing) return
    closeCtx()
    const ql = q.toLowerCase()
    const pool = onlySet ? allMarks().filter((b) => onlySet.has(b.url)) : allMarks()
    items = ql ? pool.filter((b) => `${b.title} ${b.url}`.toLowerCase().includes(ql)) : pool
    if (focusUrl) { const i = items.findIndex((b) => b.url === focusUrl); if (i >= 0) sel = i; focusUrl = null }
    sel = Math.max(0, Math.min(sel, items.length - 1))

    viewBtn.replaceChildren(ico(grid ? "list" : "grid", 15))
    viewBtn.title = grid ? "Show as list" : "Show as grid"
    viewBtn.setAttribute("aria-label", viewBtn.title)
    viewBtn.hidden = !pool.length
    renderHere()

    list.classList.toggle("is-grid", grid && items.length > 0)
    list.replaceChildren(...(items.length ? items.map((b, i) => (grid ? tile(b, i) : row(b, i))) : [emptyState(pool.length)]))
    paintSel(true)

    const total = (state.get("bookmarks") ?? []).length
    foot.hidden = !!onlySet || !total
    if (!foot.hidden) {
      const barOn = state.get("layout.bookmarksBar") !== false
      foot.replaceChildren(
        h("span.bmp-count", { text: q ? `${items.length} of ${total}` : `${total} bookmark${total === 1 ? "" : "s"}` }),
        h("button.bmp-link", { title: "Bookmarks bar (⇧⌘B)", onclick: () => { bus.emit("menu", { action: "bookmarks-bar" }); setTimeout(render, 0) } }, barOn ? "Hide Bookmarks Bar" : "Show Bookmarks Bar")
      )
    }
    reposition()
  }

  function row (b, i) {
    return h("div.bmp-row", { role: "option", id: `bmp-o${i}`, dataset: { i } }, [
      h("span.bmp-fav", {}, [favNode(b.url, 16)]),
      h("span.bmp-text", {}, [h("span.bmp-title", { text: bookmarkLabel(b) }), h("span.bmp-host", { text: hostLabel(b.url) || b.url })])
    ])
  }

  function tile (b, i) {
    return h("div.bmp-tile", { role: "option", id: `bmp-o${i}`, title: `${bookmarkLabel(b)}\n${hostLabel(b.url) || b.url}`, dataset: { i } }, [
      h("span.bmp-fav", {}, [favNode(b.url, 20)]),
      h("span.bmp-title", { text: bookmarkLabel(b) })
    ])
  }

  function emptyState (anyAtAll) {
    if (anyAtAll) return h("div.bmp-empty", {}, [h("span", { text: `No bookmarks match “${short(q, 30)}”.` })])
    return h("div.bmp-empty", {}, [
      h("span.bmp-empty-ico", {}, [ico("bookmarks", 22)]),
      h("strong", { text: "No bookmarks yet" }),
      h("span", { text: "Press ⌘D, or the bookmark button in the toolbar, to save the page you're on. It'll show up here." })
    ])
  }

  // "Add This Page" / "Remove This Page" for the active tab
  function renderHere () {
    const a = T.getActive()
    const web = a && !a.isHome && !a.pane && a.url && a.url !== "about:blank"
    here.hidden = !!onlySet || !web
    if (here.hidden) { hereKey = ""; return }
    const on = isBookmarked(a.url)
    // tabs events stream in while a page loads: only rebuild when this row would change
    const key = `${a.url}|${a.title}|${on}`
    if (key === hereKey) return
    hereKey = key
    here.replaceChildren(h(`button.bmp-here-btn${on ? ".is-on" : ""}`, {
      onclick: async () => {
        if (isBookmarked(a.url)) await removeBookmark(a.url)
        else { focusUrl = a.url; q = ""; search.value = ""; await addBookmark({ url: a.url, title: a.title }) }
        search.focus()
      }
    }, [
      h("span.bmp-here-ico", {}, [ico("bookmark", 15)]),
      h("span.bmp-text", {}, [h("span.bmp-title", { text: on ? "Remove This Page" : "Add This Page" }), h("span.bmp-host", { text: a.title || hostLabel(a.url) })]),
      h("kbd.bmp-kbd", { text: "⌘D" })
    ]))
  }

  function paintSel (scroll) {
    const kids = [...list.querySelectorAll("[data-i]")]
    kids.forEach((k, i) => { k.classList.toggle("is-sel", i === sel); k.setAttribute("aria-selected", String(i === sel)) })
    if (kids[sel]) search.setAttribute("aria-activedescendant", kids[sel].id)
    else search.removeAttribute("aria-activedescendant")
    if (scroll) kids[sel]?.scrollIntoView({ block: "nearest" })
  }

  // opened upward from the sidebar footer: keep its bottom on the button as the list grows/shrinks
  function reposition () {
    if (!popEl || !(anchor instanceof Element)) return
    const r = anchor.getBoundingClientRect()
    const hh = popEl.offsetHeight
    const top = parseFloat(popEl.style.top) || 0
    if (top < r.top) popEl.style.top = `${Math.max(8, r.top - hh - 8)}px`
    else if (top + hh > window.innerHeight - 8) popEl.style.top = `${Math.max(8, window.innerHeight - 8 - hh)}px`
  }

  // ── actions ───────────────────────────────────────────────────────
  function openMark (b, how = "tab") {
    if (how === "bg") {
      openBookmarkUrl(b.url, { background: true })
      const el = list.querySelector(`[data-i="${items.indexOf(b)}"]`)
      if (el) { el.classList.remove("is-opened"); void el.offsetWidth; el.classList.add("is-opened") }
      return
    }
    leaving = true
    closePopover()
    if (how === "peek") bus.emit("peek:open", { url: b.url })
    else openBookmarkUrl(b.url, { here: how === "here" })
  }

  function startRename (i) {
    const b = items[i]
    const node = list.querySelector(`[data-i="${i}"] .bmp-title`)
    if (!b || !node) return
    closeCtx()
    sel = i
    paintSel(true)
    node.closest("[data-i]").classList.add("is-editing")
    editing = inlineRename(node, {
      value: bookmarkName(b), placeholder: bookmarkPlaceholder(b), cls: "bmp-edit",
      onDone: async (v) => {
        editing = null
        if (v !== null) await renameBookmark(b.url, v)
        if (!cur) return
        render()
        requestAnimationFrame(() => { const f = document.activeElement; if (!f || f === document.body) search.focus() })
      }
    })
  }

  // right-click menu, drawn inside the popover (opening a second popover would close this one)
  function openCtx (i, x, y) {
    const b = items[i]
    if (!b) return
    closeCtx()
    const entries = [
      ["Open in New Tab", "plus", () => openMark(b, "tab")],
      ["Open in This Tab", "arrowRight", () => openMark(b, "here")],
      ["Open in Background", "layers", () => openMark(b, "bg"), "⌘-click"],
      ["Open in Peek", "eye", () => openMark(b, "peek"), "⇧-click"],
      "-",
      ["Rename…", "edit", () => startRename(i)],
      ["Copy Link", "link", () => { navigator.clipboard.writeText(b.url); toast("Link copied") }],
      "-",
      ["Delete", "trash", () => deleteBookmark(b), null, true]
    ]
    const btns = []
    ctx = h("div.menu.bmp-ctx.glass", { role: "menu" }, entries.map((it) => {
      if (it === "-") return h("div.mi-sep")
      const [label, icon, run, kbd, danger] = it
      const b2 = h(`button.mi${danger ? ".is-danger" : ""}`, { role: "menuitem", onclick: () => { closeCtx(); run() } }, [
        h("span.mi-ico", {}, [ico(icon, 15)]), h("span.mi-label", { text: label }), kbd && h("kbd.mi-kbd", { text: kbd })
      ])
      btns.push(b2)
      return b2
    }))
    ctx.addEventListener("keydown", (e) => {
      const k = btns.indexOf(document.activeElement)
      if (e.key === "ArrowDown") { e.preventDefault(); btns[(k + 1) % btns.length].focus() }
      if (e.key === "ArrowUp") { e.preventDefault(); btns[(k - 1 + btns.length) % btns.length].focus() }
    })
    root.append(ctx)
    // fit it on screen, then place it relative to the popover (its containing block)
    const w = ctx.offsetWidth, hh = ctx.offsetHeight
    const px = Math.max(8, Math.min(x, window.innerWidth - w - 8))
    const py = y + hh > window.innerHeight - 8 ? Math.max(8, y - hh) : y
    const pr = root.getBoundingClientRect()     // .bmp is position: relative, so it's the menu's containing block
    ctx.style.left = `${px - pr.left}px`
    ctx.style.top = `${py - pr.top}px`
  }

  function closeCtx () {
    if (!ctx) return
    ctx.remove()
    ctx = null
  }

  // ── input ─────────────────────────────────────────────────────────
  search.addEventListener("input", () => { q = search.value.trim(); sel = 0; render() })
  search.addEventListener("keydown", (e) => {
    const step = (d) => { e.preventDefault(); if (!items.length) return; sel = Math.max(0, Math.min(items.length - 1, sel + d)); paintSel(true) }
    // the right-click menu is open: ↑↓ move into it, ⏎ just dismisses it (never opens the list's selection)
    if (ctx) {
      const mis = [...ctx.querySelectorAll(".mi")]
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); (e.key === "ArrowDown" ? mis[0] : mis[mis.length - 1])?.focus() }
      else if (e.key === "Enter") { e.preventDefault(); closeCtx() }
      return
    }
    if (e.key === "ArrowDown") step(grid ? COLS : 1)
    else if (e.key === "ArrowUp") step(grid ? -COLS : -1)
    else if (grid && !search.value && e.key === "ArrowRight") step(1)
    else if (grid && !search.value && e.key === "ArrowLeft") step(-1)
    else if (e.key === "Enter" && items[sel]) { e.preventDefault(); openMark(items[sel], e.metaKey ? "bg" : e.shiftKey ? "peek" : "tab") }
  })

  const at = (e) => { const el = e.target.closest("[data-i]"); return el ? Number(el.dataset.i) : -1 }
  list.addEventListener("pointermove", (e) => { const i = at(e); if (i >= 0 && i !== sel && !editing) { sel = i; paintSel(false) } })
  // keep the caret in the search field (unless a rename field is the one with it)
  list.addEventListener("mousedown", (e) => { if (!editing && e.target.closest("[data-i]")) e.preventDefault() })
  list.addEventListener("click", (e) => {
    const i = at(e)
    if (i < 0 || e.button !== 0 || editing) return
    const b = items[i]
    if (e.metaKey || e.ctrlKey) return openMark(b, "bg")
    if (e.shiftKey) return openMark(b, "peek")
    clearTimeout(clickT)
    if (e.detail > 1) return
    clickT = setTimeout(() => openMark(b), CLICK_DELAY)
  })
  list.addEventListener("dblclick", (e) => { const i = at(e); if (i < 0 || e.metaKey || e.shiftKey) return; clearTimeout(clickT); startRename(i) })
  list.addEventListener("auxclick", (e) => { const i = at(e); if (i >= 0 && e.button === 1) { e.preventDefault(); openMark(items[i], "bg") } })
  list.addEventListener("contextmenu", (e) => {
    e.preventDefault()
    const i = at(e)
    if (i < 0 || editing) return
    sel = i
    paintSel(false)
    openCtx(i, e.clientX, e.clientY)
  })
  list.addEventListener("scroll", closeCtx, { passive: true })
  root.addEventListener("pointerdown", (e) => { if (ctx && !ctx.contains(e.target)) closeCtx() }, true)
  // Esc closes the right-click menu first (window capture runs before the popover's own Esc)
  const escKey = (e) => { if (e.key === "Escape" && ctx) { e.preventDefault(); e.stopPropagation(); closeCtx(); search.focus() } }

  // ── open ──────────────────────────────────────────────────────────
  render()
  const pt = anchor instanceof Element ? null : { x: window.innerWidth / 2, y: 52 }
  const r = anchor?.getBoundingClientRect()
  const align = pt ? "center" : r.left + r.width / 2 > window.innerWidth / 2 ? "end" : "start"
  let sig = JSON.stringify(state.get("bookmarks") ?? [])
  const offs = [
    bus.on("bookmarks", render),
    bus.on("tabs", () => { if (!editing) renderHere() }),
    bus.on("config", () => { const s = JSON.stringify(state.get("bookmarks") ?? []); if (s !== sig) { sig = s; render() } })
  ]
  window.addEventListener("keydown", escKey, true)
  popEl = popover(pt ?? anchor, root, {
    align, width: 360, className: "bmp-pop",
    onClose: () => {
      offs.forEach((off) => off())
      window.removeEventListener("keydown", escKey, true)
      clearTimeout(clickT)
      cur = null
      // Esc / click away: hand focus back instead of dropping it on <body>
      const f = document.activeElement
      if (!leaving && (!f || f === document.body || popEl?.contains(f)) && back instanceof Element && back !== document.body && back.isConnected) {
        try { back.focus({ preventScroll: true }) } catch {}
      }
    }
  })
  if (!popEl) { offs.forEach((off) => off()); window.removeEventListener("keydown", escKey, true); return }
  cur = { anchor: pt ? null : anchor }
  reposition()
  paintSel(true)
  search.focus()
}
