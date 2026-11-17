// ───────────────────────────────────────────────────────────────────
//  palette.js — command palette (⌘K / ⇧⌘A).  One box for open tabs,
//  every browser command, bookmarks and history — and if nothing fits,
//  hand the text to Comet AI.  Keyboard-first.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { bus, toast } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { state } from "../core/state.js"
import { leave } from "../core/motion.js"
import { fillActiveTab } from "./passwords.js"
import { toggleBookmark } from "./library.js"
import * as T from "../core/tabs.js"

let overlay = null

function commands () {
  const web = T.getActive() && !T.getActive().isHome
  const cmd = (label, icon, run, kbd, when = true) => when && { kind: "cmd", icon, label, run, kbd }
  return [
    cmd("New tab", "plus", () => T.newTab(), "⌘T"),
    cmd("New private tab", "eyeoff", () => T.newTab(null, { private: true }), "⇧⌘N"),
    cmd("Copy link to this page", "link", () => { navigator.clipboard.writeText(T.getActive().url); bus.emit("toast", "Link copied") }, "⇧⌘C", web),
    cmd("Reopen closed tab", "reload", () => T.reopenClosed(), "⇧⌘T"),
    cmd("Tab overview", "overview", () => bus.emit("overview:open"), "⇧⌘\\"),
    cmd("Split view", "split", () => T.toggleSplit(), "⌘\\", web),
    cmd("Reader mode", "book", () => bus.emit("reader:toggle"), "⌥⌘R", web),
    cmd("Bookmark this page", "bookmark", () => toggleBookmark(), "⌘D", web),
    cmd("Picture in picture", "pip", () => bus.emit("menu", { action: "pip" }), "⌥⌘P", web),
    cmd("Save page screenshot", "image", () => bus.emit("menu", { action: "screenshot" }), "⇧⌘S", web),
    cmd("Pin / unpin tab", "pin", () => { const a = T.getActive(); if (a) T.setPinned(a.id, !a.pinned) }, "", web),
    cmd("Mute / unmute tab", "volumeX", () => T.setMuted(T.getActiveId()), "⌃M", web),
    cmd("Duplicate tab", "copy", () => T.duplicate(T.getActiveId()), "", web),
    cmd("Toggle dark mode for this site", "moon", async () => { const a = T.getActive(); const cur = (state.get("siteSettings") ?? {})[T.hostOf(a.url)]?.dark; await T.setSite(a.url, { dark: !cur }); T.refreshSite(a.id) }, "", web),
    cmd("Fill saved login", "key", () => fillActiveTab(), "", web),
    cmd("Sleep background tabs", "sleep", () => { T.sleepAllBackground(); toast("Background tabs asleep") }),
    cmd("History", "clock", () => bus.emit("library:open", "history"), "⌘Y"),
    cmd("Bookmarks", "bookmark", () => bus.emit("library:open", "bookmarks"), "⌥⌘B"),
    cmd("Downloads", "download", () => bus.emit("menu", { action: "downloads" }), "⌥⌘L"),
    cmd("Focus mode", "focus", () => bus.emit("focus:toggle"), "⇧⌘F"),
    cmd("Toggle sidebar", "sidebar", () => bus.emit("sidebar:toggle"), "⌘B"),
    cmd("Go home", "home", () => bus.emit("view", "home"), "⇧⌘H"),
    cmd("Settings", "gear", () => bus.emit("view", "settings"), "⌘,"),
    cmd("Motion & animation settings", "bolt", () => bus.emit("settings:goto", "motion")),
    cmd("Appearance settings", "palette", () => bus.emit("settings:goto", "appearance")),
    cmd("Open page in system browser", "external", () => window.flux.openExternal(T.getActive().url), "", web),
    cmd("Welcome tour", "flux", () => bus.emit("menu", { action: "welcome" })),
    // Comet AI stays reachable, below the browser commands
    cmd("Ask Comet AI", "spark", () => bus.emit("ai:toggle"), "⌘J"),
    cmd("Summarize this page", "spark", () => bus.emit("ai:ask", { text: "Summarize this page: key points, then anything to act on.", withPage: true }), "", web)
  ].filter(Boolean)
}

export function closePalette () {
  if (!overlay) return
  const o = overlay
  overlay = null
  leave(o.firstChild, "drop").then(() => o.remove())
}

