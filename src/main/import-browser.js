// ───────────────────────────────────────────────────────────────────
//  import-browser.js — read passwords / bookmarks / history from a
//  local Chromium-family browser profile (Opera GX and friends).
//
//  100% local.  Passwords are decrypted with the browser's own key
//  from the macOS Keychain — reading it prompts the user to Allow,
//  so the user consciously authorises every run.  Nothing is sent
//  anywhere; results go straight into Comet's encrypted vault.
// ───────────────────────────────────────────────────────────────────
const { execFileSync } = require("node:child_process")
const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const SUPPORT = path.join(os.homedir(), "Library", "Application Support")

// id → { name, dir (under Application Support), keychainService, keychainAccount }
const BROWSERS = {
  operagx: { name: "Opera GX", dir: "com.operasoftware.OperaGX", svc: "Opera GX Safe Storage", acct: "Opera GX" },
  opera:   { name: "Opera",    dir: "com.operasoftware.Opera",   svc: "Opera Safe Storage",    acct: "Opera" },
  chrome:  { name: "Chrome",   dir: "Google/Chrome",             svc: "Chrome Safe Storage",   acct: "Chrome" },
  brave:   { name: "Brave",    dir: "BraveSoftware/Brave-Browser", svc: "Brave Safe Storage",  acct: "Brave" },
  edge:    { name: "Edge",     dir: "Microsoft Edge",            svc: "Microsoft Edge Safe Storage", acct: "Microsoft Edge" }
}

function profileDir (b) {
  // most installs keep data in <root>/Default; fall back to <root>
  const root = path.join(SUPPORT, b.dir)
  const def = path.join(root, "Default")
  if (fs.existsSync(path.join(def, "Bookmarks")) || fs.existsSync(path.join(def, "Login Data"))) return def
  return fs.existsSync(root) ? root : null
}

function listSources () {
  return Object.entries(BROWSERS).map(([id, b]) => {
    const dir = profileDir(b)
    return { id, name: b.name, present: Boolean(dir), profileDir: dir }
  })
}

// ---- crypto (Chromium macOS v10 scheme) --------------------------
// The Safe Storage password lives in the login keychain.  Reading it with
// `security` normally shows a "wants to use a key in your keychain" prompt.
// If the keychain item's ACL is locked to the source browser only, macOS
// denies WITHOUT a prompt — the user then has to allow it once in
// Keychain Access.app (or run `security find-generic-password` in Terminal).
function keychainRaw (b) {
  const services = [b.svc, `${b.name} Safe Storage`, "Chromium Safe Storage"]
  const accounts = [b.acct, b.name, "Chromium"]
  let lastErr = ""
  for (const s of services) {
    for (const a of accounts) {
      try {
        return execFileSync("/usr/bin/security",
          ["find-generic-password", "-w", "-s", s, "-a", a],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
      } catch (e) {
        lastErr = (e.stderr || e.message || "").toString().trim()
      }
    }
  }
  const denied = /denied|not be found|interaction|authoriz/i.test(lastErr)
  throw new Error(denied
    ? `macOS would not release ${b.name}'s keychain key without a prompt. Fix once: open Keychain Access, search "${b.svc}", double-click it, Access Control tab, choose "Allow all applications" (or add /usr/bin/security). Then import again.`
    : (lastErr || "Could not read the keychain."))
}

function keychainKey (b) {
  return crypto.pbkdf2Sync(keychainRaw(b), "saltysalt", 1003, 16, "sha1")
}

function decryptBlob (buf, key) {
  if (!buf || buf.length === 0) return ""
  const prefix = buf.slice(0, 3).toString("latin1")
  if (prefix !== "v10" && prefix !== "v11") return buf.toString("utf8")  // legacy / plaintext
  const iv = Buffer.alloc(16, 0x20)
  const d = crypto.createDecipheriv("aes-128-cbc", key, iv)
  d.setAutoPadding(false)
  let out = Buffer.concat([d.update(buf.slice(3)), d.final()])
  const pad = out[out.length - 1]
  if (pad > 0 && pad <= 16) out = out.slice(0, out.length - pad)
  // some builds prepend a 32-byte SHA-256 of the origin; strip if it looks binary
  if (out.length > 32 && out.slice(0, 32).some((c) => c < 9)) out = out.slice(32)
  return out.toString("utf8")
}

// ---- sqlite via the system binary (zero-dep) -------------------
function sqliteRows (dbPath, sql) {
  const tmp = path.join(os.tmpdir(), `comet-imp-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
  fs.copyFileSync(dbPath, tmp)
  try {
    const out = execFileSync("/usr/bin/sqlite3", ["-json", tmp, sql], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    return out.trim() ? JSON.parse(out) : []
  } finally {
    try { fs.unlinkSync(tmp) } catch {}
  }
}

// ---- public readers -----------------------------------------
function readLogins (sourceId) {
  const b = BROWSERS[sourceId]
  const dir = b && profileDir(b)
  if (!dir) return { ok: false, error: "Profile not found." }
  const db = path.join(dir, "Login Data")
  if (!fs.existsSync(db)) return { ok: false, error: "No Login Data file." }

  let key
  try { key = keychainKey(b) }
  catch (e) { return { ok: false, error: e.message } }

  let rows
  try { rows = sqliteRows(db, "SELECT origin_url url, username_value username, hex(password_value) pw FROM logins") }
  catch (e) { return { ok: false, error: `Could not read Login Data: ${e.message}` } }

  const entries = []
  for (const r of rows) {
    if (!r.url) continue
    let password = ""
    try { password = decryptBlob(Buffer.from(r.pw || "", "hex"), key) } catch { /* skip undecryptable */ }
    entries.push({ url: r.url, username: r.username || "", password })
  }
  return { ok: true, entries }
}

function readBookmarks (sourceId) {
  const b = BROWSERS[sourceId]
  const dir = b && profileDir(b)
  if (!dir) return { ok: false, error: "Profile not found." }
  const file = path.join(dir, "Bookmarks")
  if (!fs.existsSync(file)) return { ok: false, error: "No Bookmarks file." }
  let json
  try { json = JSON.parse(fs.readFileSync(file, "utf8")) } catch (e) { return { ok: false, error: e.message } }
  const out = []
  const walk = (node, folder) => {
    if (!node) return
    if (node.type === "url" && node.url) out.push({ title: node.name || node.url, url: node.url, folder })
    for (const c of node.children ?? []) walk(c, node.type === "folder" ? (node.name || folder) : folder)
  }
  for (const root of Object.values(json.roots ?? {})) walk(root, "")
  return { ok: true, bookmarks: out }
}

function readHistory (sourceId, limit = 300) {
  const b = BROWSERS[sourceId]
  const dir = b && profileDir(b)
  if (!dir) return { ok: false, error: "Profile not found." }
  const db = path.join(dir, "History")
  if (!fs.existsSync(db)) return { ok: false, error: "No History file." }
  try {
    const rows = sqliteRows(db,
      `SELECT url, title, visit_count visits, last_visit_time last FROM urls ORDER BY visit_count DESC LIMIT ${Number(limit) || 300}`)
    return { ok: true, history: rows.map((r) => ({ url: r.url, title: r.title || r.url, visits: r.visits || 0 })) }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

module.exports = { listSources, readLogins, readBookmarks, readHistory }
