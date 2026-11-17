// ───────────────────────────────────────────────────────────────────
//  tooltip.js — hover hints for the icon-only chrome.  Every `title`
//  in the UI is lifted into data-tip (and aria-label) so the slow
//  native tooltip never shows; one glass pill appears after a short
//  pause and then glides between neighbours with no delay.  A trailing
//  "(⌘R)" in the text is drawn as a keyboard hint.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"

const SHOW_MS = 420      // first hover
const WARM_MS = 700      // after a tip closes, the next one is instant for this long
const KEYS = /[⌘⌥⇧⌃]/

let tip = null
let cur = null
let timer = 0
let hideT = 0
let warmUntil = 0

function lift (el) {
  const t = el.getAttribute("title")
  if (t == null) return
  el.removeAttribute("title")
  if (!t) { delete el.dataset.tip; return }
  el.dataset.tip = t
  if (!el.hasAttribute("aria-label") || el.dataset.tipLabel === "1") { el.setAttribute("aria-label", t); el.dataset.tipLabel = "1" }
  if (el === cur) paint(el)
}

function parse (text) {
  const m = /^(.*\S)\s*\(([^()]+)\)\s*$/.exec(text)
  return m && KEYS.test(m[2]) ? { label: m[1], keys: m[2] } : { label: text, keys: "" }
}

function paint (el) {
  const { label, keys } = parse(el.dataset.tip ?? "")
  tip.replaceChildren(h("span.tip-label", { text: label }), keys ? h("span.tip-keys", { text: keys }) : "")
  const r = el.getBoundingClientRect()
  const t = { width: tip.offsetWidth, height: tip.offsetHeight }   // layout size: the pill is scaled while it fades
  const gap = 8
  let x, y
  if (r.width > 150) {                       // wide rows (sidebar tabs): sit beside, not on the next row
    x = r.right + gap; y = r.top + (r.height - t.height) / 2
    if (x + t.width > innerWidth - 8) { x = r.left + 12; y = r.bottom + 4 }
  } else {
    x = r.left + (r.width - t.width) / 2
    y = r.bottom + gap
    if (y + t.height > innerHeight - 8) y = r.top - t.height - gap
  }
  x = Math.max(8, Math.min(innerWidth - t.width - 8, x))
  y = Math.max(8, Math.min(innerHeight - t.height - 8, y))
  tip.style.translate = `${Math.round(x)}px ${Math.round(y)}px`
}

function show (el) {
  if (!el.isConnected || !el.dataset.tip) return
  const gliding = tip.classList.contains("is-on")
  cur = el
  if (!gliding) tip.classList.add("no-glide")   // first appearance: land in place, don't fly in from the last spot
  paint(el)
  void tip.offsetWidth
  tip.classList.remove("no-glide")
  tip.classList.add("is-on")
}

function hide () {
  clearTimeout(timer); clearTimeout(hideT)
  if (cur) warmUntil = performance.now() + WARM_MS
  cur = null
  tip?.classList.remove("is-on")
}

export function initTooltips () {
  tip = h("div.tip", { role: "tooltip", "aria-hidden": "true" })
  document.body.append(tip)

  document.querySelectorAll("[title]").forEach(lift)
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "attributes") lift(m.target)
      else for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue
        if (n.hasAttribute("title")) lift(n)
        n.querySelectorAll?.("[title]").forEach(lift)
      }
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["title"] })

  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest?.("[data-tip]")
    if (el === cur) return
    clearTimeout(timer); clearTimeout(hideT)
    if (!el) { hideT = setTimeout(hide, 70); return }   // brief grace: crossing the gap between two buttons glides
    if (cur || performance.now() < warmUntil) show(el)
    else timer = setTimeout(() => show(el), SHOW_MS)
  })
  document.addEventListener("mouseleave", hide)
  for (const ev of ["mousedown", "keydown", "wheel", "blur"]) window.addEventListener(ev, hide, { capture: true, passive: true })
}
