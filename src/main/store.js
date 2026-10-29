// ───────────────────────────────────────────────────────────────────
//  store.js — JSON state, merged over defaults, atomic-ish saves.
//  API keys are encrypted at rest with Electron safeStorage when the
//  OS keychain is available; otherwise stored plain in a 0600 file.
// ───────────────────────────────────────────────────────────────────
const { app, safeStorage } = require("electron")
const fs = require("node:fs")
const path = require("node:path")

const { profiles } = require("./profiles")

// config.json lives in the active profile's dir; switching profiles re-points it (useDir)
let DATA_DIR = profiles.dir()
let CONFIG_PATH = path.join(DATA_DIR, "config.json")

const DEFAULTS = {
  general: {
    searchEngineId: "duckduckgo",   // see renderer/data/engines.js
    customSearchUrl: "https://duckduckgo.com/?q=%s",
    homeOnNewTab: true,
    restoreTabs: true,
    newTabPosition: "end",          // end | afterCurrent
    defaultZoom: 1,                 // 0.5 .. 2
    easyFiles: true                 // file pickers on pages offer the clipboard + recent downloads
  },
  theme: {
    active: "glass",            // glass | sky | mint | sunset | rose | lavender | sand | mono (light + dark)
                                // nebula | ember | midnight | aurora | carbon | blackline | blackline-noir (dark only)
    mode: "auto",               // auto (follow macOS) | light | dark
    glass: 0.6,                // 0..1 translucency
    blur: 28,                  // px backdrop blur
    accent: "#0a84ff",
    accentCustom: false,       // true = accent overrides the theme's own color
    custom: { hue: "#8e6cff", hue2: "#5ad1ff", accent: "#7a5cff" },   // the Custom theme: tint, second tint, accent
    density: "comfortable",    // comfortable | compact
    vibrancy: true,            // real macOS window glass behind the chrome
    customCss: ""
  },
  perf: {
    sleepEnabled: true,         // discard idle background tabs
    sleepAfterMin: 15,
    fpsCap: 0,                  // 0 = uncapped; else 30 / 60
    blockAutoplay: true,
    backgroundThrottle: true,
    hardwareAccel: true        // needs app restart to take effect
  },
  home: {
    background: { kind: "css", value: "var(--f-ambient)" },
    greeting: "Flux",
    headline: "How can I help you?",
    wallpaper: { kind: "preset", value: "tide" },   // preset | image (userData/wallpaper.*) | color
    dim: 0.15,                  // darkens the wallpaper so widgets stay readable
    widgetStyle: "glass",       // glass | liquid | solid | tinted | clear  (Home Widgets' styles)
    showSearch: true,
    widgets: [                  // grid order; size = small 1×1 | medium 2×1 | large 2×2 | wide 4×1
      { id: "hw_clock", kind: "clock", size: "small" },
      { id: "hw_date", kind: "calendar", size: "small" },
      { id: "hw_weather", kind: "weather", size: "medium" },
      { id: "hw_sites", kind: "sites", size: "medium" },
      { id: "hw_clip", kind: "clipboard", size: "medium" },
      { id: "hw_notes", kind: "notes", size: "small" },
      { id: "hw_battery", kind: "battery", size: "small" }
    ]
  },
  hotTabs: [
    { id: "ht_search", label: "DuckDuckGo", url: "https://duckduckgo.com", icon: null, hotkey: "CmdOrCtrl+1", action: "open" },
    { id: "ht_gh", label: "GitHub", url: "https://github.com", icon: null, hotkey: "CmdOrCtrl+2", action: "open" },
    { id: "ht_yt", label: "YouTube", url: "https://youtube.com", icon: null, hotkey: "CmdOrCtrl+3", action: "open" },
    { id: "ht_ai", label: "AI Checkers x6", icon: null, hotkey: "CmdOrCtrl+4", action: "macro",
      urls: [
        "https://gptzero.me", "https://copyleaks.com/ai-content-detector",
        "https://writer.com/ai-content-detector", "https://contentatscale.ai/ai-content-detector",
        "https://sapling.ai/ai-content-detector", "https://quillbot.com/ai-content-detector"
      ] }
  ],
  sidebar: {
    width: 264,
    widgets: [
      { id: "w_home", type: "nav", label: "Home", target: "home", icon: "home" },
      { id: "w_ai", type: "nav", label: "Flux AI", target: "ai", icon: "spark" },
      { id: "w_library", type: "nav", label: "Library", target: "library", icon: "clock" },
      { id: "w_vision", type: "nav", label: "Vision AI", target: "vision", icon: "eye" },
      { id: "w_companion", type: "nav", label: "Companion", target: "companion", icon: "spark" },
      { id: "w_div1", type: "divider" },
      { id: "w_bruh", type: "button", label: "bruh", onClick: { kind: "toast", value: "bruh" } },
      { id: "w_clock", type: "clock" },
      { id: "w_macro_ai", type: "macro", label: "Open 6 AI checkers", urls: [
        "https://gptzero.me", "https://copyleaks.com/ai-content-detector",
        "https://writer.com/ai-content-detector", "https://contentatscale.ai/ai-content-detector",
        "https://sapling.ai/ai-content-detector", "https://quillbot.com/ai-content-detector"
      ] },
      { id: "w_links", type: "links", label: "Quick links", links: [
        { label: "Localhost 3000", url: "http://localhost:3000" },
        { label: "MDN", url: "https://developer.mozilla.org" }
      ] },
      { id: "w_notes", type: "notes", label: "Scratch", value: "" }
    ]
  },
  audio: {
    enabled: true,
    volume: 0.35,
    pack: "mech",              // mech | soft | off
    events: { click: true, hover: false, tabOpen: true, tabClose: true, keyClick: false }
  },
  modpacks: {
    installed: [],             // [{ id, name, theme, audio, background }]
    active: null
  },
  vision: {
    provider: "anthropic",     // anthropic | openai | gemini
    models: { anthropic: "claude-opus-5-5", openai: "gpt-4o", gemini: "gemini-1.5-flash" },
    captureScope: "page",      // page | screen
    hotkey: "CmdOrCtrl+Shift+Space",
    lastPrompt: "What's on this screen? Give me the key points and any next action."
  },
  companion: {
    projectPath: "",           // defaults to Flux's own folder at runtime
    provider: "anthropic",
    model: "claude-sonnet-5",
    autonomous: false          // false = every write asks for approval
  },
  extensions: { paths: [] },
  window: { width: 1360, height: 900, x: null, y: null },

  // ── v0.4 ─────────────────────────────────────────────────────────
  user: { name: "" },
  layout: {
    style: "dia",               // dia (vertical tabs) | classic (top tabs)
    vtabsCollapsed: false,
    sidebar: "autohide",        // shown | autohide | hidden
    frame: true,                // inset rounded content frame
    frameRadius: 14,
    showHomeHotTabs: true,
    showFullUrl: false,         // omnibox shows host only until focused
    aiPanelWidth: 400
  },
  motion: {
    mode: "full",               // full | reduced | off
    speed: 1,                   // duration multiplier (0.25 .. 3)
    easing: "spring",           // smooth | spring | snappy | gentle | bouncy | linear | physics | custom
    customEasing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    spring: { stiffness: 170, damping: 16 },   // drives the "physics" easing
    tabOpen: "pop",             // pop | grow | slide | fade | none
    tabClose: "shrink",         // shrink | fade | slide | none
    view: "fade-up",            // fade | fade-up | zoom | blur | slide | none
    panel: "slide",             // slide | scale | fade | none
    popover: "scale",           // scale | drop | fade | none
    toast: "rise",              // rise | pop | fade | none
    home: "rise",               // rise | fade | scale | none
    ambient: "slow",            // off | slow | medium | fast
    orb: "float",               // float | pulse | morph | off
    hoverLift: 2,               // px
    pressScale: 0.95,
    shimmer: true,              // specular sweep across glass on hover
    spotlight: true,            // light follows the cursor on glass
    ripple: true,
    loadBar: "glow",            // glow | bar | off
    lens: true                  // SVG refraction on hero glass (Chromium-only)
  },
  ai: {
    provider: "local",          // local (Ollama, free) | claude (API key)
    localModel: "qwen3:8b",
    localUrl: "http://127.0.0.1:11434",
    localCtx: 16384,            // context window for local models
    localKeepAlive: "15m",      // how long a local model stays loaded after use
    model: "claude-opus-5-5",
    effort: "medium",           // low | medium | high | xhigh
    webSearch: true,
    confirmPageActions: true,   // clicks / typing on pages ask first
    autoContext: true,          // send active tab title + url with each message
    showThinking: true,
    enterAction: "smart",       // smart | search | ai  (home + omnibox Enter)
    customInstructions: ""
  },
  privacy: {
    blockTrackers: true,
    httpsOnly: false,
    sendGpc: true,              // Global Privacy Control + DNT headers
    googleSignInFix: true,      // Firefox user agent for accounts.google.com only (main/quirks.js)
    recordHistory: true
  },
  bookmarks: [],                // [{ id, url, title, ts }]
  siteSettings: {},             // host -> { zoom, dark, perms: { media: "allow" | "block" } }
  keywords: [
    { key: "yt", name: "YouTube", url: "https://www.youtube.com/results?search_query=%s" },
    { key: "gh", name: "GitHub", url: "https://github.com/search?q=%s" },
    { key: "w", name: "Wikipedia", url: "https://en.wikipedia.org/w/index.php?search=%s" },
    { key: "r", name: "Reddit", url: "https://www.reddit.com/search/?q=%s" },
    { key: "a", name: "Amazon", url: "https://www.amazon.com/s?k=%s" },
    { key: "maps", name: "Google Maps", url: "https://www.google.com/maps/search/%s" },
    { key: "npm", name: "npm", url: "https://www.npmjs.com/search?q=%s" },
    { key: "mdn", name: "MDN", url: "https://developer.mozilla.org/search?q=%s" },
    { key: "so", name: "Stack Overflow", url: "https://stackoverflow.com/search?q=%s" },
    { key: "img", name: "Image search", url: "https://www.google.com/search?tbm=isch&q=%s" }
  ],
  session: { tabs: [], active: 0 },
  meta: { schema: 5 }
}

