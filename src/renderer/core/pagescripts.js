// ───────────────────────────────────────────────────────────────────
//  pagescripts.js — code that runs INSIDE a web page (via the tab's
//  executeJavaScript).  Each is a real function serialized with its
//  options, so it must be self-contained.  Results come back as plain
//  JSON — page markup never enters the Comet UI.
// ───────────────────────────────────────────────────────────────────

const call = (fn, arg) => `(${fn.toString()})(${JSON.stringify(arg ?? {})})`

// ── read: title, text, headings, optional links + interactive list ──
function read (o) {
  const clean = (s) => (s || "").replace(/[ \t ]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim()
  const root = document.querySelector("article, main, [role=main]") || document.body
  let text = clean(root ? root.innerText : "")
  if (text.length < 400 && document.body) text = clean(document.body.innerText)
  const meta = document.querySelector('meta[name=description],meta[property="og:description"]')
  const out = {
    title: document.title,
    url: location.href,
    description: meta ? meta.content : "",
    selection: String(getSelection() || "").slice(0, 4000),
    headings: [...document.querySelectorAll("h1,h2,h3")].slice(0, 40).map((h) => h.tagName[1] + " " + clean(h.innerText).slice(0, 120)).filter((s) => s.length > 2),
    truncated: text.length > o.max,
    text: text.slice(0, o.max)
  }
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== "hidden" && s.display !== "none" }
  if (o.links) out.links = [...document.querySelectorAll("a[href]")].filter((a) => /^https?:/.test(a.href) && clean(a.innerText)).slice(0, 80).map((a) => clean(a.innerText).slice(0, 80) + " -> " + a.href)
  if (o.interactive) {
    const label = (e) => clean(e.getAttribute("aria-label") || e.innerText || e.value || e.placeholder || e.title || e.name || e.id || "").slice(0, 80)
    out.interactive = [...document.querySelectorAll("a[href],button,input:not([type=hidden]),textarea,select,[role=button],[role=link],[role=tab],[role=menuitem],[contenteditable=true],summary")]
      .filter(vis).slice(0, 150).map((e) => e.tagName.toLowerCase() + (e.type ? "[" + e.type + "]" : "") + ": " + (label(e) || "(unlabeled)"))
  }
  return out
}

