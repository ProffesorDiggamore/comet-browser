// ───────────────────────────────────────────────────────────────────
//  sfx.js — Opera-GX-style UI audio.  Sounds are SYNTHESISED with the
//  WebAudio API so no binary assets ship.  A modpack may override any
//  event with its own sample (data: URL) via setSamples().
// ───────────────────────────────────────────────────────────────────
import { state } from "../core/state.js"

let ctx = null
const buffers = new Map()   // eventName -> AudioBuffer (custom samples)

function ac () {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === "suspended") ctx.resume()
  return ctx
}

// --- synth voices -------------------------------------------------
function mechClick (t0, gainScale) {
  const a = ac()
  // body: short noise burst through a bandpass = the "clack"
  const dur = 0.05
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
  const src = a.createBufferSource(); src.buffer = buf
  const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2100; bp.Q.value = 6
  const g = a.createGain(); g.gain.value = 0.0001
  g.gain.exponentialRampToValueAtTime(0.6 * gainScale, t0 + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(bp).connect(g).connect(a.destination)
  src.start(t0); src.stop(t0 + dur)

  // click tick: tiny sine transient
  const o = a.createOscillator(); o.type = "triangle"; o.frequency.value = 1400
  const og = a.createGain(); og.gain.value = 0.0001
  og.gain.exponentialRampToValueAtTime(0.25 * gainScale, t0 + 0.003)
  og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03)
  o.connect(og).connect(a.destination)
  o.start(t0); o.stop(t0 + 0.03)
}

function blip (t0, freq, gainScale) {
  const a = ac()
  const o = a.createOscillator(); o.type = "sine"; o.frequency.value = freq
  const g = a.createGain(); g.gain.value = 0.0001
  g.gain.exponentialRampToValueAtTime(0.4 * gainScale, t0 + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16)
  o.frequency.exponentialRampToValueAtTime(freq * 1.5, t0 + 0.14)
  o.connect(g).connect(a.destination)
  o.start(t0); o.stop(t0 + 0.18)
}

const VOICES = {
  click:    (g) => mechClick(ac().currentTime, g),
  keyClick: (g) => mechClick(ac().currentTime, g * 0.8),
  hover:    (g) => blip(ac().currentTime, 880, g * 0.35),
  tabOpen:  (g) => blip(ac().currentTime, 660, g * 0.7),
  tabClose: (g) => blip(ac().currentTime, 330, g * 0.7),
  ok:       (g) => { blip(ac().currentTime, 720, g); blip(ac().currentTime + 0.09, 960, g) }
}

async function playSample (name, gainScale) {
  const a = ac()
  const src = a.createBufferSource(); src.buffer = buffers.get(name)
  const g = a.createGain(); g.gain.value = gainScale
  src.connect(g).connect(a.destination)
  src.start()
}

export const sfx = {
  play (name) {
    const cfg = state.get("audio") ?? {}
    if (!cfg.enabled) return
    if (cfg.pack === "off") return
    if (name in (cfg.events ?? {}) && !cfg.events[name]) return
    const gainScale = cfg.volume ?? 0.35
    try {
      if (buffers.has(name)) return playSample(name, gainScale)
      ;(VOICES[name] ?? VOICES.click)(gainScale)
    } catch (e) { /* audio is non-critical */ }
  },

  async setSamples (map = {}) {
    buffers.clear()
    for (const [name, dataUrl] of Object.entries(map)) {
      if (!dataUrl) continue
      try {
        const res = await fetch(dataUrl)
        const arr = await res.arrayBuffer()
        buffers.set(name, await ac().decodeAudioData(arr))
      } catch (e) { console.warn("[sfx] sample failed", name, e.message) }
    }
  },

  // wire global UI feedback: any .btn / .side-item / .hot / .tb-btn click
  bindGlobal () {
    document.addEventListener("pointerdown", (e) => {
      const el = e.target.closest?.(".btn, .side-item, .hot, .tb-btn, .tab, .mini-btn")
      if (el) sfx.play("click")
    }, true)
  }
}
