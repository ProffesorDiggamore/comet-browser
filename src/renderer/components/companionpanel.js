// ───────────────────────────────────────────────────────────────────
//  companionpanel.js — the self-coding AI companion.  Chats with the
//  main-process agent, which has read/search/write tools scoped to the
//  Flux project root.  Tool steps stream in; writes pop an approve bar
//  unless Autonomous mode is on.
// ───────────────────────────────────────────────────────────────────
import { h, mount } from "../core/dom.js"
import { state } from "../core/state.js"
import { bus, toast } from "../core/bus.js"

const history = []   // [{ role, content }]  content is string or blocks
let busy = false
let logEl = null

function pushMsg (cls, text) {
  const m = h(`div.msg.${cls}`, { text })
  logEl.append(m)
  logEl.scrollTop = logEl.scrollHeight
  return m
}

export function initCompanion () {
  const el = document.getElementById("companion")
  logEl = h("div.chat-log")
  const input = h("textarea", { placeholder: "Ask the companion to change Flux… e.g. \"add a Reader Mode toggle to the titlebar\"" })
  const sendBtn = h("button.btn.btn--accent", { onclick: send }, "Send")

  // agent events
  window.flux.companion.onEvent((ev) => {
    if (ev.type === "text" && ev.text.trim()) pushMsg("ai", ev.text)
    else if (ev.type === "tool") pushMsg("tool", `→ ${ev.name}(${JSON.stringify(ev.input).slice(0, 160)})`)
    else if (ev.type === "tool_result") pushMsg("tool", `   ${String(ev.output).split("\n").slice(0, 6).join("\n")}`)
  })

  // write approval
  window.flux.companion.onApprove(({ id, change }) => {
    const bar = h("div.approve-bar", {}, [
      h("div", { style: { flex: "1", minWidth: "0" } }, [
        h("strong", { text: `write ${change.path}` }),
        h("pre", { text: change.content.slice(0, 4000) })
      ]),
      h("button.btn.btn--ghost", { onclick: () => { window.flux.companion.reply(id, false); bar.remove() } }, "Reject"),
      h("button.btn.btn--accent", { onclick: () => { window.flux.companion.reply(id, true); bar.remove(); toast("Applied") } }, "Approve")
    ])
    logEl.append(bar)
    logEl.scrollTop = logEl.scrollHeight
  })

  async function send () {
    if (busy) return
    const text = input.value.trim()
    if (!text) return
    input.value = ""
    history.push({ role: "user", content: text })
    pushMsg("user", text)
    busy = true; sendBtn.disabled = true
    const res = await window.flux.companion.chat(history)
    busy = false; sendBtn.disabled = false
    if (!res.ok) { pushMsg("tool", res.text); return }
    history.push({ role: "assistant", content: res.text })
    // final text already streamed via events; ensure it's shown
  }

  function render () {
    const auto = state.get("companion.autonomous")
    const proj = state.get("companion.projectPath") ?? "(Flux source)"
    mount(el, h("div", {}, [
      h("h2.pane-h", { text: "Companion" }),
      h("p.pane-sub", { text: "A coding agent with full read/write access to Flux's own source. It can extend the browser itself." }),
      h("div.row", {}, [
        h("span.tag", { text: proj.split("/").slice(-2).join("/") }),
        h("button.btn.btn--ghost", { onclick: async () => { const r = await window.flux.companion.setProject(); if (r.ok) { toast("Project set"); render() } } }, "Change folder"),
        h("label.row", { style: { gap: "8px" } }, [
          h("span", { text: "Autonomous writes" }),
          (() => {
            const s = h("span.switch", {}, [h("input", { type: "checkbox", checked: !!auto, onchange: (e) => state.set("companion.autonomous", e.target.checked) }), h("span.track")])
            return s
          })()
        ])
      ]),
      logEl,
      h("div.composer", {}, [input, sendBtn])
    ]))
  }

  bus.on("view", (v) => { if (v === "companion") render() })
  render()
}
