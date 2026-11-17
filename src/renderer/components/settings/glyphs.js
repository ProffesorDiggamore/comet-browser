// ───────────────────────────────────────────────────────────────────
//  settings/glyphs.js — filled, SF-Symbols-style glyphs for the Settings
//  sidebar squircles (System Settings look).  Each glyph is a list of
//  parts on a 24×24 grid:
//    "d"            filled path          { s: w, d }  stroked path (width w)
//    { eo: d }      filled, even-odd     { cut: d, s?: w }  knocked out of everything
//  Unknown ids fall back to the line icon set.
// ───────────────────────────────────────────────────────────────────
import { ico } from "../../core/icons.js"

const G = {
  profiles: [
    "M9 4.4a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2z",
    "M2.5 19.2c0-3.2 2.9-5.6 6.5-5.6s6.5 2.4 6.5 5.6c0 .7-.5 1.1-1.2 1.1H3.7c-.7 0-1.2-.4-1.2-1.1z",
    "M16.6 5.4a3 3 0 1 1 0 6 3 3 0 0 1 0-6z",
    "M16.4 13.4c3 .1 5.1 2.2 5.1 4.8 0 .6-.4 1-1 1h-3.3c.1-.3.1-.6.1-.9 0-1.9-.7-3.6-1.9-4.8.3-.1.6-.1 1-.1z"
  ],
  search: [{ s: 2.8, d: "M10.5 16.5a6 6 0 1 0 0-12 6 6 0 0 0 0 12z" }, { s: 3.2, d: "M15.2 15.2l5 5" }],
  appearance: [{ eo: "M12 2.5C6.7 2.5 2.5 6.6 2.5 11.7c0 5 4.1 9.8 9 9.8 1.4 0 2.2-.8 2.2-1.9 0-.6-.3-1-.6-1.5-.3-.4-.6-.8-.6-1.4 0-1 .8-1.8 1.9-1.8h2.2c3.2 0 5.9-2.4 5.9-5.6 0-4.8-4.7-8.8-10.5-8.8z M7.2 9.6a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z M9.8 5.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z M14.6 5.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z M17.4 9a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z" }],
  passwords: [
    { eo: "M8 6.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z M6.4 10.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z" },
    "M13.2 10.6H21a1.2 1.2 0 0 1 1.2 1.2v1.2a1.2 1.2 0 0 1-1 1.2v1.8a1 1 0 0 1-1 1h-.6a1 1 0 0 1-1-1v-1.8h-1.2v1a1 1 0 0 1-1 1h-.6a1 1 0 0 1-1-1v-1h-1.6z"
  ],
  import: [
    "M3 13.6a1.2 1.2 0 0 1 1.2-1.2h3.3l1.6 2.4h5.8l1.6-2.4h3.3a1.2 1.2 0 0 1 1.2 1.2v5.2A2.2 2.2 0 0 1 18.8 21H5.2A2.2 2.2 0 0 1 3 18.8z",
    { s: 2.6, d: "M12 3v8.4 M8.4 8.2l3.6 3.6 3.6-3.6" }
  ],
  home: ["M11.4 3.4a1 1 0 0 1 1.2 0l8.6 7c.5.4.2 1.3-.5 1.3h-1.2v7.8A1.5 1.5 0 0 1 18 21h-3.4v-5.2a1 1 0 0 0-1-1h-3.2a1 1 0 0 0-1 1V21H6a1.5 1.5 0 0 1-1.5-1.5v-7.8H3.3c-.7 0-1-.9-.5-1.3z"],
  modpacks: ["M12 2.8l9 4.5-9 4.5-9-4.5z", { s: 2.2, d: "M3.4 12l8.6 4.3 8.6-4.3 M3.4 16.4l8.6 4.3 8.6-4.3" }],
  audio: [
    "M3.5 9.1h3.2L11.3 5c.6-.6 1.7-.1 1.7.7v12.6c0 .8-1.1 1.3-1.7.7l-4.6-4.1H3.5a1 1 0 0 1-1-1V10.1a1 1 0 0 1 1-1z",
    { s: 2.2, d: "M16.2 9a4.2 4.2 0 0 1 0 6 M19 6.2a8 8 0 0 1 0 11.6" }
  ],
  ai: [
    "M10 4c.6 4.3 2.4 6.2 6.5 7-4.1.8-5.9 2.7-6.5 7-.6-4.3-2.4-6.2-6.5-7 4.1-.8 5.9-2.7 6.5-7z",
    "M18 2c.3 1.7 1 2.4 2.6 2.7-1.6.3-2.3 1-2.6 2.7-.3-1.7-1-2.4-2.6-2.7 1.6-.3 2.3-1 2.6-2.7z",
    "M18.6 15.2c.2 1.4.8 2 2.2 2.2-1.4.2-2 .8-2.2 2.2-.2-1.4-.8-2-2.2-2.2 1.4-.2 2-.8 2.2-2.2z"
  ],
  motion: ["M15.5 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10z", { s: 2.2, d: "M2.5 8.5h5.5 M1.8 12h5 M2.5 15.5h5.5" }],
  layout: [{ s: 2.1, d: "M5 4.2h14a2.4 2.4 0 0 1 2.4 2.4v10.8a2.4 2.4 0 0 1-2.4 2.4H5a2.4 2.4 0 0 1-2.4-2.4V6.6A2.4 2.4 0 0 1 5 4.2z" }, "M5.2 6.3h4v11.4h-4a.9.9 0 0 1-.9-.9V7.2a.9.9 0 0 1 .9-.9z"],
  vision: [{ eo: "M6.8 19.5a4.6 4.6 0 0 1-.5-9.2 6.2 6.2 0 0 1 11.9-1.6 5.4 5.4 0 0 1-.6 10.8z M12 10.2a1.9 1.9 0 0 0-.9 3.6l-.5 2.8h2.8l-.5-2.8a1.9 1.9 0 0 0-.9-3.6z" }],
  perf: [
    "M12 4.5A9.5 9.5 0 0 0 2.5 14c0 1.7.4 3.3 1.2 4.7.3.5.8.8 1.4.8h13.8c.6 0 1.1-.3 1.4-.8.8-1.4 1.2-3 1.2-4.7A9.5 9.5 0 0 0 12 4.5z",
    { cut: "M13.3 15.1l3.9-5.6-5.6 3.9a1.9 1.9 0 1 0 1.7 1.7z" },
    { cut: "M6.2 14h1.4 M16.4 14h1.4 M12 7.6V9", s: 1.8 }
  ],
  extensions: ["M10 3.5a2.2 2.2 0 0 1 2.2 2.2v.8H16a1.5 1.5 0 0 1 1.5 1.5v3.8h.8a2.2 2.2 0 1 1 0 4.4h-.8V20a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 20v-4h1a2.3 2.3 0 1 0 0-4.6H3V8a1.5 1.5 0 0 1 1.5-1.5h3.3v-.8A2.2 2.2 0 0 1 10 3.5z"],
  shortcuts: [{ s: 2.2, d: "M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" }],
  privacy: [
    "M12 2.4l7.6 2.9v6.2c0 4.8-3.2 8.7-7.6 10.1-4.4-1.4-7.6-5.3-7.6-10.1V5.3z",
    { cut: "M8.4 12l2.5 2.5 4.8-5", s: 2.3 }
  ],
  about: [
    "M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19z",
    { cut: "M12 11v5.6", s: 2.6 },
    { cut: "M12 6.4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z" }
  ]
}

