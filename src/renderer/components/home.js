// ───────────────────────────────────────────────────────────────────
//  home.js — the New Tab page, Home Widgets-style: your wallpaper, one
//  search field, and a grid of Apple-proportioned widgets on top.
//  "Edit Widgets" jiggles them: drag to reorder, ⊖ to remove, the
//  size chip cycles small / medium / large / wide, + adds from the
//  gallery.  "Wallpaper" picks presets, any photo (HEIC too), your
//  Home Widgets photos, or the current desktop picture.
// ───────────────────────────────────────────────────────────────────
import { h, mount } from "../core/dom.js"
import { state } from "../core/state.js"
import { bus, toast } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { attachOmnibox } from "./omnibox.js"
import { popover, closePopover } from "./popover.js"
import { armFocusAlarm } from "./widgets.js"
import { widgetTile, afterGridMount, markEntering } from "./widgets-grid.js"
import { openGallery } from "./widgets-gallery.js"
import { seg, rng } from "./settings/kit.js"
import { currentProfile, avatar } from "./profiles.js"
import { openLens } from "./lens.js"

export const WALL_PRESETS = [
  { id: "tide", name: "Tide" }, { id: "bloom", name: "Bloom" }, { id: "dusk", name: "Dusk" },
  { id: "meadow", name: "Meadow" }, { id: "sunrise", name: "Sunrise" }, { id: "graphite", name: "Graphite" },
  { id: "theme", name: "Theme" }
]
// Apple's widget rendering modes first (Full Color / Tinted / Clear), then the older materials
export const WIDGET_STYLES = [
  { v: "color", label: "Full Color" }, { v: "tinted", label: "Tinted" }, { v: "clear", label: "Clear" },
  { v: "glass", label: "Frosted" }, { v: "liquid", label: "Liquid" }, { v: "solid", label: "Solid" }
]

let wallData = null          // the userData wallpaper as a data URL (loaded once)
let editing = false
let cleanups = []
let rerenderHome = () => {}

