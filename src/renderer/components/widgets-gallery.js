// ───────────────────────────────────────────────────────────────────
//  widgets-gallery.js — "+ Add Widget", like macOS's widget gallery:
//  the kinds on the left, live miniature previews of every size on the
//  right (real widgets, rendered small, in your current style and over
//  your wallpaper).  Click a preview to add that size.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { ico } from "../core/icons.js"
import { state } from "../core/state.js"
import { popover, closePopover } from "./popover.js"
import { KINDS, SIZES, SAMPLE, renderWidget } from "./widgets.js"

const U = 170, GAP = 18, K = 0.56          // preview scale for small/medium/large
const noop = { rerender () {}, update (patch) { Object.assign(this.w ?? {}, patch) } }

function preview (kind, size, cleanups) {
  const sz = SIZES[size]
  const w = { id: `preview_${kind}_${size}`, kind, size, config: SAMPLE[kind]?.() ?? {} }
  const ctx = { ...noop, w }
  const body = h("div.hw-body")
  const k = size === "wide" ? 0.42 : K
  const tile = h(`div.hw.is-${kind}.size-${size}.is-preview`, {
    style: { width: `${sz.cols * U + (sz.cols - 1) * GAP}px`, height: `${sz.rows * U + (sz.rows - 1) * GAP}px` },
    inert: true
  }, [body])
  tile.style.setProperty("--hw-k", k)
  const stop = renderWidget(body, w, ctx)
  if (stop) cleanups.push(stop)
  return tile
}

export function openGallery (anchor, { onAdd }) {
  let cleanups = []
  const stopAll = () => { for (const c of cleanups) { try { c() } catch {} } cleanups = [] }
  const style = state.get("home.widgetStyle") ?? "color"
  const stage = h("div.hw-gal-stage")
  const wall = document.querySelector(".home-wall")
  if (wall) {
    const cs = getComputedStyle(wall)
    Object.assign(stage.style, { backgroundImage: cs.backgroundImage, backgroundColor: cs.backgroundColor, backgroundSize: "cover", backgroundPosition: "center" })
  }
  const keys = Object.keys(KINDS)
  const list = h("div.hw-gal-list", { role: "listbox", "aria-label": "Widgets" })
  const show = (k) => {
    stopAll()
    for (const b of list.children) b.classList.toggle("is-on", b.dataset.k === k)
    const kind = KINDS[k]
    const picks = kind.sizes.map((size) => h("button.hw-gal-pick", {
      title: `Add ${kind.name} (${SIZES[size].label})`,
      onclick: () => { closePopover(); onAdd(k, size) }
    }, [preview(k, size, cleanups), h("span.hw-gal-size", { text: SIZES[size].label })]))
    stage.replaceChildren(
      h("div.hw-gal-title", {}, [h("div.hw-gal-name", { text: kind.name }), kind.desc ? h("div.hw-gal-desc", { text: kind.desc }) : null]),
      h(`div.hw-grid.hw-gal-row`, { dataset: { style } }, picks)
    )
  }
  for (const k of keys) {
    const kind = KINDS[k]
    list.append(h("button.hw-gal-item", { role: "option", dataset: { k }, onclick: () => show(k), onfocus: () => show(k) }, [
      h("span.hw-gal-ico", {}, [ico(kind.icon, 15)]), h("span.hw-gal-label", { text: kind.name })
    ]))
  }
  list.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    e.preventDefault()
    const items = [...list.children], i = items.indexOf(document.activeElement)
    items[Math.max(0, Math.min(items.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus()
  })
  show(keys[0])
  popover(anchor, h("div.hw-gal", {}, [list, stage]), { width: 720, align: "center", className: "pop--gallery", onClose: stopAll })
}
