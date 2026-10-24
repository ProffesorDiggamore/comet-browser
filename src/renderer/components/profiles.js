// ───────────────────────────────────────────────────────────────────
//  profiles.js — Chrome-style profiles (Personal, School, Work…).  Each
//  one is its own world: tabs, bookmarks, history, passwords, cookies
//  and site logins, Home, theme.  The switcher sits at the top of the
//  sidebar (the toolbar in the classic layout); Settings → Profiles
//  manages them; Profiles in the menu bar has ⌃⌘1…9.
//  Switching saves this profile's tabs, then main reloads the UI.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { bus, toast } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { popover, closePopover } from "./popover.js"
import { group, block, btn } from "./settings/kit.js"
import * as T from "../core/tabs.js"

// Apple system colors, so every profile reads well in light and dark
export const PROFILE_COLORS = ["#0a84ff", "#30d158", "#ff9f0a", "#ff375f", "#bf5af2", "#5e5ce6", "#64d2ff", "#ff6482", "#ac8e68", "#8e8e93"]
const EMOJI = ["", "💼", "🎓", "🏠", "💻", "📚", "🎮", "🎨", "🛒", "✈️", "⚽️", "🎵", "🧪", "🌿", "⭐️", "🔥"]

let data = { active: window.flux.paths.profile?.id ?? "default", list: window.flux.paths.profile ? [window.flux.paths.profile] : [] }

export const currentProfile = () => data.list.find((p) => p.id === data.active) ?? data.list[0] ?? { id: "default", name: "Personal", color: "#0a84ff", emoji: "" }
export const allProfiles = () => data.list

function initials (name) {
  const w = String(name ?? "").trim().split(/\s+/).filter(Boolean)
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] ?? "?").slice(0, 1)).toUpperCase()
}

// round avatar: the profile's emoji, or its initials on its color
export function avatar (p, size = 22) {
  const el = h(`span.pf-av${p.emoji ? ".is-emoji" : ""}`, { text: p.emoji || initials(p.name), "aria-hidden": "true" })
  el.style.setProperty("--pf", p.color ?? "#8e8e93")
  el.style.setProperty("--pf-s", `${size}px`)
  return el
}

async function refresh (r) {
  if (r?.list) data = { active: r.active, list: r.list }
  else data = await window.flux.profiles.list()
  document.title = data.list.length > 1 ? `Flux — ${currentProfile().name}` : "Flux"
  bus.emit("profiles", data)
  bus.emit("settings:rerender")
}

export async function switchProfile (id) {
  if (!id || id === data.active) return
  closePopover()
  document.body.classList.add("is-switching-profile")
  await T.flushSession()
  const r = await window.flux.profiles.switch(id)
  // on success main reloads the UI; only a failure gets here with a live page
  if (!r?.ok) {
    T.thawSession()
    document.body.classList.remove("is-switching-profile")
    toast(r?.text ?? "Couldn't switch profiles")
  }
}

// ── the switcher popover ─────────────────────────────────────────
export function openProfileMenu (anchor) {
  const cur = currentProfile()
  const others = data.list.filter((p) => p.id !== cur.id)
  const item = (kids, onclick, title) => h("button.mi.pf-mi", { role: "menuitem", onclick, title }, kids)
  const list = h("div.menu.pf-menu", { role: "menu" }, [
    h("div.pf-head", {}, [
      avatar(cur, 38),
      h("div.pf-head-text", {}, [h("strong", { text: cur.name }), h("span", { text: "Current profile" })]),
      h("button.pf-head-edit", { title: "Edit profile", "aria-label": "Edit profile", onclick: () => { closePopover(); openProfileSheet(cur) } }, [ico("edit", 14)])
    ]),
    others.length ? h("div.mi-sep") : null,
    ...others.map((p) => {
      const n = data.list.indexOf(p) + 1
      return item([avatar(p, 20), h("span.mi-label", { text: p.name }), n <= 9 ? h("kbd.mi-kbd", { text: `⌃⌘${n}` }) : null], () => switchProfile(p.id), `Switch to ${p.name}`)
    }),
    h("div.mi-sep"),
    item([h("span.mi-ico", {}, [ico("plus", 15)]), h("span.mi-label", { text: "Add Profile…" })], () => { closePopover(); openProfileSheet() }),
    item([h("span.mi-ico", {}, [ico("users", 15)]), h("span.mi-label", { text: "Manage Profiles…" })], () => { closePopover(); bus.emit("settings:goto", "profiles") })
  ].filter(Boolean))
  return popover(anchor, list, { className: "pop--menu pf-pop", width: 260 })
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

// ── create / edit sheet ──────────────────────────────────────────
let sheetEl = null
function closeSheet () {
  if (!sheetEl) return
  const el = sheetEl
  sheetEl = null
  el.classList.add("is-leaving")
  setTimeout(() => el.remove(), 180)
}

function modal (card, onKey) {
  closeSheet()
  const scrim = h("div.pf-scrim", { onmousedown: (e) => { if (e.target === scrim) closeSheet() } }, [card])
  scrim.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.stopPropagation(); closeSheet() }
    else onKey?.(e)
  })
  document.body.append(scrim)
  sheetEl = scrim
  return scrim
}

