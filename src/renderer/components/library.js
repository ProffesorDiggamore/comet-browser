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
  const list = [{ id: `bm_${Date.now().toString(36)}`, url, title: title || url, ts: Date.now() }, ...(state.get("bookmarks") ?? [])]
  await state.set("bookmarks", list)
  bus.emit("bookmarks")
  return true
}

export async function removeBookmark (url) {
  await state.set("bookmarks", (state.get("bookmarks") ?? []).filter((b) => b.url !== url))
  bus.emit("bookmarks")
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

function open (url, e) { if (e?.metaKey || e?.button === 1) T.newTab(url, { background: true }); else T.newTab(url) }

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
      listEl.append(h("div.lib-grid", {}, bms.map((b) => h("div.lib-card.glass.lit", { onclick: (e) => open(b.url, e), onauxclick: (e) => open(b.url, e) }, [
        h("div.lib-card-top", {}, [favImg(b.url), h("button.tb-btn", { title: "Remove", onclick: (e) => { e.stopPropagation(); removeBookmark(b.url).then(fill) } }, [ico("close", 13)])]),
        h("div.lib-card-title", { text: b.title || b.url }),
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
      listEl.append(h("div.lib-row", { onclick: (ev) => open(e.url, ev), onauxclick: (ev) => open(e.url, ev) }, [
        h("span.lib-time", { text: new Date(e.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) }),
        favImg(e.url),
        h("span.lib-title", { text: e.title || e.url }),
        h("span.lib-host", { text: T.hostOf(e.url) }),
        e.visits > 1 && h("span.lib-visits", { text: `×${e.visits}` }),
        h("button.tb-btn.lib-del", { title: "Remove from history", onclick: async (ev) => { ev.stopPropagation(); await window.flux.history.remove(e.url); fill() } }, [ico("close", 13)])
      ]))
    }
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
