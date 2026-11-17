// ───────────────────────────────────────────────────────────────────
//  onboarding-steps.js — the six Welcome tour steps.  Each one writes
//  straight through state.set(), so the window behind the sheet
//  changes as you click.  { title, render(ctx), focus?, cta? }
// ───────────────────────────────────────────────────────────────────
import { h, clear } from "../core/dom.js"
import { state } from "../core/state.js"
import { bus } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { THEMES, themeById } from "../data/themes.js"
import { WALL_PRESETS, greetingFor } from "./home.js"
import { sw } from "./settings/kit.js"

const head = (title, sub) => [h("h2.wl-title", { text: title }), sub && h("p.wl-sub", { text: sub })]
const setVars = (el, vars) => { for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v); return el }
const press = (el, on) => { el.classList.toggle("is-on", on); el.setAttribute("aria-pressed", String(on)) }

// ── 1 · Welcome ──────────────────────────────────────────────────
// the comet ring, drawn large: a bright head leading a ring that fades behind it
function cometMark () {
  return h("div.wl-mark", { "aria-hidden": "true" }, [
    h("div.wl-halo"), h("div.wl-ring"), h("div.wl-arm", {}, [h("i.wl-head")])
  ])
}
function welcome () {
  return h("div.wl-hero", {}, [
    cometMark(),
    h("h2.wl-title.wl-title--hero", { text: "Welcome to Comet" }),
    h("p.wl-sub", { text: "A calm, quick browser that stays out of your way. Take a minute to make it yours." }),
    h("p.wl-hint", {}, [h("kbd", { text: "←" }), h("kbd", { text: "→" }), h("span", { text: "to move around ·" }), h("kbd", { text: "esc" }), h("span", { text: "to skip" })])
  ])
}

// ── 2 · Look ─────────────────────────────────────────────────────
const MODES = [
  { v: "auto", label: "Auto", icon: "contrast" },
  { v: "light", label: "Light", icon: "sun" },
  { v: "dark", label: "Dark", icon: "moon" }
]
function look () {
  const theme = () => state.get("theme") ?? {}
  const classic = () => themeById(theme().active).family === "classic"
  const mode = () => (classic() ? themeById(theme().active).mode ?? "dark" : theme().mode ?? "auto")
  const root = h("div.wl-look")

  const modeBtns = MODES.map((m) => h("button.wl-mode", {
    type: "button",
    onclick: async () => {
      // classic themes have one fixed look, so picking a mode moves to Glass (as Settings does)
      if (classic()) await state.set("theme.active", "glass")
      await state.set("theme.mode", m.v)
      paint()
    }
  }, [
    h(`span.wl-mode-pic.wl-mode-pic--${m.v}`, {}, [h("i"), h("b")]),
    h("span.wl-mode-label", {}, [ico(m.icon, 13), h("span", { text: m.label })])
  ]))

  const themes = THEMES.filter((t) => t.family === "modern" && t.id !== "custom")
  const swatches = themes.map((t) => setVars(h("button.wl-theme", {
    type: "button",
    title: t.name,
    "aria-label": `${t.name} theme`,
    onclick: async () => { await state.set("theme.active", t.id); await state.set("theme.accentCustom", false); paint() }
  }, [h("span.wl-theme-sw"), h("span.wl-theme-name", { text: t.name })]), { "--l": t.sw[0], "--d": t.sw[1], "--a": t.sw[2] }))

  function paint () {
    const t = themeById(theme().active)
    setVars(root, { "--l": t.sw[0], "--d": t.sw[1], "--a": t.sw[2] })
    modeBtns.forEach((b, i) => press(b, MODES[i].v === mode()))
    swatches.forEach((b, i) => press(b, themes[i].id === t.id))
  }
  paint()
  root.append(
    ...head("Pick your look", "Auto follows macOS from day to night. Every theme comes in light and dark."),
    h("div.wl-modes", { role: "group", "aria-label": "Appearance" }, modeBtns),
    h("div.wl-label", { text: "Theme" }),
    h("div.wl-themes", { role: "group", "aria-label": "Theme" }, swatches)
  )
  return root
}