// the look from the reference: violet nebula + clear liquid glass
const NEBULA_LOOK = {
  theme: { active: "nebula", accent: "#8b7bff", glass: 0.6, blur: 28 },
  background: { kind: "css", value: "var(--f-ambient)" }
}

// secrets live in their own file so config.json can be shared/inspected safely;
// API keys are the person's, not the profile's, so every profile shares them
const SECRETS_PATH = path.join(profiles.BASE, "secrets.json")

function deepMerge (base, over) {
  if (Array.isArray(base) || Array.isArray(over)) return over ?? base
  if (typeof base !== "object" || base === null) return over ?? base
  const out = { ...base }
  for (const k of Object.keys(over ?? {})) {
    out[k] = k in base ? deepMerge(base[k], over[k]) : over[k]
  }
  return out
}

function readJson (p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"))
  } catch {
    return fallback
  }
}

function writeJson (p, obj, mode) {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true })
    const tmp = p + ".tmp"
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: mode ?? 0o644 })
    fs.renameSync(tmp, p)
    return true
  } catch (e) {
    console.error("[store] write failed", p, e.message)
    return false
  }
}

let cache = {}
let saveTimer = null

function loadConfig () {
  const RAW = readJson(CONFIG_PATH, null)
  // a fresh copy: deepMerge hands arrays through by reference, and several
  // profiles load into one process, so nothing may alias DEFAULTS
  cache = deepMerge(structuredClone(DEFAULTS), RAW ?? {})

  // one-time v0.4 migration: switch to the Nebula look, keeping the old look
  // as an installed modpack so it is one click to go back.  Adds the AI and
  // Library entries to an existing sidebar.
  if (RAW && (RAW.meta?.schema ?? 0) < 4) {
    const t = cache.theme ?? {}
    const prev = {
      id: "previous-look",
      name: "My previous look",
      theme: { active: t.active, accent: t.accent, glass: t.glass, blur: t.blur, customCss: t.customCss ?? "" },
      audio: { pack: cache.audio?.pack, events: cache.audio?.events },
      background: cache.home?.background
    }
    cache.modpacks.installed = [...(cache.modpacks.installed ?? []).filter((p) => p.id !== prev.id), prev]
    cache.modpacks.active = "nebula-glass"
    cache.theme = { ...t, ...NEBULA_LOOK.theme }
    cache.home = { ...cache.home, background: NEBULA_LOOK.background }
    const w = cache.sidebar?.widgets ?? []
    if (!w.some((x) => x.target === "ai")) {
      w.splice(1, 0,
        { id: "w_ai", type: "nav", label: "Flux AI", target: "ai", icon: "spark" },
        { id: "w_library", type: "nav", label: "Library", target: "library", icon: "clock" })
    }
    cache.meta = { schema: 4 }
    writeJson(CONFIG_PATH, cache)
  }

  // one-time v0.6 migration: the light/dark redesign.  The old look is kept
  // as an installed modpack (one click back), then the new default applies.
  if (RAW && (RAW.meta?.schema ?? 0) < 5) {
    const t = cache.theme ?? {}
    const prev = {
      id: "pre-v6-look",
      name: "My look before v0.6",
      theme: { active: t.active, accent: t.accent, accentCustom: t.accentCustom, glass: t.glass, blur: t.blur, customCss: t.customCss ?? "" },
      background: cache.home?.background
    }
    cache.modpacks.installed = [...(cache.modpacks.installed ?? []).filter((p) => p.id !== prev.id), prev]
    cache.modpacks.active = null
    cache.theme = { ...t, active: "glass", mode: "auto", accent: "#0a84ff", accentCustom: false, glass: 0.6, blur: 28 }
    cache.meta = { schema: 5 }
    writeJson(CONFIG_PATH, cache)
  }
}
loadConfig()

