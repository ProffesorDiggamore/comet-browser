// ───────────────────────────────────────────────────────────────────
//  aipanel.js — Flux AI, docked beside your tabs (⌘J).  Streams the
//  answer as it's written, shows every browser action as a live step,
//  asks before clicking/typing on pages, keeps chat history, and can
//  attach the current page, a screenshot, or your voice.
// ───────────────────────────────────────────────────────────────────
import { h, clear } from "../core/dom.js"
import { state } from "../core/state.js"
import { bus, toast } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { renderMarkdown } from "../core/markdown.js"
import { readScript, selectionScript } from "../core/pagescripts.js"
import { makeOrb } from "./orb.js"
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
const SUGGEST = ["Summarize this page", "Compare my open tabs", "Find me 3 good laptops under $1,000 and open them", "Close duplicate tabs"]

let panel, log, input, sendBtn, modelChip, pageChip, attachRow, titleEl, keyCard, localCard
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
  const copy = h("button.ai-copy.tb-btn", { title: "Copy answer", onclick: () => { navigator.clipboard.writeText(el._raw ?? ""); toast("Copied") } }, [ico("copy", 13)])
  el.append(copy)
  log.append(el)
  return el
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
}

function onEvent (ev) {
  if (ev.chatId !== chatId && chatId) return
  if (!chatId) chatId = ev.chatId
  if (ev.type === "start") { titleEl.textContent = ev.title || "Flux AI"; return }
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
function paintAttachments () {
  pageChip.classList.toggle("is-on", attachPage)
  attachRow.replaceChildren(...images.map((d, i) => h("div.ai-thumb", {}, [
    h("img", { src: d }),
    h("button", { title: "Remove", onclick: () => { images.splice(i, 1); paintAttachments() } }, [ico("close", 10)])
  ])))
  attachRow.hidden = !images.length
}

function autosize () { input.style.height = "auto"; input.style.height = `${Math.min(200, input.scrollHeight)}px` }

function emptyState () {
  return h("div.ai-empty", {}, [
    makeOrb(76),
    h("div.ai-empty-title", { text: "Ask anything." }),
    h("div.ai-empty-sub", { text: "I can search the web, read and compare pages, and drive your tabs for you." }),
    h("div.ai-empty-list", {}, SUGGEST.map((s) => h("button.chip.glass.lit", { onclick: () => send(s, { withPage: /page/.test(s) }) }, [ico("spark", 13), h("span", { text: s })])))
  ])
}
function hideEmpty () { log.querySelector(".ai-empty")?.remove() }

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
  const sub = !st.installed ? "Free, private, no API key. One download, then Flux handles the rest."
    : !st.running ? "Flux can start it for you."
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
  titleEl.textContent = "Flux AI"
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
    { label: "Flux AI Settings…", icon: "gear", run: () => bus.emit("settings:goto", "ai") }
  ], { align: "end" })
}
function paintModel () { modelChip.querySelector("span").textContent = shortModel() }

export function setPanel (open) {
  const was = !panel.hidden
  if (open === was) { if (open) input.focus(); return }
  panel.hidden = !open
  document.body.classList.toggle("ai-open", open)
  if (open) {
    checkLocal()
    panel.classList.remove("is-entering"); void panel.offsetWidth; panel.classList.add("is-entering")
    setTimeout(() => input.focus(), 60)
  }
}

export function initAIPanel () {
  panel = document.getElementById("aipanel")
  panel.style.width = `${state.get("layout.aiPanelWidth") ?? 400}px`
  log = h("div.ai-log")
  titleEl = h("div.ai-title", { text: "Flux AI" })
  modelChip = h("button.ai-model.no-drag", { onclick: () => modelMenu(modelChip), title: "Model & thinking depth" }, [h("span", { text: shortModel() }), ico("chevronDown", 12)])
  input = h("textarea.ai-input", { rows: 1, placeholder: "Ask Flux AI…  (⏎ send · ⇧⏎ new line)", oninput: autosize })
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
  pageChip = h("button.ai-tool-btn", { title: "Attach this page's text", onclick: () => { attachPage = !attachPage; paintAttachments() } }, [ico("book", 14), h("span", { text: "Page" })])
  const shotBtn = h("button.ai-tool-btn", { title: "Attach a screenshot of this tab", onclick: async () => {
    const d = await T.capturePage()
    if (!d) return toast("Open a web page to capture it.")
    images.push(d); paintAttachments()
  } }, [ico("scan", 14)])
  const micBtn = h("button.ai-tool-btn", { title: "Speak", onclick: () => toggleVoice((t) => { input.value = (input.value ? input.value + " " : "") + t; autosize(); input.focus() }) }, [ico("mic", 14)])
  attachRow = h("div.ai-attach-row", { hidden: true })

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
      makeOrb(26),
      titleEl,
      modelChip,
      h("button.tb-btn", { title: "Chat history", onclick: (e) => historyMenu(e.currentTarget) }, [ico("clock", 15)]),
      h("button.tb-btn", { title: "New chat (⌥⌘J)", onclick: newChat }, [ico("edit", 15)]),
      h("button.tb-btn", { title: "Close (⌘J)", onclick: () => setPanel(false) }, [ico("close", 15)])
    ]),
    log,
    localCard,
    keyCard,
    h("div.ai-composer.glass", {}, [
      attachRow,
      input,
      h("div.ai-composer-row", {}, [pageChip, shotBtn, micBtn, h("span.ai-flex"), sendBtn])
    ])
  )
  log.append(emptyState())

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
