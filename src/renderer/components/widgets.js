// ───────────────────────────────────────────────────────────────────
//  widgets.js — Home's widget kinds, modeled on Home Widgets (the
//  desktop app): Apple-proportioned tiles in small / medium / large /
//  wide, drawn in one of its five styles.  Each kind renders into a
//  body element and returns a cleanup (timers stop off-screen).
//  Per-widget settings live on the widget: w.config.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { ico } from "../core/icons.js"
import { state } from "../core/state.js"
import { bus, toast } from "../core/bus.js"
import { hotGrid } from "./hottabs.js"
import { fmtSize } from "./easyfiles.js"
import * as T from "../core/tabs.js"

export const SIZES = {
  small: { label: "Small", cols: 1, rows: 1 },
  medium: { label: "Medium", cols: 2, rows: 1 },
  large: { label: "Large", cols: 2, rows: 2 },
  wide: { label: "Wide", cols: 4, rows: 1 }
}

const every = (ms, fn) => { fn(); const t = setInterval(fn, ms); return () => clearInterval(t) }
const pad = (n) => String(n).padStart(2, "0")

// ── clock ─────────────────────────────────────────────────────────
function clock (body, w) {
  const big = h("div.hw-time")
  const sub = h("div.hw-sub")
  const face = w.size !== "small" ? analogFace() : null
  body.append(h("div.hw-clock", {}, [face?.el, h("div.hw-clock-text", {}, [big, sub])]))
  return every(1000, () => {
    const d = new Date()
    const h24 = state.get("home.clock24") === true
    const hr = h24 ? pad(d.getHours()) : ((d.getHours() + 11) % 12) + 1
    big.textContent = `${hr}:${pad(d.getMinutes())}`
    sub.textContent = d.toLocaleDateString(undefined, { weekday: "long", ...(w.size === "small" ? {} : { month: "long", day: "numeric" }) })
    face?.set(d)
  })
}

function analogFace () {
  const ns = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(ns, "svg")
  svg.setAttribute("viewBox", "0 0 100 100")
  svg.classList.add("hw-face")
  const mk = (tag, attrs) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); svg.append(e); return e }
  mk("circle", { cx: 50, cy: 50, r: 48, class: "hw-face-bg" })
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    mk("line", { x1: 50 + Math.sin(a) * 40, y1: 50 - Math.cos(a) * 40, x2: 50 + Math.sin(a) * (i % 3 ? 43 : 45), y2: 50 - Math.cos(a) * (i % 3 ? 43 : 45), class: "hw-tick" })
  }
  const hh = mk("line", { x1: 50, y1: 50, x2: 50, y2: 26, class: "hw-hand hw-h" })
  const mm = mk("line", { x1: 50, y1: 50, x2: 50, y2: 15, class: "hw-hand hw-m" })
  const ss = mk("line", { x1: 50, y1: 58, x2: 50, y2: 12, class: "hw-hand hw-s" })
  mk("circle", { cx: 50, cy: 50, r: 2.4, class: "hw-pin" })
  return {
    el: svg,
    set (d) {
      const s = d.getSeconds(), m = d.getMinutes() + s / 60, hr = (d.getHours() % 12) + m / 60
      hh.setAttribute("transform", `rotate(${hr * 30} 50 50)`)
      mm.setAttribute("transform", `rotate(${m * 6} 50 50)`)
      ss.setAttribute("transform", `rotate(${s * 6} 50 50)`)
    }
  }
}

// ── calendar ──────────────────────────────────────────────────────
function calendar (body, w) {
  const d = new Date()
  if (w.size === "small") {
    body.append(h("div.hw-cal-small", {}, [
      h("div.hw-cal-dow", { text: d.toLocaleDateString(undefined, { weekday: "long" }) }),
      h("div.hw-cal-num", { text: String(d.getDate()) }),
      h("div.hw-sub", { text: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }) })
    ]))
    return null
  }
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < first.getDay(); i++) cells.push(h("span"))
  for (let i = 1; i <= days; i++) cells.push(h(`span${i === d.getDate() ? ".is-today" : ""}`, { text: String(i) }))
  const dows = [..."SMTWTFS"].map((c) => h("span.hw-cal-h", { text: c }))
  body.append(h("div.hw-cal", {}, [
    h("div.hw-cal-month", { text: d.toLocaleDateString(undefined, { month: "long" }) }),
    h("div.hw-cal-grid", {}, [...dows, ...cells])
  ]))
  return null
}

