// ───────────────────────────────────────────────────────────────────
//  vault.js — Comet's local password vault.  Whole file encrypted at
//  rest with Electron safeStorage (OS keychain); 0600 on disk.  The
//  renderer only ever gets metadata unless it explicitly reveals one.
// ───────────────────────────────────────────────────────────────────
const { safeStorage } = require("electron")
const fs = require("node:fs")
const path = require("node:path")
const { profiles } = require("./profiles")

// each profile keeps its own logins, fully isolated: every method takes the
// profile id of the window that asked (main resolves it from the sender)
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

function save (profileId, data) {
  const json = JSON.stringify(data)
  const buf = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(json)
    : Buffer.from(json, "utf8")
  fs.writeFileSync(FILE(profileId), buf, { mode: 0o600 })
}

function sameSite (a, b) { return !!a && !!b && (a === b || a.endsWith("." + b) || b.endsWith("." + a)) }

function hostOf (url) {
  try { return new URL(url).host.replace(/^www\./, "") } catch { return (url || "").slice(0, 60) }
}

const norm = (u) => String(u ?? "").trim().toLowerCase()

function id () { return `pw_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}` }

const vault = {
  list (pid) {
    return load(pid).entries.map((e) => ({ id: e.id, url: e.url, host: e.host, username: e.username, source: e.source, addedAt: e.addedAt }))
  },
  reveal (pid, entryId) {
    const e = load(pid).entries.find((x) => x.id === entryId)
    return e ? e.password : ""
  },
  add (pid, { url, username, password, source }) {
    const data = load(pid)
    const host = hostOf(url)
    const dup = data.entries.find((x) => x.host === host && x.username === username)
    if (dup) { dup.password = password || dup.password; save(pid, data); return { ok: true, added: 0, updated: 1 } }
    data.entries.push({ id: id(), url, host, username: username || "", password: password || "", source: source || "manual", addedAt: Date.now() })
    save(pid, data)
    return { ok: true, added: 1, updated: 0 }
  },
  addMany (pid, list, source) {
    const data = load(pid)
    let added = 0, updated = 0
    for (const it of list ?? []) {
      const host = hostOf(it.url)
      const dup = data.entries.find((x) => x.host === host && x.username === (it.username || ""))
      if (dup) { if (it.password && it.password !== dup.password) { dup.password = it.password; updated++ } }
      else { data.entries.push({ id: id(), url: it.url, host, username: it.username || "", password: it.password || "", source: source || "import", addedAt: Date.now() }); added++ }
    }
    save(pid, data)
    return { ok: true, added, updated, total: data.entries.length }
  },
  remove (pid, entryId) {
    const data = load(pid)
    data.entries = data.entries.filter((x) => x.id !== entryId)
    save(pid, data)
    return { ok: true }
  },
  clear (pid) { save(pid, { entries: [] }); return { ok: true } },
  match (pid, url) {
    const host = hostOf(url)
    return load(pid).entries
      .filter((e) => sameSite(e.host, host))
      .map((e) => ({ id: e.id, host: e.host, username: e.username, password: e.password }))
  },
  // autofill: this window's profile's logins for the site.  Metadata only;
  // the password is fetched by fill() once the user picks one.
  matchAll (url, selfId) {
    const host = hostOf(url)
    const p = profiles.get(selfId)
    if (!host || !p) return []
    return load(p.id).entries
      .filter((e) => sameSite(e.host, host))
      .map((e) => ({ id: e.id, host: e.host, username: e.username, profile: { id: p.id, name: p.name, color: p.color, emoji: p.emoji } }))
  },
  fill (profileId, entryId) {
    if (!profiles.get(profileId)) return null
    const e = load(profileId).entries.find((x) => x.id === entryId)
    return e ? { username: e.username, password: e.password } : null
  },
  // has this profile already got exactly this login?  (no save offer then)
  known (url, username, password, selfId) {
    if (!profiles.get(selfId)) return false
    const host = hostOf(url)
    return load(selfId).entries.some((e) => sameSite(e.host, host) && e.username === (username || "") && e.password === password)
  },
  // this profile's logins for the site (metadata only)
  findForSite (pid, url) {
    const host = hostOf(url)
    return load(pid).entries.filter((e) => sameSite(e.host, host)).map((e) => ({ id: e.id, host: e.host, username: e.username }))
  },
  // after a sign-in: what should the save card offer?  (this profile only)
  //   never  — the user said never for this site
  //   none   — this exact login is already saved
  //   update — this username is saved with a different password
  //   save   — new for this profile; `others` = other usernames saved for the site
  plan (pid, url, username, password) {
    const host = hostOf(url)
    const data = load(pid)
    if ((data.never ?? []).some((h) => sameSite(h, host))) return { action: "never" }
    const u = norm(username)
    const site = data.entries.filter((e) => sameSite(e.host, host))
    if (site.some((e) => norm(e.username) === u && e.password === password)) return { action: "none" }
    const same = site.filter((e) => norm(e.username) === u)
    const hit = same.find((e) => e.host === host) ?? same[0]
    if (hit) return { action: "update", id: hit.id, username: hit.username }
    return { action: "save", others: site.map((e) => ({ id: e.id, username: e.username })) }
  },
  // replace a saved login's password in place: keeps id, addedAt and any notes
  update (pid, entryId, { username, password } = {}) {
    const data = load(pid)
    const e = data.entries.find((x) => x.id === entryId)
    if (!e) return { ok: false }
    if (password) e.password = password
    if (typeof username === "string") e.username = username
    e.updatedAt = Date.now()
    save(pid, data)
    return { ok: true }
  },
  // never offer to save on this site (this profile)
  never (pid, url) {
    const host = hostOf(url)
    if (!host) return { ok: false }
    const data = load(pid)
    data.never = [...new Set([...(data.never ?? []), host])]
    save(pid, data)
    return { ok: true }
  }
}

module.exports = { vault }
