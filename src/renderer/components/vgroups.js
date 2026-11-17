// ───────────────────────────────────────────────────────────────────
//  vgroups.js — tab-group headers in the sidebar.  Click folds the
//  group (its active tab stays visible), double-click renames, + opens
//  a tab inside it, right-click for color / ungroup / close.  Drop a
//  tab on the header to move it in.  Also the inline rename field that
//  tab rows reuse.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { ico } from "../core/icons.js"
import { menu } from "./popover.js"
import * as G from "../core/groups.js"

// swap a label for a text field; Enter / blur saves, Escape cancels
export function inlineEdit (labelEl, value, onDone, placeholder = "") {
  if (labelEl.parentNode?.querySelector(":scope > input.vt-edit")) return
  const input = h("input.vt-edit", { type: "text", value, placeholder, spellcheck: false, draggable: false })
  let done = false
  const finish = (save) => {
    if (done) return
    done = true
    input.replaceWith(labelEl)
    if (save) onDone(input.value.trim())
  }
  input.addEventListener("keydown", (e) => {
    e.stopPropagation()
    if (e.key === "Enter") { e.preventDefault(); finish(true) }
    if (e.key === "Escape") { e.preventDefault(); finish(false) }
  })
  input.addEventListener("blur", () => finish(true))
  for (const ev of ["click", "mousedown", "dblclick"]) input.addEventListener(ev, (e) => e.stopPropagation())
  labelEl.replaceWith(input)
  input.focus(); input.select()
}

export function groupMenu (g, anchor) {
  menu(anchor, [
    { label: "Rename Group", icon: "edit", run: () => renameHeader(g.id) },
    { label: "New Tab in Group", icon: "plus", run: () => G.newTabInGroup(g.id) },
    { label: g.collapsed ? "Expand Group" : "Collapse Group", icon: "chevronDown", run: () => G.toggleGroup(g.id) },
    "-",
    ...G.GROUP_COLORS.map((c) => ({ label: c[0].toUpperCase() + c.slice(1), checked: g.color === c, swatch: G.colorVar(c), run: () => G.setGroupColor(g.id, c) })),
    "-",
    { label: "Ungroup Tabs", icon: "layers", run: () => G.ungroup(g.id) },
    { label: "Close Group", icon: "close", danger: true, run: () => G.closeGroup(g.id) }
  ])
}

const headers = new Map()   // gid -> element

export function renameHeader (gid) {
  const el = headers.get(gid)
  const g = G.getGroup(gid)
  if (!el || !g) return
  inlineEdit(el.querySelector(".vt-gname"), g.name, (v) => G.renameGroup(gid, v), "Group name")
}

// one header element per group, reused across renders
export function headerFor (g, { onDropTab }) {
  let el = headers.get(g.id)
  if (!el) {
    el = h("div.vt-group-h", {
      role: "button", tabindex: 0, "aria-expanded": "true",
      onclick: () => G.toggleGroup(g.id),
      ondblclick: (e) => { e.preventDefault(); renameHeader(g.id) },
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); G.toggleGroup(g.id) } },
      oncontextmenu: (e) => { e.preventDefault(); groupMenu(G.getGroup(g.id), { x: e.clientX, y: e.clientY }) },
      ondragover: (e) => { if (onDropTab.active()) { e.preventDefault(); el.classList.add("is-drop") } },
      ondragleave: () => el.classList.remove("is-drop"),
      ondrop: (e) => { e.preventDefault(); el.classList.remove("is-drop"); onDropTab.drop(g.id) }
    }, [
      h("span.vt-gchev", {}, [ico("chevronDown", 12)]),
      h("span.vt-gdot"),
      h("span.vt-gname"),
      h("span.vt-gcount"),
      h("span.vt-gap"),
      h("button.vt-gadd", { title: "New tab in this group", "aria-label": "New tab in this group", onclick: (e) => { e.stopPropagation(); G.newTabInGroup(g.id) } }, [ico("plus", 12)])
    ])
    el.dataset.gid = g.id
    headers.set(g.id, el)
  }
  return el
}

export function paintHeader (el, g, count) {
  el.style.setProperty("--g", G.colorVar(g.color))
  el.classList.toggle("is-collapsed", !!g.collapsed)
  el.setAttribute("aria-expanded", String(!g.collapsed))
  const name = el.querySelector(".vt-gname")
  if (name) {
    const text = g.name || "Untitled group"
    if (name.textContent !== text) name.textContent = text
    name.classList.toggle("is-empty", !g.name)
  }
  el.querySelector(".vt-gcount").textContent = g.collapsed ? String(count) : ""
  el.title = `${g.name || "Group"} — ${count} tab${count === 1 ? "" : "s"}`
}

export function dropHeader (gid) { headers.delete(gid) }
