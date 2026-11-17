// ───────────────────────────────────────────────────────────────────
//  overlays.js — the small always-on pieces: page-load bar, hovered-
//  link URL pill, site permission prompts, load-error card, focus
//  mode, and the auto-hiding sidebar.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { state } from "../core/state.js"
import { bus } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { leave } from "../core/motion.js"
import * as T from "../core/tabs.js"

const PERM_TEXT = {
  microphone: "use your microphone", camera: "use your camera", "camera+mic": "use your camera and microphone",
  geolocation: "know your location", notifications: "show notifications", midi: "use MIDI devices", midiSysex: "fully control MIDI devices",
  "clipboard-read": "read your clipboard", "display-capture": "share your screen", "idle-detection": "know when you're idle", "speaker-selection": "choose audio outputs"
}

function loadBar () {
  const bar = document.getElementById("loadbar")
  let t = null
  bus.on("loading", ({ id, on }) => {
    if (id !== T.getActiveId()) return
    clearTimeout(t)
    if (on) { bar.className = "is-loading"; bar.style.removeProperty("--p") }
    else { bar.className = "is-done"; t = setTimeout(() => { bar.className = "" }, 420) }
  })
  bus.on("tabs", ({ activeId, tabs }) => {
    const a = tabs.find((x) => x.id === activeId)
    if (!a?.loading && bar.className === "is-loading") bar.className = ""
  })
}

function hoverPill () {
  const pill = document.getElementById("hoverurl")
  let t = null
  bus.on("hover-url", (url) => {
    clearTimeout(t)
    if (!url) { t = setTimeout(() => pill.classList.remove("is-on"), 120); return }
    pill.textContent = url.replace(/^https?:\/\/(www\.)?/, "")
    pill.classList.add("is-on")
  })
}

function permissions () {
  window.flux.perms.onAsk(({ id, host, permission }) => {
    const remember = h("input", { type: "checkbox", checked: true })
    const card = h("div.perm.glass", {}, [
      h("div.perm-q", {}, [ico(/camera|mic/.test(permission) ? "mic" : permission === "geolocation" ? "pin" : "shield", 16), h("span", {}, [h("strong", { text: host }), ` wants to ${PERM_TEXT[permission] ?? permission}`])]),
      h("label.perm-rem", {}, [remember, h("span", { text: "Remember for this site" })]),
      h("div.row", {}, [
        h("button.btn.btn--ghost", { onclick: () => reply(false) }, "Block"),
        h("button.btn.btn--accent", { onclick: () => reply(true) }, "Allow")
      ])
    ])
    function reply (allow) {
      window.flux.perms.reply(id, allow, remember.checked)
      leave(card, "drop").then(() => card.remove())
    }
    document.getElementById("stage").append(card)
    setTimeout(() => { if (card.isConnected) reply(false) }, 58_000)
  })
}

function loadErrors () {
  bus.on("load-error", ({ id, desc, url }) => {
    if (id !== T.getActiveId()) return
    const host = T.hostOf(url)
    const card = h("div.loaderr.glass", {}, [
      h("div.loaderr-title", { text: "This page didn't load" }),
      h("div.loaderr-sub", { text: `${host || url} · ${String(desc || "").replace(/^ERR_/, "").replace(/_/g, " ").toLowerCase()}` }),
      h("div.row", {}, [
        h("button.btn.btn--accent", { onclick: () => { card.remove(); T.reload() } }, "Try again"),
        h("button.btn.btn--ghost", { onclick: () => { card.remove(); bus.emit("ai:ask", { text: `Why might ${url} fail to load with "${desc}", and what are alternatives?` }) } }, "Ask Comet AI"),
        h("button.btn.btn--ghost", { onclick: () => card.remove() }, "Dismiss")
      ])
    ])
    document.querySelectorAll(".loaderr").forEach((x) => x.remove())
    document.getElementById("stage").append(card)
    const kill = () => { card.remove(); off() }
    const off = bus.on("loading", ({ on }) => { if (on) kill() })
  })
}

// ── layout modes ──────────────────────────────────────────────────
export function setFocus (on) {
  document.body.classList.toggle("focus-mode", on ?? !document.body.classList.contains("focus-mode"))
}

