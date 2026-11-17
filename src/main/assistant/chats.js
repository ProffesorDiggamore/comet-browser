// ───────────────────────────────────────────────────────────────────
//  assistant/chats.js — Comet AI conversations, persisted locally.
//  Each chat keeps the exact API history (append-only, so thinking
//  blocks stay valid when a chat is resumed) plus a light "display"
//  log the panel re-renders from.  Oldest chats roll off past the cap.
// ───────────────────────────────────────────────────────────────────
const fs = require("node:fs")
const path = require("node:path")

const MAX_CHATS = 40
const MAX_BYTES = 40 * 1024 * 1024

// one chat list per profile: dir is that profile's data folder
function createChats (dir) {
  const FILE = path.join(dir, "ai-chats.json")
  let chats = load()       // newest first: [{ id, title, created, updated, messages, display }]
  let timer = null
  let disposed = false

  function load () {
    try {
      const raw = JSON.parse(fs.readFileSync(FILE, "utf8"))
      return Array.isArray(raw) ? raw.filter((c) => c && c.id && Array.isArray(c.messages)) : []
    } catch { return [] }
  }

  function flush () {
    clearTimeout(timer)
    if (disposed) return
    try {
      // empty chats live in memory only; the cap trims both
      if (chats.length > MAX_CHATS * 2) chats = chats.slice(0, MAX_CHATS * 2)
      const keep = chats.filter((c) => c.display.length).slice(0, MAX_CHATS)
      let json = JSON.stringify(keep)
      while (json.length > MAX_BYTES && keep.length > 1) { chats.splice(chats.indexOf(keep.pop()), 1); json = JSON.stringify(keep) }
      const tmp = FILE + ".tmp"
      fs.writeFileSync(tmp, json, { mode: 0o600 })
      fs.renameSync(tmp, FILE)
    } catch (e) { console.error("[ai-chats] save failed", e.message) }
  }

  return {
    create () {
      const c = { id: `chat_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: "New chat", created: Date.now(), updated: Date.now(), messages: [], display: [] }
      chats.unshift(c)
      return c
    },
    get (id) { return chats.find((c) => c.id === id) ?? null },
    ensure (id) { return (id && this.get(id)) || this.create() },
    touch (c) {
      c.updated = Date.now()
      const i = chats.indexOf(c)
      if (i > 0) { chats.splice(i, 1); chats.unshift(c) }
      if (disposed) return
      clearTimeout(timer)
      timer = setTimeout(flush, 800)
    },
    list () {
      return chats.filter((c) => c.display.length).map((c) => ({ id: c.id, title: c.title, updated: c.updated, turns: c.display.filter((d) => d.role === "user").length }))
    },
    view (id) {
      const c = this.get(id)
      return c ? { id: c.id, title: c.title, display: c.display } : null
    },
    remove (id) { chats = chats.filter((c) => c.id !== id); flush(); return true },
    clear () { chats = []; flush(); return true },
    flush,
    // profile removed: stop writing (a write would re-create its trashed folder)
    dispose () { clearTimeout(timer); disposed = true }
  }
}

module.exports = { createChats }
