// ───────────────────────────────────────────────────────────────────
//  vision.js — one adapter per cloud vision LLM.  Keys come from the
//  encrypted secret store and never touch the renderer.  Any failure
//  degrades to a plain error string; it never throws into IPC.
// ───────────────────────────────────────────────────────────────────
const { store } = require("./store")

function splitDataUrl (dataUrl) {
  const m = /^data:(.+?);base64,(.*)$/s.exec(dataUrl ?? "")
  if (!m) return { mime: "image/png", b64: "" }
  return { mime: m[1], b64: m[2] }
}

async function anthropic ({ prompt, dataUrl, model }) {
  const key = store.getSecret("anthropic")
  if (!key) return { ok: false, text: "No Anthropic API key set (Settings → Vision AI)." }
  const { mime, b64 } = splitDataUrl(dataUrl)
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: model ?? "claude-sonnet-5",
      max_tokens: 1200,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
          { type: "text", text: prompt }
        ]
      }]
    })
  })
  const json = await res.json()
  if (!res.ok) return { ok: false, text: json?.error?.message ?? `HTTP ${res.status}` }
  return { ok: true, text: (json.content ?? []).map((c) => c.text ?? "").join("").trim() }
}

async function openai ({ prompt, dataUrl, model }) {
  const key = store.getSecret("openai")
  if (!key) return { ok: false, text: "No OpenAI API key set (Settings → Vision AI)." }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: model ?? "gpt-4o",
      max_tokens: 1200,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: dataUrl } }
        ]
      }]
    })
  })
  const json = await res.json()
  if (!res.ok) return { ok: false, text: json?.error?.message ?? `HTTP ${res.status}` }
  return { ok: true, text: json.choices?.[0]?.message?.content?.trim() ?? "" }
}

async function gemini ({ prompt, dataUrl, model }) {
  const key = store.getSecret("gemini")
  if (!key) return { ok: false, text: "No Gemini API key set (Settings → Vision AI)." }
  const { mime, b64 } = splitDataUrl(dataUrl)
  const m = model ?? "gemini-1.5-flash"
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(key)}`
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [
        { text: prompt },
        { inline_data: { mime_type: mime, data: b64 } }
      ] }]
    })
  })
  const json = await res.json()
  if (!res.ok) return { ok: false, text: json?.error?.message ?? `HTTP ${res.status}` }
  const parts = json.candidates?.[0]?.content?.parts ?? []
  return { ok: true, text: parts.map((p) => p.text ?? "").join("").trim() }
}

const ADAPTERS = { anthropic, openai, gemini }

async function analyze ({ provider, prompt, dataUrl }) {
  const cfg = store.get("vision")
  const p = provider ?? cfg.provider
  const fn = ADAPTERS[p]
  if (!fn) return { ok: false, text: `Unknown provider: ${p}` }
  try {
    return await fn({ prompt, dataUrl, model: cfg.models?.[p] })
  } catch (e) {
    return { ok: false, text: `Request failed: ${e.message}` }
  }
}

function providerStatus () {
  return {
    anthropic: store.hasSecret("anthropic"),
    openai: store.hasSecret("openai"),
    gemini: store.hasSecret("gemini")
  }
}

module.exports = { analyze, providerStatus }
