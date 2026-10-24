// ───────────────────────────────────────────────────────────────────
//  downloads.js — downloads popover + toolbar badge.  Live progress,
//  speed, pause/resume/cancel, open, show in Finder.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { toast } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { popover, isPopoverOpen } from "./popover.js"

const items = new Map()
const told = new Set()
const badges = []
let listEl = null

const fmt = (n) => n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`

export function downloadsBadge () {
  const b = h("span.dl-badge", { hidden: true })
  badges.push(b)
  return b
}

function updateBadge () {
  const active = [...items.values()].filter((d) => d.state === "progressing")
  const got = active.reduce((sum, d) => sum + d.received, 0)
  const tot = active.reduce((sum, d) => sum + (d.total || 0), 0)
  for (const badge of badges) {
    badge.hidden = !active.length
    badge.style.setProperty("--p", tot ? `${Math.round((got / tot) * 100)}%` : "30%")
    badge.parentElement?.classList.toggle("is-busy", !!active.length)
  }
}

function row (d) {
  const pct = d.total ? Math.min(100, Math.round((d.received / d.total) * 100)) : null
  const live = d.state === "progressing"
  const act = (verb) => window.flux.downloads.action(d.id, verb).then(() => { if (verb === "forget") { items.delete(d.id); paint() } })
  const status = live
    ? `${fmt(d.received)}${d.total ? ` of ${fmt(d.total)}` : ""}${d.paused ? " · paused" : d.speed ? ` · ${fmt(d.speed)}/s` : ""}`
    : d.state === "completed" ? fmt(d.total || d.received) : d.state === "cancelled" ? "Cancelled" : "Failed"
  return h(`div.dl-row${live ? ".is-live" : ""}`, {}, [
    h("span.dl-ico", {}, [ico(d.state === "completed" ? "check" : live ? "download" : "close", 15)]),
    h("div.dl-main", {}, [
      h("div.dl-name", { text: d.name, title: d.path }),
      live && h("div.dl-bar", {}, [h("i", { style: { width: pct != null ? `${pct}%` : "35%" }, class: pct == null ? "is-indet" : "" })]),
      h("div.dl-sub", { text: status })
    ]),
    h("div.dl-acts", {}, live
      ? [
          h("button.tb-btn", { title: d.paused ? "Resume" : "Pause", onclick: () => act(d.paused ? "resume" : "pause") }, [ico(d.paused ? "play" : "pause", 14)]),
          h("button.tb-btn", { title: "Cancel", onclick: () => act("cancel") }, [ico("close", 14)])
        ]
      : [
          d.state === "completed" && h("button.tb-btn", { title: "Open", onclick: () => act("open") }, [ico("external", 14)]),
          d.state === "completed" && h("button.tb-btn", { title: "Show in Finder", onclick: () => act("reveal") }, [ico("folder", 14)]),
          h("button.tb-btn", { title: "Remove from list", onclick: () => act("forget") }, [ico("trash", 14)])
        ])
  ])
}

function paint () {
  updateBadge()
  if (!listEl?.isConnected) return
  const all = [...items.values()].sort((a, b) => b.started - a.started)
  listEl.replaceChildren(...(all.length ? all.map(row) : [h("div.dl-empty", { text: "No downloads yet." })]))
}

export function openDownloads (anchor) {
  listEl = h("div.dl-list")
  const body = h("div.dl", {}, [
    h("div.dl-head", {}, [
      h("strong", { text: "Downloads" }),
      h("button.btn.btn--ghost", { onclick: () => window.flux.downloads.clear().then(() => { for (const [k, d] of items) if (d.state !== "progressing") items.delete(k); paint() }) }, "Clear")
    ]),
    listEl
  ])
  popover(anchor, body, { width: 360, align: "end" })
  paint()
}

export function initDownloads () {
  window.flux.downloads.list().then((list) => { for (const d of list) items.set(d.id, d); paint() })
  window.flux.downloads.onUpdate((d) => {
    if (!d) return
    const isNew = !items.has(d.id)
    items.set(d.id, d)
    paint()
    if (isNew && !isPopoverOpen()) toast(`Downloading ${d.name}`)
    if (d.state === "completed" && !told.has(d.id)) { told.add(d.id); toast(`Downloaded ${d.name}`) }
  })
}
