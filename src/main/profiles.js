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
const { app, nativeImage, session, shell } = require("electron")
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")

// The browser was called Flux: its data folder (Application Support/Flux)
// and web partitions (Partitions/flux, flux-<id>) move to Comet names once.
// The keychain key is untouched, so logins and saved passwords carry over.
// Skipped while an older copy still has the folder open.
const running = (dir) => {
  try { return process.kill(Number(fs.readlinkSync(path.join(dir, "SingletonLock")).split("-").pop()), 0) } catch { return false }
}
;(function renameFromFlux () {
  try {
    const appData = app.getPath("appData")
    const oldDir = path.join(appData, "Flux")
    const newDir = path.join(appData, "Comet")
    if (app.getPath("userData") === oldDir) {          // not pointed elsewhere (tests)
      if (fs.existsSync(oldDir) && !fs.existsSync(newDir) && !running(oldDir)) fs.renameSync(oldDir, newDir)
      if (fs.existsSync(newDir)) { app.setPath("userData", newDir); app.setPath("sessionData", newDir) }
    }
    const parts = path.join(app.getPath("userData"), "Partitions")
    if (!fs.existsSync(parts) || running(app.getPath("userData"))) return
    for (const name of fs.readdirSync(parts)) {
      const to = name.replace(/^flux(?=$|-[a-z0-9]{8}$)/, "comet")
      if (to !== name && !fs.existsSync(path.join(parts, to))) fs.renameSync(path.join(parts, name), path.join(parts, to))
    }
  } catch (e) { console.error("[profiles] rename from Flux", e.message) }
})()

const BASE = app.getPath("userData")
const FILE = path.join(BASE, "profiles.json")
const DEFAULT_ID = "default"
const ID_RE = /^[a-z0-9]{8}$/
const COLOR_RE = /^#[0-9a-f]{6}$/i

function fresh () {
  return { active: DEFAULT_ID, list: [{ id: DEFAULT_ID, name: "Personal", color: "#0a84ff", emoji: "" }], open: [] }
}

function load () {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"))
    const list = (raw.list ?? []).filter((p) => p && (p.id === DEFAULT_ID || ID_RE.test(p.id)))
    if (!list.some((p) => p.id === DEFAULT_ID)) list.unshift(fresh().list[0])
    const active = list.some((p) => p.id === raw.active) ? raw.active : DEFAULT_ID
    // profiles whose windows were open at quit, in focus order (last = front)
    const open = Array.isArray(raw.open) ? [...new Set(raw.open)].filter((id) => list.some((p) => p.id === id)) : []
    return { active, list, open }
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
const partitionFor = (id) => (id === DEFAULT_ID ? "persist:comet" : `persist:comet-${id}`)
// private tabs: in memory only (no "persist:"), one per profile so windows of
// different profiles never share (or clear) each other's private data
const privatePartitionFor = (id) => (id === DEFAULT_ID ? "comet-private" : `comet-private-${id}`)

// ── profile pictures: any image → a 256px square PNG beside the profile's data ──
const PIC_SIZE = 256
const picFile = (id) => path.join(dirFor(id), "avatar.png")
// the full image the crop came from, so "Move & Scale" can be redone later.
// Both are copies inside Comet's data — the file you picked can be moved or deleted.
const origFile = (id) => path.join(dirFor(id), "avatar-original.png")
const ORIG_MAX = 1600
const num = (v, lo, hi) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null)
function cleanCrop (c) {
  const cx = num(c?.cx, 0, 1), cy = num(c?.cy, 0, 1), z = num(c?.z, 1, 8)
  return cx == null || cy == null || z == null ? null : { cx, cy, z }
}
const picCache = new Map()     // id → { v, url }

// a file path or data: URL → square PNG buffer (center crop, keeps transparency)
function squarePng (src) {
  const img = typeof src === "string" && src.startsWith("data:image/")
    ? nativeImage.createFromDataURL(src)
    : nativeImage.createFromPath(String(src))
  if (img.isEmpty()) throw new Error("Couldn't read that image")
  const { width, height } = img.getSize()
  const side = Math.min(width, height)
  const sq = img.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side })
  return (side > PIC_SIZE ? sq.resize({ width: PIC_SIZE, height: PIC_SIZE, quality: "best" }) : sq).toPNG()
}

const readImage = (src) => {
  const img = typeof src === "string" && src.startsWith("data:image/")
    ? nativeImage.createFromDataURL(src)
    : nativeImage.createFromPath(String(src))
  if (img.isEmpty()) throw new Error("Couldn't read that image")
  return img
}
// any image (file path or data: URL, HEIC too) → PNG no bigger than ORIG_MAX on its long side
function fitPng (src) {
  const img = readImage(src)
  const { width, height } = img.getSize()
  const k = Math.min(1, ORIG_MAX / Math.max(width, height))
  return (k < 1 ? img.resize({ width: Math.round(width * k), height: Math.round(height * k), quality: "best" }) : img).toPNG()
}

function picUrl (p) {
  if (!p?.pic) return null
  const hit = picCache.get(p.id)
  if (hit?.v === p.pic) return hit.url
  try {
    const url = `data:image/png;base64,${fs.readFileSync(picFile(p.id)).toString("base64")}`
    picCache.set(p.id, { v: p.pic, url })
    return url
  } catch { return null }
}
const withPic = (p) => (p ? { ...p, picUrl: picUrl(p) } : p)

