// ───────────────────────────────────────────────────────────────────
//  history.js — browsing history, local only.  One JSON file in the
//  user-data dir, one entry per URL (visits counted), capped and
//  written on a debounce.  Ranked by "frecency" for suggestions.
// ───────────────────────────────────────────────────────────────────
const fs = require("node:fs")
const path = require("node:path")
const { profiles } = require("./profiles")

let FILE = path.join(profiles.dir(), "history.json")
const CAP = 6000

let entries = load()          // [{ url, title, ts, visits }]
let byUrl = new Map(entries.map((e) => [e.url, e]))
let timer = null

function load () {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"))
    return Array.isArray(raw) ? raw.filter((e) => e && typeof e.url === "string") : []
  } catch { return [] }
}

function save () {
  clearTimeout(timer)
  timer = setTimeout(flush, 1500)
}

function flush () {
  clearTimeout(timer)
  try {
    const tmp = FILE + ".tmp"
    fs.writeFileSync(tmp, JSON.stringify(entries))
    fs.renameSync(tmp, FILE)
  } catch (e) { console.error("[history] save failed", e.message) }
}

function skip (url) {
  return !/^https?:/i.test(url ?? "") || url.length > 2048
}

function frecency (e, now) {
  const ageH = (now - e.ts) / 3_600_000
  const recency = ageH < 4 ? 100 : ageH < 24 ? 70 : ageH < 24 * 7 ? 50 : ageH < 24 * 30 ? 30 : 10
  return recency * Math.log2(2 + (e.visits ?? 1))
}

const history = {
  // profile switch: write this profile's history, then load another's
  useDir (dir) {
    flush()
    FILE = path.join(dir, "history.json")
    entries = load()
    byUrl = new Map(entries.map((e) => [e.url, e]))
  },
  record ({ url, title }) {
    if (skip(url)) return
    const now = Date.now()
    let e = byUrl.get(url)
    if (e) {
      // same page re-reported within a few seconds (title update) is not a new visit
      if (now - e.ts > 5000) e.visits = (e.visits ?? 1) + 1
      e.ts = now
      if (title) e.title = title
      entries.splice(entries.indexOf(e), 1)
      entries.unshift(e)
    } else {
      e = { url, title: title || "", ts: now, visits: 1 }
      entries.unshift(e)
      byUrl.set(url, e)
      if (entries.length > CAP) {
        for (const old of entries.splice(CAP)) byUrl.delete(old.url)
      }
    }
    save()
  },

  title ({ url, title }) {
    const e = byUrl.get(url)
    if (e && title && e.title !== title) { e.title = title; save() }
  },

  // query: plain substring over title + url; empty query = most recent
  search ({ query = "", limit = 50, ranked = false } = {}) {
    const q = String(query).trim().toLowerCase()
    const now = Date.now()
    let list = q
      ? entries.filter((e) => e.url.toLowerCase().includes(q) || (e.title ?? "").toLowerCase().includes(q))
      : entries
    if (ranked) list = [...list].sort((a, b) => frecency(b, now) - frecency(a, now))
    return list.slice(0, Math.min(500, limit))
  },

  remove (url) {
    const e = byUrl.get(url)
    if (!e) return false
    entries.splice(entries.indexOf(e), 1)
    byUrl.delete(url)
    save()
    return true
  },

  clear ({ sinceMs } = {}) {
    if (sinceMs) {
      const cutoff = Date.now() - sinceMs
      entries = entries.filter((e) => e.ts < cutoff)
    } else {
      entries = []
    }
    byUrl = new Map(entries.map((e) => [e.url, e]))
    flush()
    return true
  },

  flush
}

module.exports = { history }
