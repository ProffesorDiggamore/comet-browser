// ───────────────────────────────────────────────────────────────────
//  suggest.js — live search predictions for the address bar and the
//  Home search pill.  The request runs here, in main: no CORS, and the
//  renderer never gets raw network access.  Only the typed query goes
//  out, to the search engine the profile chose (engines without an
//  endpoint use DuckDuckGo).  Nothing is sent for private tabs, when
//  Settings → Search & Tabs → Search suggestions is off, or for input
//  that looks like an address, an email or a password.
//  COMET_SUGGEST_MOCK=1 answers with deterministic fake completions
//  (offline tests).  `stats` counts upstream requests for the tests.
// ───────────────────────────────────────────────────────────────────
const { ipcMain } = require("electron")

const TIMEOUT_MS = 1500
const TTL_MS = 10 * 60_000
const MAX_CACHE = 300
const MAX_LEN = 120
const MOCK = process.env.COMET_SUGGEST_MOCK === "1"

// engine id → endpoint.  All answer OpenSearch JSON: [query, [completions…]]
const ENDPOINTS = {
  duckduckgo: (q) => `https://duckduckgo.com/ac/?q=${q}&type=list`,
  google: (q) => `https://suggestqueries.google.com/complete/search?client=firefox&ie=utf-8&oe=utf-8&q=${q}`,
  bing: (q) => `https://api.bing.com/osjson.aspx?query=${q}`,
  brave: (q) => `https://search.brave.com/api/suggest?q=${q}`
}
const providerFor = (engineId) => (ENDPOINTS[engineId] ? engineId : "duckduckgo")

const stats = { requests: 0, last: null }
const cache = new Map()            // `${provider}|${query}` → { t, list }
const inflight = new Map()         // sender id → AbortController (a newer keystroke cancels the older request)

// ── what never leaves the machine ─────────────────────────────────
function looksLikeUrl (s) {
  return /^[a-z][\w+.-]*:/i.test(s) || /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(s) ||
    /^localhost(:\d+)?(\/\S*)?$/i.test(s) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/\S*)?$/.test(s) || /^[./~\\]/.test(s)
}
function looksSecret (s) {
  if (/\S+@\S+\.\S+/.test(s)) return true                         // email address
  if (/\s/.test(s.trim())) return false                           // several words → a query
  const t = s.trim()
  if (t.length >= 20 && /\d/.test(t) && /[a-z]/i.test(t)) return true   // token / key / hash
  if (t.length < 8) return false
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^\w\s]/].filter((r) => r.test(t)).length
  return classes >= 3                                             // "Hunter2!x"-shaped
}
function shareable (q) {
  return typeof q === "string" && q.trim().length > 0 && q.length <= MAX_LEN && !looksLikeUrl(q.trim()) && !looksSecret(q)
}

// ── fetch + parse ─────────────────────────────────────────────────
function parse (json, q) {
  const arr = Array.isArray(json) ? json[1] : null
  if (!Array.isArray(arr)) return []
  const out = []
  const seen = new Set([q.trim().toLowerCase()])
  for (const v of arr) {
    const s = (typeof v === "string" ? v : v?.phrase ?? "").replace(/\s+/g, " ").trim()
    if (!s || s.length > 140 || seen.has(s.toLowerCase())) continue
    seen.add(s.toLowerCase())
    out.push(s)
    if (out.length >= 8) break
  }
  return out
}

const MOCK_WORDS = ["weather", "weather tomorrow", "wikipedia", "world cup", "translate", "taylor swift", "youtube music",
  "news today", "netflix", "how to tie a tie", "how to screenshot on mac", "electron js", "apple vision pro", "best pizza near me"]
function mock (q) {
  const l = q.toLowerCase()
  const known = MOCK_WORDS.filter((w) => w.startsWith(l) && w !== l)
  const base = q.trimEnd()
  return [...known, `${base} news`, `${base} meaning`, `${base} near me`, `${base} reddit`].filter((s, i, a) => a.indexOf(s) === i).slice(0, 6)
}

async function predict (q, provider, signal) {
  const key = `${provider}|${q.toLowerCase()}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.t < TTL_MS) return hit.list
  stats.requests++
  stats.last = { provider, q, mock: MOCK }
  let list
  if (MOCK) {
    await new Promise((r) => setTimeout(r, 60))
    if (signal.aborted) throw new Error("aborted")
    list = mock(q)
  } else {
    const r = await fetch(ENDPOINTS[provider](encodeURIComponent(q)), {
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
      credentials: "omit",
      headers: { Accept: "application/json, application/x-suggestions+json" }
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    list = parse(await r.json(), q)
  }
  cache.delete(key)
  cache.set(key, { t: Date.now(), list })
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value)
  return list
}

function registerSuggestIpc ({ ctxFor }) {
  // { q, private } → { ok, q, list, provider }.  Never throws across the boundary.
  ipcMain.handle("flux:suggest", async (e, { q, private: priv } = {}) => {
    const none = { ok: true, q, list: [] }
    try {
      if (priv || !shareable(q)) return none
      const cfg = ctxFor(e)?.store?.get("general") ?? {}
      if (cfg.searchSuggestions === false) return none
      const provider = providerFor(cfg.searchEngineId)
      const id = e.sender.id
      inflight.get(id)?.abort()
      const ac = new AbortController()
      inflight.set(id, ac)
      try {
        return { ok: true, q, provider, list: await predict(q.replace(/^\s+/, ""), provider, ac.signal) }
      } finally { if (inflight.get(id) === ac) inflight.delete(id) }
    } catch (err) {
      return { ok: false, q, list: [], text: err?.name === "AbortError" || /aborted/.test(err?.message) ? "aborted" : String(err?.message ?? err) }
    }
  })
}

module.exports = { registerSuggestIpc, stats, _test: { shareable, parse, providerFor, mock } }
