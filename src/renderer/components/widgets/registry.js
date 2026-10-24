// ───────────────────────────────────────────────────────────────────
//  widgets/registry.js — the modular sidebar's vocabulary.  Every
//  entry is (config, ctx) -> HTMLElement.  ctx = { navigate, openMacro,
//  toast, setConfig(id, patch), remove(id), editing, setView, activeView }.
//  Add a key here and the sidebar can render it — nothing else changes.
// ───────────────────────────────────────────────────────────────────
import { h } from "../../core/dom.js"
import { ico } from "../../core/icons.js"

const ICON = { home: "home", eye: "eye", spark: "spark", grid: "grid", link: "link", clock: "clock", note: "note", play: "play", gear: "gear", bookmark: "bookmark", download: "download", layers: "layers" }
const gi = (key, size = 16) => ico(ICON[key] ?? "globe", size)

function runAction (act, ctx) {
  if (!act) return
  if (act.kind === "toast") ctx.toast(act.value ?? "ok")
  else if (act.kind === "url") ctx.navigate(act.value)
  else if (act.kind === "macro") ctx.openMacro(act.value ?? [])
  else if (act.kind === "view") ctx.setView(act.value)
  else if (act.kind === "js") {
    try { new Function("flux", "ctx", act.value)(window.flux, ctx) }
    catch (e) { ctx.toast(`script error: ${e.message}`) }
  }
}

export const WIDGETS = {
  nav (c, ctx) {
    return h(`button.side-item${ctx.activeView === c.target ? ".is-active" : ""}`, {
      onclick: () => ctx.setView(c.target)
    }, [h("span.ico", {}, [gi(c.icon)]), h("span", { text: c.label ?? c.target })])
  },

  divider () { return h("div.side-divider") },

  label (c) { return h("div.side-label", { text: c.label ?? "" }) },

  text (c) { return h("div.side-widget", { style: { color: "var(--f-text-dim)", fontSize: "12.5px" }, text: c.value ?? "" }) },

  button (c, ctx) {
    return h("div.side-widget", {}, [
      h("button.side-item", { onclick: () => runAction(c.onClick, ctx) }, [
        h("span.ico", {}, [gi(c.icon ?? "play")]),
        h("span", { text: c.label ?? "button" })
      ])
    ])
  },

  macro (c, ctx) {
    return h("div.side-widget", {}, [
      h("button.side-item", { title: (c.urls ?? []).join("\n"), onclick: () => ctx.openMacro(c.urls ?? []) }, [
        h("span.ico", {}, [gi("grid")]),
        h("span", { text: `${c.label ?? "Macro"} (${(c.urls ?? []).length})` })
      ])
    ])
  },

  links (c, ctx) {
    return h("div.side-widget", {}, [
      c.label && h("div.side-label", { text: c.label }),
      ...(c.links ?? []).map((l) => h("button.side-item", { onclick: () => ctx.navigate(l.url) }, [
        h("span.ico", {}, [gi("link")]), h("span", { text: l.label ?? l.url })
      ]))
    ])
  },

  clock () {
    const el = h("div.side-widget", {}, [h("div.side-clock", { text: "--:--" })])
    const face = el.firstChild
    const tick = () => { face.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }
    tick(); const id = setInterval(tick, 15_000)
    el._cleanup = () => clearInterval(id)
    return el
  },

  notes (c, ctx) {
    const ta = h("textarea.side-notes", {
      placeholder: "notes…", value: c.value ?? "",
      oninput: () => ctx.setConfig(c.id, { value: ta.value })
    })
    return h("div.side-widget", {}, [c.label && h("div.side-label", { text: c.label }), ta])
  }
}

export function renderWidget (cfg, ctx) {
  const fn = WIDGETS[cfg.type]
  const node = fn ? fn(cfg, ctx) : h("div.side-widget", { text: `?${cfg.type}` })
  if (ctx.editing && cfg.type !== "divider") {
    node.style.position = "relative"
    node.append(h("button.mini-btn", {
      title: "Remove widget",
      style: { position: "absolute", top: "2px", right: "2px", flex: "0 0 auto", width: "22px", padding: "0", lineHeight: "20px" },
      onclick: () => ctx.remove(cfg.id)
    }, "×"))
  }
  return node
}
