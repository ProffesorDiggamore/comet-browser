// ───────────────────────────────────────────────────────────────────
//  widgets-time.js — the time-keeping Home widgets, drawn like Apple's
//  WidgetKit ones: Clock (analog dial / big digital), Calendar (red
//  weekday, huge date, month grid), World Clock (a row of day/night
//  dials), Countdown, and the Focus Timer (Timer-widget ring).
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { ico } from "../core/icons.js"
import { state } from "../core/state.js"
import { bus, toast } from "../core/bus.js"
import { isWinActive } from "../core/perf.js"
import { every, setText, pad, dial, ring, motionOn } from "./widgets-kit.js"

const clock24 = () => state.get("home.clock24") === true
const hm = (d) => clock24() ? { t: `${pad(d.getHours())}:${pad(d.getMinutes())}`, ap: "" } : { t: `${((d.getHours() + 11) % 12) + 1}:${pad(d.getMinutes())}`, ap: d.getHours() < 12 ? "AM" : "PM" }

// ── clock: small = Apple's analog Clock widget, medium = big digital + dial ──
export function clock (body, w) {
  const face = dial({ seconds: true })
  if (w.size === "small") {
    body.append(h("div.hw-clock-dial", {}, [face.el]))
  } else {
    const time = h("span.hw-time"), ap = h("span.hw-time-ap"), date = h("div.hw-clock-date")
    body.append(h("div.hw-clock-row", {}, [
      h("div.hw-clock-text", {}, [date, h("div.hw-time-line", {}, [time, ap]), h("div.hw-clock-zone", { text: Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop().replace(/_/g, " ") })]),
      h("div.hw-clock-side", {}, [face.el])
    ]))
    const paintText = (d) => {
      const x = hm(d)
      setText(time, x.t); setText(ap, x.ap)
      setText(date, d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))
    }
    paintText(new Date())
    face._text = paintText
  }
  // the red second hand sweeps only while motion is allowed; otherwise a minute tick
  const live = motionOn()
  return every(live ? 1000 : 15_000, () => {
    const d = new Date()
    face.set(d.getHours(), d.getMinutes(), live ? d.getSeconds() : null)
    face._text?.(d)
  })
}

// ── calendar ──────────────────────────────────────────────────────
function monthGrid (d, { heads = true } = {}) {
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const cells = []
  if (heads) for (const c of "SMTWTFS") cells.push(h("span.hw-cal-h", { text: c }))
  for (let i = 0; i < first.getDay(); i++) cells.push(h("span.hw-cal-pad"))
  for (let i = 1; i <= days; i++) {
    const dow = (first.getDay() + i - 1) % 7
    cells.push(h(`span.hw-cal-d${i === d.getDate() ? ".is-today" : ""}${dow === 0 || dow === 6 ? ".is-wkend" : ""}`, {}, [h("b", { text: String(i) })]))
  }
  return h("div.hw-cal-grid", { dataset: { rows: Math.ceil((first.getDay() + days) / 7) } }, cells)
}
export function calendar (body, w, ctx) {
  const d = new Date()
  const dow = h("div.hw-cal-dow", { text: d.toLocaleDateString(undefined, { weekday: "long" }) })
  const num = h("div.hw-cal-num", { text: String(d.getDate()) })
  const month = d.toLocaleDateString(undefined, { month: "long" })
  if (w.size === "small") {
    body.append(h("div.hw-cal-small", {}, [dow, num, h("div.hw-cal-cap", { text: `${month} ${d.getFullYear()}` })]))
  } else if (w.size === "medium") {
    body.append(h("div.hw-cal-medium", {}, [
      h("div.hw-cal-today", {}, [dow, num, h("div.hw-cal-cap", { text: month })]),
      h("div.hw-cal-month", {}, [h("div.hw-cal-mname", { text: month.toUpperCase() }), monthGrid(d)])
    ]))
  } else {
    body.append(h("div.hw-cal-large", {}, [
      h("div.hw-cal-top", {}, [h("div", {}, [dow, num]), h("div.hw-cal-mname", { text: `${month} ${d.getFullYear()}` })]),
      monthGrid(d)
    ]))
  }
  // repaint at midnight
  const ms = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) - d + 500
  const t = setTimeout(() => body.isConnected && ctx.rerender(), ms)
  return () => clearTimeout(t)
}

