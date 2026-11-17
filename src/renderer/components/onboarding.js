// ───────────────────────────────────────────────────────────────────
//  onboarding.js — the first-run Welcome tour.  A Liquid Glass sheet
//  over the dimmed window: six short steps, each applied live (mode,
//  theme, layout, name, wallpaper) so Comet changes right under it.
//  Shown once per install; Help → Welcome Tour… and Settings → About
//  bring it back.  The steps themselves live in onboarding-steps.js.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { state } from "../core/state.js"
import { bus } from "../core/bus.js"
import { ms, effectiveMode } from "../core/motion.js"
import { closePopover, isPopoverOpen } from "./popover.js"
import { STEPS } from "./onboarding-steps.js"

// "Done" is global, not per profile: the UI's own localStorage is shared by
// every profile (profiles only swap the pages' partitions).  general.welcomeDone
// backs it up (it is seeded into new profiles) in case site data gets cleared.
const KEY = "flux.welcomeDone"
export function isWelcomeDone () {
  try { if (localStorage.getItem(KEY) === "1") return true } catch {}
  return state.get("general.welcomeDone") === true
}
function markDone () {
  try { localStorage.setItem(KEY, "1") } catch {}
  if (state.get("general.welcomeDone") !== true) state.set("general.welcomeDone", true)
}

// first launch: wait a beat so the window, tabs and Home settle under the glass
export function maybeShowWelcome () {
  if (!isWelcomeDone()) setTimeout(() => { if (!isWelcomeDone()) openWelcome() }, 400)
}

let ui = null
export const isWelcomeOpen = () => !!ui

export function openWelcome () {
  if (ui) { ui.card.focus(); return }
  if (isPopoverOpen()) closePopover()

  // steps hand the shell things to do once the tour ends (open Import, …)
  const ctx = { after: new Map(), close: (fn) => { if (fn) ctx.after.set("close", fn); closeWelcome() } }
  const dots = h("div.wl-dots", { role: "tablist", "aria-label": "Tour steps" }, STEPS.map((s, i) =>
    h("button.wl-dot", { type: "button", role: "tab", "aria-label": `Step ${i + 1}: ${s.title}`, onclick: () => go(i) })))
  const skip = h("button.btn.btn--plain.wl-skip", { type: "button", text: "Skip", onclick: () => closeWelcome() })
  const back = h("button.btn.btn--ghost.wl-back", { type: "button", text: "Back", onclick: () => go(ui.i - 1) })
  const next = h("button.btn.btn--accent.wl-next", { type: "button", onclick: () => advance() })
  const count = h("span.wl-count", { "aria-live": "polite" })
  const stage = h("div.wl-stage")
  const card = h("div.wl-sheet.glass", { role: "dialog", "aria-modal": "true", "aria-label": "Welcome to Comet", tabindex: "-1" }, [
    h("div.wl-top", {}, [dots, skip]),
    stage,
    h("div.wl-foot", {}, [back, count, next])
  ])
  // clicks outside the card do nothing: an accidental click shouldn't end the tour
  const scrim = h("div.wl-scrim", { onmousedown: (e) => { if (e.target === scrim) { e.preventDefault(); card.focus() } } }, [card])
  scrim.addEventListener("keydown", onKey)

  ui = { scrim, card, stage, dots, skip, back, next, count, ctx, i: -1, cur: null, prevFocus: document.activeElement }
  document.body.append(scrim)
  go(0)
  setTimeout(() => ui?.card.focus(), 30)
  bus.emit("welcome:open")
}

export function closeWelcome () {
  if (!ui) return
  const { scrim, ctx, prevFocus } = ui
  ui = null
  markDone()
  scrim.classList.add("is-leaving")
  setTimeout(() => scrim.remove(), effectiveMode() === "off" ? 0 : 200)
  if (prevFocus?.isConnected && prevFocus !== document.body) { try { prevFocus.focus() } catch {} }
  for (const fn of ctx.after.values()) { try { fn() } catch (e) { console.error("[welcome] after", e) } }
  bus.emit("welcome:done")
}

function advance () {
  if (!ui) return
  if (ui.i >= STEPS.length - 1) closeWelcome()
  else go(ui.i + 1)
}