// ── weather (Open-Meteo, via main) ────────────────────────────────
const WX = [
  [[0], "sun", "Clear"], [[1, 2], "sun", "Partly cloudy"], [[3], "cloud", "Cloudy"], [[45, 48], "cloud", "Fog"],
  [[51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82], "rain", "Rain"], [[71, 73, 75, 77, 85, 86], "snow", "Snow"], [[95, 96, 99], "storm", "Storms"]
]
const wx = (code) => { const r = WX.find(([c]) => c.includes(code)); return r ? { icon: r[1], label: r[2] } : { icon: "cloud", label: "—" } }

function weather (body, w, ctx) {
  const city = w.config?.city
  if (!city) {
    const input = h("input.hw-input", { placeholder: "City for weather", spellcheck: false })
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && input.value.trim()) ctx.update({ config: { ...w.config, city: input.value.trim() } }) })
    body.append(h("div.hw-empty", {}, [ico("sun", 22), h("div.hw-sub", { text: "Weather" }), input]))
    return null
  }
  const unit = state.get("home.tempUnit") ?? "f"
  body.append(h("div.hw-sub", { text: "Loading weather…" }))
  let dead = false
  window.flux.weather(city, unit).then((r) => {
    if (dead) return
    body.replaceChildren()
    if (!r.ok) {
      body.append(h("div.hw-empty", {}, [ico("cloud", 22), h("div.hw-sub", { text: r.text }),
        h("button.hw-link", { text: "Change city", onclick: () => ctx.update({ config: { ...w.config, city: "" } }) })]))
      return
    }
    const now = wx(r.code)
    body.append(h("div.hw-wx", {}, [
      h("div.hw-wx-top", {}, [h("div.hw-wx-place", { text: r.place, title: "Click to change city", onclick: () => ctx.update({ config: { ...w.config, city: "" } }) }), ico(now.icon, 20)]),
      h("div.hw-wx-temp", { text: `${r.temp}°` }),
      h("div.hw-sub", { text: `${now.label} · H ${r.hi}° L ${r.lo}°` }),
      w.size !== "small" && h("div.hw-wx-days", {}, r.days.slice(1, w.size === "wide" ? 5 : 4).map((d) => h("div.hw-wx-day", {}, [
        h("span", { text: new Date(`${d.d}T12:00`).toLocaleDateString(undefined, { weekday: "short" }) }),
        ico(wx(d.code).icon, 15),
        h("span", { text: `${d.hi}°` })
      ])))
    ]))
  })
  const t = setInterval(() => ctx.rerender(), 30 * 60_000)
  return () => { dead = true; clearInterval(t) }
}

// ── sites: most-visited, favicon grid ─────────────────────────────
// "en.wikipedia.org" → "wikipedia", "mail.google.com" → "google"
const siteName = (host) => { const p = host.split("."); return p.length >= 2 ? p[p.length - 2] : host }

function sites (body, w) {
  const max = w.size === "small" ? 4 : w.size === "medium" ? 4 : 8
  const grid = h(`div.hw-sites.is-${w.size}`)
  body.append(grid)
  window.flux.history.search({ query: "", limit: 80, ranked: true }).then((rows) => {
    const seen = new Set()
    for (const e of rows) {
      const host = T.hostOf(e.url)
      if (!host || seen.has(host)) continue
      seen.add(host)
      const f = T.faviconFor(e.url)
      grid.append(h("button.hw-site", { title: e.title || e.url, onclick: () => T.navigate(e.url) }, [
        h("span.hw-site-ico", {}, [f ? h("img", { src: f, draggable: false, onerror: (ev) => ev.target.replaceWith(ico("globe", 20)) }) : ico("globe", 20)]),
        w.size !== "small" && h("span.hw-site-name", { text: siteName(host) })
      ]))
      if (seen.size >= max) break
    }
    if (!seen.size) grid.append(h("div.hw-sub", { text: "Sites you visit show up here." }))
  })
  return null
}

// ── clipboard: what Easy Files will offer the next upload ─────────
function clipboard (body, w) {
  let sig = ""
  const paint = async () => {
    const r = await window.flux.files.list()
    const it = r.ok ? r.clipboard[0] : null
    const k = it ? `${it.id}|${it.name}|${it.size}|${it.preview ?? ""}` : "none"
    if (k === sig) return
    sig = k
    body.replaceChildren(h("div.hw-head", {}, [ico("clipboard", 14), h("span", { text: "Clipboard" })]))
    if (!it) { body.append(h("div.hw-sub.hw-grow", { text: "Copy an image or a file — it's ready to upload on any site." })); return }
    const more = r.clipboard.length > 1 ? ` + ${r.clipboard.length - 1} more` : ""
    body.append(h("div.hw-clip", {}, [
      it.thumb ? h("img.hw-clip-thumb", { src: it.thumb, draggable: false }) : h("div.hw-clip-ico", {}, [ico(it.type?.startsWith("text/") ? "note" : "file", 22)]),
      h("div.hw-clip-text", {}, [
        h("div.hw-clip-name", { text: it.preview ? `“${it.preview}”` : it.name + more }),
        h("div.hw-sub", { text: it.size != null ? `${fmtSize(it.size)} · ready to upload` : "Ready to upload" })
      ])
    ]))
  }
  const onFocus = () => paint()
  window.addEventListener("focus", onFocus)
  const stop = every(2500, () => { if (!document.hidden) paint() })
  return () => { stop(); window.removeEventListener("focus", onFocus) }
}

