// ───────────────────────────────────────────────────────────────────
//  widgets-personal.js — Notes (Apple Notes widget: yellow header,
//  first line bold, click to edit), To-Do (Reminders: big count,
//  hollow circles that fill) and Battery (the Batteries widget ring).
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { ico } from "../core/icons.js"
import { svg, sv, ring } from "./widgets-kit.js"

const when = (t) => {
  if (!t) return ""
  const d = new Date(t), now = new Date()
  const same = d.toDateString() === now.toDateString()
  return same ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

// ── notes ─────────────────────────────────────────────────────────
export function notes (body, w, ctx) {
  const text = () => w.config?.text ?? ""
  const head = h("div.hw-head.hw-notes-head", {}, [h("span.hw-notes-glyph", {}, [ico("note", 13)]), h("span", { text: "Notes" }), h("span.hw-head-n.hw-notes-when")])
  const view = h("div.hw-notes-view", { tabIndex: 0, role: "button", "aria-label": "Edit note" })
  const ta = h("textarea.hw-notes", { placeholder: "New Note", spellcheck: true, "aria-label": "Note" })
  let t = null
  const save = () => { clearTimeout(t); if (text() !== ta.value) ctx.update({ config: { ...w.config, text: ta.value, at: Date.now() } }, { quiet: true }) }
  const paint = () => {
    const [first = "", ...rest] = text().split("\n")
    head.querySelector(".hw-notes-when").textContent = w.size === "small" ? "" : when(w.config?.at)
    if (!text().trim()) { view.replaceChildren(h("div.hw-notes-title.is-empty", { text: "New Note" }), h("div.hw-notes-rest", { text: "Click to write." })); return }
    view.replaceChildren(h("div.hw-notes-title", { text: first.trim() || " " }), h("div.hw-notes-rest", { text: rest.join("\n").trim() }))
  }
  const edit = () => {
    ta.value = text()
    view.replaceWith(ta)
    ta.focus()
    ta.setSelectionRange(ta.value.length, ta.value.length)
  }
  view.addEventListener("click", edit)
  view.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); edit() } })
  ta.addEventListener("input", () => { clearTimeout(t); t = setTimeout(save, 500) })
  ta.addEventListener("keydown", (e) => { if (e.key === "Escape") ta.blur() })
  ta.addEventListener("blur", () => { save(); paint(); if (ta.isConnected) ta.replaceWith(view) })
  body.append(head, view)
  paint()
  return () => { if (ta.isConnected) save(); clearTimeout(t) }
}

// ── to-do: Reminders-style ────────────────────────────────────────
export function todo (body, w, ctx) {
  const items = () => w.config?.items ?? []
  const save = (list) => { w.config = { ...w.config, items: list }; ctx.update({ config: w.config }, { quiet: true }); paint() }
  const count = h("span.hw-todo-count")
  const list = h("div.hw-todo")
  const input = h("input.hw-todo-input", { placeholder: "New To-Do", spellcheck: true, maxLength: 120, "aria-label": "New to-do" })
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !input.value.trim()) return
    save([...items(), { t: input.value.trim(), done: false }])
    input.value = ""
  })
  const paint = () => {
    const all = items()
    count.textContent = String(all.filter((x) => !x.done).length)
    list.replaceChildren(...all.map((x, i) => h(`div.hw-todo-row${x.done ? ".is-done" : ""}`, {}, [
      h("button.hw-todo-check", { title: x.done ? "Mark not done" : "Mark done", "aria-label": x.done ? "Mark not done" : "Mark done", "aria-pressed": String(!!x.done), onclick: () => save(all.map((y, j) => j === i ? { ...y, done: !y.done } : y)) }),
      h("span.hw-todo-t", { text: x.t }),
      h("button.hw-todo-x", { title: "Remove", "aria-label": "Remove", onclick: () => save(all.filter((_, j) => j !== i)) }, [ico("x", 10)])
    ])))
    if (all.some((x) => x.done)) list.append(h("button.hw-link.hw-todo-clear", { text: "Clear Completed", onclick: () => save(all.filter((x) => !x.done)) }))
  }
  body.append(
    h("div.hw-todo-head", {}, [h("span.hw-todo-glyph", {}, [ico("list", 13)]), count]),
    h("div.hw-todo-title", { text: "To-Do" }),
    list,
    h("label.hw-todo-row.is-add", {}, [h("span.hw-todo-check.is-add", {}, [ico("plus", 9)]), input])
  )
  paint()
  return null
}

// ── battery: the Batteries widget ─────────────────────────────────
function laptop () {
  const el = svg("0 0 24 24", "hw-batt-dev")
  sv(el, "rect", { x: 4.2, y: 5.2, width: 15.6, height: 10.6, rx: 1.6, class: "is-screen" })
  sv(el, "path", { d: "M1.8 17.6h20.4c0 .9-.7 1.6-1.6 1.6H3.4c-.9 0-1.6-.7-1.6-1.6z", class: "is-base" })
  return el
}
const bolt = () => { const el = svg("0 0 12 16", "hw-batt-bolt"); sv(el, "path", { d: "M7.4 0 0 9.2h4.6L3.4 16 12 6.4H7.2z" }); return el }
const dur = (s) => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}` : "")

export function battery (body, w) {
  const r = ring("hw-batt-ring")
  const pct = h("div.hw-ring-pct")
  const name = h("div.hw-batt-name", { text: "This Mac" })
  const sub = h("div.hw-batt-sub")
  const dialEl = h("div.hw-batt-dial", {}, [r.el, laptop(), h("span.hw-batt-badge", {}, [bolt()])])
  body.append(h(`div.hw-batt.is-${w.size}`, {}, w.size === "small" ? [dialEl, pct] : [dialEl, h("div.hw-batt-side", {}, [name, pct, sub])]))
  if (!navigator.getBattery) { pct.textContent = "—"; sub.textContent = "No battery info"; return null }
  let b = null
  const paint = () => {
    const p = Math.round(b.level * 100)
    r.set(p)
    body.dataset.level = b.charging ? "ok" : p <= 10 ? "crit" : p <= 20 ? "low" : "ok"
    body.classList.toggle("is-charging", b.charging)
    pct.textContent = `${p}%`
    sub.textContent = b.charging
      ? (p >= 100 ? "Fully charged" : dur(b.chargingTime) ? `Charging · ${dur(b.chargingTime)} until full` : "Charging")
      : dur(b.dischargingTime) ? `${dur(b.dischargingTime)} remaining` : "On battery"
  }
  navigator.getBattery().then((x) => { b = x; paint(); b.addEventListener("levelchange", paint); b.addEventListener("chargingchange", paint) })
  return () => { b?.removeEventListener("levelchange", paint); b?.removeEventListener("chargingchange", paint) }
}
