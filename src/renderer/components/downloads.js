// ───────────────────────────────────────────────────────────────────
//  downloads.js — downloads popover + the progress ring on every
//  Downloads button (toolbar and sidebar footer).  Live progress,
//  speed and time left, pause / resume / cancel, retry, open, show in
//  Finder.  The list is this window's profile's.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { toast } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { popover, isPopoverOpen } from "./popover.js"

const items = new Map()
const told = new Set()
const badges = []
const rows = new Map()     // id → { el, sig }: rows are patched in place, so a click never lands on a node that was just replaced
let listEl = null
let clearBtn = null

const fmt = (n) => n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`
const left = (s) => s < 60 ? `${Math.max(1, Math.round(s))} s left` : s < 3600 ? `${Math.round(s / 60)} min left` : `${(s / 3600).toFixed(1)} h left`
// still running; Chromium's own "interrupted" while it reconnects counts too
// (main marks it failed once it gives up)
const isLive = (d) => !d.finished && !d.failed && (d.state === "progressing" || d.state === "interrupted")

export function downloadsBadge () {
  const b = h("span.dl-badge", { hidden: true, "aria-hidden": "true" })
  badges.push(b)
  return b
}

function updateBadge () {
  const active = [...items.values()].filter(isLive)
  const got = active.reduce((sum, d) => sum + d.received, 0)
  const tot = active.reduce((sum, d) => sum + (d.total || 0), 0)
  for (const badge of badges) {
    badge.hidden = !active.length
    const btn = badge.parentElement
    if (!btn) continue
    btn.style.setProperty("--p", tot ? `${Math.round((got / tot) * 100)}%` : "30%")
    btn.classList.toggle("is-busy", !!active.length)
  }
}

function status (d) {
  if (isLive(d)) {
    if (d.state === "interrupted") return `${fmt(d.received)}${d.total ? ` of ${fmt(d.total)}` : ""} · reconnecting…`
    if (d.paused) return `${fmt(d.received)}${d.total ? ` of ${fmt(d.total)}` : ""} · paused`
    const eta = d.total && d.speed ? ` · ${left((d.total - d.received) / d.speed)}` : ""
    return `${fmt(d.received)}${d.total ? ` of ${fmt(d.total)}` : ""}${d.speed ? ` · ${fmt(d.speed)}/s` : ""}${eta}`
  }
  return d.state === "completed" ? fmt(d.total || d.received) : d.state === "cancelled" ? "Cancelled" : "Failed"
}

function act (d, verb) {
  return window.flux.downloads.action(d.id, verb).then((r) => {
    if (verb === "forget" || (verb === "retry" && r?.ok && !r.same)) { items.delete(d.id); rows.delete(d.id); paint() }
    if (verb === "retry" && !r?.ok) toast("Couldn't retry this download")
  })
}

const btn = (title, icon, run) => h("button.tb-btn", { title, "aria-label": title, onclick: run }, [ico(icon, 14)])

function row (d) {
  const live = isLive(d)
  const pct = d.total ? Math.min(100, Math.round((d.received / d.total) * 100)) : null
  const failed = !live && d.state !== "completed"
  return h(`div.dl-row${live ? ".is-live" : ""}${failed ? ".is-failed" : ""}`, { role: "listitem", dataset: { id: d.id } }, [
    h("span.dl-ico", {}, [ico(d.state === "completed" ? "check" : live ? "download" : "close", 15)]),
    h("div.dl-main", {}, [
      h("div.dl-name", { text: d.name, title: d.path }),
      live && h("div.dl-bar", { role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": pct ?? undefined }, [
        h("i", { style: { width: pct != null ? `${pct}%` : "35%" }, class: pct == null ? "is-indet" : "" })
      ]),
      h("div.dl-sub", { text: status(d) })
    ]),
    h("div.dl-acts", {}, live
      ? [
          d.state !== "interrupted" && btn(d.paused ? "Resume" : "Pause", d.paused ? "play" : "pause", () => act(d, d.paused ? "resume" : "pause")),
          btn("Cancel", "close", () => act(d, "cancel"))
        ]
      : [
          d.state === "completed" && btn("Open", "external", () => act(d, "open")),
          d.state === "completed" && btn("Show in Finder", "folder", () => act(d, "reveal")),
          failed && btn("Retry", "reload", () => act(d, "retry")),
          btn("Remove from list", "trash", () => act(d, "forget"))
        ])
  ])
}

// rebuild a row only when its buttons change; otherwise just its bar and text
function rowFor (d) {
  const sig = `${d.state}|${d.paused}|${d.finished ? 1 : 0}|${d.failed ? 1 : 0}|${d.total ? 1 : 0}`
  const have = rows.get(d.id)
  if (have && have.sig === sig) {
    const sub = have.el.querySelector(".dl-sub")
    if (sub) sub.textContent = status(d)
    const bar = have.el.querySelector(".dl-bar")
    if (bar && d.total) {
      const pct = Math.min(100, Math.round((d.received / d.total) * 100))
      bar.firstChild.style.width = `${pct}%`
      bar.setAttribute("aria-valuenow", pct)
    }
    return have.el
  }
  const el = row(d)
  rows.set(d.id, { el, sig })
  return el
}

function paint () {
  updateBadge()
  if (!listEl?.isConnected && !listEl?.dataset.pending) return
  const all = [...items.values()].sort((a, b) => b.started - a.started)
  for (const id of rows.keys()) if (!items.has(id)) rows.delete(id)
  const want = all.length ? all.map(rowFor) : [h("div.dl-empty", { text: "No downloads yet." })]
  // only touch the list when its order changed: moving a node mid-click swallows the click
  const same = want.length === listEl.children.length && want.every((el, i) => listEl.children[i] === el)
  if (!same) listEl.replaceChildren(...want)
  if (clearBtn) clearBtn.disabled = !all.some((d) => !isLive(d))
}

function clearFinished () {
  window.flux.downloads.clear().then(() => {
    for (const [k, d] of items) if (!isLive(d)) items.delete(k)
    paint()
  })
}

// anchor: the Downloads button it opens from (sidebar footer or toolbar)
export function openDownloads (anchor) {
  const back = document.activeElement
  listEl = h("div.dl-list", { role: "list", dataset: { pending: "1" } })
  clearBtn = h("button.btn.btn--ghost", { title: "Clear finished downloads", onclick: clearFinished }, "Clear")
  const body = h("div.dl", { "aria-label": "Downloads" }, [
    h("div.dl-head", {}, [h("strong", { text: "Downloads" }), clearBtn]),
    listEl
  ])
  // fill it first: the popover measures itself to decide whether it fits below or above the button
  paint()
  delete listEl.dataset.pending
  const r = anchor?.getBoundingClientRect?.()
  const side = anchor?.closest?.("#vtabs")
  const align = r && r.left + r.width / 2 > window.innerWidth / 2 ? "end" : "start"
  const el = popover(anchor, body, {
    width: 340, align, alignTo: side, follow: true, className: "dl-pop",
    onClose: () => {
      listEl = null
      clearBtn = null
      // Esc / click away: focus goes back where it was instead of dropping on <body>
      const f = document.activeElement
      if ((!f || f === document.body || el?.contains(f)) && back instanceof Element && back !== document.body && back.isConnected) {
        try { back.focus({ preventScroll: true }) } catch {}
      }
    }
  })
  if (!el) { listEl = null; clearBtn = null }
}

export function initDownloads () {
  window.flux.downloads.list().then((list) => { for (const d of list) items.set(d.id, d); paint() })
  window.flux.downloads.onUpdate((d) => {
    if (!d) return
    const isNew = !items.has(d.id)
    items.set(d.id, d)
    paint()
    if (isNew && !isPopoverOpen()) toast(`Downloading ${d.name}`)
    if ((d.finished || d.failed) && !told.has(d.id)) {
      told.add(d.id)
      if (d.state === "completed") toast(`Downloaded ${d.name}`)
      else if (d.failed) toast(`Download failed: ${d.name}`)
    }
    if (!d.finished && !d.failed) told.delete(d.id)     // retried in place: tell again how it ends
  })
}
