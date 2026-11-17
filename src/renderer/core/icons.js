// ───────────────────────────────────────────────────────────────────
//  icons.js — inline SVG icon set (Feather / Lucide geometry, MIT).
//  ico(name, size) → <svg>; stroke inherits currentColor.
//  24×24 viewBox, 1.9 stroke, round caps — one visual family.
// ───────────────────────────────────────────────────────────────────
const P = {
  back:     "M15 18l-6-6 6-6",
  forward:  "M9 18l6-6-6-6",
  chevron:  "M9 18l6-6-6-6",
  reload:   "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  reset:    "M1 4v6h6M3.51 15a9 9 0 1 0 2.13-9.36L1 10",
  home:     "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  plus:     "M12 5v14M5 12h14",
  close:    "M18 6L6 18M6 6l12 12",
  x:        "M18 6L6 18M6 6l12 12",
  check:    "M20 6L9 17l-5-5",
  search:   "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35",
  zoomIn:   "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35 M11 8v6 M8 11h6",
  zoomOut:  "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35 M8 11h6",
  globe:    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M2 12h20 M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z",
  grid:     "M3 3h8v8H3z M13 3h8v8h-8z M13 13h8v8h-8z M3 13h8v8H3z",
  layers:   "M12 2l10 5-10 5L2 7l10-5z M2 12l10 5 10-5 M2 17l10 5 10-5",
  gear:     "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  palette:  "M12 2a10 10 0 0 0 0 20 2 2 0 0 0 2-2 2 2 0 0 1 2-2h1.5a4.5 4.5 0 0 0 4.5-4.5A10 10 0 0 0 12 2z M8.5 11a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M13.5 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M17.5 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  volume:   "M11 5L6 9H2v6h4l5 4V5z M15.5 8.5a5 5 0 0 1 0 7 M19 5a10 10 0 0 1 0 14",
  eye:      "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeoff:   "M9.9 9.9a3 3 0 0 0 4.2 4.2 M10.7 5.1A11 11 0 0 1 12 5c7 0 11 7 11 7a18 18 0 0 1-2.2 3.2 M6.6 6.6A18 18 0 0 0 1 12s4 7 11 7a11 11 0 0 0 5.4-1.4 M1 1l22 22",
  key:      "M7.5 21a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11z M11.4 11.6L21 2 M15.5 7.5l2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4",
  spark:    "M12 2l2.9 6.9L22 9.2l-5 4.9 1.2 7L12 17.8 5.8 21l1.2-7-5-4.9 7.1-.3z",
  bolt:     "M13 2L3 14h9l-1 8 10-12h-9z",
  gauge:    "M22 12h-4l-3 9L9 3l-3 9H2",
  puzzle:   "M9 3a2 2 0 0 1 4 0v1h3a1 1 0 0 1 1 1v3h1a2 2 0 0 1 0 4h-1v3a1 1 0 0 1-1 1h-3v-1a2 2 0 0 0-4 0v1H5a1 1 0 0 1-1-1v-3H3a2 2 0 0 1 0-4h1V5a1 1 0 0 1 1-1h3z",
  info:     "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 16v-4 M12 8h.01",
  sleep:    "M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z",
  moon:     "M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z",
  trash:    "M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M10 11v6 M14 11v6",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3",
  copy:     "M20 9H11a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  window:   "M8 8h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1 M6 11.5h15",
  bookmark: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z",
  bookmarks:"M16 21l-5.5-4L5 21V8a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2z M9 3h8a2 2 0 0 1 2 2v12",
  shield:   "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  link:     "M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  clock:    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2",
  note:     "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  play:     "M5 3l14 9-14 9z",
  external: "M15 3h6v6 M10 14L21 3 M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6",
  arrowRight: "M5 12h14 M12 5l7 7-7 7",
  arrowUp:  "M12 19V5 M5 12l7-7 7 7",
  hash:     "M4 9h16 M4 15h16 M10 3L8 21 M16 3l-2 18",
  mic:      "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v3",
  scan:     "M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  share:    "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8 M16 6l-4-4-4 4 M12 2v13",
  split:    "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M12 3v18",
  sidebar:  "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M9 3v18",
  stop:     "M8 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z",
  pin:      "M12 17v5 M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z",
  volumeX:  "M11 5L6 9H2v6h4l5 4V5z M23 9l-6 6 M17 9l6 6",
  book:     "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",
  more:     "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  image:    "M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21",
  focus:    "M8 3H5a2 2 0 0 0-2 2v3 M21 8V5a2 2 0 0 0-2-2h-3 M3 16v3a2 2 0 0 0 2 2h3 M16 21h3a2 2 0 0 0 2-2v-3",
  overview: "M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z M16 8V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4",
  lock:     "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z M7 11V7a5 5 0 0 1 10 0v4",
  pip:      "M21 9V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4 M13 13h8v7h-8z",
  edit:     "M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z",
  chat:     "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  chevronDown: "M6 9l6 6 6-6",
  cursor:   "M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z M13 13l6 6",
  sun:      "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42",
  contrast: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 2v20 M12 2a10 10 0 0 1 0 20",
  cloud:    "M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z",
  rain:     "M16 13v8 M8 13v8 M12 15v8 M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25",
  snow:     "M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25 M8 16h.01 M8 20h.01 M12 18h.01 M12 22h.01 M16 16h.01 M16 20h.01",
  storm:    "M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9 M13 11l-4 6h6l-4 6",
  clipboard:"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z",
  file:     "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6",
  upload:   "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12",
  battery:  "M17 7H3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z M23 13v-2",
  calendar: "M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M16 2v4 M8 2v4 M3 10h18",
  widgets:  "M10 3H3v7h7z M21 3h-7v7h7z M21 14h-7v7h7z M10 14H3v7h7z",
  folder:   "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
  user:     "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  users:    "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  pause:    "M6 4h4v16H6z M14 4h4v16h-4z",
  lens:     "M3 8V6a3 3 0 0 1 3-3h2 M16 3h2a3 3 0 0 1 3 3v2 M3 16v2a3 3 0 0 0 3 3h2 M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M17.5 18.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  list:     "M9 6h11 M9 12h11 M9 18h11 M4.5 6.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z M4.5 12.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z M4.5 18.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z",
  timer:    "M10 2h4 M12 14l3-3 M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
  hourglass:"M6 2h12 M6 22h12 M7 2v4a5 5 0 0 0 10 0V2 M7 22v-4a5 5 0 0 1 10 0v4",
  history:  "M3 12a9 9 0 1 0 3-6.7L3 8 M3 3v5h5 M12 7v5l3 2",
  quote:    "M3 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2H4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h3c0 4-2 6-4 6z M15 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2h-4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h3c0 4-2 6-4 6z",
  flux:     "M16.82 6.25A7.5 7.5 0 1 0 19.43 10.96 M16.82 5.2a1.05 1.05 0 1 0 0 2.1 1.05 1.05 0 0 0 0-2.1z"
}

