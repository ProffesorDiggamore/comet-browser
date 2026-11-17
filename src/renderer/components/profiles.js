// ───────────────────────────────────────────────────────────────────
//  profiles.js — Chrome-style profiles (Personal, School, Work…).  Each
//  one is its own world: tabs, bookmarks, history, passwords, cookies
//  and site logins, Home, theme.  The switcher sits at the top of the
//  sidebar (the toolbar in the classic layout); Settings → Profiles
//  manages them; Profiles in the menu bar has ⌃⌘1…9.
//  Switching saves this window's tabs, then main reloads it into the
//  other profile.  Any profile can also have a window of its own, side
//  by side with the others (one window per profile; profile-menu.js).
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { bus, toast } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { closePopover } from "./popover.js"
import { group, block, btn } from "./settings/kit.js"
import * as T from "../core/tabs.js"
import { sortable } from "../core/sortable.js"

export { profileButton, openProfileMenu, openWindowPicker } from "./profile-menu.js"

// Apple system colors, so every profile reads well in light and dark
export const PROFILE_COLORS = ["#0a84ff", "#30d158", "#ff9f0a", "#ff375f", "#bf5af2", "#5e5ce6", "#64d2ff", "#ff6482", "#ac8e68", "#8e8e93"]
const EMOJI = ["", "💼", "🎓", "🏠", "💻", "📚", "🎮", "🎨", "🛒", "✈️", "⚽️", "🎵", "🧪", "🌿", "⭐️", "🔥"]

// active = THIS window's profile; open = profiles that have a window
let data = { active: window.flux.paths.profile?.id ?? "default", list: window.flux.paths.profile ? [window.flux.paths.profile] : [], open: new Set() }

export const currentProfile = () => data.list.find((p) => p.id === data.active) ?? data.list[0] ?? { id: "default", name: "Personal", color: "#0a84ff", emoji: "" }
export const allProfiles = () => data.list
// profiles with a window of their own, other than this one
export const openProfiles = () => new Set([...data.open].filter((id) => id !== data.active))

function initials (name) {
  const w = String(name ?? "").trim().split(/\s+/).filter(Boolean)
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] ?? "?").slice(0, 1)).toUpperCase()
}

// round avatar: the profile's emoji, or its initials on its color
export function avatar (p, size = 22) {
  const pic = p.picUrl
  const el = h(`span.pf-av${pic ? ".is-pic" : p.emoji ? ".is-emoji" : ""}`, { text: pic ? "" : p.emoji || initials(p.name), "aria-hidden": "true" })
  if (pic) el.style.backgroundImage = `url("${pic}")`
  el.style.setProperty("--pf", p.color ?? "#8e8e93")
  el.style.setProperty("--pf-s", `${size}px`)
  return el
}

// main owns the window title ("Comet — <Profile>")
async function refresh (r) {
  const next = r?.list ? r : await window.flux.profiles.list()
  data = { active: next.active ?? data.active, list: next.list ?? [], open: new Set(next.open ?? []) }
  bus.emit("profiles", data)
  bus.emit("settings:rerender")
}

// this window becomes that profile.  A profile open in another window is
// focused instead (this window stays as it is).
export async function switchProfile (id) {
  if (!id || id === data.active) return
  closePopover()
  if (openProfiles().has(id)) return openProfileWindow(id)
  document.body.classList.add("is-switching-profile")
  await T.flushSession()
  const r = await window.flux.profiles.switch(id)
  // on a switch main reloads the UI; a failure, or a focused other window, gets here live
  if (!r?.ok || r.focused) {
    T.thawSession()
    document.body.classList.remove("is-switching-profile")
    if (!r?.ok) toast(r?.text ?? "Couldn't switch profiles")
  }
}

// that profile in a window of its own (or its window, brought forward)
export async function openProfileWindow (id) {
  closePopover()
  const r = await window.flux.profiles.openWindow(id)
  if (!r?.ok) toast(r?.text ?? "Couldn't open that profile")
  return r
}

