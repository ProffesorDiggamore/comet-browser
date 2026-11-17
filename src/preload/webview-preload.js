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
// a field with text keeps ⌘-arrow for its caret; an empty one has nothing to move
const editable = (el) => !!el && (el.isContentEditable ? !!el.textContent : /^(INPUT|TEXTAREA)$/.test(el.tagName) ? el.value !== "" : el.tagName === "SELECT")

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

// ⇧-click a link: Comet opens it in Peek, a preview sheet over this page
// (Settings → Layout can turn that back into a plain new tab)
window.addEventListener("click", (e) => {
  if (!e.isTrusted || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.button !== 0) return
  const a = e.target && e.target.closest && e.target.closest("a[href]")
  if (!a || !/^https?:/i.test(a.href)) return
  e.preventDefault(); e.stopImmediatePropagation()
  ipcRenderer.sendToHost("flux-peek", a.href)
}, true)

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
// host shows this window's profile's saved logins (never another
// profile's) as an overlay.  The page never sees a password until the user
// picks one there.  On submit, the typed login goes to the host, which
// waits for the page to settle before offering to save / update it.
// Only the top frame, only real (trusted) user input.
if (window === window.top) {
  // words that mean "who you are", in a few languages
  const USERISH = /user|login|log-in|e-?mail|mail|account|ident|phone|mobile|benutzer|nutzer|anmeld|usuario|correo|utilisateur|identifiant|courriel|utente|gebruiker|conta|telefon|ユーザ|メール|아이디|이메일|用户|账号|帳號|邮箱|手机/i
  // text boxes that are never the username
  const NOT_USER = /search|query|captcha|otp|one.?time|2fa|mfa|totp|token|verif|\bcode\b|_code|code_|\bpin\b|coupon|promo|newsletter|subscri|confirm|repeat|retype|again|first.?name|last.?name|full.?name|given.?name|family.?name|street|city|zip|postal/i
  const SUBMITISH = /log ?in|sign ?in|sign ?on|continue|next|submit|enter|anmelden|weiter|connexion|suivant|entrar|iniciar|siguiente|accedi|avanti|create|register|sign ?up|join|save|update|change/i
  const FAILED = /incorrect|invalid|wrong|try again|not (?:recogni[sz]ed|correct|valid|match|found)|does ?n.?t (?:match|exist)|did ?n.?t match|unable to (?:sign|log)|could ?n.?t (?:sign|log|find)|failed|too many|locked|unknown (?:user|e-?mail|account)|no account|falsch|ungültig|incorrect[oa]|inválid|erron[ée]|non valide|errat|onjuist/i
  const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/
  const TEXTY = /^(text|email|tel|number)$/
  const MEM = "__cometLoginUser"
  let field = null       // the login input that has focus
  let menuOpen = false

  const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"
  const pwIn = (root) => [...(root || document).querySelectorAll("input[type=password]")].filter((el) => !el.disabled && shown(el))
  const hintOf = (el) => {
    let s = `${el.name} ${el.id} ${el.placeholder} ${el.getAttribute("aria-label") || ""} ${el.autocomplete}`
    for (const l of el.labels || []) s += " " + l.textContent
    for (const id of (el.getAttribute("aria-labelledby") || "").split(/\s+/)) if (id) s += " " + (document.getElementById(id)?.textContent || "")
    return s.slice(0, 300)
  }
  const searchy = (el) => el.type === "search" || /^(q|query|s|search|keywords?)$/i.test(el.name) || !!el.closest("[role=search]")
  const textBox = (el) => el instanceof HTMLInputElement && !el.disabled && TEXTY.test(el.type) && !searchy(el) && (/username|email/.test(el.autocomplete) || !NOT_USER.test(hintOf(el)))
  // the login's own box: its <form>, else the nearest ancestor that also
  // holds the other half of the login (so a page's search box or footer
  // newsletter never counts)
  const scopeOf = (el) => {
    if (el.form) return el.form
    const pw = el.type === "password"
    for (let n = el.parentElement, i = 0; n && n !== document.body && i < 10; n = n.parentElement, i++) {
      if (pw ? [...n.querySelectorAll("input")].some((x) => x !== el && textBox(x) && shown(x)) : pwIn(n).length) return n
    }
    return el.closest("[role=dialog],main") || document.body
  }
  // the username for a password field (or, with pw null, the identifier in a
  // scope): every candidate is scored, best wins
  const userFor = (pw, needValue, scope = pw ? scopeOf(pw) : document.body) => {
    const all = [...scope.querySelectorAll("input")]
    const pi = pw ? all.indexOf(pw) : -1
    let best = null, top = pw ? 0 : 39
    all.forEach((el, i) => {
      if (el === pw || !textBox(el) || (needValue && !el.value.trim())) return
      if (pw && el.form && pw.form && el.form !== pw.form) return
      const ac = (el.autocomplete || "").toLowerCase()
      let s = /\busername\b/.test(ac) ? 100 : /\bemail\b/.test(ac) ? 90 : /\btel\b/.test(ac) ? 40 : 0
      if (el.type === "email") s += 60
      if (USERISH.test(hintOf(el))) s += 40
      if (EMAIL.test(el.value)) s += 25
      if (el.type === "number") s -= 10
      if (pi >= 0) s += i < pi ? 25 - Math.min(20, (pi - i) * 4) : -15
      s += shown(el) ? 10 : -35
      if (s > top) { top = s; best = el }
    })
    return best
  }
  // which password to keep: a sign-up / change form has a new one (and a confirm)
  const pickPw = (scope) => {
    const pws = pwIn(scope).filter((x) => x.value)
    if (!pws.length) return null
    const nw = pws.filter((x) => /new-password/.test(x.autocomplete) || /\bnew\b|neu|nouveau|nuevo/i.test(hintOf(x)))
    const cur = pws.filter((x) => /current-password/.test(x.autocomplete) || /current|old|existing|aktuell|actuel/i.test(hintOf(x)))
    if (nw.length) return { pw: nw[0], kind: cur.length || pws.length > nw.length ? "change" : "new" }
    if (pws.length >= 3) return { pw: pws[1], kind: "change" }
    if (pws.length === 2) return pws[0].value === pws[1].value ? { pw: pws[0], kind: "new" } : { pw: pws[1], kind: "change" }
    return { pw: pws[0], kind: "login" }
  }
  // no username box on a password-only step: "Signed in as …" text near it
  const shownIdent = (scope) => {
    for (let n = scope, i = 0; n && i < 4; n = n.parentElement, i++) {
      const m = (n.innerText || "").slice(0, 4000).match(EMAIL)
      if (m) return m[0]
    }
    return ""
  }
  // a login input: a password box, or a username/email box on a page that has one
  // (or a lone username step like Google's, which asks for the password next)
  const isLoginInput = (el) => {
    if (!(el instanceof HTMLInputElement) || el.disabled || el.readOnly) return false
    if (el.type === "password") return !/new-password/.test(el.autocomplete)
    if (!textBox(el)) return false
    if (/username|email/.test(el.autocomplete)) return true
    const hint = hintOf(el)
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
  // two-step logins (username page, then password page): remember the name,
  // here and with the host (which keeps it per tab + site for a few minutes)
  const remember = (name) => {
    if (!name) return
    try { sessionStorage.setItem(MEM, name) } catch {}
    ipcRenderer.sendToHost("flux-login-ident", { url: location.href, username: name })
  }
  document.addEventListener("focusout", (e) => {
    const t = e.target
    if (t instanceof HTMLInputElement && t.type !== "password" && t.value && t === field && !pwIn().length) remember(t.value.trim())
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
    const pws = pwIn(at instanceof HTMLElement && at !== document.body ? scopeOf(at) : document)
    const pw = at instanceof HTMLInputElement && at.type === "password" ? at
      : pws.find((x) => !/new-password/.test(x.autocomplete)) || pws[0] || pwIn()[0] || null
    let user = pw ? userFor(pw, false) : null
    if (at instanceof HTMLInputElement && at.type !== "password" && textBox(at)) user = at
    if (!user && !pw) user = userFor(null, false)
    if (user && username) setVal(user, username)
    if (pw && password) setVal(pw, password)
    menuOpen = false
  })

  // hand what was just typed to the host; it decides save / update / nothing
  let lastSent = "", lastAt = 0
  const capture = (scope) => {
    const p = pickPw(scope)
    if (!p) { const u = userFor(null, true, scope); if (u) remember(u.value.trim()); return }
    const pwScope = scopeOf(p.pw)
    const u = userFor(p.pw, true, pwScope.contains(scope) ? pwScope : scope)
    let username = u ? u.value.trim() : "", from = u ? "field" : ""
    if (!username) { try { username = sessionStorage.getItem(MEM) || "" } catch {} if (username) from = "memory" }
    if (!username) { username = shownIdent(pwScope); if (username) from = "text" }
    const key = `${location.host}\n${username}\n${p.pw.value}`
    if (key === lastSent && Date.now() - lastAt < 1500) return   // click + submit of one sign-in
    lastSent = key; lastAt = Date.now()
    ipcRenderer.sendToHost("flux-login-submit", { url: location.href, username, password: p.pw.value, kind: p.kind, from })
  }
  document.addEventListener("submit", (e) => { if (e.target instanceof HTMLFormElement) capture(e.target) }, true)
  // SPA logins with no <form>: Enter in a login box, or a click on a submit-ish button
  document.addEventListener("keydown", (e) => {
    if (!e.isTrusted || e.key !== "Enter" || menuOpen || !(e.target instanceof HTMLInputElement)) return
    if (e.target.type === "password" || textBox(e.target)) capture(scopeOf(e.target))
  }, true)
  document.addEventListener("click", (e) => {
    if (!e.isTrusted) return
    const b = e.target instanceof Element && e.target.closest("button,input[type=submit],input[type=button],[role=button]")
    if (!b || !SUBMITISH.test(`${b.textContent} ${b.value || ""} ${b.getAttribute("aria-label") || ""}`)) return
    const pws = pwIn(b.form || document).filter((x) => x.value)
    capture(b.form || (pws.length ? scopeOf(pws[0]) : scopeOf(b)))
  }, true)

  // after a submit the host asks: did that work?  A failed sign-in comes back
  // with the password box still there and an error message
  ipcRenderer.on("flux-login-probe", (_e, seq) => {
    const pws = pwIn()
    let msg = ""
    const invalid = pws.length > 0 && [...document.querySelectorAll("input[aria-invalid=true]")].some((x) => shown(x) && (x.type === "password" || textBox(x)))
    if (pws.length) {
      const els = document.querySelectorAll('[role=alert],[aria-live],#login_error,.error,.errors,.alert,[class*=error i],[class*=invalid i],[class*=alert i],[class*=warning i]')
      for (const el of els) {
        if (!shown(el)) continue
        const t = (el.innerText || "").trim()
        if (t && t.length < 400 && FAILED.test(t)) { msg = t.slice(0, 160); break }
      }
    }
    ipcRenderer.sendToHost("flux-login-state", { seq, url: location.href, pw: pws.length, error: invalid || !!msg, msg })
  })
}
