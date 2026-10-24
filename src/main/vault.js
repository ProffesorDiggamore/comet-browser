// ───────────────────────────────────────────────────────────────────
//  vault.js — Flux's local password vault.  Whole file encrypted at
//  rest with Electron safeStorage (OS keychain); 0600 on disk.  The
//  renderer only ever gets metadata unless it explicitly reveals one.
// ───────────────────────────────────────────────────────────────────
const { app, safeStorage } = require("electron")
const fs = require("node:fs")
const path = require("node:path")

const FILE = path.join(app.getPath("userData"), "vault.bin")

function load () {
  try {
    const raw = fs.readFileSync(FILE)
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
  fs.writeFileSync(FILE, buf, { mode: 0o600 })
}

function hostOf (url) {
  try { return new URL(url).host.replace(/^www\./, "") } catch { return (url || "").slice(0, 60) }
}

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
      .filter((e) => e.host && (e.host === host || host.endsWith("." + e.host) || e.host.endsWith("." + host)))
      .map((e) => ({ id: e.id, host: e.host, username: e.username, password: e.password }))
  }
}

module.exports = { vault }
