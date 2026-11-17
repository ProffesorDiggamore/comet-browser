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

// ⌘ + the arrows along the tab strip switch tabs: ↑ ↓ with the sidebar, ← → with
// tabs on top (Comet says which).  Text fields keep ⌘-arrow for the caret.
let tabAxis = "v"
ipcRenderer.on("flux:tab-axis", (_e, a) => { tabAxis = a === "h" ? "h" : "v" })
const TAB_KEYS = { v: ["ArrowUp", "ArrowDown"], h: ["ArrowLeft", "ArrowRight"] }
const editable = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { ipcRenderer.sendToHost("flux-key", { key: "Escape" }); return }
  if (!(e.metaKey || e.ctrlKey)) return
  const edit = editable(document.activeElement)
  if (e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && !edit && TAB_KEYS[tabAxis].includes(e.key)) e.preventDefault()
  ipcRenderer.sendToHost("flux-key", { key: e.key, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey, ctrl: e.ctrlKey, editable: edit })
}, true)

// clicks in the page don't reach Comet's window, so say so: open menus and
// popovers close on it (click-away)
window.addEventListener("pointerdown", (e) => { if (e.isTrusted) ipcRenderer.sendToHost("flux-page-down") }, { capture: true, passive: true })

// Two-finger swipe left / right → back / forward, like Safari.  The page only
// reports how far a sideways scroll has travelled (and when it crosses the
// line); the host draws the arrow and decides whether there is anywhere to go.
// Ignored when the page itself scrolls sideways there or handles the wheel.
{
  const TRIGGER = 230          // px of sideways travel that commits
  let sx = 0, sy = 0, last = 0, done = false, off = false, sent = 0
  const sideways = (el, dx) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.scrollWidth - n.clientWidth < 2) continue
      const ox = getComputedStyle(n).overflowX
      if (n !== document.documentElement && n !== document.body && ox !== "auto" && ox !== "scroll") continue
      if (dx < 0 ? n.scrollLeft > 0 : n.scrollLeft < n.scrollWidth - n.clientWidth - 1) return true
    }
    return false
  }
  const report = (p) => { if (p === sent) return; sent = p; ipcRenderer.sendToHost("flux-swipe", { p }) }
  window.addEventListener("wheel", (e) => {
    if (e.timeStamp - last > 180) { sx = 0; sy = 0; done = false; off = false; report(0) }   // a new gesture
    last = e.timeStamp
    if (done || off) return
    if (e.defaultPrevented || e.ctrlKey || e.shiftKey || (e.deltaX && sideways(e.target, e.deltaX))) { off = true; report(0); return }
    sx += e.deltaX; sy += e.deltaY
    if (Math.abs(sy) > 24 && Math.abs(sy) > Math.abs(sx)) { off = true; report(0); return }   // it's a vertical scroll
    const p = Math.max(-1, Math.min(1, sx / TRIGGER))
    if (Math.abs(p - sent) >= 0.04 || Math.abs(p) === 1) report(Math.round(p * 100) / 100)
    if (Math.abs(sx) >= TRIGGER) { done = true; ipcRenderer.sendToHost("flux-swipe", { go: sx < 0 ? "back" : "forward" }) }
  }, { passive: true })
}

// Easy Files (Opera GX-style): a file <input> opens Comet's picker — what
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

