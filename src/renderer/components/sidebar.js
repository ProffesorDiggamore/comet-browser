// ───────────────────────────────────────────────────────────────────
//  sidebar.js — the fully modular rail.  Renders config.sidebar.widgets
//  through the widget registry, plus an Edit mode to add/remove/reorder
//  and a small "add widget" palette.  Everything persists to config.
// ───────────────────────────────────────────────────────────────────
import { h, mount } from "../core/dom.js"
import { bus, toast } from "../core/bus.js"
import { state } from "../core/state.js"
import { ico } from "../core/icons.js"
import { renderWidget } from "./widgets/registry.js"
import * as T from "../core/tabs.js"

let editing = false
let activeView = "home"

const ADD_MENU = [
  { type: "button", label: "Text button", make: () => ({ type: "button", label: "bruh", onClick: { kind: "toast", value: "bruh" } }) },
  { type: "macro", label: "Macro (many URLs)", make: () => ({ type: "macro", label: "Open group", urls: ["https://example.com"] }) },
  { type: "links", label: "Quick links", make: () => ({ type: "links", label: "Links", links: [{ label: "Example", url: "https://example.com" }] }) },
  { type: "nav", label: "Nav item", make: () => ({ type: "nav", label: "Library", target: "library", icon: "clock" }) },
  { type: "clock", label: "Clock", make: () => ({ type: "clock" }) },
  { type: "notes", label: "Notes", make: () => ({ type: "notes", label: "Notes", value: "" }) },
  { type: "label", label: "Section label", make: () => ({ type: "label", label: "SECTION" }) },
  { type: "divider", label: "Divider", make: () => ({ type: "divider" }) },
  { type: "js", label: "JS button (advanced)", make: () => ({ type: "button", label: "run", onClick: { kind: "js", value: "ctx.toast('hi from js')" } }) }
]

function uid () { return `w_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}` }

export function initSidebar () {
  const el = document.getElementById("sidebar")
  const ctx = {
    activeView,
    navigate: (u) => T.navigate(u),
    openMacro: (urls) => T.openMacro(urls),
    setView: (v) => bus.emit("view", v),
    toast,
    editing,
    setConfig: (id, patch) => updateWidget(id, patch),
    remove: (id) => removeWidget(id)
  }

  function render () {
    ctx.activeView = activeView
    ctx.editing = editing
    const widgets = (state.get("sidebar.widgets") ?? []).filter((w) => !(w.type === "nav" && (w.target === "vision" || w.target === "companion")))
    const list = h("div", { style: { display: "flex", flexDirection: "column", gap: "2px", flex: "1", overflowY: "auto" } },
      widgets.map((w, i) => {
        const node = renderWidget(w, ctx)
        if (editing && w.type !== "divider") {
          node.setAttribute("draggable", "true")
          node.addEventListener("dragstart", (e) => e.dataTransfer.setData("idx", String(i)))
          node.addEventListener("dragover", (e) => e.preventDefault())
          node.addEventListener("drop", (e) => {
            e.preventDefault()
            reorder(Number(e.dataTransfer.getData("idx")), i)
          })
        }
        return node
      })
    )

    const editRow = h("div.side-edit-row", {}, [
      h("button.mini-btn", { onclick: () => { editing = !editing; render() } }, editing ? "Done" : "Edit"),
      editing && h("button.mini-btn", { onclick: showAddMenu }, "+ Widget"),
      h("button.mini-btn", { title: "Settings", onclick: () => bus.emit("view", "settings") }, [ico("gear", 15)])
    ])

    mount(el, h("div", { style: { display: "flex", flexDirection: "column", height: "100%", gap: "4px" } }, [
      h("div.side-label", { text: state.get("home.greeting") ?? "Comet" }),
      list, editRow
    ]))
  }

  function showAddMenu () {
    const menu = h("div.glass.glass--card", {
      style: { position: "fixed", left: "16px", bottom: "60px", zIndex: "500", padding: "8px", width: "230px", display: "flex", flexDirection: "column", gap: "2px" }
    }, ADD_MENU.map((m) => h("button.side-item", {
      onclick: () => { addWidget(m.make()); menu.remove() }
    }, m.label)))
    const kill = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener("pointerdown", kill, true) } }
    document.body.append(menu)
    setTimeout(() => document.addEventListener("pointerdown", kill, true), 0)
  }

  async function persist (widgets) { await state.set("sidebar.widgets", widgets); render() }
  function addWidget (w) { const list = [...(state.get("sidebar.widgets") ?? [])]; w.id = w.id ?? uid(); list.push(w); persist(list) }
  function removeWidget (id) { persist((state.get("sidebar.widgets") ?? []).filter((w) => w.id !== id)) }
  function updateWidget (id, patch) {
    const list = (state.get("sidebar.widgets") ?? []).map((w) => (w.id === id ? { ...w, ...patch } : w))
    state.set("sidebar.widgets", list)   // no re-render: keeps textarea focus
  }
  function reorder (from, to) {
    const list = [...(state.get("sidebar.widgets") ?? [])]
    const [m] = list.splice(from, 1); list.splice(to, 0, m); persist(list)
  }

  bus.on("view", (v) => { activeView = v; window.__fluxView = v; render() })
  // only rebuild when something the sidebar actually shows changed —
  // not on every unrelated setting write (was causing layout jitter)
  let lastSig = ""
  bus.on("config", () => {
    const sig = JSON.stringify(state.get("sidebar.widgets")) + "|" + (state.get("home.greeting") ?? "")
    if (sig === lastSig) return
    lastSig = sig
    render()
  })
  render()
}
