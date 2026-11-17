// ───────────────────────────────────────────────────────────────────
//  widgets-kit.js — small shared pieces for the Home widgets: a tick
//  that sleeps while Comet is in the background, SVG helpers, the
//  Apple-style analog dial (Clock / World Clock) and progress ring
//  (Batteries / Timer).
// ───────────────────────────────────────────────────────────────────
import { bus } from "../core/bus.js"
import { isWinActive } from "../core/perf.js"

// a repeating tick that sleeps while Comet isn't the app in front, and catches up when it is
export const every = (ms, fn) => {
  fn()
  const t = setInterval(() => { if (isWinActive()) fn() }, ms)
  const off = bus.on("win-active", (on) => { if (on) fn() })
  return () => { clearInterval(t); off?.() }
}
export const setText = (el, v) => { if (el.textContent !== v) el.textContent = v }   // unchanged text → no repaint
export const pad = (n) => String(n).padStart(2, "0")
export const motionOn = () => (document.body.dataset.motion ?? "full") === "full" && !matchMedia("(prefers-reduced-motion: reduce)").matches

const NS = "http://www.w3.org/2000/svg"
export function svg (viewBox, cls) {
  const el = document.createElementNS(NS, "svg")
  el.setAttribute("viewBox", viewBox)
  if (cls) el.setAttribute("class", cls)
  el.setAttribute("aria-hidden", "true")
  return el
}
export function sv (parent, tag, attrs = {}) {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  parent.append(e)
  return e
}

// ── Apple Clock-widget dial: numbers 1–12, hour + minute hands, red
//    second hand (only while motion is allowed), ticks for every minute.
export function dial ({ numbers = true, seconds = true } = {}) {
  const el = svg("0 0 100 100", "hw-dial")
  sv(el, "circle", { cx: 50, cy: 50, r: 50, class: "hw-dial-face" })
  if (numbers) {
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2, big = i % 5 === 0
      const r1 = 46.5, r2 = big ? 43 : 44.6
      sv(el, "line", { x1: 50 + Math.sin(a) * r1, y1: 50 - Math.cos(a) * r1, x2: 50 + Math.sin(a) * r2, y2: 50 - Math.cos(a) * r2, class: big ? "hw-dial-tick is-major" : "hw-dial-tick" })
    }
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const t = sv(el, "text", { x: 50 + Math.sin(a) * 35, y: 50 - Math.cos(a) * 35, class: "hw-dial-num" })
      t.textContent = String(i)
    }
  } else {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      sv(el, "line", { x1: 50 + Math.sin(a) * 43, y1: 50 - Math.cos(a) * 43, x2: 50 + Math.sin(a) * 38, y2: 50 - Math.cos(a) * 38, class: "hw-dial-tick is-major" })
    }
  }
  // hands are drawn pointing at 12 and rotated; a thin neck then a wider blade, like Apple's
  const hand = (len, w, cls) => {
    const g = sv(el, "g", { class: `hw-dial-hand ${cls}` })
    sv(g, "line", { x1: 50, y1: 50, x2: 50, y2: 50 - 7, class: "hw-dial-neck" })
    sv(g, "line", { x1: 50, y1: 50 - 7, x2: 50, y2: 50 - len, "stroke-width": w, class: "hw-dial-blade" })
    return g
  }
  const hh = hand(26, 4.4, "is-h")
  const mm = hand(41, 4.4, "is-m")
  sv(el, "circle", { cx: 50, cy: 50, r: 3, class: "hw-dial-pin" })
  const ss = seconds ? sv(el, "g", { class: "hw-dial-hand is-s" }) : null
  if (ss) {
    sv(ss, "line", { x1: 50, y1: 58, x2: 50, y2: 8 })
    sv(ss, "circle", { cx: 50, cy: 50, r: 2 })
  }
  sv(el, "circle", { cx: 50, cy: 50, r: 1, class: "hw-dial-cap" })
  return {
    el,
    set (hr24, min, sec) {
      const m = min + (sec ?? 0) / 60, hr = (hr24 % 12) + m / 60
      hh.setAttribute("transform", `rotate(${hr * 30} 50 50)`)
      mm.setAttribute("transform", `rotate(${m * 6} 50 50)`)
      if (ss) {
        const show = sec != null
        ss.style.display = show ? "" : "none"
        if (show) ss.setAttribute("transform", `rotate(${sec * 6} 50 50)`)
      }
    }
  }
}

// ── progress ring (round caps), SVG so it stays crisp at any scale ──
export function ring (cls = "") {
  const el = svg("0 0 100 100", `hw-ring ${cls}`.trim())
  sv(el, "circle", { cx: 50, cy: 50, r: 44, class: "hw-ring-track" })
  const bar = sv(el, "circle", { cx: 50, cy: 50, r: 44, class: "hw-ring-bar", pathLength: 100, transform: "rotate(-90 50 50)" })
  return {
    el,
    set (p) {
      const v = Math.max(0, Math.min(100, p))
      bar.setAttribute("stroke-dasharray", `${v} 100`)
      bar.style.opacity = v <= 0 ? "0" : ""
    }
  }
}

// favicon on a soft plate tinted from the host name (an app-icon look without reading pixels)
export function hueOf (s) {
  let x = 0
  for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) >>> 0
  return x % 360
}
