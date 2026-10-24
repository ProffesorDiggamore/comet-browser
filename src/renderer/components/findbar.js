// ───────────────────────────────────────────────────────────────────
//  findbar.js — in-page search (Cmd+F).  Floating glass bar over the
//  web view; drives <webview>.findInPage on the active tab.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { bus } from "../core/bus.js"
import { ico } from "../core/icons.js"
import * as T from "../core/tabs.js"

let bar = null
let input = null
let counter = null
let boundWv = null
let onFound = null

function detach () {
  if (boundWv && onFound) boundWv.removeEventListener("found-in-page", onFound)
  boundWv = null; onFound = null
}

function search (forward = true) {
  const tab = T.getActive()
  if (!tab || !input.value) return
  if (boundWv !== tab.wv) {
    detach()
    boundWv = tab.wv
    onFound = (e) => { counter.textContent = e.result.matches ? `${e.result.activeMatchOrdinal}/${e.result.matches}` : "0/0" }
    boundWv.addEventListener("found-in-page", onFound)
  }
  try { tab.wv.findInPage(input.value, { forward, findNext: false }) } catch {}
}

export function closeFind () {
  if (!bar) return
  const tab = T.getActive()
  try { tab?.wv.stopFindInPage("clearSelection") } catch {}
  detach()
  bar.remove(); bar = null
}

export function openFind () {
  const tab = T.getActive()
  if (!tab) return
  if (bar) { input.focus(); input.select(); return }
  counter = h("span", { style: { color: "var(--f-text-dim)", fontSize: "12px", fontVariantNumeric: "tabular-nums", minWidth: "40px", textAlign: "center" }, text: "" })
  input = h("input", {
    type: "text", placeholder: "Find in page",
    style: { border: "0", background: "transparent", outline: "0", minWidth: "180px" },
    oninput: () => search(true),
    onkeydown: (e) => {
      if (e.key === "Enter") { e.preventDefault(); search(!e.shiftKey) }
      if (e.key === "Escape") { e.preventDefault(); closeFind() }
    }
  })
  const mk = (name, fn, title) => h("button.tb-btn", { title, onclick: fn }, [ico(name, 15)])
  bar = h("div.glass.glass--card", {
    style: {
      position: "absolute", top: "12px", right: "18px", zIndex: "400",
      display: "flex", alignItems: "center", gap: "6px", padding: "6px 8px", borderRadius: "12px"
    }
  }, [ico("search", 15), input, counter, mk("back", () => search(false), "Previous (⇧⏎)"), mk("forward", () => search(true), "Next (⏎)"), mk("close", closeFind, "Close (Esc)")])
  document.getElementById("stage").append(bar)
  input.focus()
}

bus.on("view", (v) => { if (v !== "tabs") closeFind() })
bus.on("find:open", openFind)
