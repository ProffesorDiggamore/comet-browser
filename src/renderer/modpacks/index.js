// ───────────────────────────────────────────────────────────────────
//  modpacks/index.js — bundled modpacks + import/export.
//  A modpack is portable JSON:
//    { id, name, theme: { active, accent, glass, blur, customCss },
//      audio: { pack, events, samples? }, background: { kind, value } }
//  "samples" maps event -> data: URL (optional; synth used otherwise).
// ───────────────────────────────────────────────────────────────────
import { state } from "../core/state.js"
import { sfx } from "../audio/sfx.js"
import { bus, toast } from "../core/bus.js"

export const BUNDLED = [
  {
    id: "nebula-glass",
    name: "Nebula Glass",
    theme: { active: "nebula", accent: "#8b7bff", glass: 0.6, blur: 28, customCss: "" },
    audio: { pack: "soft", events: { click: true, hover: false, tabOpen: true, tabClose: true, keyClick: false } },
    background: { kind: "css", value: "var(--f-ambient)" }
  },
  {
    id: "ember-lantern",
    name: "Ember Lantern",
    theme: { active: "ember", accent: "#e8873c", glass: 0.74, blur: 28, customCss: "" },
    audio: { pack: "mech", events: { click: true, hover: false, tabOpen: true, tabClose: true, keyClick: true } },
    background: { kind: "gradient", value: "radial-gradient(1200px 800px at 72% -12%, #4a2a16, #140d0a 62%)" }
  },
  {
    id: "midnight-glass",
    name: "Midnight Glass",
    theme: { active: "midnight", accent: "#6ea8ff", glass: 0.70, blur: 30, customCss: "" },
    audio: { pack: "soft", events: { click: true, hover: true, tabOpen: true, tabClose: true, keyClick: false } },
    background: { kind: "gradient", value: "radial-gradient(1100px 760px at 78% -12%, #1a2c52, #0a0c12 60%)" }
  },
  {
    id: "aurora",
    name: "Aurora",
    theme: { active: "aurora", accent: "#5fe3b3", glass: 0.68, blur: 26, customCss: "" },
    audio: { pack: "soft", events: { click: true, hover: false, tabOpen: true, tabClose: true, keyClick: false } },
    background: { kind: "gradient", value: "radial-gradient(1100px 740px at 80% -10%, #1c3a34, #070b0a 60%)" }
  },
  {
    id: "forged-carbon",
    name: "Forged Carbon",
    theme: { active: "carbon", accent: "#6fd7ff", glass: 0.40, blur: 36, customCss: "" },
    audio: { pack: "mech", events: { click: true, hover: false, tabOpen: true, tabClose: true, keyClick: true } },
    background: { kind: "css", value: "conic-gradient(from 210deg at 70% 10%, #22262a, #34393e 14%, #17191c 32%, #3a3f44 50%, #17191c 68%, #2b3035 86%, #22262a 100%)" }
  },
  {
    id: "blackline",
    name: "Blackline",
    theme: { active: "blackline", accent: "#e03416", glass: 1, blur: 0, customCss: "" },
    audio: { pack: "mech", events: { click: true, hover: false, tabOpen: true, tabClose: true, keyClick: true } },
    background: { kind: "css", value: "var(--f-ambient)" }
  },
  {
    id: "blackline-noir",
    name: "Blackline Noir",
    theme: { active: "blackline-noir", accent: "#e03416", glass: 1, blur: 0, customCss: "" },
    audio: { pack: "mech", events: { click: true, hover: false, tabOpen: true, tabClose: true, keyClick: true } },
    background: { kind: "css", value: "var(--f-ambient)" }
  }
]

export function allPacks () {
  const installed = state.get("modpacks.installed") ?? []
  const map = new Map(BUNDLED.map((p) => [p.id, p]))
  for (const p of installed) map.set(p.id, p)
  return [...map.values()]
}

export async function applyPack (id) {
  const pack = allPacks().find((p) => p.id === id)
  if (!pack) return toast("Modpack not found")
  await state.merge({
    theme: {
      active: pack.theme.active ?? "ember",
      accent: pack.theme.accent,
      accentCustom: !!pack.theme.accent,
      glass: pack.theme.glass,
      blur: pack.theme.blur,
      customCss: pack.theme.customCss ?? ""
    },
    home: { background: pack.background ?? state.get("home.background") },
    audio: { pack: pack.audio?.pack ?? "mech", events: pack.audio?.events ?? state.get("audio.events") },
    modpacks: { active: id }
  })
  await sfx.setSamples(pack.audio?.samples ?? {})
  bus.emit("view", window.__fluxView ?? "home")
  toast(`Modpack: ${pack.name}`)
}

export async function installPack (json) {
  if (!json?.id || !json?.name) return toast("Invalid modpack JSON")
  const installed = (state.get("modpacks.installed") ?? []).filter((p) => p.id !== json.id)
  installed.push(json)
  await state.set("modpacks.installed", installed)
  toast(`Installed "${json.name}"`)
}

export function exportCurrent () {
  const t = state.get("theme") ?? {}
  return {
    id: `custom-${Date.now().toString(36)}`,
    name: "My Flux Pack",
    theme: { active: t.active, accent: t.accent, glass: t.glass, blur: t.blur, customCss: t.customCss ?? "" },
    audio: { pack: state.get("audio.pack"), events: state.get("audio.events") },
    background: state.get("home.background")
  }
}