export function ico (name, size = 18) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("width", size)
  svg.setAttribute("height", size)
  svg.setAttribute("fill", "none")
  svg.setAttribute("stroke", "currentColor")
  svg.setAttribute("stroke-width", "1.9")
  svg.setAttribute("stroke-linecap", "round")
  svg.setAttribute("stroke-linejoin", "round")
  svg.setAttribute("aria-hidden", "true")
  svg.style.flex = "0 0 auto"
  svg.style.display = "block"
  const parts = PARTS[name]
  if (parts) { parts(svg); return svg }
  svg.append(path(P[name] ?? P.globe))
  return svg
}

const NS = "http://www.w3.org/2000/svg"
function path (d, cls, fill) {
  const el = document.createElementNS(NS, "path")
  el.setAttribute("d", d)
  if (cls) el.setAttribute("class", cls)
  if (fill) { el.setAttribute("fill", "currentColor"); el.setAttribute("stroke", "none") }
  return el
}
let clipSeq = 0

// icons built from separate parts so CSS can animate the pieces
// (motion.css: the clock sweeps 12 hours, the download arrow drops
// through the tray and falls back in from the top)
const PARTS = {
  clock (svg) {
    svg.classList.add("i-clock")
    svg.append(path("M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z"), path("M12 12V6", "i-min"), path("M12 12l4 2", "i-hour"))
  },
  download (svg) {
    svg.classList.add("i-download")
    const id = `i-dl-clip-${++clipSeq}`
    const clip = document.createElementNS(NS, "clipPath")
    clip.setAttribute("id", id)
    const r = document.createElementNS(NS, "rect")
    for (const [k, v] of Object.entries({ x: 0, y: 0.6, width: 24, height: 18.6 })) r.setAttribute(k, v)
    clip.append(r)
    const g = document.createElementNS(NS, "g")
    g.setAttribute("clip-path", `url(#${id})`)
    g.append(path("M7 10l5 5 5-5 M12 15V3", "i-arrow"))
    svg.append(clip, path("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"), g)
  },
  // private: a whole eye with a slash through it; on hover the slash draws
  // in (motion.css) and the mask cuts the eye's outline along it
  eyeoff (svg) {
    svg.classList.add("i-eyeoff")
    const id = `i-eye-mask-${++clipSeq}`
    const mask = document.createElementNS(NS, "mask")
    for (const [k, v] of Object.entries({ id, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: 24, height: 24 })) mask.setAttribute(k, v)
    const bg = document.createElementNS(NS, "rect")
    for (const [k, v] of Object.entries({ x: 0, y: 0, width: 24, height: 24, fill: "#fff", stroke: "none" })) bg.setAttribute(k, v)
    const cut = path("M3 3l18 18", "i-slash")
    cut.setAttribute("stroke", "#000"); cut.setAttribute("stroke-width", "5"); cut.setAttribute("pathLength", "1")
    mask.append(bg, cut)
    const g = document.createElementNS(NS, "g")
    g.setAttribute("mask", `url(#${id})`)
    g.append(path("M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12z"), path("M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "i-pupil"))
    const slash = path("M3 3l18 18", "i-slash")
    slash.setAttribute("pathLength", "1")
    svg.append(mask, g, slash)
  },
  // Appearance: Auto — a disc, half lit and half dark (the macOS "Auto" glyph)
  auto (svg) {
    svg.classList.add("i-auto")
    svg.append(path("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"), path("M12 3a9 9 0 0 1 0 18z", "i-auto-half", true))
  }
}

export const ICON_NAMES = [...Object.keys(P), "auto"]
