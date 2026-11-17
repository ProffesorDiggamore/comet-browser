// ───────────────────────────────────────────────────────────────────
//  widgets-grid.js — one Home widget tile and the fluid bits of edit
//  mode: press feedback on pointer-down, live drag-to-reorder (the
//  other widgets slide out of the way, FLIP), resize and add/remove
//  that animate from where things were.  Reduced motion → no slides.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { KINDS, SIZES, renderWidget } from "./widgets.js"
import { motionOn } from "./widgets-kit.js"

const EASE = "cubic-bezier(0.2, 0.9, 0.3, 1)"    // critically damped feel: no overshoot
let dragging = null
let snap = null              // { t, rects: Map(id → DOMRect) } taken before a re-render
let enteringId = null

const tilesOf = (grid) => [...grid.querySelectorAll(":scope > .hw[data-id]")]
const rectsOf = (grid) => new Map(tilesOf(grid).map((el) => [el.dataset.id, el.getBoundingClientRect()]))
const zoomOf = (el) => parseFloat(getComputedStyle(el).zoom) || 1

// slide every tile from where it was (rects) to where it is now
function flip (grid, rects) {
  if (!motionOn()) return
  for (const el of tilesOf(grid)) {
    const a = rects.get(el.dataset.id)
    if (!a || el === dragging) continue
    const b = el.getBoundingClientRect()
    const dx = a.left - b.left, dy = a.top - b.top
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
    const k = zoomOf(el)
    el.animate([{ translate: `${dx / k}px ${dy / k}px` }, { translate: "0 0" }], { duration: 360, easing: EASE, composite: "add" })
  }
}

// call before a change that re-renders the grid; afterGridMount() then animates it
export function snapshotGrid () {
  const grid = document.querySelector(".hw-grid")
  if (grid) snap = { t: Date.now(), rects: rectsOf(grid) }
}
export function afterGridMount (grid) {
  if (enteringId) {
    const el = grid.querySelector(`:scope > .hw[data-id="${CSS.escape(enteringId)}"]`)
    if (el) { el.classList.add("is-entering"); el.addEventListener("animationend", () => el.classList.remove("is-entering"), { once: true }) }
    enteringId = null
  }
  if (!snap || Date.now() - snap.t > 1500) { snap = null; return }
  const s = snap; snap = null
  requestAnimationFrame(() => flip(grid, s.rects))
}
export const markEntering = (id) => { enteringId = id }

/**
 * @param w        the widget
 * @param o        { editing, list(), save(list), rerender(), onCleanup(fn) }
 */
export function widgetTile (w, o) {
  const sz = SIZES[w.size] ?? SIZES.small
  const body = h("div.hw-body")
  const el = h(`div.hw.is-${w.kind}.size-${w.size}`, {
    style: { gridColumn: `span ${sz.cols}`, gridRow: `span ${sz.rows}` },
    dataset: { id: w.id, kind: w.kind },
    draggable: o.editing
  }, [body])

  // press: feedback the instant the pointer goes down (not on click)
  if (!o.editing) {
    const up = () => el.classList.remove("is-pressed")
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("input, textarea, select, [contenteditable], .hw-notes-view")) return
      el.classList.add("is-pressed")
    })
    for (const ev of ["pointerup", "pointercancel", "pointerleave"]) el.addEventListener(ev, up)
  }

  // edit mode: live reorder — the tile under the pointer makes room as you drag
  if (o.editing) {
    el.addEventListener("dragstart", (e) => {
      dragging = el
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData("text/flux-widget", w.id)
      requestAnimationFrame(() => el.classList.add("is-dragging"))
    })
    el.addEventListener("dragover", (e) => {
      if (!dragging) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
      if (dragging === el || el.getAnimations().some((a) => !(a instanceof CSSAnimation) && a.playState === "running")) return
      const grid = el.parentElement
      const r = el.getBoundingClientRect()
      const after = e.clientY > r.bottom - r.height * 0.25 || (e.clientY > r.top + r.height * 0.25 && e.clientX > r.left + r.width / 2)
      const ref = after ? el.nextElementSibling : el
      if (ref === dragging) return
      const rects = rectsOf(grid)
      grid.insertBefore(dragging, ref)
      flip(grid, rects)
    })
    el.addEventListener("drop", (e) => e.preventDefault())
    el.addEventListener("dragend", () => {
      el.classList.remove("is-dragging")
      const grid = el.parentElement
      dragging = null
      if (!grid) return
      const order = tilesOf(grid).map((x) => x.dataset.id)
      const list = o.list()
      if (order.join() === list.map((x) => x.id).join()) return
      const byId = new Map(list.map((x) => [x.id, x]))
      o.save([...order.map((id) => byId.get(id)).filter(Boolean), ...list.filter((x) => !order.includes(x.id))])
    })
  }

  const ctx = {
    rerender: () => o.rerender(),
    update: (patch, { quiet } = {}) => {
      const list = o.list().map((x) => x.id === w.id ? { ...x, ...patch } : x)
      if (quiet) { Object.assign(w, patch); o.save(list, { quiet: true }) } else { snapshotGrid(); o.save(list) }
    }
  }
  const stop = renderWidget(body, w, ctx)
  if (stop) o.onCleanup(stop)

  if (o.editing) {
    const sizes = KINDS[w.kind]?.sizes ?? ["small"]
    el.append(h("button.hw-remove", {
      title: "Remove widget", "aria-label": `Remove ${KINDS[w.kind]?.name ?? "widget"}`,
      onclick: () => {
        const go = () => { snapshotGrid(); o.save(o.list().filter((x) => x.id !== w.id)) }
        if (!motionOn()) return go()
        el.animate([{ scale: 1, opacity: 1 }, { scale: 0.6, opacity: 0 }], { duration: 180, easing: "ease-in", fill: "forwards" }).finished.then(go, go)
      }
    }, [h("span", { text: "−" })]))
    if (sizes.length > 1) {
      el.append(h("button.hw-size", {
        title: "Change size",
        onclick: () => ctx.update({ size: sizes[(sizes.indexOf(w.size) + 1) % sizes.length] })
      }, [h("span", { text: SIZES[w.size]?.label ?? "Size" })]))
    }
  }
  return el
}
