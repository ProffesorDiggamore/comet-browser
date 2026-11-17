// ───────────────────────────────────────────────────────────────────
//  findbar.js — in-page search (Cmd+F).  Floating glass bar over the
//  web view; drives <webview>.findInPage on the active tab.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { bus } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { leave } from "../core/motion.js"
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
  if (!tab || !input.value) { counter.textContent = ""; try { tab?.wv.stopFindInPage("clearSelection") } catch {} return }
  if (boundWv !== tab.wv) {
    detach()
    boundWv = tab.wv
    onFound = (e) => { counter.textContent = e.result.matches ? `${e.result.activeMatchOrdinal} of ${e.result.matches}` : "No matches" }
    boundWv.addEventListener("found-in-page", onFound)
  }
  try { tab.wv.findInPage(input.value, { forward, findNext: false }) } catch {}
}

export function closeFind () {
  if (!bar) return
  const tab = T.getActive()
  try { tab?.wv.stopFindInPage("clearSelection") } catch {}
  detach()
  const b = bar; bar = null
  leave(b, "drop").then(() => b.remove())
}

export function openFind () {
  const tab = T.getActive()
  if (!tab) return
  if (bar) { input.focus(); input.select(); return }
  counter = h("span.findbar-count", { "aria-live": "polite", text: "" })
  input = h("input.findbar-input", {
    type: "text", placeholder: "Find in Page", spellcheck: false, "aria-label": "Find in page",
    oninput: () => search(true),
    onkeydown: (e) => {
      if (e.key === "Enter") { e.preventDefault(); search(!e.shiftKey) }
      if (e.key === "Escape") { e.preventDefault(); closeFind() }
    }
  })
  const mk = (name, fn, title, flip = false) => {
    const glyph = ico(name, 15)
    if (flip) glyph.style.transform = "rotate(180deg)"   // chevron up = previous, like Safari
    return h("button.tb-btn", { title, "aria-label": title, onclick: fn }, [glyph])
  }
  bar = h("div.findbar.glass.glass--card", { role: "search" }, [
    input, counter,
    h("span.findbar-sep"),
    mk("chevronDown", () => search(false), "Previous (⇧⏎)", true), mk("chevronDown", () => search(true), "Next (⏎)"),
    mk("close", closeFind, "Done (Esc)")
  ])
  document.getElementById("stage").append(bar)
  input.focus()
}

bus.on("view", (v) => { if (v !== "tabs") closeFind() })
bus.on("find:open", openFind)
