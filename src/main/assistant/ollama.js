// ───────────────────────────────────────────────────────────────────
//  assistant/ollama.js — local models via Ollama (free, on-device).
//  Server lifecycle (detect / start), model management (list, pull
//  with progress, delete, capabilities) and one streaming chat step
//  that speaks the same canonical message format as the Claude path.
// ───────────────────────────────────────────────────────────────────
const { ipcMain } = require("electron")
const { execFile, spawn } = require("node:child_process")
const fs = require("node:fs")
const { store } = require("../store")

const base = () => (store.get("ai.localUrl") || "http://127.0.0.1:11434").replace(/\/+$/, "")
const APP = "/Applications/Ollama.app"
const BINS = ["/usr/local/bin/ollama", "/opt/homebrew/bin/ollama", `${APP}/Contents/Resources/ollama`]

// curated picks for Apple-silicon Macs (sizes are the default q4 downloads)
const RECOMMENDED = [
  { name: "qwen3:8b", label: "Qwen3 8B", size: "5.2 GB", note: "Best all-rounder. Fast and very good at driving the browser.", pick: true },
  { name: "qwen3:14b", label: "Qwen3 14B", size: "9.3 GB", note: "Noticeably smarter. Still quick on 24 GB of memory." },
  { name: "gpt-oss:20b", label: "gpt-oss 20B", size: "14 GB", note: "OpenAI's open model. Strong reasoning, heavier." },
  { name: "llama3.2:3b", label: "Llama 3.2 3B", size: "2.0 GB", note: "Tiny and instant. Fine for quick questions." }
]

async function req (path, opts = {}, timeoutMs = 4000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try { return await fetch(base() + path, { ...opts, signal: opts.signal ?? ctrl.signal }) }
  finally { clearTimeout(t) }
}

const installed = () => fs.existsSync(APP) || BINS.some((b) => fs.existsSync(b))

async function running () {
  try { const r = await req("/api/version", {}, 1500); return r.ok ? (await r.json()).version ?? "?" : null } catch { return null }
}

async function start () {
  if (await running()) return { ok: true }
  if (!installed()) return { ok: false, text: "Ollama isn't installed." }
  try {
    if (fs.existsSync(APP)) execFile("open", ["-g", "-a", "Ollama"])
    else {
      const bin = BINS.find((b) => fs.existsSync(b))
      spawn(bin, ["serve"], { detached: true, stdio: "ignore" }).unref()
    }
  } catch (e) { return { ok: false, text: e.message } }
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 400))
    if (await running()) return { ok: true }
  }
  return { ok: false, text: "Ollama didn't start. Open the Ollama app once, then try again." }
}

// capabilities per model: tools / vision / thinking (cached)
const caps = new Map()
async function capabilities (model) {
  if (caps.has(model)) return caps.get(model)
  try {
    const r = await req("/api/show", { method: "POST", body: JSON.stringify({ model }) }, 6000)
    const j = await r.json()
    const c = new Set(j.capabilities ?? [])
    const info = { tools: c.has("tools"), vision: c.has("vision"), thinking: c.has("thinking"), ctx: Object.entries(j.model_info ?? {}).find(([k]) => k.endsWith(".context_length"))?.[1] ?? null }
    caps.set(model, info)
    return info
  } catch { return { tools: true, vision: false, thinking: false, ctx: null } }
}

async function list () {
  const r = await req("/api/tags", {}, 4000)
  const j = await r.json()
  const models = await Promise.all((j.models ?? []).map(async (m) => ({
    name: m.name, size: m.size, params: m.details?.parameter_size ?? "", family: m.details?.family ?? "",
    quant: m.details?.quantization_level ?? "", ...(await capabilities(m.name))
  })))
  return models.sort((a, b) => a.name.localeCompare(b.name))
}

async function status () {
  const version = await running()
  let models = []
  if (version) { try { models = await list() } catch {} }
  return { installed: installed(), running: !!version, version, models, recommended: RECOMMENDED, url: base() }
}