// ── act: click / type / select / submit / scroll / focus ───────────
function act (o) {
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim()
  const norm = (s) => clean(s).toLowerCase()
  const visible = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" }
  const labelOf = (e) => {
    const parts = [e.getAttribute("aria-label"), e.innerText, e.value, e.placeholder, e.title, e.getAttribute("name"), e.alt]
    if (e.id) { const l = document.querySelector('label[for="' + CSS.escape(e.id) + '"]'); if (l) parts.push(l.innerText) }
    const pl = e.closest("label"); if (pl) parts.push(pl.innerText)
    return parts.filter(Boolean).map(clean).join(" | ")
  }
  const flash = (e) => {
    const r = e.getBoundingClientRect()
    const d = document.createElement("div")
    d.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;border-radius:10px;box-shadow:0 0 0 3px rgba(139,123,255,.95),0 0 26px 8px rgba(139,123,255,.5);transition:opacity .6s;" +
      "left:" + (r.left - 4) + "px;top:" + (r.top - 4) + "px;width:" + (r.width + 8) + "px;height:" + (r.height + 8) + "px"
    document.documentElement.appendChild(d)
    setTimeout(() => { d.style.opacity = "0" }, 900)
    setTimeout(() => d.remove(), 1600)
  }
  const FIELD = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]),textarea,[contenteditable="true"],[contenteditable=""],select'
  const CLICK = "a[href],button,input[type=submit],input[type=button],input[type=checkbox],input[type=radio],[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=checkbox],summary,label,[onclick]"
  const find = (pool) => {
    if (o.selector) { try { const e = document.querySelector(o.selector); if (e) return e } catch { return null } }
    if (!o.target) return pool === FIELD ? [...document.querySelectorAll(FIELD)].find(visible) || null : null
    const want = norm(o.target)
    let best = null; let bestScore = 0
    for (const e of [...document.querySelectorAll(pool)].filter(visible)) {
      const l = norm(labelOf(e)); if (!l) continue
      let s = 0
      if (l === want) s = 100
      else if (l.split(" | ").some((p) => p === want)) s = 90
      else if (l.startsWith(want)) s = 70
      else if (l.includes(want)) s = 50 - Math.min(30, l.length / 20)
      if (s > bestScore) { best = e; bestScore = s }
    }
    return best
  }
  const candidates = (pool) => [...document.querySelectorAll(pool)].filter(visible).map((e) => clean(labelOf(e)).slice(0, 60)).filter(Boolean).slice(0, 25)

  if (o.action === "scroll") {
    if (o.target || o.selector) {
      const e = find(CLICK + "," + FIELD + ",h1,h2,h3,h4,p,section")
      if (e) { e.scrollIntoView({ behavior: "smooth", block: "center" }); flash(e); return { ok: true, text: "Scrolled to " + clean(labelOf(e) || e.innerText).slice(0, 60) } }
    }
    const by = window.innerHeight * 0.85
    if (o.direction === "top") scrollTo({ top: 0, behavior: "smooth" })
    else if (o.direction === "bottom") scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })
    else scrollBy({ top: o.direction === "up" ? -by : by, behavior: "smooth" })
    return { ok: true, text: "Scrolled " + (o.direction || "down") }
  }
  if (o.action === "type" || o.action === "focus" || o.action === "select") {
    const e = find(FIELD)
    if (!e) return { ok: false, text: "No matching field. Fields on the page: " + candidates(FIELD).join("; ") }
    if (e.type === "password" || /card|cc-|cvc|cvv|ssn|iban/i.test((e.autocomplete || "") + " " + (e.name || "") + " " + (e.id || ""))) {
      return { ok: false, text: "Refused: Comet AI does not fill password, payment or identity fields. Ask the user to do that part." }
    }
    e.scrollIntoView({ block: "center" }); e.focus(); flash(e)
    if (o.action === "focus") return { ok: true, text: "Focused " + clean(labelOf(e)).slice(0, 60) }
    if (e.tagName === "SELECT") {
      const want = norm(o.text)
      const opt = [...e.options].find((op) => norm(op.text) === want) || [...e.options].find((op) => norm(op.text).includes(want) || norm(op.value) === want)
      if (!opt) return { ok: false, text: "No option matches. Options: " + [...e.options].map((op) => clean(op.text)).slice(0, 30).join("; ") }
      e.value = opt.value
      e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true }))
      return { ok: true, text: "Selected " + clean(opt.text) }
    }
    const v = String(o.text ?? "")
    if (e.isContentEditable) { document.execCommand("selectAll", false); document.execCommand("insertText", false, v) } else {
      const proto = e.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, "value").set.call(e, v)
      e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true }))
    }
    if (o.press_enter) {
      const kd = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }
      e.dispatchEvent(new KeyboardEvent("keydown", kd)); e.dispatchEvent(new KeyboardEvent("keypress", kd)); e.dispatchEvent(new KeyboardEvent("keyup", kd))
      const f = e.form
      if (f) { if (f.requestSubmit) f.requestSubmit(); else f.submit() }
    }
    return { ok: true, text: "Typed into " + (clean(labelOf(e)).slice(0, 60) || e.tagName.toLowerCase()) + (o.press_enter ? " and pressed Enter" : "") }
  }
  if (o.action === "submit") {
    const e = find(FIELD) || document.activeElement
    const f = (e && e.form) || document.querySelector("form")
    if (!f) return { ok: false, text: "No form found to submit." }
    flash(f)
    if (f.requestSubmit) f.requestSubmit(); else f.submit()
    return { ok: true, text: "Submitted the form" }
  }
  const e = find(CLICK)
  if (!e) return { ok: false, text: 'Nothing clickable matches "' + (o.target || o.selector) + '". Clickable things: ' + candidates(CLICK).join("; ") }
  e.scrollIntoView({ block: "center" }); flash(e)
  if (typeof e.focus === "function") e.focus({ preventScroll: true })
  e.click()
  return { ok: true, text: "Clicked " + (clean(labelOf(e)).slice(0, 80) || e.tagName.toLowerCase()) }
}