// Autofill: when a login field gets focus, tell the host where it is; the
// host shows saved logins from every profile (each with its profile's
// avatar) as an overlay.  The page never sees a password until the user
// picks one there.  On submit, the typed login goes to the host so it can
// offer to save it.  Only the top frame, only real (trusted) user input.
if (window === window.top) {
  const USERISH = /user|login|email|mail|account|ident|phone/i
  let field = null       // the login input that has focus
  let menuOpen = false

  const pwIn = (root) => [...(root || document).querySelectorAll("input[type=password]")].filter((el) => !el.disabled && el.offsetParent !== null)
  const scopeOf = (el) => el.form || el.closest("form,[role=dialog],main,body") || document.body
  const userFor = (pw) => {
    const scope = scopeOf(pw)
    const ac = scope.querySelector('input[autocomplete~="username"],input[autocomplete~="email"]')
    if (ac) return ac
    const all = [...scope.querySelectorAll("input")].filter((x) => x.offsetParent !== null && !x.disabled)
    for (let j = all.indexOf(pw) - 1; j >= 0; j--) {
      const t = (all[j].type || "text").toLowerCase()
      if (t === "text" || t === "email" || t === "tel") return all[j]
    }
    return null
  }
  // a login input: a password box, or a username/email box on a page that has one
  // (or a lone username step like Google's, which asks for the password next)
  const isLoginInput = (el) => {
    if (!(el instanceof HTMLInputElement) || el.disabled || el.readOnly) return false
    const t = (el.type || "text").toLowerCase()
    if (t === "password") return !/new-password/.test(el.autocomplete)
    if (t !== "text" && t !== "email" && t !== "tel") return false
    if (/username|email/.test(el.autocomplete)) return true
    const hint = `${el.name} ${el.id} ${el.placeholder} ${el.getAttribute("aria-label") || ""}`
    return USERISH.test(hint) && (pwIn(scopeOf(el)).length > 0 || /username|email|login/i.test(hint))
  }
  const report = () => {
    if (!field) return
    const r = field.getBoundingClientRect()
    ipcRenderer.sendToHost("flux-login-field", { x: r.left, y: r.bottom, w: r.width, top: r.top, url: location.href })
  }

  document.addEventListener("focusin", (e) => {
    if (!e.isTrusted || !isLoginInput(e.target)) return
    field = e.target
    report()
  }, true)
  document.addEventListener("focusout", (e) => {
    // two-step logins (username page, then password page): remember the name
    const t = e.target
    if (t instanceof HTMLInputElement && t.type !== "password" && t.value && t === field && !pwIn().length) {
      try { sessionStorage.setItem("__cometLoginUser", t.value) } catch {}
    }
    if (e.target !== field) return
    field = null
    ipcRenderer.sendToHost("flux-login-blur")
  }, true)
  // clicking an already-focused field reopens the list
  document.addEventListener("mousedown", (e) => { if (e.isTrusted && e.target === field && !menuOpen) setTimeout(report, 0) }, true)
  window.addEventListener("scroll", () => { if (menuOpen) report() }, { passive: true, capture: true })
  window.addEventListener("resize", () => { if (menuOpen) report() })

  // while the list is open, arrows / Enter / Escape drive it
  document.addEventListener("keydown", (e) => {
    if (!menuOpen || !field || !e.isTrusted) return
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === "Escape") {
      e.preventDefault(); e.stopImmediatePropagation()
      ipcRenderer.sendToHost("flux-login-key", e.key)
    } else if (e.key.length === 1 || e.key === "Backspace") {
      ipcRenderer.sendToHost("flux-login-key", "type")
    }
  }, true)
  ipcRenderer.on("flux-login-menu", (_e, open) => { menuOpen = !!open })

  const setVal = (el, v) => {
    if (!el) return
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
    el.focus()
    set.call(el, v)
    el.dispatchEvent(new Event("input", { bubbles: true }))
    el.dispatchEvent(new Event("change", { bubbles: true }))
  }
  ipcRenderer.on("flux-login-fill", (_e, { username, password }) => {
    const at = field && document.contains(field) ? field : document.activeElement
    let pw = at instanceof HTMLInputElement && at.type === "password" ? at : pwIn(at ? scopeOf(at) : document)[0] || pwIn()[0] || null
    let user = pw ? userFor(pw) : (at instanceof HTMLInputElement && at.type !== "password" ? at : null)
    if (at instanceof HTMLInputElement && at.type !== "password") user = at
    if (user && username) setVal(user, username)
    if (pw && password) setVal(pw, password)
    menuOpen = false
  })

  // offer to save what was just typed
  let lastSent = ""
  const capture = (scope) => {
    const pw = pwIn(scope).find((x) => x.value)
    if (!pw || /new-password/.test(pw.autocomplete) && pwIn(scope).length > 1) return
    const user = userFor(pw)
    let username = user?.value || ""
    if (!username) try { username = sessionStorage.getItem("__cometLoginUser") || "" } catch {}
    const key = `${location.host}\n${username}\n${pw.value}`
    if (key === lastSent) return
    lastSent = key
    ipcRenderer.sendToHost("flux-login-submit", { url: location.href, username, password: pw.value })
  }
  document.addEventListener("submit", (e) => { if (e.target instanceof HTMLFormElement) capture(e.target) }, true)
  // SPA logins with no <form>: Enter in a password box, or a click on a submit-ish button
  document.addEventListener("keydown", (e) => {
    if (e.isTrusted && e.key === "Enter" && e.target instanceof HTMLInputElement && e.target.type === "password" && !menuOpen) capture(scopeOf(e.target))
  }, true)
  document.addEventListener("click", (e) => {
    if (!e.isTrusted) return
    const b = e.target instanceof Element && e.target.closest('button,[type=submit],[role=button]')
    if (!b || !/log ?in|sign ?in|continue|next|submit|enter/i.test(b.textContent + " " + (b.value || "") + " " + (b.getAttribute("aria-label") || ""))) return
    const scope = scopeOf(b)
    if (pwIn(scope).some((x) => x.value)) capture(scope)
  }, true)
}
