// ───────────────────────────────────────────────────────────────────
//  easyfiles.js — the Easy Files picker (Opera GX-style).  A page's
//  file <input> lands here: pick what you just copied or a recent
//  download and it is handed to the page as a real upload.  "Browse
//  files…" is the plain macOS dialog.  Nothing on the clipboard and
//  nothing downloaded → straight to the dialog, no extra step.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { bus, toast } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { popover, closePopover } from "./popover.js"

export function matchesAccept (type, name, accept) {
  const list = String(accept || "").split(",").map((a) => a.trim().toLowerCase()).filter(Boolean)
  if (!list.length) return true
  const t = String(type || "").toLowerCase()
  const n = String(name || "").toLowerCase()
  return list.some((a) => a.startsWith(".") ? n.endsWith(a) : a.endsWith("/*") ? t.startsWith(a.slice(0, -1)) : t === a)
}

export function fmtSize (n) {
  if (n == null) return ""
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${Math.round(n / 1024)} KB`
  return `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`
}

function ago (t) {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000))
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`
}

function deliver (req, files) {
  if (!files?.length) return
  req.wv.send("flux-file-result", { id: req.id, files })
  toast(files.length === 1 ? `Uploaded “${files[0].name}”` : `Uploaded ${files.length} files`)
}

async function take (req, ids) {
  closePopover()
  const r = await window.flux.files.read(ids)
  if (!r.ok) return toast(r.text)
  deliver(req, r.files)
}

async function browse (req) {
  closePopover()
  const r = await window.flux.files.browse({ accept: req.accept, multiple: req.multiple })
  if (r.ok) deliver(req, r.files)
  else if (!r.canceled) toast(r.text)
}

function itemRow (req, it) {
  const ok = matchesAccept(it.type, it.name, req.accept)
  const icon = it.thumb ? h("img.ef-thumb", { src: it.thumb, draggable: false })
    : h("span.ef-ico", {}, [ico(it.type?.startsWith("text/") ? "note" : it.type?.startsWith("image/") ? "image" : "file", 18)])
  const sub = it.preview ? `“${it.preview}”` : [fmtSize(it.size), it.mtime && ago(it.mtime)].filter(Boolean).join(" · ")
  return h("button.ef-item", {
    disabled: !ok,
    title: ok ? `Upload ${it.name}` : "This site doesn't accept this kind of file",
    onclick: () => take(req, [it.id])
  }, [
    icon,
    h("span.ef-text", {}, [h("span.ef-name", { text: it.name }), sub && h("span.ef-sub", { text: sub })]),
    ok && h("span.ef-go", {}, [ico("upload", 14)])
  ])
}

async function openPicker (req) {
  const r = await window.flux.files.list()
  const clip = r.ok ? r.clipboard : []
  const dls = r.ok ? r.downloads : []
  if (!clip.length && !dls.length) return browse(req)

  const rect = req.wv.getBoundingClientRect()
  const at = { x: rect.left + (req.x ?? rect.width / 2), y: rect.top + (req.y ?? 40) }
  const copiedFiles = clip.filter((c) => c.id.startsWith("cf_") && matchesAccept(c.type, c.name, req.accept))

  const body = h("div.ef", {}, [
    h("div.ef-head", {}, [
      h("span.ef-badge", {}, [ico("clipboard", 15)]),
      h("div", {}, [h("div.ef-title", { text: "Upload a file" }), h("div.ef-hint", { text: "From your clipboard or recent downloads" })])
    ]),
    clip.length && h("div.micro.ef-group", { text: "Clipboard" }),
    ...clip.map((it) => itemRow(req, it)),
    req.multiple && copiedFiles.length > 1 && h("button.ef-item.ef-all", { onclick: () => take(req, copiedFiles.map((c) => c.id)) }, [
      h("span.ef-ico", {}, [ico("layers", 18)]),
      h("span.ef-text", {}, [h("span.ef-name", { text: `All ${copiedFiles.length} copied files` })])
    ]),
    dls.length && h("div.micro.ef-group", { text: "Recent downloads" }),
    ...dls.map((it) => itemRow(req, it)),
    h("div.ef-foot", {}, [
      h("button.btn.btn--plain", { onclick: () => browse(req) }, [ico("folder", 14), h("span", { text: "Browse files…" })])
    ])
  ])
  popover(at, body, { width: 340, className: "pop--files" })
}

export function initEasyFiles () {
  bus.on("file-pick", (req) => { openPicker(req).catch((e) => toast(`Easy Files: ${e.message}`)) })
}
