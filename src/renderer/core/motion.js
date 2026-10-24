// ───────────────────────────────────────────────────────────────────
//  motion.js — the animation engine.  Turns config.motion into CSS
//  custom properties + data attributes (durations, easing, per-element
//  styles), generates true spring curves with CSS linear(), and drives
//  the interactive effects: cursor spotlight on glass, press ripples,
//  FLIP reorders and exit animations.
// ───────────────────────────────────────────────────────────────────
import { state } from "./state.js"
import { bus } from "./bus.js"

const PRESETS = {
  smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
  spring: "cubic-bezier(0.34, 1.42, 0.64, 1)",
  snappy: "cubic-bezier(0.2, 0, 0, 1)",
  gentle: "cubic-bezier(0.4, 0, 0.2, 1)",
  linear: "linear"
}

// damped harmonic oscillator, mass 1, sampled into a CSS linear() curve
export function springEasing (stiffness = 170, damping = 16, points = 48) {
  const k = Math.max(20, Math.min(600, stiffness))
  const c = Math.max(2, Math.min(80, damping))
  const dt = 1 / 240
  let x = 0, v = 0, t = 0
  const samples = []
  // run until settled (or 3s), recording position
  while (t < 3) {
    const a = -k * (x - 1) - c * v
    v += a * dt; x += v * dt; t += dt
    samples.push(x)
    if (t > 0.1 && Math.abs(x - 1) < 0.0005 && Math.abs(v) < 0.005) break
  }
  const step = Math.max(1, Math.floor(samples.length / points))
  const out = [0]
  for (let i = step; i < samples.length; i += step) out.push(Math.round(samples[i] * 1000) / 1000)
  out.push(1)
  return { easing: `linear(${out.join(", ")})`, settleMs: Math.round(t * 1000) }
}

function resolveEasing (m) {
  if (m.easing === "physics") return springEasing(m.spring?.stiffness, m.spring?.damping).easing
  if (m.easing === "bouncy") return springEasing(260, 9).easing
  if (m.easing === "custom") {
    const v = (m.customEasing ?? "").trim()
    return v && CSS.supports("transition-timing-function", v) ? v : PRESETS.smooth
  }
  return PRESETS[m.easing] ?? PRESETS.spring
}

let cur = {}
const sysReduce = window.matchMedia("(prefers-reduced-motion: reduce)")

export function effectiveMode () {
  const mode = cur.mode ?? "full"
  if (mode === "full" && sysReduce.matches) return "reduced"
  return mode
}

export function applyMotion () {
  cur = state.get("motion") ?? {}
  const mode = effectiveMode()
  const r = document.documentElement.style
  const b = document.body.dataset
  const speed = mode === "off" ? 0.001 : Math.max(0.25, Math.min(3, Number(cur.speed) || 1)) * (mode === "reduced" ? 0.6 : 1)
  r.setProperty("--f-speed", String(speed))
  r.setProperty("--f-ease", mode === "full" ? resolveEasing(cur) : PRESETS.smooth)
  r.setProperty("--f-lift", `${mode === "full" ? Number(cur.hoverLift ?? 2) : 0}px`)
  r.setProperty("--f-press", String(mode === "off" ? 1 : Number(cur.pressScale ?? 0.95)))

  b.motion = mode
  const pick = (k, dflt, reduced) => (mode === "off" ? "none" : mode === "reduced" ? (reduced ?? "fade") : (cur[k] ?? dflt))
  b.animTabOpen = pick("tabOpen", "pop")
  b.animTabClose = pick("tabClose", "shrink")
  b.animView = pick("view", "fade-up")
  b.animPanel = pick("panel", "slide")
  b.animPopover = pick("popover", "scale")
  b.animToast = pick("toast", "rise")
  b.animHome = pick("home", "rise")
  b.ambient = mode === "full" ? (cur.ambient ?? "slow") : "off"
  b.orb = mode === "off" ? "off" : mode === "reduced" ? "still" : (cur.orb ?? "float")
  b.loadbar = cur.loadBar ?? "glow"
  b.shimmer = String(mode === "full" && cur.shimmer !== false)
  b.spotlight = String(mode !== "off" && cur.spotlight !== false)
  b.lens = String(cur.lens !== false && CSS.supports("backdrop-filter", "url(#flux-lens)"))
  ripples = mode !== "off" && cur.ripple !== false
}

