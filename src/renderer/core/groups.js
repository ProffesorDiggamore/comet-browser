// ───────────────────────────────────────────────────────────────────
//  groups.js — tab groups (sidebar folders).  A group is a name, a
//  color and an open/closed state; a tab belongs to one through its
//  `group` field.  A group's tabs are kept next to each other in the
//  tab order, so ⌘↑ ⌘↓ walk them in the order the sidebar shows.
//  Groups ride along in the saved session (tabs.js writeSession).
// ───────────────────────────────────────────────────────────────────
import * as T from "./tabs.js"
import { bus } from "./bus.js"

export const GROUP_COLORS = ["blue", "purple", "pink", "red", "orange", "yellow", "green", "teal", "gray"]
export const colorVar = (c) => (c === "gray" ? "rgb(var(--ink) / 0.45)" : `var(--sys-${GROUP_COLORS.includes(c) ? c : "blue"})`)

const groups = new Map()          // id -> { id, name, color, collapsed }
let seq = 0

export const getGroups = () => [...groups.values()]
export const getGroup = (id) => groups.get(id) ?? null
// a saved / closed tab's group, only while that group still exists
export const groupAlive = (id) => (id && groups.has(id) ? id : null)
export const sessionGroups = () => getGroups().map((g) => ({ ...g }))
export function restoreGroups (list) {
  for (const g of list ?? []) {
    if (!g?.id) continue
    groups.set(g.id, { id: g.id, name: String(g.name ?? ""), color: g.color ?? "blue", collapsed: !!g.collapsed })
    const n = Number(String(g.id).replace(/\D/g, "")) || 0
    if (n > seq) seq = n
  }
}

const tabsIn = (gid) => T.getTabs().filter((t) => t.group === gid)

// "youtube.com" → "YouTube"-ish: the site name, capitalised
function suggestName (tab) {
  const host = T.hostOf(tab?.url ?? "").replace(/^www\./, "")
  const base = host.split(".").slice(-2, -1)[0] || host
  return base ? base[0].toUpperCase() + base.slice(1) : "New Group"
}

function nextColor () {
  const used = new Set(getGroups().map((g) => g.color))
  return GROUP_COLORS.find((c) => !used.has(c)) ?? GROUP_COLORS[groups.size % GROUP_COLORS.length]
}

// the slot right after the group's last tab (or where the tab already is)
function slotAfter (gid, movingId) {
  const all = T.getTabs()
  let last = -1
  all.forEach((t, i) => { if (t.group === gid && t.id !== movingId) last = i })
  if (last === -1) return null
  const from = all.findIndex((t) => t.id === movingId)
  return from !== -1 && from < last ? last : last + 1
}

export function createGroup (tabIds, { name, color } = {}) {
  const ids = tabIds.filter((id) => { const t = T.getTab(id); return t && !t.pinned })
  if (!ids.length) return null
  const id = `g${++seq}`
  groups.set(id, { id, name: name ?? suggestName(T.getTab(ids[0])), color: color ?? nextColor(), collapsed: false })
  for (const tid of ids) addToGroup(tid, id)
  T.emitTabs()
  bus.emit("group:rename", id)       // the sidebar opens the name for editing
  return id
}

export function addToGroup (tabId, gid) {
  const t = T.rawTab(tabId)
  if (!t || t.pinned || !groups.has(gid)) return
  const at = slotAfter(gid, tabId)
  t.group = gid
  if (at != null) T.move(tabId, at)
  else T.emitTabs()
}

// out of the group, and parked just below it so it doesn't land mid-group
export function removeFromGroup (tabId) {
  const t = T.rawTab(tabId)
  if (!t?.group) return
  const gid = t.group
  t.group = null
  const at = slotAfter(gid, tabId)
  if (at != null) T.move(tabId, at)
  else T.emitTabs()
  prune()
}

export function setGroupOf (tabId, gid) {
  const t = T.rawTab(tabId)
  if (!t || t.pinned || t.group === (gid ?? null)) return
  t.group = groupAlive(gid)
  T.emitTabs()
  prune()
}

export function renameGroup (gid, name) { const g = groups.get(gid); if (!g) return; g.name = String(name ?? "").trim(); T.emitTabs() }
export function setGroupColor (gid, color) { const g = groups.get(gid); if (!g) return; g.color = color; T.emitTabs() }
export function toggleGroup (gid, open) {
  const g = groups.get(gid); if (!g) return
  g.collapsed = open == null ? !g.collapsed : !open
  T.emitTabs()
}

export function ungroup (gid) {
  for (const t of tabsIn(gid)) T.rawTab(t.id).group = null
  groups.delete(gid)
  T.emitTabs()
}

export function closeGroup (gid) {
  const ids = tabsIn(gid).map((t) => t.id)
  groups.delete(gid)
  for (const id of ids) T.closeTab(id)
  T.emitTabs()
}

export function newTabInGroup (gid) {
  const at = slotAfter(gid, null)
  const g = groups.get(gid)
  if (g?.collapsed) g.collapsed = false
  return T.newTab(null, { group: gid, index: at ?? undefined })
}

// a group with no tabs left disappears
export function prune () {
  const live = new Set(T.getTabs().map((t) => t.group).filter(Boolean))
  let changed = false
  for (const id of groups.keys()) if (!live.has(id)) { groups.delete(id); changed = true }
  if (changed) T.emitTabs()
}

bus.on("tabs", ({ tabs }) => {
  // a tab closed out of a group can leave it empty: let it go (next tick, not mid-emit)
  const live = new Set(tabs.map((t) => t.group).filter(Boolean))
  if ([...groups.keys()].some((id) => !live.has(id))) queueMicrotask(prune)
})
