// ───────────────────────────────────────────────────────────────────
//  schematic.js — Blackline telemetry HUD.  A tiny mono readout in the
//  sidebar drag strip: pointer X/Y, app memory + CPU, clock.  Only
//  alive while the Blackline theme is active — otherwise every
//  listener and timer is torn down, so the other themes pay nothing.
// ───────────────────────────────────────────────────────────────────
import { state } from "../core/state.js"
import { bus } from "../core/bus.js"
import { watchMetrics } from "../core/perf.js"

let el = null
let xyEl, sysEl, tEl
let on = false
let raf = 0
let px = 0, py = 0
let clockTimer = null
let unMetrics = null

const pad = (n, w) => String(Math.max(0, n | 0)).padStart(w, "0")

function build () {
  el = document.createElement("div")
  el.id = "schem-hud"
  el.setAttribute("aria-hidden", "true")
  el.innerHTML = `<span class="sh-xy">X···· Y····</span><span class="sh-sys">M···· C···</span><span class="sh-t"></span>`
  xyEl = el.querySelector(".sh-xy")
  sysEl = el.querySelector(".sh-sys")
  tEl = el.querySelector(".sh-t")
  document.body.append(el)
}

function onMove (e) {
  px = e.clientX; py = e.clientY
  if (!raf) raf = requestAnimationFrame(() => { raf = 0; xyEl.textContent = `X${pad(px, 4)} Y${pad(py, 4)}` })
}

function tickClock () {
  const d = new Date()
  tEl.textContent = `T${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}`
}

function start () {
  if (on) return
  on = true
  if (!el) build()
  el.hidden = false
  window.addEventListener("pointermove", onMove, { passive: true })
  clockTimer = setInterval(tickClock, 1000)
  tickClock()
  unMetrics = watchMetrics((m) => {
    if (!Array.isArray(m)) return
    const memMB = Math.round(m.reduce((s, p) => s + (p.memory?.workingSetSize ?? 0), 0) / 1024)
    const cpu = Math.round(m.reduce((s, p) => s + (p.cpu?.percentCPUUsage ?? 0), 0))
    sysEl.textContent = `M${pad(memMB, 4)} C${pad(cpu, 3)}`
  }, 3000)
}

function stop () {
  if (!on) return
  on = false
  if (el) el.hidden = true
  window.removeEventListener("pointermove", onMove)
  clearInterval(clockTimer); clockTimer = null
  if (unMetrics) { unMetrics(); unMetrics = null }
  if (raf) { cancelAnimationFrame(raf); raf = 0 }
}

function sync () {
  if (String(state.get("theme.active") || "").startsWith("blackline")) start()
  else stop()
}

export function initSchematic () {
  sync()
  bus.on("config", sync)
}
