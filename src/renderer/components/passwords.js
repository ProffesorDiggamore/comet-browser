// ───────────────────────────────────────────────────────────────────
//  passwords.js — autofill.  When a page focuses a login field, the
//  webview preload reports where it is; this draws a glass list under
//  it with every saved login for the site from EVERY profile, each
//  marked with its profile's avatar (Personal vs Business at a glance).
//  The password only reaches the page after the user picks a row.
//  After a sign-in, offers to save the login to the current profile.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { bus, toast } from "../core/bus.js"
import { ico } from "../core/icons.js"
import * as T from "../core/tabs.js"
import { avatar, currentProfile } from "./profiles.js"

let menu = null      // { el, wv, items, sel, rows }
let blurT = null
const skipped = new Set()   // "host\nuser" the user said Not now to, this session

const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, "") } catch { return "" } }

function closeMenu () {
  clearTimeout(blurT)
  if (!menu) return
  const { el, wv } = menu
  menu = null
  try { wv.send("flux-login-menu", false) } catch {}
  el.classList.add("is-leaving")
  setTimeout(() => el.remove(), 140)
}

async function pick (item, wv) {
  closeMenu()
  const login = await window.flux.vault.fill(item.profile.id, item.id)
  if (!login) return toast("That login is gone")
  try { wv.send("flux-login-fill", login) } catch { return }
  try { wv.focus() } catch {}
}

function paintSel () {
  menu.rows.forEach((r, i) => r.classList.toggle("is-sel", i === menu.sel))
}

// at: { left, top, width } in window coords
function openMenu (items, wv, at) {
  closeMenu()
  const me = currentProfile().id
  const multi = new Set(items.map((i) => i.profile.id)).size > 1
  const rows = items.map((it, i) => h("button.af-row", {
    onmousedown: (e) => e.preventDefault(),            // keep focus in the page's field
    onmouseenter: () => { if (menu) { menu.sel = i; paintSel() } },
    onclick: () => pick(it, wv)
  }, [
    h("span.af-av", {}, [avatar(it.profile, 26)]),
    h("span.af-text", {}, [
      h("span.af-user", { text: it.username || "No username" }),
      h("span.af-sub", { text: `${it.profile.name}${it.profile.id === me && multi ? " · this profile" : ""} · ${it.host}` })
    ]),
    h("span.af-go", {}, [ico("arrowRight", 13)])
  ]))
  const el = h("div.af-menu.glass", { role: "listbox", onmousedown: (e) => e.preventDefault() }, [
    h("div.af-head", {}, [ico("key", 12), h("span", { text: items.length > 1 ? `${items.length} saved logins` : "Saved login" })]),
    h("div.af-list", {}, rows),
    h("button.af-foot", { onmousedown: (e) => e.preventDefault(), onclick: () => { closeMenu(); bus.emit("settings:goto", "passwords") } }, [ico("gear", 12), h("span", { text: "Manage passwords" })])
  ])
  const width = Math.min(380, Math.max(260, at.width))
  const left = Math.max(8, Math.min(at.left, window.innerWidth - width - 8))
  el.style.width = `${width}px`
  el.style.left = `${left}px`
  document.body.append(el)
  // below the field, or above it when there is no room
  const hgt = el.offsetHeight
  const below = at.top + 6
  el.style.top = `${below + hgt > window.innerHeight - 8 ? Math.max(8, at.above - hgt - 6) : below}px`
  menu = { el, wv, items, sel: 0, rows, url: T.getTabs().find((t) => T.rawTab(t.id)?.wv === wv)?.url }
  paintSel()
  try { wv.send("flux-login-menu", true) } catch {}
}

async function onField ({ id, wv, x, y, w, top, url }) {
  const tab = T.rawTab(id)
  if (!tab || tab.id !== T.getActiveId() && !tab.inSplit) return
  clearTimeout(blurT)
  const items = await window.flux.vault.matchAll(url)
  if (!items.length) { closeMenu(); return }
  const r = wv.getBoundingClientRect()
  const z = T.zoomOf(id) || 1
  openMenu(items, wv, { left: r.left + x * z, top: r.top + y * z, above: r.top + top * z, width: w * z })
}