// ── reader: article structure as JSON blocks ─────────────────────
function reader () {
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim()
  let root = document.querySelector("article") || document.querySelector("main, [role=main]")
  if (!root) {
    let bestScore = 0
    root = document.body
    for (const n of document.querySelectorAll("div, section")) {
      let score = 0
      n.querySelectorAll(":scope > p, :scope > div > p").forEach((p) => { score += Math.min(clean(p.innerText).length, 600) })
      if (score > bestScore) { root = n; bestScore = score }
    }
  }
  const blocks = []
  const walk = (n) => {
    for (const c of n.children) {
      if (blocks.length > 1500) return
      const t = c.tagName
      if (/^(SCRIPT|STYLE|NAV|FOOTER|ASIDE|FORM|BUTTON|NOSCRIPT|IFRAME|SVG|HEADER)$/.test(t)) continue
      const cs = getComputedStyle(c)
      if (cs.display === "none" || cs.visibility === "hidden") continue
      if (/^H[1-4]$/.test(t)) { const x = clean(c.innerText); if (x) blocks.push({ t: "h", l: +t[1], x }) }
      else if (t === "P") { const x = clean(c.innerText); if (x.length > 1) blocks.push({ t: "p", x }) }
      else if (t === "PRE") blocks.push({ t: "pre", x: c.innerText })
      else if (t === "BLOCKQUOTE") blocks.push({ t: "q", x: clean(c.innerText) })
      else if (t === "UL" || t === "OL") blocks.push({ t: "list", o: t === "OL", items: [...c.querySelectorAll(":scope > li")].map((li) => clean(li.innerText)).filter(Boolean).slice(0, 80) })
      else if (t === "IMG" || t === "PICTURE" || t === "FIGURE") {
        const img = t === "IMG" ? c : c.querySelector("img")
        const src = img && (img.currentSrc || img.src)
        if (src && /^https?:/.test(src) && img.naturalWidth > 120) blocks.push({ t: "img", src, alt: img.alt || "" })
        const cap = c.querySelector && c.querySelector("figcaption")
        if (cap) blocks.push({ t: "cap", x: clean(cap.innerText) })
      } else if (t === "TABLE") blocks.push({ t: "p", x: clean(c.innerText).slice(0, 2000) })
      else walk(c)
    }
  }
  walk(root)
  const by = document.querySelector("[rel=author], .author, .byline, [itemprop=author]")
  const site = document.querySelector('meta[property="og:site_name"]')
  return {
    title: clean(document.title), url: location.href,
    byline: clean(by ? by.innerText : "").slice(0, 120),
    site: site ? site.content : location.hostname,
    words: blocks.reduce((s, b) => s + (b.x ? b.x.split(" ").length : 0) + (b.items ? b.items.join(" ").split(" ").length : 0), 0),
    blocks
  }
}

// ── picture-in-picture for the most prominent video ──────────────
function pip () {
  if (document.pictureInPictureElement) { document.exitPictureInPicture(); return "exited" }
  const vids = [...document.querySelectorAll("video")].filter((v) => v.readyState > 0)
  vids.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))
  const v = vids.find((x) => !x.paused) || vids[0]
  if (!v) return "no-video"
  v.disablePictureInPicture = false
  return v.requestPictureInPicture().then(() => "ok", (e) => "error: " + e.message)
}

export const readScript = (o) => call(read, { max: 16000, ...o })
export const actScript = (o) => call(act, o)
export const readerScript = () => call(reader)
export const pipScript = () => call(pip)
export const selectionScript = () => "String(getSelection() || '').slice(0, 4000)"

export const DARK_CSS = `
html { filter: invert(0.92) hue-rotate(180deg) !important; background: #fff !important; }
img, picture, video, canvas, iframe, svg image, [style*="background-image"] { filter: invert(1) hue-rotate(180deg) !important; }
`
