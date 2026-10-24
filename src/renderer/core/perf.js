// ───────────────────────────────────────────────────────────────────
//  perf.js — background optimization loop.  Sleeps idle tabs on an
//  interval and exposes a metrics subscription for the perf panel.
// ───────────────────────────────────────────────────────────────────
import { sweepIdle } from "./tabs.js"

let sweepTimer = null

export function startPerfLoop () {
  clearInterval(sweepTimer)
  sweepTimer = setInterval(sweepIdle, 60_000)   // check once a minute
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
