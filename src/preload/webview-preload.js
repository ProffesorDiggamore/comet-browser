// ───────────────────────────────────────────────────────────────────
//  webview-preload.js — injected into every browsed page.  Kept tiny:
//  browser shortcuts live in the app menu (they work with a page
//  focused), so this only relays ⌘-combos for user Hot Tab hotkeys and
//  Escape, the passkey hint, and Easy Files (file pickers offer the
//  clipboard).  No page content is read; the host only learns the
//  picker's accept / multiple attributes and where it was clicked.
// ───────────────────────────────────────────────────────────────────
const { ipcRenderer } = require("electron")

// Passkeys / WebAuthn platform authenticators don't work inside an Electron
// <webview> — the call never resolves and no OS prompt appears.  Detect an
// active (non-conditional) attempt and tell the host so it can offer the
// system browser.  The original call is still invoked.
try {
  const cred = navigator.credentials
  const wrap = (name) => {
    const orig = cred[name]?.bind(cred)
    if (!orig) return
    cred[name] = function (opts) {
      const isConditional = opts && opts.mediation === "conditional"
      if (opts && opts.publicKey && !isConditional) {
        ipcRenderer.sendToHost("flux-webauthn", location.href)
      }
      return orig(opts)
    }
  }
  wrap("get")
  wrap("create")
} catch { /* page has no credentials API */ }

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { ipcRenderer.sendToHost("flux-key", { key: "Escape" }); return }
  if (!(e.metaKey || e.ctrlKey)) return
  ipcRenderer.sendToHost("flux-key", { key: e.key, shift: e.shiftKey, alt: e.altKey })
}, true)

// Easy Files (Opera GX-style): a file <input> opens Flux's picker — what
// you copied and your newest downloads — instead of the bare OS dialog.
// The chosen files are set on the input exactly as if the user picked them.
const pending = new Map()
let reqSeq = 0
let easyFiles = true
try { easyFiles = ipcRenderer.sendSync("flux:files:enabled") !== false } catch {}

// label / button-triggered inputs are often hidden (zero rect, zero coords):
// anchor the picker where the user actually clicked
let lastPointer = null
document.addEventListener("pointerdown", (e) => { lastPointer = { x: e.clientX, y: e.clientY } }, true)

document.addEventListener("click", (e) => {
  const input = e.target
  if (!easyFiles || !(input instanceof HTMLInputElement) || input.type !== "file" || input.disabled) return
  if (input.webkitdirectory) return   // folder uploads keep the native picker
  e.preventDefault()
  e.stopImmediatePropagation()
  const id = `fp_${++reqSeq}`
  pending.set(id, input)
  const r = input.getBoundingClientRect()
  const visible = r.width > 0 && r.height > 0
  const x = e.clientX || (visible ? r.left + r.width / 2 : lastPointer?.x ?? 40)
  const y = e.clientY || (visible ? r.bottom : lastPointer?.y ?? 40)
  ipcRenderer.sendToHost("flux-file-pick", { id, accept: input.accept || "", multiple: !!input.multiple, x, y })
}, true)

ipcRenderer.on("flux-file-result", (_e, { id, files }) => {
  const input = pending.get(id)
  pending.delete(id)
  if (!input || !files?.length) return
  const dt = new DataTransfer()
  for (const f of input.multiple ? files : files.slice(0, 1)) {
    dt.items.add(new File([f.data], f.name, { type: f.type, lastModified: f.lastModified || Date.now() }))
  }
  input.files = dt.files
  input.dispatchEvent(new Event("input", { bubbles: true, composed: true }))
  input.dispatchEvent(new Event("change", { bubbles: true, composed: true }))
})
