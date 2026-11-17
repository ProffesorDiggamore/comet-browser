// ───────────────────────────────────────────────────────────────────
//  vault.js — Comet's local password vault.  Whole file encrypted at
//  rest with Electron safeStorage (OS keychain); 0600 on disk.  The
//  renderer only ever gets metadata unless it explicitly reveals one.
// ───────────────────────────────────────────────────────────────────
const { safeStorage } = require("electron")
const fs = require("node:fs")
const path = require("node:path")
const { profiles } = require("./profiles")

// each profile keeps its own logins; autofill reads every profile's vault
// so a Personal tab can still offer the Business login (and says which is which)
const FILE = (id) => path.join(profiles.dir(id), "vault.bin")

function load (profileId) {
  try {
    const raw = fs.readFileSync(FILE(profileId))
    const json = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(raw)
      : raw.toString("utf8")
    return JSON.parse(json)
  } catch {
    return { entries: [] }
  }
}

function save (data) {
  const json = JSON.stringify(data)
  const buf = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(json)
    : Buffer.from(json, "utf8")
  fs.writeFileSync(FILE(), buf, { mode: 0o600 })
}

function sameSite (a, b) { return !!a && !!b && (a === b || a.endsWith("." + b) || b.endsWith("." + a)) }

function hostOf (url) {
  try { return new URL(url).host.replace(/^www\./, "") } catch { return (url || "").slice(0, 60) }
}

const norm = (u) => String(u ?? "").trim().toLowerCase()

function id () { return `pw_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}` }

const vault = {
  list () {
    return load().entries.map((e) => ({ id: e.id, url: e.url, host: e.host, username: e.username, source: e.source, addedAt: e.addedAt }))
  },
  reveal (entryId) {
    const e = load().entries.find((x) => x.id === entryId)
    return e ? e.password : ""
  },
  add ({ url, username, password, source }) {
    const data = load()
    const host = hostOf(url)
    const dup = data.entries.find((x) => x.host === host && x.username === username)
    if (dup) { dup.password = password || dup.password; save(data); return { ok: true, added: 0, updated: 1 } }
    data.entries.push({ id: id(), url, host, username: username || "", password: password || "", source: source || "manual", addedAt: Date.now() })
    save(data)
    return { ok: true, added: 1, updated: 0 }
  },
  addMany (list, source) {
    const data = load()
    let added = 0, updated = 0
    for (const it of list ?? []) {
      const host = hostOf(it.url)
      const dup = data.entries.find((x) => x.host === host && x.username === (it.username || ""))
      if (dup) { if (it.password && it.password !== dup.password) { dup.password = it.password; updated++ } }
      else { data.entries.push({ id: id(), url: it.url, host, username: it.username || "", password: it.password || "", source: source || "import", addedAt: Date.now() }); added++ }
    }
    save(data)
    return { ok: true, added, updated, total: data.entries.length }
  },
  remove (entryId) {
    const data = load()
    data.entries = data.entries.filter((x) => x.id !== entryId)
    save(data)
    return { ok: true }
  },
  clear () { save({ entries: [] }); return { ok: true } },
  match (url) {
    const host = hostOf(url)
    return load().entries
      .filter((e) => sameSite(e.host, host))
      .map((e) => ({ id: e.id, host: e.host, username: e.username, password: e.password }))
  },
  // autofill: logins for this site from EVERY profile, active profile first.
  // Metadata only; the password is fetched by fill() once the user picks one.
  matchAll (url) {
    const host = hostOf(url)
    if (!host) return []
    const active = profiles.activeId()
    const out = []
    for (const p of profiles.list().sort((a, b) => (a.id === active ? -1 : b.id === active ? 1 : 0))) {
      for (const e of load(p.id).entries) {
        if (!sameSite(e.host, host)) continue
        out.push({ id: e.id, host: e.host, username: e.username, profile: { id: p.id, name: p.name, color: p.color, emoji: p.emoji } })
      }
    }
    return out
  },
  fill (profileId, entryId) {
    if (!profiles.get(profileId)) return null
    const e = load(profileId).entries.find((x) => x.id === entryId)
    return e ? { username: e.username, password: e.password } : null
  },
  // has the active profile (or any profile) already got exactly this login?
  known (url, username, password) {
    const host = hostOf(url)
    return profiles.list().some((p) => load(p.id).entries.some((e) => sameSite(e.host, host) && e.username === (username || "") && e.password === password))
  },
  // the active profile's logins for this site (metadata only)
  findForSite (url) {
    const host = hostOf(url)
    return load().entries.filter((e) => sameSite(e.host, host)).map((e) => ({ id: e.id, host: e.host, username: e.username }))
  },
  // after a sign-in: what should the save card offer?
  //   never  — the user said never for this site
  //   none   — this exact login is already saved (any profile)
  //   update — this username is saved here with a different password
  //   save   — new for this profile; `others` = other usernames saved for the site
  plan (url, username, password) {
    const host = hostOf(url)
    const data = load()
    if ((data.never ?? []).some((h) => sameSite(h, host))) return { action: "never" }
    const u = norm(username)
    if (profiles.list().some((p) => load(p.id).entries.some((e) => sameSite(e.host, host) && norm(e.username) === u && e.password === password))) return { action: "none" }
    const site = data.entries.filter((e) => sameSite(e.host, host))
    const same = site.filter((e) => norm(e.username) === u)
    const hit = same.find((e) => e.host === host) ?? same[0]
    if (hit) return { action: "update", id: hit.id, username: hit.username }
    return { action: "save", others: site.map((e) => ({ id: e.id, username: e.username })) }
  },
  // replace a saved login's password in place: keeps id, addedAt and any notes
  update (entryId, { username, password } = {}) {
    const data = load()
    const e = data.entries.find((x) => x.id === entryId)
    if (!e) return { ok: false }
    if (password) e.password = password
    if (typeof username === "string") e.username = username
    e.updatedAt = Date.now()
    save(data)
    return { ok: true }
  },
  // never offer to save on this site (active profile)
  never (url) {
    const host = hostOf(url)
    if (!host) return { ok: false }
    const data = load()
    data.never = [...new Set([...(data.never ?? []), host])]
    save(data)
    return { ok: true }
  }
}

module.exports = { vault }