export function openPalette () {
  if (overlay) { closePalette(); return }
  let sel = 0
  let visible = []
  let seqq = 0
  const rows = h("div.pal-rows")
  const input = h("input.pal-input", { type: "text", placeholder: "Search tabs, commands and history", spellcheck: false })

  const tabItems = () => T.getTabs().map((t) => ({ kind: "tab", icon: t.asleep ? "sleep" : t.pane === "settings" ? "gear" : t.isHome ? "home" : "globe", fav: t.favicon, label: t.pane === "settings" ? "Settings" : t.isHome ? "New Tab" : t.title || t.url, sub: t.isHome ? "" : T.hostOf(t.url), run: () => T.setActive(t.id) }))

  async function filter () {
    const q = input.value.trim().toLowerCase()
    const my = ++seqq
    const base = [...tabItems(), ...commands()]
    if (!q) { visible = base; sel = 0; paint(); return }
    const score = (i) => {
      const l = i.label.toLowerCase(); const s = (i.sub ?? "").toLowerCase()
      if (l.startsWith(q)) return 3
      if (l.split(/\s+/).some((w) => w.startsWith(q))) return 2
      return l.includes(q) || s.includes(q) ? 1 : 0
    }
    visible = base.map((i) => [i, score(i)]).filter(([, s]) => s).sort((a, b) => b[1] - a[1]).map(([i]) => i)
    for (const b of (state.get("bookmarks") ?? []).filter((b) => `${b.title} ${b.url}`.toLowerCase().includes(q)).slice(0, 4)) {
      visible.push({ kind: "bookmark", icon: "bookmark", label: b.title || b.url, sub: T.hostOf(b.url), run: () => T.newTab(b.url) })
    }
    visible.push({ kind: "ai", icon: "spark", label: `Ask Comet AI: “${input.value.trim()}”`, run: () => bus.emit("ai:ask", { text: input.value.trim() }) })
    sel = 0; paint()
    const hist = await window.flux.history.search({ query: q, limit: 6, ranked: true })
    if (my !== seqq || !overlay) return
    const at = visible.findIndex((i) => i.kind === "ai")
    visible.splice(at, 0, ...hist.map((e) => ({ kind: "history", icon: "clock", label: e.title || e.url, sub: T.hostOf(e.url), run: () => T.newTab(e.url) })))
    paint()
  }

  function paint () {
    let lastKind = null
    const label = { tab: "Tabs", cmd: "Commands", bookmark: "Bookmarks", history: "History", ai: "Comet AI" }
    const out = []
    visible.forEach((i, idx) => {
      if (i.kind !== lastKind) { out.push(h("div.pal-group", { text: label[i.kind] })); lastKind = i.kind }
      out.push(h(`button.pal-row${idx === sel ? ".is-sel" : ""}${i.kind === "ai" ? ".is-ai" : ""}`, {
        onmouseenter: () => { sel = idx; mark() },
        onclick: () => { closePalette(); i.run() }
      }, [
        h("span.pal-ico", {}, [i.fav ? h("img", { src: i.fav, onerror: (e) => e.target.replaceWith(ico("globe", 15)) }) : ico(i.icon, 15)]),
        h("span.pal-label", { text: i.label }),
        i.sub && h("span.pal-sub", { text: i.sub }),
        i.kbd && h("kbd.pal-kbd", { text: i.kbd })
      ]))
    })
    rows.replaceChildren(...out)
    rows.querySelector(".is-sel")?.scrollIntoView({ block: "nearest" })
  }
  const mark = () => { rows.querySelectorAll(".pal-row").forEach((r, i) => r.classList.toggle("is-sel", i === sel)); rows.querySelector(".is-sel")?.scrollIntoView({ block: "nearest" }) }

  input.addEventListener("input", filter)
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, visible.length - 1); mark() }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); mark() }
    else if (e.key === "Enter") {
      e.preventDefault()
      const it = (e.metaKey || e.ctrlKey) ? visible.find((i) => i.kind === "ai") : visible[sel]
      closePalette(); it?.run()
    } else if (e.key === "Escape") { e.preventDefault(); closePalette() }
  })

  overlay = h("div.pal-overlay", { onclick: (e) => { if (e.target === overlay) closePalette() } }, [
    h("div.pal.glass", {}, [h("div.pal-top", {}, [ico("search", 17), input, h("kbd.pal-kbd", { text: "esc" })]), rows])
  ])
  document.body.append(overlay)
  filter()
  input.focus()
}

bus.on("palette:open", openPalette)
