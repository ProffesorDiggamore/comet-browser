// ───────────────────────────────────────────────────────────────────
//  extensions.js — load unpacked Chrome-style extensions into the
//  default session.  Electron supports a useful subset of MV2/MV3
//  (content scripts, action popups, storage, most chrome.* stubs).
// ───────────────────────────────────────────────────────────────────
const fs = require("node:fs")
const { store } = require("./store")

// Electron 36+ moved these onto session.extensions (the session methods are deprecated)
const api = (ses) => ses.extensions ?? ses

async function loadSavedExtensions (ses) {
  const paths = store.get("extensions.paths") ?? []
  const kept = []
  for (const p of paths) {
    if (!fs.existsSync(p)) continue
    try {
      await api(ses).loadExtension(p, { allowFileAccess: true })
      kept.push(p)
    } catch (e) {
      console.error("[ext] load failed", p, e.message)
    }
  }
  if (kept.length !== paths.length) store.set("extensions.paths", kept)
}

async function addExtension (ses, dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return { ok: false, text: "Folder not found." }
  try {
    const ext = await api(ses).loadExtension(dirPath, { allowFileAccess: true })
    const paths = new Set(store.get("extensions.paths") ?? [])
    paths.add(dirPath)
    store.set("extensions.paths", [...paths])
    return { ok: true, ext: { id: ext.id, name: ext.name, version: ext.version, path: dirPath } }
  } catch (e) {
    return { ok: false, text: e.message }
  }
}

async function removeExtension (ses, id) {
  try {
    const all = api(ses).getAllExtensions()
    const found = all.find((x) => x.id === id)
    api(ses).removeExtension(id)
    if (found?.path) {
      const paths = (store.get("extensions.paths") ?? []).filter((p) => p !== found.path)
      store.set("extensions.paths", paths)
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, text: e.message }
  }
}

function listExtensions (ses) {
  return api(ses).getAllExtensions().map((x) => ({ id: x.id, name: x.name, version: x.version, path: x.path }))
}

module.exports = { loadSavedExtensions, addExtension, removeExtension, listExtensions }