export function openProfileSheet (existing = null) {
  const draft = existing ? { ...existing } : { name: "", color: PROFILE_COLORS[data.list.length % PROFILE_COLORS.length], emoji: "" }
  const preview = h("div.pf-preview")
  const name = h("input.field.pf-name", { type: "text", value: draft.name, placeholder: "School, Work, Personal…", maxLength: 32, spellcheck: false, "aria-label": "Profile name" })
  const paint = () => {
    preview.replaceChildren(avatar({ ...draft, name: draft.name || "?" }, 64))
    card.style.setProperty("--pf", draft.color)
    colors.querySelectorAll("button").forEach((b) => b.classList.toggle("is-on", b.dataset.v === draft.color))
    emojis.querySelectorAll("button").forEach((b) => b.classList.toggle("is-on", b.dataset.v === draft.emoji))
    save.disabled = !draft.name.trim()
  }
  name.addEventListener("input", () => { draft.name = name.value; paint() })
  const colors = h("div.pf-swatches", { role: "radiogroup", "aria-label": "Color" }, PROFILE_COLORS.map((c) => {
    const b = h("button.pf-swatch", { role: "radio", title: c, dataset: { v: c }, onclick: () => { draft.color = c; paint() } })
    b.style.setProperty("--pf", c)
    return b
  }))
  const emojis = h("div.pf-emojis", { role: "radiogroup", "aria-label": "Icon" }, EMOJI.map((e) => h("button.pf-emoji", {
    role: "radio", title: e ? `Use ${e}` : "Use initials", dataset: { v: e }, onclick: () => { draft.emoji = e; paint() }
  }, e ? e : h("span.pf-emoji-ab", { text: "Aa" }))))

  const submit = async () => {
    if (!draft.name.trim()) return
    save.disabled = true
    const patch = { name: draft.name, color: draft.color, emoji: draft.emoji }
    if (existing) {
      const r = await window.flux.profiles.update(existing.id, patch)
      if (!r?.ok) { save.disabled = false; return toast(r?.text ?? "Couldn't save the profile") }
      closeSheet()
      await refresh(r)
      return
    }
    // a new profile opens right away, like Chrome
    await T.flushSession()
    document.body.classList.add("is-switching-profile")
    const r = await window.flux.profiles.create(patch, { open: true })
    if (!r?.ok) {
      T.thawSession()
      document.body.classList.remove("is-switching-profile")
      save.disabled = false
      toast(r?.text ?? "Couldn't create the profile")
    }
  }
  const save = btn(existing ? "Done" : "Create Profile", submit, "btn btn--accent")
  const card = h("div.pf-sheet.glass", { role: "dialog", "aria-modal": "true", "aria-label": existing ? "Edit profile" : "New profile" }, [
    preview,
    h("h2.pf-title", { text: existing ? "Edit Profile" : "New Profile" }),
    h("p.pf-sub", { text: existing ? "Changes show everywhere this profile appears." : "Its own tabs, bookmarks, history, passwords, site logins, Home and look." }),
    name,
    h("div.pf-label", { text: "Color" }), colors,
    h("div.pf-label", { text: "Icon" }), emojis,
    h("div.pf-actions", {}, [btn("Cancel", closeSheet), save])
  ])
  modal(card, (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); submit() } })
  paint()
  setTimeout(() => { name.focus(); name.select() }, 30)
}

function confirmRemove (p) {
  const go = btn("Move to Trash", async () => {
    go.disabled = true
    const r = await window.flux.profiles.remove(p.id)
    closeSheet()
    if (!r?.ok) return toast(r?.text ?? "Couldn't remove the profile")
    toast(`Removed “${p.name}”`)
    await refresh(r)
  }, "btn btn--danger")
  modal(h("div.pf-sheet.pf-sheet--confirm.glass", { role: "alertdialog", "aria-modal": "true" }, [
    h("div.pf-preview", {}, [avatar(p, 52)]),
    h("h2.pf-title", { text: `Remove “${p.name}”?` }),
    h("p.pf-sub", { text: "Its tabs, bookmarks, history, saved passwords and site logins move to the Trash, so you can still get them back from there." }),
    h("div.pf-actions", {}, [btn("Cancel", closeSheet), go])
  ]))
  setTimeout(() => go.focus(), 30)
}

// ── Settings → Profiles ──────────────────────────────────────────
export function catProfiles () {
  const cur = currentProfile()
  const rows = data.list.map((p, i) => {
    const on = p.id === cur.id
    return h("div.set-row.pf-row", { dataset: { search: `profile ${p.name}` } }, [
      avatar(p, 34),
      h("div.rtext", {}, [
        h("div.rlabel", { text: p.name }),
        h("div.rdesc", { text: on ? "Current profile" : i < 9 ? `⌃⌘${i + 1} to switch` : "" })
      ]),
      h("div.control", {}, [
        on ? h("span.pf-badge", {}, [ico("check", 12), "In use"]) : btn("Switch", () => switchProfile(p.id)),
        h("button.btn.btn--icon", { title: `Edit ${p.name}`, "aria-label": `Edit ${p.name}`, onclick: () => openProfileSheet(p) }, [ico("edit", 14)]),
        p.id !== "default" && !on ? h("button.btn.btn--icon", { title: `Remove ${p.name}`, "aria-label": `Remove ${p.name}`, onclick: () => confirmRemove(p) }, [ico("trash", 14)]) : null
      ].filter(Boolean))
    ])
  })
  return [
    group("Profiles", [
      ...rows,
      block([h("button.btn.pf-add", { onclick: () => openProfileSheet() }, [ico("plus", 14), "Add Profile…"])], "add profile new account")
    ], "Each profile keeps its own tabs, bookmarks, history, passwords, cookies and site logins, Home screen and look. API keys are shared."),
  ]
}

export async function initProfiles () {
  await refresh()
}
