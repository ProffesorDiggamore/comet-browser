// ───────────────────────────────────────────────────────────────────
//  widgets-wx.js — the Weather widget, drawn like Apple's: a sky that
//  follows the condition and the time of day, white type, a big light
//  temperature, multicolor SF-style symbols, H/L, and an hourly strip
//  (medium / wide).  Data: Open-Meteo via main (main/weather.js).
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { ico } from "../core/icons.js"
import { state } from "../core/state.js"

// Open-Meteo WMO codes → [kind, label]
const WX = [
  [[0], "clear", "Clear"], [[1], "partly", "Mostly Clear"], [[2], "partly", "Partly Cloudy"], [[3], "cloudy", "Cloudy"],
  [[45, 48], "fog", "Foggy"], [[51, 53, 55, 56, 57], "rain", "Drizzle"], [[61, 63, 66, 80, 81], "rain", "Rain"], [[65, 67, 82], "rain", "Heavy Rain"],
  [[71, 73, 75, 77, 85, 86], "snow", "Snow"], [[95, 96, 99], "storm", "Thunderstorms"]
]
export const wx = (code) => { const r = WX.find(([c]) => c.includes(code)); return r ? { kind: r[1], label: r[2] } : { kind: "cloudy", label: "—" } }
const skyOf = (code, day) => { const k = wx(code).kind; return `${k}-${day ? "day" : "night"}` }

// ── SF-style multicolor symbols (32×32) ───────────────────────────
const CLOUD = "M9.2 26h14.6a5.6 5.6 0 0 0 .7-11.16A7.7 7.7 0 0 0 9.7 16.1 5 5 0 0 0 9.2 26z"
const SUN = (cx, cy, r) => {
  let rays = ""
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, r1 = r + 2.6, r2 = r + 5.2
    rays += `<line x1="${(cx + Math.sin(a) * r1).toFixed(2)}" y1="${(cy - Math.cos(a) * r1).toFixed(2)}" x2="${(cx + Math.sin(a) * r2).toFixed(2)}" y2="${(cy - Math.cos(a) * r2).toFixed(2)}"/>`
  }
  return `<g class="s-sun"><circle cx="${cx}" cy="${cy}" r="${r}"/><g class="s-rays">${rays}</g></g>`
}
const MOON = (s = 1, x = 0, y = 0) => `<path class="s-moon" transform="translate(${x} ${y}) scale(${s})" d="M19.6 4.2a11.3 11.3 0 1 0 8.6 17.3A9.6 9.6 0 0 1 19.6 4.2z"/>`
const SYMS = {
  "clear-day": () => SUN(16, 16, 6.6),
  "clear-night": () => MOON(1, 0.5, 1),
  "partly-day": () => `<g transform="translate(-3.2 -3.6) scale(.82)">${SUN(16, 16, 6.2)}</g><path class="s-cloud" transform="translate(2.4 1.2) scale(.9)" d="${CLOUD}"/>`,
  "partly-night": () => `${MOON(0.62, 1, 0.5)}<path class="s-cloud" transform="translate(2.4 1.2) scale(.9)" d="${CLOUD}"/>`,
  cloudy: () => `<path class="s-cloud" transform="translate(-1 -2.5) scale(1.06)" d="${CLOUD}"/>`,
  fog: () => `<path class="s-cloud" transform="translate(0 -6) scale(1)" d="${CLOUD}"/><g class="s-fog"><line x1="6" y1="24.5" x2="26" y2="24.5"/><line x1="9" y1="29" x2="23" y2="29"/></g>`,
  rain: () => `<path class="s-cloud" transform="translate(0 -6.5)" d="${CLOUD}"/><g class="s-drop"><line x1="11" y1="23" x2="9.6" y2="27.6"/><line x1="16.4" y1="23" x2="15" y2="27.6"/><line x1="21.8" y1="23" x2="20.4" y2="27.6"/></g>`,
  snow: () => `<path class="s-cloud" transform="translate(0 -6.5)" d="${CLOUD}"/><g class="s-flake"><circle cx="10.5" cy="24.4" r="1.5"/><circle cx="16" cy="26.8" r="1.5"/><circle cx="21.5" cy="24.4" r="1.5"/><circle cx="13" cy="29.6" r="1.3"/><circle cx="19" cy="29.6" r="1.3"/></g>`,
  storm: () => `<path class="s-cloud" transform="translate(0 -6.5)" d="${CLOUD}"/><path class="s-bolt" d="M17.4 19.6 12.2 26.2h3.6l-1.6 5.4 5.8-7.4h-3.7l1.9-4.6z"/>`
}
export function wxSymbol (code, day = true, size = 20) {
  const k = wx(code).kind
  const key = k === "clear" || k === "partly" ? `${k}-${day ? "day" : "night"}` : k
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  el.setAttribute("viewBox", "0 0 32 32")
  el.setAttribute("class", "hw-sym")
  el.setAttribute("width", size); el.setAttribute("height", size)
  el.setAttribute("aria-hidden", "true")
  el.innerHTML = (SYMS[key] ?? SYMS.cloudy)()
  return el
}
const locGlyph = () => {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  el.setAttribute("viewBox", "0 0 16 16"); el.setAttribute("class", "hw-wx-loc"); el.setAttribute("aria-hidden", "true")
  el.innerHTML = '<path d="M14.3 1.7 1.9 7.2c-.6.3-.5 1.1.2 1.2l5.5.9.9 5.5c.1.7.9.8 1.2.2z"/>'
  return el
}
const hourLabel = (t, i) => {
  if (i === 0) return "Now"
  const hr = Number(String(t).slice(11, 13))
  if (state.get("home.clock24") === true) return `${String(hr).padStart(2, "0")}`
  return `${((hr + 11) % 12) + 1}${hr < 12 ? "AM" : "PM"}`
}

