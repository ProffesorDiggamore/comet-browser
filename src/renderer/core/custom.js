// ───────────────────────────────────────────────────────────────────
//  custom.js — the personal knobs that aren't part of a theme:
//  interface font, Increase Contrast, which side the tab sidebar sits
//  on, and the size / placement of Home's widgets.  Each one is a body
//  data attribute that styles/custom.css reads, re-applied on every
//  config change (same pattern as overlays.js frame()).
// ───────────────────────────────────────────────────────────────────
import { state } from "./state.js"
import { bus } from "./bus.js"

const pick = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt)

export const FONTS = ["system", "rounded", "serif", "mono"]
export const WIDGET_SIZES = ["s", "m", "l"]
export const HOME_ALIGN = ["top", "center", "bottom"]

// glass that stays readable: Increase Contrast frosts the sheen up to at least this
const HIGH_GLASS = 0.88

export function contrastOn () {
  return state.get("theme.contrast") === "high"
}

export function initCustom () {
  const body = document.body
  const apply = () => {
    const t = state.get("theme") ?? {}
    const l = state.get("layout") ?? {}
    const hm = state.get("home") ?? {}
    body.dataset.font = pick(t.font, FONTS, "system")
    body.dataset.contrast = contrastOn() ? "high" : "standard"
    // the sheen is computed from --f-glass on :root; a body-level value wins for the whole UI
    if (contrastOn()) body.style.setProperty("--f-glass-w", String(Math.max(Number(t.glass) || 0.6, HIGH_GLASS) * 0.13))
    else body.style.removeProperty("--f-glass-w")
    body.dataset.vtSide = l.vtabsSide === "right" ? "right" : "left"
    body.dataset.hwSize = pick(hm.widgetSize, WIDGET_SIZES, "m")
    body.dataset.homeAlign = pick(hm.align, HOME_ALIGN, "center")
  }
  bus.on("config", apply)
  apply()
}
