// ───────────────────────────────────────────────────────────────────
//  backdrop.js — Appearance → Style: a live pattern drawn on one canvas
//  behind the whole window (sidebar, title bar and a plain New Tab show
//  it).  Styles sit on top of any theme and take its accent color, so
//  "Topographic in Rose, dark" is just Style + Theme + Mode.
//
//  Kept cheap on purpose: each style redraws ~10–15 times a second on
//  Home, at most 5 while a web page fills the window (only the sidebar
//  and top bar show it), and not at all while Comet isn't the app in
//  front.  Motion off / reduced, Battery Saver or "Animate" off draws
//  one still frame.
// ───────────────────────────────────────────────────────────────────
import { bus } from "./bus.js"
import { state } from "./state.js"
import { effectiveMode } from "./motion.js"
import { isWinActive } from "./perf.js"

const FPS_OFF_HOME = 5

// ── classic 3D Perlin noise (seeded) ──────────────────────────────
const perm = new Uint8Array(512)
{
  const p = Array.from({ length: 256 }, (_, i) => i)
  let seed = 1337
  for (let i = 255; i > 0; i--) {
    seed = (seed * 16807) % 2147483647
    const j = seed % (i + 1);[p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a, b, t) => a + t * (b - a)
function grad (hash, x, y, z) {
  const h = hash & 15
  const u = h < 8 ? x : y
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v)
}
function noise (x, y, z) {
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z)
  x -= X; y -= Y; z -= Z
  const xi = X & 255, yi = Y & 255, zi = Z & 255
  const u = fade(x), v = fade(y), w = fade(z)
  const A = perm[xi] + yi, AA = perm[A] + zi, AB = perm[A + 1] + zi
  const B = perm[xi + 1] + yi, BA = perm[B] + zi, BB = perm[B + 1] + zi
  return lerp(
    lerp(lerp(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u),
      lerp(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u), v),
    lerp(lerp(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u),
      lerp(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v), w)
}
// small seeded RNG so star / point layouts are the same every launch
function rng (seed) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 } }

// env: { ctx, W, H, ink, accent, k (strength), lw (line scale) }
const rgba = (c, a) => `rgba(${c},${Math.max(0, Math.min(1, a)).toFixed(3)})`

// ── Topographic: contour lines of a drifting noise terrain ───────
const topo = {
  name: "Topographic", fps: 12, speed: 0.045,
  setup (env) {
    const CELL = 18
    const cols = Math.ceil(env.W / CELL) + 2, rows = Math.ceil(env.H / CELL) + 2
    return { CELL, cols, rows, field: new Float32Array(cols * rows) }
  },
  draw (env, s, t) {
    const { ctx } = env, { CELL, cols, rows, field } = s, SCALE = 1 / 380, LEVELS = 18
    const dx = t * 22, dy = t * -9
    let i = 0
    for (let r = 0; r < rows; r++) {
      const y = (r * CELL + dy) * SCALE
      for (let c = 0; c < cols; c++) {
        const x = (c * CELL + dx) * SCALE
        field[i++] = noise(x, y, t) + 0.5 * noise(x * 2.1, y * 2.1, t * 1.4 + 7.3)
      }
    }
    ctx.save(); ctx.translate(-CELL, -CELL)
    const lo = -1.1, step = 2.2 / LEVELS
    for (let l = 1; l < LEVELS; l++) {
      const lv = lo + l * step, index = l % 4 === 0
      ctx.beginPath()
      for (let r = 0; r < rows - 1; r++) {
        const o = r * cols, y0 = r * CELL, y1 = y0 + CELL
        for (let c = 0; c < cols - 1; c++) {
          const a = field[o + c], b = field[o + c + 1], d = field[o + cols + c], e = field[o + cols + c + 1]
          const k = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (e > lv ? 2 : 0) | (d > lv ? 1 : 0)
          if (k === 0 || k === 15) continue
          const x0 = c * CELL, x1 = x0 + CELL
          const T = () => [x0 + CELL * (lv - a) / (b - a), y0]
          const R = () => [x1, y0 + CELL * (lv - b) / (e - b)]
          const B = () => [x0 + CELL * (lv - d) / (e - d), y1]
          const L = () => [x0, y0 + CELL * (lv - a) / (d - a)]
          const seg = (p, q) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]) }
          switch (k) {
            case 1: case 14: seg(L(), B()); break
            case 2: case 13: seg(B(), R()); break
            case 3: case 12: seg(L(), R()); break
            case 4: case 11: seg(T(), R()); break
            case 6: case 9: seg(T(), B()); break
            case 7: case 8: seg(L(), T()); break
            case 5: seg(L(), T()); seg(B(), R()); break
            case 10: seg(T(), R()); seg(L(), B()); break
          }
        }
      }
      ctx.lineWidth = (index ? 1.25 : 0.8) * env.lw
      ctx.strokeStyle = index ? rgba(env.accent, 0.34 * env.k) : rgba(env.ink, 0.13 * env.k)
      ctx.stroke()
    }
    ctx.restore()
  }
}