// ── world clock: a row of mini dials, white by day and black by night ──
const DEFAULT_ZONES = ["America/Los_Angeles", "America/New_York", "Europe/London", "Asia/Tokyo"]
const zoneCity = (z) => z.split("/").pop().replace(/_/g, " ")
const zoneAbbr = (z) => zoneCity(z).replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase()
function zoneNow (z, now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: z, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]))
  const hr = Number(p.hour) % 24
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, hr, +p.minute)
  const offMin = Math.round((asUtc - (now.getTime() - now.getSeconds() * 1000 - now.getMilliseconds())) / 60_000) + now.getTimezoneOffset()
  return { hr, min: +p.minute, ymd: `${p.year}-${p.month}-${p.day}`, offMin }
}
const fmtOff = (m) => {
  if (!m) return "+0HRS"
  const a = Math.abs(m), hh = Math.floor(a / 60), mm = a % 60
  return `${m > 0 ? "+" : "−"}${hh}${mm ? `:${pad(mm)}` : ""}HRS`
}
export function worldclock (body, w, ctx) {
  const zones = w.config?.zones?.length ? w.config.zones : DEFAULT_ZONES
  const n = w.size === "wide" ? 6 : 4
  const show = zones.slice(0, n)
  const items = show.map((z) => {
    const face = dial({ numbers: false, seconds: false })
    const day = h("span.hw-wc-day"), off = h("span.hw-wc-off")
    const el = h("div.hw-wc-item", { title: z }, [
      h("div.hw-wc-dial", {}, [face.el,
        h("button.hw-wc-x", { title: `Remove ${zoneCity(z)}`, "aria-label": `Remove ${zoneCity(z)}`, onclick: () => ctx.update({ config: { ...w.config, zones: zones.filter((x) => x !== z) } }) }, [ico("x", 9)])]),
      h("span.hw-wc-city", { text: w.size === "small" ? zoneAbbr(z) : zoneCity(z) }),
      w.size !== "small" && day, w.size !== "small" && off
    ])
    return { z, face, day, off, el }
  })
  body.append(h(`div.hw-wc.is-${w.size}`, { style: { "--n": items.length } }, items.map((r) => r.el)))
  if (w.size !== "small") {
    const dl = h("datalist", { id: `${w.id}_zones` }, (Intl.supportedValuesOf?.("timeZone") ?? []).map((z) => h("option", { value: z })))
    const add = h("input.hw-input.hw-wc-input", { placeholder: "Add a city — e.g. Paris", list: dl.id, spellcheck: false })
    const bar = h("div.hw-wc-add", {}, [add, dl])
    add.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { body.classList.remove("is-adding"); return }
      if (e.key !== "Enter") return
      const q = add.value.trim().toLowerCase().replace(/\s+/g, "_")
      const all = Intl.supportedValuesOf?.("timeZone") ?? []
      const z = all.find((x) => x.toLowerCase() === q) ?? all.find((x) => x.toLowerCase().endsWith(`/${q}`))
      if (!z) return toast("No time zone for that city — try a nearby big city")
      ctx.update({ config: { ...w.config, zones: [z, ...zones.filter((x) => x !== z)] } })
    })
    add.addEventListener("blur", () => setTimeout(() => body.classList.remove("is-adding"), 120))
    body.append(bar, h("button.hw-corner-btn", { title: "Add a city", "aria-label": "Add a city", onclick: () => { body.classList.add("is-adding"); add.focus() } }, [ico("plus", 12)]))
  }
  return every(15_000, () => {
    const now = new Date()
    const mine = now.toLocaleDateString("en-CA")
    for (const r of items) {
      const z = zoneNow(r.z, now)
      r.face.set(z.hr, z.min, null)
      r.el.classList.toggle("is-night", z.hr < 6 || z.hr >= 18)
      setText(r.day, z.ymd === mine ? "Today" : z.ymd > mine ? "Tomorrow" : "Yesterday")
      setText(r.off, fmtOff(z.offMin))
    }
  })
}