// ── 3 · Layout ───────────────────────────────────────────────────
// a tiny window: traffic lights, tabs down the side or across the top, a page
function schematic (v) {
  const tabs = (n) => Array.from({ length: n }, (_, i) => h(`i.wl-sc-tab${i === 1 ? ".is-on" : ""}`))
  const page = h("span.wl-sc-page", {}, [h("i.wl-sc-url"), h("i.wl-sc-body"), h("i.wl-sc-body.is-short")])
  return h(`span.wl-sc.wl-sc--${v}`, { "aria-hidden": "true" }, v === "dia"
    ? [h("span.wl-sc-side", {}, [h("span.wl-sc-lights", {}, [h("i"), h("i"), h("i")]), ...tabs(5)]), page]
    : [h("span.wl-sc-top", {}, [h("span.wl-sc-lights", {}, [h("i"), h("i"), h("i")]), ...tabs(3)]), h("span.wl-sc-main", {}, [h("span.wl-sc-rail"), page])])
}
const LAYOUTS = [
  { v: "dia", name: "Sidebar", tag: "Default", desc: "Vertical tabs on the side. Long titles stay readable." },
  { v: "classic", name: "Top tabs", desc: "A familiar strip of tabs above the page." }
]
function layout () {
  const cur = () => state.get("layout.style") ?? "dia"
  const cards = LAYOUTS.map((o) => h("button.wl-layout", {
    type: "button",
    onclick: async () => { await state.set("layout.style", o.v); paint() }
  }, [
    schematic(o.v),
    h("span.wl-layout-name", {}, [h("span", { text: o.name }), o.tag && h("span.wl-tag", { text: o.tag })]),
    h("span.wl-layout-desc", { text: o.desc })
  ]))
  const paint = () => cards.forEach((c, i) => press(c, LAYOUTS[i].v === cur()))
  paint()
  return h("div", {}, [
    ...head("Where do tabs go?", "Try both. The window behind this sheet switches as you click."),
    h("div.wl-layouts", { role: "group", "aria-label": "Layout" }, cards),
    h("p.wl-note", {}, [h("span", { text: "Hide the sidebar any time with" }), h("kbd", { text: "⌘B" }), h("span", { text: ". More in Settings → Layout." })])
  ])
}

// ── 4 · Make it yours ────────────────────────────────────────────
function personal () {
  const wp = () => state.get("home.wallpaper") ?? { kind: "preset", value: "tide" }
  const greet = h("div.wl-pv-greet")
  const preview = h("div.wl-pv", { "aria-hidden": "true" }, [
    greet,
    h("div.wl-pv-search", {}, [ico("search", 11), h("span", { text: "Search or enter address" })])
  ])
  const paintGreet = (name) => {
    const first = String(name ?? "").trim().split(/\s+/)[0]
    greet.textContent = first ? `${greetingFor()}, ${first}` : greetingFor()
  }
  let timer = 0
  const save = (v) => { clearTimeout(timer); state.set("user.name", v.trim().slice(0, 40)) }
  const input = h("input.field.wl-name", {
    type: "text", value: state.get("user.name") ?? "", placeholder: "Your first name", maxLength: 40,
    autocomplete: "given-name", "aria-label": "Your name",
    oninput: (e) => { const v = e.target.value; paintGreet(v); clearTimeout(timer); timer = setTimeout(() => save(v), 300) },
    onchange: (e) => save(e.target.value)
  })

  const walls = WALL_PRESETS.map((p) => h(`button.wl-wall.wall-${p.id}`, {
    type: "button", title: p.name, "aria-label": `${p.name} wallpaper`,
    onclick: async () => { await state.set("home.wallpaper", { kind: "preset", value: p.id }); paintWall() }
  }, [h("span", { text: p.name })]))
  function paintWall () {
    const w = wp()
    const id = w.kind === "preset" ? w.value : null
    walls.forEach((b, i) => press(b, WALL_PRESETS[i].id === id))
    preview.className = `wl-pv wall-${id ?? "theme"}`
    preview.style.background = w.kind === "color" && typeof w.value === "string" ? w.value : ""
  }
  paintGreet(input.value)
  paintWall()
  return h("div", {}, [
    ...head("Make it yours", "Home greets you by name. Pick a wallpaper for it, or add a photo later."),
    h("div.wl-personal", {}, [
      preview,
      h("div.wl-personal-side", {}, [
        h("label.wl-label", { text: "Your name", htmlFor: "wl-name" }),
        Object.assign(input, { id: "wl-name", spellcheck: false }),
        h("div.wl-label", { text: "Wallpaper" }),
        h("div.wl-walls", { role: "group", "aria-label": "Wallpaper" }, walls)
      ])
    ])
  ])
}

