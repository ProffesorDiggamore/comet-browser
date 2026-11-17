// ───────────────────────────────────────────────────────────────────
//  settings/backup.js — save every setting to one JSON file and bring
//  it back (new Mac, reinstall, or sharing a whole setup).  Passwords
//  and API keys live in the keychain-backed stores, never in config,
//  so they can't end up in the file.  Machine-local state (open tabs,
//  window frame, site permissions, extension folders) is left out.
//  Imported files are checked against the config defaults first.
// ───────────────────────────────────────────────────────────────────
import { state } from "../../core/state.js"
import { bus, toast } from "../../core/bus.js"
import { group, row, sw, btn } from "./kit.js"

// never exported, never imported
const LOCAL_ONLY = ["session", "window", "siteSettings", "extensions", "meta"]
const UNSAFE = new Set(["__proto__", "constructor", "prototype"])
const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v)
// a copy with no __proto__ / constructor keys at any depth (the main process deep-merges it)
const scrub = (v) => Array.isArray(v) ? v.map(scrub)
  : isObj(v) ? Object.fromEntries(Object.entries(v).filter(([k]) => !UNSAFE.has(k)).map(([k, x]) => [k, scrub(x)]))
  : v

let withBookmarks = true

export async function exportSettings () {
  const cfg = structuredClone(state.all())
  for (const k of LOCAL_ONLY) delete cfg[k]
  if (!withBookmarks) { delete cfg.bookmarks; delete cfg.hotTabs }
  // a photo wallpaper is a file on this Mac; the backup falls back to the default preset
  if (cfg.home?.wallpaper?.kind === "image") {
    const d = await window.flux.config.defaults()
    cfg.home.wallpaper = d.home?.wallpaper ?? { kind: "preset", value: "tide" }
  }
  cfg.meta = { app: "comet", kind: "settings", exportedAt: new Date().toISOString(), schema: state.get("meta.schema") ?? null }
  const stamp = new Date().toISOString().slice(0, 10)
  const r = await window.flux.pick.jsonSave(`comet-settings-${stamp}.json`, cfg)
  if (r?.ok) toast("Settings exported")
}

// keep only what the config schema knows about, with matching types.
// Top level: known branches only.  Inside a branch: known keys must match
// the default's type; keys the defaults don't list (newer options, per-item
// maps) are kept as plain JSON.  Empty-object defaults are open maps.
export function sanitize (src, ref, depth = 0) {
  const out = {}
  if (!isObj(src) || !isObj(ref)) return out
  for (const [k, v] of Object.entries(src)) {
    if (UNSAFE.has(k) || v === undefined) continue
    if (depth === 0 && LOCAL_ONLY.includes(k)) continue
    if (!Object.hasOwn(ref, k)) { if (depth > 0) out[k] = scrub(v); continue }
    const d = ref[k]
    if (d == null) out[k] = scrub(v)
    else if (isObj(d)) { if (isObj(v)) out[k] = Object.keys(d).length ? sanitize(v, d, depth + 1) : scrub(v) }
    else if (Array.isArray(d)) { if (Array.isArray(v)) out[k] = scrub(v) }
    else if (typeof v === typeof d) out[k] = v
  }
  return out
}

// an import may only make these safer: a shared file can't switch off the
// page-action prompt or tracker blocking, or point local AI (which gets page
// titles, URLs and content) at a host other than this Mac
const SAFE_ONLY = { ai: { confirmPageActions: true }, privacy: { blockTrackers: true, httpsOnly: true, sendGpc: true } }
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"])
function isLoopback (url) {
  try { const u = new URL(url); return /^https?:$/.test(u.protocol) && LOOPBACK.has(u.hostname) } catch { return false }
}
export function restrictImport (clean) {
  for (const [branch, keys] of Object.entries(SAFE_ONLY)) {
    const b = clean[branch]
    if (!isObj(b)) continue
    for (const [k, safe] of Object.entries(keys)) if (Object.hasOwn(b, k) && b[k] !== safe) delete b[k]
  }
  if (isObj(clean.ai) && Object.hasOwn(clean.ai, "localUrl") && !isLoopback(clean.ai.localUrl)) delete clean.ai.localUrl
  return clean
}

export async function importSettings () {
  const r = await window.flux.pick.jsonOpen("Import Comet settings")
  if (!r?.ok) { if (r?.text) toast("That file isn't valid JSON"); return }
  const d = await window.flux.config.defaults()
  const clean = restrictImport(sanitize(r.data, d))
  if (!Object.keys(clean).length) { toast("No Comet settings found in that file"); return }
  if (!confirm("Replace your current settings with the ones in this file?\n\nPasswords, API keys and open tabs aren't affected.")) return
  await state.merge(clean)
  window.flux.win.vibrancy(state.get("theme.vibrancy") !== false)
  bus.emit("settings:rerender")
  toast("Settings imported")
}

const tag = (el) => { el.dataset.search += " backup restore share transfer new mac json file"; return el }

export function catBackup () {
  return [
    group("Back up & restore", [
      tag(row("Export settings", btn("Export…", exportSettings, "btn btn--accent"), "Theme, layout, Home widgets, motion, sound, search keywords and the rest, in one JSON file you can keep or share.")),
      row("Include bookmarks & Hot Tabs", sw(withBookmarks, (v) => { withBookmarks = v })),
      tag(row("Import settings", btn("Import…", importSettings, "btn btn--ghost"), "Replaces your settings with the ones in a file exported from Comet. Anything unknown or damaged is skipped."))
    ], "Passwords, API keys, open tabs, site permissions and your photo wallpaper stay on this Mac and are never written to the file.")
  ]
}
