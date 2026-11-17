// ───────────────────────────────────────────────────────────────────
//  peek.js — Peek: ⇧-click a link (or right-click → Peek at Link) and
//  it opens in a glass sheet over the page you're on, instead of a new
//  tab.  Keep it (Open as Tab), put it beside this page (Split), or
//  dismiss it (Esc, ✕, or a click outside) and you're right where you
//  were.  Uses the same session as the page, so you stay logged in.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { bus, toast } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { state } from "../core/state.js"
import { effectiveMode, ms } from "../core/motion.js"
import * as T from "../core/tabs.js"

let root = null, card, wv, titleEl, hostEl, favEl, btnBack, bar
let isPrivate = false

export const isPeekOpen = () => !!root

const hostOf = (u) => T.hostOf(u).replace(/^www\./, "")
const curUrl = () => { try { return wv.getURL() } catch { return wv?.src ?? "" } }

function close (then) {
  if (!root) return
  const el = root
  root = null
  document.body.classList.remove("peek-open")
  const done = () => { el.remove(); then?.() }
  if (effectiveMode() === "off") { done(); return }
  el.classList.add("is-closing")
  setTimeout(done, ms("med"))
}
export function closePeek () { close() }

function open (url, priv) {
  if (!url) return
  if (state.get("layout.peek") === false) { T.newTab(url, { private: priv }); return }
  if (root) { wv.loadURL?.(url).catch(() => {}); return }
  isPrivate = !!priv

  wv = document.createElement("webview")
  wv.setAttribute("partition", priv ? (window.flux.paths.privatePartition ?? "comet-private") : window.flux.paths.partition ?? "persist:comet")
  wv.setAttribute("allowpopups", "")
  wv.setAttribute("preload", `file://${window.flux.paths.webviewPreload}`)
  wv.src = url

  favEl = h("span.pk-fav", {}, [ico("globe", 13)])
  titleEl = h("span.pk-title", { text: hostOf(url) })
  hostEl = h("span.pk-host", { text: hostOf(url) })
  btnBack = h("button.pk-btn", { title: "Back", "aria-label": "Back", disabled: true, onclick: () => { try { wv.goBack() } catch {} } }, [ico("back", 14)])
  const promote = (split) => {
    const u = curUrl() || url
    close(() => {
      const cur = T.getActive()
      const id = T.newTab(u, { private: isPrivate, background: split, group: cur?.group ?? null })
      if (split && cur && !cur.isHome) T.setSplit(cur.id, id)
    })
  }
  bar = h("div.pk-bar", {}, [
    btnBack,
    favEl,
    h("span.pk-label", {}, [titleEl, hostEl]),
    h("span.pk-flex"),
    h("button.pk-btn", { title: "Copy link", "aria-label": "Copy link", onclick: () => { navigator.clipboard.writeText(curUrl() || url); toast("Link copied") } }, [ico("link", 14)]),
    h("button.pk-btn.pk-wide", { title: "Open beside this page", onclick: () => promote(true) }, [ico("split", 14), h("span", { text: "Split" })]),
    h("button.pk-btn.pk-wide.pk-primary", { title: "Keep it as a tab", onclick: () => promote(false) }, [ico("plus", 14), h("span", { text: "Open as Tab" })]),
    h("button.pk-btn", { title: "Close (Esc)", "aria-label": "Close Peek", onclick: () => close() }, [ico("close", 13)])
  ])
  card = h("div.pk-card", {}, [bar, h("div.pk-page", {}, [wv])])
  root = h("div#peek", { role: "dialog", "aria-label": "Peek" }, [h("div.pk-scrim", { onclick: () => close() }), card])

  wv.addEventListener("page-title-updated", (e) => { titleEl.textContent = e.title || hostOf(curUrl()) })
  wv.addEventListener("page-favicon-updated", (e) => { const f = e.favicons?.[0]; if (f) favEl.replaceChildren(h("img", { src: f, draggable: false, onerror: (ev) => ev.target.replaceWith(ico("globe", 13)) })) })
  const nav = () => { hostEl.textContent = hostOf(curUrl()); try { btnBack.disabled = !wv.canGoBack() } catch {} }
  wv.addEventListener("did-navigate", nav)
  wv.addEventListener("did-navigate-in-page", nav)
  wv.addEventListener("did-start-loading", () => card.classList.add("is-loading"))
  wv.addEventListener("did-stop-loading", () => card.classList.remove("is-loading"))
  wv.addEventListener("ipc-message", (e) => {
    if (e.channel === "flux-key" && e.args[0]?.key === "Escape") close()
    else if (e.channel === "flux-peek") wv.loadURL(e.args[0]).catch(() => {})
    else if (e.channel === "flux-page-down") bus.emit("page-down")
  })

  document.getElementById("stage").append(root)
  document.body.classList.add("peek-open")
}

export function initPeek () {
  bus.on("peek:open", ({ url, private: priv }) => open(url, priv))
  // switching tabs or views puts the sheet away
  bus.on("view", () => { if (root) close() })
}
