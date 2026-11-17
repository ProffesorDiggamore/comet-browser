// ───────────────────────────────────────────────────────────────────
//  omnibox-ghost.js — the auto-guess, drawn as ghost text inside the
//  field (Safari / Arc): what you typed stays real text with the caret
//  at its end, and the rest of the guess sits after it in secondary ink.
//  A mirror of the input (same font, padding, scroll) laid over it, so
//  the field's value, caret and selection are never touched.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"

const COPY = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "fontStretch", "fontVariant", "fontFeatureSettings",
  "fontKerning", "letterSpacing", "wordSpacing", "textTransform", "textIndent"]

export function makeGhost (input, host = input.parentElement) {
  const typed = h("span.ob-ghost-typed")
  const rest = h("span.ob-ghost-rest")
  const line = h("span.ob-ghost-line", {}, [typed, rest])
  const el = h("div.ob-ghost", { "aria-hidden": "true" }, [line])
  let shown = false

  function place () {
    if (getComputedStyle(host).position === "static") host.style.position = "relative"
    if (el.parentNode !== host) input.after(el)
    const cs = getComputedStyle(input)
    for (const k of COPY) el.style[k] = cs[k]
    const hr = host.getBoundingClientRect()
    const ir = input.getBoundingClientRect()
    const bl = parseFloat(cs.borderLeftWidth) || 0
    const bt = parseFloat(cs.borderTopWidth) || 0
    const pl = parseFloat(cs.paddingLeft) || 0
    const pr = parseFloat(cs.paddingRight) || 0
    Object.assign(el.style, {
      left: `${ir.left - hr.left - host.clientLeft + bl + pl}px`,
      top: `${ir.top - hr.top - host.clientTop + bt}px`,
      width: `${Math.max(0, input.clientWidth - pl - pr)}px`,
      height: `${input.clientHeight}px`
    })
    line.style.transform = `translateX(${-input.scrollLeft}px)`
  }

  return {
    get on () { return shown },
    show (typedText, restText) {
      if (!restText) { this.hide(); return }
      typed.textContent = typedText
      rest.textContent = restText
      place()
      el.classList.add("is-on")
      shown = true
      // the caret is at the end: keep the mirror scrolled with the field
      requestAnimationFrame(() => { if (shown) line.style.transform = `translateX(${-input.scrollLeft}px)` })
    },
    hide () {
      if (!shown) return
      shown = false
      el.classList.remove("is-on")
      rest.textContent = ""
    }
  }
}
