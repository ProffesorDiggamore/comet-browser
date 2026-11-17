// ───────────────────────────────────────────────────────────────────
//  widgets-web.js — the browsing widgets: Top Sites (app-icon plates,
//  like the Shortcuts / Safari widgets), Open Tabs + Recently Closed
//  (Safari-widget rows), Hot Tabs, Clipboard (a preview card) and
//  Image Search.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { ico } from "../core/icons.js"
import { bus } from "../core/bus.js"
import * as T from "../core/tabs.js"
import { hotGrid } from "./hottabs.js"
import { fmtSize } from "./easyfiles.js"
import { lensPanel, lensFile, imageIn } from "./lens.js"
import { every, hueOf } from "./widgets-kit.js"

// "en.wikipedia.org" → "wikipedia", "mail.google.com" → "google"
const siteName = (host) => { const p = host.split("."); return p.length >= 2 ? p[p.length - 2] : host }

// a favicon on a soft plate tinted from its host — the app-icon look
export function plate (url, host, size = 20) {
  const el = h("span.hw-plate", { style: { "--h": hueOf(host || url) } })
  const letter = () => h("b.hw-plate-l", { text: (siteName(host || "?")[0] ?? "?").toUpperCase() })
  const f = T.faviconFor(url)
  el.append(f ? h("img", { src: f, draggable: false, width: size, height: size, onerror: (ev) => ev.target.replaceWith(letter()) }) : letter())
  return el
}

// ── top sites ─────────────────────────────────────────────────────
export function sites (body, w) {
  const max = w.size === "small" ? 4 : w.size === "medium" ? 8 : 16
  const grid = h(`div.hw-sites.is-${w.size}`)
  body.append(grid)
  window.flux.history.search({ query: "", limit: 120, ranked: true }).then((rows) => {
    const seen = new Set()
    for (const e of rows) {
      const host = T.hostOf(e.url)
      if (!host || seen.has(host)) continue
      seen.add(host)
      grid.append(h("button.hw-site", { title: e.title || e.url, onclick: () => T.navigate(e.url) }, [
        plate(e.url, host, w.size === "small" ? 30 : 24),
        w.size !== "small" && h("span.hw-site-name", { text: siteName(host) })
      ]))
      if (seen.size >= max) break
    }
    if (!seen.size) grid.replaceWith(h("div.hw-empty", {}, [h("span.hw-empty-ico", {}, [ico("globe", 18)]), h("div.hw-empty-t", { text: "Top Sites" }), h("div.hw-empty-s", { text: "Sites you visit most show up here." })]))
  })
  return null
}

// ── open tabs / recently closed: Safari-widget rows ───────────────
function rowsWidget (body, w, { title, icon, tint, list, empty, open }) {
  const n = w.size === "large" ? 7 : w.size === "small" ? 2 : 3
  const paint = () => {
    const all = list()
    const head = h("div.hw-head", {}, [h(`span.hw-head-ico.is-${tint}`, {}, [ico(icon, 11)]), h("span", { text: title }), all.length ? h("span.hw-head-n", { text: String(all.length) }) : null])
    if (!all.length) { body.replaceChildren(head, h("div.hw-list-empty", { text: empty })); return }
    body.replaceChildren(head, h("div.hw-rows", {}, all.slice(0, n).map((x, i) => {
      const host = T.hostOf(x.url) ?? ""
      return h("button.hw-row", { onclick: () => open(x, i), title: x.url }, [
        plate(x.url, host, 16),
        h("span.hw-row-text", {}, [h("span.hw-row-t", { text: x.title || host || x.url }), h("span.hw-row-s", { text: host.replace(/^www\./, "") })])
      ])
    })))
  }
  paint()
  return bus.on("tabs", paint)
}
export const tabs = (body, w) => rowsWidget(body, w, {
  title: "Open Tabs", icon: "layers", tint: "blue",
  list: () => T.getTabs().filter((t) => !t.isHome).slice().reverse(),
  empty: "No open tabs.", open: (t) => T.setActive(t.id)
})
export const closed = (body, w) => rowsWidget(body, w, {
  title: "Recently Closed", icon: "history", tint: "orange",
  list: () => T.getClosed(),
  empty: "Tabs you close show up here — click one to bring it back.", open: (_c, i) => T.reopenClosedAt(i)
})

