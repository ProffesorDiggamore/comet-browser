// ───────────────────────────────────────────────────────────────────
//  popover.js — glass popovers + context menus shared by the chrome
//  (tab menu, downloads, site info, model picker…).  One open at a
//  time; outside-click / Esc closes; entrance follows Motion settings.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { ico } from "../core/icons.js"
import { leave } from "../core/motion.js"
import { bus } from "../core/bus.js"

let open = null

// a click inside a web page never reaches this document, so the page
// reports it (webview-preload → "page-down") and that counts as outside
bus.on("page-down", () => closePopover())

export function closePopover () {
  if (!open) return
  const { el, onClose, cleanup } = open
  open = null
  cleanup()
  onClose?.()
  leave(el, document.body.dataset.animPopover === "none" ? "none" : "drop").then(() => el.remove())
}

export function isPopoverOpen () { return !!open }

// anchor: an element, or { x, y } for a pointer position
export function popover (anchor, content, { align = "start", width = null, className = "", onClose = null, offset = 8 } = {}) {
  // clicking the button that opened it closes it (a toggle), instead of reopening
  if (open && anchor instanceof Element && open.anchor === anchor) { closePopover(); return null }
  closePopover()
  const el = h(`div.pop.glass${className ? "." + className.split(" ").join(".") : ""}`, { role: "dialog" }, [content])
  if (width) el.style.width = `${width}px`
  document.body.append(el)

  const place = () => {
    const r = anchor instanceof Element ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0 }
    const w = el.offsetWidth
    const hgt = el.offsetHeight
    let x = align === "end" ? r.right - w : align === "center" ? r.left + r.width / 2 - w / 2 : r.left
    let y = r.bottom + offset
    x = Math.max(8, Math.min(window.innerWidth - w - 8, x))
    if (y + hgt > window.innerHeight - 8) y = Math.max(8, r.top - hgt - offset)
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.style.transformOrigin = `${Math.round((r.left + r.width / 2) - x)}px ${y < r.top ? "100%" : "0"}`
  }
  place()

  const down = (e) => { if (!el.contains(e.target) && !(anchor instanceof Element && anchor.contains(e.target))) closePopover() }
  const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); closePopover() } }
  setTimeout(() => document.addEventListener("pointerdown", down, true), 0)
  document.addEventListener("keydown", key, true)
  window.addEventListener("resize", closePopover, { once: true })
  open = { el, anchor, onClose, cleanup: () => { document.removeEventListener("pointerdown", down, true); document.removeEventListener("keydown", key, true) } }
  return el
}

// items: { label, icon, kbd, run, danger, disabled, checked } | "-" | { header }
export function menu (anchor, items, opts = {}) {
  const list = h("div.menu", { role: "menu" })
  const btns = []
  for (const it of items.filter(Boolean)) {
    if (it === "-") { list.append(h("div.mi-sep")); continue }
    if (it.header) { list.append(h("div.mi-head", { text: it.header })); continue }
    const b = h(`button.mi${it.danger ? ".is-danger" : ""}`, {
      role: "menuitem", disabled: !!it.disabled,
      onclick: () => { closePopover(); it.run?.() }
    }, [
      h("span.mi-ico", {}, [it.checked != null ? (it.checked ? ico("check", 14) : h("span")) : it.icon ? ico(it.icon, 15) : h("span")]),
      it.swatch && h("span.mi-swatch", { style: { background: it.swatch } }),
      h("span.mi-label", { text: it.label }),
      it.kbd && h("kbd.mi-kbd", { text: it.kbd })
    ])
    btns.push(b)
    list.append(b)
  }
  list.addEventListener("keydown", (e) => {
    const i = btns.indexOf(document.activeElement)
    if (e.key === "ArrowDown") { e.preventDefault(); btns[(i + 1) % btns.length]?.focus() }
    if (e.key === "ArrowUp") { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length]?.focus() }
  })
  const el = popover(anchor, list, { className: "pop--menu", ...opts })
  // opened from the keyboard: focus the first item so the arrow keys work right away
  if (opts.keyboard || (anchor instanceof Element && anchor.matches(":focus-visible"))) requestAnimationFrame(() => btns.find((b) => !b.disabled)?.focus())
  return el
}
