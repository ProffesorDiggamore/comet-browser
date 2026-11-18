// ───────────────────────────────────────────────────────────────────
//  omnibox.js — one smart box for the toolbar address bar and the Home
//  search pill.  Suggests (Spotlight / Safari order): Top Hit, search
//  predictions from your engine, open tabs, bookmarks, history — then
//  Ask Comet AI, last.  The best guess shows as ghost text in the field
//  ("you" → youtube.com, or the top prediction): → / Tab / End accepts,
//  Backspace / Esc dismisses.  Enter goes to a site guess, but searches
//  exactly what you typed when the guess is only a prediction.
//  ⌘⏎ / ⌥⏎ open in a new tab; ⇧⌘⏎ always asks the AI.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { ico } from "../core/icons.js"
import { state } from "../core/state.js"
import { bus } from "../core/bus.js"
import { engineById } from "../data/engines.js"
import * as T from "../core/tabs.js"
import { attachLensInput } from "./lens.js"
import { leave } from "../core/motion.js"
import { makeGhost } from "./omnibox-ghost.js"
import { canPredict, cached, fetchPredictions } from "./omnibox-predict.js"
import { convert } from "../core/units.js"

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


const MAX_ROWS = 8        // rows before the Comet AI row
const MAX_PRED = 4        // search predictions shown at most
const PRED_WAIT = 70      // ms after the list paints before asking the engine (≈120ms after the keystroke)