const profiles = {
  BASE,
  DEFAULT_ID,
  list () { return data.list.map(withPic) },
  get (id) { return data.list.find((p) => p.id === id) ?? null },
  // "active" = the profile of the last-focused window: the default for a new
  // window and for a launch with nothing to restore
  activeId () { return data.active },
  current () { return withPic(this.get(data.active)) },
  squarePng,
  fitPng,
  original (id) {
    try { return `data:image/png;base64,${fs.readFileSync(origFile(id)).toString("base64")}` } catch { return null }
  },
  dir (id = data.active) { return dirFor(id) },
  partition (id = data.active) { return partitionFor(id) },
  session (id = data.active) { return session.fromPartition(partitionFor(id)) },
  privatePartition (id = data.active) { return privatePartitionFor(id) },
  // ids whose windows are open (restored on launch), focus order, last = front
  openIds () { return data.open.filter((id) => this.get(id)) },
  setOpen (ids) {
    const next = [...new Set(ids)].filter((id) => this.get(id))
    if (next.length === data.open.length && next.every((id, i) => id === data.open[i])) return
    data.open = next
    save()
  },

  // seed: the new profile's first config.json (written before it is ever opened)
  create (patch, seed) {
    let id
    do { id = crypto.randomBytes(4).toString("hex") } while (this.get(id))
    const p = { id, name: "Profile", color: "#30d158", emoji: "", ...clean(patch ?? {}) }
    fs.mkdirSync(dirFor(id), { recursive: true })
    if (seed) fs.writeFileSync(path.join(dirFor(id), "config.json"), JSON.stringify(seed, null, 2))
    data.list.push(p)
    if (typeof patch?.picture === "string") try { this.setPicture(id, patch.picture, patch) } catch (e) { console.error("[profiles] picture", e.message) }
    save()
    return withPic(p)
  },
  update (id, patch) {
    const p = this.get(id)
    if (!p) return null
    Object.assign(p, clean(patch ?? {}))
    if (typeof patch?.picture === "string") this.setPicture(id, patch.picture, patch)
    else if (patch?.picture === null) this.clearPicture(id)
    save()
    return withPic(p)
  },
  // src: a data: URL or a file path; throws if it isn't an image
  // extra.pictureOriginal: the uncropped image; extra.picCrop: { cx, cy, z } to reopen the editor where it was
  setPicture (id, src, extra = {}) {
    const p = this.get(id)
    if (!p) return null
    const big = (v) => typeof v === "string" && v.length > 40_000_000
    if (big(src) || big(extra.pictureOriginal)) throw new Error("That image is too large")
    const png = squarePng(src)
    const orig = typeof extra.pictureOriginal === "string" ? fitPng(extra.pictureOriginal) : null
    fs.mkdirSync(dirFor(id), { recursive: true })
    fs.writeFileSync(picFile(id), png)
    if (orig) fs.writeFileSync(origFile(id), orig)
    const crop = cleanCrop(extra.picCrop)
    if (crop) p.picCrop = crop; else if (orig) delete p.picCrop
    p.pic = Date.now()
    save()
    return withPic(p)
  },
  clearPicture (id) {
    const p = this.get(id)
    if (!p) return null
    delete p.pic
    delete p.picCrop
    picCache.delete(id)
    for (const f of [picFile(id), origFile(id)]) try { fs.rmSync(f, { force: true }) } catch {}
    save()
    return withPic(p)
  },
  // ids: the whole list in its new order (a permutation of every profile's id).
  // List order is what ⌃⌘1…9, the menus and every picker follow.
  reorder (ids) {
    if (!Array.isArray(ids) || ids.length !== data.list.length || ids.some((id) => typeof id !== "string")) return { ok: false }
    if (new Set(ids).size !== ids.length || !ids.every((id) => this.get(id))) return { ok: false }
    if (ids.every((id, i) => id === data.list[i].id)) return { ok: true, changed: false }
    data.list = ids.map((id) => this.get(id))
    save()
    return { ok: true, changed: true }
  },
  setActive (id) {
    if (!this.get(id)) return false
    if (data.active === id) return true
    data.active = id
    save()
    return true
  },
  // the first profile is the original data dir, so it can be renamed but not removed;
  // removed profiles go to the Trash (reversible), never rm -rf
  async remove (id) {
    if (id === DEFAULT_ID) return { ok: false, text: "The first profile can be renamed but not removed." }
    if (!this.get(id)) return { ok: false, text: "No such profile." }
    // main refuses to remove the asking window's own profile and closes the
    // target's window first; here the last-focused marker just falls back
    try {
      const ses = this.session(id)
      await ses.clearStorageData()
      await ses.clearCache()
    } catch (e) { console.error("[profiles] clear partition", e.message) }
    for (const dir of [dirFor(id), path.join(BASE, "Partitions", `comet-${id}`)]) {
      if (!fs.existsSync(dir)) continue
      try { await shell.trashItem(dir) } catch (e) { console.error("[profiles] trash", dir, e.message) }
    }
    data.list = data.list.filter((p) => p.id !== id)
    data.open = data.open.filter((x) => x !== id)
    if (data.active === id) data.active = DEFAULT_ID
    save()
    return { ok: true }
  }
}

module.exports = { profiles }