// ── Dot Grid: a lattice that swells where a slow noise wave passes ──
const dots = {
  name: "Dot Grid", fps: 12, speed: 0.06,
  setup () { return {} },
  draw (env, _s, t) {
    const { ctx, W, H } = env, GAP = 22
    const buckets = [[], [], [], []]
    for (let y = GAP / 2; y < H + GAP; y += GAP) {
      for (let x = GAP / 2; x < W + GAP; x += GAP) {
        const n = noise(x / 260 + t * 0.6, y / 260, t) * 0.5 + 0.5      // 0..1
        buckets[n < 0.45 ? 0 : n < 0.58 ? 1 : n < 0.68 ? 2 : 3].push(x, y)
      }
    }
    const style = [[0.7, 0.10, false], [1.0, 0.16, false], [1.35, 0.24, false], [1.7, 0.42, true]]
    buckets.forEach((pts, b) => {
      const [r, a, acc] = style[b]
      ctx.beginPath()
      for (let i = 0; i < pts.length; i += 2) { ctx.moveTo(pts[i] + r * env.lw, pts[i + 1]); ctx.arc(pts[i], pts[i + 1], r * env.lw, 0, Math.PI * 2) }
      ctx.fillStyle = rgba(acc ? env.accent : env.ink, a * env.k)
      ctx.fill()
    })
  }
}

