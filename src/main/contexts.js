// ───────────────────────────────────────────────────────────────────
//  contexts.js — the profile-context registry.  One Comet process runs
//  any number of profiles side by side; each gets a context with its own
//  store, history, AI chats, downloads, web + private sessions and (at
//  most) one window.  Every IPC handler and session hook finds its
//  context from the webContents that asked — never "the active profile".
// ───────────────────────────────────────────────────────────────────
const { BrowserWindow, session } = require("electron")
const { profiles } = require("./profiles")
const { createStore } = require("./store")
const { createHistory } = require("./history")
const { createChats } = require("./assistant/chats")
const { initShield } = require("./shield")
const { initDownloads } = require("./downloads")
const { initPermissions } = require("./permissions")
const { loadSavedExtensions } = require("./extensions")

const contexts = new Map()     // profile id → ctx
const uiOwner = new Map()      // Comet UI webContents id → profile id (set by windows.js)
const sesOwner = new WeakMap() // Session → ctx (pop-ups, extension pages)
const removing = new Set()     // ids being removed: nothing may re-create them

const alive = (w) => (w && !w.isDestroyed() ? w : null)

// a profile that exists and isn't on its way out
const usable = (id) => typeof id === "string" && !!profiles.get(id) && !removing.has(id)

// lazily built; contexts live until their profile is removed (a closed window
// only flushes, since its downloads, pop-ups and request hooks still read it)
function contextFor (id) {
  const have = contexts.get(id)
  if (have) return have
  if (!usable(id)) return null
  const dir = profiles.dir(id)
  const ctx = {
    id,
    dir,
    partition: profiles.partition(id),
    privatePartition: profiles.privatePartition(id),
    // lazy: session.fromPartition needs the app to be ready, and the first
    // context is built before that (hardware acceleration)
    get session () { return session.fromPartition(this.partition) },
    get privateSession () { return session.fromPartition(this.privatePartition) },
    store: createStore(dir),
    history: createHistory(dir),
    chats: createChats(dir),
    downloads: new Map(),      // id → { item, info }
    easyAllowed: new Map(),    // Easy Files ids this window may read
    win: null,
    uiReady: false,
    prepared: null,          // promise: session hooks attached, extensions loaded
    privateUsed: false,
    disposed: false,
    flush () {
      if (this.disposed) return
      try { this.store.saveNow(); this.history.flush(); this.chats.flush() } catch (e) { console.error("[ctx] flush", e.message) }
    },
    dispose () {
      this.store.dispose(); this.history.dispose(); this.chats.dispose()
      this.disposed = true
    }
  }
  contexts.set(id, ctx)
  return ctx
}

// guest → host window; Comet UI → its owner; pop-up / extension page → its
// session's owner; anything else → its parent window
function ctxForContents (wc, depth = 0) {
  if (!wc || depth > 4) return null
  try {
    if (wc.isDestroyed()) return null
    const host = wc.hostWebContents
    if (host) return ctxForContents(host, depth + 1)
    const id = uiOwner.get(wc.id)
    if (id) return contexts.get(id) ?? null
    const s = sesOwner.get(wc.session)
    if (s && !s.disposed) return s
    const parent = BrowserWindow.fromWebContents(wc)?.getParentWindow()
    if (parent) return ctxForContents(parent.webContents, depth + 1)
  } catch {}
  return null
}

const lastFocusedCtx = () => contextFor(profiles.activeId()) ?? contextFor(profiles.DEFAULT_ID)
const ctxFor = (e) => ctxForContents(e?.sender) ?? lastFocusedCtx()
const winFor = (e) => alive(ctxFor(e).win) ?? undefined
const windowForContents = (wc) => alive(ctxForContents(wc)?.win)

// every profile's web partition gets the same hooks, once
const prepared = new WeakSet()
async function prepareSession (ses, ctx, { extensions = true } = {}) {
  sesOwner.set(ses, ctx)
  if (prepared.has(ses)) return ses
  prepared.add(ses)
  // drop the Electron/app tokens so sites see a normal Chrome (fixes "unsupported browser" walls)
  ses.setUserAgent(ses.getUserAgent().replace(/\s(flux-browser|Flux|Comet|Electron)\/\S+/g, ""))
  initShield(ses, ctx)
  initDownloads(ses, ctx)
  initPermissions(ses, ctx)
  if (extensions) try { await loadSavedExtensions(ses, ctx.store) } catch (e) { console.error("[ext]", e.message) }
  return ses
}

// the persistent web partition (with extensions) and the in-memory private
// one (without).  Hooks attach synchronously; extensions finish after.
function prepareCtx (ctx) {
  ctx.prepared ??= Promise.all([
    prepareSession(ctx.session, ctx),
    prepareSession(ctx.privateSession, ctx, { extensions: false })
  ])
  return ctx.prepared
}

// a page opened in a profile's private session: that session needs clearing
// when the window closes or switches away
function notePrivateUse (wc) {
  try {
    const ctx = sesOwner.get(wc.session)
    if (ctx && wc.session === ctx.privateSession) ctx.privateUsed = true
  } catch {}
}

// private data never outlives the window that made it
async function clearPrivate (ctx) {
  if (!ctx?.privateUsed) return
  ctx.privateUsed = false
  try { await ctx.privateSession.clearStorageData(); await ctx.privateSession.clearCache() } catch (e) { console.error("[private] clear", e.message) }
}

function flushAll () { for (const ctx of contexts.values()) ctx.flush() }

module.exports = {
  contexts, uiOwner, removing, usable, alive,
  contextFor, ctxForContents, ctxFor, winFor, windowForContents,
  prepareSession, prepareCtx, notePrivateUse, clearPrivate, flushAll
}
