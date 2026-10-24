// ───────────────────────────────────────────────────────────────────
//  themes.js — the theme catalog.  "modern" themes have light + dark
//  versions (styles/themes/modern.css); "classic" ones have one fixed
//  mode (most are dark; Blackline is light paper).
//  sw = swatch colors for the picker [light bg, dark bg, accent].
// ───────────────────────────────────────────────────────────────────
export const THEMES = [
  { id: "glass", name: "Glass", family: "modern", sw: ["#eceef2", "#1d1e22", "#0a84ff"] },
  { id: "sky", name: "Sky", family: "modern", sw: ["#e4ecfa", "#1a2130", "#0a7aff"] },
  { id: "mint", name: "Mint", family: "modern", sw: ["#e4f2ec", "#192620", "#1fae6a"] },
  { id: "sunset", name: "Sunset", family: "modern", sw: ["#f7e9e2", "#2a1e1a", "#f2662f"] },
  { id: "rose", name: "Rose", family: "modern", sw: ["#f6e6ed", "#2a1a21", "#f0407a"] },
  { id: "lavender", name: "Lavender", family: "modern", sw: ["#ebe7f8", "#211c30", "#7a5cff"] },
  { id: "sand", name: "Sand", family: "modern", sw: ["#f1ece4", "#26221c", "#b8803a"] },
  { id: "mono", name: "Mono", family: "modern", sw: ["#ececef", "#1c1c1f", "#636366"] },
  // your own three colors (theme.custom), light + dark like the rest
  { id: "custom", name: "Custom", family: "modern", sw: ["#ebe7f8", "#211c30", "#7a5cff"] },
  { id: "nebula", name: "Nebula", family: "classic", sw: ["#0b0a18", "#0b0a18", "#8b7bff"] },
  { id: "ember", name: "Ember", family: "classic", sw: ["#1a0f0a", "#1a0f0a", "#e8873c"] },
  { id: "midnight", name: "Midnight", family: "classic", sw: ["#0a0d16", "#0a0d16", "#6ea8ff"] },
  { id: "aurora", name: "Aurora", family: "classic", sw: ["#070b0a", "#070b0a", "#5fe3b3"] },
  { id: "carbon", name: "Carbon", family: "classic", sw: ["#111", "#111", "#8fd4ff"] },
  { id: "blackline", name: "Blackline", family: "classic", mode: "light", sw: ["#f2f0e9", "#f2f0e9", "#e03416"] },
  { id: "blackline-noir", name: "Noir", family: "classic", sw: ["#000", "#000", "#e03416"] }
]
export const themeById = (id) => THEMES.find((t) => t.id === id) ?? THEMES[0]