// ── Waves: layered lines that roll like a calm sea ──────────────
const waves = {
  name: "Waves", fps: 15, speed: 0.12,
  setup () { return {} },
  draw (env, _s, t) {
    const { ctx, W, H } = env, LINES = 14
    for (let l = 0; l < LINES; l++) {
      const base = H * (0.12 + 0.8 * (l / (LINES - 1)))
      const amp = 10 + 26 * Math.sin((l / LINES) * Math.PI)
      const ph = l * 0.55
      ctx.beginPath()
      for (let x = -10; x <= W + 10; x += 8) {
        const y = base +
          Math.sin(x / 210 + t * 2.2 + ph) * amp +
          Math.sin(x / 97 - t * 1.4 + ph * 1.7) * amp * 0.35 +
          noise(x / 400, l * 0.37, t * 0.5) * amp * 0.8
        x < -9 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      const hi = l === Math.floor(LINES / 2)
      ctx.lineWidth = (hi ? 1.4 : 0.9) * env.lw
      ctx.strokeStyle = hi ? rgba(env.accent, 0.42 * env.k) : rgba(env.ink, (0.08 + 0.06 * Math.sin((l / LINES) * Math.PI)) * env.k)
      ctx.stroke()
    }
  }
}

// ── Constellation: drifting points, linked when they come close ──
const constellation = {
  name: "Constellation", fps: 15, speed: 1,
  setup (env) {
    const r = rng(42)
    const n = Math.round(Math.min(160, Math.max(24, (env.W * env.H) / 13000)))
    return { pts: Array.from({ length: n }, () => ({ x: r() * env.W, y: r() * env.H, vx: (r() - 0.5) * 9, vy: (r() - 0.5) * 9, a: r() < 0.14 })), last: 0 }
  },
  draw (env, s, t) {
    const { ctx, W, H } = env, LINK = 150
    const dt = Math.min(0.5, Math.max(0, t - s.last)); s.last = t
    for (const p of s.pts) {
      p.x += p.vx * dt; p.y += p.vy * dt
      if (p.x < -20) p.x += W + 40; else if (p.x > W + 20) p.x -= W + 40
      if (p.y < -20) p.y += H + 40; else if (p.y > H + 20) p.y -= H + 40
    }
    ctx.lineWidth = 0.8 * env.lw
    const pts = s.pts
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, d2 = dx * dx + dy * dy
        if (d2 > LINK * LINK) continue
        ctx.strokeStyle = rgba(pts[i].a || pts[j].a ? env.accent : env.ink, (1 - Math.sqrt(d2) / LINK) * 0.22 * env.k)
        ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke()
      }
    }
    for (const acc of [false, true]) {
      ctx.beginPath()
      for (const p of pts) if (p.a === acc) { const r = (acc ? 2.2 : 1.4) * env.lw; ctx.moveTo(p.x + r, p.y); ctx.arc(p.x, p.y, r, 0, Math.PI * 2) }
      ctx.fillStyle = rgba(acc ? env.accent : env.ink, (acc ? 0.7 : 0.35) * env.k)
      ctx.fill()
    }
  }
}

