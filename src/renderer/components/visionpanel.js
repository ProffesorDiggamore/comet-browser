// ───────────────────────────────────────────────────────────────────
//  visionpanel.js — capture a screenshot (browser page or whole
//  screen), attach a prompt, send to the configured cloud vision model,
//  show the answer.  The global hotkey routes here and auto-captures.
// ───────────────────────────────────────────────────────────────────
import { h, mount } from "../core/dom.js"
import { state } from "../core/state.js"
import { bus, toast } from "../core/bus.js"
import * as T from "../core/tabs.js"
import { sfx } from "../audio/sfx.js"

let shot = null      // current dataURL
let busy = false

async function grab () {
  const scope = state.get("vision.captureScope") ?? "page"
  if (scope === "screen") {
    const r = await window.flux.vision.captureScreen()
    if (!r.ok) { toast(r.text); return null }
    return r.dataUrl
  }
  const d = await T.capturePage()
  if (!d) toast("Open a page first, or switch capture scope to Screen.")
  return d
}

export function initVision () {
  const el = document.getElementById("vision")
  const log = h("div.chat-log")
  const preview = h("img.shot-preview", { hidden: true })
  const prompt = h("textarea", { placeholder: "Ask about the screenshot…", value: state.get("vision.lastPrompt") ?? "" })
  const providerSel = h("select")
  const sendBtn = h("button.btn.btn--accent", { onclick: send }, "Analyze")

  async function refreshProviders () {
    const st = await window.flux.secrets.status()
    providerSel.replaceChildren(...["anthropic", "openai", "gemini"].map((p) =>
      h("option", { value: p, selected: state.get("vision.provider") === p }, `${p}${st[p] ? "" : " (no key)"}`)))
  }
  providerSel.addEventListener("change", () => state.set("vision.provider", providerSel.value))

  async function doCapture () {
    const d = await grab()
    if (!d) return
    shot = d
    preview.src = d
    preview.hidden = false
    sfx.play("ok")
  }

  async function send () {
    if (busy) return
    if (!shot) { await doCapture(); if (!shot) return }
    const text = prompt.value.trim() || "Describe this and suggest a next action."
    state.set("vision.lastPrompt", text)
    log.append(h("div.msg.user", { text }))
    log.append(h("img.shot-preview", { src: shot }))
    const pending = h("div.msg.ai", { text: "Analyzing…" })
    log.append(pending)
    el.scrollTop = el.scrollHeight
    busy = true; sendBtn.disabled = true
    const res = await window.flux.vision.analyze({ provider: providerSel.value, prompt: text, dataUrl: shot })
    busy = false; sendBtn.disabled = false
    pending.className = res.ok ? "msg ai" : "msg tool"
    pending.textContent = res.text || "(empty response)"
    el.scrollTop = el.scrollHeight
  }

  function render () {
    refreshProviders()
    mount(el, h("div", {}, [
      h("h2.pane-h", { text: "Vision AI" }),
      h("p.pane-sub", { text: `Hotkey ${(state.get("vision.hotkey") ?? "").replace("CmdOrCtrl", "⌘")} captures & opens this panel from anywhere.` }),
      h("div.row", {}, [
        h("button.btn", { onclick: doCapture }, "Capture now"),
        h("label.field", {}, ["Scope", (() => {
          const s = h("select", {}, [
            h("option", { value: "page", selected: (state.get("vision.captureScope") ?? "page") === "page" }, "Browser page"),
            h("option", { value: "screen", selected: state.get("vision.captureScope") === "screen" }, "Whole screen")
          ])
          s.addEventListener("change", () => state.set("vision.captureScope", s.value))
          return s
        })()]),
        h("label.field", {}, ["Model", providerSel])
      ]),
      preview,
      log,
      h("div.composer", {}, [prompt, sendBtn])
    ]))
  }

  bus.on("view", (v) => { if (v === "vision") render() })

  // global hotkey → reveal, capture, focus prompt
  window.flux.vision.onHotkey(async () => {
    bus.emit("view", "vision")
    render()
    await doCapture()
    prompt.focus()
  })

  render()
}
