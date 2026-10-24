# Flux UI Rework — Final Specification ("Calm Shell", synthesized)

**Winner: calm-shell**, with grafts from surfaces-widgets (favbadge atom, color-mix token derivation, favicon cache, icon picker, z-ladder, --f-ctl-h, escape hatches) and motion-first (exit() primitive, tiered spring tokens, Ask-chip/panel sync, load-completion sweep, hover-intent + skeleton rows). All judge vetoes are honored and called out inline.

---

## 0. Governing principles

1. **Material by persistence.** Persistent chrome (sidebar rows, settings boxes, suggestion rows, hot tiles, chat containers) is **MATTE** — flat translucent fill, no backdrop-filter, no specular rim. Transient floating layers (peek sidebar, popovers, suggestion panel, palette, toasts, sheets, AI panel shell) are **GLASS** (quieted). AI-only elements may use the **AURA** gradient material.
2. **Color by provenance.** The only chromatic color in resting chrome comes from (a) the live page via the adaptive tint, or (b) the single designated accent moment per screen. Status colors route exclusively through `--sys-*` via color-mix. The ~40 hardcoded greens/oranges/reds die.
3. **One accent moment per screen.** Page view: the page tint. Home: the glow under the command bar. AI panel: the bloom/busy border. Settings: the sliding active pill. Omnibox open: the hero suggestion row. Everything else is neutral fills and hairlines.
4. **Shimmer means "AI at work" — nowhere else.** Exactly three shimmer sites: home glow (once on entry), the omnibox "Ask" route chip, the thinking label while streaming.
5. **Nothing teleports.** Every entrance has a mirrored exit (~0.75× duration); every reorder FLIPs; every state swap crossfades.
6. **Performance is a feature.** transform/opacity only (one declared exception, §4.9); no permanent compositing layers; infinite loops removed from the DOM when idle; everything pauses on `document.hidden`.
7. **Dark leads.** `color-scheme` moves from `:root` to `[data-theme]` so a future light theme is a one-file drop, but **no light theme ships this pass**.

---

## 1. Tokens (`src/renderer/styles/tokens.css`)

All new tokens are **derived via color-mix from existing `--f-*` tokens** (surfaces-widgets graft) so the 7 existing themes propagate automatically and a future light theme flips polarity for free. Use a literal only where derivation visibly shifts an existing theme (verify in the wave-3 screenshot pass). Values on dark render ≈ today's literals (`--f-text` is white at 0.92 alpha, so 6% mix ≈ rgba(255,255,255,.055)).

### 1.1 Surface / interaction tokens
```css
--f-matte:        color-mix(in srgb, var(--f-text) 6%, transparent);
--f-matte-hover:  color-mix(in srgb, var(--f-text) 9%, transparent);
--f-matte-active: color-mix(in srgb, var(--f-text) 13%, transparent);
--f-hairline:     color-mix(in srgb, var(--f-text) 9%, transparent);
--f-rim:          color-mix(in srgb, var(--f-text) 14%, transparent);
--f-scrim:        rgba(0, 0, 0, 0.38);
--f-pop-bg:       color-mix(in srgb, var(--f-bg-1, var(--f-bg)) 86%, transparent);
--f-thumb:        color-mix(in srgb, var(--f-text) 96%, transparent);
--f-shadow-soft:  0 12px 32px -12px rgba(0, 0, 0, 0.5);
```
`--f-pop-bg` replaces the three hardcoded purple-darks: `.pop rgba(32,30,42,.86)`, `.ob-suggest rgba(30,28,40,.88)`, `.pal rgba(30,28,42,.8)` — popovers and the palette finally retheme. `--f-thumb` replaces the `#fff`/`#111` switch/slider/mic pairs. Scrollbar thumbs become `color-mix(in srgb, var(--f-text) 20%, transparent)` so they survive reader sepia/paper.

### 1.2 Radius scale
```css
--f-r-xs: 6px;  --f-r-sm: 8px;  --f-r-md: 10px;
--f-r-lg: 14px; --f-r-xl: 22px; --f-r-pill: 999px;
```
Legacy `--f-radius/-sm/-lg` become aliases of lg/sm/xl. Nested corners derive concentrically via `calc(parent − padding)`. `:focus-visible { border-radius: inherit }` replaces the forced 7px.

### 1.3 Type scale + micro-label
```css
--f-font-xs: 10.5px; --f-font-sm: 11.5px; --f-font-md: 13px;
--f-font-lg: 15px;   --f-font-xl: 17px;   --f-font-2xl: 26px;
--f-mono: "SF Mono", ui-monospace, monospace;
```
One utility class **`.micro`** (defined in app.css): `font: 500 10px var(--f-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--f-text-3);`. Used ONLY as section seasoning: suggestion group headers (ACTIONS / TABS / HISTORY), palette group labels, settings group titles, sidebar PINNED label, AI step-rail WORKING label. Never body copy.

### 1.4 Control rhythm
```css
--f-ctl-h: 28px;   /* [data-density="compact"] → 26px */
```
Ends the 24/26/28px control drift (switches, segs, small buttons consume it).

### 1.5 Adaptive tint (consumed by tint.js, §5)
```css
/* on body; JS writes --f-page-tint */
--f-page-tint: var(--f-accent);
--f-tint-16: color-mix(in srgb, var(--f-page-tint) 16%, transparent);
--f-tint-8:  color-mix(in srgb, var(--f-page-tint) 8%, transparent);
```
Themes opt out by pinning `--f-page-tint: var(--f-accent)` on their `[data-theme]` block.

