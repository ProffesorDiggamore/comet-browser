// ───────────────────────────────────────────────────────────────────
//  save-login.js — the save / update card after a sign-in.
//  The page reports what was typed (webview-preload: username scored
//  from the form, new password on sign-up / change forms).  Nothing is
//  offered the instant the form submits: the capture is held per tab
//  until the page settles, then the page is asked whether the sign-in
//  failed (password box still there + an error message).  A retry
//  replaces the held capture and updates an open card in place.
//  What the card offers depends on the vault: Save, Update, or nothing.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { bus, toast } from "../core/bus.js"
import { ico } from "../core/icons.js"
import * as T from "../core/tabs.js"
import { avatar, currentProfile } from "./profiles.js"

const IDENT_TTL = 5 * 60e3          // a two-step login's username is kept this long
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, "") } catch { return "" } }
const sameSite = (a, b) => !!a && !!b && (a === b || a.endsWith("." + b) || b.endsWith("." + a))
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const skipped = new Set()   // "host\nuser" the user said Not now to, this session
const idents = new Map()    // tabId → { host, username, at }   (identifier step of a two-step login)
const pending = new Map()   // tabId → capture waiting for the page to settle
const probes = new Map()    // seq → resolve
let probeSeq = 0
let card = null             // { el, p, plan, refs, timer }

function remembered (id, host) {
  const m = idents.get(id)
  return m && Date.now() - m.at < IDENT_TTL && sameSite(m.host, host) ? m.username : ""
}

// ask the page whether the sign-in worked; null when it can't answer
function probe (id) {
  const tab = T.rawTab(id)
  if (!tab?.wv) return Promise.resolve(null)
  const seq = ++probeSeq
  return new Promise((res) => {
    probes.set(seq, res)
    try { tab.wv.send("flux-login-probe", seq) } catch { probes.delete(seq); return res(null) }
    setTimeout(() => { if (probes.delete(seq)) res(null) }, 1500)
  })
}

async function onSubmit ({ id, url, username, password, kind, from }) {
  const tab = T.rawTab(id)
  if (!tab || tab.private || !password || !/^https?:/.test(url)) return
  const host = hostOf(url)
  // no username box on this step: the identifier typed on the previous one
  if (from !== "field") username = remembered(id, host) || username || ""
  const p = { id, url, host, username: username || "", password, kind: kind || "login", at: Date.now() }
  pending.set(id, p)
  if (card && card.p.id === id && sameSite(card.p.host, host)) {
    // a retry while the card is up: same card, new password
    card.p = p
    card.el.classList.add("is-checking")
    await replan(true)
  }
  settle(p)
}

// wait for the navigation / request the submit started, then look at the page
async function settle (p) {
  await wait(900)
  for (let i = 0; i < 40 && T.rawTab(p.id)?.loading; i++) await wait(250)
  await wait(450)
  if (pending.get(p.id) !== p) return            // replaced by a retry, or dropped
  const st = await probe(p.id)
  if (pending.get(p.id) !== p) return
  p.failed = !!(st && st.error && st.pw > 0)
  p.landed = hostOf(T.rawTab(p.id)?.url || "")
  if (card?.p === p) {
    card.el.classList.remove("is-checking")
    paint()
  } else if (!p.failed) {
    await show(p)
  }
  // a single-page app can show its error a moment later: look once more
  await wait(2200)
  if (pending.get(p.id) !== p || p.failed) return
  const again = await probe(p.id)
  if (pending.get(p.id) === p && again?.error && again.pw > 0) { p.failed = true; if (card?.p === p) paint() }
}

function closeCard () {
  if (!card) return
  const { el, timer } = card
  clearTimeout(timer)
  card = null
  el.classList.add("is-leaving")
  setTimeout(() => el.remove(), 180)
}

function done (p) { if (pending.get(p.id) === p) pending.delete(p.id); closeCard() }

async function planFor (p) {
  if (skipped.has(`${p.host}\n${p.username}`)) return { action: "none" }
  const plan = await window.flux.vault.plan(p.url, p.username, p.password)
  // a change-password form often has no username on it: one saved login → that's it
  if (plan.action === "save" && !p.username && p.kind === "change" && plan.others?.length === 1) {
    return { action: "update", id: plan.others[0].id, username: plan.others[0].username }
  }
  return plan
}

// re-ask the vault (username edited, or a retry changed the password)
async function replan (flash) {
  if (!card) return
  const p = card.p
  const plan = await planFor(p)
  if (card?.p !== p) return
  if (plan.action === "none" || plan.action === "never") return done(p)
  card.plan = plan
  paint()
  if (flash) { card.el.classList.remove("is-flash"); void card.el.offsetWidth; card.el.classList.add("is-flash") }
}

function paint () {
  const { p, plan, refs } = card
  const update = plan.action === "update"
  refs.title.textContent = update ? "Update password?" : "Save password?"
  refs.sub.classList.toggle("is-warn", !!p.failed)
  refs.sub.textContent = p.failed ? "The site may have rejected this password"
    : update ? `Replaces the saved password for ${plan.username || "this login"}`
    : p.kind === "new" ? `New account · saves to ${currentProfile().name}`
    : `Saves to ${currentProfile().name} · fills next time`
  if (document.activeElement !== refs.user) refs.user.value = p.username
  refs.pw.textContent = refs.reveal ? p.password : "•".repeat(Math.min(14, Math.max(8, p.password.length)))
  refs.go.textContent = update ? "Update" : "Save"
  const other = plan.action === "save" && plan.others?.length === 1 ? plan.others[0] : null
  refs.alt.hidden = !other
  if (other) refs.alt.textContent = `Update ${other.username || "the saved login"} instead`
  card.el.dataset.action = plan.action
}

