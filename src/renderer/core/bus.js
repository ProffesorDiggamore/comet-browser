// dead-simple event bus shared across components
const map = new Map()

export const bus = {
  on (evt, cb) {
    if (!map.has(evt)) map.set(evt, new Set())
    map.get(evt).add(cb)
    return () => map.get(evt)?.delete(cb)
  },
  emit (evt, payload) {
    for (const cb of map.get(evt) ?? []) {
      try { cb(payload) } catch (e) { console.error("[bus]", evt, e) }
    }
  }
}

export function toast (message, ms = 1800) {
  const host = document.getElementById("toasts")
  if (!host) return
  const el = document.createElement("div")
  el.className = "toast"
  el.textContent = message
  host.append(el)
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity 200ms"; setTimeout(() => el.remove(), 220) }, ms)
}

// toast with one action button; stays until clicked or dismissed
export function actionToast (message, btnLabel, fn, ms = 9000) {
  const host = document.getElementById("toasts")
  if (!host) return
  const el = document.createElement("div")
  el.className = "toast"
  el.style.display = "flex"
  el.style.gap = "12px"
  el.style.alignItems = "center"
  const span = document.createElement("span")
  span.textContent = message
  const btn = document.createElement("button")
  btn.className = "btn btn--accent"
  btn.style.padding = "5px 12px"
  btn.textContent = btnLabel
  const kill = () => { el.style.opacity = "0"; el.style.transition = "opacity 200ms"; setTimeout(() => el.remove(), 220) }
  btn.onclick = () => { try { fn() } finally { kill() } }
  const x = document.createElement("button")
  x.className = "btn btn--ghost"
  x.style.padding = "5px 10px"
  x.textContent = "Dismiss"
  x.onclick = kill
  el.append(span, btn, x)
  host.append(el)
  setTimeout(kill, ms)
}
