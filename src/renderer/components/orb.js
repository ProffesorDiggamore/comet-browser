// ───────────────────────────────────────────────────────────────────
//  orb.js — Flux's mascot: a liquid-glass blob with an iridescent rim
//  and two eyes that follow the cursor and blink.  States: idle,
//  thinking (spins + pulses), listening (breathes with the mic).
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { bus } from "../core/bus.js"

const orbs = new Set()
let tracking = false

function track () {
  if (tracking) return
  tracking = true
  let raf = 0
  window.addEventListener("pointermove", (e) => {
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      for (const o of orbs) {
        if (!o.isConnected) { orbs.delete(o); continue }
        const r = o.getBoundingClientRect()
        const dx = e.clientX - (r.left + r.width / 2)
        const dy = e.clientY - (r.top + r.height / 2)
        const d = Math.max(1, Math.hypot(dx, dy))
        const k = Math.min(1, d / 400)
        o.style.setProperty("--ex", `${(dx / d) * k * r.width * 0.07}px`)
        o.style.setProperty("--ey", `${(dy / d) * k * r.height * 0.06}px`)
        o.style.setProperty("--tilt", `${(dx / d) * k * 9}deg`)
      }
    })
  }, { passive: true })
  // blink at random intervals
  const blink = () => {
    for (const o of orbs) if (o.isConnected && Math.random() < 0.7) { o.classList.add("is-blink"); setTimeout(() => o.classList.remove("is-blink"), 160) }
    setTimeout(blink, 2600 + Math.random() * 3200)
  }
  setTimeout(blink, 2000)
}

export function makeOrb (size = 96) {
  const o = h("div.orb", { "aria-hidden": "true" }, [
    h("div.orb-glow"),
    h("div.orb-body", {}, [
      h("div.orb-rim"),
      h("div.orb-face", {}, [h("i.orb-eye"), h("i.orb-eye")]),
      h("div.orb-shine")
    ])
  ])
  o.style.setProperty("--size", `${size}px`)
  orbs.add(o)
  track()
  return o
}

// global state hooks: AI activity + voice
bus.on("ai:busy", (busy) => { for (const o of orbs) o.classList.toggle("is-thinking", !!busy) })
bus.on("voice:state", (on) => { for (const o of orbs) o.classList.toggle("is-listening", !!on) })