const store = {
  all () { return cache },
  get (dotPath) {
    return dotPath.split(".").reduce((o, k) => (o == null ? o : o[k]), cache)
  },
  set (dotPath, value) {
    const keys = dotPath.split(".")
    let node = cache
    while (keys.length > 1) {
      const k = keys.shift()
      node[k] = node[k] ?? {}
      node = node[k]
    }
    node[keys[0]] = value
    this.save()
    return cache
  },
  merge (partial) {
    cache = deepMerge(cache, partial)
    this.save()
    return cache
  },
  save () {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => writeJson(CONFIG_PATH, cache), 60)
  },
  saveNow () { clearTimeout(saveTimer); return writeJson(CONFIG_PATH, cache) },
  // profile switch: flush this profile, then load another's config.json
  useDir (dir) {
    this.saveNow()
    DATA_DIR = dir
    CONFIG_PATH = path.join(dir, "config.json")
    loadConfig()
    return cache
  },

  // ---- secrets ---------------------------------------------------
  getSecret (name) {
    const raw = readJson(SECRETS_PATH, {})
    const entry = raw[name]
    if (!entry) return ""
    if (entry.enc && safeStorage.isEncryptionAvailable()) {
      try { return safeStorage.decryptString(Buffer.from(entry.enc, "base64")) } catch { return "" }
    }
    return entry.plain ?? ""
  },
  setSecret (name, value) {
    const raw = readJson(SECRETS_PATH, {})
    if (!value) { delete raw[name] }
    else if (safeStorage.isEncryptionAvailable()) {
      raw[name] = { enc: safeStorage.encryptString(value).toString("base64") }
    } else {
      raw[name] = { plain: value }
    }
    return writeJson(SECRETS_PATH, raw, 0o600)
  },
  hasSecret (name) { return Boolean(this.getSecret(name)) },

  DEFAULTS,
  paths: { get DATA_DIR () { return DATA_DIR }, get CONFIG_PATH () { return CONFIG_PATH }, SECRETS_PATH }
}

module.exports = { store }
