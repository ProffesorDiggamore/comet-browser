// ───────────────────────────────────────────────────────────────────
//  localai.js — renderer side of local models (Ollama): cached status,
//  one-click downloads with live progress, and small UI pieces shared
//  by Settings and the AI panel (model rows, download buttons).
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { state } from "../core/state.js"
import { bus, toast } from "../core/bus.js"
import { ico } from "../core/icons.js"

export const pulls = new Map()    // name -> { pct, status }
let cached = null

export async function localStatus (fresh = false) {
  if (cached && !fresh) return cached
  cached = await window.flux.ollama.status()
  return cached
}

export const fmtSize = (b) => !b ? "" : b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`
export const shortName = (m) => String(m ?? "").replace(/:latest$/, "")

export async function pullModel (name, { select = true } = {}) {
  if (!name || pulls.has(name)) return
  pulls.set(name, { pct: 0, status: "starting" })
  bus.emit("localai:pull", { name })
  const r = await window.flux.ollama.pull(name)
  if (r.ok) {
    if (select) await state.set("ai.localModel", name)
    toast(`${shortName(name)} is ready`)
  } else if (r.text && !/abort/i.test(r.text)) toast(`Download failed: ${r.text}`)
  await localStatus(true)
  bus.emit("localai:changed")
}

export function cancelPull (name) { window.flux.ollama.cancel(name) }

window.flux.ollama.onPull((p) => {
  if (p.done) pulls.delete(p.name)
  else pulls.set(p.name, { pct: p.pct ?? 0, status: p.status })
  bus.emit("localai:pull", p)
})

// a download button that turns into a live progress capsule
export function getButton (name, label = "Get") {
  const wrap = h("div.get-wrap", { dataset: { model: name } })
  const paint = () => {
    const p = pulls.get(name)
    if (!p) { wrap.replaceChildren(h("button.btn.btn--pill", { onclick: () => pullModel(name) }, label)); return }
    const pct = Math.max(2, p.pct ?? 0)
    wrap.replaceChildren(h("div.get-progress", { title: p.status }, [
      h("div.get-bar", {}, [h("i", { style: { width: `${pct}%` } })]),
      h("span.get-pct", { text: p.status === "success" ? "Done" : /pulling|downloading/.test(p.status ?? "") || p.pct ? `${p.pct ?? 0}%` : "…" }),
      h("button.get-x", { title: "Cancel", onclick: () => cancelPull(name) }, [ico("close", 11)])
    ]))
  }
  paint()
  const off = bus.on("localai:pull", (p) => { if (!wrap.isConnected) { off(); return } if (p.name === name) paint() })
  return wrap
}

export function capsBadges (m) {
  return h("span.caps", {}, [
    m.tools && h("span.cap.cap--tools", { text: "Tools" }),
    m.vision && h("span.cap.cap--vision", { text: "Vision" }),
    m.thinking && h("span.cap.cap--think", { text: "Thinking" })
  ])
}