// ── pulls (streamed progress → renderer) ──────────────────────────
const pulls = new Map()   // name -> AbortController
async function pull (wc, name) {
  if (pulls.has(name)) return { ok: true, already: true }
  const up = await start()
  if (!up.ok) return up
  const ctrl = new AbortController()
  pulls.set(name, ctrl)
  const emit = (p) => { if (!wc.isDestroyed()) wc.send("flux:ollama:pull", { name, ...p }) }
  try {
    const res = await fetch(base() + "/api/pull", { method: "POST", body: JSON.stringify({ model: name, stream: true }), signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    let last = 0
    for await (const obj of ndjson(res.body)) {
      if (obj.error) throw new Error(obj.error)
      const pct = obj.total ? Math.round((obj.completed ?? 0) / obj.total * 100) : null
      if (Date.now() - last > 200 || obj.status === "success") { last = Date.now(); emit({ status: obj.status, pct, total: obj.total ?? null, completed: obj.completed ?? null }) }
    }
    caps.delete(name)
    emit({ status: "success", pct: 100, done: true })
    return { ok: true }
  } catch (e) {
    emit({ status: ctrl.signal.aborted ? "cancelled" : "error", error: ctrl.signal.aborted ? null : e.message, done: true })
    return { ok: false, text: e.message }
  } finally { pulls.delete(name) }
}

async function remove (name) {
  try { const r = await req("/api/delete", { method: "DELETE", body: JSON.stringify({ model: name }) }, 15000); caps.delete(name); return { ok: r.ok } }
  catch (e) { return { ok: false, text: e.message } }
}

async function * ndjson (body) {
  const dec = new TextDecoder()
  let buf = ""
  for await (const chunk of body) {
    buf += dec.decode(chunk, { stream: true })
    let i
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (line) { try { yield JSON.parse(line) } catch {} }
    }
  }
  if (buf.trim()) { try { yield JSON.parse(buf) } catch {} }
}

// ── canonical (Anthropic-shaped) history → Ollama messages ─────────
function toOllama (system, messages, vision) {
  const out = [{ role: "system", content: system }]
  const b64 = (blk) => blk.source?.data
  for (const m of messages) {
    if (typeof m.content === "string") { out.push({ role: m.role, content: m.content }); continue }
    if (m.role === "assistant") {
      const text = m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n")
      const calls = m.content.filter((b) => b.type === "tool_use").map((b) => ({ function: { name: b.name, arguments: b.input ?? {} } }))
      out.push({ role: "assistant", content: text, ...(calls.length ? { tool_calls: calls } : {}) })
      continue
    }
    // user turn: tool results become tool messages; text + images a user message
    const pendingImages = []
    for (const b of m.content.filter((x) => x.type === "tool_result")) {
      const parts = Array.isArray(b.content) ? b.content : [{ type: "text", text: String(b.content ?? "") }]
      const text = parts.filter((p) => p.type === "text").map((p) => p.text).join("\n") || (b.is_error ? "error" : "ok")
      parts.filter((p) => p.type === "image").forEach((p) => pendingImages.push(b64(p)))
      out.push({ role: "tool", content: (b.is_error ? "ERROR: " : "") + text })
    }
    const text = m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n\n")
    const imgs = [...pendingImages, ...m.content.filter((b) => b.type === "image").map(b64)].filter(Boolean)
    if (text || imgs.length) {
      out.push({
        role: "user",
        content: text || "(screenshot attached)",
        ...(imgs.length && vision ? { images: imgs } : {})
      })
      if (imgs.length && !vision) out[out.length - 1].content += "\n[Image omitted: this local model can't see images.]"
    }
  }
  return out
}

const toolsForOllama = (tools) => tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }))

// one model turn; returns canonical content blocks + a normalized stop reason
async function chatStep ({ model, system, messages, tools, effort, showThinking, signal, onText, onThinking, onTextStart }) {
  const up = await start()
  if (!up.ok) throw new Error(up.text)
  const cap = await capabilities(model)
  const body = {
    model,
    messages: toOllama(system, messages, cap.vision),
    stream: true,
    keep_alive: store.get("ai.localKeepAlive") || "15m",
    options: { num_ctx: Number(store.get("ai.localCtx")) || 16384 }
  }
  if (cap.tools && tools.length) body.tools = toolsForOllama(tools)
  if (cap.thinking) body.think = /gpt-oss/.test(model) ? (effort === "low" ? "low" : effort === "high" || effort === "xhigh" ? "high" : "medium") : effort !== "low"

  let res = await fetch(base() + "/api/chat", { method: "POST", body: JSON.stringify(body), signal })
  if (res.status === 404) throw new Error(`The model "${model}" isn't downloaded yet. Get it in Settings → Flux AI.`)
  if (!res.ok) {
    const txt = await res.text().catch(() => "")
    // older builds / odd templates: retry once without thinking
    if (body.think !== undefined && /think/i.test(txt)) { delete body.think; res = await fetch(base() + "/api/chat", { method: "POST", body: JSON.stringify(body), signal }) }
    if (!res.ok) throw new Error(`Ollama: ${txt.slice(0, 200) || `HTTP ${res.status}`}`)
  }

  let text = ""
  let inThinkTag = false
  let started = false
  const calls = []
  let doneReason = "stop"
  for await (const obj of ndjson(res.body)) {
    if (obj.error) throw new Error(`Ollama: ${obj.error}`)
    const m = obj.message ?? {}
    if (m.thinking && showThinking !== false) onThinking(m.thinking)
    if (m.content) {
      // models without native thinking support may inline <think> tags
      let chunk = m.content
      if (chunk.includes("<think>")) { inThinkTag = true; chunk = chunk.replace("<think>", "") }
      if (inThinkTag) {
        const end = chunk.indexOf("</think>")
        if (end === -1) { onThinking(chunk); continue }
        onThinking(chunk.slice(0, end)); chunk = chunk.slice(end + 8); inThinkTag = false
      }
      if (chunk) {
        if (!started && !chunk.trim()) continue
        if (!started) { started = true; onTextStart() }
        text += chunk
        onText(chunk)
      }
    }
    for (const c of m.tool_calls ?? []) calls.push(c)
    if (obj.done) doneReason = obj.done_reason ?? "stop"
  }

  const content = []
  if (text.trim()) content.push({ type: "text", text: text.trim() })
  calls.forEach((c, i) => {
    let args = c.function?.arguments ?? {}
    if (typeof args === "string") { try { args = JSON.parse(args) } catch { args = {} } }
    content.push({ type: "tool_use", id: `toolu_local_${Date.now().toString(36)}_${i}`, name: c.function?.name ?? "unknown", input: args })
  })
  return { content, stop: calls.length ? "tool_use" : doneReason === "length" ? "max_tokens" : "end_turn", toolsCapable: cap.tools }
}

function registerOllamaIpc () {
  ipcMain.handle("flux:ollama:status", () => status())
  ipcMain.handle("flux:ollama:start", () => start())
  ipcMain.handle("flux:ollama:pull", (e, name) => pull(e.sender, String(name ?? "").trim()))
  ipcMain.handle("flux:ollama:cancel", (_e, name) => { pulls.get(name)?.abort(); return { ok: true } })
  ipcMain.handle("flux:ollama:remove", (_e, name) => remove(name))
}

module.exports = { registerOllamaIpc, chatStep, RECOMMENDED }