// ── hot tabs (your launchers + hotkeys) ───────────────────────────
export function hottabs (body) {
  body.append(hotGrid())
  return null
}

// ── clipboard: what Easy Files will offer the next upload ─────────
export function clipboard (body, w) {
  const tile = body.closest(".hw")
  let sig = ""
  const paint = async () => {
    const r = await window.flux.files.list()
    const it = r.ok ? r.clipboard[0] : null
    const k = it ? `${it.id}|${it.name}|${it.size}|${it.preview ?? ""}` : "none"
    if (k === sig) return
    sig = k
    tile?.classList.toggle("has-photo", !!it?.thumb)
    const head = h("div.hw-head", {}, [h("span.hw-head-ico.is-orange", {}, [ico("clipboard", 11)]), h("span", { text: "Clipboard" })])
    if (!it) { body.replaceChildren(head, h("div.hw-list-empty", { text: "Copy an image or a file — it's ready to upload on any site." })); return }
    const more = r.clipboard.length > 1 ? `${r.clipboard.length - 1} more` : ""
    const meta = [it.size != null ? fmtSize(it.size) : null, more || null].filter(Boolean).join(" · ")
    if (it.thumb) {
      body.replaceChildren(
        h("img.hw-clip-photo", { src: it.thumb, draggable: false, alt: "" }),
        h("div.hw-clip-scrim"),
        h("div.hw-clip-cap", {}, [h("div.hw-clip-k", { text: "Clipboard" }), h("div.hw-clip-name", { text: it.name }), meta ? h("div.hw-clip-meta", { text: meta }) : null])
      )
    } else if (it.preview) {
      body.replaceChildren(head, h("div.hw-clip-quote", { text: it.preview }), h("div.hw-clip-meta", { text: meta ? `Text · ${meta}` : "Ready to paste or upload" }))
    } else {
      body.replaceChildren(head, h("div.hw-clip-file", {}, [
        h("span.hw-clip-ico", {}, [ico(it.type?.startsWith("text/") ? "note" : "file", 22)]),
        h("div.hw-clip-text", {}, [h("div.hw-clip-name", { text: it.name }), h("div.hw-clip-meta", { text: meta || "Ready to upload" })])
      ]))
    }
  }
  const onFocus = () => paint()
  window.addEventListener("focus", onFocus)
  const stop = every(4000, paint)       // reading the clipboard image isn't free: only while Comet is in front
  return () => { stop(); window.removeEventListener("focus", onFocus) }
}

// ── image search (Google Lens) ───────────────────────────────────
export function imagesearch (body, w) {
  if (w.size === "small") {
    const zone = h("button.hw-lens-small", { title: "Drop or paste an image to search with Google Lens", onclick: () => zone.focus() }, [
      h("span.hw-lens-plate", {}, [ico("lens", 22)]),
      h("span.hw-lens-t", { text: "Image Search" }),
      h("span.hw-lens-s", { text: "Drop or paste an image" })
    ])
    zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("is-drop") })
    zone.addEventListener("dragleave", () => zone.classList.remove("is-drop"))
    zone.addEventListener("drop", (e) => { e.preventDefault(); zone.classList.remove("is-drop"); lensFile(imageIn(e.dataTransfer)) })
    zone.addEventListener("paste", (e) => { const f = imageIn(e.clipboardData); if (f) { e.preventDefault(); lensFile(f) } })
    body.append(zone)
    return null
  }
  body.append(h("div.hw-head", {}, [h("span.hw-head-ico.is-blue", {}, [ico("lens", 11)]), h("span", { text: "Image Search" })]), lensPanel({ compact: true }))
  return null
}