function sidebarMode () {
  const sb = document.getElementById("sidebar")
  const edge = document.getElementById("sidebar-edge")
  let hideT = null
  const apply = () => {
    const mode = state.get("layout.sidebar") ?? "autohide"
    document.body.dataset.sidebar = mode
    document.body.dataset.layout = state.get("layout.style") ?? "dia"
    document.body.classList.toggle("vt-collapsed", !!state.get("layout.vtabsCollapsed"))
    sb.classList.remove("is-peek")
  }
  edge.addEventListener("pointerenter", () => { if (document.body.dataset.sidebar === "autohide") { clearTimeout(hideT); sb.classList.add("is-peek") } })
  sb.addEventListener("pointerenter", () => clearTimeout(hideT))
  sb.addEventListener("pointerleave", () => { hideT = setTimeout(() => sb.classList.remove("is-peek"), 280) })
  bus.on("config", apply)
  // Dia layout: collapse/expand the tab sidebar; peek from the left edge
  const vt = document.getElementById("vtabs")
  const vtEdge = document.getElementById("vtabs-edge")
  let vtT = null
  vtEdge.addEventListener("pointerenter", () => { clearTimeout(vtT); vt.classList.add("is-peek") })
  vt.addEventListener("pointerenter", () => clearTimeout(vtT))
  vt.addEventListener("pointerleave", () => { vtT = setTimeout(() => vt.classList.remove("is-peek"), 280) })
  bus.on("sidebar:toggle", () => {
    if (document.body.dataset.layout === "dia") { vt.classList.remove("is-peek"); state.set("layout.vtabsCollapsed", !state.get("layout.vtabsCollapsed")); return }
    const mode = document.body.dataset.sidebar
    if (mode === "autohide") sb.classList.toggle("is-peek")
    else state.set("layout.sidebar", mode === "hidden" ? "shown" : "hidden")
  })
  apply()
}

function frame () {
  const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d }
  const apply = () => {
    const l = state.get("layout") ?? {}
    const r = document.documentElement.style
    document.body.dataset.frame = String(l.frame !== false)
    r.setProperty("--f-frame-r", `${l.frameRadius ?? 14}px`)
    // the Dia layout's sidebar + page card
    r.setProperty("--vt-w", `${num(l.vtabsWidth, 240, 190, 420)}px`)
    r.setProperty("--lay-card-r", `${num(l.cardRadius, 12, 0, 28)}px`)
    r.setProperty("--lay-card-gap", `${num(l.cardGap, 8, 0, 24)}px`)
    document.body.dataset.tabStyle = l.tabStyle === "compact" ? "compact" : "comfortable"
  }
  bus.on("config", apply)
  apply()
}

// two-finger swipe on a page (webview-preload.js reports it): an arrow follows
// the gesture in from the edge, fills in when far enough, then the tab goes
// back or forward.  Nothing shows when there is nowhere to go.
function swipeNav () {
  const ind = h("div#swipe-ind", { "aria-hidden": "true" })
  document.getElementById("stage").append(ind)
  let hideT = null
  let quietUntil = 0
  let dir = ""
  const reset = () => { ind.classList.remove("is-on", "is-armed"); ind.style.setProperty("--p", "0") }
  bus.on("swipe", ({ id, p = 0, go }) => {
    if (id !== T.getActiveId() || performance.now() < quietUntil) return
    clearTimeout(hideT)
    if (go) {
      reset()
      if (!T.canGo(go)) return
      quietUntil = performance.now() + 900   // the trackpad's momentum keeps arriving on the next page
      if (go === "back") T.back(); else T.forward()
      return
    }
    const d = p < 0 ? "back" : "forward"
    if (Math.abs(p) < 0.06 || !T.canGo(d)) { reset(); return }
    if (d !== dir) { dir = d; ind.dataset.dir = d; ind.replaceChildren(ico(d, 18)) }
    ind.style.setProperty("--p", String(Math.abs(p)))
    ind.classList.add("is-on")
    ind.classList.toggle("is-armed", Math.abs(p) >= 1)
    hideT = setTimeout(reset, 320)       // fingers lifted before the line: the page stops reporting
  })
}

export function initOverlays () {
  loadBar()
  swipeNav()
  hoverPill()
  permissions()
  loadErrors()
  sidebarMode()
  frame()
  bus.on("focus:toggle", () => setFocus())
  bus.on("focus:set", (v) => setFocus(!!v))
}
