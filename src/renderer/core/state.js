// ───────────────────────────────────────────────────────────────────
//  state.js — renderer-side mirror of the main config store.  Load
//  once at boot, then get()/set() locally and push through to main.
//  Also applies live theme variables to the document.
// ───────────────────────────────────────────────────────────────────
import { bus } from "./bus.js"
import { themeById } from "../data/themes.js"

let cfg = {}

export const state = {
  async load () {
    cfg = await window.flux.config.all()
    applyTheme()
    window.flux.config.onChange(async (payload) => {
      cfg = await window.flux.config.all()
      const k = payload?.key ?? "*"
      if (k === "*" || k.startsWith("theme") || k.startsWith("home")) applyTheme()
      bus.emit("config", cfg)
    })
    return cfg
  },
  get (path) {
    return path.split(".").reduce((o, k) => (o == null ? o : o[k]), cfg)
  },
  all () { return cfg },
  async set (path, value) {
    // optimistic local update
    const keys = path.split(".")
    let node = cfg
    while (keys.length > 1) { const k = keys.shift(); node[k] = node[k] ?? {}; node = node[k] }
    node[keys[0]] = value
    await window.flux.config.set(path, value)
    if (path.startsWith("theme") || path.startsWith("home")) applyTheme()
    bus.emit("config", cfg)
  },
  async merge (partial) {
    cfg = await window.flux.config.merge(partial)
    applyTheme()
    bus.emit("config", cfg)
  }
}

// Auto follows macOS live; classic themes have one fixed mode
const systemDark = window.matchMedia("(prefers-color-scheme: dark)")
systemDark.addEventListener("change", () => applyTheme())

export function resolvedMode () {
  const t = cfg.theme ?? {}
  const th = themeById(t.active)
  if (th.family === "classic") return th.mode ?? "dark"
  return t.mode === "light" || t.mode === "dark" ? t.mode : systemDark.matches ? "dark" : "light"
}

let lastNative = ""
export function applyTheme () {
  const t = cfg.theme ?? {}
  const body = document.body
  const theme = themeById(t.active)
  body.dataset.theme = theme.id
  body.dataset.family = theme.family
  body.dataset.mode = resolvedMode()
  // native window glass + pages' prefers-color-scheme follow along
  const nativeKey = `${theme.family}|${t.mode}`
  if (nativeKey !== lastNative) { lastNative = nativeKey; window.flux.win.appearance?.() }
  body.dataset.density = t.density ?? "comfortable"
  body.dataset.vibrancy = String(t.vibrancy !== false)
  const r = document.documentElement.style
  if (t.glass != null) r.setProperty("--f-glass", String(t.glass))
  if (t.blur != null) r.setProperty("--f-blur", `${t.blur}px`)
  // a picked accent (color picker, modpack, AI) beats the theme's own;
  // otherwise each theme keeps its signature color
  if (t.accentCustom && t.accent) body.style.setProperty("--f-accent", t.accent)
  else body.style.removeProperty("--f-accent")

  // custom modpack / user CSS injection
  let tag = document.getElementById("flux-custom-css")
  if (!tag) { tag = document.createElement("style"); tag.id = "flux-custom-css"; document.head.append(tag) }
  tag.textContent = t.customCss ?? ""
}
