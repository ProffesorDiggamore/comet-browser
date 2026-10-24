// ───────────────────────────────────────────────────────────────────
//  markdown.js — small, safe Markdown → DOM for AI replies.  Builds
//  nodes directly (never innerHTML), so model or page text can't inject
//  markup.  Covers headings, lists, quotes, tables, code fences with a
//  copy button, inline code / bold / italic / strike, and http(s) links.
// ───────────────────────────────────────────────────────────────────

const el = (tag, cls, text) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text != null) n.textContent = text
  return n
}

function safeHref (u) {
  try {
    const url = new URL(u)
    return /^https?:$/.test(url.protocol) ? url.toString() : null
  } catch { return null }
}

// inline: `code`, **bold**, *italic* / _italic_, ~~strike~~, [text](url), bare urls
const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(~~[^~\n]+~~)|(\[[^\]\n]+\]\((?:https?:\/\/)[^)\s]+\))|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|(\*[^*\n]+\*)|(\b_[^_\n]+_\b)/g

export function inline (text, onLink) {
  const frag = document.createDocumentFragment()
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) frag.append(text.slice(last, m.index))
    const t = m[0]
    if (m[1]) frag.append(el("code", "md-code", t.slice(1, -1)))
    else if (m[2]) { const b = el("strong"); b.append(inline(t.slice(2, -2), onLink)); frag.append(b) }
    else if (m[3]) { const s = el("s"); s.append(inline(t.slice(2, -2), onLink)); frag.append(s) }
    else if (m[4]) {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t)
      const href = safeHref(mm?.[2])
      if (href) frag.append(link(mm[1], href, onLink)); else frag.append(t)
    } else if (m[5]) {
      const href = safeHref(t)
      if (href) frag.append(link(t.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48), href, onLink)); else frag.append(t)
    } else if (m[6] || m[7]) { const i = el("em"); i.append(inline(t.slice(1, -1), onLink)); frag.append(i) }
    last = m.index + t.length
  }
  if (last < text.length) frag.append(text.slice(last))
  return frag
}

function link (label, href, onLink) {
  const a = el("a", "md-link")
  a.href = href
  a.title = href
  a.append(inline(label, onLink))
  a.addEventListener("click", (e) => { e.preventDefault(); onLink?.(href, e) })
  return a
}

function codeBlock (lang, body) {
  const wrap = el("div", "md-pre")
  const head = el("div", "md-pre-head")
  head.append(el("span", null, lang || "code"))
  const copy = el("button", "md-copy", "Copy")
  copy.addEventListener("click", () => {
    navigator.clipboard.writeText(body)
    copy.textContent = "Copied"
    setTimeout(() => { copy.textContent = "Copy" }, 1400)
  })
  head.append(copy)
  const pre = el("pre")
  pre.append(el("code", null, body))
  wrap.append(head, pre)
  return wrap
}

function table (rows, onLink) {
  const cells = (r) => r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim())
  const t = el("table", "md-table")
  const thead = el("thead")
  const tr = el("tr")
  for (const c of cells(rows[0])) { const th = el("th"); th.append(inline(c, onLink)); tr.append(th) }
  thead.append(tr)
  const tbody = el("tbody")
  for (const r of rows.slice(2)) {
    const row = el("tr")
    for (const c of cells(r)) { const td = el("td"); td.append(inline(c, onLink)); row.append(td) }
    tbody.append(row)
  }
  t.append(thead, tbody)
  const wrap = el("div", "md-table-wrap")
  wrap.append(t)
  return wrap
}

export function renderMarkdown (src, { onLink } = {}) {
  const root = el("div", "md")
  const lines = String(src ?? "").replace(/\r\n/g, "\n").split("\n")
  let i = 0
  let para = []
  const flushPara = () => {
    if (!para.length) return
    const p = el("p")
    para.forEach((l, k) => { if (k) p.append(el("br")); p.append(inline(l, onLink)) })
    root.append(p)
    para = []
  }

  while (i < lines.length) {
    const line = lines[i]
    const fence = /^\s*```\s*([\w+#.-]*)\s*$/.exec(line)
    if (fence) {
      flushPara()
      const body = []
      i++
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++])
      i++   // closing fence (or end while streaming)
      root.append(codeBlock(fence[1], body.join("\n")))
      continue
    }
    const hd = /^(#{1,4})\s+(.*)$/.exec(line)
    if (hd) { flushPara(); const n = el(`h${Math.min(4, hd[1].length + 1)}`, "md-h"); n.append(inline(hd[2], onLink)); root.append(n); i++; continue }
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) { flushPara(); root.append(el("hr")); i++; continue }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? "")) {
      flushPara()
      const rows = []
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++])
      root.append(table(rows, onLink))
      continue
    }
    if (/^\s*>/.test(line)) {
      flushPara()
      const q = el("blockquote")
      const body = []
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""))
      q.append(renderMarkdown(body.join("\n"), { onLink }))
      root.append(q)
      continue
    }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line)
    if (li) {
      flushPara()
      const ordered = /\d/.test(li[2])
      const list = el(ordered ? "ol" : "ul")
      while (i < lines.length) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i])
        if (!m) {
          // continuation line of the previous item
          if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && list.lastChild) { list.lastChild.append(" ", inline(lines[i].trim(), onLink)); i++; continue }
          break
        }
        const item = el("li")
        if (m[1].length >= 2 && list.lastChild) item.classList.add("md-sub")
        const task = /^\[( |x)\]\s+(.*)$/i.exec(m[3])
        if (task) { item.classList.add("md-task"); item.append(el("span", task[1].trim() ? "md-check on" : "md-check")); item.append(inline(task[2], onLink)) }
        else item.append(inline(m[3], onLink))
        list.append(item)
        i++
      }
      root.append(list)
      continue
    }
    if (!line.trim()) { flushPara(); i++; continue }
    para.push(line)
    i++
  }
  flushPara()
  return root
}
