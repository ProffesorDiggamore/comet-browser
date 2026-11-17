// ───────────────────────────────────────────────────────────────────
//  widgets/spotify.js — the Home "Spotify" widget, after Apple's Music
//  widget.  Small: the artwork fills the card, title + artist over a
//  soft gradient, play / pause.  Medium: artwork + track, a scrubbable
//  progress bar, transport + shuffle / repeat.  Large: medium + volume
//  and quick actions (Open in Spotify, Search Spotify).  The card is
//  tinted from the artwork's own colour.  States: not installed, not
//  running, permission needed, nothing playing.
// ───────────────────────────────────────────────────────────────────
import { h } from "../../core/dom.js"
import { ico } from "../../core/icons.js"
import * as T from "../../core/tabs.js"
import { spotify, fmtTime } from "./spotify-client.js"

const NS = "http://www.w3.org/2000/svg"
// filled transport glyphs (SF Symbols' play.fill / pause.fill / forward.fill)
const GLYPH = {
  play: ["M7.5 4.6v14.8a1 1 0 0 0 1.52.85l12-7.4a1 1 0 0 0 0-1.7l-12-7.4A1 1 0 0 0 7.5 4.6z", true],
  pause: ["M7 4.5h2.6a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z M14.4 4.5H17a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-2.6a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z", true],
  next: ["M2.5 6.6v10.8a.8.8 0 0 0 1.24.67L11.5 13v4.4a.8.8 0 0 0 1.24.67l8.3-5.4a.8.8 0 0 0 0-1.34l-8.3-5.4a.8.8 0 0 0-1.24.67V11L3.74 5.93a.8.8 0 0 0-1.24.67z", true],
  shuffle: ["M16 3h5v5 M4 20L21 3 M21 16v5h-5 M15 15l6 6 M4 4l5 5"],
  repeat: ["M17 1l4 4-4 4 M3 11V9a4 4 0 0 1 4-4h14 M7 23l-4-4 4-4 M21 13v2a4 4 0 0 1-4 4H3"],
  volLow: ["M11 5L6 9H2v6h4l5 4V5z M15.5 8.5a5 5 0 0 1 0 7"],
  volHigh: ["M11 5L6 9H2v6h4l5 4V5z M15.5 8.5a5 5 0 0 1 0 7 M19 5a10 10 0 0 1 0 14"]
}
export function glyph (name, size) {
  const [d, filled] = GLYPH[name]
  const svg = document.createElementNS(NS, "svg")
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: size, height: size, "aria-hidden": "true" })) svg.setAttribute(k, v)
  const p = document.createElementNS(NS, "path")
  p.setAttribute("d", d)
  if (filled) p.setAttribute("fill", "currentColor")
  else for (const [k, v] of Object.entries({ fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" })) p.setAttribute(k, v)
  svg.append(p)
  if (name === "next") svg.classList.add("sp-g-next")
  return svg
}
// the Spotify mark, for the corner (like an app's glyph on its widget)
export function spotifyMark (size = 16) {
  const svg = document.createElementNS(NS, "svg")
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", width: size, height: size, "aria-hidden": "true", class: "sp-mark" })) svg.setAttribute(k, v)
  const c = document.createElementNS(NS, "circle")
  for (const [k, v] of Object.entries({ cx: 12, cy: 12, r: 12, class: "sp-mark-disc" })) c.setAttribute(k, v)
  svg.append(c)
  for (const [d, w] of [["M6.1 9.2c3.9-1.15 8.4-.85 11.9 1.15", 2], ["M6.8 12.5c3.2-.9 6.9-.6 9.8 1", 1.7], ["M7.4 15.6c2.6-.65 5.4-.45 7.7.85", 1.4]]) {
    const p = document.createElementNS(NS, "path")
    for (const [k, v] of Object.entries({ d, fill: "none", "stroke-width": w, "stroke-linecap": "round", class: "sp-mark-arc" })) p.setAttribute(k, v)
    svg.append(p)
  }
  return svg
}

// ── a slider you drag 1:1 (pointer capture), committed on release ──
function slider ({ cls, label, step = 5, onPreview, onCommit }) {
  const fill = h("span.sp-bar-fill")
  const knob = h("span.sp-bar-knob")
  const el = h(`div.sp-bar.${cls}`, { role: "slider", tabindex: 0, "aria-label": label }, [h("span.sp-bar-track", {}, [fill]), knob])
  let max = 1, val = 0, drag = false, keyT = null
  const paint = (v) => {
    const f = max > 0 ? Math.min(1, Math.max(0, v / max)) : 0
    fill.style.transform = `scaleX(${f})`
    knob.style.left = `${f * 100}%`
    el.setAttribute("aria-valuenow", Math.round(v))
  }
  const at = (e) => { const r = el.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * max }
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return
    e.stopPropagation()
    el.setPointerCapture(e.pointerId)
    drag = true; el.classList.add("is-drag")
    val = at(e); paint(val); onPreview?.(val)
  })
  el.addEventListener("pointermove", (e) => { if (!drag) return; val = at(e); paint(val); onPreview?.(val) })
  const end = (commit) => () => {
    if (!drag) return
    drag = false; el.classList.remove("is-drag")
    if (commit) onCommit(val); else onPreview?.(null)
  }
  el.addEventListener("pointerup", end(true))
  el.addEventListener("pointercancel", end(false))
  el.addEventListener("click", (e) => e.stopPropagation())
  el.addEventListener("keydown", (e) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? step : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -step : 0
    if (!d) return
    e.preventDefault()
    val = Math.min(max, Math.max(0, val + d)); paint(val); onPreview?.(val)
    clearTimeout(keyT); keyT = setTimeout(() => onCommit(val), 280)
  })
  return {
    el,
    set (v, m) { max = m; el.setAttribute("aria-valuemax", Math.round(m)); if (!drag) { val = v; paint(v) } }
  }
}

