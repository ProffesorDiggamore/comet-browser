// ───────────────────────────────────────────────────────────────────
//  companion/tools.js — filesystem tools for the self-coding companion.
//  Every path is resolved and then checked to be INSIDE the project
//  root.  Writes snapshot the original to a dated .bak first and, unless
//  autonomous mode is on, require an approval callback to return true.
// ───────────────────────────────────────────────────────────────────
const fs = require("node:fs")
const path = require("node:path")
const { store } = require("../store")

const IGNORE = new Set(["node_modules", ".git", "userdata", "dist", ".DS_Store"])

function root () {
  return store.get("companion.projectPath") || process.cwd()
}

function safe (rel) {
  const abs = path.resolve(root(), rel ?? ".")
  const base = path.resolve(root())
  if (abs !== base && !abs.startsWith(base + path.sep)) {
    throw new Error(`Path escapes project root: ${rel}`)
  }
  return abs
}

function stamp () {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const TOOL_DEFS = [
  {
    name: "list_files",
    description: "List files and folders under a project-relative directory (recursive, skips node_modules/.git).",
    input_schema: { type: "object", properties: { dir: { type: "string" } }, required: [] }
  },
  {
    name: "read_file",
    description: "Read a UTF-8 text file, project-relative path.",
    input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }
  },
  {
    name: "search",
    description: "Case-insensitive substring search across text files. Returns path:line matches.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
  },
  {
    name: "write_file",
    description: "Create or overwrite a text file (project-relative). Original is backed up to a .bak-DATE file. May require user approval.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"]
    }
  }
]

function walk (dir, acc, baseLen) {
  for (const name of fs.readdirSync(dir)) {
    if (IGNORE.has(name)) continue
    const full = path.join(dir, name)
    const st = fs.statSync(full)
    const rel = full.slice(baseLen + 1)
    if (st.isDirectory()) { acc.push(rel + "/"); walk(full, acc, baseLen) }
    else acc.push(rel)
  }
  return acc
}

async function run (name, input, { approve } = {}) {
  if (name === "list_files") {
    const abs = safe(input.dir ?? ".")
    return walk(abs, [], path.resolve(root()).length).slice(0, 4000).join("\n")
  }

  if (name === "read_file") {
    const abs = safe(input.path)
    const txt = fs.readFileSync(abs, "utf8")
    return txt.length > 60_000 ? txt.slice(0, 60_000) + "\n…[truncated]" : txt
  }

  if (name === "search") {
    const q = String(input.query ?? "").toLowerCase()
    if (!q) return "empty query"
    const files = walk(path.resolve(root()), [], path.resolve(root()).length).filter((f) => !f.endsWith("/"))
    const hits = []
    for (const f of files) {
      let txt
      try { txt = fs.readFileSync(safe(f), "utf8") } catch { continue }
      txt.split("\n").forEach((line, i) => {
        if (line.toLowerCase().includes(q)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 200)}`)
      })
      if (hits.length > 400) break
    }
    return hits.join("\n") || "no matches"
  }

  if (name === "write_file") {
    const abs = safe(input.path)
    const autonomous = store.get("companion.autonomous")
    if (!autonomous && typeof approve === "function") {
      const ok = await approve({ path: input.path, content: input.content })
      if (!ok) return "REJECTED by user — not written."
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    if (fs.existsSync(abs)) {
      const bak = `${abs}.bak-${stamp()}`
      if (!fs.existsSync(bak)) fs.copyFileSync(abs, bak)
    }
    fs.writeFileSync(abs, input.content, "utf8")
    return `WROTE ${input.path} (${input.content.length} bytes)`
  }

  return `Unknown tool: ${name}`
}

module.exports = { TOOL_DEFS, run, root }
