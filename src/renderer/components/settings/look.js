// ───────────────────────────────────────────────────────────────────
//  settings/look.js — personal look & layout knobs: interface font,
//  Increase Contrast, one-tap glass presets (plus the fine sliders),
//  the Home Screen page (widget size + placement), sidebar side and
//  which buttons sit on the toolbar.  Applied live by core/custom.js
//  and components/toolbar-items.js.
// ───────────────────────────────────────────────────────────────────
import { h } from "../../core/dom.js"
import { state } from "../../core/state.js"
import { bus, toast } from "../../core/bus.js"
import { ico } from "../../core/icons.js"
import { wallpaperPicker } from "../home.js"
import { TOOL_ITEMS, toolOn } from "../toolbar-items.js"
import { group, row, seg, sw, rng, textField, btn } from "./kit.js"
export { catBackup } from "./backup.js"

const rerender = () => bus.emit("settings:rerender")
// extra words a row should be found by in Settings search
const tag = (el, words) => { el.dataset.search = `${el.dataset.search ?? ""} ${words}`; return el }

// ── Appearance → Text & contrast ──────────────────────────────────
const FONT_OPTS = [
  { v: "system", label: "System" },
  { v: "rounded", label: "Rounded" },
  { v: "serif", label: "Serif" },
  { v: "mono", label: "Mono" }
]

export function textGroup (t) {
  const fonts = seg(FONT_OPTS, FONT_OPTS.some((o) => o.v === t.font) ? t.font : "system", (v) => state.set("theme.font", v))
  fonts.classList.add("cu-font-seg")
  // each option is drawn in its own face
  fonts.querySelectorAll("button").forEach((b, i) => { b.dataset.font = FONT_OPTS[i].v })
  return group("Text & contrast", [
    tag(row("Interface font", fonts, "SF Pro, SF Pro Rounded, New York or SF Mono across the sidebar, toolbar, menus and Home. Web pages keep their own fonts."), "typeface text font rounded serif monospace new york"),
    tag(row("Increase contrast", sw(t.contrast === "high", (v) => state.set("theme.contrast", v ? "high" : "standard")), "Stronger text and borders, and less see-through glass. Easier to read over busy wallpapers."), "accessibility readable legible bold borders")
  ])
}

// ── Appearance → Liquid glass (presets + the fine controls) ──────
const GLASS_PRESETS = [
  { id: "clear", name: "Clear", sub: "Most see-through", glass: 0.35, blur: 18, vibrancy: true, prev: { b: "3px", al: 0.16 } },
  { id: "frosted", name: "Frosted", sub: "The default", glass: 0.6, blur: 28, vibrancy: true, prev: { b: "8px", al: 0.42 } },
  { id: "solid", name: "Solid", sub: "No transparency", glass: 1, blur: 0, vibrancy: false, prev: { b: "0px", al: 0.96 } }
]

function currentPreset (t) {
  const g = Number(t.glass ?? 0.6), b = Number(t.blur ?? 28), v = t.vibrancy !== false
  return GLASS_PRESETS.find((p) => Math.abs(p.glass - g) < 0.021 && p.blur === b && p.vibrancy === v)?.id ?? "custom"
}

export function glassGroup (t) {
  const on = currentPreset(t)
  const cards = GLASS_PRESETS.map((p) => {
    const pane = h("span.cu-glass-pane")
    pane.style.setProperty("--b", p.prev.b)
    pane.style.setProperty("--al", String(p.prev.al))
    return h(`button.cu-glass-card${p.id === on ? ".is-on" : ""}`, {
      title: `${p.name}: ${Math.round(p.glass * 100)}% glass, ${p.blur}px blur${p.vibrancy ? ", desktop shows through" : ""}`,
      onclick: async () => {
        await state.merge({ theme: { glass: p.glass, blur: p.blur, vibrancy: p.vibrancy } })
        window.flux.win.vibrancy(p.vibrancy)
        rerender()
      }
    }, [h("span.cu-glass-prev", {}, [pane]), h("span", { text: p.name }), h("span.cu-glass-sub", { text: p.sub })])
  })
  return group("Liquid glass", [
    h("div.set-row", { dataset: { search: "liquid glass preset look clear frosted solid transparency translucency blur reduce transparency" } }, [h("div.cu-glass-grid", {}, cards)]),
    row("macOS window glass", sw(t.vibrancy !== false, (v) => { state.set("theme.vibrancy", v); window.flux.win.vibrancy(v); setTimeout(rerender, 30) }), "Your real desktop shows through the sidebar, blurred — like Apple's own apps."),
    row("Translucency", rng(t.glass ?? 0.6, 0.3, 1, 0.02, (v) => `${Math.round(v * 100)}%`, (v) => state.set("theme.glass", v))),
    row("Backdrop blur", rng(t.blur ?? 28, 0, 60, 1, (v) => `${v}px`, (v) => state.set("theme.blur", v)))
  ], on === "custom" ? "Custom mix. Pick a look above to go back to a preset." : "Pick a look, then fine-tune it with the sliders.")
}