// a new order for the profiles a list shows (the picker leaves out this
// window's own; a search hides some); the rest keep their places.  List
// order is ⌃⌘1…9, so a move changes which key opens which profile.
export async function reorderProfiles (ids) {
  const shown = new Set(ids)
  let k = 0
  const full = data.list.map((p) => (shown.has(p.id) ? ids[k++] : p.id))
  if (full.every((id, i) => id === data.list[i].id)) return
  const byId = new Map(data.list.map((p) => [p.id, p]))
  data = { ...data, list: full.map((id) => byId.get(id)) }
  bus.emit("profiles", data)
  const r = await window.flux.profiles.reorder(full)
  if (!r?.ok) toast(r?.text ?? "Couldn't reorder profiles")
  await refresh(r)
}
export const profileKey = (p) => { const n = data.list.findIndex((x) => x.id === p.id) + 1; return n > 0 && n <= 9 ? `⌃⌘${n}` : "" }

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

// a pasted / dropped image file → a ≤512px PNG data URL (main crops it square)
export async function imageFileToDataUrl (file, max = 1600) {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement("canvas")
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k))
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close?.()
  return c.toDataURL("image/png")
}
// ── Move & Scale: drag to move, slider / scroll / pinch to zoom, inside a circle ──
const CROP_V = 240     // viewport, css px
const CROP_OUT = 512   // saved square, px
function cropEditor (src, start, onDone, onCancel) {
  const img = new Image()
  const stage = h("div.pf-crop-stage", { tabIndex: 0, title: "Drag to move · scroll or pinch to zoom · arrows nudge" })
  const zoom = h("input.pf-crop-zoom", { type: "range", min: 1, max: 6, step: 0.01, value: 1, "aria-label": "Zoom" })
  const use = btn("Use Picture", () => onDone(render()), "btn btn--accent")
  const el = h("div.pf-crop", { role: "group", "aria-label": "Move and scale picture" }, [
    h("h2.pf-title", { text: "Move & Scale" }),
    h("p.pf-sub", { text: "Drag to position it. Zoom with the slider, scroll or pinch." }),
    stage,
    h("div.pf-crop-zoomrow", {}, [h("span.pf-crop-ico.is-sm", {}, [ico("image", 12)]), zoom, h("span.pf-crop-ico", {}, [ico("image", 17)])]),
    h("div.pf-actions", {}, [btn("Cancel", onCancel), use])
  ])
  let w = 1, hgt = 1, base = 1, z = 1, ox = 0, oy = 0
  const clamp = () => {
    const dw = w * base * z, dh = hgt * base * z
    ox = Math.min(0, Math.max(CROP_V - dw, ox)); oy = Math.min(0, Math.max(CROP_V - dh, oy))
  }
  const paint = () => {
    clamp()
    img.style.width = `${w * base * z}px`
    img.style.transform = `translate(${ox}px, ${oy}px)`
    zoom.value = String(z)
  }
  // zoom keeping the point under (px, py) in place
  const zoomTo = (nz, px = CROP_V / 2, py = CROP_V / 2) => {
    nz = Math.min(6, Math.max(1, nz))
    const k = nz / z
    ox = px - (px - ox) * k; oy = py - (py - oy) * k
    z = nz; paint()
  }
  img.onload = () => {
    w = img.naturalWidth; hgt = img.naturalHeight
    base = CROP_V / Math.min(w, hgt)
    z = start?.z ?? 1
    const cx = start?.cx ?? 0.5, cy = start?.cy ?? 0.5
    ox = CROP_V / 2 - cx * w * base * z; oy = CROP_V / 2 - cy * hgt * base * z
    paint()
    stage.focus()
  }
  img.draggable = false
  img.src = src
  stage.append(img, h("div.pf-crop-ring"))
  zoom.addEventListener("input", () => zoomTo(Number(zoom.value)))
  stage.addEventListener("wheel", (e) => {
    e.preventDefault()
    const r = stage.getBoundingClientRect()
    zoomTo(z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)), e.clientX - r.left, e.clientY - r.top)
  }, { passive: false })
  stage.addEventListener("pointerdown", (e) => {
    stage.setPointerCapture(e.pointerId)
    stage.classList.add("is-dragging")
    let lx = e.clientX, ly = e.clientY
    const move = (ev) => { ox += ev.clientX - lx; oy += ev.clientY - ly; lx = ev.clientX; ly = ev.clientY; paint() }
    const up = () => { stage.classList.remove("is-dragging"); stage.removeEventListener("pointermove", move); stage.removeEventListener("pointerup", up); stage.removeEventListener("pointercancel", up) }
    stage.addEventListener("pointermove", move); stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up)
  })
  stage.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 20 : 4
    const map = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    if (map[e.key]) { e.preventDefault(); e.stopPropagation(); ox += map[e.key][0]; oy += map[e.key][1]; paint() }
    else if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomTo(z * 1.1) }
    else if (e.key === "-") { e.preventDefault(); zoomTo(z / 1.1) }
  })
  // Enter uses it, Esc backs out of the editor (not the whole sheet)
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel() }
    else if (e.key === "Enter" && e.target.tagName !== "BUTTON") { e.preventDefault(); e.stopPropagation(); onDone(render()) }
  })
  function render () {
    const c = document.createElement("canvas")
    c.width = c.height = CROP_OUT
    const k = CROP_OUT / CROP_V
    c.getContext("2d").drawImage(img, ox * k, oy * k, w * base * z * k, hgt * base * z * k)
    const dw = w * base * z, dh = hgt * base * z
    return { url: c.toDataURL("image/png"), crop: { cx: (CROP_V / 2 - ox) / dw, cy: (CROP_V / 2 - oy) / dh, z } }
  }
  return el
}

