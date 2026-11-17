// ───────────────────────────────────────────────────────────────────
//  aipanel.js — Comet AI, docked beside your tabs (⌘J).  Streams the
//  answer as it's written, shows every browser action as a step on a
//  timeline, asks before clicking/typing on pages, keeps chat history,
//  and can attach the current page, a screenshot, or your voice.
//  The empty state knows what you're looking at: it offers the page
//  you're on and quick actions for your tabs.
// ───────────────────────────────────────────────────────────────────
import { h, clear } from "../core/dom.js"
import { state } from "../core/state.js"
import { bus, toast } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { renderMarkdown } from "../core/markdown.js"
import { readScript, selectionScript } from "../core/pagescripts.js"
import { menu } from "./popover.js"
import { toggleVoice } from "./voice.js"
import { runTool, toolLabel, toolIcon } from "./aitools.js"
import { localStatus, getButton, shortName, pulls } from "./localai.js"
import * as T from "../core/tabs.js"

const MODELS = [
  { id: "claude-opus-5-5", name: "Opus 5.5", note: "Smartest · default" },
  { id: "claude-sonnet-5-5", name: "Sonnet 5.5", note: "Fast + capable" },
  { id: "claude-haiku-5-5", name: "Haiku 5.5", note: "Fastest, cheapest" },
  { id: "claude-fable-5-1", name: "Fable 5.1", note: "Maximum (premium)" }
]
const EFFORTS = [["low", "Quick"], ["medium", "Balanced"], ["high", "Deep"], ["xhigh", "Deepest"]]
const QUICK = [
  { icon: "book", label: "Summarize", sub: "this page", page: true, text: "Summarize this page: key points, then anything I should act on." },
  { icon: "chat", label: "Ask about", sub: "this page", page: true, focus: true },
  { icon: "layers", label: "Compare", sub: "my open tabs", text: "Compare my open tabs and tell me which is best and why." },
  { icon: "copy", label: "Tidy up", sub: "duplicate tabs", text: "Close exact duplicate tabs, then tell me how you'd group the rest." }
]

let panel, log, input, sendBtn, modelChip, pageChip, attachRow, titleEl, subEl, keyCard, localCard, jumpBtn
let chatId = null
let busy = false
let attachPage = false
let images = []
let cur = null            // live assistant message: { el, textEl, raw, tools: Map, thinkEl, thinkRaw }
const sessionApproved = new Set()

const isLocal = () => (state.get("ai.provider") ?? "local") === "local"
const shortModel = () => isLocal() ? shortName(state.get("ai.localModel") || "qwen3:8b") : (MODELS.find((m) => m.id === state.get("ai.model"))?.name ?? "Opus 5.5")
const openLink = (href, e) => T.newTab(href, { background: !!(e?.metaKey) })

// ── message building ──────────────────────────────────────────────
function userBubble (text, atts = []) {
  return h("div.ai-msg.ai-user", {}, [
    atts.length ? h("div.ai-atts", {}, atts.map((a) => typeof a === "string" && a.startsWith("data:")
      ? h("img.ai-att-img", { src: a })
      : h("span.ai-att", {}, [ico(a === "page" ? "book" : "image", 12), h("span", { text: a === "page" ? "Page" : "Image" })]))) : null,
    text && h("div.ai-bubble", { text })
  ])
}

function assistantShell () {
  const el = h("div.ai-msg.ai-bot")
  log.append(el)
  return el
}

// under a finished answer: copy (and a quiet "done" mark)
function actionBar (el) {
  if (!el._raw) return
  const copy = h("button.ai-act", { title: "Copy answer", onclick: () => {
    navigator.clipboard.writeText(el._raw ?? "")
    copy.replaceChildren(ico("check", 13), h("span", { text: "Copied" }))
    setTimeout(() => copy.replaceChildren(ico("copy", 13), h("span", { text: "Copy" })), 1400)
  } }, [ico("copy", 13), h("span", { text: "Copy" })])
  el.append(h("div.ai-actions", {}, [copy]))
}