async function commit (which) {
  if (!card) return
  const { p, plan } = card
  const v = window.flux.vault
  if (which === "alt") {
    const other = plan.others[0]
    await v.update(other.id, { password: p.password })
    toast(`Password updated for ${other.username || p.host}`)
  } else if (plan.action === "update") {
    await v.update(plan.id, { password: p.password })
    toast("Password updated")
  } else {
    await v.add({ url: p.url, username: p.username, password: p.password, source: "autosave" })
    toast(`Saved to ${currentProfile().name}`)
  }
  done(p)
}

async function show (p) {
  const plan = await planFor(p)
  if (pending.get(p.id) !== p) return
  if (plan.action === "none" || plan.action === "never") { pending.delete(p.id); return }
  closeCard()
  const prof = currentProfile()
  const fav = T.faviconFor(p.url) || T.rawTab(p.id)?.favicon
  const refs = { reveal: false }
  const site = h("span.af-save-fav", {}, [fav
    ? h("img", { src: fav, alt: "", onerror: (e) => e.target.replaceWith(ico("globe", 14)) })
    : ico("key", 14)])
  refs.title = h("span.af-save-title")
  refs.sub = h("span.af-save-sub")
  refs.user = h("input.af-save-user", {
    value: p.username, placeholder: "Username or email", spellcheck: false, autocomplete: "off", "aria-label": "Username",
    oninput: (e) => { card.p.username = e.target.value.trim(); clearTimeout(refs.t); refs.t = setTimeout(() => replan(false), 220) },
    onkeydown: (e) => { if (e.key === "Enter") commit("go") }
  })
  refs.pw = h("span.af-save-pw", { "aria-label": "Password" })
  const eye = h("button.af-save-eye", { title: "Show password", "aria-label": "Show password", onclick: () => {
    refs.reveal = !refs.reveal
    eye.replaceChildren(ico(refs.reveal ? "eyeoff" : "eye", 14))
    eye.title = refs.reveal ? "Hide password" : "Show password"
    paint()
  } }, [ico("eye", 14)])
  refs.go = h("button.btn.btn--accent.af-save-go", { onclick: () => commit("go") })
  refs.alt = h("button.af-save-alt", { hidden: true, onclick: () => commit("alt") })
  const el = h("div.af-save.glass", {
    role: "dialog", "aria-label": "Save password",
    onmouseenter: () => clearTimeout(card?.timer),
    onmouseleave: () => { if (card?.el === el && document.activeElement !== refs.user) card.timer = setTimeout(closeCard, 8000) }
  }, [
    h("div.af-save-head", {}, [
      site,
      h("span.af-save-host", { text: p.host }),
      h("button.af-save-x", { title: "Close", "aria-label": "Close", onclick: () => done(p) }, [ico("close", 12)])
    ]),
    h("div.af-save-top", {}, [refs.title, refs.sub]),
    h("div.af-save-cred", {}, [
      h("div.af-save-row", {}, [h("span.af-save-av", {}, [avatar(prof, 22)]), refs.user]),
      h("div.af-save-row", {}, [h("span.af-save-lock", {}, [ico("lock", 13)]), refs.pw, eye])
    ]),
    refs.alt,
    h("div.af-save-actions", {}, [
      h("button.af-save-never", { onclick: async () => { await window.flux.vault.never(p.url); toast(`Won't offer to save on ${p.host}`); done(p) } }, "Never for this site"),
      h("span.af-save-gap"),
      h("button.btn.btn--plain.af-save-later", { onclick: () => { skipped.add(`${p.host}\n${card.p.username}`); done(p) } }, "Not now"),
      refs.go
    ])
  ])
  card = { el, p, plan, refs, timer: null }
  paint()
  p.shownAt = Date.now()
  document.body.append(el)
  // hang it under the toolbar's key button, so it never covers the AI panel
  const key = document.querySelector('#toolbar [aria-label="Fill saved login"]')
  const kr = key?.offsetParent ? key.getBoundingClientRect() : null
  if (kr) {
    el.style.top = `${kr.bottom + 8}px`
    el.style.right = "auto"
    el.style.left = `${Math.max(8, Math.min(kr.right - el.offsetWidth + 10, window.innerWidth - el.offsetWidth - 8))}px`
  }
  card.timer = setTimeout(() => { if (card?.el === el && !el.matches(":hover") && document.activeElement !== refs.user) closeCard() }, 25000)
}

// a closed tab, or one that went on to another site, drops what it held
function onTabs () {
  for (const [id, p] of pending) {
    const t = T.rawTab(id)
    const host = t ? hostOf(t.url || "") : ""
    const away = host && !sameSite(host, p.host) && !sameSite(host, p.landed)
    if (!t || ((p.shownAt || p.failed) && away)) {
      pending.delete(id)
      if (card?.p === p) closeCard()
    }
  }
  for (const id of idents.keys()) if (!T.rawTab(id)) idents.delete(id)
}

export function initSaveLogin () {
  bus.on("login-submit", onSubmit)
  bus.on("login-ident", ({ id, url, username }) => { if (username) idents.set(id, { host: hostOf(url), username, at: Date.now() }) })
  bus.on("login-state", ({ seq, ...st }) => { const r = probes.get(seq); if (r) { probes.delete(seq); r(st) } })
  bus.on("tabs", onTabs)
}
