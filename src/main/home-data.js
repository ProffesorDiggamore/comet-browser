// ───────────────────────────────────────────────────────────────────
//  home-data.js — data for the useful Home widgets, fetched in main so
//  the renderer's CSP stays closed:
//    Headlines  — any RSS / Atom feed (presets live in the widget),
//                 cached 15 minutes per feed, 2 MB cap, http(s) only.
//    Downloads  — the newest files in ~/Downloads (this profile's own
//                 downloads when there are several profiles); open or
//                 reveal only ids from this window's latest listing.
// ───────────────────────────────────────────────────────────────────
const { ipcMain, shell, nativeImage } = require("electron")
const fs = require("node:fs")
const path = require("node:path")
const { recentDownloads, mimeOf } = require("./easyfiles")

const TTL_MS = 15 * 60_000
const MAX_BYTES = 2 * 1024 * 1024
const cache = new Map()        // url -> { t, items, title }

// ── feeds ─────────────────────────────────────────────────────────
const ENT = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" }
function text (s) {
  return String(s ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim()
}
const tag = (block, name) => block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1]

function parseFeed (xml) {
  const out = []
  const atom = !/<item[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml)
  const blocks = xml.match(atom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) ?? []
  for (const b of blocks.slice(0, 30)) {
    const title = text(tag(b, "title"))
    let link = ""
    if (atom) {
      const alt = b.match(/<link[^>]*rel=["']alternate["'][^>]*>/i)?.[0] ?? b.match(/<link[^>]*>/i)?.[0] ?? ""
      link = alt.match(/href=["']([^"']+)["']/i)?.[1] ?? ""
    } else {
      link = text(tag(b, "link")) || text(tag(b, "guid"))
    }
    const when = text(tag(b, atom ? "updated" : "pubDate") || tag(b, "published") || tag(b, "dc:date"))
    const t = Date.parse(when)
    if (!title || !/^https?:\/\//i.test(link)) continue
    out.push({ title: title.slice(0, 220), url: link.replace(/&amp;/g, "&"), t: Number.isFinite(t) ? t : 0 })
  }
  const chan = xml.match(atom ? /<feed[\s\S]*?<entry/i : /<channel[\s\S]*?<item/i)?.[0] ?? ""
  return { title: text(tag(chan, "title")).slice(0, 80), items: out }
}

async function headlines (url) {
  const hit = cache.get(url)
  if (hit && Date.now() - hit.t < TTL_MS) return hit
  const r = await fetch(url, { signal: AbortSignal.timeout(9000), headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5" } })
  if (!r.ok) throw new Error(`The feed answered ${r.status}`)
  const len = Number(r.headers.get("content-length") || 0)
  if (len > MAX_BYTES) throw new Error("That feed is too large")
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length > MAX_BYTES) throw new Error("That feed is too large")
  const feed = parseFeed(buf.toString("utf8"))
  if (!feed.items.length) throw new Error("No headlines in that feed")
  const data = { t: Date.now(), ...feed }
  cache.set(url, data)
  return data
}

// ── downloads ─────────────────────────────────────────────────────
const allowed = new WeakMap()   // ctx -> Map(id -> path), from that window's latest listing

function thumbOf (p) {
  try {
    const img = nativeImage.createFromPath(p)
    return img.isEmpty() ? null : img.resize({ height: 64 }).toDataURL()
  } catch { return null }
}

function listDownloads (ctx, max) {
  const map = new Map()
  allowed.set(ctx, map)
  return recentDownloads(ctx, Math.max(1, Math.min(12, max | 0 || 6))).map((p, i) => {
    const st = fs.statSync(p)
    const id = `df_${Date.now().toString(36)}_${i}`
    map.set(id, p)
    const type = mimeOf(p)
    return { id, name: path.basename(p), type, size: st.size, mtime: st.mtimeMs, thumb: type.startsWith("image/") ? thumbOf(p) : null }
  })
}

function registerHomeDataIpc ({ ctxFor }) {
  ipcMain.handle("flux:home:headlines", async (_e, url) => {
    const u = String(url ?? "").trim()
    if (!/^https?:\/\//i.test(u)) return { ok: false, text: "Feeds need an http(s) address" }
    try { return { ok: true, ...(await headlines(u)) } } catch (err) {
      return { ok: false, text: err.name === "TimeoutError" ? "The feed took too long to answer" : err.message }
    }
  })
  ipcMain.handle("flux:home:downloads", (e, max) => {
    try { return { ok: true, files: listDownloads(ctxFor(e), max) } } catch (err) { return { ok: false, text: err.message, files: [] } }
  })
  ipcMain.handle("flux:home:file", (e, id, verb) => {
    const p = allowed.get(ctxFor(e))?.get(String(id))
    if (!p || !fs.existsSync(p)) return { ok: false, text: "That file has moved" }
    if (verb === "reveal") shell.showItemInFolder(p)
    else shell.openPath(p)
    return { ok: true }
  })
}

module.exports = { registerHomeDataIpc, parseFeed }
