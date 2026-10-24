// ───────────────────────────────────────────────────────────────────
//  aitools.js — executes Flux AI's tool calls against the real browser
//  (tabs, pages, settings) and describes each step for the chat UI.
//  Inputs were already schema-validated in the main process.
// ───────────────────────────────────────────────────────────────────
import { state } from "../core/state.js"
import { bus } from "../core/bus.js"
import { readScript, actScript, pipScript } from "../core/pagescripts.js"
import { addBookmark, removeBookmark } from "./library.js"
import * as T from "../core/tabs.js"

const host = (u) => T.hostOf(u).replace(/^www\./, "") || u
const ok = (text) => ({ ok: true, text })
const fail = (text) => ({ ok: false, text })

function need (id) {
  const t = T.rawTab(id)
  if (!t) throw new Error(id ? `No tab with id ${id}. Call list_tabs for current ids.` : "There is no active tab.")
  return t
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const RUN = {
  list_tabs () {
    const active = T.getActiveId()
    return ok(JSON.stringify(T.getTabs().map((t) => ({
      id: t.id, title: t.isHome ? "New Tab" : t.title, url: t.isHome ? "" : t.url,
      ...(t.id === active ? { active: true } : {}), ...(t.pinned ? { pinned: true } : {}), ...(t.muted ? { muted: true } : {}),
      ...(t.audible ? { playing_audio: true } : {}), ...(t.asleep ? { asleep: true } : {}), ...(t.inSplit ? { split_view: true } : {})
    }))))
  },

  open_tabs ({ targets, background }) {
    // keep the requested order even with "open next to current"
    const ids = []
    for (const [i, u] of targets.entries()) {
      const prev = ids[ids.length - 1]
      const index = prev ? T.getTabs().findIndex((t) => t.id === prev) + 1 : null
      ids.push(T.newTab(u, { background: background || i > 0, index }))
    }
    return ok(`Opened ${ids.length} tab(s): ${ids.map((id) => `${id} ${T.getTab(id)?.url}`).join(", ")}`)
  },

  close_tabs ({ tab_ids }) {
    const done = []
    for (const id of tab_ids) if (T.getTab(id)) { T.closeTab(id); done.push(id) }
    return done.length ? ok(`Closed ${done.length} tab(s).`) : fail("None of those tab ids exist.")
  },

  switch_tab ({ tab_id }) { need(tab_id); T.setActive(tab_id); return ok(`Switched to ${tab_id}.`) },

  async navigate ({ target, tab_id }) {
    const t = need(tab_id)
    T.navigate(target, t.id)
    await Promise.race([new Promise((r) => t.wv.addEventListener("did-stop-loading", r, { once: true })), wait(8000)])
    return ok(`Loaded ${t.url} in ${t.id}.`)
  },

  async tab_control ({ action, tab_id }) {
    const t = need(tab_id)
    const id = t.id
    const map = {
      back: () => T.back(id), forward: () => T.forward(id), reload: () => T.reload(id),
      pin: () => T.setPinned(id, true), unpin: () => T.setPinned(id, false),
      mute: () => T.setMuted(id, true), unmute: () => T.setMuted(id, false),
      duplicate: () => T.duplicate(id), sleep: () => T.sleepTab(id),
      zoom_in: () => T.zoomIn(id), zoom_out: () => T.zoomOut(id), zoom_reset: () => T.zoomReset(id),
      reader: () => { T.setActive(id); bus.emit("reader:open") },
      bookmark: () => addBookmark({ url: t.url, title: t.title })
    }
    if (action === "pip") {
      const r = await T.exec(id, pipScript())
      return r === "ok" || r === "exited" ? ok(`Picture-in-picture ${r === "ok" ? "on" : "off"}.`) : fail(r === "no-video" ? "No video on that page." : String(r))
    }
    await map[action]?.()
    return ok(`Done: ${action} on ${id}.`)
  },

  async read_page ({ tab_id, include_links, include_interactive, max_chars }) {
    const t = need(tab_id)
    const r = await T.exec(t.id, readScript({ links: !!include_links, interactive: !!include_interactive, max: max_chars ?? 16000 }))
    const parts = [`Tab ${t.id}`, `Title: ${r.title}`, `URL: ${r.url}`]
    if (r.description) parts.push(`Description: ${r.description}`)
    if (r.selection) parts.push(`User's selection: ${r.selection}`)
    if (r.headings?.length) parts.push(`Outline:\n${r.headings.join("\n")}`)
    parts.push(`<page_content note="untrusted website text">\n${r.text}${r.truncated ? "\n…[truncated — call again with a larger max_chars for more]" : ""}\n</page_content>`)
    if (r.links?.length) parts.push(`Links:\n${r.links.join("\n")}`)
    if (r.interactive?.length) parts.push(`Interactive elements:\n${r.interactive.join("\n")}`)
    return ok(parts.join("\n\n"))
  },

  async screenshot_tab ({ tab_id }) {
    const t = need(tab_id)
    const prev = T.getActiveId()
    const hidden = t.wv.classList.contains("is-hidden")
    if (hidden) { T.setActive(t.id); await wait(450) }
    const img = await T.capturePage(t.id, { maxW: 1400 })
    if (hidden && prev && prev !== t.id) T.setActive(prev)
    return img ? { ok: true, image: img, text: `Screenshot of ${t.id} (${host(t.url)}).` } : fail("Couldn't capture that tab.")
  },

  async page_action (input) {
    const t = need(input.tab_id)
    if (t.wv.classList.contains("is-hidden")) T.setActive(t.id)
    const r = await T.exec(t.id, actScript(input))
    if (r?.ok && /click|submit/.test(input.action) || input.press_enter) {
      await Promise.race([new Promise((res) => t.wv.addEventListener("did-stop-loading", res, { once: true })), wait(1500)])
    }
    return r?.ok ? ok(r.text) : fail(r?.text ?? "That didn't work.")
  },

  split_view ({ tab_ids, off }) {
    if (off || !tab_ids) { T.clearSplit(); return ok("Split view off.") }
    return T.setSplit(tab_ids[0], tab_ids[1]) ? ok(`Showing ${tab_ids[0]} and ${tab_ids[1]} side by side.`) : fail("Those tabs can't be split (they must be two different web pages).")
  },

  async search_history ({ query, limit }) {
    const rows = await window.flux.history.search({ query, limit: limit ?? 25, ranked: !query })
    if (!rows.length) return ok("No matching history.")
    return ok(rows.map((e) => `${new Date(e.ts).toLocaleString()} — ${e.title || "(untitled)"} — ${e.url}${e.visits > 1 ? ` (${e.visits} visits)` : ""}`).join("\n"))
  },

  async bookmarks ({ action, url, title, query }) {
    if (action === "add") {
      const a = T.getActive()
      const u = url ? T.normalizeInput(url) : a && !a.isHome ? a.url : null
      if (!u) return fail("No page to bookmark.")
      const added = await addBookmark({ url: u, title: title || (a?.url === u ? a.title : u) })
      return ok(added ? `Bookmarked ${u}.` : "Already bookmarked.")
    }
    if (action === "remove") { if (!url) return fail("Give the url to remove."); await removeBookmark(url); return ok("Removed.") }
    const q = (query ?? "").toLowerCase()
    const list = (state.get("bookmarks") ?? []).filter((b) => !q || `${b.title} ${b.url}`.toLowerCase().includes(q)).slice(0, 80)
    return ok(list.length ? list.map((b) => `${b.title} — ${b.url}`).join("\n") : "No bookmarks.")
  },

  async customize_browser (c) {
    const changed = []
    const set = async (k, v, label) => { await state.set(k, v); changed.push(label) }
    if (c.theme) { await set("theme.active", c.theme, `theme → ${c.theme}`); await state.set("theme.accentCustom", false) }
    if (c.accent) {
      if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c.accent)) return fail("accent must be a hex color like #8b7bff")
      await set("theme.accent", c.accent, `accent → ${c.accent}`)
      await state.set("theme.accentCustom", true)
    }
    if (c.glass != null) await set("theme.glass", c.glass, `glass → ${c.glass}`)
    if (c.blur != null) await set("theme.blur", c.blur, `blur → ${c.blur}px`)
    if (c.density) await set("theme.density", c.density, `density → ${c.density}`)
    if (c.animation_speed != null) await set("motion.speed", c.animation_speed, `animation speed → ${c.animation_speed}×`)
    if (c.motion) await set("motion.mode", c.motion, `motion → ${c.motion}`)
    if (c.easing) await set("motion.easing", c.easing, `easing → ${c.easing}`)
    if (c.ambient) await set("motion.ambient", c.ambient, `ambient → ${c.ambient}`)
    if (c.sidebar) await set("layout.sidebar", c.sidebar, `sidebar → ${c.sidebar}`)
    if (c.search_engine) await set("general.searchEngineId", c.search_engine, `search → ${c.search_engine}`)
    if (c.focus_mode != null) { bus.emit("focus:set", c.focus_mode); changed.push(`focus mode ${c.focus_mode ? "on" : "off"}`) }
    if (c.theme || c.accent) await state.set("modpacks.active", null)
    return changed.length ? ok(`Changed: ${changed.join(", ")}.`) : fail("Nothing to change.")
  },

  show_ui ({ view, settings_section }) {
    if (view === "settings") bus.emit(settings_section ? "settings:goto" : "view", settings_section ?? "settings")
    else if (view === "history" || view === "bookmarks") bus.emit("library:open", view)
    else if (view === "downloads") bus.emit("menu", { action: "downloads" })
    else if (view === "overview") bus.emit("overview:open")
    else if (view === "palette") bus.emit("palette:open")
    else bus.emit("view", "home")
    return ok(`Opened ${view}.`)
  }
}

