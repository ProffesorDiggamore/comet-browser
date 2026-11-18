// ───────────────────────────────────────────────────────────────────
//  preload.js — the ONLY bridge between renderer and main.
//  Exposes window.flux with a narrow, typed-ish surface.  No Node,
//  no ipcRenderer leak into the page.
// ───────────────────────────────────────────────────────────────────
const { contextBridge, ipcRenderer } = require("electron")

const paths = ipcRenderer.sendSync("flux:paths")

const listeners = new Map()
function on (channel, cb) {
  const wrapped = (_e, payload) => cb(payload)
  ipcRenderer.on(channel, wrapped)
  listeners.set(cb, [channel, wrapped])
  return () => {
    const [ch, w] = listeners.get(cb) ?? []
    if (ch) ipcRenderer.removeListener(ch, w)
  }
}

contextBridge.exposeInMainWorld("flux", {
  paths, // { root, userData, webviewPreload, partition, privatePartition, profile } of THIS window

  config: {
    all: () => ipcRenderer.invoke("flux:config:all"),
    defaults: () => ipcRenderer.invoke("flux:config:defaults"),
    get: (key) => ipcRenderer.invoke("flux:config:get", key),
    set: (key, value) => ipcRenderer.invoke("flux:config:set", key, value),
    merge: (partial) => ipcRenderer.invoke("flux:config:merge", partial),
    onChange: (cb) => on("flux:config:changed", cb)
  },

  secrets: {
    set: (name, value) => ipcRenderer.invoke("flux:secret:set", name, value),
    status: () => ipcRenderer.invoke("flux:secret:status")
  },

  pick: {
    image: () => ipcRenderer.invoke("flux:pick:image"),
    folder: (title) => ipcRenderer.invoke("flux:pick:folder", title),
    jsonOpen: (title) => ipcRenderer.invoke("flux:pick:json", { title }),
    jsonSave: (defaultName, data) => ipcRenderer.invoke("flux:pick:json", { save: true, defaultName, data })
  },

  extensions: {
    list: () => ipcRenderer.invoke("flux:ext:list"),
    add: () => ipcRenderer.invoke("flux:ext:add"),
    remove: (id) => ipcRenderer.invoke("flux:ext:remove", id)
  },

  win: {
    min: () => ipcRenderer.invoke("flux:win:min"),
    max: () => ipcRenderer.invoke("flux:win:max"),
    close: () => ipcRenderer.invoke("flux:win:close"),
    vibrancy: (on) => ipcRenderer.invoke("flux:win:vibrancy", on),
    appearance: () => ipcRenderer.invoke("flux:win:appearance"),
    onGlass: (cb) => on("flux:win:glass", cb),
    isFullscreen: () => ipcRenderer.invoke("flux:win:is-fullscreen"),
    onFullscreen: (cb) => on("flux:win:fullscreen", cb),
    onActive: (cb) => on("flux:win:active", cb)
  },

  files: {
    list: () => ipcRenderer.invoke("flux:files:list"),
    read: (ids) => ipcRenderer.invoke("flux:files:read", ids),
    browse: (opts) => ipcRenderer.invoke("flux:files:browse", opts)
  },

  weather: (city, unit) => ipcRenderer.invoke("flux:weather", { city, unit }),
  // Home widgets: Headlines (RSS / Atom) and the newest files in Downloads
  home: {
    headlines: (url) => ipcRenderer.invoke("flux:home:headlines", url),
    downloads: (max) => ipcRenderer.invoke("flux:home:downloads", max),
    file: (id, verb) => ipcRenderer.invoke("flux:home:file", id, verb)
  },
  spotify: { state: () => ipcRenderer.invoke("flux:spotify:state"), probe: () => ipcRenderer.invoke("flux:spotify:probe"), subscribe: (mode) => ipcRenderer.invoke("flux:spotify:subscribe", mode), unsubscribe: () => ipcRenderer.invoke("flux:spotify:unsubscribe"),
    command: (name, arg) => ipcRenderer.invoke("flux:spotify:command", name, arg), art: (url) => ipcRenderer.invoke("flux:spotify:art", url), onState: (cb) => on("flux:spotify:state", cb) },
  // live search predictions (main/suggest.js); nothing is sent for private tabs
  suggest: (q, opts = {}) => ipcRenderer.invoke("flux:suggest", { q, private: !!opts.private }),

  // search by image with Google Lens (lens.js)
  lens: {
    upload: (wcId, bytes) => ipcRenderer.invoke("flux:lens:upload", wcId, bytes),
    clipboard: () => ipcRenderer.invoke("flux:lens:clipboard"),
    pick: () => ipcRenderer.invoke("flux:lens:pick")
  },
  wallpaper: {
    get: () => ipcRenderer.invoke("flux:wallpaper:get"),
    pick: () => ipcRenderer.invoke("flux:wallpaper:pick"),
    desktop: () => ipcRenderer.invoke("flux:wallpaper:desktop"),
    homeWidgets: () => ipcRenderer.invoke("flux:wallpaper:homeWidgets"),
    useHomeWidgets: (name) => ipcRenderer.invoke("flux:wallpaper:useHomeWidgets", name)
  },

  app: {
    metrics: () => ipcRenderer.invoke("flux:app:metrics"),
    clearData: (kinds) => ipcRenderer.invoke("flux:app:clearData", kinds),
    restart: () => ipcRenderer.invoke("flux:app:restart")
  },

  power: {
    onBattery: () => ipcRenderer.invoke("flux:power:battery"),
    onChange: (cb) => on("flux:power", cb)
  },

  import: {
    sources: () => ipcRenderer.invoke("flux:import:sources"),
    run: (opts) => ipcRenderer.invoke("flux:import:run", opts)
  },

  vault: {
    list: () => ipcRenderer.invoke("flux:vault:list"),
    reveal: (id) => ipcRenderer.invoke("flux:vault:reveal", id),
    add: (entry) => ipcRenderer.invoke("flux:vault:add", entry),
    remove: (id) => ipcRenderer.invoke("flux:vault:remove", id),
    clear: () => ipcRenderer.invoke("flux:vault:clear"),
    match: (url) => ipcRenderer.invoke("flux:vault:match", url),
    matchAll: (url) => ipcRenderer.invoke("flux:vault:match-all", url),
    fill: (profileId, id) => ipcRenderer.invoke("flux:vault:fill", profileId, id),
    known: (url, username, password) => ipcRenderer.invoke("flux:vault:known", url, username, password),
    plan: (url, username, password) => ipcRenderer.invoke("flux:vault:plan", url, username, password),
    update: (id, patch) => ipcRenderer.invoke("flux:vault:update", id, patch),
    generate: (opts) => ipcRenderer.invoke("flux:vault:generate", opts),
    never: (url) => ipcRenderer.invoke("flux:vault:never", url)
  },

  ai: {
    send: (args) => ipcRenderer.invoke("flux:ai:send", args),
    stop: (chatId) => ipcRenderer.invoke("flux:ai:stop", chatId),
    newChat: () => ipcRenderer.invoke("flux:ai:new"),
    list: () => ipcRenderer.invoke("flux:ai:list"),
    view: (id) => ipcRenderer.invoke("flux:ai:view", id),
    remove: (id) => ipcRenderer.invoke("flux:ai:remove", id),
    clear: () => ipcRenderer.invoke("flux:ai:clear"),
    onEvent: (cb) => on("flux:ai:event", cb),
    onTool: (cb) => on("flux:ai:tool", cb),
    toolResult: (callId, result) => ipcRenderer.send("flux:ai:tool-result", { callId, ...result }),
    onConfirm: (cb) => on("flux:ai:confirm", cb),
    confirmReply: (callId, ok) => ipcRenderer.send("flux:ai:confirm-reply", { callId, ok }),
    onAsk: (cb) => on("flux:ai:ask", cb)
  },

  ollama: {
    status: () => ipcRenderer.invoke("flux:ollama:status"),
    start: () => ipcRenderer.invoke("flux:ollama:start"),
    pull: (name) => ipcRenderer.invoke("flux:ollama:pull", name),
    cancel: (name) => ipcRenderer.invoke("flux:ollama:cancel", name),
    remove: (name) => ipcRenderer.invoke("flux:ollama:remove", name),
    onPull: (cb) => on("flux:ollama:pull", cb)
  },

  voice: {
    permission: () => ipcRenderer.invoke("flux:voice:permission"),
    transcribe: (audio, mime) => ipcRenderer.invoke("flux:voice:transcribe", { audio, mime })
  },

  history: {
    record: (entry) => ipcRenderer.send("flux:history:record", entry),
    title: (entry) => ipcRenderer.send("flux:history:title", entry),
    search: (opts) => ipcRenderer.invoke("flux:history:search", opts),
    remove: (url) => ipcRenderer.invoke("flux:history:remove", url),
    clear: (opts) => ipcRenderer.invoke("flux:history:clear", opts)
  },

  downloads: {
    list: () => ipcRenderer.invoke("flux:dl:list"),
    action: (id, verb) => ipcRenderer.invoke("flux:dl:action", id, verb),
    clear: () => ipcRenderer.invoke("flux:dl:clear"),
    onUpdate: (cb) => on("flux:dl:update", cb)
  },

  shield: {
    stats: () => ipcRenderer.invoke("flux:shield:stats"),
    onCounts: (cb) => on("flux:shield:counts", cb)
  },

  perms: {
    onAsk: (cb) => on("flux:perm:ask", cb),
    reply: (id, allow, remember) => ipcRenderer.send("flux:perm:reply", { id, allow, remember })
  },

  shot: {
    save: (dataUrl, name) => ipcRenderer.invoke("flux:shot:save", { dataUrl, name }),
    reveal: (p) => ipcRenderer.invoke("flux:shot:reveal", p)
  },

  web: { clearData: (kinds) => ipcRenderer.invoke("flux:web:clearData", kinds) },

  // Chrome-style profiles: switching reloads this window into the other profile;
  // each profile can also have a window of its own
  profiles: {
    list: () => ipcRenderer.invoke("flux:profiles:list"),
    create: (patch, opts) => ipcRenderer.invoke("flux:profiles:create", patch, opts),
    update: (id, patch) => ipcRenderer.invoke("flux:profiles:update", id, patch),
    remove: (id) => ipcRenderer.invoke("flux:profiles:remove", id),
    switch: (id) => ipcRenderer.invoke("flux:profiles:switch", id),
    // ids in their new order: ⌃⌘1…9 and every list follow it
    reorder: (ids) => ipcRenderer.invoke("flux:profiles:reorder", ids),
    pickPicture: () => ipcRenderer.invoke("flux:profiles:pickPicture"),
    pictureOriginal: (id) => ipcRenderer.invoke("flux:profiles:pictureOriginal", id),
    // a profile in a window of its own (focuses it when it already has one)
    openWindow: (id) => ipcRenderer.invoke("flux:profiles:openWindow", id),
    // { active: this window's profile, open: [ids with a window], list }
    onChange: (cb) => on("flux:profiles:changed", cb)
  },
  // the tab snapshot, written before this window closes or reloads (synchronous)
  session: { saveSync: (snapshot) => { try { return ipcRenderer.sendSync("flux:session:save", snapshot) } catch { return false } } },
  onMenu: (cb) => on("flux:menu", cb),

  openExternal: (url) => ipcRenderer.invoke("flux:open-external", url),
  reloadUi: () => ipcRenderer.invoke("flux:reload-ui"),
  info: () => ipcRenderer.invoke("flux:paths:info"),
  onOpenTab: (cb) => on("flux:open-tab", cb),
  privateSession: { clear: () => ipcRenderer.invoke("flux:private:clear") },
  takeOpenUrls: () => ipcRenderer.invoke("flux:open-urls:take"),
  defaultBrowser: {
    get: () => ipcRenderer.invoke("flux:default-browser:get"),
    set: () => ipcRenderer.invoke("flux:default-browser:set")
  }
})