// ── countdown: big number of days, over a tinted card ─────────────
export function countdown (body, w, ctx) {
  const c = w.config ?? {}
  if (!c.date) {
    const name = h("input.hw-input", { placeholder: "What's coming up?", maxLength: 40 })
    const date = h("input.hw-input", { type: "date" })
    const go = () => { if (date.value) ctx.update({ config: { ...c, label: name.value.trim() || "Countdown", date: date.value } }) }
    date.addEventListener("change", go)
    name.addEventListener("keydown", (e) => { if (e.key === "Enter") date.showPicker?.() })
    body.append(h("div.hw-cd-setup", {}, [h("div.hw-head", {}, [ico("hourglass", 13), h("span", { text: "Countdown" })]), name, date]))
    return null
  }
  const num = h("span.hw-cd-num"), unit = h("span.hw-cd-unit")
  body.append(h("div.hw-cd", {}, [
    h("div.hw-cd-label", { text: c.label ?? "Countdown", title: "Click to change", onclick: () => ctx.update({ config: { ...c, date: "" } }) }),
    h("div.hw-cd-big", {}, [num, unit]),
    h("div.hw-cd-date", { text: new Date(`${c.date}T00:00`).toLocaleDateString(undefined, w.size === "small" ? { weekday: "short", month: "short", day: "numeric" } : { weekday: "long", month: "long", day: "numeric", year: "numeric" }) })
  ]))
  return every(60_000, () => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const days = Math.round((new Date(`${c.date}T00:00`) - today) / 86_400_000)
    setText(num, days === 0 ? "Today" : String(Math.abs(days)))
    setText(unit, days === 0 ? "" : days > 0 ? `day${days === 1 ? "" : "s"}` : `day${days === -1 ? "" : "s"} ago`)
    body.classList.toggle("is-today", days === 0)
  })
}

// ── focus timer: the Timer widget's ring, survives re-renders and reloads ──
const FOCUS_PRESETS = [{ m: 25, label: "Focus" }, { m: 5, label: "Break" }, { m: 50, label: "Deep" }]
export function focus (body, w, ctx) {
  const cfg = () => w.config ?? {}
  const set = (patch) => { w.config = { ...cfg(), ...patch }; ctx.update({ config: w.config }, { quiet: true }); paint() }
  const total = () => (cfg().mins ?? 25) * 60_000
  const left = () => { const c = cfg(); return c.endsAt ? Math.max(0, c.endsAt - Date.now()) : (c.left ?? total()) }
  const r = ring("hw-focus-ring")
  const time = h("div.hw-focus-time")
  const label = h("div.hw-focus-label")
  const sub = h("div.hw-focus-sub")
  const play = h("button.hw-focus-btn", { onclick: () => {
    const c = cfg()
    if (c.endsAt && left() > 0) set({ endsAt: null, left: left() })
    else set({ endsAt: Date.now() + (left() || total()), left: null })
  } })
  const reset = h("button.hw-focus-btn.is-quiet", { title: "Reset", "aria-label": "Reset", onclick: () => set({ endsAt: null, left: null }) }, [ico("reset", 13)])
  const presets = w.size !== "small" ? h("div.hw-focus-presets", {}, FOCUS_PRESETS.map((p) => h("button.hw-chip", { text: `${p.m}m`, title: `${p.label} · ${p.m} minutes`, dataset: { m: p.m }, onclick: () => set({ mins: p.m, endsAt: null, left: null }) }))) : null
  body.append(h(`div.hw-focus.is-${w.size}`, {}, [
    h("div.hw-focus-dial", {}, [r.el, h("div.hw-focus-center", {}, [time])]),
    w.size === "small"
      ? h("div.hw-focus-foot", {}, [label, h("div.hw-focus-ctl", {}, [reset, play])])
      : h("div.hw-focus-side", {}, [label, sub, h("div.hw-focus-ctl", {}, [play, reset]), presets])
  ]))
  function paint () {
    const ms = left()
    const running = !!cfg().endsAt && ms > 0
    const s = Math.ceil(ms / 1000)
    setText(time, `${Math.floor(s / 60)}:${pad(s % 60)}`)
    r.set((1 - ms / total()) * 100)
    body.classList.toggle("is-running", running)
    setText(label, ms === 0 ? "Done" : running ? "Focusing" : ms < total() ? "Paused" : "Focus")
    setText(sub, ms === 0 ? "Nice work — take a break." : `${cfg().mins ?? 25}-minute timer`)
    play.replaceChildren(ico(running ? "pause" : "play", 13), w.size === "small" ? "" : h("span", { text: running ? "Pause" : ms < total() && ms > 0 ? "Resume" : "Start" }))
    play.title = running ? "Pause" : "Start"
    play.setAttribute("aria-label", play.title)
    presets?.querySelectorAll("button").forEach((b) => b.classList.toggle("is-on", Number(b.dataset.m) === (cfg().mins ?? 25)))
  }
  // ticks only while it's running (the alarm itself lives in armFocusAlarm, so it
  // rings even when you've left Home or Comet is in the background)
  const t = setInterval(() => { if (cfg().endsAt && isWinActive()) paint() }, 1000)
  const off = bus.on("win-active", (on) => { if (on) paint() })
  paint()
  return () => { clearInterval(t); off?.() }
}
