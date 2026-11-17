// ───────────────────────────────────────────────────────────────────
//  sortable.js — drag a row to reorder a short vertical list (profiles).
//  Pointer-driven, so it works inside popovers: a row lifts once the
//  pointer has moved a few pixels (a plain click stays a click), follows
//  the pointer, and the other rows glide out of its way.  Letting go
//  settles it into its slot; Esc (or losing the pointer) glides it back.
//  ⌥↑ / ⌥↓ move the focused row.  Reduced motion: rows jump, no glide.
// ───────────────────────────────────────────────────────────────────
import { effectiveMode, flip, ms } from "./motion.js"

const THRESHOLD = 5   // px before a press becomes a drag
const ease = () => getComputedStyle(document.documentElement).getPropertyValue("--f-ease").trim() || "ease"
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// one click right after a drag is the drag's own pointerup: never let it switch anything
function swallowClick () {
  const eat = (e) => { e.stopPropagation(); e.preventDefault() }
  window.addEventListener("click", eat, true)
  setTimeout(() => window.removeEventListener("click", eat, true), 0)
}

// box: the element the rows live in (they must be its children)
// rows(): the rows in order; idOf(row): its id
// onMove(ids, id, { keyboard }): the new order, once the row has settled
export function sortable (box, { rows, idOf, onMove }) {
  let drag = null        // { el, pointerId, y0, live, list, from, to, rects, gap, settling }
  let pending = 0

  const listen = (on) => {
    const f = on ? "addEventListener" : "removeEventListener"
    window[f]("pointermove", move, true)
    window[f]("pointerup", up, true)
    window[f]("pointercancel", cancel, true)
    window[f]("blur", cancel)
    window[f]("keydown", key, true)
  }

  box.addEventListener("pointerdown", (e) => {
    if (drag || e.button !== 0 || e.ctrlKey || e.metaKey) return      // ⌃-click is the context menu
    const el = rows().find((r) => r.contains(e.target))
    if (!el || e.target.closest("input, textarea, select")) return
    drag = { el, pointerId: e.pointerId, y0: e.clientY, live: false }
    listen(true)
  })

  function begin () {
    const list = rows()
    const from = list.indexOf(drag.el)
    if (from < 0 || list.length < 2) return false
    const rects = list.map((r) => r.getBoundingClientRect())
    Object.assign(drag, { live: true, list, from, to: from, rects, gap: Math.max(0, rects[1].top - rects[0].bottom) })
    const glide = effectiveMode() !== "full" ? "none" : `transform ${ms("med")}ms ${ease()}`
    for (const r of list) r.style.transition = r === drag.el ? "none" : glide
    drag.el.classList.add("is-lifted")
    box.classList.add("is-sorting")
    document.body.classList.add("is-sorting")
    getSelection()?.removeAllRanges()
    return true
  }

  // where the lifted row sits (relative to its old slot) when it lands at `to`
  const offset = (d, to) => (to > d.from ? d.rects[to].bottom - d.rects[d.from].bottom : to < d.from ? d.rects[to].top - d.rects[d.from].top : 0)

  function move (e) {
    if (!drag || drag.settling || e.pointerId !== drag.pointerId) return
    const dy = e.clientY - drag.y0
    if (!drag.live) {
      if (Math.abs(dy) < THRESHOLD) return
      if (!begin()) { stop(); return }
    }
    e.preventDefault()
    const d = drag
    const n = d.list.length
    const y = clamp(dy, offset(d, 0), offset(d, n - 1))
    d.el.style.transform = `translateY(${y}px)`
    // the slot whose middle the lifted row's middle has passed (unclamped,
    // so pushing past either end still reaches the first / last slot)
    const c = d.rects[d.from].top + d.rects[d.from].height / 2 + dy
    const mid = (i) => d.rects[i].top + d.rects[i].height / 2
    let to = d.from
    for (let i = 0; i < d.from; i++) if (c < mid(i)) { to = i; break }
    if (to === d.from) for (let i = d.from + 1; i < n; i++) if (c > mid(i)) to = i
    if (to === d.to) return
    d.to = to
    const span = d.rects[d.from].height + d.gap
    d.list.forEach((r, i) => {
      if (r === d.el) return
      const s = d.from < to && i > d.from && i <= to ? -span : to < d.from && i >= to && i < d.from ? span : 0
      r.style.transform = s ? `translateY(${s}px)` : ""
    })
  }

  function stop () {
    listen(false)
    drag = null
  }

  function up (e) {
    if (!drag || drag.settling || e.pointerId !== drag.pointerId) return
    if (!drag.live) { stop(); return }      // a plain click: let it through
    swallowClick()
    settle(drag.to)
  }

  function cancel () {
    if (!drag || drag.settling) return
    if (!drag.live) { stop(); return }
    settle(drag.from)
  }

  function key (e) {
    if (!drag?.live || drag.settling || e.key !== "Escape") return
    e.preventDefault()
    e.stopImmediatePropagation()        // Esc puts the row back; it doesn't close the menu
    cancel()
  }

  async function settle (to) {
    const d = drag
    d.settling = true
    listen(false)
    if (effectiveMode() === "full") {
      d.el.style.transition = `transform ${ms("med")}ms ${ease()}`
      d.el.style.transform = `translateY(${offset(d, to)}px)`
      await new Promise((resolve) => {
        const t = setTimeout(resolve, ms("med") + 60)
        d.el.addEventListener("transitionend", () => { clearTimeout(t); resolve() }, { once: true })
      })
    }
    // the rows are where they'll be: make it real, without a jump
    for (const r of d.list) { r.style.transition = "none"; r.style.transform = "" }
    if (to !== d.from) (to > d.from ? d.list[to].after(d.el) : d.list[to].before(d.el))
    d.el.classList.remove("is-lifted")
    box.classList.remove("is-sorting")
    document.body.classList.remove("is-sorting")
    void box.offsetHeight
    for (const r of d.list) r.style.transition = ""
    drag = null
    // (a list rebuilt under the drag, by another window's change, already has the news)
    if (to !== d.from && d.el.isConnected) onMove(rows().map(idOf), idOf(d.el), { keyboard: false })
  }

  // ⌥↑ / ⌥↓ on a focused row (or a button in it)
  box.addEventListener("keydown", (e) => {
    if (drag || !e.altKey || e.metaKey || e.ctrlKey || e.shiftKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return
    const list = rows()
    const el = list.find((r) => r.contains(e.target))
    if (!el) return
    e.preventDefault()
    e.stopPropagation()
    const from = list.indexOf(el)
    const to = from + (e.key === "ArrowUp" ? -1 : 1)
    if (to < 0 || to >= list.length) return
    const focused = document.activeElement
    const done = flip(list)
    to < from ? list[to].before(el) : list[to].after(el)
    done()
    focused?.focus?.({ preventScroll: true })
    // a few presses in a row save once
    clearTimeout(pending)
    pending = setTimeout(() => { pending = 0; onMove(rows().map(idOf), idOf(el), { keyboard: true }) }, ms("med"))
  })

  // true while a row is held, settling, or a keyboard move is about to save
  return { busy: () => !!drag?.live || !!pending }
}

// rebuild a keyed list in place; rows that survive glide from where they were
export function regrow (box, build, idOf) {
  const before = new Map([...box.children].map((el) => [idOf(el), el.getBoundingClientRect().top]))
  const next = build()
  box.replaceChildren(...next)
  if (effectiveMode() !== "full") return
  for (const el of next) {
    const t0 = before.get(idOf(el))
    if (t0 == null) continue
    const dy = t0 - el.getBoundingClientRect().top
    if (Math.abs(dy) >= 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: ms("med"), easing: ease() })
  }
}
