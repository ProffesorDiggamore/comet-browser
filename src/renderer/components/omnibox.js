// ───────────────────────────────────────────────────────────────────
//  omnibox.js — one smart box for the toolbar address bar and the Home
//  search pill.  Suggests: Ask Comet AI, go-to URL, keyword searches
//  ("yt cats"), inline math, open tabs, bookmarks and history (ranked).
//  Enter picks the best guess; ⌘⏎ always asks the AI; ⌥⏎ new tab.
//  Typing the start of a site you know ("you") completes it inline
//  ("youtube.com", the rest selected), so Enter goes straight there.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { ico } from "../core/icons.js"
import { state } from "../core/state.js"
import { bus } from "../core/bus.js"
import { engineById } from "../data/engines.js"
import * as T from "../core/tabs.js"
import { attachLensInput } from "./lens.js"
import { leave } from "../core/motion.js"

// ── tiny safe calculator (+ - * / % ^ parentheses) ──────────────────
function calc (src) {
  const s = src.replace(/\s+/g, "").replace(/×/g, "*").replace(/÷/g, "/")
  if (!/^[\d.+\-*/%^()]+$/.test(s) || !/\d[+\-*/%^]|\)\d|[+\-*/%^]\(/.test(s)) return null
  let i = 0
  const num = () => { const m = /^\d*\.?\d+/.exec(s.slice(i)); if (!m) throw 0; i += m[0].length; return Number(m[0]) }
  const atom = () => {
    if (s[i] === "-") { i++; return -atom() }
    if (s[i] === "(") { i++; const v = expr(); if (s[i++] !== ")") throw 0; return v }
    return num()
  }
  const pow = () => { let v = atom(); while (s[i] === "^") { i++; v = v ** atom() } return v }
  const term = () => {
    let v = pow()
    while ("*/%".includes(s[i]) && s[i]) { const op = s[i++]; const r = pow(); v = op === "*" ? v * r : op === "/" ? v / r : v % r }
    return v
  }
  const expr = () => { let v = term(); while ((s[i] === "+" || s[i] === "-")) { const op = s[i++]; const r = term(); v = op === "+" ? v + r : v - r } return v }
  try {
    const v = expr()
    if (i !== s.length || !Number.isFinite(v)) return null
    return Math.round(v * 1e10) / 1e10
  } catch { return null }
}

const QUESTION = /^(what|whats|what's|why|how|who|whom|whose|when|where|which|can|could|should|would|will|is|are|am|do|does|did|explain|summari[sz]e|write|draft|compare|help|tell|give|make|create|plan|translate|open|close|find|show|organi[sz]e|list|recommend|suggest|teach|fix|debug|rewrite|calculate|convert)\b/i

export function classify (q) {
  const s = q.trim()
  if (!s) return "none"
  if (T.looksLikeUrl(s)) return "url"
  if (T.keywordFor(s)) return "keyword"
  const mode = state.get("ai.enterAction") ?? "smart"
  if (mode === "ai") return "ai"
  if (mode === "search") return "search"
  const words = s.split(/\s+/).length
  if (/\?\s*$/.test(s) && words >= 2) return "ai"
  if (QUESTION.test(s) && words >= 3) return "ai"
  return "search"
}

const fav = (url) => {
  const f = T.faviconFor(url)
  return f ? h("img.ob-fav", { src: f, onerror: (e) => e.target.replaceWith(ico("globe", 15)) }) : ico("globe", 15)
}

// "https://www.youtube.com/watch?v=1" → "youtube.com/watch?v=1" (what a person would type)
const bare = (url) => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.host.replace(/^www\./, "") + (u.pathname === "/" ? "" : u.pathname) : "" } catch { return "" } }

// best inline completion for what was typed, from a list of urls (ordered best first).
// Completes to the site ("youtube.com") unless a path is already being typed.
function completion (raw, urls) {
  const q = raw.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "")
  if (!q || /\s/.test(raw)) return null
  for (const url of urls) {
    const full = bare(url)
    const host = full.split("/")[0]
    const cand = q.includes("/") ? full : host
    if (cand.length > q.length && cand.toLowerCase().startsWith(q)) return { rest: cand.slice(q.length), text: cand, url: q.includes("/") ? url : `https://${new URL(url).host}/` }
  }
  return null
}