const NS = "http://www.w3.org/2000/svg"
let seq = 0
function el (tag, attrs) {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  return e
}
function part (p, color) {
  if (typeof p === "string") return el("path", { d: p, fill: color })
  if (p.eo) return el("path", { d: p.eo, fill: color, "fill-rule": "evenodd" })
  if (p.cut) return p.s ? el("path", { d: p.cut, fill: "none", stroke: color, "stroke-width": p.s, "stroke-linecap": "round", "stroke-linejoin": "round" }) : el("path", { d: p.cut, fill: color })
  return el("path", { d: p.d, fill: "none", stroke: color, "stroke-width": p.s, "stroke-linecap": "round", "stroke-linejoin": "round" })
}

export function catGlyph (id, size = 15, fallback = "globe") {
  const parts = G[id]
  if (!parts) { const g = ico(fallback, size); g.setAttribute("stroke-width", "2.2"); return g }
  const svg = el("svg", { viewBox: "0 0 24 24", width: size, height: size, "aria-hidden": "true", class: "cat-glyph" })
  svg.style.display = "block"
  svg.style.flex = "0 0 auto"
  const solid = parts.filter((p) => !p.cut)
  const cuts = parts.filter((p) => p.cut)
  const g = el("g", {})
  for (const p of solid) g.append(part(p, "currentColor"))
  if (cuts.length) {
    const id = `cg${++seq}`
    const mask = el("mask", { id, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: 24, height: 24 })
    mask.append(el("rect", { x: 0, y: 0, width: 24, height: 24, fill: "#fff" }), ...cuts.map((p) => part(p, "#000")))
    svg.append(mask)
    g.setAttribute("mask", `url(#${id})`)
  }
  svg.append(g)
  return svg
}
