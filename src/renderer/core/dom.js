// tiny hyperscript — h("div.klass", { onclick }, [children])
// spec is "tag#id.class.class" — any part optional (defaults to <div>)
export function h (spec, props = {}, children = []) {
  const idMatch = spec.match(/#([\w-]+)/)
  const id = idMatch ? idMatch[1] : null
  const rest = spec.replace(/#[\w-]+/, "")
  const [tag, ...classes] = rest.split(".")
  const el = document.createElement(tag || "div")
  if (id) el.id = id
  if (classes.length) el.className = classes.join(" ")
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue
    if (k === "class") el.className = v
    else if (k === "html") el.innerHTML = v
    else if (k === "text") el.textContent = v
    else if (k === "dataset") Object.assign(el.dataset, v)
    else if (k === "style" && typeof v === "object") {
      // custom properties ("--h") need setProperty: Object.assign drops them
      for (const [sk, sv] of Object.entries(v)) if (sk.startsWith("--")) el.style.setProperty(sk, String(sv)); else el.style[sk] = sv
    }
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v)
    else if (k in el && k !== "list") { try { el[k] = v } catch { el.setAttribute(k, v) } }
    else el.setAttribute(k, v)
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue
    el.append(c.nodeType ? c : document.createTextNode(String(c)))
  }
  return el
}

export const $ = (sel, root = document) => root.querySelector(sel)
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild) }
export const mount = (el, node) => { clear(el); el.append(node) }