export function attachOmnibox (input, { anchor = input, place = "toolbar", onDone = null } = {}) {
  attachLensInput(input, anchor)     // paste / drop an image → Google Lens
  const ghost = makeGhost(input, anchor)
  let box = null
  let items = []
  let sel = 0
  let selKey = null       // the row the arrows / pointer picked (survives predictions splicing in)
  let moved = false
  let timer = null
  let predTimer = null
  let typed = ""          // what the user typed; the field may be previewing a row instead
  let complete = false    // the last edit was plain typing at the end, so a guess may be offered
  let composing = false   // IME composition in progress: hands off
  let guess = null        // { kind: "site" | "search", rest }
  let cur = null          // the current build's sections
  let seqq = 0
  let predSlots = 0       // prediction rows shown last time, held while the next answer is on its way

  const query = () => typed.trim()
  const caretAtEnd = () => input.selectionStart === input.value.length && input.selectionEnd === input.value.length

  // ── ghost text ──────────────────────────────────────────────────
  function showGuess (g) {
    if (g && document.activeElement === input && !composing && input.value === typed && caretAtEnd()) { guess = g; ghost.show(typed, g.rest) }
    else { guess = null; ghost.hide() }
  }
  // Backspace / Esc / moving the caret: the guess goes and doesn't come back until the next keystroke
  function dismiss () {
    guess = null; ghost.hide(); complete = false
    if (cur) { cur.wantGuess = false; cur.site = null; render() }
  }
  function accept () {
    if (!guess || !ghost.on) return false
    input.value = typed + guess.rest
    typed = input.value
    input.setSelectionRange(typed.length, typed.length)
    guess = null; ghost.hide(); complete = false; moved = false; selKey = null
    build()
    return true
  }

  // fades out like every other popover; the pill keeps its open shape until the panel is gone
  const close = () => {
    clearTimeout(predTimer)
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

  // ── gather: local results now, history and predictions as they answer ──
  function build () {
    clearTimeout(timer); timer = null
    const raw = typed
    const q = raw.trim()
    const my = ++seqq
    if (!q) { cur = null; showGuess(null); close(); return }
    const kind = classify(q)
    const engine = engineById(state.get("general.searchEngineId"))
    const ql = q.toLowerCase()
    const top = []
    const math = calc(q)
    if (math != null) top.push({ key: "math", icon: "hash", label: `= ${math.toLocaleString()}`, sub: "Copy result", run: () => { navigator.clipboard.writeText(String(math)); bus.emit("toast", "Copied") } })
    const conv = math == null ? convert(q) : null
    if (conv) top.push({ key: "math", icon: "hash", label: conv.text, sub: "Copy result", run: () => { navigator.clipboard.writeText(String(conv.value)); bus.emit("toast", "Copied") } })
    const kw = T.keywordFor(q)
    if (kw) top.push({ key: "kw", icon: "search", label: `Search ${kw.name} for “${kw.query}”`, run: (nt) => go(kw.url, nt), primary: true })
    if (kind === "url") top.push({ key: "url", icon: "arrowRight", label: q, sub: "Go to site", fill: raw, run: (nt) => go(q, nt), primary: true })

    const tabs = []
    for (const t of T.getTabs()) {
      if (tabs.length >= 2) break
      if (t.isHome || t.id === T.getActiveId() || !`${t.title} ${t.url}`.toLowerCase().includes(ql)) continue
      tabs.push({ key: `tab:${t.id}`, icon: "layers", label: t.title || t.url, sub: "Switch to Tab", url: t.url, fill: t.url, run: () => T.setActive(t.id) })
    }
    const bms = (state.get("bookmarks") ?? []).filter((b) => `${b.title} ${b.url}`.toLowerCase().includes(ql)).slice(0, 3)
      .map((b) => ({ key: `bm:${b.url}`, icon: "bookmark", label: b.title || b.url, sub: bare(b.url) || b.url, url: b.url, fill: b.url, run: (nt) => go(b.url, nt) }))

    cur = {
      my, raw, q, ql, kind, top, tabs, bms, hist: [], histPending: true, preds: [], pending: false,
      wantGuess: complete && !composing,
      site: null,
      search: { key: `search:${ql}`, icon: "search", label: q, sub: `Search ${engine.name ?? "the web"}`, fill: raw, run: (nt) => go(T.engineSearch(q), nt), primary: kind === "search" },
      ai: { key: "ai", icon: "spark", label: q, sub: "Ask Comet AI", cls: "is-ai", fill: raw, run: () => bus.emit("ai:ask", { text: q }), primary: kind === "ai" }
    }
    // Top Hit: a site you know that starts with what you typed — open tabs and bookmarks first (no wait)
    if (cur.wantGuess) cur.site = siteRow(completion(raw, [...T.getTabs().filter((t) => !t.isHome).map((t) => t.url), ...(state.get("bookmarks") ?? []).map((b) => b.url)]))

    // predictions: cached prefixes paint at once, the engine is asked after a short pause
    clearTimeout(predTimer)
    if (canPredict(raw)) {
      const c = cached(raw)
      cur.preds = c.list
      if (!c.exact) {
        cur.pending = true
        predTimer = setTimeout(async () => {
          const list = await fetchPredictions(raw)
          if (!cur || cur.my !== my) return
          cur.pending = false
          if (list) cur.preds = list
          render()
        }, PRED_WAIT)
      }
    } else predSlots = 0

    render()
    window.flux.history.search({ query: q, limit: 8, ranked: true }).then((hist) => {
      if (!cur || cur.my !== my) return
      cur.hist = hist ?? []
      cur.histPending = false
      if (cur.wantGuess && !cur.site) cur.site = siteRow(completion(raw, cur.hist.map((e) => e.url)))
      render()
    }).catch(() => { if (cur?.my === my) cur.histPending = false })
  }

  function siteRow (c) {
    return c && { key: `site:${c.url}`, icon: "arrowRight", label: c.text, sub: "Top Hit", url: c.url, fill: c.text, rest: c.rest, target: c.url, run: (nt) => go(c.url, nt), primary: true, sect: "top" }
  }

  // ── compose the sections into ≤ MAX_ROWS rows ───────────────────
  function compose (c) {
    // a Top Hit is what Enter does, so it leads (above go-to / keyword rows)
    const list = c.site ? [c.site, ...c.top.map((r) => ({ ...r, primary: false }))] : [...c.top]
    if (c.kind === "ai") list.push(c.ai)
    list.push({ ...c.search, sect: "search" })
    const pred = c.preds.filter((p) => p.toLowerCase() !== c.ql && p.toLowerCase() !== c.site?.label.toLowerCase()).slice(0, MAX_PRED)
    for (const p of pred) {
      const pre = p.toLowerCase().startsWith(c.raw.replace(/^\s+/, "").toLowerCase()) ? c.raw.replace(/^\s+/, "").length : 0
      list.push({ key: `pred:${p.toLowerCase()}`, icon: "search", label: p, pre, fill: p, pred: true, run: (nt) => go(T.engineSearch(p), nt) })
    }
    // hold the rows the last answer had, so the list doesn't jump while the next one is on its way
    const slots = c.pending ? Math.max(pred.length, Math.min(predSlots, MAX_PRED)) : pred.length
    for (let i = pred.length; i < slots; i++) list.push({ key: `ph:${i}`, ph: true })
    if (!c.pending) predSlots = pred.length

    const seen = new Set([c.site?.url].filter(Boolean))
    const room = () => MAX_ROWS - list.length
    const add = (rows, sect, cap = Infinity) => {
      let first = true
      for (const r of rows) {
        if (room() <= 0 || cap <= 0) break
        if (r.url && seen.has(r.url)) continue
        if (r.url) seen.add(r.url)
        list.push(first ? { ...r, sect } : r); first = false; cap--
      }
    }
    add(c.tabs, "tabs", 2)
    add(c.bms, "bookmarks", 2)
    add(c.hist.map((e) => ({ key: `h:${e.url}`, icon: "clock", label: e.title || e.url, sub: bare(e.url) || e.url, url: e.url, fill: e.url, run: (nt) => go(e.url, nt) })), "history")
    // Ask Comet AI stays reachable but sits below the real matches
    if (c.kind !== "ai") list.push({ ...c.ai, sect: "ai" })
    return list
  }

  function render () {
    if (!cur) return
    paint(compose(cur))
    // the guess: a known site wins, else the top prediction that continues what was typed
    if (moved || !cur.wantGuess || input.value !== cur.raw) { if (input.value === typed) showGuess(null); return }
    // a site guess carried over from the last keystroke waits for history before giving way
    if (!cur.site && cur.histPending && guess?.kind === "site") return
    const lower = cur.raw.toLowerCase()
    const p = cur.site ? null : cur.preds.find((x) => x.length > cur.raw.length && x.toLowerCase().startsWith(lower))
    showGuess(cur.site ? { kind: "site", rest: cur.site.rest, url: cur.site.target } : p ? { kind: "search", rest: p.slice(cur.raw.length) } : null)
  }

  // ── the panel ───────────────────────────────────────────────────
  function paint (list) {
    items = list
    const pi = list.findIndex((x) => x.primary)
    const ki = moved && selKey ? list.findIndex((x) => x.key === selKey) : -1
    sel = ki >= 0 ? ki : Math.max(0, pi)
    if (ki < 0) { moved = false; selKey = null }
    if (!box) {
      box = h(`div.ob-suggest.glass.ob-${place}`, { role: "listbox" })
      document.body.append(box)
      anchor.classList.add("has-suggest")
    }
    const r = anchor.getBoundingClientRect()
    Object.assign(box.style, { left: `${r.left}px`, top: `${r.bottom + (place === "home" ? 6 : 8)}px`, width: `${r.width}px` })
    box.replaceChildren(...list.map((it, i) => it.ph
      ? h("div.ob-item.is-ph", { "aria-hidden": "true" })
      : h(`button.ob-item${i === sel ? ".is-sel" : ""}${it.cls ? "." + it.cls : ""}${it.sect && i > 0 ? ".ob-sect" : ""}${it.pred ? ".is-pred" : ""}`, {
        role: "option", tabindex: -1,
        onmousedown: (e) => e.preventDefault(),
        // a real pointer move only: Chromium also fires zero-movement moves when the list changes under a resting cursor
        onmousemove: (e) => { if ((e.movementX || e.movementY) && sel !== i) { sel = i; selKey = it.key; moved = true; mark() } },
        onclick: (e) => run(it, e.altKey || e.metaKey)
      }, [
        h("span.ob-ico", {}, [it.url ? fav(it.url) : ico(it.icon, 16)]),
        it.pred && it.pre
          ? h("span.ob-label", {}, [h("span.ob-pre", { text: it.label.slice(0, it.pre) }), h("span.ob-more", { text: it.label.slice(it.pre) })])
          : h("span.ob-label", { text: it.label }),
        it.sub && h("span.ob-sub", { text: it.sub })
      ])))
  }
  const mark = () => box?.querySelectorAll(".ob-item").forEach((b, i) => b.classList.toggle("is-sel", i === sel))

  // ↑/↓ walk the rows (skipping held placeholders) and preview the row's text in the field
  function step (d) {
    let i = sel
    do { i += d } while (items[i]?.ph)
    if (i < 0 || i >= items.length) return
    sel = i; moved = true; selKey = items[i].key; mark()
    guess = null; ghost.hide()
    input.value = items[i].fill ?? typed
    input.setSelectionRange(input.value.length, input.value.length)
  }

  function run (it, newTab) {
    close()
    ghost.hide()
    input.blur()
    it.run(newTab)
    onDone?.()
  }

  // ── events ──────────────────────────────────────────────────────
  input.addEventListener("compositionstart", () => { composing = true; guess = null; ghost.hide() })
  input.addEventListener("compositionend", () => { composing = false; typed = input.value; complete = false; clearTimeout(timer); timer = setTimeout(build, 50) })
  input.addEventListener("input", (e) => {
    const prev = guess ? typed + guess.rest : null
    // only plain typing at the end of the field earns a guess: not deleting, pasting or composing
    complete = e.inputType === "insertText" && !e.isComposing && !composing && caretAtEnd()
    typed = input.value; moved = false; selKey = null
    // typing through the guess keeps it on screen without waiting for the next build
    if (complete && prev && prev.length > typed.length && prev.toLowerCase().startsWith(typed.toLowerCase())) showGuess({ ...guess, rest: prev.slice(typed.length) })
    else { guess = null; ghost.hide() }
    clearTimeout(timer); timer = setTimeout(build, 50)
  })
  input.addEventListener("focus", () => { typed = input.value })
  input.addEventListener("blur", () => { guess = null; ghost.hide(); setTimeout(() => { if (document.activeElement !== input) close() }, 120) })
  input.addEventListener("mousedown", () => { if (ghost.on) dismiss() })
  // capture: at the field this runs before the host's own keydown (the toolbar's Escape reverts + blurs),
  // so Esc can take back a preview / ghost / open list first
  input.addEventListener("keydown", (e) => {
    if (e.isComposing || composing || e.keyCode === 229) return
    const k = e.key
    if (k === "ArrowDown" && box) { e.preventDefault(); step(1) }
    else if (k === "ArrowUp" && box) { e.preventDefault(); step(-1) }
    else if ((k === "ArrowRight" || k === "End") && ghost.on && !e.shiftKey && !e.metaKey && !e.altKey) { e.preventDefault(); accept() }
    else if (k === "Tab" && !e.shiftKey && input.value.trim()) {
      e.preventDefault()
      if (accept()) return
      // otherwise Tab jumps straight to "Ask Comet AI"
      const i = items.findIndex((x) => x.cls === "is-ai")
      if (i >= 0) { sel = i; selKey = "ai"; moved = true; mark() }
    } else if (k === "Backspace" && ghost.on && caretAtEnd()) { e.preventDefault(); dismiss() }
    else if ((k === "ArrowLeft" || k === "Home") && ghost.on) dismiss()
    else if (k === "Enter") {
      e.preventDefault()
      if (!input.value.trim()) return
      if (e.metaKey && e.shiftKey) { close(); input.blur(); bus.emit("ai:ask", { text: query() || input.value.trim() }); onDone?.(); return }
      const newTab = e.metaKey || e.ctrlKey || e.altKey
      // the ghost shows a site: Enter goes there, even before the list has caught up
      if (!moved && ghost.on && guess?.kind === "site" && guess.url) { const url = guess.url; run({ run: (nt) => go(url, nt) }, newTab); return }
      // a keystroke the list hasn't caught up with yet: rebuild it now so Enter acts on what's in the field
      if (!moved && (timer || !cur || cur.raw !== typed)) build()
      const it = items[sel]
      if (it && !it.ph) run(it, newTab)
      else { close(); input.blur(); primaryAction(input.value.trim())(newTab); onDone?.() }
    } else if (k === "Escape") {
      if (moved && input.value !== typed) {           // previewing a row: back to what was typed
        e.preventDefault(); e.stopImmediatePropagation()
        input.value = typed; moved = false; selKey = null; render()
      } else if (ghost.on) { e.preventDefault(); e.stopImmediatePropagation(); dismiss() }
      else if (box) { e.preventDefault(); e.stopImmediatePropagation(); close() }
    }
  }, true)
  return { close, refresh: build }
}