// ── 5 · Bring your stuff ─────────────────────────────────────────
function option (icon, title, desc, ctl) {
  return h("div.wl-opt", {}, [
    h("span.wl-opt-ico", {}, [ico(icon, 17)]),
    h("span.wl-opt-text", {}, [h("span.wl-opt-title", { text: title }), desc]),
    ctl
  ])
}
const listNames = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`)

function importOption (ctx) {
  const desc = h("span.wl-opt-desc", { text: "Looking for other browsers…" })
  const ctl = h("span.wl-opt-ctl")
  window.flux.import.sources().then((list) => {
    const present = (list ?? []).filter((s) => s.present)
    if (!present.length) { desc.textContent = "No other browsers found on this Mac. You can import later in Settings."; return }
    desc.textContent = `Found ${listNames(present.map((s) => s.name))}. Bookmarks, history and passwords stay on this Mac. Import opens when you finish.`
    // the real flow is Settings → Import; the tour just queues it for the end
    ctl.append(sw(ctx.after.has("import"), (on) => {
      if (on) ctx.after.set("import", () => bus.emit("settings:goto", "import"))
      else ctx.after.delete("import")
    }))
  }).catch(() => { desc.textContent = "You can import from another browser later in Settings → Import." })
  return option("download", "Import from another browser", desc, ctl)
}

// "Make default" → macOS asks to confirm, so re-read when the window regains focus
function defaultOption () {
  const desc = h("span.wl-opt-desc", { text: "Links you click in Mail, Messages and other apps open in Comet." })
  const ctl = h("span.wl-opt-ctl")
  const paint = (st) => {
    if (!ctl.isConnected && ctl.childNodes.length) return
    clear(ctl)
    if (!st?.can) desc.textContent = "Move Comet to your Applications folder, then set it in Settings → Search & Tabs."
    else if (st.is) ctl.append(h("span.wl-opt-state.is-ok", {}, [ico("check", 13), h("span", { text: "Default" })]))
    else ctl.append(h("button.btn.wl-opt-btn", { type: "button", text: "Make Default", onclick: async () => {
      paint(await window.flux.defaultBrowser.set())
      window.addEventListener("focus", () => window.flux.defaultBrowser.get().then(paint), { once: true })
    } }))
  }
  window.flux.defaultBrowser.get().then(paint).catch(() => paint(null))
  return option("globe", "Make Comet your default browser", desc, ctl)
}

function bring (ctx) {
  return h("div", {}, [
    ...head("Bring your stuff", "Both are optional, and both live in Settings if you'd rather wait."),
    h("div.wl-opts", {}, [importOption(ctx), defaultOption()])
  ])
}

// ── 6 · Tips ─────────────────────────────────────────────────────
// real accelerators from main/menu.js; gestures from overlays.js / peek.js / easyfiles.js
const TIPS = [
  ["plus", "New tab", "⌘T"],
  ["search", "Address bar", "⌘L"],
  ["bolt", "Command palette", "⌘K"],
  ["sidebar", "Hide the sidebar", "⌘B"],
  ["eye", "Peek at a link", "⇧ Click"],
  ["layers", "Group tabs", "⌥⌘G"],
  ["back", "Swipe back", "Two fingers"],
  ["upload", "Easy Files", "Any upload"]
]
const TIP_DESC = {
  "Command palette": "Every command, tab and bookmark",
  "Peek at a link": "Opens it in a sheet over the page",
  "Group tabs": "Gather tabs in the sidebar",
  "Swipe back": "Sideways on the trackpad",
  "Easy Files": "Upload what you just copied"
}
function tips (ctx) {
  return h("div", {}, [
    ...head("A few good moves", "You're set. These are worth learning first."),
    h("div.wl-tips", {}, TIPS.map(([icon, title, key]) => h("div.wl-tip", {}, [
      h("span.wl-tip-ico", {}, [ico(icon, 15)]),
      h("span.wl-tip-text", {}, [h("span.wl-tip-title", { text: title }), TIP_DESC[title] && h("span.wl-tip-desc", { text: TIP_DESC[title] })]),
      h("kbd", { text: key })
    ]))),
    h("p.wl-note", {}, [h("button.btn.btn--plain.wl-link", { type: "button", text: "See all keyboard shortcuts", onclick: () => ctx.close(() => bus.emit("settings:goto", "shortcuts")) })])
  ])
}

export const STEPS = [
  { title: "Welcome", render: welcome, cta: "Get started" },
  { title: "Look", render: look },
  { title: "Layout", render: layout },
  { title: "Make it yours", render: personal, focus: ".wl-name" },
  { title: "Bring your stuff", render: bring },
  { title: "Tips", render: tips }
]