// duration of a named token in ms, scaled by speed (for JS-timed exits)
export function ms (token = "med") {
  const base = { fast: 140, med: 240, slow: 420 }[token] ?? 240
  const s = Number(getComputedStyle(document.documentElement).getPropertyValue("--f-speed")) || 1
  return base * s
}

// play an exit animation, then resolve (element removal is up to the caller)
export function leave (el, kind = "fade") {
  if (!el || effectiveMode() === "off" || kind === "none") return Promise.resolve()
  const d = ms("med")
  const frames = {
    fade: [{ opacity: 1 }, { opacity: 0 }],
    shrink: [{ opacity: 1, maxWidth: `${el.offsetWidth}px`, transform: "scale(1)" }, { opacity: 0, maxWidth: "0px", minWidth: "0px", paddingLeft: "0px", paddingRight: "0px", marginLeft: "0px", marginRight: "0px", transform: "scale(.85)" }],
    slide: [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-14px)" }],
    drop: [{ opacity: 1, transform: "translateY(0) scale(1)" }, { opacity: 0, transform: "translateY(8px) scale(.96)" }],
    scale: [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(.94)" }]
  }[kind] ?? [{ opacity: 1 }, { opacity: 0 }]
  return el.animate(frames, { duration: d, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" }).finished.catch(() => {})
}

// FLIP: call before a DOM change, returns fn to call after it
export function flip (els) {
  if (effectiveMode() === "off") return () => {}
  const first = new Map(els.map((el) => [el, el.getBoundingClientRect()]))
  return () => {
    for (const [el, r0] of first) {
      if (!el.isConnected) continue
      const r1 = el.getBoundingClientRect()
      const dx = r0.left - r1.left
      const dy = r0.top - r1.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
        { duration: ms("med"), easing: getComputedStyle(document.documentElement).getPropertyValue("--f-ease").trim() || "ease" })
    }
  }
}

// ── interactive light: spotlight on glass + press ripples ─────────
let ripples = true
let raf = 0
let lastGlass = null

function onMove (e) {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    if (document.body.dataset.spotlight !== "true") return
    const g = e.target?.closest?.(".glass, .lit")
    if (lastGlass && lastGlass !== g) lastGlass.classList.remove("is-lit")
    lastGlass = g
    if (!g) return
    const r = g.getBoundingClientRect()
    g.style.setProperty("--mx", `${e.clientX - r.left}px`)
    g.style.setProperty("--my", `${e.clientY - r.top}px`)
    g.classList.add("is-lit")
  })
}

function onDown (e) {
  if (!ripples || e.button !== 0) return
  const host = e.target?.closest?.(".btn, .tb-btn, .tab, .side-item, .hot .squircle, .chip, .pill-btn, .seg button, .engine, .mi")
  if (!host || host.closest("[data-no-ripple]")) return
  const r = host.getBoundingClientRect()
  const size = Math.max(r.width, r.height) * 2.2
  const dot = document.createElement("span")
  dot.className = "ripple"
  dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`
  if (getComputedStyle(host).position === "static") host.style.position = "relative"
  host.append(dot)
  dot.animate([{ transform: "scale(0)", opacity: 0.35 }, { transform: "scale(1)", opacity: 0 }], { duration: ms("slow") * 1.4, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" })
    .finished.then(() => dot.remove(), () => dot.remove())
}

export function initMotion () {
  applyMotion()
  bus.on("config", applyMotion)
  sysReduce.addEventListener?.("change", applyMotion)
  window.addEventListener("pointermove", onMove, { passive: true })
  window.addEventListener("pointerdown", onDown, { passive: true })
  document.addEventListener("mouseleave", () => lastGlass?.classList.remove("is-lit"))
}

// re-trigger every entrance animation once — used by the Motion settings preview
export function replayPreview () {
  const sel = ".tab, .home-hero > *, .set-group, #aipanel, .toast"
  document.querySelectorAll(sel).forEach((el, i) => {
    el.animate([{ opacity: 0, transform: "translateY(10px) scale(.97)" }, { opacity: 1, transform: "none" }],
      { duration: ms("slow"), delay: i * 18, easing: getComputedStyle(document.documentElement).getPropertyValue("--f-ease").trim(), fill: "backwards" })
  })
}
