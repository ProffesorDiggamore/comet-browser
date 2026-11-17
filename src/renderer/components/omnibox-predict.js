// ───────────────────────────────────────────────────────────────────
//  omnibox-predict.js — the renderer half of live search predictions.
//  Decides whether a query may leave the machine at all (setting on,
//  not a private tab, not an address / email / password-shaped string),
//  caches recent prefixes so typing feels instant, and drops answers
//  that arrive after the field has moved on.  The request itself runs
//  in main (main/suggest.js).
// ───────────────────────────────────────────────────────────────────
import { state } from "../core/state.js"
import * as T from "../core/tabs.js"
import { engineById } from "../data/engines.js"

const MAX_CACHE = 120
const cache = new Map()   // lowercased query → [predictions]

// engines with their own suggestion endpoint; everything else asks DuckDuckGo
const OWN = new Set(["duckduckgo", "google", "bing", "brave"])
export const providerName = (engineId) => (OWN.has(engineId) ? engineById(engineId).name : "DuckDuckGo")

export function looksSecret (s) {
  if (/\S+@\S+\.\S+/.test(s)) return true
  const t = s.trim()
  if (/\s/.test(t)) return false
  if (t.length >= 20 && /\d/.test(t) && /[a-z]/i.test(t)) return true
  if (t.length < 8) return false
  return [/[a-z]/, /[A-Z]/, /\d/, /[^\w\s]/].filter((r) => r.test(t)).length >= 3
}

export const isPrivate = () => !!T.getActive()?.private || document.body.classList.contains("is-private-tab")

// may this query be sent to the search engine?
export function canPredict (raw) {
  const q = raw.trim()
  return !!q && raw.length <= 120 && state.get("general.searchSuggestions") !== false && !isPrivate() &&
    !T.looksLikeUrl(q) && !T.keywordFor(q) && !looksSecret(raw)
}

// cached predictions for exactly this query, or the longest cached prefix's
// predictions that still start with it — so the list keeps its rows while typing
export function cached (raw) {
  const k = raw.replace(/^\s+/, "").toLowerCase()
  if (cache.has(k)) return { list: cache.get(k), exact: true }
  for (let i = k.length - 1; i > 0; i--) {
    const prev = cache.get(k.slice(0, i))
    if (prev) return { list: prev.filter((p) => p.toLowerCase().startsWith(k)), exact: false }
  }
  return { list: [], exact: false }
}

export async function fetchPredictions (raw) {
  const q = raw.replace(/^\s+/, "")
  const r = await window.flux.suggest?.(q, { private: isPrivate() })
  if (!r?.ok) return null
  const k = q.toLowerCase()
  cache.delete(k)
  cache.set(k, r.list)
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value)
  return r.list
}