// ── notes ─────────────────────────────────────────────────────────
function notes (body, w, ctx) {
  const ta = h("textarea.hw-notes", { placeholder: "Notes…", spellcheck: true, value: w.config?.text ?? "" })
  let t = null
  ta.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => ctx.update({ config: { ...w.config, text: ta.value } }, { quiet: true }), 500) })
  body.append(ta)
  return () => clearTimeout(t)
}

// ── battery ring ──────────────────────────────────────────────────
function battery (body) {
  const ring = h("div.hw-ring")
  const pct = h("div.hw-ring-pct")
  const sub = h("div.hw-sub")
  body.append(h("div.hw-batt", {}, [h("div.hw-ring-wrap", {}, [ring, h("span.hw-ring-ico", {}, [ico("battery", 18)])]), pct, sub]))
  if (!navigator.getBattery) { pct.textContent = "—"; sub.textContent = "No battery info"; return null }
  let b = null
  const paint = () => {
    const p = Math.round(b.level * 100)
    ring.style.setProperty("--p", p)
    ring.classList.toggle("is-low", p <= 20 && !b.charging)
    pct.textContent = `${p}%`
    sub.textContent = b.charging ? "Charging" : "Battery"
  }
  navigator.getBattery().then((x) => { b = x; paint(); b.addEventListener("levelchange", paint); b.addEventListener("chargingchange", paint) })
  return () => { b?.removeEventListener("levelchange", paint); b?.removeEventListener("chargingchange", paint) }
}

// ── open tabs ─────────────────────────────────────────────────────
function tabs (body, w) {
  const paint = () => {
    const list = T.getTabs().filter((t) => !t.isHome)
    body.replaceChildren(h("div.hw-head", {}, [ico("layers", 14), h("span", { text: `${list.length} open tab${list.length === 1 ? "" : "s"}` })]))
    const show = list.slice(-(w.size === "large" ? 6 : w.size === "small" ? 2 : 3)).reverse()
    body.append(h("div.hw-tabs", {}, show.map((t) => h("button.hw-tab", { onclick: () => T.setActive(t.id), title: t.title || t.url }, [
      t.favicon ? h("img", { src: t.favicon, draggable: false }) : ico("globe", 14),
      h("span", { text: t.title || T.hostOf(t.url) })
    ]))))
  }
  paint()
  return bus.on("tabs", paint)
}

// ── hot tabs (your launchers + hotkeys) ───────────────────────────
function hottabs (body) {
  body.append(hotGrid())
  return null
}

export const KINDS = {
  clock: { name: "Clock", icon: "clock", sizes: ["small", "medium"], render: clock },
  calendar: { name: "Calendar", icon: "calendar", sizes: ["small", "medium", "large"], render: calendar },
  weather: { name: "Weather", icon: "sun", sizes: ["small", "medium", "wide"], render: weather },
  sites: { name: "Top Sites", icon: "globe", sizes: ["small", "medium", "large"], render: sites },
  clipboard: { name: "Clipboard", icon: "clipboard", sizes: ["small", "medium"], render: clipboard },
  notes: { name: "Notes", icon: "note", sizes: ["small", "medium", "large"], render: notes },
  battery: { name: "Battery", icon: "battery", sizes: ["small"], render: battery },
  tabs: { name: "Open Tabs", icon: "layers", sizes: ["small", "medium", "large"], render: tabs },
  hottabs: { name: "Hot Tabs", icon: "bolt", sizes: ["medium", "large", "wide"], render: hottabs }
}

export function renderWidget (body, w, ctx) {
  const kind = KINDS[w.kind]
  if (!kind) { body.append(h("div.hw-sub", { text: `Unknown widget “${w.kind}”` })); return null }
  try { return kind.render(body, w, ctx) ?? null } catch (e) {
    console.error("[widget]", w.kind, e)
    toast(`${kind.name} widget failed: ${e.message}`)
    return null
  }
}
