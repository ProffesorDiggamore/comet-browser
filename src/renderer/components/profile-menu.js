// ───────────────────────────────────────────────────────────────────
//  profile-menu.js — the profile switcher popover (top of the sidebar)
//  and the ⌘N window picker.  Every other profile can switch THIS
//  window (row click) or open in a window of its own (the trailing
//  window button, ⌥-click, or right-click).  One window per profile:
//  a profile that already has one shows a dot, and opening it focuses it.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { bus, actionToast } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { popover, closePopover, menu } from "./popover.js"
import { sortable, regrow } from "../core/sortable.js"
import { avatar, currentProfile, allProfiles, openProfiles, switchProfile, openProfileWindow, openProfileSheet, reorderProfiles, profileKey } from "./profiles.js"

const winLabel = (open) => (open ? "Show Window" : "Open in New Window")

// a name with an optional second line ("Open in another window")
function nameBlock (p, sub) {
  return h("span.pf-mi-text", {}, [h("span.mi-label", { text: p.name }), sub ? h("span.pf-mi-sub", { text: sub }) : null].filter(Boolean))
}

// right-click on a profile: the two ways to use it
function rowMenu (p, at) {
  const open = openProfiles().has(p.id)
  menu(at, [
    { label: open ? `Go to ${p.name}` : `Switch to ${p.name}`, icon: "users", run: () => switchProfile(p.id) },
    { label: winLabel(open), icon: "window", run: () => openProfileWindow(p.id) }
  ], { width: 230 })
}

// ── the switcher popover ─────────────────────────────────────────
// Drag a row (or ⌥↑ / ⌥↓) to reorder: the order is ⌃⌘1…9, so the keys
// shown move with it.  Changes from any window repaint it live.
export function openProfileMenu (anchor) {
  const cur = () => currentProfile()
  const item = (kids, onclick, title) => h("button.mi.pf-mi", { role: "menuitem", onclick, title }, kids)
  const row = (p) => {
    const key = profileKey(p)
    const isOpen = openProfiles().has(p.id)
    const main = h("button.mi.pf-mi", {
      role: "menuitem",
      title: `${isOpen ? `${p.name} is open in another window` : `Switch to ${p.name} · ⌥-click for a new window`} · drag or ⌥↑ ⌥↓ to reorder`,
      "aria-keyshortcuts": "Alt+ArrowUp Alt+ArrowDown",
      onclick: (e) => { if (e.altKey) { closePopover(); openProfileWindow(p.id) } else switchProfile(p.id) },
      oncontextmenu: (e) => { e.preventDefault(); rowMenu(p, { x: e.clientX, y: e.clientY }) }
    }, [
      avatar(p, 20),
      nameBlock(p, isOpen ? "Open in another window" : ""),
      isOpen ? h("span.pf-open-dot", { "aria-label": "Has a window" }) : null,
      key ? h("kbd.mi-kbd", { text: key }) : null
    ].filter(Boolean))
    const win = h("button.pf-mi-win", {
      title: winLabel(isOpen), "aria-label": `${winLabel(isOpen)}: ${p.name}`,
      onclick: () => { closePopover(); openProfileWindow(p.id) }
    }, [ico("window", 14)])
    return h("div.pf-mi-row", { dataset: { id: p.id } }, [main, win])
  }
  const others = () => allProfiles().filter((p) => p.id !== cur().id)
  const headSub = h("span")
  const sep = h("div.mi-sep")
  const rowsBox = h("div.pf-rows")
  const idOf = (el) => el.dataset.id
  const paint = () => {
    const key = profileKey(cur())
    headSub.textContent = `${openProfiles().size ? "This window" : "Current profile"}${key ? ` · ${key}` : ""}`
    sep.style.display = others().length ? "" : "none"
    // keep focus on the same row (a keyboard move comes back through here)
    const f = document.activeElement
    const fr = rowsBox.contains(f) ? f.closest(".pf-mi-row") : null
    const fid = fr && idOf(fr), fwin = f?.classList.contains("pf-mi-win")
    regrow(rowsBox, () => others().map(row), idOf)
    if (fid) [...rowsBox.children].find((r) => idOf(r) === fid)?.querySelector(fwin ? ".pf-mi-win" : ".pf-mi")?.focus({ preventScroll: true })
  }
  const order = sortable(rowsBox, { rows: () => [...rowsBox.children], idOf, onMove: (ids) => reorderProfiles(ids) })
  const list = h("div.menu.pf-menu", { role: "menu" }, [
    h("div.pf-head", {}, [
      avatar(cur(), 38),
      h("div.pf-head-text", {}, [h("strong", { text: cur().name }), headSub]),
      h("button.pf-head-edit", { title: "Edit profile", "aria-label": "Edit profile", onclick: () => { closePopover(); openProfileSheet(cur()) } }, [ico("edit", 14)])
    ]),
    sep,
    rowsBox,
    h("div.mi-sep"),
    item([h("span.mi-ico", {}, [ico("plus", 15)]), h("span.mi-label", { text: "Add Profile…" })], () => { closePopover(); openProfileSheet() }),
    item([h("span.mi-ico", {}, [ico("users", 15)]), h("span.mi-label", { text: "Manage Profiles…" })], () => { closePopover(); bus.emit("settings:goto", "profiles") })
  ])
  paint()
  // a change while a row is held waits for it to land
  let later = 0
  const onChange = () => { clearTimeout(later); if (order.busy()) later = setTimeout(onChange, 120); else paint() }
  const off = bus.on("profiles", onChange)
  const el = popover(anchor, list, { className: "pop--menu pf-pop", width: 280, onClose: () => { off(); clearTimeout(later) } })
  if (!el) { off(); clearTimeout(later) }
  return el
}

