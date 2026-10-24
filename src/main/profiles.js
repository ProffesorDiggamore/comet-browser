// ───────────────────────────────────────────────────────────────────
//  profiles.js — separate browsing identities (Personal, School, Work…).
//  Each profile owns its config (bookmarks, tabs, Home, theme), history,
//  passwords, AI chats, wallpaper and web partition (cookies, logins,
//  site data).  The original data dir IS the first profile, so nothing
//  moves on upgrade.  API keys (secrets.json) stay shared.
//
//  Load this before store.js / history.js / vault.js: they ask it for
//  their directory.
// ───────────────────────────────────────────────────────────────────
const { app, session, shell } = require("electron")
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")

const BASE = app.getPath("userData")
const FILE = path.join(BASE, "profiles.json")
const DEFAULT_ID = "default"
const ID_RE = /^[a-z0-9]{8}$/
const COLOR_RE = /^#[0-9a-f]{6}$/i

function fresh () {
  return { active: DEFAULT_ID, list: [{ id: DEFAULT_ID, name: "Personal", color: "#0a84ff", emoji: "" }] }
}

function load () {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"))
    const list = (raw.list ?? []).filter((p) => p && (p.id === DEFAULT_ID || ID_RE.test(p.id)))
    if (!list.some((p) => p.id === DEFAULT_ID)) list.unshift(fresh().list[0])
    const active = list.some((p) => p.id === raw.active) ? raw.active : DEFAULT_ID
    return { active, list }
  } catch { return fresh() }
}

let data = load()

function save () {
  try {
    const tmp = FILE + ".tmp"
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
    fs.renameSync(tmp, FILE)
  } catch (e) { console.error("[profiles] save failed", e.message) }
}

function clean (patch) {
  const out = {}
  if (typeof patch.name === "string") out.name = patch.name.trim().slice(0, 32) || "Profile"
  if (typeof patch.color === "string" && COLOR_RE.test(patch.color)) out.color = patch.color.toLowerCase()
  if (typeof patch.emoji === "string") out.emoji = [...patch.emoji.trim()].slice(0, 2).join("")
  return out
}

const dirFor = (id) => (id === DEFAULT_ID ? BASE : path.join(BASE, "Profiles", id))
const partitionFor = (id) => (id === DEFAULT_ID ? "persist:flux" : `persist:flux-${id}`)

const profiles = {
  BASE,
  DEFAULT_ID,
  list () { return data.list.map((p) => ({ ...p })) },
  get (id) { return data.list.find((p) => p.id === id) ?? null },
  activeId () { return data.active },
  current () { return { ...this.get(data.active) } },
  dir (id = data.active) { return dirFor(id) },
  partition (id = data.active) { return partitionFor(id) },
  session (id = data.active) { return session.fromPartition(partitionFor(id)) },

  // seed: the new profile's first config.json (written before it is ever opened)
  create (patch, seed) {
    let id
    do { id = crypto.randomBytes(4).toString("hex") } while (this.get(id))
    const p = { id, name: "Profile", color: "#30d158", emoji: "", ...clean(patch ?? {}) }
    fs.mkdirSync(dirFor(id), { recursive: true })
    if (seed) fs.writeFileSync(path.join(dirFor(id), "config.json"), JSON.stringify(seed, null, 2))
    data.list.push(p)
    save()
    return { ...p }
  },
  update (id, patch) {
    const p = this.get(id)
    if (!p) return null
    Object.assign(p, clean(patch ?? {}))
    save()
    return { ...p }
  },
  setActive (id) {
    if (!this.get(id)) return false
    data.active = id
    save()
    return true
  },
  // the first profile is the original data dir, so it can be renamed but not removed;
  // removed profiles go to the Trash (reversible), never rm -rf
  async remove (id) {
    if (id === DEFAULT_ID) return { ok: false, text: "The first profile can be renamed but not removed." }
    if (id === data.active) return { ok: false, text: "Switch to another profile before removing this one." }
    if (!this.get(id)) return { ok: false, text: "No such profile." }
    try {
      const ses = this.session(id)
      await ses.clearStorageData()
      await ses.clearCache()
    } catch (e) { console.error("[profiles] clear partition", e.message) }
    for (const dir of [dirFor(id), path.join(BASE, "Partitions", `flux-${id}`)]) {
      if (!fs.existsSync(dir)) continue
      try { await shell.trashItem(dir) } catch (e) { console.error("[profiles] trash", dir, e.message) }
    }
    data.list = data.list.filter((p) => p.id !== id)
    save()
    return { ok: true }
  }
}

module.exports = { profiles }
