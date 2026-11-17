// ───────────────────────────────────────────────────────────────────
//  library.js — bookmarks + history.  The ★ button / ⌘D toggles a
//  bookmark for the active tab; the Library pane (⌘Y / ⌥⌘B) browses
//  history grouped by day and bookmarks, both searchable.
// ───────────────────────────────────────────────────────────────────
import { h, mount, clear } from "../core/dom.js"
import { state } from "../core/state.js"
import { bus, toast } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { menu } from "./popover.js"
import * as T from "../core/tabs.js"

export const isBookmarked = (url) => !!url && (state.get("bookmarks") ?? []).some((b) => b.url === url)

export async function addBookmark ({ url, title }) {
  if (!url || isBookmarked(url)) return false
  // pageTitle remembers what the page called itself, so clearing a rename restores it
  const list = [{ id: `bm_${Date.now().toString(36)}`, url, title: title || url, pageTitle: title || "", ts: Date.now() }, ...(state.get("bookmarks") ?? [])]
  await state.set("bookmarks", list)
  bus.emit("bookmarks")
  return true
}

export async function removeBookmark (url) {
  await state.set("bookmarks", (state.get("bookmarks") ?? []).filter((b) => b.url !== url))
  bus.emit("bookmarks")
}

export const hostLabel = (url) => T.hostOf(url).replace(/^www\./, "")
// what a bookmark is called on screen: its name, else the site
export const bookmarkLabel = (b) => (b.title && b.title !== b.url ? b.title : hostLabel(b.url) || b.url)
// the text a rename field starts with (a URL standing in for a name starts empty)
export const bookmarkName = (b) => (b.title && b.title !== b.url ? b.title : "")
const pageName = (b) => { const p = b.pageTitle ?? b.title; return p && p !== b.url ? p : "" }
export const bookmarkPlaceholder = (b) => pageName(b) || hostLabel(b.url) || "Bookmark name"

// empty = back to the page's own title (or the site's host)
export async function renameBookmark (url, title) {
  const list = state.get("bookmarks") ?? []
  const b = list.find((x) => x.url === url)
  if (!b) return
  const page = b.pageTitle ?? b.title
  const next = String(title ?? "").trim() || pageName(b) || hostLabel(url) || url
  if (next === b.title) return
  await state.set("bookmarks", list.map((x) => (x.url === url ? { ...x, title: next, pageTitle: page } : x)))
  bus.emit("bookmarks")
}

// swap a label for a text field: Enter / blur saves, Esc cancels.
// onDone(value) gets the trimmed text, or null when cancelled.  Keys are
// caught on window first, so an open popover doesn't take Esc to close itself.
export function inlineRename (label, { value = "", placeholder = "", onDone, cls = "" } = {}) {
  const input = h(`input.bm-edit${cls ? "." + cls : ""}`, { type: "text", value, placeholder, spellcheck: false, draggable: false, autocomplete: "off", "aria-label": "Bookmark name" })
  let done = false
  const key = (e) => {
    if (e.target !== input || (e.key !== "Enter" && e.key !== "Escape")) return
    e.preventDefault(); e.stopPropagation()
    finish(e.key === "Enter")
  }
  const finish = (save) => {
    if (done) return
    done = true
    window.removeEventListener("keydown", key, true)
    if (input.isConnected) input.replaceWith(label)
    onDone?.(save ? input.value.trim() : null)
  }
  window.addEventListener("keydown", key, true)
  input.addEventListener("keydown", (e) => e.stopPropagation())
  input.addEventListener("blur", () => finish(true))
  for (const ev of ["click", "mousedown", "dblclick", "auxclick", "contextmenu"]) input.addEventListener(ev, (e) => e.stopPropagation())
  label.replaceWith(input)
  input.focus(); input.select()
  return { cancel: () => finish(false), input }
}

export async function toggleBookmark () {
  const a = T.getActive()
  if (!a || a.isHome) return toast("Open a page to bookmark it")
  if (isBookmarked(a.url)) { await removeBookmark(a.url); toast("Bookmark removed") }
  else { await addBookmark({ url: a.url, title: a.title }); toast("Bookmarked ★") }
}

