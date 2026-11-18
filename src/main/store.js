// ───────────────────────────────────────────────────────────────────
//  store.js — JSON state, merged over defaults, atomic-ish saves.
//  API keys are encrypted at rest with Electron safeStorage when the
//  OS keychain is available; otherwise stored plain in a 0600 file.
// ───────────────────────────────────────────────────────────────────
const { app, safeStorage } = require("electron")
const fs = require("node:fs")
const path = require("node:path")

const { profiles } = require("./profiles")

// one store per profile: createStore(dir) reads and writes <dir>/config.json.
// Windows of different profiles each talk to their own (main/contexts.js).

const DEFAULTS = {
  general: {
    searchEngineId: "duckduckgo",   // see renderer/data/engines.js
    customSearchUrl: "https://duckduckgo.com/?q=%s",
    searchSuggestions: true,        // live predictions from the search engine as you type (main/suggest.js)
    homeOnNewTab: true,
    restoreTabs: true,
    newTabPosition: "end",          // end | afterCurrent
    defaultZoom: 1,                 // 0.5 .. 2
    easyFiles: true,                // file pickers on pages offer the clipboard + recent downloads
    discardBlankTabs: true,         // an untouched New Tab you leave closes itself
    welcomeDone: false              // first-run Welcome tour seen (also kept in the UI's localStorage, so it is once per install)
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
    style: "none",             // live backdrop on any theme: none | topo | dots | waves | constellation | stars
    styleStrength: 1,          // line / dot opacity multiplier
    styleFps: 20,              // frames per second (Settings → Appearance → Style → Frame rate)
    styleLive: true,           // false = one still frame
    font: "system",            // interface font: system | rounded | serif | mono
    contrast: "standard",      // standard | high (Increase Contrast: firmer text, borders, glass)
    customCss: ""
  },
  perf: {
    sleepEnabled: true,         // discard idle background tabs
    sleepAfterMin: 15,
    batterySaver: "auto",       // auto (on battery) | always | off
    fpsCap: 0,                  // 0 = uncapped; else 30 / 60
    blockAutoplay: true,
    backgroundThrottle: true,
    hardwareAccel: true        // needs app restart to take effect
  },
  home: {
    background: { kind: "css", value: "var(--f-ambient)" },
    greeting: "Comet",
    headline: "How can I help you?",
    wallpaper: { kind: "preset", value: "tide" },   // preset | image (userData/wallpaper.*) | color
    dim: 0.15,                  // darkens the wallpaper so widgets stay readable
    widgetStyle: "color",       // color (Apple Full Color) | tinted | clear | glass | liquid | solid
    widgetSize: "m",            // s | m | l  (widget grid unit 132 / 156 / 184px)
    align: "center",            // top | center | bottom  (where the Home cluster sits)
    showSearch: true,
    showGreeting: true,         // "Good morning, <profile>" above the search field
    showJumpBack: true,         // "Jump Back In": recent pages you don't have open, under the search field
    hiddenRecent: [],           // urls removed from Jump Back In
    widgets: [                  // grid order; size = small 1×1 | medium 2×1 | large 2×2 | wide 4×1
      { id: "hw_weather", kind: "weather", size: "medium" },
      { id: "hw_reading", kind: "reading", size: "medium" },
      { id: "hw_date", kind: "calendar", size: "small" },
      { id: "hw_downloads", kind: "downloads", size: "small" },
      { id: "hw_news", kind: "headlines", size: "medium", config: { feed: "verge" } },
      { id: "hw_sites", kind: "sites", size: "medium" }
    ]
  },
  readingList: [],              // Save for Later (⇧⌘D): { url, title, host, addedAt, read }
  hotTabs: [                    // no default hotkeys: ⌘1–⌘9 select tabs (menu.js) unless a Hot Tab claims one
    { id: "ht_search", label: "DuckDuckGo", url: "https://duckduckgo.com", icon: null, hotkey: "", action: "open" },
    { id: "ht_gh", label: "GitHub", url: "https://github.com", icon: null, hotkey: "", action: "open" },
    { id: "ht_yt", label: "YouTube", url: "https://youtube.com", icon: null, hotkey: "", action: "open" }
  ],
  sidebar: {
    width: 264,
    widgets: [
      { id: "w_home", type: "nav", label: "Home", target: "home", icon: "home" },
      { id: "w_library", type: "nav", label: "Library", target: "library", icon: "clock" },
      { id: "w_ai", type: "nav", label: "Comet AI", target: "ai", icon: "spark" },
      { id: "w_div1", type: "divider" },
      { id: "w_clock", type: "clock" },
      { id: "w_links", type: "links", label: "Quick links", links: [
        { label: "Wikipedia", url: "https://www.wikipedia.org" },
        { label: "YouTube", url: "https://www.youtube.com" }
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
    bookmarksBar: true,         // the row of bookmarks under the top bar (⇧⌘B)
    aiPanelWidth: 400,
    // ── v0.9: the Dia-style sidebar + page card, tunable ──
    vtabsWidth: 240,            // sidebar width (drag its edge; 190–420)
    cardRadius: 12,             // page card corner radius
    cardGap: 8,                 // space around the page card
    tabStyle: "comfortable",    // comfortable | compact tab rows
    tabThumbs: true,            // live preview on the active tab's row
    nowPlaying: true,           // sidebar player for the tab that's playing
    peek: true,                 // ⇧-click a link opens it in Peek
    vtabsSide: "left",          // left | right — which side the tab sidebar sits on
    toolbar: {                  // buttons on the right of the toolbar (components/toolbar-items.js)
      reader: true, bookmark: true, home: false, split: false, overview: false,
      history: false, downloads: false, screenshot: false, pip: false, share: false
    }
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
    googleSignInFix: true,      // Comet's real user agent for accounts.google.com only (main/quirks.js)
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
  meta: { schema: 9 }
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

function migrate (CONFIG_PATH, RAW, cache) {
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
        { id: "w_ai", type: "nav", label: "Comet AI", target: "ai", icon: "spark" },
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
  // one-time v0.8 migration: Flux became Comet.  Labels saved under the old
  // name (the default greeting, the sidebar's AI shortcut) follow it; anything
  // the user worded themselves is left alone.
  if (RAW && (RAW.meta?.schema ?? 0) < 6) {
    if (cache.home?.greeting === "Flux") cache.home.greeting = "Comet"
    const relabel = (list) => { for (const w of Array.isArray(list) ? list : []) if (w?.label === "Flux AI") w.label = "Comet AI" }
    relabel(cache.sidebar?.widgets); relabel(cache.sidebar?.items)
    cache.meta = { schema: 6 }
    writeJson(CONFIG_PATH, cache)
  }
  // one-time v0.9 migration: the default Hot Tabs gave up ⌘1–⌘4 so those keys
  // select tabs.  Only the untouched defaults lose them; a hotkey the user
  // picked themselves is kept.
  if (RAW && (RAW.meta?.schema ?? 0) < 7) {
    const OLD = { ht_search: "CmdOrCtrl+1", ht_gh: "CmdOrCtrl+2", ht_yt: "CmdOrCtrl+3", ht_ai: "CmdOrCtrl+4" }
    for (const t of Array.isArray(cache.hotTabs) ? cache.hotTabs : []) if (t && OLD[t.id] && t.hotkey === OLD[t.id]) t.hotkey = ""
    cache.meta = { schema: 7 }
    writeJson(CONFIG_PATH, cache)
  }
  // one-time v1.x migration: Home widgets became Apple-style, with "Full
  // Color" as the default look.  Only people still on the old default
  // (Frosted) move to it; a material someone picked themselves is kept.
  if (RAW && (RAW.meta?.schema ?? 0) < 8) {
    const was = RAW.home?.widgetStyle
    if (cache.home && (was === undefined || was === "glass")) cache.home.widgetStyle = "color"
    cache.meta = { schema: 8 }
    writeJson(CONFIG_PATH, cache)
  }
  // one-time v1.2 migration: Home gets the useful widgets.  Reading List and
  // Headlines join the end of an existing grid (Edit Widgets removes them).
  if (RAW && (RAW.meta?.schema ?? 0) < 9) {
    const list = Array.isArray(cache.home?.widgets) ? cache.home.widgets : null
    if (list) {
      if (!list.some((w) => w?.kind === "reading")) list.push({ id: "hw_reading", kind: "reading", size: "medium" })
      if (!list.some((w) => w?.kind === "headlines")) list.push({ id: "hw_news", kind: "headlines", size: "medium", config: { feed: "verge" } })
    }
    cache.meta = { schema: 9 }
    writeJson(CONFIG_PATH, cache)
  }
  return cache
}

// app-wide settings that can't be per profile (they apply to the whole
// process): hardware acceleration is decided once, before any window exists
const APP_PREFS_PATH = path.join(profiles.BASE, "app-prefs.json")
const appPrefs = {
  get (key) { return readJson(APP_PREFS_PATH, {})[key] },
  set (key, value) { const raw = readJson(APP_PREFS_PATH, {}); raw[key] = value; return writeJson(APP_PREFS_PATH, raw) }
}

// ---- secrets: API keys are the person's, shared by every profile -----
const secrets = {
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
  hasSecret (name) { return Boolean(this.getSecret(name)) }
}

function createStore (dir) {
  const CONFIG_PATH = path.join(dir, "config.json")
  let saveTimer = null
  let disposed = false
  const RAW = readJson(CONFIG_PATH, null)
  // a fresh copy: deepMerge hands arrays through by reference, and several
  // profiles load into one process, so nothing may alias DEFAULTS
  let cache = migrate(CONFIG_PATH, RAW, deepMerge(structuredClone(DEFAULTS), RAW ?? {}))
  // hardware acceleration is app-wide (one GPU process for every window)
  const hw = appPrefs.get("hardwareAccel")
  if (typeof hw === "boolean") cache.perf = { ...cache.perf, hardwareAccel: hw }

  return {
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
      if (disposed) return
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => { if (!disposed) writeJson(CONFIG_PATH, cache) }, 60)
    },
    saveNow () { clearTimeout(saveTimer); return disposed ? false : writeJson(CONFIG_PATH, cache) },
    // profile removed: no more writes (writeJson would re-create its trashed folder)
    dispose () { clearTimeout(saveTimer); disposed = true },

    getSecret: (name) => secrets.getSecret(name),
    setSecret: (name, value) => secrets.setSecret(name, value),
    hasSecret: (name) => secrets.hasSecret(name),

    DEFAULTS,
    paths: { DATA_DIR: dir, CONFIG_PATH, SECRETS_PATH }
  }
}

module.exports = { createStore, secrets, appPrefs, DEFAULTS }