const widgets = () => state.get("home.widgets") ?? []
const saveWidgets = (list) => state.set("home.widgets", list)
const uid = () => `hw_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

function wallLayer () {
  const wp = state.get("home.wallpaper") ?? { kind: "preset", value: "tide" }
  const el = h("div.home-wall")
  if (wp.kind === "image" && wallData) el.style.backgroundImage = `url("${wallData}")`
  else if (wp.kind === "color") el.style.background = wp.value
  else el.classList.add(`wall-${wp.kind === "preset" ? wp.value : "theme"}`)
  return el
}

// ── wallpaper + style picker (also used by Settings → Home) ───────
async function setImage (fn) {
  const r = await fn()
  if (r.ok) { wallData = r.dataUrl; await state.set("home.wallpaper", { kind: "image", value: Date.now() }); rerenderHome() } else if (!r.canceled) toast(r.text)
}

export function wallpaperPicker () {
  const wp = state.get("home.wallpaper") ?? {}
  const presets = h("div.wp-grid", {}, WALL_PRESETS.map((p) => h(`button.wp-swatch.wall-${p.id}${wp.kind === "preset" && wp.value === p.id ? ".is-on" : ""}`, {
    title: p.name,
    onclick: async () => { await state.set("home.wallpaper", { kind: "preset", value: p.id }); bus.emit("settings:rerender"); rerenderHome() }
  }, [h("span", { text: p.name })])))
  const hw = h("div.wp-grid.wp-photos")
  window.flux.wallpaper.homeWidgets().then((list) => {
    if (!list.length) { hw.remove(); return }
    hw.before(h("div.micro.wp-label", { text: "From Home Widgets" }))
    hw.append(...list.map((p) => h("button.wp-swatch.wp-photo", { title: p.name, style: { backgroundImage: `url("${p.thumb}")` }, onclick: () => setImage(() => window.flux.wallpaper.useHomeWidgets(p.name)) })))
  })
  return h("div.wp", {}, [
    h("div.micro.wp-label", { text: "Wallpaper" }),
    presets,
    hw,
    h("div.wp-actions", {}, [
      h("button.btn", { onclick: () => setImage(window.flux.wallpaper.pick) }, [ico("image", 14), h("span", { text: "Choose photo…" })]),
      h("button.btn", { onclick: () => setImage(window.flux.wallpaper.desktop) }, [ico("sidebar", 14), h("span", { text: "Use desktop picture" })])
    ]),
    h("div.micro.wp-label", { text: "Dim" }),
    rng(state.get("home.dim") ?? 0.15, 0, 0.7, 0.01, (v) => `${Math.round(v * 100)}%`, (v) => { state.set("home.dim", v); document.querySelector(".home-dim")?.style.setProperty("opacity", v) }),
    h("div.micro.wp-label", { text: "Widget style" }),
    seg(WIDGET_STYLES, state.get("home.widgetStyle") ?? "color", (v) => state.set("home.widgetStyle", v))
  ])
}

// ── one widget tile (built in widgets-grid.js) ────────────────────
function tile (w) {
  return widgetTile(w, { editing, list: widgets, save: saveWidgets, rerender: () => rerenderHome(), onCleanup: (fn) => cleanups.push(fn) })
}

// "Good morning, Landon" — your name (Settings → Home Screen), by time of
// day.  Never the profile's name: "Good night, Personal" read like a typo.
export function greetingFor (d = new Date()) {
  const hr = d.getHours()
  return hr < 5 ? "Good night" : hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : hr < 21 ? "Good evening" : "Good night"
}
function greeting () {
  const line = h("h1.home-hello-line")
  const sub = h("div.home-hello-sub")
  const paint = () => {
    const d = new Date()
    const name = String(state.get("user.name") ?? "").trim().split(/\s+/)[0]
    line.textContent = name ? `${greetingFor(d)}, ${name}` : greetingFor(d)
    sub.textContent = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
  }
  paint()
  const t = setInterval(paint, 30_000)
  cleanups.push(() => clearInterval(t))
  return h("div.home-hello", {}, [avatar(currentProfile(), 44), h("div.home-hello-text", {}, [line, sub])])
}

function gallery (anchor) {
  openGallery(anchor, { onAdd: (k, size) => { const id = uid(); markEntering(id); saveWidgets([...widgets(), { id, kind: k, size, config: {} }]) } })
}

export function initHome () {
  const el = document.getElementById("home")
  let input = null

  window.flux.wallpaper.get().then((d) => { wallData = d; if (state.get("home.wallpaper")?.kind === "image") render() })

  function render () {
    for (const c of cleanups) { try { c() } catch {} }
    cleanups = []

    const pill = h("div.home-search")
    input = h("input.home-input", { type: "text", spellcheck: false, autocomplete: "off", placeholder: "Search or enter address" })
    const lensBtn = h("button.home-lens", { title: "Search with an image (Google Lens) — or paste / drop one here", "aria-label": "Search with an image", onclick: () => openLens(lensBtn) }, [ico("lens", 18)])
    pill.append(ico("search", 17), input, lensBtn)

    const grid = h(`div.hw-grid${editing ? ".is-editing" : ""}`, { dataset: { style: state.get("home.widgetStyle") ?? "color" } },
      widgets().map((w) => tile(w)))
    if (editing) {
      const add = h("button.hw.hw-add.size-small", { title: "Add a widget", onclick: () => gallery(add) }, [ico("plus", 24), h("span", { text: "Add Widget" })])
      grid.append(add)
    }

    const btnWall = h("button.home-tool", { title: "Wallpaper & widget style", onclick: () => popover(btnWall, wallpaperPicker(), { width: 340, align: "end", className: "pop--wall" }) }, [ico("image", 15), h("span", { text: "Wallpaper" })])
    const btnEdit = h(`button.home-tool${editing ? ".is-on" : ""}`, { title: "Edit widgets", onclick: () => { editing = !editing; render() } }, [ico(editing ? "check" : "widgets", 15), h("span", { text: editing ? "Done" : "Edit Widgets" })])

    const dim = h("div.home-dim")
    dim.style.opacity = state.get("home.dim") ?? 0.15
    mount(el, h(`div.home-wrap${editing ? ".is-editing" : ""}`, {}, [
      wallLayer(),
      dim,
      h("div.home-scroll", { onclick: (e) => { if (editing && e.target.classList.contains("home-scroll")) { editing = false; render() } } }, [
        state.get("home.showGreeting") !== false && greeting(),
        state.get("home.showSearch") !== false && pill,
        grid
      ]),
      h("div.home-tools", {}, [btnWall, btnEdit])
    ]))
    afterGridMount(grid)
    if (state.get("home.showSearch") !== false) attachOmnibox(input, { anchor: pill, place: "home" })
  }
  rerenderHome = () => { if ((window.__fluxView ?? "home") === "home") render() }

  // re-render on layout changes only — typing in a Notes widget must not rebuild the grid
  const sig = () => JSON.stringify([
    (state.get("home.widgets") ?? []).map((w) => [w.id, w.kind, w.size, w.config?.city]),
    state.get("home.wallpaper"), state.get("home.widgetStyle"), state.get("home.showSearch"), state.get("home.showGreeting"),
    state.get("home.clock24"), state.get("home.tempUnit"), state.get("hotTabs")
  ])
  let lastSig = sig()
  bus.on("config", () => {
    const s = sig()
    if (s === lastSig) return
    lastSig = s
    rerenderHome()
  })
  bus.on("view", (v) => {
    if (v === "home") { render(); setTimeout(() => input?.focus(), 60) } else if (cleanups.length) { for (const c of cleanups) { try { c() } catch {} } cleanups = []; editing = false }
  })
  bus.on("home:focus", () => input?.focus())
  bus.on("profiles", () => rerenderHome())
  let alarmSig = ""
  const rearm = () => {
    const sig = JSON.stringify((state.get("home.widgets") ?? []).filter((w) => w.kind === "focus").map((w) => w.config?.endsAt ?? 0))
    if (sig !== alarmSig) { alarmSig = sig; armFocusAlarm() }
  }
  bus.on("config", rearm)
  rearm()
  render()
}