function dayLabel (ts) {
  const d = new Date(ts)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((today - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000)
  if (diff === 0) return "Today"
  if (diff === 1) return "Yesterday"
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
}

const favImg = (url) => {
  const f = T.faviconFor(url)
  return f ? h("img.lib-fav", { src: f, onerror: (e) => e.target.replaceWith(ico("globe", 15)) }) : ico("globe", 15)
}

// a bookmark opens in a new foreground tab (⌘ / middle click: in the
// background).  An empty New Tab is taken over instead of left behind.
export function openBookmarkUrl (url, { background = false, here = false } = {}) {
  if (background) return T.newTab(url, { background: true })
  const a = T.getActive()
  if (here || (a?.isHome && !a.pane)) return T.navigate(url, a?.id ?? null)
  return T.newTab(url)
}

function open (url, e) { if (e?.metaKey || e?.button === 1) T.newTab(url, { background: true }); else T.newTab(url) }
const openMark = (url, e) => openBookmarkUrl(url, { background: !!(e?.metaKey || e?.button === 1) })

export function initLibrary () {
  const pane = document.getElementById("library")
  let tab = "history"
  let query = ""
  let listEl = null

  async function fill () {
    if (!listEl) return
    const q = query.toLowerCase()
    clear(listEl)
    if (tab === "bookmarks") {
      const bms = (state.get("bookmarks") ?? []).filter((b) => !q || `${b.title} ${b.url}`.toLowerCase().includes(q))
      if (!bms.length) { listEl.append(h("div.lib-empty", { text: q ? "No bookmarks match." : "No bookmarks yet — press ⌘D on any page." })); return }
      listEl.append(h("div.lib-grid", {}, bms.map((b) => h("div.lib-card.glass.lit", { onclick: (e) => openMark(b.url, e), onauxclick: (e) => { if (e.button === 1) { e.preventDefault(); openMark(b.url, e) } }, oncontextmenu: (e) => cardMenu(e, b) }, [
        h("div.lib-card-top", {}, [favImg(b.url), h("button.tb-btn", { title: "Remove", onclick: (e) => { e.stopPropagation(); removeBookmark(b.url).then(fill) } }, [ico("close", 13)])]),
        h("div.lib-card-title", { text: bookmarkLabel(b) }),
        h("div.lib-card-sub", { text: T.hostOf(b.url) })
      ]))))
      return
    }
    const rows = await window.flux.history.search({ query, limit: 400 })
    if (!rows.length) { listEl.append(h("div.lib-empty", { text: q ? "Nothing in your history matches." : "History is empty." })); return }
    let lastDay = ""
    for (const e of rows) {
      const day = dayLabel(e.ts)
      if (day !== lastDay) { listEl.append(h("div.lib-day", { text: day })); lastDay = day }
      listEl.append(h("div.lib-row", { onclick: (ev) => open(e.url, ev), onauxclick: (ev) => { if (ev.button === 1) { ev.preventDefault(); open(e.url, ev) } } }, [
        h("span.lib-time", { text: new Date(e.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) }),
        favImg(e.url),
        h("span.lib-title", { text: e.title || e.url }),
        h("span.lib-host", { text: T.hostOf(e.url) }),
        e.visits > 1 && h("span.lib-visits", { text: `×${e.visits}` }),
        h("button.tb-btn.lib-del", { title: "Remove from history", onclick: async (ev) => { ev.stopPropagation(); await window.flux.history.remove(e.url); fill() } }, [ico("close", 13)])
      ]))
    }
  }

  function cardMenu (e, b) {
    e.preventDefault()
    const card = e.currentTarget
    menu({ x: e.clientX, y: e.clientY }, [
      { label: "Open in New Tab", icon: "plus", run: () => openBookmarkUrl(b.url) },
      { label: "Open in This Tab", icon: "arrowRight", run: () => openBookmarkUrl(b.url, { here: true }) },
      { label: "Open in Background", icon: "layers", kbd: "⌘-click", run: () => openBookmarkUrl(b.url, { background: true }) },
      "-",
      { label: "Rename…", icon: "edit", run: () => {
        const title = card.querySelector(".lib-card-title")
        if (title) inlineRename(title, { value: bookmarkName(b), placeholder: bookmarkPlaceholder(b), cls: "lib-edit", onDone: (v) => { if (v !== null) renameBookmark(b.url, v) } })
      } },
      { label: "Copy Link", icon: "link", run: () => { navigator.clipboard.writeText(b.url); toast("Link copied") } },
      "-",
      { label: "Delete", icon: "trash", danger: true, run: () => removeBookmark(b.url) }
    ])
  }

  function render () {
    const search = h("input.lib-search", {
      type: "text", placeholder: tab === "history" ? "Search history" : "Search bookmarks", value: query, spellcheck: false,
      oninput: () => { query = search.value.trim(); clearTimeout(search._t); search._t = setTimeout(fill, 90) }
    })
    const seg = h("div.seg", {}, [["history", "History"], ["bookmarks", "Bookmarks"]].map(([v, l]) =>
      h("button", { class: v === tab ? "is-on" : "", onclick: () => { tab = v; render() } }, l)))
    const clearBtn = tab === "history" && h("button.btn.btn--ghost", {
      onclick: (e) => menu(e.currentTarget, [
        { header: "Clear history from…" },
        { label: "The last hour", run: () => window.flux.history.clear({ sinceMs: 3_600_000 }).then(fill) },
        { label: "Today", run: () => window.flux.history.clear({ sinceMs: Date.now() - new Date().setHours(0, 0, 0, 0) }).then(fill) },
        { label: "All time", danger: true, run: () => window.flux.history.clear({}).then(fill) }
      ], { align: "end" })
    }, "Clear…")
    listEl = h("div.lib-list")
    mount(pane, h("div.lib", {}, [
      h("div.lib-head", {}, [h("h2.pane-h", { text: "Library" }), seg, h("div.lib-searchbox", {}, [ico("search", 15), search]), clearBtn]),
      listEl
    ]))
    fill()
    setTimeout(() => search.focus(), 30)
  }

  bus.on("library:open", (which) => { if (which) tab = which; bus.emit("view", "library") })
  bus.on("view", (v) => { if (v === "library") render() })
  bus.on("bookmarks", () => { if (window.__fluxView === "library" && tab === "bookmarks") fill() })
}
