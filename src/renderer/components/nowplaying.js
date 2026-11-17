// ───────────────────────────────────────────────────────────────────
//  nowplaying.js — a small player at the bottom of the sidebar for the
//  tab that's playing sound: artwork + track (from the page's Media
//  Session when it has one), play / pause, mute, and a click jumps to
//  the tab.  It stays after you pause so you can resume, and goes away
//  when that tab closes or you dismiss it.  Settings → Layout.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { bus } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { state } from "../core/state.js"
import * as T from "../core/tabs.js"

const META_JS = `(() => {
  const m = navigator.mediaSession && navigator.mediaSession.metadata
  const media = [...document.querySelectorAll("video, audio")]
  const playing = media.some((x) => !x.paused && !x.ended)
  if (!m) return { playing }
  const art = [...(m.artwork || [])].sort((a, b) => (parseInt(b.sizes) || 0) - (parseInt(a.sizes) || 0))[0]
  return { playing, title: m.title || "", artist: m.artist || "", art: art ? new URL(art.src, location.href).href : "" }
})()`

// the element that's playing, else the one furthest along (a paused song)
const TOGGLE_JS = `(() => {
  const media = [...document.querySelectorAll("video, audio")]
  const m = media.find((x) => !x.paused && !x.ended) || media.sort((a, b) => b.currentTime - a.currentTime)[0]
  if (!m) return "none"
  if (m.paused) { m.play(); return "playing" }
  m.pause(); return "paused"
})()`

let el, art, title, sub, btnPlay, btnMute
let npId = null           // the tab the card is for
let dismissed = null      // dismissed for this tab until it starts playing again
let wasAudible = new Set()
let meta = null
let metaT = null

const on = () => state.get("layout.nowPlaying") !== false && document.body.dataset.layout === "dia"

async function fetchMeta () {
  const id = npId
  const t = id ? T.getTab(id) : null
  if (!t || t.asleep || t.isHome || !on()) return       // never wake a sleeping tab just to read its song
  const r = await T.exec(id, META_JS).catch(() => null)
  if (id !== npId) return
  meta = r && typeof r === "object" ? r : null
  paint()
}

function paint () {
  const t = npId ? T.getTab(npId) : null
  const show = !!t && on() && !t.asleep && dismissed !== npId
  el.classList.toggle("is-on", show)
  if (!show) return
  const playing = meta?.playing ?? t.audible
  el.classList.toggle("is-playing", !!t.audible)
  const tt = meta?.title || t.title || T.hostOf(t.url)
  const st = meta?.title ? (meta.artist || T.hostOf(t.url).replace(/^www\./, "")) : T.hostOf(t.url).replace(/^www\./, "")
  if (title.textContent !== tt) title.textContent = tt
  if (sub.textContent !== st) sub.textContent = st
  const src = meta?.art || t.favicon || ""
  if (art.dataset.src !== src) {
    art.dataset.src = src
    art.classList.toggle("is-fav", !meta?.art)
    art.replaceChildren(src ? h("img", { src, draggable: false, onerror: (e) => e.target.replaceWith(ico("volume", 14)) }) : ico("volume", 14))
  }
  btnPlay.replaceChildren(ico(playing ? "pause" : "play", 14))
  btnPlay.title = playing ? "Pause" : "Play"
  btnMute.replaceChildren(ico(t.muted ? "volumeX" : "volume", 14))
  btnMute.title = t.muted ? "Unmute tab" : "Mute tab"
  btnMute.classList.toggle("is-on", !!t.muted)
}

function onTabs ({ tabs }) {
  const now = new Set(tabs.filter((t) => t.audible).map((t) => t.id))
  // newest tab to start playing takes the card
  for (const id of now) if (!wasAudible.has(id)) { if (npId !== id) meta = null; npId = id; if (dismissed === id) dismissed = null }
  wasAudible = now
  if (npId && !tabs.some((t) => t.id === npId)) { npId = null; meta = null }
  clearTimeout(metaT)
  if (npId) metaT = setTimeout(fetchMeta, 400)
  paint()
}

export function nowPlaying () {
  art = h("span.np-art")
  title = h("span.np-title")
  sub = h("span.np-sub")
  btnPlay = h("button.np-btn", { title: "Pause", "aria-label": "Play or pause", onclick: async (e) => {
    e.stopPropagation()
    if (!npId) return
    const r = await T.exec(npId, TOGGLE_JS).catch(() => "none")
    if (meta) meta.playing = r === "playing"
    paint(); setTimeout(fetchMeta, 300)
  } }, [ico("pause", 14)])
  btnMute = h("button.np-btn", { title: "Mute tab", "aria-label": "Mute tab", onclick: (e) => { e.stopPropagation(); if (npId) T.setMuted(npId) } }, [ico("volume", 14)])
  const btnX = h("button.np-btn.np-x", { title: "Hide", "aria-label": "Hide player", onclick: (e) => { e.stopPropagation(); dismissed = npId; paint() } }, [ico("close", 11)])
  el = h("div.vt-np", {
    role: "button", tabindex: 0, "aria-label": "Go to the tab that's playing",
    onclick: () => npId && T.setActive(npId),
    onkeydown: (e) => { if (e.key === "Enter" && npId) T.setActive(npId) }
  }, [h("span.np-eq", { "aria-hidden": "true" }, [h("i"), h("i"), h("i")]), art, h("span.np-text", {}, [title, sub]), btnPlay, btnMute, btnX])
  bus.on("tabs", onTabs)
  bus.on("config", paint)
  // the page's own play / pause shows up here within a few seconds
  setInterval(() => { if (npId && el.classList.contains("is-on") && !document.hidden) fetchMeta() }, 5000)
  return el
}