export function weather (body, w, ctx) {
  const tile = body.closest(".hw")
  const city = w.config?.city
  const changeCity = () => ctx.update({ config: { ...w.config, city: "" } })
  if (!city) {
    tile?.setAttribute("data-sky", "partly-day")
    const input = h("input.hw-input", { placeholder: "City", spellcheck: false, "aria-label": "City for weather" })
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && input.value.trim()) ctx.update({ config: { ...w.config, city: input.value.trim() } }) })
    body.append(h("div.hw-wx-setup", {}, [wxSymbol(2, true, 34), h("div.hw-wx-setup-t", { text: "Weather" }), h("div.hw-wx-setup-s", { text: "Type a city, then Return" }), input]))
    return null
  }
  const now = new Date()
  tile?.setAttribute("data-sky", skyOf(1, now.getHours() >= 7 && now.getHours() < 19))
  const unit = state.get("home.tempUnit") ?? "f"
  body.append(h("div.hw-wx", {}, [h("div.hw-wx-place", {}, [h("span", { text: city }), locGlyph()]), h("div.hw-wx-temp.is-ghost", { text: "--°" }), h("div.hw-wx-cond", { text: "Loading…" })]))
  let dead = false
  window.flux.weather(city, unit).then((r) => {
    if (dead) return
    body.replaceChildren()
    if (!r.ok) {
      tile?.setAttribute("data-sky", "cloudy-day")
      body.append(h("div.hw-wx-setup", {}, [ico("cloud", 24), h("div.hw-wx-setup-s", { text: r.text }),
        h("button.hw-link", { text: "Change city", onclick: changeCity })]))
      return
    }
    tile?.setAttribute("data-sky", skyOf(r.code, r.day))
    const c = wx(r.code)
    const place = h("button.hw-wx-place", { title: "Change city", onclick: changeCity }, [h("span", { text: r.place }), locGlyph()])
    const temp = h("div.hw-wx-temp", { text: `${r.temp}°` })
    const cond = h("div.hw-wx-cond", { text: c.label })
    const hl = h("div.hw-wx-hl", { text: `H:${r.hi}° L:${r.lo}°` })
    const sym = wxSymbol(r.code, r.day, 22)
    const hours = (r.hours ?? []).slice(0, w.size === "wide" ? 7 : 6)
    const strip = () => h("div.hw-wx-hours", {}, hours.map((x, i) => h("div.hw-wx-hour", {}, [
      h("span.hw-wx-h-t", { text: hourLabel(x.t, i) }), wxSymbol(x.code, x.day, 22), h("span.hw-wx-h-v", { text: `${x.temp}°` })
    ])))
    if (w.size === "small") {
      body.append(h("div.hw-wx.is-small", {}, [place, temp, h("div.hw-wx-foot", {}, [sym, cond, hl])]))
    } else if (w.size === "medium") {
      body.append(h("div.hw-wx.is-medium", {}, [
        h("div.hw-wx-top", {}, [h("div.hw-wx-lead", {}, [place, temp]), h("div.hw-wx-now", {}, [sym, cond, hl])]),
        hours.length ? strip() : null
      ]))
    } else {
      const days = (r.days ?? []).slice(1, 4)
      body.append(h("div.hw-wx.is-wide", {}, [
        h("div.hw-wx-lead", {}, [place, temp, h("div.hw-wx-foot", {}, [sym, cond, hl])]),
        hours.length ? strip() : null,
        days.length ? h("div.hw-wx-days", {}, days.map((d) => h("div.hw-wx-day", {}, [
          h("span.hw-wx-h-t", { text: new Date(`${d.d}T12:00`).toLocaleDateString(undefined, { weekday: "short" }) }),
          wxSymbol(d.code, true, 22),
          h("span.hw-wx-h-v", {}, [h("b", { text: `${d.hi}°` }), h("i", { text: ` ${d.lo}°` })])
        ]))) : null
      ]))
    }
  })
  const t = setInterval(() => ctx.rerender(), 30 * 60_000)
  return () => { dead = true; clearInterval(t) }
}