function go (n) {
  if (!ui || n < 0 || n >= STEPS.length || n === ui.i) return
  const dir = n > ui.i ? 1 : -1
  const step = STEPS[n]
  const el = h("div.wl-step", { role: "group", "aria-label": `Step ${n + 1} of ${STEPS.length}: ${step.title}` }, [].concat(step.render(ui.ctx)))
  const old = ui.cur
  const hadFocus = old?.contains(document.activeElement)
  ui.i = n
  ui.cur = el
  swap(old, el, dir)
  paintNav()
  const want = step.focus && el.querySelector(step.focus)
  if (want) setTimeout(() => { if (ui?.cur === el) want.focus() }, 60)
  else if (hadFocus) ui.card.focus()
}

function paintNav () {
  const { i, dots, skip, back, next, count } = ui
  const last = i === STEPS.length - 1
  ;[...dots.children].forEach((d, k) => {
    d.classList.toggle("is-on", k === i)
    d.classList.toggle("is-past", k < i)
    d.setAttribute("aria-selected", String(k === i))
    if (k === i) d.setAttribute("aria-current", "step"); else d.removeAttribute("aria-current")
  })
  back.classList.toggle("is-hidden", i === 0)
  back.tabIndex = i === 0 ? -1 : 0
  skip.classList.toggle("is-hidden", last)
  skip.tabIndex = last ? -1 : 0
  next.textContent = STEPS[i].cta ?? (last ? "Start browsing" : "Continue")
  count.textContent = `${i + 1} of ${STEPS.length}`
}

// slide between steps: the old one leaves out of the flow while the stage's
// height eases to the new one.  Reduced motion crossfades; off is instant.
function swap (old, el, dir) {
  const { stage } = ui
  const mode = effectiveMode()
  if (!old || mode === "off") { old?.remove(); stage.append(el); return }
  const h0 = stage.offsetHeight
  for (const a of old.getAnimations()) a.cancel()
  Object.assign(old.style, { position: "absolute", top: "0", left: "0", right: "0" })
  old.inert = true
  stage.append(el)
  const h1 = stage.offsetHeight
  const d = Math.max(1, ms("med") * (mode === "full" ? 1.5 : 1))
  const spring = getComputedStyle(document.documentElement).getPropertyValue("--f-ease").trim() || "cubic-bezier(0.22, 1, 0.36, 1)"
  const dx = mode === "full" ? 34 * dir : 0
  old.animate([{ opacity: 1, transform: "translateX(0)" }, { opacity: 0, transform: `translateX(${-dx}px)` }],
    { duration: d * 0.55, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" })
    .finished.catch(() => {}).then(() => old.remove())
  el.animate([{ opacity: 0, transform: `translateX(${dx}px)` }, { opacity: 1, transform: "translateX(0)" }],
    { duration: d, delay: d * 0.18, easing: mode === "full" ? spring : "ease-out", fill: "backwards" })
  if (h0 !== h1) stage.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: d, easing: "cubic-bezier(0.22, 1, 0.36, 1)" })
}

function onKey (e) {
  if (!ui) return
  const t = e.target
  const typing = (t instanceof HTMLInputElement && !/^(checkbox|radio|button|range)$/.test(t.type)) || t instanceof HTMLTextAreaElement || !!t?.isContentEditable
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeWelcome(); return }
  if (e.key === "Tab") { trap(e); return }
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === "ArrowRight" && !typing) { e.preventDefault(); advance() }
  else if (e.key === "ArrowLeft" && !typing) { e.preventDefault(); go(ui.i - 1) }
  // Enter on a focused button clicks that button; anywhere else it continues
  else if (e.key === "Enter" && !(t instanceof HTMLButtonElement) && !e.isComposing) { e.preventDefault(); advance() }
}

// keep Tab inside the sheet (the page and chrome sit behind it)
function trap (e) {
  const f = [...ui.card.querySelectorAll("button, input, [tabindex]:not([tabindex='-1'])")]
    .filter((el) => !el.disabled && el.tabIndex >= 0 && !el.closest("[inert]") && el.getClientRects().length)
  if (!f.length) return
  const first = f[0], last = f[f.length - 1], at = document.activeElement
  if (e.shiftKey && (at === first || at === ui.card)) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && (at === last || !ui.card.contains(at))) { e.preventDefault(); first.focus() }
}
