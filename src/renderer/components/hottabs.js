// ───────────────────────────────────────────────────────────────────
//  hottabs.js — Apple-style Hot Tab grid + editor.
//  A Hot Tab: { id, label, url?, urls?, icon (dataURL|null), hotkey,
//  action: "open" | "macro" }.  Icon falls back to the live favicon
//  cached from browsing that domain.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { state } from "../core/state.js"
import { bus, toast } from "../core/bus.js"
import { ico } from "../core/icons.js"
import * as T from "../core/tabs.js"

function glyphFace (isMacro, size = 30) {
  const g = ico(isMacro ? "grid" : "globe", size)
  g.style.color = "#fff"
  g.style.opacity = "0.92"
  return g
}

function uid () { return `ht_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}` }

function launch (ht) {
  if (ht.action === "macro") T.openMacro(ht.urls ?? [])
  else T.navigate(ht.url ?? "about:blank")
  bus.emit("view", "tabs")
}

export function hotGrid () {
  const list = state.get("hotTabs") ?? []
  const grid = h("div.hot-grid")

  for (const ht of list) {
    const fallback = ht.action === "macro" ? null : T.faviconFor(ht.url ?? "")
    const face = ht.icon
      ? h("img", { src: ht.icon })
      : fallback
        ? h("img", { src: fallback, onerror: (e) => { e.target.replaceWith(glyphFace(ht.action === "macro")) } })
        : glyphFace(ht.action === "macro")

    grid.append(h("button.hot", {
      oncontextmenu: (e) => { e.preventDefault(); openEditor(ht) },
      onclick: () => launch(ht)
    }, [
      h("div.squircle", {}, [face]),
      h("div.cap", { text: ht.label ?? "Untitled" }),
      ht.hotkey && h("div.kbd", { text: ht.hotkey.replace("CmdOrCtrl", "⌘") })
    ]))
  }

  grid.append(h("button.hot.add", { onclick: () => openEditor(null) }, [
    h("div.squircle", {}, [ico("plus", 26)]),
    h("div.cap", { text: "Add Hot Tab" })
  ]))

  return grid
}

export function openEditor (ht) {
  const editing = Boolean(ht)
  const model = ht
    ? { ...ht }
    : { id: uid(), label: "", url: "https://", urls: [], icon: null, hotkey: "", action: "open" }

  const iconPreview = h("div.squircle", { style: { width: "64px", height: "64px" } },
    [model.icon ? h("img", { src: model.icon }) : glyphFace(model.action === "macro", 24)])

  const labelIn = h("input", { type: "text", value: model.label, placeholder: "Label" })
  const urlIn = h("input", { type: "url", value: model.url ?? "", placeholder: "https://…" })
  const urlsIn = h("textarea", { placeholder: "One URL per line (macro)", value: (model.urls ?? []).join("\n"), style: { minHeight: "90px" } })
  const hotkeyIn = h("input", { type: "text", value: model.hotkey ?? "", placeholder: "e.g. CmdOrCtrl+1" })
  const actionSel = h("select", {}, [
    h("option", { value: "open", selected: model.action === "open" }, "Open one URL"),
    h("option", { value: "macro", selected: model.action === "macro" }, "Macro — open many")
  ])

  const macroWrap = h("label.field", { style: { display: model.action === "macro" ? "flex" : "none" } }, ["URLs", urlsIn])
  const urlWrap = h("label.field", { style: { display: model.action === "macro" ? "none" : "flex" } }, ["URL", urlIn])
  actionSel.addEventListener("change", () => {
    macroWrap.style.display = actionSel.value === "macro" ? "flex" : "none"
    urlWrap.style.display = actionSel.value === "macro" ? "none" : "flex"
  })

  const modal = h("div", {
    style: { position: "fixed", inset: "0", zIndex: "600", display: "grid", placeItems: "center", background: "rgba(0,0,0,0.45)" },
    onclick: (e) => { if (e.target === modal) modal.remove() }
  }, [
    h("div.glass.glass--card", { style: { width: "460px", padding: "22px", display: "flex", flexDirection: "column", gap: "12px" } }, [
      h("h3", { text: editing ? "Edit Hot Tab" : "New Hot Tab", style: { margin: "0" } }),
      h("div.row", {}, [
        iconPreview,
        h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" } }, [
          h("button.btn", {
            onclick: async () => {
              const r = await window.flux.pick.image()
              if (r.ok) { model.icon = r.dataUrl; iconPreview.replaceChildren(h("img", { src: r.dataUrl })) }
            }
          }, "Upload icon"),
          model.icon && h("button.btn.btn--ghost", { onclick: () => { model.icon = null; iconPreview.replaceChildren(glyphFace(model.action === "macro", 24)) } }, "Use favicon instead")
        ])
      ]),
      h("label.field", {}, ["Label", labelIn]),
      h("label.field", {}, ["Action", actionSel]),
      urlWrap, macroWrap,
      h("label.field", {}, ["Global-ish hotkey (optional)", hotkeyIn]),
      h("div.row", { style: { justifyContent: "space-between", marginTop: "6px" } }, [
        editing
          ? h("button.btn.btn--ghost", { onclick: () => { removeHot(model.id); modal.remove() } }, "Delete")
          : h("span"),
        h("div.row", {}, [
          h("button.btn.btn--ghost", { onclick: () => modal.remove() }, "Cancel"),
          h("button.btn.btn--accent", {
            onclick: async () => {
              model.label = labelIn.value.trim() || "Untitled"
              model.action = actionSel.value
              model.url = urlIn.value.trim()
              model.urls = urlsIn.value.split("\n").map((s) => s.trim()).filter(Boolean)
              model.hotkey = hotkeyIn.value.trim()
              await saveHot(model)
              modal.remove()
            }
          }, "Save")
        ])
      ])
    ])
  ])
  document.body.append(modal)
}

async function saveHot (model) {
  const list = [...(state.get("hotTabs") ?? [])]
  const i = list.findIndex((x) => x.id === model.id)
  if (i === -1) list.push(model); else list[i] = model
  await state.set("hotTabs", list)
  toast("Hot Tab saved")
}

async function removeHot (id) {
  await state.set("hotTabs", (state.get("hotTabs") ?? []).filter((x) => x.id !== id))
  toast("Hot Tab removed")
}

// keyboard: match a hot tab's hotkey (CmdOrCtrl+<key>)
export function matchHotkey (e) {
  const meta = e.metaKey || e.ctrlKey
  if (!meta) return false
  const list = state.get("hotTabs") ?? []
  for (const ht of list) {
    if (!ht.hotkey) continue
    const key = ht.hotkey.split("+").pop().toLowerCase()
    if (e.key.toLowerCase() === key) { launch(ht); return true }
  }
  return false
}