// the button that opens it: avatar + name in the sidebar, avatar only in the toolbar
export function profileButton ({ compact = false } = {}) {
  const b = h(`button.pf-btn.no-drag${compact ? ".is-compact" : ""}`, { onclick: () => openProfileMenu(b) })
  const paint = () => {
    const p = currentProfile()
    b.title = `${p.name} — switch profile`
    b.setAttribute("aria-label", b.title)
    b.replaceChildren(avatar(p, compact ? 22 : 20), compact ? "" : h("span.pf-btn-name", { text: p.name }), compact ? "" : ico("chevronDown", 12))
  }
  bus.on("profiles", paint)
  paint()
  return b
}

// ── ⌘N: each window is one profile, so a new window means picking one ──
export function openWindowPicker () {
  const all = allProfiles()
  if (all.length < 2) {
    actionToast("Each window is its own profile.", "Add Profile…", () => openProfileSheet(null, { open: "window" }))
    return null
  }
  const cur = currentProfile()
  const open = openProfiles()
  const pick = (p) => () => { closePopover(); openProfileWindow(p.id) }
  const btns = all.map((p) => h("button.mi.pf-mi", { role: "menuitem", onclick: pick(p), title: p.id === cur.id ? "This window" : winLabel(open.has(p.id)) }, [
    avatar(p, 20),
    nameBlock(p, p.id === cur.id ? "This window" : open.has(p.id) ? "Open in another window" : ""),
    open.has(p.id) ? h("span.pf-open-dot", { "aria-label": "Has a window" }) : null
  ].filter(Boolean)))
  const add = h("button.mi.pf-mi", { role: "menuitem", onclick: () => { closePopover(); openProfileSheet(null, { open: "window" }) } },
    [h("span.mi-ico", {}, [ico("plus", 15)]), h("span.mi-label", { text: "New Profile…" })])
  const items = [...btns, add]
  const list = h("div.menu.pf-menu", { role: "menu" }, [h("div.mi-head", { text: "New Window" }), ...btns, h("div.mi-sep"), add])
  list.addEventListener("keydown", (e) => {
    const i = items.indexOf(document.activeElement)
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus() }
    if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus() }
  })
  const anchor = [...document.querySelectorAll(".pf-btn")].find((b) => b.offsetParent)
  closePopover()   // never a toggle: the switcher may be open on the same button
  const el = popover(anchor ?? { x: window.innerWidth / 2, y: 64 }, list, { className: "pop--menu pf-pop", width: 280, align: anchor ? "start" : "center" })
  // the first profile that isn't this window, ready for ↵
  if (el) requestAnimationFrame(() => (btns.find((_b, i) => all[i].id !== cur.id) ?? btns[0])?.focus())
  return el
}