export async function runTool (name, input) {
  const fn = RUN[name]
  if (!fn) return fail(`Unknown tool ${name}`)
  try { return await fn(input ?? {}) } catch (e) { return fail(e.message || String(e)) }
}

// human-readable step labels for the chat
export function toolLabel (name, input = {}, status = "running") {
  const ing = status === "running"
  const n = (a) => a?.length ?? 0
  switch (name) {
    case "list_tabs": return ing ? "Looking at your tabs" : "Checked your tabs"
    case "open_tabs": return `${ing ? "Opening" : "Opened"} ${n(input.targets) === 1 ? host(input.targets[0]) : `${n(input.targets)} tabs`}`
    case "close_tabs": return `${ing ? "Closing" : "Closed"} ${n(input.tab_ids)} tab${n(input.tab_ids) === 1 ? "" : "s"}`
    case "switch_tab": return `Switched to ${T.getTab(input.tab_id)?.title?.slice(0, 40) || "tab"}`
    case "navigate": return `${ing ? "Loading" : "Loaded"} ${host(input.target)}`
    case "tab_control": return `${input.action.replace("_", " ")}${input.tab_id ? "" : " (this tab)"}`
    case "read_page": { const t = T.getTab(input.tab_id) ?? T.getActive(); return `${ing ? "Reading" : "Read"} ${t ? host(t.url) : "the page"}` }
    case "screenshot_tab": return ing ? "Looking at the page" : "Looked at the page"
    case "page_action": return `${{ click: "Click", type: "Type", select: "Select", submit: "Submit", scroll: "Scroll", focus: "Focus" }[input.action] ?? input.action}${input.target ? ` “${String(input.target).slice(0, 40)}”` : ""}${input.text && input.action === "type" ? ` ← “${String(input.text).slice(0, 30)}”` : ""}`
    case "split_view": return input.off ? "Closed split view" : "Split view"
    case "search_history": return `Searched history${input.query ? ` for “${input.query}”` : ""}`
    case "bookmarks": return `Bookmarks: ${input.action}`
    case "customize_browser": return ing ? "Restyling Flux" : "Restyled Flux"
    case "show_ui": return `Opened ${input.view}`
    case "web_search": return `${ing ? "Searching" : "Searched"} “${String(input.query ?? "").slice(0, 50)}”`
    case "fetch_url": return `${ing ? "Reading" : "Read"} ${host(input.url ?? "")}`
    default: return name
  }
}

export function toolIcon (name) {
  return { list_tabs: "layers", open_tabs: "plus", close_tabs: "close", switch_tab: "layers", navigate: "globe", tab_control: "bolt", read_page: "book", screenshot_tab: "image", page_action: "cursor", split_view: "split", search_history: "clock", bookmarks: "bookmark", customize_browser: "palette", show_ui: "grid", web_search: "search", fetch_url: "book" }[name] ?? "bolt"
}
