// ───────────────────────────────────────────────────────────────────
//  perf.js — background optimization loop.  Sleeps idle tabs on an
//  interval, runs Battery Saver, and exposes a metrics subscription
//  for the perf panel.
//
//  Battery Saver (perf.batterySaver: auto | always | off; auto = while
//  on battery): background tabs unload after 3 minutes instead of the
//  usual limit, and the always-running effects (drifting ambient,
//  cursor spotlight, glass shimmer, refraction lens) switch off.  A
//  slept tab keeps only its link and reloads when you go back to it.
// ───────────────────────────────────────────────────────────────────
import { sweepIdle } from "./tabs.js"
import { state } from "./state.js"
import { bus } from "./bus.js"
import { applyMotion } from "./motion.js"

const SAVER_SLEEP_MIN = 3
let sweepTimer = null
let onBattery = false

export const saverOn = () => {
  const m = state.get("perf.batterySaver") ?? "auto"
  return m === "always" || (m === "auto" && onBattery)
}
export const isOnBattery = () => onBattery

// is Comet the app in front?  (window "blur" in this page also fires when a web page
// takes focus, so the answer comes from the real window in main)
let winActive = true
export const isWinActive = () => winActive && !document.hidden
function setWinActive (on) {
  winActive = !!on
  document.body.dataset.winActive = String(winActive)
  bus.emit("win-active", winActive)
}

function applySaver () {
  const on = saverOn()
  if ((document.body.dataset.saver === "on") === on) return
  document.body.dataset.saver = on ? "on" : "off"
  applyMotion()
  bus.emit("saver", on)
  if (on) sweepIdle(SAVER_SLEEP_MIN)
}

export function startPerfLoop () {
  clearInterval(sweepTimer)
  sweepTimer = setInterval(() => sweepIdle(saverOn() ? SAVER_SLEEP_MIN : null), 60_000)   // check once a minute
  document.body.dataset.saver = "off"
  window.flux.power.onBattery().then((b) => { onBattery = !!b; applySaver() })
  window.flux.power.onChange((b) => { onBattery = !!b; applySaver() })
  bus.on("config", applySaver)
  document.body.dataset.winActive = "true"
  window.flux.win.onActive?.(setWinActive)
  document.addEventListener("visibilitychange", () => bus.emit("win-active", isWinActive()))
}

// poll app-wide process metrics; returns an unsubscribe fn
export function watchMetrics (cb, everyMs = 2000) {
  let alive = true
  const tick = async () => {
    if (!alive) return
    try { cb(await window.flux.app.metrics()) } catch {}
    if (alive) setTimeout(tick, everyMs)
  }
  tick()
  return () => { alive = false }
}