### 1.6 AI / aura tokens
```css
--f-ai-a:    color-mix(in srgb, var(--f-accent) 80%, #4fa8ff);
--f-ai-b:    color-mix(in srgb, var(--f-accent) 60%, #ff7ad9);
--f-ai-grad: linear-gradient(120deg, var(--f-ai-a), var(--f-ai-b));
--f-shimmer: rgba(255, 255, 255, 0.45);
```

### 1.7 Status recipe (kills ad-hoc hexes)
Backgrounds: `color-mix(in srgb, var(--sys-green|--sys-red|--sys-orange|--sys-blue) 18%, transparent)`. Text/icons: `color-mix(in srgb, var(--sys-*) 80%, var(--f-text))`. Applies to: `.tag.ok/.warn`, `.cap--*`, `.si-ico`, `.btn--danger`, `.mi.is-danger`, shield green `#6fe3a6`, insecure `#ffb08a`, AI error reds (`#ffae96`, `#ffc2b2`, etc.), listening-mic red. Settings META tint hexes move to `--f-tint-blue/-indigo/-teal/-purple/-orange/-green/-pink/-gray` tokens consumed by `.tile`'s existing `--tint` var.

### 1.8 Z-index ladder (replaces magic numbers)
```css
--z-toolbar: 10; --z-reader: 15; --z-prompt: 30; --z-peek: 60;
--z-pop: 300; --z-sheet: 600; --z-overview: 780; --z-palette: 800; --z-toast: 900;
```
(Values preserve today's relative order; `#toasts` drops from 9999.)

### 1.9 Structural
`color-scheme: dark` moves from `:root` to each `[data-theme]` block (every shipped theme declares dark). All duration tokens stay: `--f-fast: calc(140ms * var(--f-speed))`, `--f-med: 240ms` (**unchanged — veto on the 220ms retiming**), `--f-slow: 420ms` (**reserved for AI blooms only**).

---

## 2. Material tiers (`src/renderer/styles/glass.css`)

### 2.1 `.matte` (new tier — persistent chrome)
```css
.matte { background: var(--f-matte); border: 0.5px solid var(--f-hairline); }
```
No backdrop-filter, no pseudo-elements, no rim. Hover/active states use `--f-matte-hover/-active` per component.

### 2.2 `.glass` (quieted — floating chrome only)
- `saturate(190%) → saturate(140%)`, `brightness(1.06) → brightness(1.02)`.
- Rim gradient peak alpha `0.5 → 0.28`; border from `--f-rim`.
- **Stacking fix, once:** `.glass { isolation: isolate }`, `::before/::after` get `z-index: -1`. Delete every per-child `position:relative; z-index:3` patch (palette, overview, cards, perm prompts).
- `--f-glass-w` mechanism unchanged so themes keep tuning clarity.

### 2.3 `.sheet` (modal pattern)
`.sheet-scrim` = `var(--f-scrim)` + `backdrop-filter: blur(8px)`, fades in `--f-fast`. `.sheet-card` = glass tier, `--f-r-xl`, enters scale .97→1 + fade over `--f-med --f-ease-out`, exits via `exit(el)` at 0.75×. Escape / click-out / focus trap mandatory. `z-index: var(--z-sheet)`.

### 2.4 AURA
AI-only: `--f-ai-grad` backgrounds/borders. Used by: the swell bloom, the busy conic border, the home glow, the Ask route chip shimmer. Never on resting chrome.

---

## 3. Theme contract & new default theme

- `applyTheme()` in `core/state.js` is **untouched** except the fallback default `"nebula" → "quiet"`. The `[data-theme]` override pipeline, `accentCustom`, `--f-glass/--f-blur` writes and `#flux-custom-css` injection survive verbatim.
- **New file `src/renderer/styles/themes/quiet.css`** (~60 lines), linked in index.html after nebula: near-neutral charcoal (`--f-bg: #121216`, `--f-bg-1: #18181d` — no indigo cast), accent stays `#8b7bff`, `--f-glass: 0.45`, `--f-ambient` = single faint 10%-accent radial (ribbons effectively off), `--f-shadow` softened, `color-scheme: dark`.
- **Migration (judge condition):** the quiet default applies to **fresh profiles only**. In `src/main/store.js`, before changing the DEFAULTS (lines 23 & 181) to `"quiet"`, add a one-time migration: if a config file already exists on disk and has no explicit saved `theme.active`, write `theme.active: "nebula"` into it first. Existing users keep their look; verify by launching with an old config.
- The 7 existing themes are untouched and must render **visually identically** (wave-3 gate, §10).
- Pin minimum Electron/Chromium (needs `color-mix`, `:has()`, `oklch`, `linear()`) in a `package.json` comment/engines note.

---

## 4. Motion system — "Settle" (`core/motion.js` + `styles/motion.css`)

Everything in the chrome settles; only AI blooms.

### 4.1 Durations (owner band 140–250ms for chrome; vetoes honored)
| Token | Value | Use |
|---|---|---|
| `--f-fast` | 140ms | hover states, chip crossfades, icon swaps, reveals |
| `--f-med` | 240ms | all structural motion: enters, FLIP, panel slide, suggestion expand |
| `--f-slow` | 420ms | **AI blooms only** (swell, home glow, shimmer envelope) |
| exits | 0.75× the matching enter | always `--f-ease-out` |

### 4.2 Curves & tiered springs (motion-first graft, clamped per veto)
- `--f-ease-out: cubic-bezier(0.22, 1, 0.36, 1)` — the **chrome workhorse**: seg thumbs, switch travel, color/width/opacity transitions, every exit. (Kills small-control wobble; controls never use the overshoot spring.)
- `--f-ease` (user-selectable spring) — **transform-only physical moments**: FLIP reorder, pin/unpin morph, sidebar peek, tab-card fan.
- `applyMotion()` pre-generates and writes three spring pairs using `springEasing()`'s currently-discarded `settleMs`:
  - `--f-spring-snap` = springEasing(380, 32), `--f-dur-snap: clamp(140ms, settleMs, 200ms)` — sliding pills, selection inks.
  - `--f-spring` = springEasing(220, 24), `--f-dur-spring: clamp(180ms, settleMs, 250ms)` — pin morph, drag gap-open, peek.
  - `--f-spring-soft` = springEasing(150, 18), `--f-dur-soft = settleMs` (~420–460ms) — **AI moments exclusively** (swell, bloom).
- **Veto applied:** no 300ms/440ms vocabulary in core chrome; anything >250ms is AI-tier.

### 4.3 Single time source
`applyMotion()` writes the 140/240/420 bases onto `:root` (`--f-dur-fast-base` etc.); `ms()` reads them back via one cached getComputedStyle. The JS/CSS duplicate (motion.js ~line 90 vs tokens.css) dies.

### 4.4 Symmetric exits — the `exit(el, kind?)` primitive (motion-first graft)
New export in motion.js: adds `.is-leaving`, resolves on `animationend` with an `ms('med') + 80` timeout fallback (prevents ghost nodes / double-removes); CSS owns the frames. `leave()` delegates to it; its hardcoded `cubic-bezier(0.4,0,1,1)` dies — exits read `--f-ease-out`. motion.css gains an `.is-leaving` family mirroring every `.is-entering`:
- `[data-anim-tab-close="shrink|fade|slide"] .tab.is-leaving` — the dead config transport finally gets CSS.
- `.pop.is-leaving`, `.ob-suggest.is-leaving`, `.pal.is-leaving` + `.pal-overlay` scrim fade, `.toast.is-leaving`, `#aipanel.is-leaving`, `.sheet-card.is-leaving`, `.perm/.loaderr` drop-out.
Adopted **surface-by-surface** by the wave-2 tasks, not as one big-bang leave() rewrite.

### 4.5 Stagger
Replace all nth-child chains with `animation-delay: calc(var(--stagger-i, 0) * 22ms * var(--f-speed))`; render loops set `el.style.setProperty('--stagger-i', i)`. Unlimited children (fixes the 7th-child pop). Omnibox/palette rows use a 15ms step.

### 4.6 FLIP v2
`flip(els, {scale, stagger})` — adds scale interpolation (enables the pin morph) and per-index delay; easing read **once per call** (kills the per-element sync style flush). Tab close switches from max-width layout animation to `flip()` on siblings + scale/fade on the closer.

### 4.7 Interruptibility
Entrance classes removed on `animationend` AND re-trigger cancels running WAAPI via `el.getAnimations().forEach(a => a.cancel())` — rapid tab switching redirects instead of restarting.

### 4.8 Honest reduced motion
`@media (prefers-reduced-motion: reduce)` mirrors `[data-motion="reduced"]` in motion.css. `reduced` additionally disables: ripples, spotlight tracking (pointermove early-returns), orb blink/eye timers (orb.js checks `effectiveMode()`), and gates `.ov-card/.ai-msg/.ai-step` entrances behind `[data-motion]`; `--stagger` collapses; exits become 100ms fades. `off` truly sets `animation: none` via the attribute (not the 0.001-speed fake) for all new rules; `exit()` resolves immediately.

### 4.9 Deleted / gated
- **Material ripple deleted by default** (reads Android; its forced `overflow:hidden` on 8 component classes — `.tab/.side-item/.chip/.pill-btn/.mi/.engine/.seg button/.btn` — is removed, un-clipping shadows and focus rings; each of the 8 gets an overflow inspection in wave 3). Press feedback = `scale(var(--f-press))` + background darken, **neutral** (veto on accent press-glow). Ripples stay available behind the existing data attribute.
- Ambient ribbons + orb idle loops: `animation-play-state: paused` when `document.hidden` (one visibilitychange listener in motion.js toggling `body[data-hidden]`); durations finally multiply by `--f-speed`.
- `replayPreview()` re-triggers the real configured classes (`.is-entering`/`.pane-enter`) instead of a generic fade-up.
- **GPU rule:** every new keyframe animates transform/opacity only. **The one sanctioned exception:** the suggestion-panel `grid-template-rows 0fr→1fr` expansion (fires once per focus; must be profiled on a 12-row list; `clip-path` reveal is the ready fallback). No `will-change`, no new permanent layers. The only surviving infinite loops — AI busy border (while `.is-busy`) and shimmer (while live) — are removed from the DOM when idle.
- **Veto applied: NO View Transitions API in v1.** The home-pill→toolbar morph is dropped from this rework (post-ship experiment at most). `wv-enter` stays the pane-switch path.

### 4.10 Microinteraction contract (trigger → property → duration → curve)
| Interaction | Property | Duration | Curve |
|---|---|---|---|
| Hover fill (rows, buttons, tiles) | background-color | 140ms | --f-ease-out |
| Press | scale → var(--f-press) + bg darken | 80ms in / 160ms out | --f-ease-out |
| Icon crossfade (reload↔stop, send↔stop) | opacity + rotate(90deg) | 140ms | --f-ease-out |
| Sliding selection pill (.vt-ind, .ob-sel, .pal-sel, .set-ind) | translateY (+scaleY) | --f-dur-snap | --f-spring-snap |
| Row/chip entrance | translateY(8px)+fade | 240ms, --stagger-i × 22ms | --f-ease-out |
| Row/chip exit | fade (+translateY −4px) | 180ms | --f-ease-out |
| FLIP reorder / gap-open | transform | --f-dur-snap | --f-spring-snap |
| Pin/unpin morph | transform + radius (flip v2 w/ scale) | --f-dur-spring | --f-spring |
| Hover reveals (.vt-x, star, zoom/shield chips) | opacity + translateX(4px), fixed-width slots | 140ms | --f-ease-out |
| Crumb↔URL / crumb↔input swap | opacity crossfade + 6px x-shift | 140–160ms | --f-ease-out |
| Suggestion panel expand | grid-template-rows 0fr→1fr + radius morph | 240ms | --f-ease-out |
| Suggestion panel close | scaleY/fade out | 160ms | --f-ease-out |
| Popover/menu/palette enter (m-pop) | scale .985 from anchor origin + fade | 180ms | --f-ease-out |
| Popover/palette exit | scale .96 + fade | 140ms | --f-ease-out |
| Sheet enter / exit | translateY(16px) scale(.98)→1 / reverse | 240ms / 180ms | --f-ease-out |
| Toast enter / exit | m-rise 200ms / sink-fade 160ms | — | --f-ease-out |
| Peek sidebar enter / exit | translateX(−12px)→0 + fade / reverse | --f-dur-spring / 160ms | --f-spring / --f-ease-out |
| Tab switch tint crossfade | background-color via --f-tint-16 | 240ms | --f-ease-out |
| AI panel enter | slide per data-anim-panel + swell bloom | --f-med + --f-slow bloom | --f-ease / ease-out |
| AI panel exit | translateX(18px) + fade | 180ms | --f-ease-out |
| AI swell bloom (.ai-bloom) | scale .6→1.15, opacity 0→.45→0, one-shot, removed on animationend | --f-slow | ease-out |
| Busy border | conic sweep of --f-ai-a/b @35% | 2.6s loop, only while .is-busy | linear |
| Shimmer (3 sites only) | gradient sweep | 1.6s × --f-speed | linear |
| Load-completion sweep | border gradient sweep around #address-wrap, 20% accent, one-shot | 500ms | --f-ease-out |
| Chip status swap (spinner→done) | opacity crossfade | 140ms | --f-ease-out |
| details/thinking expand | grid-template-rows 0fr↔1fr | 240ms | --f-ease-out |
| Hotkey tile bounce | scale 1→1.06→1 | 240ms | --f-spring |
| Orb reactions (ai:ask squash / error wobble) | transform one-shot | 280ms / 360ms | --f-spring |
| Permission auto-deny countdown | conic --p ring on Block button | 58s linear | linear |
| Smooth scroll (active tab, chat) | scrollIntoView/scrollTo behavior:'smooth' | native | — |

---

## 5. Adaptive tint engine — Dia's signature (new `src/renderer/core/tint.js`, ~70 lines)

**V1 ships meta theme-color only** (judge condition — favicon sampling is a flagged follow-up; multi-color favicons average to mud).
- `core/tabs.js` subscribes to the webview `did-change-theme-color` event and stores per-tab `tintColor`. **tabs.js is at 483/500 lines — plan the split now:** extract per-tab metadata (tint, favicon cache writes) into a new `core/tabmeta.js` rather than discovering the cap mid-task.
- tint.js converts to **oklch and clamps L to 0.45–0.72, C to ≤ 0.11** — guarantees AA contrast of `--f-text` over `--f-tint-16` on dark. A wrong-but-legible tint is acceptable; an illegible one is not.
- On every `tabs` bus event it writes `--f-page-tint` onto `body` with `transition: none` (consuming properties transition instead). No theme-color → falls back to `var(--f-accent)` (neutral behavior, zero regression).
- Gated by new setting **`theme.adaptiveTint` (default true)** — one switch row in the Theme settings pane. Themes opt out by pinning the var (§1.5).
- Consumers: active sidebar row (`--f-tint-16` fill + 2px `--f-page-tint` leading bar), toolbar capsule (`color-mix(in srgb, var(--f-page-tint) 8%, var(--f-matte))` bg + 20%-tint border), loadbar gradient. All crossfade 240ms `--f-ease-out` on tab switch — **the only chromatic color in the resting shell.**

---

## 6. Favicon system — the explicit user ask

### 6.1 `favbadge()` — one shared atom (new `src/renderer/core/favbadge.js`, <120 lines)
```html
<span class="fav-badge"><img|monogram|glyph/><i class="fav-state"></i></span>
```
Default 18px slot; size parameterized. **Fallback chain everywhere:** custom image → live favicon (`T.faviconFor`) → persisted `faviconCache` → letter monogram (initial(s), background hash-picked from 8 `color-mix(var(--sys-*), var(--f-bg) 70%)` tints) → globe glyph. **State renders INTO the badge:** loading = 1.5px accent conic ring rotating around the favicon (duration `calc(900ms * var(--f-speed) + 400ms)`, replaces both opacity pulses); audible = 3-bar equalizer (scaleY loop, paused when hidden); muted = slash overlay; asleep = moon corner badge. Reused identically in: sidebar rows, pinned tiles, classic tab strip, omnibox suggestions, hot tiles, AI context pills, AI source chips, hover-URL pill, palette rows.

### 6.2 Persisted favicon cache
- State key `faviconCache`: `host → dataURL`, **LRU-capped at 200 hosts, downscaled to 32px** before store (writes from the existing `page-favicon-updated` path, moved into `core/tabmeta.js`).
- On hot-tab save with no cached icon, the **main process fetches `/favicon.ico` once** (new IPC handler in `src/main/ipc.js`, exposed via preload).
- **Veto applied: `google.com/s2/favicons` is removed in this pass** — AI source chips use the cache + monogram fallback, with a reserved 16px slot so `onerror` never reflows.

---

## 7. Surfaces

### 7.1 Sidebar + vertical tabs (`components/vtabs.js`, `styles/dia.css`)
- **Token sweep:** all ~40 white-alpha rgba → `--f-matte/-hover/-active`, `--f-hairline`, `--f-rim`, `--f-pop-bg`, `--f-shadow-soft`; radii → `--f-r-md` (rows) / `--f-r-lg` (tiles/peek); the 3× duplicated 236px → one `--f-vt-w` token. Do **not** pre-split dia.css (it's 142 lines; split only if it actually approaches 500).
- **Adaptive tint:** active row drops white-11% for `background: var(--f-tint-16)` + a 2px leading tint bar (`::before`, radius 1px) in `var(--f-page-tint)`; hover stays neutral `--f-matte-hover`. Tint crossfades 240ms on switch.
- **Sliding active pill:** one absolutely-positioned `.vt-ind` behind the list animates translateY + scaleY (1px-height base, transform-only) at `--f-dur-snap --f-spring-snap` on activeId change.
- **Pin/unpin morph (signature):** pinning FLIPs the row into its tile slot via extended `flip()` (position + size + radius `--f-r-md → --f-r-lg`, `--f-dur-spring --f-spring`, favicon counter-scaled); unpin reverses. **Graft: dragging a tile back into the list plays the reverse morph** (fixes context-menu-only unpin), and tiles drag-reorder within the grid via flip(). Tiles grid becomes keyed (Map id→el) like rows; grid + `.vt-sep` height-animate (grid-rows 0fr↔1fr) when the pinned set empties/fills.
- **Drag feel:** dragover FLIPs neighbor rows apart ±36px (`--f-dur-snap`) instead of drop-indicator lines; custom drag ghost = pointer-events:none scaled clone (0.95, `--f-shadow-soft`); "Drop to pin" zone fades/scales in 140ms on `.vt-dragging`.
- **Hover reveals:** `.vt-x/.vt-audio/.vt-thumb` move to fixed-width trailing slots, opacity/transform 140ms — zero reflow under cursor; thumb↔close crossfade.
- **favbadge** replaces `.vt-fav` (loading ring / sleep moon / mute slash / equalizer in the one 18px slot); audible tiles get the equalizer.
- **Structure:** New Tab row moves out of `.vt-scroll` to a fixed ghost row above `.vt-bottom`; `.vt-scroll` gets 16px mask-image fades top/bottom; `scrollIntoView({behavior:'smooth'})`; peek enters translateX(−12px)+fade `--f-dur-spring --f-spring`, exits 160ms after the existing timer (timer becomes `ms('med') + 40`); the 600ms is-entering timeout becomes `ms('med') * 2.5` and row enter routes through `[data-anim-tab-open]`; the dia.css tab-pulse 1.2s literal dies (favbadge ring is speed-scaled). `.micro` "PINNED" label above the tiles when any exist; zero-tab empty state (dim "No open tabs" + ghost New Tab).
- **Explicitly deferred:** tab groups / spaces / auto-archive (structural product work — see §10).

### 7.2 Toolbar + omnibox (`components/titlebar.js`, `omnibox.js`, `styles/chrome.css`)
- **Rest state = `host · page-title`** (crumb exists): title hero at `--f-text`, host left at `--f-text-dim`. Full URL reveals on hover via a 140ms opacity crossfade between stacked crumb/url siblings in one grid cell (kills instant text replacement). Star, zoom and shield chips exist only on capsule hover/`:focus-within` (opacity + 4px x-shift, **fixed-width slots** — the `[hidden]` display toggles die). `layout.showFullUrl` still forces URL always-on.
- **Adaptive tint:** capsule bg `color-mix(in srgb, var(--f-page-tint) 8%, var(--f-matte))`, 0.5px border at 20% tint, transitioning 240ms on tab switch.
- **Edit morph:** on `:focus-within` crumb fades back (translateX −6px), input fades in (from +6px, 160ms); **text stays left-aligned in both states** (the center→left snap dies).
- **Route chip (`.ob-route`)** at the capsule's right end names `classify()`'s verdict live — "Go" / "Search · Google" / "Ask" — crossfading 140ms while typing; **click or Tab cycles the route** (replaces undiscoverable Tab-to-AI with the same muscle memory). When the route is "Ask", the chip carries a one-shot shimmer sweep (AI moment).
- **Suggestions as one surface:** `.ob-suggest` moves from body-append to **inside `#address-wrap`**; on `.has-suggest` (existing unused hook) the capsule morphs radius `--f-r-pill → --f-r-lg` (top corners), grows the panel via grid-rows 0fr→1fr over 240ms `--f-ease-out` (transform-origin top), gains glass + shadow. In-flow kills the stale-position-on-resize bug. **Regression gate:** manual-test both anchors (toolbar + Home) plus the Home-over-live-page path; the 120/150ms blur timers and click-outside need retesting. **If fragile, the sanctioned fallback is the lower-risk variant: child of `#toolbar`, absolute to the capsule, ResizeObserver.** Rows: grouped BEFORE scoring under `.micro` headers (ACTIONS / TABS / HISTORY); hero primary row 44px with 16px favbadge and accent text (the open-omnibox accent moment); other rows 36px matte; selection = sliding `.ob-sel` highlight (translateY, `--f-dur-snap`); rows stagger 15ms; async history fades into a **reserved skeleton row** (no jump); hover steals selection only after **80ms of actual pointer movement**; `close()` plays a 160ms exit before remove.
- **Density (owner sign-off item):** default visible set collapses to sidebar-toggle · back · forward · reload/stop · capsule · Ask; share/reader/key-fill/bookmark fold into the More menu. **Escape hatch: `layout.toolbarExtras` setting restores them.** The duplicated `btnStar2/btnDl2` dia-only pair is deleted — one button set, repositioned per `[data-layout]` in CSS.
- Reload↔stop crossfades with 90° rotation 140ms behind a cache key (no per-render replaceChildren). Pinned capsule becomes keyed + FLIP'd. Loadbar stays a 2px hairline but tints from `--f-page-tint`, and `.is-done` **also fires the one-shot 500ms border sweep around `#address-wrap`** (20% accent) — load state lands where the eye is. The dead `.tab.is-entering` gets real CSS (max-width + scale .9→1 inside a `ms`-based window). Downloads `.tb-btn.is-busy` conic `--p` ring wires to real progress.
- **Three AI entry points → two:** capsule Ask route chip + sidebar-footer Chats button remain; the titlebar AI cluster button and `.ask-pill` duplicates go; `body.ai-open` highlights both in sync, and the Ask chip **tints accent 120ms in sync with the panel swell** (graft).

### 7.3 Home + hot tabs (`components/home.js`, `hottabs.js`, `orb.js`, `styles/home.css`; moves the `.hot` block out of app.css)
- **Layout:** Dia-faithful near-empty page — the SAME capsule component and `.has-suggest` grid-rows morph as the toolbar (attachOmnibox already shared).
- **The screen's accent moment:** `.home-glow` — 480×120px pre-blurred radial of `--f-ai-a/--f-ai-b` at 22% alpha under the command bar (no backdrop-filter), fades in over `--f-slow` and plays ONE shimmer sweep on view entry, then rests static; gated by `[data-shimmer]` + reduced-motion.
- **ORB STAYS ON HOME (veto applied, reversing calm-shell's demotion):** retokenized — body/face/rim/eyes derived from `color-mix` against `--f-accent` so the mascot rethemes; slow idle border-radius morph for the "liquid" read; blink/eye-tracking gated behind `effectiveMode()` and prefers-reduced-motion; **one-shot reactions on existing bus events: `ai:ask` → 280ms happy squash, toast error → 360ms ±4° wobble** (graft). `home.showOrb` is the opt-out switch, **default ON** (existing and fresh profiles). The orb also appears in the AI panel empty state (64px).
- **Hot tabs, favicon-first (the explicit user ask):** icon chain per §6.1 with custom image first. Favicons render **padded** (`object-fit: contain`, 58% of tile, 6px radius) on a matte squircle tinted `color-mix(in srgb, var(--f-accent) 10%, var(--f-matte))` — the warm-brown gradient dies. Tiles 82px, `--f-r-xl`, hover translateY(−3px) scale(1.02) 140ms, press `--f-press`. Hotkey hints become key-cap chips (per-key spans, platform symbols, both Cmd and Ctrl mapped, `.micro` type); the tile bounces once (240ms `--f-spring`) when its hotkey fires. Macro tiles get a stacked double-plate.
- **Top-sites unified:** the fallback renders the same squircle component at a 56px variant; hover action "Pin as Hot Tab" promotes (the page no longer changes personality when the first hot tab arrives).
- **Editor becomes a `.sheet`** (§2.3) replacing the inline-styled modal — zero inline styles remain; **graft: three-way icon picker [Use favicon · Monogram · Upload] with live 64px preview** makes "favicon-first, custom optional" a visible choice. Tiles get a hover "…" kebab (fixes right-click-only editing) and drag-to-reorder with FLIP.
- **Choreography:** view entry staggers orb → greeting → headline → pill → glow → grid via `--stagger-i` at 22ms steps, 240ms each `--f-ease-out`. `mount()` stops full re-renders — sections diff at container level (orb element is a module singleton surviving config churn; hot grid FLIPs on add/remove/reorder); async top-sites fade in; topSites↔hotGrid crossfade 200ms. Prompt chips: 2 contextual (derived from recent page title/host) + 2 static, matte tier, staggered. Mic button `#fff → var(--f-thumb)`; listening state via `--sys-red` mixes; headline gradient's `#fff` stop → `--f-text`. `.home-ambient` hosts an optional 90s accent drift (off in quiet theme, paused when hidden).

### 7.4 AI panel (`components/aipanel.js`, `styles/ai.css`) — where the novelty budget is spent
- **Surface:** panel bg `rgba(22,20,34,.5)` → `color-mix(in srgb, var(--f-bg) 72%, transparent)` on the glass tier (40px blur becomes a `--f-blur-lg` token); every white/black rgba → tokens; radii → scale; error colors → `--sys-red` mixes. ai.css is 132 lines — split into ai.css + ai-chat.css **only if it actually approaches 500** after additions.
- **The swell (signature):** opening ⌘J plays the existing `[data-anim-panel]` slide PLUS a one-shot `.ai-bloom` — an absolutely-positioned radial of `--f-ai-grad` at the panel's leading edge, scale 0.6→1.15, opacity 0→0.45→0 over `--f-slow` ease-out, element **removed on animationend** (no resident layer). The toolbar Ask chip tints in sync (120ms).
- **Symmetric close:** `.is-leaving` mirrors the enter at 180ms `--f-ease-out`; `hidden = true` waits for animationend via `exit()`.
- **Tab-card pile (Dia signature):** page/tab attachments render as mini cards (favbadge + title, 148×44, matte, 1px hairline) that stack with ±3° rotation and 6px offsets; hover spreads them 4px (transform, 200ms `--f-spring`); click fans into a row via FLIP. The Page toggle shows the live favicon+title of the active tab in this card form.
- **Message choreography:** user bubble rises (translateY 8px + fade, 200ms); assistant shell fades up; tool/search chips stagger 30ms; status swaps crossfade 140ms instead of `replaceWith` snapping; consecutive steps group under one collapsible "WORKING" rail (`.micro` header, left hairline) with summaries promoted from tooltips to an expandable line; errors expand inline. Thinking `<details>` animates grid-rows 240ms; shimmer label stays (shimmer = AI at work).
- **Calm busy state:** the 5-color rainbow Siri rim **dies**; `is-busy` draws ONE conic sweep of `--f-ai-a/--f-ai-b` at 35% alpha over 2.6s + soft `--f-glow`; the stronger two-color breathe fires only while `tools.size > 0` (acting deserves the louder signal).
- **Composer:** send↔stop morphs with 90° rotation crossfade 140ms; autosize height transitions 140ms; attachment thumbs scale in/out 160ms; drag-and-drop images accepted (same downscale path as paste).
- **Empty state:** orb (64px, retokenized, idle-breathing per `[data-orb]`); suggestion chips contextual (two derived from active tab title/host) and staggered.
- **Streaming:** `scrollTo({behavior:'smooth'})`; "Jump to latest" glass pill fades in when scrolled >160px up during streaming.
- **Sources:** persisted favicon cache + monogram via favbadge (google/s2 removed), reserved 16px slots.
- Confirm cards: scale-in 200ms with a `--sys-orange`-mix border pulse (2 cycles), verb-first copy, collapse-to-chip via FLIP ("Allowed · site.com", 24px pill) once answered. Copy button becomes a hover action bar (copy / regenerate / edit) fading in 140ms. Resize handle hover accent hairline; width snaps at 360/440/560. Model menu splits into two (model+effort vs toggles).

### 7.5 Settings (`components/settings/shell.js`, `settings/kit.js`, `settings.js`, `settings/extra.js`, `styles/settings.css`)
- `.set-nav` and `.set-box` move to the **matte tier** (blur on a static full-pane sidebar is wasted compositing); all rgba literals → tokens; META hexes → `--f-tint-*` tokens via the existing `--tint` var.
- **Persistent shell:** nav + search input survive renders (the setTimeout refocus hack dies); category switch swaps only `.set-content` with the m-fade-up stagger via `--stagger-i` (22ms, uncapped) — the hard cut dies; scroll memo preserved (rAF restore uses `behavior:'auto'`).
- **Nav accent moment:** sliding `.set-ind` pill FLIPs between items at `--f-dur-snap --f-spring-snap`; `.is-active` text becomes `--f-accent-text` on `--f-accent-soft` (fixes white-on-light-accent contrast). The clicked nav `.tile` shared-element-morphs into the 54px hero tile via `flip()` (both carry `--tint/--ts`).
- Search debounced 120ms; row filtering animates via grid-rows collapse 140ms instead of display:none pops. Seg-thumb and switch travel move from the overshoot `--f-ease` to `--f-ease-out`. "Flux · Liquid Glass" copy → version string.
- **New settings rows this pass:** Theme pane: `theme.adaptiveTint` switch (default on). Home pane: `home.showOrb` (default on). Layout pane: `layout.toolbarExtras`. Contract: the config keys and defaults are defined in `src/main/store.js` (foundation task); this task only renders the rows.

### 7.6 Overlays, palette, popovers (`components/overlays.js`, `palette.js`, `popover.js`, `styles/surfaces.css`)
- **Unified pop contract (graft):** one `m-pop` enter (scale .985 from anchor corner + fade, 180ms `--f-ease-out`) and `.is-leaving` exit (140ms) across `.pop`, `.dl`, `.si`, `.ob-suggest`, sheets — every floating surface opens/closes the same way, on `--f-pop-bg` + `--f-blur`. Z-indexes from the §1.8 ladder.
- **Palette:** bg → `--f-pop-bg` (rethemes at last); results **grouped by kind BEFORE scoring** (kills duplicate headers) under `.micro` labels; match substrings highlighted; async history splices into a reserved skeleton slot; rows stagger 15ms; selection = sliding `.pal-sel` highlight on `--f-accent-soft` + `--f-accent-text` (hardcoded `#fff` dies); **hover steals selection only after 80ms of pointer movement**; `#stage` scales to 0.995 and dims 8% behind the overlay over `--f-med` (transform/opacity, removed with it); exit via `exit()`.
- **Permission prompts:** stack with 8px offsets + staggered entrances; the 58s auto-deny becomes a **visible draining conic ring on the Block button** (`--p` custom property); **"Remember for this site" defaults UNCHECKED** — a deliberate behavior change requiring owner sign-off (silent persisted denial on timeout is a trap), do not silently ship.
- Load-error card gets `exit('drop')` on dismiss. Hover-URL pill gains a favbadge lock/favicon glyph, crossfades text on link-to-link moves (keep the 120ms debounce). Toasts: m-rise 200ms in / 160ms `.is-leaving` out; blur literal → `--f-blur`. Tab overview `.ov-card` entrances gate behind `[data-motion]` and stagger via `--stagger-i`; FLIP on filter. Loadbar trickle duration/curve → tokens.

---

## 8. Signature moments (the ten that make it "like Dia")
1. **Page-color bleed** — active sidebar row + toolbar capsule tint from the live page (`did-change-theme-color`, oklch-clamped), crossfading 240ms on every tab switch. Ships per judge conditions or not at all.
2. **Title, not URL** — the command bar rests as `host · page-title`; URL, star, zoom, shield materialize only on hover.
3. **The swell** — ⌘J plays the one-shot `.ai-bloom` gradient at the panel's leading edge: "this page just became context," then gone from the DOM; Ask chip tints in sync.
4. **Shimmer = AI at work, nowhere else** — home glow (once), Ask route chip, thinking label. Zero decorative shimmer.
5. **One input, three brains, visibly** — the route chip names classify()'s verdict live; Tab/click cycles the override.
6. **The tab-card pile** — attached tabs stack, wiggle apart on hover, fan out on click via FLIP.
7. **Pin morph** — rows fly bodily into the pinned grid on a spring, and tiles fly back out.
8. **The command bar that grows** — focusing morphs the capsule itself into the suggestion panel; no floating disconnected dropdown anywhere.
9. **Gradient glow under the home command bar** — the new-tab brand moment at near-zero GPU cost.
10. **Favicon as widget (the explicit user ask)** — one persisted, padded, state-carrying 18px favicon atom across the entire browser.

---

## 9. Explicitly deferred (tell the owner — not hidden)
- **Tab groups / spaces / auto-archive** — structural product work, not chrome rework. Dia's sidebar organization (groups, auto-naming shimmer) is part of what "like Dia" evokes and this pass will NOT deliver it. The pinned/today visual split is deferred with it.
- **Light theme** — the token closure now makes one a single themes/ file; dark leads per the owner's system; none ships.
- **View Transitions home→page omnibox morph** — vetoed for v1; post-ship experiment at most.
- **Favicon-sampling tint fallback** — follow-up after the oklch clamp is proven on meta theme-color.
- Dia's Insert-into-page button and Live Work app tabs; model/history picker search+previews; responsive settings sidebar.

## 10. Regression gates & owner sign-off (wave 3 enforces)
1. **Per-theme before/after screenshot pass** — blackline-noir and carbon first (most extreme overrides), then nebula/ember/midnight/aurora/blackline, plus quiet. One color-mix against a theme-overridden `--f-bg` can shift a surface.
2. **ob-suggest rewire** — manual-test toolbar + Home anchors + Home-over-live-page; fallback variant named in §7.2.
3. **Grid-rows expansion** — profile on a 12-row list on low-end hardware; clip-path fallback ready.
4. **Ripple overflow** — inspect each of the 8 formerly-clipped classes for exposed overflow (badges, focus rings).
5. **Owner sign-off required (behavior changes, not polish):** permission "Remember" defaulting unchecked; toolbar density fold (escape hatch `layout.toolbarExtras`).
6. **Default-theme migration** — verify an existing config keeps nebula after upgrade (§3).
7. **faviconCache growth** — confirm LRU cap + 32px downscale keep config read/write fast.
8. **Electron minimum pinned** in package.json notes (color-mix, :has(), oklch, linear()).

---

## Implementation tasks

- **F1-foundation-tokens-materials** (wave 1): Tokens, materials, quiet theme, state/store defaults — owns: src/renderer/styles/tokens.css, src/renderer/styles/glass.css, src/renderer/styles/app.css, src/renderer/styles/controls.css, src/renderer/styles/themes/quiet.css, src/renderer/core/state.js, src/main/store.js, src/renderer/index.html, package.json
- **F2-motion-engine** (wave 1): Settle motion system: springs, exits, stagger, reduced-motion — owns: src/renderer/core/motion.js, src/renderer/styles/motion.css
- **F3-favicon-tint-infra** (wave 1): favbadge atom, persisted favicon cache, adaptive tint engine, tabs split — owns: src/renderer/core/favbadge.js, src/renderer/core/tint.js, src/renderer/core/tabmeta.js, src/renderer/core/tabs.js, src/main/ipc.js, src/preload/preload.js
- **S1-sidebar-vtabs** (wave 2): Sidebar + vertical tabs: tint, sliding pill, pin morph, favbadge — owns: src/renderer/components/vtabs.js, src/renderer/styles/dia.css
- **S2-toolbar-omnibox** (wave 2): Toolbar + omnibox: title-at-rest, route chip, growing suggestion surface — owns: src/renderer/components/titlebar.js, src/renderer/components/omnibox.js, src/renderer/styles/chrome.css
- **S3-home-hottabs** (wave 2): Home + hot tabs: favicon-first tiles, glow, orb kept, sheet editor — owns: src/renderer/components/home.js, src/renderer/components/hottabs.js, src/renderer/components/orb.js, src/renderer/styles/home.css
- **S4-ai-panel** (wave 2): AI panel: swell, tab-card pile, calm busy state, message choreography — owns: src/renderer/components/aipanel.js, src/renderer/styles/ai.css
- **S5-settings** (wave 2): Settings: persistent shell, sliding nav pill, hero morph, new switches — owns: src/renderer/components/settings/shell.js, src/renderer/components/settings/kit.js, src/renderer/components/settings.js, src/renderer/components/settings/extra.js, src/renderer/styles/settings.css
- **S6-overlays-palette** (wave 2): Palette, popovers, permissions, toasts, overview: unified pop contract — owns: src/renderer/components/overlays.js, src/renderer/components/palette.js, src/renderer/components/popover.js, src/renderer/styles/surfaces.css
- **I1-theme-regression** (wave 3): Per-theme visual regression pass + quiet polish — owns: src/renderer/styles/themes/nebula.css, src/renderer/styles/themes/ember.css, src/renderer/styles/themes/midnight.css, src/renderer/styles/themes/aurora.css, src/renderer/styles/themes/carbon.css, src/renderer/styles/themes/blackline.css, src/renderer/styles/themes/blackline-noir.css, src/renderer/styles/themes/quiet.css, src/renderer/styles/carbon-tex.css, src/renderer/styles/tokens.css
- **I2-motion-perf-audit** (wave 3): Cross-cutting motion audit, overflow checks, perf profiling, cleanup — owns: src/renderer/core/motion.js, src/renderer/styles/motion.css, src/renderer/styles/app.css, src/renderer/styles/chrome.css, src/renderer/styles/dia.css, src/renderer/styles/home.css, src/renderer/styles/ai.css, src/renderer/styles/settings.css, src/renderer/styles/surfaces.css, src/renderer/styles/controls.css, src/renderer/index.html