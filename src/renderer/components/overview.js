// ───────────────────────────────────────────────────────────────────
//  overview.js — every tab as a glass card with a live thumbnail
//  (⇧⌘\).  Type to filter, arrows to move, Enter to open, ⌫ to close.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { bus } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { leave } from "../core/motion.js"
import * as T from "../core/tabs.js"

let overlay = null

export function closeOverview () {
  if (!overlay) return
  const o = overlay
  overlay = null
  leave(o, "fade").then(() => o.remove())
}

export async function openOverview () {
  if (overlay) { closeOverview(); return }
  await T.snapActive()
  let q = ""
  let sel = 0
  const grid = h("div.ov-grid")
  const input = h("input.ov-search", { type: "text", placeholder: "Filter tabs…", spellcheck: false })

  const visible = () => T.getTabs().filter((t) => !q || `${t.title} ${t.url}`.toLowerCase().includes(q))
  function paint () {
    const list = visible()
    sel = Math.min(sel, Math.max(0, list.length - 1))
    grid.replaceChildren(...list.map((t, i) => {
      const card = h(`div.ov-card.glass.lit${t.id === T.getActiveId() ? ".is-active" : ""}${i === sel ? ".is-sel" : ""}`, {
        onclick: () => { T.setActive(t.id); closeOverview() },
        onmouseenter: () => { sel = i; mark() }
      }, [
        h("div.ov-thumb", {}, [t.thumb ? h("img", { src: t.thumb }) : h("div.ov-ph", {}, [t.favicon ? h("img.ov-ph-fav", { src: t.favicon, onerror: (e) => e.target.replaceWith(ico("globe", 28)) }) : ico(t.isHome ? "spark" : "globe", 28)])]),
        h("div.ov-meta", {}, [
          h("span.ov-fav", {}, [t.favicon ? h("img", { src: t.favicon, onerror: (e) => e.target.replaceWith(ico("globe", 13)) }) : ico(t.isHome ? "spark" : "globe", 13)]),
          h("span.ov-title", { text: t.isHome ? "New Tab" : t.title || t.url }),
          t.pinned && ico("pin", 12),
          t.audible && ico("volume", 12),
          h("button.ov-x", { title: "Close tab", onclick: (e) => { e.stopPropagation(); T.closeTab(t.id); paint() } }, [ico("close", 12)])
        ])
      ])
      card.style.animationDelay = `${Math.min(i, 16) * 18}ms`
      return card
    }), h("button.ov-card.ov-new", { onclick: () => { T.newTab(); closeOverview() } }, [ico("plus", 26), h("span", { text: "New tab" })]))
  }
  const mark = () => grid.querySelectorAll(".ov-card:not(.ov-new)").forEach((c, i) => c.classList.toggle("is-sel", i === sel))

  input.addEventListener("input", () => { q = input.value.trim().toLowerCase(); sel = 0; paint() })
  input.addEventListener("keydown", (e) => {
    const list = visible()
    const cols = Math.max(1, Math.round(grid.clientWidth / 260))
    if (e.key === "Escape") { e.preventDefault(); closeOverview() }
    else if (e.key === "Enter") { e.preventDefault(); const t = list[sel]; if (t) { T.setActive(t.id); closeOverview() } }
    else if (e.key === "ArrowRight") { e.preventDefault(); sel = Math.min(list.length - 1, sel + 1); mark() }
    else if (e.key === "ArrowLeft") { e.preventDefault(); sel = Math.max(0, sel - 1); mark() }
    else if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(list.length - 1, sel + cols); mark() }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - cols); mark() }
    else if (e.key === "Backspace" && !input.value && list[sel]) { e.preventDefault(); T.closeTab(list[sel].id); paint() }
  })

  overlay = h("div.ov", { onclick: (e) => { if (e.target === overlay) closeOverview() } }, [
    h("div.ov-head", {}, [h("h2", { text: `${T.getTabs().length} tabs` }), h("div.ov-searchbox.glass", {}, [ico("search", 15), input])]),
    grid
  ])
  document.body.append(overlay)
  paint()
  input.focus()
}

bus.on("overview:open", openOverview)
bus.on("view", () => closeOverview())
