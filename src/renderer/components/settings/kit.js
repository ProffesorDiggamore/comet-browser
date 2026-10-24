// ───────────────────────────────────────────────────────────────────
//  settings/kit.js — macOS-style settings controls.  Grouped inset
//  lists (section title outside the rounded box), rows with label +
//  footnote on the left and the control on the right, a segmented
//  control with a sliding thumb, filled sliders, pop-up menus and
//  switches.  Shared by every settings category file.
// ───────────────────────────────────────────────────────────────────
import { h } from "../../core/dom.js"
import { sfx } from "../../audio/sfx.js"

// section = optional title above a rounded inset box of rows
export function group (title, rows, footer) {
  const kids = rows.filter(Boolean)
  return h("section.set-group", {}, [
    title && h("h3.set-group-title", { text: title }),
    h("div.set-box", {}, kids),
    footer && h("p.set-footer", { text: footer })
  ])
}

export function row (label, control, desc) {
  const search = `${label} ${desc ?? ""}`.toLowerCase()
  return h("div.set-row", { dataset: { search } }, [
    h("div.rtext", {}, [label && h("div.rlabel", { text: label }), desc && h("div.rdesc", { text: desc })]),
    h("div.control", {}, [].concat(control).filter(Boolean))
  ])
}

// full-width row (lists, grids)
export function block (children, search = "") {
  return h("div.set-row.set-row--block", { dataset: { search } }, [].concat(children))
}

export function seg (options, value, onPick) {
  const thumb = h("span.seg-thumb")
  const el = h("div.seg", { role: "radiogroup" }, [thumb])
  const place = (btn, animate) => {
    if (!btn || !btn.offsetWidth) return
    thumb.style.transition = animate ? "" : "none"
    thumb.style.width = `${btn.offsetWidth}px`
    thumb.style.transform = `translateX(${btn.offsetLeft - 2}px)`
    thumb.style.opacity = "1"
  }
  const btns = options.map((o) => {
    const b = h("button", {
      role: "radio", class: o.v === value ? "is-on" : "",
      onclick: () => {
        sfx.play("click")
        btns.forEach((x) => x.classList.toggle("is-on", x === b))
        place(b, true)
        onPick(o.v)
      }
    }, o.label)
    return b
  })
  el.append(...btns)
  // position once laid out (and again if fonts/size shift)
  const sync = () => place(btns.find((b) => b.classList.contains("is-on")), false)
  requestAnimationFrame(() => requestAnimationFrame(sync))
  new ResizeObserver(sync).observe(el)
  return el
}

export function sw (checked, onChange) {
  return h("label.switch", {}, [
    h("input", { type: "checkbox", role: "switch", checked: !!checked, onchange: (e) => { sfx.play("click"); onChange(e.target.checked) } }),
    h("span.track")
  ])
}

export function rng (value, min, max, step, fmt, onInput) {
  const val = h("span.val", { text: fmt(value) })
  const i = h("input", { type: "range", min, max, step, value })
  const fill = () => i.style.setProperty("--p", `${((Number(i.value) - min) / (max - min)) * 100}%`)
  fill()
  let t = null
  i.addEventListener("input", () => {
    fill()
    val.textContent = fmt(Number(i.value))
    clearTimeout(t); t = setTimeout(() => onInput(Number(i.value)), 120)
  })
  i.addEventListener("change", () => { clearTimeout(t); onInput(Number(i.value)) })
  return h("div.rng", {}, [i, val])
}

export function sel (options, value, onChange) {
  const s = h("select.popup", {}, options.map((o) => h("option", { value: o.v, selected: String(o.v) === String(value) }, o.label)))
  s.addEventListener("change", () => onChange(s.value))
  return s
}

export function textField (value, onChange, opts = {}) {
  const i = h("input.field", { type: opts.type ?? "text", value: value ?? "", placeholder: opts.placeholder ?? "", spellcheck: false })
  if (opts.wide) i.classList.add("is-wide")
  i.addEventListener("change", () => onChange(i.value))
  return i
}

export function btn (label, onClick, cls = "btn") {
  return h(`button.${cls.split(" ").join(".")}`, { onclick: onClick }, label)
}

// colored squircle icon, like System Settings
export function tile (glyph, tint, size = 22) {
  const t = h("span.tile", {}, [glyph])
  t.style.setProperty("--tint", tint)
  t.style.setProperty("--ts", `${size}px`)
  return t
}
