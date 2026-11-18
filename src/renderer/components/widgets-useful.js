// ───────────────────────────────────────────────────────────────────
//  widgets-useful.js — Home widgets that do something with your
//  browsing: Reading List (⇧⌘D saves a page here), Downloads (newest
//  files, open or show in Finder), Headlines (any RSS / Atom feed,
//  presets included) and Favorites (your bookmarks as app icons).
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { ico } from "../core/icons.js"
import { bus, toast } from "../core/bus.js"
import { state } from "../core/state.js"
import * as T from "../core/tabs.js"
import { readingList, unread, markRead, removeFromReadingList } from "../core/readinglist.js"
import { openBookmarkUrl } from "./library.js"
import { menu } from "./popover.js"
import { fmtSize } from "./easyfiles.js"
import { plate } from "./widgets-web.js"
import { every } from "./widgets-kit.js"

export function ago (t) {
  if (!t) return ""
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return "now"
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86_400) return `${Math.floor(s / 3600)}h`
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d`
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
const head = (icon, tint, title, n, extra) => h("div.hw-head", {}, [
  h(`span.hw-head-ico.is-${tint}`, {}, [ico(icon, 11)]), h("span", { text: title }), n ? h("span.hw-head-n", { text: String(n) }) : null, extra ?? null
])
const empty = (icon, title, sub) => h("div.hw-empty", {}, [h("span.hw-empty-ico", {}, [ico(icon, 18)]), h("div.hw-empty-t", { text: title }), h("div.hw-empty-s", { text: sub })])
const rowsFor = (size) => (size === "large" ? 7 : size === "small" ? 2 : 3)

// repaint when one config path changes (Home itself only re-renders on layout changes)
function watch (path, paint) {
  let sig = JSON.stringify(state.get(path) ?? null)
  return bus.on("config", () => {
    const s = JSON.stringify(state.get(path) ?? null)
    if (s !== sig) { sig = s; paint() }
  })
}

// ── reading list ──────────────────────────────────────────────────
export function reading (body, w) {
  const open = (x, e) => { markRead(x.url); openBookmarkUrl(x.url, { background: !!(e?.metaKey) }) }
  const paint = () => {
    const all = unread()
    if (w.size === "small") {
      const first = all[0]
      body.replaceChildren(
        head("glasses", "purple", "Reading List"),
        h("button.hw-rl-small", { disabled: !first, title: first?.url ?? "", onclick: (e) => first && open(first, e) }, [
          h("div.hw-rl-count", { text: String(all.length) }),
          h("div.hw-rl-label", { text: all.length === 1 ? "page to read" : "pages to read" }),
          first ? h("div.hw-rl-next", { text: first.title }) : h("div.hw-rl-next.is-dim", { text: "⇧⌘D saves a page" })
        ])
      )
      return
    }
    if (!all.length) {
      const read = readingList().length
      body.replaceChildren(head("glasses", "purple", "Reading List"), empty("glasses", read ? "All caught up" : "Save it for later", read ? "Nothing left to read." : "Press ⇧⌘D on any page and it waits here."))
      return
    }
    body.replaceChildren(head("glasses", "purple", "Reading List", all.length), h("div.hw-rows", {}, all.slice(0, rowsFor(w.size)).map((x) => {
      const host = x.host || T.hostOf(x.url)
      return h("div.hw-row.hw-row--act", { role: "button", tabIndex: 0, title: x.url, onclick: (e) => open(x, e), onkeydown: (e) => { if (e.key === "Enter") open(x, e) } }, [
        plate(x.url, host, 16),
        h("span.hw-row-text", {}, [h("span.hw-row-t", { text: x.title || host }), h("span.hw-row-s", { text: `${host} · ${ago(x.addedAt)}` })]),
        h("span.hw-row-btns", {}, [
          h("button.hw-row-btn", { title: "Mark as read", "aria-label": "Mark as read", onclick: (e) => { e.stopPropagation(); markRead(x.url) } }, [ico("check", 12)]),
          h("button.hw-row-btn", { title: "Remove", "aria-label": "Remove from Reading List", onclick: (e) => { e.stopPropagation(); removeFromReadingList(x.url) } }, [ico("close", 11)])
        ])
      ])
    })))
  }
  paint()
  return watch("readingList", paint)
}

// ── downloads: the newest files ───────────────────────────────────
const EXT_TINT = { pdf: 4, zip: 32, dmg: 210, pkg: 210, png: 280, jpg: 280, jpeg: 280, heic: 280, gif: 280, mp4: 330, mov: 330, mp3: 160, wav: 160, doc: 215, docx: 215, xls: 140, xlsx: 140, csv: 140, ppt: 18, pptx: 18, txt: 0, md: 0 }
function fileIcon (f, size = 28) {
  if (f.thumb) return h("img.hw-dl-thumb", { src: f.thumb, alt: "", draggable: false, style: { width: `${size}px`, height: `${size}px` } })
  const ext = (f.name.split(".").pop() ?? "").slice(0, 4).toLowerCase()
  const hue = EXT_TINT[ext] ?? 220
  return h("span.hw-dl-file", { style: { "--h": hue, width: `${size}px`, height: `${size}px` } }, [h("b", { text: ext && ext !== f.name.toLowerCase() ? ext.toUpperCase() : "FILE" })])
}
export function downloads (body, w) {
  const n = rowsFor(w.size)
  let sig = ""
  const act = async (f, verb) => { const r = await window.flux.home.file(f.id, verb); if (!r?.ok) toast(r?.text ?? "Couldn't open that") }
  const paint = async () => {
    const r = await window.flux.home.downloads(w.size === "small" ? 1 : n)
    const files = r?.files ?? []
    const k = files.map((f) => `${f.name}|${f.size}|${f.mtime}`).join()
    if (k === sig && body.childElementCount) return
    sig = k
    if (!files.length) { body.replaceChildren(head("download", "blue", "Downloads"), empty("download", "No downloads yet", "Files you download show up here.")); return }
    if (w.size === "small") {
      const f = files[0]
      body.replaceChildren(head("download", "blue", "Downloads"), h("button.hw-dl-small", { title: `Open ${f.name}`, onclick: () => act(f, "open") }, [
        fileIcon(f, 46), h("div.hw-dl-name", { text: f.name }), h("div.hw-dl-meta", { text: `${fmtSize(f.size)} · ${ago(f.mtime)}` })
      ]))
      return
    }
    body.replaceChildren(head("download", "blue", "Downloads", null, h("button.hw-head-btn", { title: "Show all downloads", onclick: () => bus.emit("menu", { action: "downloads" }) }, [ico("list", 12)])),
      h("div.hw-rows", {}, files.slice(0, n).map((f) => h("div.hw-row.hw-row--act", { role: "button", tabIndex: 0, title: `Open ${f.name}`, onclick: () => act(f, "open"), onkeydown: (e) => { if (e.key === "Enter") act(f, "open") } }, [
        fileIcon(f, 28),
        h("span.hw-row-text", {}, [h("span.hw-row-t", { text: f.name }), h("span.hw-row-s", { text: `${fmtSize(f.size)} · ${ago(f.mtime)}` })]),
        h("span.hw-row-btns", {}, [h("button.hw-row-btn", { title: "Show in Finder", "aria-label": "Show in Finder", onclick: (e) => { e.stopPropagation(); act(f, "reveal") } }, [ico("folder", 12)])])
      ]))))
  }
  const stop = every(15_000, paint)
  const off = window.flux.downloads.onUpdate((d) => { if (d?.state === "completed") setTimeout(paint, 400) })
  return () => { stop(); off?.() }
}

// ── headlines: any RSS / Atom feed ────────────────────────────────
export const FEEDS = [
  { id: "hn", name: "Hacker News", url: "https://hnrss.org/frontpage" },
  { id: "verge", name: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
  { id: "bbc", name: "BBC News", url: "https://feeds.bbci.co.uk/news/rss.xml" },
  { id: "npr", name: "NPR News", url: "https://feeds.npr.org/1001/rss.xml" },
  { id: "nyt", name: "New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml" },
  { id: "ars", name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { id: "tc", name: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { id: "apple", name: "Apple Newsroom", url: "https://www.apple.com/newsroom/rss-feed.rss" },
  { id: "espn", name: "ESPN", url: "https://www.espn.com/espn/rss/news" }
]
export function headlines (body, w, ctx) {
  const feed = () => FEEDS.find((f) => f.id === (w.config?.feed ?? "verge")) ?? (w.config?.url ? { id: "custom", name: w.config.name || T.hostOf(w.config.url).replace(/^www\./, ""), url: w.config.url } : FEEDS[1])
  const n = w.size === "large" ? 5 : w.size === "wide" ? 4 : 2
  const pick = (anchor) => menu(anchor, [
    { header: "Show headlines from" },
    ...FEEDS.map((f) => ({ label: f.name, checked: feed().id === f.id, run: () => ctx.update({ config: { ...w.config, feed: f.id } }) })),
    "-",
    { label: feed().id === "custom" ? `Custom: ${feed().name}…` : "Custom RSS feed…", icon: "link", checked: feed().id === "custom" ? true : undefined, run: askCustom }
  ], { align: "end" })
  // Electron has no prompt(): ask for the address inside the widget
  const askCustom = () => {
    const input = h("input.hw-input.hw-news-url", { type: "url", placeholder: "https://example.com/feed.xml", value: w.config?.url ?? "", spellcheck: false, "aria-label": "Feed address" })
    const save = () => {
      const url = input.value.trim()
      if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(url)) { toast("That doesn't look like a feed address"); input.focus(); return }
      ctx.update({ config: { ...w.config, feed: "custom", url, name: "" } })
    }
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); if (e.key === "Escape") paint() })
    body.replaceChildren(top("Custom feed"), h("div.hw-news-ask", {}, [
      h("div.hw-news-ask-t", { text: "Paste an RSS or Atom feed address" }), input,
      h("div.hw-news-ask-row", {}, [h("button.hw-news-retry", { onclick: paint }, [h("span", { text: "Cancel" })]), h("button.hw-news-retry.is-on", { onclick: save }, [h("span", { text: "Show headlines" })])])
    ]))
    setTimeout(() => input.focus(), 30)
  }
  const chooser = h("button.hw-head-btn", { title: "Choose a news source", "aria-label": "Choose a news source", onclick: (e) => { e.stopPropagation(); pick(chooser) } }, [ico("more", 13)])
  const top = (title) => head("news", "red", title, null, chooser)
  const paint = async () => {
    const f = feed()
    if (!body.childElementCount) body.replaceChildren(top(f.name), h("div.hw-list-empty", { text: "Loading headlines…" }))
    const r = await window.flux.home.headlines(f.url)
    if (!r?.ok) {
      body.replaceChildren(top(f.name), h("div.hw-news-err", {}, [h("div", { text: r?.text ?? "Couldn't load headlines" }), h("button.hw-news-retry", { onclick: paint }, [ico("reload", 11), h("span", { text: "Try again" })])]))
      return
    }
    const name = f.id === "custom" ? (r.title || f.name) : f.name
    body.replaceChildren(top(name), h(`div.hw-news${w.size === "wide" ? ".is-wide" : ""}`, {}, r.items.slice(0, n).map((it) => h("button.hw-news-item", {
      title: it.title, onclick: (e) => T.newTab(it.url, { background: !!(e.metaKey) })
    }, [h("span.hw-news-t", { text: it.title }), h("span.hw-news-s", { text: [T.hostOf(it.url).replace(/^www\./, ""), ago(it.t)].filter(Boolean).join(" · ") })]))))
  }
  return every(15 * 60_000, paint)
}

// ── favorites: bookmarks as app icons ─────────────────────────────
export function favorites (body, w) {
  const max = w.size === "small" ? 4 : w.size === "medium" ? 8 : 16
  const paint = () => {
    const bms = (state.get("bookmarks") ?? []).slice(0, max)
    if (!bms.length) { body.replaceChildren(empty("bookmark", "Favorites", "Bookmark a page with ⌘D and it shows up here.")); return }
    body.replaceChildren(h(`div.hw-sites.is-${w.size}`, {}, bms.map((b) => {
      const host = T.hostOf(b.url)
      return h("button.hw-site", { title: `${b.title}\n${b.url}`, onclick: (e) => openBookmarkUrl(b.url, { background: !!e.metaKey }) }, [
        plate(b.url, host, w.size === "small" ? 30 : 24),
        w.size !== "small" && h("span.hw-site-name", { text: b.title || host })
      ])
    })))
  }
  paint()
  return watch("bookmarks", paint)
}