export function attachOmnibox (input, { anchor = input, place = "toolbar", onDone = null } = {}) {
  attachLensInput(input, anchor)     // paste / drop an image → Google Lens
  let box = null
  let items = []
  let sel = 0
  let seqq = 0
  let timer = null
  let typed = null        // what was actually typed while the tail of the field is an inline completion
  let complete = false    // the last edit was typing at the end, so a completion may be offered
  let moved = false       // the arrow keys / pointer picked a row since the last edit

  // the query is what the user typed, not the completed text sitting selected after it
  const inlineOn = () => typed != null && input.selectionStart === typed.length && input.selectionEnd === input.value.length && input.value.length > typed.length
  const query = () => (inlineOn() ? typed : input.value).trim()
  function applyInline (raw, c) {
    if (!c || document.activeElement !== input || input.value !== raw) return false
    typed = raw
    input.value = raw + c.rest
    input.setSelectionRange(raw.length, input.value.length)
    return true
  }

  // fades out like every other popover; the pill keeps its open shape until the panel is gone
  const close = () => {
    const b = box; box = null; items = []
    if (!b) { anchor.classList.remove("has-suggest"); return }
    b.style.pointerEvents = "none"
    leave(b, document.body.dataset.animPopover === "none" ? "none" : "fade").then(() => { b.remove(); if (!box) anchor.classList.remove("has-suggest") })
  }

  function go (url, newTab) {
    if (newTab || place === "home" && !T.getActive()?.isHome) T.newTab(url)
    else T.navigate(url)
  }

  function primaryAction (q, how) {
    const kind = how ?? classify(q)
    if (kind === "ai") return () => bus.emit("ai:ask", { text: q })
    if (kind === "search") return (nt) => go(T.engineSearch(q), nt)
    return (nt) => go(q, nt)
  }

  async function build () {
    const q = query()
    const my = ++seqq
    if (!q) { close(); return }
    const raw = inlineOn() ? typed : input.value
    const wantInline = complete && !/\s/.test(raw)
    const goItem = (c) => ({ icon: "arrowRight", label: c.text, sub: "Go to site", url: c.url, run: (nt) => go(c.url, nt), primary: true, inline: true })
    const kind = classify(q)
    const engine = engineById(state.get("general.searchEngineId"))
    const list = []
    const math = calc(q)
    if (math != null) list.push({ icon: "hash", label: `= ${math.toLocaleString()}`, sub: "Copy result", run: () => { navigator.clipboard.writeText(String(math)); bus.emit("toast", "Copied") } })
    const kw = T.keywordFor(q)
    if (kw) list.push({ icon: "search", label: `Search ${kw.name} for “${kw.query}”`, run: (nt) => go(kw.url, nt), primary: true })
    if (kind === "url") list.push({ icon: "arrowRight", label: q, sub: "Go to site", run: (nt) => go(q, nt), primary: true })
    const ai = { icon: "spark", label: q, sub: "Ask Comet AI", cls: "is-ai", run: () => bus.emit("ai:ask", { text: q }), primary: kind === "ai" }
    const search = { icon: "search", label: q, sub: `Search ${engine.name ?? "the web"}`, run: (nt) => go(T.engineSearch(q), nt), primary: kind === "search" }
    if (kind === "ai") list.push(ai, search)
    else list.push(search)
    // Ask Comet AI stays reachable (Tab jumps to it) but sits below the real matches
    const withAi = () => (kind === "ai" ? list : [...list, ai])

    const ql = q.toLowerCase()
    const seen = new Set()
    for (const t of T.getTabs()) {
      if (t.isHome || !(`${t.title} ${t.url}`.toLowerCase().includes(ql)) || t.id === T.getActiveId()) continue
      seen.add(t.url)
      list.push({ icon: "layers", label: t.title || t.url, sub: "Switch to tab", url: t.url, run: () => T.setActive(t.id) })
      if (list.length > 7) break
    }
    for (const b of (state.get("bookmarks") ?? []).filter((b) => `${b.title} ${b.url}`.toLowerCase().includes(ql)).slice(0, 3)) {
      if (seen.has(b.url)) continue
      seen.add(b.url)
      list.push({ icon: "bookmark", label: b.title || b.url, sub: b.url, url: b.url, run: (nt) => go(b.url, nt) })
    }
    // inline completion: open tabs and bookmarks first (no wait), history after it answers
    let inl = null
    if (wantInline) {
      inl = completion(raw, [...T.getTabs().filter((t) => !t.isHome).map((t) => t.url), ...(state.get("bookmarks") ?? []).map((b) => b.url)])
      if (inl && (inlineOn() || applyInline(raw, inl))) list.unshift(goItem(inl)); else inl = null
    }
    paint(withAi(), kind)
    const hist = await window.flux.history.search({ query: q, limit: 8, ranked: true })
    if (my !== seqq) return
    if (wantInline && !inl) {
      inl = completion(raw, hist.map((e) => e.url))
      if (inl && applyInline(raw, inl)) list.unshift(goItem(inl))
    }
    for (const e of hist) {
      if (seen.has(e.url) || list.length > 11) continue
      seen.add(e.url)
      list.push({ icon: "clock", label: e.title || e.url, sub: e.url, url: e.url, run: (nt) => go(e.url, nt) })
    }
    paint(withAi(), kind)
  }

  function paint (list, kind) {
    items = list
    const pi = list.findIndex((x) => x.primary)
    if (!box || !moved || sel >= list.length) sel = Math.max(0, pi)
    if (!box) {
      box = h(`div.ob-suggest.glass.ob-${place}`, { role: "listbox" })
      document.body.append(box)
      anchor.classList.add("has-suggest")
    }
    const r = anchor.getBoundingClientRect()
    Object.assign(box.style, { left: `${r.left}px`, top: `${r.bottom + 8}px`, width: `${r.width}px` })
    box.replaceChildren(...list.map((it, i) => h(`button.ob-item${i === sel ? ".is-sel" : ""}${it.cls ? "." + it.cls : ""}`, {
      onmousedown: (e) => e.preventDefault(),
      onmouseenter: () => { sel = i; moved = true; mark() },
      onclick: (e) => run(it, e.altKey || e.metaKey)
    }, [
      h("span.ob-ico", {}, [it.url ? fav(it.url) : ico(it.icon, 16)]),
      h("span.ob-label", { text: it.label }),
      it.sub && h("span.ob-sub", { text: it.sub })
    ])))
    void kind
  }
  const mark = () => box?.querySelectorAll(".ob-item").forEach((b, i) => b.classList.toggle("is-sel", i === sel))

  function run (it, newTab) {
    close()
    input.blur()
    it.run(newTab)
    onDone?.()
  }

  input.addEventListener("input", (e) => {
    // only plain typing at the end of the field earns a completion: not deleting, pasting or composing
    complete = e.inputType === "insertText" && !e.isComposing && input.selectionEnd === input.value.length
    typed = null; moved = false
    clearTimeout(timer); timer = setTimeout(build, 50)
  })
  input.addEventListener("blur", () => setTimeout(close, 120))
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && box) { e.preventDefault(); moved = true; sel = Math.min(items.length - 1, sel + 1); mark() }
    else if (e.key === "ArrowUp" && box) { e.preventDefault(); moved = true; sel = Math.max(0, sel - 1); mark() }
    else if (e.key === "Tab" && !e.shiftKey && input.value.trim()) {
      // Tab jumps straight to "Ask Comet AI"
      e.preventDefault()
      const i = items.findIndex((x) => x.cls === "is-ai")
      if (i >= 0) { sel = i; mark() }
    } else if (e.key === "Enter") {
      e.preventDefault()
      const q = input.value.trim()
      if (!q) return
      if (e.metaKey || e.ctrlKey) { close(); input.blur(); bus.emit("ai:ask", { text: query() }); onDone?.(); return }
      const it = items[sel]
      if (it) run(it, e.altKey)
      else { close(); input.blur(); primaryAction(q)(e.altKey); onDone?.() }
    } else if (e.key === "Escape") {
      if (box) { e.preventDefault(); e.stopPropagation(); close() }
    }
  })
  return { close, refresh: build }
}