// ── colour: the artwork's hue, as a card white text reads on ──────
const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
function hslRgb (h, s, l) {
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0) * 255, f(8) * 255, f(4) * 255]
}
function cardTint ([hue, sat], light) {
  const s = Math.min(0.62, Math.max(sat < 0.08 ? 0 : 0.28, sat))
  let l = light ? 0.44 : 0.27
  // darken until white text clears 4.5:1 against the lighter (top) stop
  while (l > 0.12 && (1.05 / (lum(...hslRgb(hue, s, l + 0.05)) + 0.05)) < 4.6) l -= 0.02
  const css = (dl) => `hsl(${hue.toFixed(0)} ${(s * 100).toFixed(0)}% ${((l + dl) * 100).toFixed(1)}%)`
  return { top: css(0.05), bot: css(-0.05) }
}
const GREEN = [141, 0.35]   // Spotify green (#1DB954), quietened

// ── the widget ────────────────────────────────────────────────────
export function spotifyWidget (body, w) {
  const size = w.size === "large" ? "large" : w.size === "medium" ? "medium" : "small"
  const card = body.parentElement
  const root = h(`div.sp.sp-${size}`)
  body.append(root)
  card?.classList.add("sp-card")
  const layer = h("div.sp-layer", { "aria-hidden": "true" })   // small: artwork filling the card
  if (size === "small") card?.prepend(layer)

  let mode = null       // "track" | a state name
  let view = null       // the built view's handles
  let artUrl = null
  let tick = null
  let preview = null    // scrub position while dragging

  const cmd = (name, arg) => spotify.command(name, arg)
  const openApp = () => cmd("open")
  const btn = (cls, label, child, run) => h(`button.sp-btn.${cls}`, { title: label, "aria-label": label, onclick: (e) => { e.stopPropagation(); run() } }, [child])

  function buildTrack () {
    const art = h("div.sp-art", { title: "Open in Spotify", onclick: openApp })
    const title = h("div.sp-title")
    const artist = h("div.sp-artist")
    const album = size === "small" ? null : h("div.sp-album")
    const play = btn("sp-play", "Play", glyph("play", size === "large" ? 26 : size === "medium" ? 20 : 16), () => {
      // optimistic: the button answers now, Spotify catches up
      const s = spotify.state
      if (s?.track) { s.position = spotify.position(s); s.at = Date.now(); s.status = s.status === "playing" ? "paused" : "playing"; paint(s) }
      cmd("toggle")
    })
    const v = { art, title, artist, album, play }
    if (size === "small") {
      root.append(
        h("div.sp-top", {}, [spotifyMark(18)]),
        h("div.sp-foot", {}, [h("div.sp-meta", {}, [title, artist]), play])
      )
      root.onclick = openApp
      card?.classList.add("sp-tap")
      return v
    }
    v.elapsed = h("span.sp-time")
    v.remain = h("span.sp-time")
    v.bar = slider({
      cls: "sp-prog", label: "Playback position",
      onPreview: (x) => { preview = x; paintTime() },
      onCommit: (x) => {
        preview = null
        const s = spotify.state
        if (s?.track) { s.position = x; s.at = Date.now(); paint(s) }
        cmd("seek", x)
      }
    })
    v.shuffle = btn("sp-tog", "Shuffle", glyph("shuffle", 14), () => cmd("shuffle", !spotify.state?.shuffle))
    v.repeat = btn("sp-tog", "Repeat", glyph("repeat", 14), () => cmd("repeat", !spotify.state?.repeat))
    const prev = btn("sp-skip.sp-prev", "Previous", glyph("next", size === "large" ? 22 : 17), () => cmd("previous"))
    const next = btn("sp-skip", "Next", glyph("next", size === "large" ? 22 : 17), () => cmd("next"))
    const meta = h("div.sp-meta", {}, [
      size === "large" && h("div.sp-kicker", {}, [spotifyMark(13), h("span", { text: "Now Playing" })]),
      title, artist, album
    ])
    const prog = h("div.sp-progress", {}, [v.bar.el, h("div.sp-times", {}, [v.elapsed, v.remain])])
    const ctl = h("div.sp-ctl", {}, [v.shuffle, prev, play, next, v.repeat])
    if (size === "medium") {
      root.append(art, h("div.sp-col", {}, [h("div.sp-mark-corner", {}, [spotifyMark(16)]), meta, prog, ctl]))
      return v
    }
    v.vol = slider({ cls: "sp-vol", label: "Volume", step: 5, onCommit: (x) => { const s = spotify.state; if (s) s.volume = Math.round(x); cmd("volume", Math.round(x)) } })
    root.append(
      h("div.sp-head", {}, [art, meta]),
      prog, ctl,
      h("div.sp-volrow", {}, [h("span.sp-vico", {}, [glyph("volLow", 14)]), v.vol.el, h("span.sp-vico", {}, [glyph("volHigh", 14)])]),
      h("div.sp-actions", {}, [
        h("button.sp-pill.sp-open", { onclick: (e) => { e.stopPropagation(); openApp() } }, [spotifyMark(14), h("span", { text: "Open in Spotify" })]),
        searchField()
      ])
    )
    return v
  }

  function searchField () {
    const input = h("input.sp-search-in", { type: "search", placeholder: "Search Spotify", spellcheck: false, "aria-label": "Search Spotify" })
    input.addEventListener("keydown", (e) => {
      e.stopPropagation()
      if (e.key === "Enter" && input.value.trim()) { cmd("search", input.value.trim()); input.value = ""; input.blur() }
      if (e.key === "Escape") input.blur()
    })
    return h("label.sp-search", { onclick: (e) => e.stopPropagation() }, [ico("search", 13), input])
  }

  const COPY = {
    notInstalled: ["Spotify isn't installed", "Get the Spotify app for your Mac to play music here.", "Get Spotify", () => T.newTab("https://www.spotify.com/download/")],
    notRunning: ["Spotify isn't open", "Open it to see what's playing and control it from here.", "Open Spotify", openApp],
    denied: ["Allow Comet to control Spotify", "System Settings → Privacy & Security → Automation → Comet → turn on Spotify.", "Open Settings", () => cmd("openSettings")],
    stopped: ["Nothing playing", "Pick something in Spotify and it shows up here.", "Open Spotify", openApp],
    error: ["Spotify didn't answer", "It may be busy. Comet will keep trying.", "Open Spotify", openApp],
    loading: ["Spotify", "", null, null]
  }
  function buildEmpty (st) {
    const [t, sub, label, run] = COPY[st] ?? COPY.error
    root.append(h("div.sp-empty", {}, [
      spotifyMark(size === "small" ? 26 : 30),
      h("div.sp-e-title", { text: size === "small" && st === "denied" ? "Allow access to Spotify" : t }),
      size !== "small" && sub && h("div.sp-e-sub", { text: sub }),
      label && h("button.sp-pill", { onclick: (e) => { e.stopPropagation(); run() } }, [h("span", { text: label })]),
      size === "large" && st !== "notInstalled" && st !== "loading" && searchField()
    ]))
    return {}
  }

  function setArt (url) {
    if (url === artUrl) return
    artUrl = url
    spotify.art(url).then(async (data) => {
      if (url !== artUrl) return
      const host = size === "small" ? layer : view?.art
      if (host) {
        const img = h("img.sp-img", { src: data || "", alt: "", draggable: false })
        img.addEventListener("load", () => {
          img.classList.add("is-in")
          setTimeout(() => { for (const o of host.querySelectorAll(".sp-img")) if (o !== img) o.remove() }, 320)
        }, { once: true })
        if (!data) img.remove(); else host.append(img)
      }
      const hs = (await spotify.tint(data)) ?? GREEN
      if (url !== artUrl || !card) return
      const d = cardTint(hs, false), l = cardTint(hs, true)
      card.style.setProperty("--sp-d-top", d.top); card.style.setProperty("--sp-d-bot", d.bot)
      card.style.setProperty("--sp-l-top", l.top); card.style.setProperty("--sp-l-bot", l.bot)
    })
  }

  function paintTime () {
    const s = spotify.state
    if (!view?.bar || !s?.track) return
    const dur = s.track.duration || 0
    const p = preview ?? spotify.position(s)
    if (preview == null) view.bar.set(p, dur)
    const a = fmtTime(p), r = `-${fmtTime(dur - p)}`
    if (view.elapsed.textContent !== a) view.elapsed.textContent = a
    if (view.remain.textContent !== r) view.remain.textContent = r
  }

  function paint (s) {
    const want = !s ? "loading" : s.track && spotify.live(s) ? "track" : (s.status === "playing" || s.status === "paused") ? "stopped" : s.status
    if (want !== mode) {
      mode = want
      root.replaceChildren(); root.onclick = null
      card?.classList.remove("sp-tap")
      artUrl = null
      layer.replaceChildren()
      card?.classList.toggle("sp-has-track", want === "track")
      view = want === "track" ? buildTrack() : buildEmpty(want)
    }
    if (mode !== "track") { clearInterval(tick); tick = null; return }
    const t = s.track
    const set = (el, v) => { if (el && el.textContent !== v) { el.textContent = v; el.title = v } }
    set(view.title, t.title); set(view.artist, t.artist); set(view.album, t.album)
    const playing = s.status === "playing"
    if (view.play.dataset.on !== String(playing)) {
      view.play.dataset.on = String(playing)
      view.play.replaceChildren(glyph(playing ? "pause" : "play", size === "large" ? 26 : size === "medium" ? 20 : 16))
      view.play.title = view.play.ariaLabel = playing ? "Pause" : "Play"
    }
    root.classList.toggle("is-playing", playing)
    view.shuffle?.classList.toggle("is-on", !!s.shuffle)
    view.repeat?.classList.toggle("is-on", !!s.repeat)
    view.shuffle?.setAttribute("aria-pressed", String(!!s.shuffle))
    view.repeat?.setAttribute("aria-pressed", String(!!s.repeat))
    view.vol?.set(s.volume ?? 0, 100)
    setArt(t.art)
    paintTime()
    if (playing && view.bar && !tick) tick = setInterval(paintTime, 250)
    if (!playing && tick) { clearInterval(tick); tick = null }
  }

  // the "+ Add Widget" gallery shows a sample until Spotify is opted in: browsing it never asks macOS for access
  if (String(w.id).startsWith("preview_") && !spotify.enabled()) {
    paint({ status: "paused", track: { title: "Song Title", artist: "Artist", album: "Album", art: "", duration: 200, uri: "" }, position: 64, at: Date.now(), volume: 60 })
    return () => { clearInterval(tick); layer.remove(); card?.classList.remove("sp-card", "sp-tap", "sp-has-track") }
  }
  paint(spotify.state)
  const off = spotify.subscribe(paint, { fast: true })
  return () => {
    off(); clearInterval(tick)
    layer.remove()
    card?.classList.remove("sp-card", "sp-tap", "sp-has-track")
  }
}
