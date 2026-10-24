// generate a forged-carbon shard field as an SVG, print data-URI-ready string
const W = 700, H = 700, COLS = 26, ROWS = 26
const cw = W / COLS, ch = H / ROWS
let seed = 1337
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
const jit = (v, amt) => v + (rnd() - 0.5) * amt

// point grid with jitter (edges pinned so the tile repeats seamlessly-ish)
const pt = []
for (let r = 0; r <= ROWS; r++) {
  pt[r] = []
  for (let c = 0; c <= COLS; c++) {
    const edge = r === 0 || c === 0 || r === ROWS || c === COLS
    pt[r][c] = [
      edge ? c * cw : jit(c * cw, cw * 0.9),
      edge ? r * ch : jit(r * ch, ch * 0.9)
    ]
  }
}

// grey palette: mostly dark voids, occasional mid flake, rare bright glint
function grey () {
  const t = rnd()
  let l
  if (t < 0.5) l = 8 + rnd() * 10          // void  8-18
  else if (t < 0.82) l = 20 + rnd() * 16   // body  20-36
  else if (t < 0.96) l = 40 + rnd() * 18   // flake 40-58
  else l = 66 + rnd() * 22                 // glint 66-88
  const v = Math.round(l)
  return `rgb(${v},${v + 1},${v + 3})`
}

const tris = []
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const a = pt[r][c], b = pt[r][c + 1], d = pt[r + 1][c], e = pt[r + 1][c + 1]
    const flip = rnd() < 0.5
    const t1 = flip ? [a, b, d] : [a, b, e]
    const t2 = flip ? [b, e, d] : [a, e, d]
    for (const tr of [t1, t2]) {
      const f = grey()
      const p = tr.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
      tris.push(`<polygon points='${p}' fill='${f}'/>`)
    }
  }
}

const svg =
`<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'>` +
`<rect width='${W}' height='${H}' fill='rgb(10,11,13)'/>` +
`<g stroke='rgba(180,200,220,0.05)' stroke-width='0.6'>${tris.join('')}</g>` +
// soft clearcoat gradient sheen
`<defs><radialGradient id='s' cx='30%' cy='0%' r='120%'>` +
`<stop offset='0%' stop-color='rgba(255,255,255,0.10)'/>` +
`<stop offset='45%' stop-color='rgba(255,255,255,0)'/>` +
`<stop offset='100%' stop-color='rgba(0,0,0,0.28)'/></radialGradient></defs>` +
`<rect width='${W}' height='${H}' fill='url(%23s)'/>` +
`</svg>`

// URI-encode the bits data: URIs choke on
const enc = svg
  .replace(/#/g, '%23')
  .replace(/</g, '%3C').replace(/>/g, '%3E')
  .replace(/"/g, "'")
process.stdout.write(`url("data:image/svg+xml,${enc}")`)
