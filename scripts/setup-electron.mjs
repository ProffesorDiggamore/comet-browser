#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────
//  setup-electron.mjs — make `node_modules/electron` runnable.
//
//  Electron's bundled postinstall (install.js) unzips into dist/ using
//  extract-zip, which on this project path silently truncates — likely
//  the "&" / space in "…/Dev & Code/…".  Result: no Frameworks/, no
//  path.txt, "Electron failed to install correctly".
//
//  This does the extraction with macOS `ditto` (handles .app bundles +
//  symlinks correctly) from the already-downloaded @electron/get cache,
//  then writes path.txt.  No network, no npm scripts needed.
//  Runs itself from start.command whenever path.txt is missing.
// ───────────────────────────────────────────────────────────────────
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const ELECTRON_DIR = path.resolve(import.meta.dirname, "..", "node_modules", "electron")
const DIST = path.join(ELECTRON_DIR, "dist")
const PATH_TXT = path.join(ELECTRON_DIR, "path.txt")
const BIN_REL = "Electron.app/Contents/MacOS/Electron"

function ok () {
  return fs.existsSync(PATH_TXT) &&
    fs.existsSync(path.join(DIST, "Electron.app/Contents/Frameworks/Electron Framework.framework"))
}

if (ok()) {
  console.log("[setup-electron] already good.")
  process.exit(0)
}

if (process.platform !== "darwin") {
  console.error("[setup-electron] this helper is macOS-only. On other platforms run: npm rebuild electron")
  process.exit(1)
}

const version = JSON.parse(fs.readFileSync(path.join(ELECTRON_DIR, "package.json"), "utf8")).version
const arch = process.arch // arm64 | x64
const zipName = `electron-v${version}-darwin-${arch}.zip`
const cacheRoot = path.join(os.homedir(), "Library", "Caches", "electron")

function findZip (dir) {
  if (!fs.existsSync(dir)) return null
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) { const hit = findZip(full); if (hit) return hit }
    else if (entry.name === zipName && fs.statSync(full).size > 50_000_000) return full
  }
  return null
}

let zip = findZip(cacheRoot)

if (!zip) {
  const url = `https://github.com/electron/electron/releases/download/v${version}/${zipName}`
  const dest = path.join(cacheRoot, zipName)
  console.log(`[setup-electron] no cached zip — downloading ${zipName}`)
  fs.mkdirSync(cacheRoot, { recursive: true })
  execFileSync("curl", ["-L", "--fail", "--progress-bar", "-o", dest, url], { stdio: "inherit" })
  zip = dest
}

console.log(`[setup-electron] extracting ${path.basename(zip)} → dist/`)
fs.rmSync(DIST, { recursive: true, force: true })
fs.mkdirSync(DIST, { recursive: true })
execFileSync("ditto", ["-x", "-k", "--noqtn", zip, DIST], { stdio: "inherit" })
fs.writeFileSync(PATH_TXT, BIN_REL)

const APP = path.join(DIST, "Electron.app")

// The zip is downloaded over https, so the extracted app carries
// com.apple.quarantine.  Combined with iCloud FinderInfo churn that can
// break the notarized signature, macOS XProtect then flags Electron.app
// as malware and moves it to Trash.  Clear the flag and ad-hoc re-sign
// so Gatekeeper/XProtect leave it alone.
try {
  execFileSync("xattr", ["-cr", APP], { stdio: "inherit" })
} catch (e) {
  console.warn("[setup-electron] xattr clear failed (continuing):", e.message)
}
try {
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", APP], { stdio: "inherit" })
  console.log("[setup-electron] ad-hoc signed Electron.app")
} catch (e) {
  console.warn("[setup-electron] codesign failed (continuing):", e.message)
}

if (!ok()) {
  console.error(`
[setup-electron] Electron.app is still incomplete after extraction.

macOS XProtect is removing it. Fix, then re-run 'npm run fix-electron':
  1. Move this project OUT of ~/Documents (iCloud): e.g.  ~/Developer/flux
  2. Ensure the folder path has no '&' or spaces
  3. Check for a macOS update:  softwareupdate -l
`)
  process.exit(1)
}
console.log("[setup-electron] done. `npm start` will work now.")