// ── Starfield: slow parallax drift, gentle twinkle ──────────────
const stars = {
  name: "Starfield", fps: 10, speed: 1,
  setup (env) {
    const r = rng(7)
    const n = Math.round(Math.min(700, Math.max(60, (env.W * env.H) / 2600)))
    return { list: Array.from({ length: n }, () => { const z = r(); return { x: r(), y: r(), z, ph: r() * 6.28, sp: 0.6 + r() * 1.8, a: r() < 0.06 } }) }
  },
  draw (env, s, t) {
    const { ctx, W, H } = env
    const groups = new Map()
    for (const st of s.list) {
      const x = ((st.x * W + t * (4 + st.z * 14)) % (W + 4) + W + 4) % (W + 4) - 2
      const y = ((st.y * H + t * (1 + st.z * 3)) % (H + 4) + H + 4) % (H + 4) - 2
      const tw = 0.55 + 0.45 * Math.sin(t * st.sp + st.ph)
      const a = Math.round((0.12 + 0.5 * st.z) * tw * 10) / 10        // bucketed alpha → few fills
      const key = `${st.a ? 1 : 0}|${a}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(x, y, (0.5 + st.z * 1.3) * (st.a ? 1.4 : 1) * env.lw)
    }
    for (const [key, pts] of groups) {
      const [acc, a] = key.split("|")
      ctx.beginPath()
      for (let i = 0; i < pts.length; i += 3) { ctx.moveTo(pts[i] + pts[i + 2], pts[i + 1]); ctx.arc(pts[i], pts[i + 1], pts[i + 2], 0, Math.PI * 2) }
      ctx.fillStyle = rgba(acc === "1" ? env.accent : env.ink, Number(a) * (acc === "1" ? 1.4 : 1) * env.k)
      ctx.fill()
    }
  }
}

export const STYLES = { topo, dots, waves, constellation, stars }
export const STYLE_LIST = [{ id: "none", name: "None" }, ...Object.entries(STYLES).map(([id, s]) => ({ id, name: s.name }))]

// ── colors from the live theme ───────────────────────────────────
function themeColors () {
  const dark = document.body.dataset.mode !== "light"
  let accent = "47,174,116"
  const v = getComputedStyle(document.body).getPropertyValue("--f-accent").trim()
  const m = v.match(/^#?([0-9a-f]{6})$/i)
  if (m) { const n = parseInt(m[1], 16); accent = `${n >> 16},${(n >> 8) & 255},${n & 255}` } else {
    const r = v.match(/rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/)
    if (r) accent = `${r[1]},${r[2]},${r[3]}`
  }
  return { ink: dark ? "232,240,232" : "34,40,48", accent }
}

// a still frame for the Settings cards
export function drawPreview (canvas, id) {
  const st = STYLES[id]
  const ctx = canvas.getContext("2d")
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const cw = canvas.clientWidth || 140, ch = canvas.clientHeight || 84
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!st) return
  const zoom = 0.4
  const env = { ctx, W: cw / zoom, H: ch / zoom, k: 1.6, lw: 2.2, ...themeColors() }
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0)
  st.draw(env, st.setup(env), 3.7)
}

// ── the live canvas ──────────────────────────────────────────────
let canvas = null, ctx = null, cur = null, env = null, sstate = null
let t = 0, last = 0, timer = 0

const styleId = () => { const s = state.get("theme.style"); return STYLES[s] ? s : "none" }
const animated = () => state.get("theme.styleLive") !== false && effectiveMode() === "full" && document.body.dataset.saver !== "on"

function size () {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const W = window.innerWidth, H = window.innerHeight
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
  env = { ctx, W, H, k: Number(state.get("theme.styleStrength") ?? 1), lw: 1, ...themeColors(), dpr }
  sstate = cur.setup(env)
}

function frame () {
  timer = 0
  if (!cur || document.hidden) return
  const now = performance.now()
  t += Math.min(0.5, (now - last) / 1000) * cur.speed
  last = now
  ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0)
  ctx.clearRect(0, 0, env.W, env.H)
  cur.draw(env, sstate, t)
  if (!animated() || !isWinActive()) return             // resumes on "win-active"
  const fps = document.body.classList.contains("on-home") ? cur.fps : Math.min(cur.fps, FPS_OFF_HOME)
  timer = setTimeout(frame, 1000 / fps)
}

function kick () {
  clearTimeout(timer); timer = 0
  if (!cur) return
  last = performance.now()
  frame()
}

function sync () {
  const id = styleId()
  document.body.dataset.backdrop = id
  if (id === "none") {
    clearTimeout(timer); timer = 0; cur = null
    canvas?.remove()
    return
  }
  if (!canvas) {
    canvas = document.createElement("canvas")
    canvas.id = "backdrop"
    canvas.setAttribute("aria-hidden", "true")
    ctx = canvas.getContext("2d", { alpha: true, desynchronized: true })
  }
  if (!canvas.isConnected) document.body.prepend(canvas)
  if (cur !== STYLES[id]) { cur = STYLES[id]; t = 0 }
  size(); kick()
}

export function initBackdrop () {
  // Topographic used to be a theme: keep its look as Mint + the Topographic style
  if (state.get("theme.active") === "topo") {
    state.set("theme.active", "mint")
    state.set("theme.style", "topo")
  }
  let lastSig = ""
  bus.on("config", () => {
    const th = state.get("theme") ?? {}
    const sig = JSON.stringify([th.style, th.styleStrength, th.styleLive, th.active, th.mode, th.accent, th.accentCustom, th.custom, document.body.dataset.mode])
    if (sig === lastSig) return
    lastSig = sig
    setTimeout(sync, 0)          // after state.js has re-applied the theme's colors
  })
  bus.on("saver", () => cur && kick())
  let rz = 0
  window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (cur) { size(); kick() } }, 120) })
  document.addEventListener("visibilitychange", () => { if (!document.hidden) kick() })
  bus.on("win-active", (on) => { if (on && cur && !timer) kick() })
  bus.on("view", () => { if (cur && timer) kick() })     // back on Home → full rate right away
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => setTimeout(sync, 0))
  sync()
}