// ── Home Screen (moved here from settings.js, plus size + placement) ──
export function catHome () {
  const hm = state.get("home") ?? {}
  return [
    group("Wallpaper & widgets", [
      h("div.set-row", { dataset: { search: "wallpaper background photo desktop picture home widgets dim style frosted liquid solid tinted clear" } }, [wallpaperPicker()])
    ]),
    group("Widgets", [
      tag(row("Widget size", seg([{ v: "s", label: "Small" }, { v: "m", label: "Medium" }, { v: "l", label: "Large" }], ["s", "m", "l"].includes(hm.widgetSize) ? hm.widgetSize : "m", (v) => state.set("home.widgetSize", v)), "Larger widgets suit a big display; smaller ones fit more on a laptop."), "home widget scale bigger smaller"),
      tag(row("Placement", seg([{ v: "top", label: "Top" }, { v: "center", label: "Center" }, { v: "bottom", label: "Bottom" }], hm.align === "top" ? "top" : hm.align === "bottom" ? "bottom" : "center", (v) => state.set("home.align", v)), "Where the greeting, search field and widgets sit on the page."), "home align position top center bottom"),
      row("Widgets", btn("Reset Widgets…", async () => {
        if (!confirm("Put back the default Home widgets? This replaces your current layout.")) return
        const d = await window.flux.config.defaults()
        state.set("home.widgets", d.home.widgets); toast("Widgets reset")
      }, "btn btn--ghost"), "Add, remove, resize and reorder from Home → Edit Widgets.")
    ]),
    group("Home screen", [
      row("Greeting", sw(hm.showGreeting !== false, (v) => state.set("home.showGreeting", v)), "“Good morning, …” with your name and this profile's picture."),
      row("Search field", sw(hm.showSearch !== false, (v) => state.set("home.showSearch", v))),
      row("Jump Back In", sw(hm.showJumpBack !== false, (v) => state.set("home.showJumpBack", v)), "Pages you were on recently and don't have open, under the search field."),
      row("24-hour clock", sw(hm.clock24 === true, (v) => state.set("home.clock24", v))),
      row("Temperature", seg([{ v: "f", label: "°F" }, { v: "c", label: "°C" }], hm.tempUnit ?? "f", (v) => state.set("home.tempUnit", v))),
      row("Your name", textField(state.get("user.name"), (v) => state.set("user.name", v), { placeholder: "First name" }), "Shown in the Home greeting.")
    ])
  ]
}

// ── Layout → sidebar side + toolbar buttons ──────────────────────
export function sideRow (l) {
  const right = h("span", { style: { display: "inline-flex", transform: "scaleX(-1)" } }, [ico("sidebar", 14)])
  const opts = [{ v: "left", label: "Left" }, { v: "right", label: "Right" }]
  const el = seg(opts, l.vtabsSide === "right" ? "right" : "left", (v) => state.set("layout.vtabsSide", v))
  // a small sidebar glyph on each option (mirrored for Right)
  const [bl, br] = el.querySelectorAll("button")
  bl.prepend(h("span", { style: { display: "inline-flex", marginRight: "5px" } }, [ico("sidebar", 14)]))
  br.prepend(h("span", { style: { display: "inline-flex", marginRight: "5px" } }, [right]))
  return tag(row("Position", el, "Which side of the window your tabs live on. The window buttons stay top-left."), "sidebar side left right tabs position mirror")
}

export function toolbarGroup () {
  return group("Toolbar", TOOL_ITEMS.map((it) => tag(
    row(it.label, [h("span.cu-tool-ico", { "aria-hidden": "true" }, [ico(it.icon, 15)]), sw(toolOn(it.id), (v) => state.set(`layout.toolbar.${it.id}`, v))]),
    "toolbar button customize"
  )), "Buttons on the right of the toolbar. Right-click any of them to come back here.")
}