const imageIn = (dt) => [...(dt?.files ?? [])].find((f) => f.type.startsWith("image/")) ??
  [...(dt?.items ?? [])].find((i) => i.kind === "file" && i.type.startsWith("image/"))?.getAsFile()

// open: "window" (⌘N picker) = the new profile gets a window of its own and
// this window stays as it is; otherwise this window switches to it, like Chrome
export function openProfileSheet (existing = null, { open = true } = {}) {
  const draft = existing ? { ...existing } : { name: "", color: PROFILE_COLORS[data.list.length % PROFILE_COLORS.length], emoji: "" }
  let picture        // undefined = unchanged, null = remove, "data:…" = new picture
  let original = null, crop = null   // the uncropped image + where it was cropped (for Move & Scale again)
  const preview = h("div.pf-preview", { title: "Drop or paste a picture" })
  const usePicture = (url) => { picture = url; draft.picUrl = url; if (!url) { original = null; crop = null } paint() }
  // every new image goes through Move & Scale first
  const editPicture = (src, at = null) => {
    card.querySelector(".pf-crop")?.remove()
    const ed = cropEditor(src, at, ({ url, crop: c }) => {
      original = src; crop = c
      ed.remove(); card.classList.remove("is-cropping")
      usePicture(url)
    }, () => { ed.remove(); card.classList.remove("is-cropping") })
    card.classList.add("is-cropping")
    card.append(ed)
  }
  const adjust = async () => {
    const src = original ?? (existing?.pic ? await window.flux.profiles.pictureOriginal(existing.id) : null)
    if (src) editPicture(src, original ? crop : existing?.picCrop)
    else if (draft.picUrl) editPicture(draft.picUrl)    // older pictures saved before Move & Scale
  }
  const takeFile = async (file) => {
    if (!file) return false
    try { editPicture(await imageFileToDataUrl(file)) } catch { toast("Couldn't read that image — try Choose Picture… (HEIC works there)") }
    return true
  }
  preview.addEventListener("dragover", (e) => { e.preventDefault(); preview.classList.add("is-drop") })
  preview.addEventListener("dragleave", () => preview.classList.remove("is-drop"))
  preview.addEventListener("drop", (e) => { e.preventDefault(); preview.classList.remove("is-drop"); takeFile(imageIn(e.dataTransfer)) })
  const pickBtn = h("button.btn", { onclick: async () => {
    const r = await window.flux.profiles.pickPicture()
    if (r?.ok) editPicture(r.dataUrl); else if (r && !r.canceled) toast(r.text ?? "Couldn't use that image")
  } }, [ico("image", 14), h("span", { text: "Choose…" })])
  const adjustBtn = h("button.btn", { onclick: adjust, title: "Move and scale the picture" }, [h("span", { text: "Move & Scale" })])
  const clearBtn = h("button.btn", { onclick: () => usePicture(null) }, [h("span", { text: "Remove" })])
  preview.addEventListener("click", () => { if (draft.picUrl) adjust() })
  const name = h("input.field.pf-name", { type: "text", value: draft.name, placeholder: "School, Work, Personal…", maxLength: 32, spellcheck: false, "aria-label": "Profile name" })
  const paint = () => {
    preview.replaceChildren(avatar({ ...draft, name: draft.name || "?" }, 64))
    card.style.setProperty("--pf", draft.color)
    colors.querySelectorAll("button").forEach((b) => b.classList.toggle("is-on", b.dataset.v === draft.color))
    emojis.querySelectorAll("button").forEach((b) => b.classList.toggle("is-on", !draft.picUrl && b.dataset.v === draft.emoji))
    clearBtn.hidden = !draft.picUrl
    adjustBtn.hidden = !draft.picUrl
    preview.classList.toggle("has-pic", !!draft.picUrl)
    save.disabled = !draft.name.trim()
  }
  name.addEventListener("input", () => { draft.name = name.value; paint() })
  const colors = h("div.pf-swatches", { role: "radiogroup", "aria-label": "Color" }, PROFILE_COLORS.map((c) => {
    const b = h("button.pf-swatch", { role: "radio", title: c, dataset: { v: c }, onclick: () => { draft.color = c; paint() } })
    b.style.setProperty("--pf", c)
    return b
  }))
  const emojis = h("div.pf-emojis", { role: "radiogroup", "aria-label": "Icon" }, EMOJI.map((e) => h("button.pf-emoji", {
    role: "radio", title: e ? `Use ${e}` : "Use initials", dataset: { v: e }, onclick: () => { draft.emoji = e; if (draft.picUrl) { picture = null; draft.picUrl = null } paint() }
  }, e ? e : h("span.pf-emoji-ab", { text: "Aa" }))))

  const submit = async () => {
    if (!draft.name.trim()) return
    save.disabled = true
    const patch = { name: draft.name, color: draft.color, emoji: draft.emoji }
    if (picture !== undefined) patch.picture = picture
    if (picture && original) { patch.pictureOriginal = original; patch.picCrop = crop }
    if (existing) {
      const r = await window.flux.profiles.update(existing.id, patch)
      if (!r?.ok) { save.disabled = false; return toast(r?.text ?? "Couldn't save the profile") }
      closeSheet()
      await refresh(r)
      return
    }
    if (open === "window") {
      const r = await window.flux.profiles.create(patch, { open: "window" })
      if (!r?.ok) { save.disabled = false; return toast(r?.text ?? "Couldn't create the profile") }
      closeSheet()
      await refresh(r)
      return
    }
    // a new profile opens right away, like Chrome
    await T.flushSession()
    document.body.classList.add("is-switching-profile")
    const r = await window.flux.profiles.create(patch, { open: true })
    if (!r?.ok || r.focused) {
      T.thawSession()
      document.body.classList.remove("is-switching-profile")
      save.disabled = false
      if (!r?.ok) toast(r?.text ?? "Couldn't create the profile")
    }
  }
  const save = btn(existing ? "Done" : "Create Profile", submit, "btn btn--accent")
  const card = h("div.pf-sheet.glass", { role: "dialog", "aria-modal": "true", "aria-label": existing ? "Edit profile" : "New profile" }, [
    preview,
    h("h2.pf-title", { text: existing ? "Edit Profile" : "New Profile" }),
    h("p.pf-sub", { text: existing ? "Changes show everywhere this profile appears." : "Its own tabs, bookmarks, history, passwords, site logins, Home and look." }),
    name,
    h("div.pf-label", { text: "Picture" }),
    h("div.pf-pic-row", {}, [pickBtn, adjustBtn, clearBtn]),
    h("div.pf-pic-hint", { text: "or drop / paste (⌘V) an image" }),
    h("div.pf-label", { text: "Color" }), colors,
    h("div.pf-label", { text: "Icon" }), emojis,
    h("div.pf-actions", {}, [btn("Cancel", closeSheet), save])
  ])
  card.addEventListener("paste", (e) => { const f = imageIn(e.clipboardData); if (f) { e.preventDefault(); takeFile(f) } })
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
    h("p.pf-sub", { text: `${data.open.has(p.id) ? "Its window will close. " : ""}Its tabs, bookmarks, history, saved passwords and site logins move to the Trash, so you can still get them back from there.` }),
    h("div.pf-actions", {}, [btn("Cancel", closeSheet), go])
  ]))
  setTimeout(() => go.focus(), 30)
}

