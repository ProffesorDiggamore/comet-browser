// ───────────────────────────────────────────────────────────────────
//  nowplaying.js — a small player at the bottom of the sidebar for the
//  tab that's playing sound: artwork + track (from the page's Media
//  Session when it has one), play / pause, mute, and a click jumps to
//  the tab.  It stays after you pause so you can resume, and goes away
//  when that tab closes or you dismiss it.  Settings → Layout.
//  With no tab playing, it shows the Spotify app instead (artwork,
//  play / pause, next; a click brings Spotify forward).
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { bus } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { state } from "../core/state.js"
import * as T from "../core/tabs.js"
import { spotify } from "./widgets/spotify-client.js"
import { glyph } from "./widgets/spotify.js"

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
let src = null            // "tab" | "spotify": what the card is showing
let sp = null             // the Spotify app's state
let spSeen = false        // Spotify played since it last went quiet (keeps the card while paused)
let spDismissed = null    // track uri hidden until something else plays
let spOff = null

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

// a tab that's playing wins; then Spotify playing; then whichever is paused
function source () {
  if (!on()) return null
  const t = npId ? T.getTab(npId) : null
  const tabOk = !!t && !t.asleep && dismissed !== npId
  const spOk = !!sp?.track && spotify.live(sp) && spDismissed !== sp.track.uri && (sp.status === "playing" || spSeen)
  if (tabOk && t.audible) return "tab"
  if (spOk && sp.status === "playing") return "spotify"
  return tabOk ? "tab" : spOk ? "spotify" : null
}

function setArt (src, fav) {
  if (art.dataset.src === src) return
  art.dataset.src = src
  art.classList.toggle("is-fav", !!fav)
  art.replaceChildren(src ? h("img", { src, draggable: false, onerror: (e) => e.target.replaceWith(ico("volume", 14)) }) : ico("volume", 14))
}

function paintSpotify () {
  const t = sp.track
  const playing = sp.status === "playing"
  el.classList.toggle("is-playing", playing)
  if (title.textContent !== t.title) title.textContent = t.title
  if (sub.textContent !== t.artist) sub.textContent = t.artist
  el.title = "Open Spotify"
  el.ariaLabel = `Spotify: ${t.title} — ${t.artist}. Open Spotify`
  const url = t.art
  if (art.dataset.want !== url) {
    art.dataset.want = url
    spotify.art(url).then((d) => { if (art.dataset.want === url && src === "spotify") setArt(d || "", false) })
  }
  btnPlay.replaceChildren(glyph(playing ? "pause" : "play", 14))
  btnPlay.title = playing ? "Pause Spotify" : "Play Spotify"
  btnMute.replaceChildren(glyph("next", 13))
  btnMute.title = btnMute.ariaLabel = "Next track"
  btnMute.classList.remove("is-on")
}

function paint () {
  const was = src
  src = source()
  el.classList.toggle("is-on", !!src)
  el.classList.toggle("is-spotify", src === "spotify")
  if (src !== was) { art.dataset.want = ""; art.dataset.src = "-" }
  if (!src) return
  if (src === "spotify") { paintSpotify(); return }
  const t = T.getTab(npId)
  el.title = ""
  el.ariaLabel = "Go to the tab that's playing"
  btnMute.ariaLabel = "Mute tab"
  const playing = meta?.playing ?? t.audible
  el.classList.toggle("is-playing", !!t.audible)
  const tt = meta?.title || t.title || T.hostOf(t.url)
  const st = meta?.title ? (meta.artist || T.hostOf(t.url).replace(/^www\./, "")) : T.hostOf(t.url).replace(/^www\./, "")
  if (title.textContent !== tt) title.textContent = tt
  if (sub.textContent !== st) sub.textContent = st
  setArt(meta?.art || t.favicon || "", !meta?.art)
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
    if (src === "spotify") {
      // answer now; Spotify catches up
      sp = { ...sp, position: spotify.position(sp), at: Date.now(), status: sp.status === "playing" ? "paused" : "playing" }
      paint(); spotify.command("toggle")
      return
    }
    if (!npId) return
    const r = await T.exec(npId, TOGGLE_JS).catch(() => "none")
    if (meta) meta.playing = r === "playing"
    paint(); setTimeout(fetchMeta, 300)
  } }, [ico("pause", 14)])
  btnMute = h("button.np-btn", { title: "Mute tab", "aria-label": "Mute tab", onclick: (e) => {
    e.stopPropagation()
    if (src === "spotify") spotify.command("next"); else if (npId) T.setMuted(npId)
  } }, [ico("volume", 14)])
  const btnX = h("button.np-btn.np-x", { title: "Hide", "aria-label": "Hide player", onclick: (e) => {
    e.stopPropagation()
    if (src === "spotify") spDismissed = sp?.track?.uri ?? null; else dismissed = npId
    paint()
  } }, [ico("close", 11)])
  const go = () => { if (src === "spotify") spotify.command("open"); else if (npId) T.setActive(npId) }
  el = h("div.vt-np", {
    role: "button", tabindex: 0, "aria-label": "Go to the tab that's playing",
    onclick: go,
    onkeydown: (e) => { if (e.key === "Enter") go() }
  }, [h("span.np-eq", { "aria-hidden": "true" }, [h("i"), h("i"), h("i")]), art, h("span.np-text", {}, [title, sub]), btnPlay, btnMute, btnX])
  bus.on("tabs", onTabs)
  bus.on("config", () => { watchSpotify(); paint() })
  watchSpotify()
  // the page's own play / pause shows up here within a few seconds
  setInterval(() => { if (npId && el.classList.contains("is-on") && !document.hidden) fetchMeta() }, 5000)
  return el
}

// Spotify, only while the player can show (slow updates; the Home widget asks for fast ones)
function onSpotify (s) {
  const before = sp
  sp = s
  if (!spotify.live(s)) spSeen = false
  else if (s.status === "playing") {
    spSeen = true
    // something new started: a dismissed card comes back
    if (spDismissed && (s.track?.uri !== spDismissed || before?.status !== "playing")) spDismissed = null
  }
  paint()
}
// only once the user has asked for Spotify (spotify-client.js): no AppleScript, no Automation prompt before that
function watchSpotify () {
  const want = on() && spotify.sidebar()
  if (want && !spOff) spOff = spotify.subscribe(onSpotify)
  else if (!want && spOff) { spOff(); spOff = null; sp = null; spSeen = false }
}