function sourceChips (sources) {
  return h("div.ai-sources", {}, sources.slice(0, 6).map((s) => h("a.ai-src", {
    href: s.url, title: s.title, onclick: (e) => { e.preventDefault(); openLink(s.url, e) }
  }, [h("img", { src: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(T.hostOf(s.url))}&sz=32`, onerror: (e) => e.target.remove() }), h("span", { text: T.hostOf(s.url).replace(/^www\./, "") })])))
}

function toolChip (name, input, status, summary, sources) {
  const chip = h(`div.ai-step.is-${status}`, { title: summary ?? "" }, [
    h("span.ai-step-ico", {}, [status === "running" ? h("i.spin") : ico(status === "error" ? "close" : toolIcon(name), 13)]),
    h("span.ai-step-label", { text: toolLabel(name, input, status) })
  ])
  if (sources?.length) chip.append(sourceChips(sources))
  return chip
}

function searchChip (query, sources, running) {
  const chip = h(`div.ai-step.ai-search${running ? ".is-running" : ".is-done"}`, {}, [
    h("span.ai-step-ico", {}, [running ? h("i.spin") : ico("search", 13)]),
    h("span.ai-step-label", { text: query ? `Searched “${query}”` : "Searching the web…" })
  ])
  if (sources?.length) chip.append(sourceChips(sources))
  return chip
}

function thinkingBlock (text, live) {
  const d = h("details.ai-think", { open: false }, [
    h("summary", {}, [h("span", { class: live ? "shimmer-text" : "", text: live ? "Thinking…" : "Thought process" })]),
    h("div.ai-think-body", { text })
  ])
  return d
}

function renderStored (item) {
  if (item.role === "user") { log.append(userBubble(item.text, item.attachments ?? [])); return }
  const el = assistantShell()
  if (item.thinking && state.get("ai.showThinking") !== false) el.append(thinkingBlock(item.thinking, false))
  let raw = ""
  for (const p of item.parts ?? []) {
    if (p.kind === "text") { if (p.text.trim()) { el.append(renderMarkdown(p.text, { onLink: openLink })); raw += p.text + "\n" } }
    else if (p.kind === "tool") el.append(toolChip(p.name, p.input, p.status, p.summary, p.sources))
    else if (p.kind === "search") el.append(searchChip(p.query, p.sources, false))
    else if (p.kind === "error") el.append(h("div.ai-error", { text: p.text }))
    else if (p.kind === "note") el.append(h("div.ai-note", { text: p.text }))
  }
  el._raw = raw.trim()
  actionBar(el)
}

// ── live stream ───────────────────────────────────────────────────
let paintQueued = false
function paintText () {
  if (paintQueued) return
  paintQueued = true
  requestAnimationFrame(() => {
    paintQueued = false
    if (!cur?.textEl) return
    const md = renderMarkdown(cur.raw, { onLink: openLink })
    md.classList.add("is-streaming")
    cur.textEl.replaceChildren(...md.childNodes)
    scrollDown()
  })
}

function scrollDown (force = false) {
  const near = log.scrollHeight - log.scrollTop - log.clientHeight < 160
  if (near || force) log.scrollTop = log.scrollHeight
  paintJump()
}
function paintJump () {
  jumpBtn.classList.toggle("is-on", log.scrollHeight - log.scrollTop - log.clientHeight > 240)
}

function onEvent (ev) {
  if (ev.chatId !== chatId && chatId) return
  if (!chatId) chatId = ev.chatId
  if (ev.type === "start") { titleEl.textContent = ev.title || "New chat"; return }
  if (!cur) { cur = { el: assistantShell(), raw: "", all: "", tools: new Map(), textEl: null }; cur.el.classList.add("is-live") }
  if (ev.type === "thinking") {
    if (state.get("ai.showThinking") === false) return
    if (!cur.thinkEl) { cur.thinkEl = thinkingBlock("", true); cur.el.insertBefore(cur.thinkEl, cur.el.children[1] ?? null) }
    cur.thinkEl.querySelector(".ai-think-body").textContent += ev.delta
  } else if (ev.type === "text_start") {
    endThinking()
    cur.raw = ""
    cur.textEl = h("div.md")
    cur.el.append(cur.textEl)
  } else if (ev.type === "text") {
    cur.raw += ev.delta
    cur.all += ev.delta
    paintText()
  } else if (ev.type === "search_start") {
    endThinking()
    cur.searchEl = searchChip("", null, true)
    cur.el.append(cur.searchEl)
  } else if (ev.type === "search") {
    if (!cur.searchEl) { cur.searchEl = searchChip(ev.query, null, true); cur.el.append(cur.searchEl) }
    cur.searchEl.querySelector(".ai-step-label").textContent = `Searching “${ev.query}”`
    cur.searchQuery = ev.query
  } else if (ev.type === "search_done") {
    const fresh = searchChip(cur.searchQuery, ev.sources, false)
    if (cur.searchEl) cur.searchEl.replaceWith(fresh); else cur.el.append(fresh)
    cur.searchEl = null
  } else if (ev.type === "tool") {
    endThinking()
    const chip = toolChip(ev.name, ev.input, ev.status, ev.summary, ev.sources)
    const old = cur.tools.get(ev.id)
    if (old) old.replaceWith(chip); else cur.el.append(chip)
    cur.tools.set(ev.id, chip)
  } else if (ev.type === "notice") {
    cur.el.append(h("div.ai-note", { text: ev.text }))
  } else if (ev.type === "done") {
    endThinking()
    if (!ev.ok && ev.text) cur.el.append(h("div.ai-error", { text: ev.text }))
    if (ev.stopped) cur.el.append(h("div.ai-note", { text: "Stopped." }))
    cur.el.classList.remove("is-live")
    cur.el._raw = cur.all.trim()
    cur.el.querySelectorAll(".is-streaming").forEach((x) => x.classList.remove("is-streaming"))
    actionBar(cur.el)
    cur = null
    setBusy(false)
  }
  scrollDown()
}

function endThinking () {
  if (!cur?.thinkEl) return
  const s = cur.thinkEl.querySelector("summary span")
  s.className = ""
  s.textContent = "Thought process"
  cur.thinkEl = null
}

function setBusy (b) {
  busy = b
  bus.emit("ai:busy", b)
  sendBtn.replaceChildren(ico(b ? "stop" : "arrowUp", 16))
  sendBtn.title = b ? "Stop" : "Send (⏎)"
  sendBtn.classList.toggle("is-stop", b)
  panel.classList.toggle("is-busy", b)
}

// ── sending ───────────────────────────────────────────────────────
async function gatherContext () {
  const a = T.getActive()
  const ctx = { tabCount: T.getTabs().length, active: a ? { id: a.id, title: a.title, url: a.url, isHome: a.isHome } : null }
  if (a && !a.isHome && !a.asleep) {
    try { ctx.selection = await Promise.race([T.exec(a.id, selectionScript()), new Promise((r) => setTimeout(() => r(""), 300))]) || "" } catch {}
  }
  return ctx
}

export async function send (text, { withPage = false, imgs = [] } = {}) {
  text = (text ?? "").trim()
  const pics = [...images, ...imgs]
  if (busy) return
  if (!text && !pics.length) return
  hideEmpty()
  const usePage = withPage || attachPage
  let page = null
  if (usePage) {
    const a = T.getActive()
    if (a && !a.isHome) {
      try {
        const r = await T.exec(a.id, readScript({ max: 24000 }))
        page = { url: r.url, title: r.title, text: `${r.description ? r.description + "\n\n" : ""}${r.text}` }
      } catch {}
    }
  }
  log.append(userBubble(text, [...(page ? ["page"] : []), ...pics]))
  images = []; attachPage = false; paintAttachments()
  input.value = ""; autosize()
  setBusy(true)
  scrollDown(true)
  const context = await gatherContext()
  const res = await window.flux.ai.send({ chatId, text, images: pics, context, page })
  if (res?.chatId) chatId = res.chatId
  if (res?.needsKey) { setBusy(false); showKeyCard(); log.lastChild?.remove(); if (!log.childElementCount) log.append(emptyState()); input.value = text; autosize() }
  if (isLocal() && res && !res.ok) checkLocal()
  else if (res && !res.ok && busy) setBusy(false)
}

// ── chrome ────────────────────────────────────────────────────────
function pageFav (a, size = 14) {
  return a.favicon ? h("img.ai-fav", { src: a.favicon, width: size, height: size, onerror: (e) => e.target.replaceWith(ico("globe", size)) }) : ico("globe", size)
}

function paintAttachments () {
  const a = T.getActive()
  const web = a && !a.isHome
  if (!web) attachPage = false
  pageChip.hidden = !attachPage
  if (attachPage) {
    pageChip.replaceChildren(pageFav(a, 13), h("span", { text: a.title || T.hostOf(a.url) }), h("button.ai-chip-x", { title: "Don't send this page", onclick: () => { attachPage = false; paintAttachments() } }, [ico("close", 10)]))
  }
  attachRow.replaceChildren(pageChip, ...images.map((d, i) => h("div.ai-thumb", {}, [
    h("img", { src: d }),
    h("button", { title: "Remove", onclick: () => { images.splice(i, 1); paintAttachments() } }, [ico("close", 10)])
  ])))
  attachRow.hidden = !attachPage && !images.length
}

async function attachMenu (anchor) {
  const a = T.getActive()
  const web = a && !a.isHome
  menu(anchor, [
    { label: attachPage ? "Remove this page" : "Add this page", icon: "book", disabled: !web, run: () => { attachPage = !attachPage; paintAttachments(); input.focus() } },
    { label: "Add a screenshot of this tab", icon: "scan", disabled: !web, run: async () => {
      const d = await T.capturePage()
      if (!d) return toast("Open a web page to capture it.")
      images.push(d); paintAttachments(); input.focus()
    } },
    "-",
    { label: "Paste an image with ⌘V", icon: "image", disabled: true }
  ])
}

function autosize () { input.style.height = "auto"; input.style.height = `${Math.min(200, input.scrollHeight)}px` }

function mark (size) {
  const m = h("span.ai-mark", {}, [ico("flux", Math.round(size * 0.58))])
  m.style.setProperty("--s", `${size}px`)
  return m
}

function greeting () {
  const hr = new Date().getHours()
  return hr < 5 ? "Up late?" : hr < 12 ? "Good morning." : hr < 18 ? "Good afternoon." : "Good evening."
}

let emptyKey = ""
function emptyState () {
  const a = T.getActive()
  const web = a && !a.isHome && /^https?:/.test(a.url)
  emptyKey = web ? a.url : ""
  const quick = QUICK.filter((q) => !q.page || web).map((q) => h("button.ai-quick", {
    onclick: () => {
      if (q.focus) { attachPage = true; paintAttachments(); input.focus(); return }
      send(q.text, { withPage: !!q.page })
    }
  }, [h("span.ai-quick-ico", {}, [ico(q.icon, 15)]), h("span.ai-quick-label", { text: q.label }), h("span.ai-quick-sub", { text: q.sub })]))
  return h("div.ai-empty", {}, [
    mark(44),
    h("div.ai-empty-title", { text: greeting() }),
    h("div.ai-empty-sub", { text: "Ask about this page, your tabs, or anything on the web." }),
    web && h("div.ai-pagecard", {}, [
      h("span.ai-pagecard-fav", {}, [pageFav(a, 16)]),
      h("span.ai-pagecard-text", {}, [h("span.ai-pagecard-title", { text: a.title || T.hostOf(a.url) }), h("span.ai-pagecard-host", { text: T.hostOf(a.url).replace(/^www\./, "") })]),
      h("span.ai-pagecard-tag", { text: "Viewing" })
    ]),
    h("div.ai-quick-grid", {}, quick)
  ])
}
function hideEmpty () { log.querySelector(".ai-empty")?.remove() }
// keep the empty state about the page you're actually on
function refreshEmpty () {
  if (panel.hidden || !log.querySelector(".ai-empty")) return
  const a = T.getActive()
  const key = a && !a.isHome && /^https?:/.test(a.url) ? a.url : ""
  if (key !== emptyKey) log.replaceChildren(emptyState())
}
function showKeyCard () {
  keyCard.hidden = false
  keyCard.querySelector("input")?.focus()
}

// local setup card: Ollama missing / stopped / model not downloaded
async function checkLocal () {
  localCard.hidden = true
  if (!isLocal()) return
  const st = await localStatus(true)
  const want = state.get("ai.localModel") || "qwen3:8b"
  const have = st.models.some((m) => m.name === want || m.name === `${want}:latest`)
  if (st.running && have) return
  const title = !st.installed ? "Install Ollama to run AI on your Mac" : !st.running ? "Ollama isn't running" : `Download ${shortName(want)} to start`
  const sub = !st.installed ? "Free, private, no API key. One download, then Comet handles the rest."
    : !st.running ? "Comet can start it for you."
      : st.models.length ? `Or pick one of your ${st.models.length} installed model${st.models.length > 1 ? "s" : ""} from the model menu above.` : "About 5 GB, one time. Runs fully on this Mac."
  const action = !st.installed
    ? h("button.btn.btn--accent", { onclick: () => window.flux.openExternal("https://ollama.com/download") }, "Get Ollama")
    : !st.running
      ? h("button.btn.btn--accent", { onclick: async () => { const r = await window.flux.ollama.start(); if (!r.ok) toast(r.text); checkLocal() } }, "Start Ollama")
      : getButton(want, `Download (${st.recommended.find((r) => r.name === want)?.size ?? "free"})`)
  localCard.replaceChildren(
    h("div.ai-local-head", {}, [ico("spark", 16), h("strong", { text: title })]),
    h("p", { text: sub }),
    h("div.row", {}, [action, h("button.btn.btn--plain", { onclick: () => bus.emit("settings:goto", "ai") }, "Models…")])
  )
  localCard.hidden = false
}

async function newChat () {
  if (busy) await window.flux.ai.stop(chatId)
  chatId = null
  cur = null
  clear(log)
  log.append(emptyState())
  titleEl.textContent = "Comet AI"
  paintJump()
  input.focus()
}

async function loadChat (id) {
  const v = await window.flux.ai.view(id)
  if (!v) return
  chatId = v.id
  cur = null
  clear(log)
  titleEl.textContent = v.title
  for (const item of v.display) renderStored(item)
  scrollDown(true)
}

async function historyMenu (anchor) {
  const list = await window.flux.ai.list()
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d` }
  menu(anchor, [
    { header: list.length ? "Recent chats" : "No saved chats yet" },
    ...list.slice(0, 18).map((c) => ({ label: `${c.title}  ·  ${ago(c.updated)}`, icon: c.id === chatId ? "check" : "chat", run: () => loadChat(c.id) })),
    list.length && "-",
    list.length && { label: "Delete this chat", icon: "trash", disabled: !chatId, run: async () => { await window.flux.ai.remove(chatId); newChat() } },
    list.length && { label: "Clear all chats", icon: "trash", danger: true, run: async () => { await window.flux.ai.clear(); newChat() } }
  ], { align: "end" })
}

async function modelMenu (anchor) {
  const ai = state.get("ai") ?? {}
  const local = isLocal()
  const st = await localStatus(true).catch(() => ({ models: [] }))
  const keys = await window.flux.secrets.status()
  const pickLocal = async (name) => { await state.set("ai.provider", "local"); await state.set("ai.localModel", name); paintModel(); checkLocal() }
  const pickClaude = async (id) => { await state.set("ai.provider", "claude"); await state.set("ai.model", id); paintModel(); localCard.hidden = true }
  menu(anchor, [
    { header: "On this Mac · free" },
    ...(st.models.length
      ? st.models.map((m) => ({ label: `${shortName(m.name)}${m.params ? "  " + m.params : ""}${m.tools ? "" : "  (chat only)"}`, checked: local && m.name === ai.localModel, run: () => pickLocal(m.name) }))
      : [{ label: st.running ? "No models downloaded" : "Ollama not running", disabled: true }]),
    { label: "Download models…", icon: "download", run: () => bus.emit("settings:goto", "ai") },
    "-",
    { header: "Claude · cloud" },
    ...(keys.anthropic
      ? MODELS.map((x) => ({ label: `${x.name} — ${x.note}`, checked: !local && x.id === ai.model, run: () => pickClaude(x.id) }))
      : [{ label: "Add a Claude API key…", icon: "key", run: () => { state.set("ai.provider", "claude").then(() => bus.emit("settings:goto", "ai")) } }]),
    "-",
    { header: "Thinking" },
    ...EFFORTS.slice(0, 3).map(([v, l]) => ({ label: l, checked: v === (ai.effort ?? "medium"), run: () => state.set("ai.effort", v) })),
    "-",
    { label: "Web search", checked: ai.webSearch !== false, run: () => state.set("ai.webSearch", ai.webSearch === false) },
    { label: "Ask before acting on pages", checked: ai.confirmPageActions !== false, run: () => state.set("ai.confirmPageActions", ai.confirmPageActions === false) },
    { label: "Comet AI Settings…", icon: "gear", run: () => bus.emit("settings:goto", "ai") }
  ], { align: "end" })
}
function paintModel () {
  modelChip.querySelector("span").textContent = shortModel()
  subEl.textContent = isLocal() ? `${shortModel()} · on this Mac` : `${shortModel()} · Claude`
}

export function setPanel (open) {
  const was = !panel.hidden
  if (open === was) { if (open) input.focus(); return }
  panel.hidden = !open
  document.body.classList.toggle("ai-open", open)
  if (open) {
    checkLocal()
    refreshEmpty()
    paintAttachments()
    panel.classList.remove("is-entering"); void panel.offsetWidth; panel.classList.add("is-entering")
    setTimeout(() => input.focus(), 60)
  }
}

export function initAIPanel () {
  panel = document.getElementById("aipanel")
  panel.style.width = `${state.get("layout.aiPanelWidth") ?? 400}px`
  log = h("div.ai-log")
  titleEl = h("div.ai-title", { text: "Comet AI" })
  subEl = h("div.ai-head-sub")
  modelChip = h("button.ai-model.no-drag", { onclick: () => modelMenu(modelChip), title: "Model & thinking depth" }, [ico("spark", 12), h("span", { text: shortModel() }), ico("chevronDown", 11)])
  input = h("textarea.ai-input", { rows: 1, placeholder: "Ask anything…", oninput: autosize })
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value) }
    if (e.key === "Escape") input.blur()
  })
  input.addEventListener("paste", (e) => {
    const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"))
    if (!f) return
    e.preventDefault()
    const rd = new FileReader()
    rd.onload = async () => { images.push(await T.downscale(rd.result, 1600)); paintAttachments() }
    rd.readAsDataURL(f)
  })
  sendBtn = h("button.ai-send", { title: "Send (⏎)", onclick: () => (busy ? window.flux.ai.stop(chatId) : send(input.value)) }, [ico("arrowUp", 16)])
  pageChip = h("div.ai-ctx-chip", { hidden: true })
  const plusBtn = h("button.ai-tool-btn.ai-plus", { title: "Add the page or a screenshot", onclick: () => attachMenu(plusBtn) }, [ico("plus", 15)])
  const micBtn = h("button.ai-tool-btn", { title: "Speak", onclick: () => toggleVoice((t) => { input.value = (input.value ? input.value + " " : "") + t; autosize(); input.focus() }) }, [ico("mic", 15)])
  attachRow = h("div.ai-attach-row", { hidden: true })
  jumpBtn = h("button.ai-jump", { title: "Jump to latest", onclick: () => { log.scrollTo({ top: log.scrollHeight, behavior: "smooth" }) } }, [ico("chevronDown", 15)])

  const keyInput = h("input", { type: "password", placeholder: "sk-ant-…", spellcheck: false })
  keyCard = h("div.ai-keycard.glass", { hidden: true }, [
    h("strong", { text: "Connect Claude" }),
    h("p", { text: "Paste an Anthropic API key (billed per use), or switch to a free model that runs on this Mac." }),
    h("div.row", {}, [keyInput, h("button.btn.btn--accent", { onclick: async () => {
      if (!keyInput.value.trim()) return
      await window.flux.secrets.set("anthropic", keyInput.value.trim())
      keyInput.value = ""; keyCard.hidden = true; toast("Claude connected ✓")
    } }, "Save")]),
    h("div.row", {}, [
      h("button.btn", { onclick: async () => { await state.set("ai.provider", "local"); keyCard.hidden = true; paintModel(); checkLocal() } }, "Use free local AI"),
      h("button.btn.btn--plain", { onclick: () => window.flux.openExternal("https://console.anthropic.com/settings/keys") }, "Get a key →")
    ])
  ])

  localCard = h("div.ai-keycard.ai-local.glass", { hidden: true })
  bus.on("localai:changed", () => checkLocal())

  const resize = h("div.ai-resize")
  resize.addEventListener("pointerdown", (e) => {
    resize.setPointerCapture(e.pointerId)
    document.body.classList.add("is-resizing")
    const mv = (ev) => { panel.style.width = `${Math.min(760, Math.max(320, window.innerWidth - ev.clientX - 8))}px` }
    const up = () => {
      document.body.classList.remove("is-resizing")
      resize.removeEventListener("pointermove", mv); resize.removeEventListener("pointerup", up)
      state.set("layout.aiPanelWidth", parseInt(panel.style.width, 10))
    }
    resize.addEventListener("pointermove", mv); resize.addEventListener("pointerup", up)
  })

  panel.append(
    resize,
    h("header.ai-head", {}, [
      mark(26),
      h("div.ai-head-text", {}, [titleEl, subEl]),
      h("button.tb-btn", { title: "Chat history", onclick: (e) => historyMenu(e.currentTarget) }, [ico("clock", 15)]),
      h("button.tb-btn", { title: "New chat (⌥⌘J)", onclick: newChat }, [ico("edit", 15)]),
      h("button.tb-btn", { title: "Close (⌘J)", onclick: () => setPanel(false) }, [ico("close", 15)])
    ]),
    h("div.ai-body", {}, [log, jumpBtn]),
    localCard,
    keyCard,
    h("div.ai-composer.glass", {}, [
      attachRow,
      input,
      h("div.ai-composer-row", {}, [plusBtn, modelChip, h("span.ai-flex"), micBtn, sendBtn])
    ])
  )
  log.append(emptyState())
  log.addEventListener("scroll", paintJump, { passive: true })
  paintModel()
  bus.on("tabs", () => { if (!panel.hidden) { refreshEmpty(); if (attachPage || !attachRow.hidden) paintAttachments() } })

  // tool + confirmation bridge from the main-process agent
  window.flux.ai.onEvent(onEvent)
  window.flux.ai.onTool(async ({ callId, name, input: args }) => window.flux.ai.toolResult(callId, await runTool(name, args)))
  window.flux.ai.onConfirm(({ callId, name, input: args }) => {
    const site = T.hostOf((T.getTab(args.tab_id) ?? T.getActive())?.url ?? "")
    if (sessionApproved.has(site)) { window.flux.ai.confirmReply(callId, true); return }
    setPanel(true)
    const card = h("div.ai-confirm.glass", {}, [
      h("div.ai-confirm-q", {}, [ico("cursor", 14), h("span", { text: `Allow: ${toolLabel(name, args, "running")} on ${site || "this page"}?` })]),
      h("div.row", {}, [
        h("button.btn.btn--accent", { onclick: () => { window.flux.ai.confirmReply(callId, true); card.remove() } }, "Allow"),
        h("button.btn", { onclick: () => { sessionApproved.add(site); window.flux.ai.confirmReply(callId, true); card.remove() } }, `Allow on ${site || "site"} this session`),
        h("button.btn.btn--ghost", { onclick: () => { window.flux.ai.confirmReply(callId, false); card.remove() } }, "Deny")
      ])
    ])
    ;(cur?.el ?? log).append(card)
    scrollDown(true)
  })

  bus.on("ai:toggle", () => setPanel(panel.hidden))
  bus.on("ai:new", () => { setPanel(true); newChat() })
  bus.on("ai:ask", ({ text = "", images: imgs = [], withPage = false, focusOnly = false, openLink: link = null } = {}) => {
    setPanel(true)
    if (link) T.newTab(link, { background: true })
    if (focusOnly || (!text && !imgs.length)) { if (withPage) { attachPage = true; paintAttachments() } input.focus(); return }
    send(text, { withPage, imgs })
  })
  window.flux.ai.onAsk((p) => bus.emit("ai:ask", p))
  bus.on("config", paintModel)
  void pulls
}
