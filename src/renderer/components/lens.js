// ───────────────────────────────────────────────────────────────────
//  lens.js — search by image with Google Lens.  Paste (⌘V) or drop an
//  image on any search field, use the Lens button in the Home search
//  pill, or right-click an image on a page.  Image links go to Lens's
//  by-URL search; image data is posted from inside the new tab (main).
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { toast } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { popover, closePopover } from "./popover.js"
import * as T from "../core/tabs.js"

const MAX_SIDE = 1600

// the first image file in a paste / drop, if any
export function imageIn (dt) {
  if (!dt) return null
  for (const f of dt.files ?? []) if (f.type.startsWith("image/")) return f
  for (const i of dt.items ?? []) if (i.kind === "file" && i.type.startsWith("image/")) return i.getAsFile()
  return null
}
const isImageLink = (s) => /^https?:\/\/\S+\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?\S*)?$/i.test(String(s ?? "").trim())

async function jpegBytes (blob) {
  const bmp = await createImageBitmap(blob)
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const c = document.createElement("canvas")
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k))
  const g = c.getContext("2d")
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height)   // transparent PNGs → white, not black
  g.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close?.()
  const out = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.9))
  return new Uint8Array(await out.arrayBuffer())
}

// open a tab and post the image to Lens from inside it
export function lensBytes (bytes) {
  const id = T.newTab("about:blank", { title: "Google Lens" })
  const t = T.rawTab(id)
  let sent = false
  const go = async () => {
    if (sent) return
    sent = true
    const r = await window.flux.lens.upload(t.wv.getWebContentsId(), bytes)
    if (!r?.ok) toast(r?.text ?? "Google Lens didn't answer")
  }
  t.wv.addEventListener("dom-ready", go, { once: true })
}

export function lensUrl (url) {
  T.newTab(`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(url)}`)
}

export async function lensFile (file) {
  if (!file) return false
  try { lensBytes(await jpegBytes(file)) } catch { toast("Couldn't read that image — try Choose Image… (HEIC works there)") }
  return true
}

export async function lensClipboard () {
  const r = await window.flux.lens.clipboard()
  if (r?.bytes) lensBytes(r.bytes)
  else if (r?.url) lensUrl(r.url)
  else toast(r?.text ?? "Copy an image first")
}

export async function lensPick () {
  const r = await window.flux.lens.pick()
  if (r?.bytes) lensBytes(r.bytes)
  else if (r && !r.canceled) toast(r.text ?? "Couldn't use that image")
}

// paste / drop an image (or paste an image link) into a search field → Lens
export function attachLensInput (input, dropTarget = input) {
  input.addEventListener("paste", (e) => {
    const f = imageIn(e.clipboardData)
    if (f) { e.preventDefault(); lensFile(f); return }
    const text = e.clipboardData?.getData("text/plain")
    if (!input.value.trim() && isImageLink(text)) { e.preventDefault(); lensUrl(text.trim()) }
  })
  dropTarget.addEventListener("dragover", (e) => {
    if ([...(e.dataTransfer?.items ?? [])].some((i) => i.kind === "file" && i.type.startsWith("image/"))) { e.preventDefault(); dropTarget.classList.add("is-lens-drop") }
  })
  dropTarget.addEventListener("dragleave", () => dropTarget.classList.remove("is-lens-drop"))
  dropTarget.addEventListener("drop", (e) => {
    dropTarget.classList.remove("is-lens-drop")
    const f = imageIn(e.dataTransfer)
    if (f) { e.preventDefault(); lensFile(f) }
  })
}

// the Lens panel: drop zone + paste + choose + image link
export function lensPanel ({ compact = false } = {}) {
  const zone = h("div.lens-zone", { tabIndex: 0, title: "Drop an image, or click and press ⌘V" }, [
    ico("lens", compact ? 22 : 28),
    h("div.lens-zone-t", { text: "Drop an image here" }),
    h("div.lens-zone-s", { text: "or click here and paste (⌘V)" })
  ])
  const done = () => closePopover()
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("is-drop") })
  zone.addEventListener("dragleave", () => zone.classList.remove("is-drop"))
  zone.addEventListener("drop", (e) => { e.preventDefault(); zone.classList.remove("is-drop"); const f = imageIn(e.dataTransfer); if (f) { lensFile(f); done() } else toast("That isn't an image") })
  zone.addEventListener("paste", (e) => {
    const f = imageIn(e.clipboardData)
    const text = e.clipboardData?.getData("text/plain")?.trim()
    if (f) { e.preventDefault(); lensFile(f); done() } else if (/^https?:\/\//i.test(text ?? "")) { e.preventDefault(); lensUrl(text); done() }
  })
  const link = h("input.field.lens-link", { type: "url", placeholder: "Paste an image link", spellcheck: false })
  link.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return
    const v = link.value.trim()
    if (/^https?:\/\//i.test(v)) { lensUrl(v); done() } else toast("Enter an image link that starts with https://")
  })
  return h(`div.lens-panel${compact ? ".is-compact" : ""}`, {}, [
    zone,
    h("div.lens-actions", {}, [
      h("button.btn", { onclick: () => { lensClipboard(); done() } }, [ico("clipboard", 14), h("span", { text: "Paste Image" })]),
      h("button.btn", { onclick: () => { lensPick(); done() } }, [ico("image", 14), h("span", { text: "Choose Image…" })])
    ]),
    link
  ])
}

export function openLens (anchor) {
  return popover(anchor, h("div", {}, [h("div.micro.wp-label", { text: "Search with Google Lens" }), lensPanel()]), { width: 320, align: "end", className: "pop--lens" })
}
