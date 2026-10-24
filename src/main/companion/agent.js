// ───────────────────────────────────────────────────────────────────
//  companion/agent.js — the self-coding companion.  An Anthropic
//  tool-use loop with read/search/write tools scoped to the project
//  root.  Emits progress events over IPC so the panel can show each
//  step live.  Writes go through tools.js (backup + approval gate).
// ───────────────────────────────────────────────────────────────────
const { store } = require("../store")
const { TOOL_DEFS, run, root } = require("./tools")

const SYSTEM = `You are the Flux Companion — a coding agent embedded inside the Flux browser,
working directly on Flux's own source tree at the project root.

You can list_files, read_file, search, and write_file (all paths project-relative).
Work autonomously: explore first, then make focused, correct edits. Match the
existing house style — ESM/CommonJS as the file already uses, no semicolons in
renderer code, double quotes, section-banner comments, defensive defaults.
Keep changes minimal and scoped to the request. After writing, briefly say what
changed and how to see it (usually: reload the Flux window, Cmd+R).`

const MAX_TURNS = 24

async function chat ({ messages, onEvent, approve }) {
  const key = store.getSecret("anthropic")
  if (!key) return { ok: false, text: "No Anthropic API key set (Settings → Vision AI). The companion uses it too." }
  const model = store.get("companion.model") || "claude-sonnet-5"

  const convo = messages.map((m) => ({ role: m.role, content: m.content }))
  let turns = 0

  while (turns++ < MAX_TURNS) {
    let json
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: SYSTEM + `\n\nProject root: ${root()}`,
          tools: TOOL_DEFS,
          messages: convo
        })
      })
      json = await res.json()
      if (!res.ok) return { ok: false, text: json?.error?.message ?? `HTTP ${res.status}` }
    } catch (e) {
      return { ok: false, text: `Request failed: ${e.message}` }
    }

    convo.push({ role: "assistant", content: json.content })

    const textParts = json.content.filter((c) => c.type === "text").map((c) => c.text).join("")
    if (textParts.trim()) onEvent?.({ type: "text", text: textParts })

    const toolUses = json.content.filter((c) => c.type === "tool_use")
    if (json.stop_reason !== "tool_use" || toolUses.length === 0) {
      return { ok: true, text: textParts.trim() }
    }

    const results = []
    for (const tu of toolUses) {
      onEvent?.({ type: "tool", name: tu.name, input: tu.input })
      let out
      try {
        out = await run(tu.name, tu.input, { approve })
      } catch (e) {
        out = `ERROR: ${e.message}`
      }
      onEvent?.({ type: "tool_result", name: tu.name, output: String(out).slice(0, 2000) })
      results.push({ type: "tool_result", tool_use_id: tu.id, content: String(out) })
    }
    convo.push({ role: "user", content: results })
  }

  return { ok: false, text: `Stopped after ${MAX_TURNS} turns.` }
}

module.exports = { chat }