function onKey (key) {
  if (!menu) return
  if (key === "Escape" || key === "type") return closeMenu()
  if (key === "Enter") return pick(menu.items[menu.sel], menu.wv)
  const n = menu.items.length
  menu.sel = (menu.sel + (key === "ArrowDown" ? 1 : -1) + n) % n
  paintSel()
  menu.rows[menu.sel]?.scrollIntoView({ block: "nearest" })
}

// ── save after sign-in ────────────────────────────────────────────
let saveEl = null
function closeSave () {
  if (!saveEl) return
  const el = saveEl
  saveEl = null
  el.classList.add("is-leaving")
  setTimeout(() => el.remove(), 180)
}

async function onSubmit ({ id, url, username, password }) {
  const tab = T.rawTab(id)
  if (!tab || tab.private || !password || !/^https?:/.test(url)) return
  const host = hostOf(url)
  if (skipped.has(`${host}\n${username}`)) return
  if (await window.flux.vault.known(url, username, password)) return
  const update = (await window.flux.vault.match(url)).some((m) => m.username === username)
  closeSave()
  const p = currentProfile()
  let timer = null
  const card = h("div.af-save.glass", { role: "dialog", onmouseenter: () => clearTimeout(timer), onmouseleave: () => { timer = setTimeout(closeSave, 6000) } }, [
    h("div.af-save-top", {}, [
      h("span.af-save-ico", {}, [ico("key", 15)]),
      h("div.af-text", {}, [
        h("span.af-user", { text: update ? "Update saved password?" : "Save this password?" }),
        h("span.af-sub", { text: host })
      ])
    ]),
    h("div.af-save-login", {}, [
      avatar(p, 22),
      h("span.af-text", {}, [
        h("span.af-user", { text: username || "No username" }),
        h("span.af-sub", { text: `${"•".repeat(Math.min(12, password.length))} · ${p.name}` })
      ])
    ]),
    h("div.af-save-actions", {}, [
      h("button.btn.btn--ghost", { onclick: () => { skipped.add(`${host}\n${username}`); closeSave() } }, "Not now"),
      h("button.btn.btn--accent", { onclick: async () => {
        await window.flux.vault.add({ url, username, password, source: "autosave" })
        closeSave()
        toast(update ? "Password updated" : `Saved to ${p.name}`)
      } }, update ? "Update" : "Save")
    ])
  ])
  saveEl = card
  document.body.append(card)
  // hang it under the toolbar's key button, so it never covers the AI panel
  const key = document.querySelector('#toolbar [aria-label="Fill saved login"]')
  const kr = key?.offsetParent ? key.getBoundingClientRect() : null
  if (kr) {
    card.style.top = `${kr.bottom + 8}px`
    card.style.right = "auto"
    card.style.left = `${Math.max(8, Math.min(kr.right - card.offsetWidth + 10, window.innerWidth - card.offsetWidth - 8))}px`
  }
  timer = setTimeout(closeSave, 20000)
}

// ── toolbar key button: same list, anchored to the button ─────────
export async function fillActiveTab (anchor) {
  const t = T.getActive()
  if (!t || !/^https?:/.test(t.url)) return toast("Open a website first")
  const items = await window.flux.vault.matchAll(t.url)
  if (!items.length) return toast("No saved login for this site")
  const raw = T.rawTab(t.id)
  if (items.length === 1) return pick(items[0], raw.wv)
  const r = (anchor ?? document.getElementById("toolbar")).getBoundingClientRect()
  openMenu(items, raw.wv, { left: r.right - 300, top: r.bottom, above: r.top, width: 300 })
}

export function initAutofill () {
  bus.on("login-field", onField)
  bus.on("login-blur", () => { clearTimeout(blurT); blurT = setTimeout(closeMenu, 120) })
  bus.on("login-key", onKey)
  bus.on("login-submit", onSubmit)
  // another tab, or this tab went to a new page
  bus.on("tabs", ({ activeId }) => { if (menu && (T.rawTab(activeId)?.wv !== menu.wv || T.rawTab(activeId)?.url !== menu.url)) closeMenu() })
  window.addEventListener("resize", closeMenu)
  // a click in the page itself (the host document never sees it)
  bus.on("page-down", () => { if (menu) { clearTimeout(blurT); blurT = setTimeout(closeMenu, 0) } })
  document.addEventListener("pointerdown", (e) => { if (menu && !menu.el.contains(e.target)) closeMenu() }, true)
}