// ── Settings → Profiles ──────────────────────────────────────────
export function catProfiles () {
  const cur = currentProfile()
  const open = openProfiles()
  const rows = data.list.map((p, i) => {
    const on = p.id === cur.id
    const elsewhere = open.has(p.id)
    const many = data.list.length > 1
    return h("div.set-row.pf-row", {
      dataset: { search: `profile ${p.name} window`, id: p.id },
      tabindex: many ? 0 : null,
      title: many ? "Drag to reorder (⌥↑ ⌥↓) — the order sets ⌃⌘1…9" : null,
      "aria-keyshortcuts": many ? "Alt+ArrowUp Alt+ArrowDown" : null
    }, [
      avatar(p, 34),
      h("div.rtext", {}, [
        h("div.rlabel", {}, [p.name, i < 9 ? h("kbd.pf-kbd", { text: `⌃⌘${i + 1}`, title: `⌃⌘${i + 1} switches to ${p.name}` }) : null]),
        h("div.rdesc", { text: on ? (open.size ? "This window" : "Current profile") : elsewhere ? "Open in another window" : "" })
      ]),
      h("div.control", {}, [
        on ? h("span.pf-badge", {}, [ico("check", 12), "In use"]) : elsewhere ? null : btn("Switch", () => switchProfile(p.id)),
        on ? null : btn(elsewhere ? "Show Window" : "Open in New Window", () => openProfileWindow(p.id)),
        h("button.btn.btn--icon", { title: `Edit ${p.name}`, "aria-label": `Edit ${p.name}`, onclick: () => openProfileSheet(p) }, [ico("edit", 14)]),
        p.id !== "default" && !on ? h("button.btn.btn--icon", { title: `Remove ${p.name}`, "aria-label": `Remove ${p.name}`, onclick: () => confirmRemove(p) }, [ico("trash", 14)]) : null
      ].filter(Boolean))
    ])
  })
  const sec = group("Profiles", [
    ...rows,
    block([h("button.btn.pf-add", { onclick: () => openProfileSheet() }, [ico("plus", 14), "Add Profile…"])], "add profile new account")
  ], "Each profile keeps its own tabs, bookmarks, history, passwords, cookies and site logins, Home screen and look, and can have a window of its own beside the others (⌘N). Drag to change the order: ⌃⌘1…9 follow it. API keys are shared.")
  if (rows.length > 1) {
    sortable(rows[0].parentElement, {
      rows: () => [...rows[0].parentElement?.children ?? []].filter((r) => r.classList.contains("pf-row") && !r.classList.contains("is-hidden")),
      idOf: (r) => r.dataset.id,
      onMove: (ids, id, { keyboard }) => { if (keyboard) refocus = { id, t: Date.now() }; reorderProfiles(ids) }
    })
  }
  // a keyboard move re-renders Settings: keep the row focused
  if (refocus && Date.now() - refocus.t < 1500) {
    const id = refocus.id
    requestAnimationFrame(() => rows.find((r) => r.dataset.id === id && r.isConnected)?.focus({ preventScroll: true }))
  }
  return [sec]
}
let refocus = null

export async function initProfiles () {
  window.flux.profiles.onChange((r) => refresh(r))
  await refresh()
}
