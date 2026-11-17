// ───────────────────────────────────────────────────────────────────
//  settings/extra.js — v0.4 categories: Comet AI, Motion (every
//  animation is tunable, with live previews), Layout, Privacy & Shield,
//  and search keywords.
// ───────────────────────────────────────────────────────────────────
import { h, clear } from "../../core/dom.js"
import { state } from "../../core/state.js"
import { bus, toast } from "../../core/bus.js"
import { ico } from "../../core/icons.js"
import { springEasing, replayPreview } from "../../core/motion.js"
import { group, row, block, seg, sw, rng, sel, textField, btn } from "./kit.js"
import { localStatus, pullModel, getButton, capsBadges, fmtSize, shortName } from "../localai.js"

const rerender = () => bus.emit("settings:rerender")

function restore (branch, label = branch) {
  return row(`Restore ${label} defaults`, btn("Restore", async () => {
    const d = await window.flux.config.defaults()
    await state.set(branch, d[branch])
    rerender()
    toast(`${label} reset`)
  }, "btn btn--ghost"))
}

// ── Comet AI ───────────────────────────────────────────────────────
const MODELS = [
  { id: "claude-opus-5-5", name: "Opus 5.5", note: "Smartest all-rounder." },
  { id: "claude-sonnet-5-5", name: "Sonnet 5.5", note: "Faster, still very capable." },
  { id: "claude-haiku-5-5", name: "Haiku 5.5", note: "Near-instant, cheapest." },
  { id: "claude-fable-5-1", name: "Fable 5.1", note: "Most capable. Premium price." }
]

function localGroups () {
  const statusRow = row("Ollama", h("span.tag", { text: "Checking…" }), "The free engine that runs models on your Mac.")
  const modelsBox = group("Your models", [row("", h("span.tag", { text: "Loading…" }))], "Click a model to use it. Models marked Tools can control the browser.")
  const getBox = group("Download a model", [], "Downloads come from ollama.com and stay on this Mac. 24 GB of memory runs up to ~14B models comfortably.")

  localStatus(true).then((st) => {
    // status
    const ctl = statusRow.querySelector(".control")
    const tagEl = st.running ? h("span.tag.ok", { text: `Running · v${st.version}` }) : st.installed ? h("span.tag", { text: "Not running" }) : h("span.tag.warn", { text: "Not installed" })
    ctl.replaceChildren(...[tagEl,
      !st.running && st.installed ? btn("Start", async () => { const r = await window.flux.ollama.start(); toast(r.ok ? "Ollama started" : r.text); rerender() }, "btn btn--accent") : null,
      !st.installed ? btn("Get Ollama", () => window.flux.openExternal("https://ollama.com/download"), "btn btn--accent") : null].filter(Boolean))

    // installed models
    const cur = state.get("ai.localModel")
    const box = modelsBox.querySelector(".set-box")
    box.replaceChildren(...(st.models.length ? st.models.map((m) => {
      const on = m.name === cur
      const r = h(`div.set-row.model-row${on ? ".is-on" : ""}`, { dataset: { search: `model ${m.name}` }, onclick: async (e) => {
        if (e.target.closest("button")) return
        await state.set("ai.localModel", m.name); rerender()
      } }, [
        h("span.model-check", {}, [on ? ico("check", 14) : null]),
        h("div.rtext", {}, [h("div.rlabel", {}, [shortName(m.name), " ", capsBadges(m)]), h("div.rdesc", { text: [m.params, fmtSize(m.size), m.quant].filter(Boolean).join(" · ") })]),
        h("div.control", {}, [h("button.tb-btn", { title: "Delete model", onclick: async () => {
          if (!confirm(`Delete ${m.name} from this Mac?`)) return
          await window.flux.ollama.remove(m.name); toast("Model deleted"); rerender()
        } }, [ico("trash", 14)])])
      ])
      return r
    }) : [row(st.running ? "No models yet" : "Start Ollama to see your models", null, st.running ? "Download one below — Qwen3 8B is a great first pick." : "")]))

    // downloads
    const have = new Set(st.models.map((m) => m.name))
    const gb = getBox.querySelector(".set-box")
    const custom = h("input.field", { type: "text", placeholder: "Any model, e.g. qwen3:32b", spellcheck: false })
    gb.replaceChildren(
      ...st.recommended.map((r) => row(`${r.label}${r.pick ? "  ·  Recommended" : ""}`, have.has(r.name) ? h("span.tag.ok", { text: "Installed" }) : getButton(r.name), `${r.size} — ${r.note}`)),
      row("Other model", [custom, btn("Get", () => { const n = custom.value.trim(); if (n) pullModel(n) }, "btn btn--pill")], "Browse ollama.com/library for more. Tool-capable models can drive the browser.")
    )
  })

  const ai = state.get("ai") ?? {}
  return [
    group("Engine", [statusRow]),
    modelsBox,
    getBox,
    group("Performance", [
      row("Memory for context", seg([{ v: 8192, label: "8K" }, { v: 16384, label: "16K" }, { v: 32768, label: "32K" }], Number(ai.localCtx) || 16384, (v) => state.set("ai.localCtx", Number(v))), "How much the model can read at once. More = longer pages and chats, more RAM."),
      row("Keep model loaded", seg([{ v: "5m", label: "5 min" }, { v: "15m", label: "15 min" }, { v: "1h", label: "1 hour" }, { v: "-1", label: "Always" }], ai.localKeepAlive ?? "15m", (v) => state.set("ai.localKeepAlive", v)), "Loaded models answer instantly but hold memory.")
    ])
  ]
}

function claudeGroups () {
  const ai = state.get("ai") ?? {}
  const keyStatus = h("span.tag", { text: "…" })
  window.flux.secrets.status().then((s) => { keyStatus.className = s.anthropic ? "tag ok" : "tag"; keyStatus.textContent = s.anthropic ? "Connected" : "No key" })
  const keyIn = h("input.field", { type: "password", placeholder: "sk-ant-…" })
  keyIn.addEventListener("change", async () => { if (keyIn.value.trim()) { await window.flux.secrets.set("anthropic", keyIn.value.trim()); keyIn.value = ""; toast("Claude connected"); rerender() } })
  return [
    group("Anthropic", [
      row("API key", [keyStatus, keyIn], "Encrypted with your macOS keychain. Usage is billed by Anthropic."),
      row("Get a key", btn("console.anthropic.com", () => window.flux.openExternal("https://console.anthropic.com/settings/keys"), "btn"))
    ]),
    group("Model", MODELS.map((m) => {
      const on = m.id === ai.model
      return h(`div.set-row.model-row${on ? ".is-on" : ""}`, { dataset: { search: `claude ${m.name}` }, onclick: () => { state.set("ai.model", m.id); rerender() } }, [
        h("span.model-check", {}, [on ? ico("check", 14) : null]),
        h("div.rtext", {}, [h("div.rlabel", { text: `Claude ${m.name}` }), h("div.rdesc", { text: m.note })])
      ])
    }))
  ]
}

export function catAI () {
  const ai = state.get("ai") ?? {}
  const local = (ai.provider ?? "local") === "local"
  const instr = h("textarea.field.is-area", { value: ai.customInstructions ?? "", placeholder: "e.g. Keep answers short. I'm a CS student. Prefer TypeScript examples." })
  instr.addEventListener("change", () => state.set("ai.customInstructions", instr.value))

  return [
    group(null, [
      row("Runs on", seg([{ v: "local", label: "This Mac · Free" }, { v: "claude", label: "Claude · Cloud" }], local ? "local" : "claude", (v) => { state.set("ai.provider", v); rerender() }),
        local ? "Private and free. Nothing you ask leaves your Mac (web searches excepted)." : "Smarter on hard problems. Needs an Anthropic API key, billed per use."),
      row("Your name", textField(state.get("user.name"), (v) => state.set("user.name", v), { placeholder: "So Comet AI knows you" }))
    ]),
    ...(local ? localGroups() : claudeGroups()),
    group("Behavior", [
      row("Thinking depth", seg([{ v: "low", label: "Quick" }, { v: "medium", label: "Balanced" }, { v: "high", label: "Deep" }], ["low", "medium"].includes(ai.effort) ? ai.effort : "high", (v) => state.set("ai.effort", v)), local ? "For thinking models (Qwen3, gpt-oss). Quick skips reasoning." : "Deeper is smarter, slower and pricier."),
      row("Search the web", sw(ai.webSearch !== false, (v) => state.set("ai.webSearch", v)), "Looks things up and cites sources."),
      row("Ask before clicking or typing on pages", sw(ai.confirmPageActions !== false, (v) => state.set("ai.confirmPageActions", v)), "Tab actions never ask. Password and payment fields are always off-limits."),
      row("Share the active tab with each message", sw(ai.autoContext !== false, (v) => state.set("ai.autoContext", v)), "Title and URL only, so “this page” just works."),
      row("Show thinking", sw(ai.showThinking !== false, (v) => state.set("ai.showThinking", v))),
      row("Return key in the address bar", sel([{ v: "smart", label: "Smart" }, { v: "search", label: "Always search" }, { v: "ai", label: "Always ask AI" }], ai.enterAction ?? "smart", (v) => state.set("ai.enterAction", v)), "Smart sends questions to Comet AI. ⌘↩ always does.")
    ]),
    group("Custom instructions", [block([instr], "custom instructions")], "Added to every conversation."),
    group("Data", [
      row("Chat history", btn("Delete All Chats…", async () => { if (!confirm("Delete every Comet AI chat?")) return; await window.flux.ai.clear(); toast("Chats deleted"); bus.emit("ai:new") }, "btn btn--danger"), "Stored locally in Comet's data folder."),
      restore("ai", "Comet AI")
    ])
  ]
}

// ── Motion ────────────────────────────────────────────────────────
const EASES = [
  ["spring", "Spring", "cubic-bezier(0.34, 1.42, 0.64, 1)"],
  ["smooth", "Smooth", "cubic-bezier(0.22, 1, 0.36, 1)"],
  ["snappy", "Snappy", "cubic-bezier(0.2, 0, 0, 1)"],
  ["gentle", "Gentle", "cubic-bezier(0.4, 0, 0.2, 1)"],
  ["bouncy", "Bouncy", null],
  ["physics", "Physics", null],
  ["linear", "Linear", "linear"],
  ["custom", "Custom", null]
]

function curveSvg (easing) {
  // sample a CSS easing with WAAPI to draw its curve
  const pts = []
  try {
    const probe = document.createElement("div")
    document.body.append(probe)
    const anim = probe.animate([{ transform: "translateX(0px)" }, { transform: "translateX(100px)" }], { duration: 1000, easing, fill: "both" })
    anim.pause()
    for (let i = 0; i <= 40; i++) {
      anim.currentTime = i * 25
      const m = new DOMMatrix(getComputedStyle(probe).transform)
      pts.push([i * 2.5, m.m41])
    }
    anim.cancel(); probe.remove()
  } catch {}
  const poly = pts.map(([x, y]) => `${x},${(70 - y * 0.5).toFixed(1)}`).join(" ")
  const ns = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(ns, "svg")
  svg.setAttribute("viewBox", "-2 -2 104 78")
  svg.classList.add("ease-curve")
  svg.innerHTML = `<line x1="0" y1="70" x2="100" y2="70" class="ax"/><line x1="0" y1="20" x2="100" y2="20" class="ax dash"/><polyline points="${poly}"/>`
  return svg
}

export function catMotion () {
  const m = state.get("motion") ?? {}
  const set = (k, v) => state.set(`motion.${k}`, v)
  const easingOf = (id) => id === "physics" ? springEasing(m.spring?.stiffness, m.spring?.damping).easing : id === "bouncy" ? springEasing(260, 9).easing : id === "custom" ? m.customEasing : EASES.find((e) => e[0] === id)?.[2]

  const easeGrid = h("div.ease-grid", { dataset: { search: "easing curve spring physics bounce" } }, EASES.map(([id, label]) => {
    const card = h(`button.ease-card${(m.easing ?? "spring") === id ? ".is-on" : ""}`, { onclick: () => { set("easing", id); rerender() } }, [
      curveSvg(easingOf(id) || "linear"),
      h("div.ease-track", {}, [h("i")]),
      h("span", { text: label })
    ])
    card.style.setProperty("--ease-preview", easingOf(id) || "linear")
    return card
  }))

  const physics = (m.easing === "physics") && [
    row("Stiffness", rng(m.spring?.stiffness ?? 170, 40, 500, 5, (v) => String(v), (v) => { set("spring", { ...(state.get("motion.spring") ?? {}), stiffness: v }); rerender() }), "Higher = quicker, tighter spring."),
    row("Damping", rng(m.spring?.damping ?? 16, 4, 60, 1, (v) => String(v), (v) => { set("spring", { ...(state.get("motion.spring") ?? {}), damping: v }); rerender() }), "Lower = more bounce.")
  ]
  const custom = m.easing === "custom" && row("Custom easing", textField(m.customEasing, (v) => { if (CSS.supports("transition-timing-function", v)) { set("customEasing", v); rerender() } else toast("Not a valid CSS easing") }, { wide: true, placeholder: "cubic-bezier(0.2, 0.8, 0.2, 1) or linear(…)" }), "Any CSS timing function, including linear() spring curves.")

  const pickRow = (label, key, options, desc) => row(label, sel(options.map((o) => ({ v: o, label: o[0].toUpperCase() + o.slice(1).replace("-", " ") })), m[key], (v) => set(key, v)), desc)

  return [
    group("Motion", [
      row("Animations", seg([{ v: "full", label: "Full" }, { v: "reduced", label: "Reduced" }, { v: "off", label: "Off" }], m.mode ?? "full", (v) => { set("mode", v); rerender() }), "Reduced keeps simple fades. Follows macOS “Reduce motion” automatically."),
      row("Duration", rng(m.speed ?? 1, 0.25, 3, 0.05, (v) => `${v.toFixed(2)}×`, (v) => set("speed", v)), "Scales every animation. Lower is snappier."),
      row("Preview", btn("Replay animations", () => { replayPreview(); toast("✨ That's your motion") }))
    ]),
    group("Easing curve", [easeGrid, ...(physics || []), custom].filter(Boolean)),
    group("Element animations", [
      pickRow("Tab opens", "tabOpen", ["pop", "grow", "slide", "fade", "none"]),
      pickRow("Tab closes", "tabClose", ["shrink", "fade", "slide", "none"]),
      pickRow("Switching views & tabs", "view", ["fade-up", "fade", "zoom", "blur", "slide", "none"]),
      pickRow("Panels (AI, sidebar)", "panel", ["slide", "scale", "fade", "none"]),
      pickRow("Menus & popovers", "popover", ["scale", "drop", "fade", "none"]),
      pickRow("Toasts", "toast", ["rise", "pop", "fade", "none"]),
      pickRow("Home entrance", "home", ["rise", "fade", "scale", "none"])
    ]),
    group("Effects", [
      row("Hover lift", rng(m.hoverLift ?? 2, 0, 8, 0.5, (v) => `${v}px`, (v) => set("hoverLift", v))),
      row("Press depth", rng(m.pressScale ?? 0.95, 0.85, 1, 0.01, (v) => `${Math.round((1 - v) * 100)}%`, (v) => set("pressScale", v))),
      row("Click ripples", sw(m.ripple !== false, (v) => set("ripple", v))),
      row("Glass spotlight", sw(m.spotlight !== false, (v) => set("spotlight", v)), "Light follows your cursor across glass."),
      row("Glass shimmer", sw(m.shimmer !== false, (v) => set("shimmer", v)), "A specular sweep when you hover glass."),
      row("Liquid lens refraction", sw(m.lens !== false, (v) => set("lens", v)), "Real refraction on the Home search pill."),
      row("Ambient background", seg([{ v: "off", label: "Off" }, { v: "slow", label: "Slow" }, { v: "medium", label: "Medium" }, { v: "fast", label: "Fast" }], m.ambient ?? "slow", (v) => set("ambient", v)), "The drifting nebula behind Home and panels."),
      row("Page load indicator", seg([{ v: "glow", label: "Glow" }, { v: "bar", label: "Bar" }, { v: "off", label: "Off" }], m.loadBar ?? "glow", (v) => set("loadBar", v)))
    ]),
    group(null, [restore("motion", "motion")])
  ]
}

// ── Layout ────────────────────────────────────────────────────────
// controls for the layout you're on; the other layout's are hidden, since
// they did nothing here (corner radius used to only reach Top tabs)
export function catLayout () {
  const l = state.get("layout") ?? {}
  const dia = (l.style ?? "dia") === "dia"
  const setStyle = (v) => { state.set("layout.style", v); setTimeout(rerender, 30) }
  const px = (v) => `${v}px`
  const aiWidth = row("AI panel width", rng(l.aiPanelWidth ?? 400, 320, 760, 10, px, (v) => { state.set("layout.aiPanelWidth", v); const p = document.getElementById("aipanel"); if (p) p.style.width = `${v}px` }))
  const common = [
    row("Bookmarks bar", sw(l.bookmarksBar !== false, (v) => state.set("layout.bookmarksBar", v)), "A row of your bookmarks under the toolbar, once you have some. ⌘D bookmarks a page; ⇧⌘B shows or hides the bar."),
    row("Show full URL in address bar", sw(!!l.showFullUrl, (v) => state.set("layout.showFullUrl", v)), "Off shows just the site and path until you click."),
    row("Peek at links with ⇧-click", sw(l.peek !== false, (v) => state.set("layout.peek", v)), "Opens the link in a sheet over the page: keep it as a tab, split it, or dismiss it. Off opens a new tab instead.")
  ]
  return [
    group("Layout", [
      row("Style", seg([{ v: "dia", label: "Vertical tabs" }, { v: "classic", label: "Top tabs" }], l.style ?? "dia", setStyle), "Vertical tabs is the clean Dia-style layout. Top tabs brings back the widget sidebar.")
    ]),
    dia && group("Sidebar", [
      row("Width", rng(l.vtabsWidth ?? 240, 190, 420, 2, px, (v) => state.set("layout.vtabsWidth", v)), "Or drag the sidebar's right edge. Double-click the edge to reset."),
      row("Tab rows", seg([{ v: "comfortable", label: "Comfortable" }, { v: "compact", label: "Compact" }], l.tabStyle ?? "comfortable", (v) => state.set("layout.tabStyle", v))),
      row("Preview on the active tab", sw(l.tabThumbs !== false, (v) => state.set("layout.tabThumbs", v)), "A small live picture of the page on the tab you're on."),
      row("Now Playing", sw(l.nowPlaying !== false, (v) => state.set("layout.nowPlaying", v)), "A player at the bottom of the sidebar for the tab playing sound: play / pause, mute, jump to it."),
      row("Hide sidebar", sw(!!l.vtabsCollapsed, (v) => state.set("layout.vtabsCollapsed", v)), "⌘B. Touch the left edge to peek at your tabs.")
    ], "Right-click a tab → Add Tab to New Group (⌥⌘G) to start a group. Drag tabs onto a group to file them; double-click a name to rename."),
    dia && group("Page", [
      row("Corner radius", rng(l.cardRadius ?? 12, 0, 28, 1, px, (v) => state.set("layout.cardRadius", v))),
      row("Margin", rng(l.cardGap ?? 8, 0, 24, 1, px, (v) => state.set("layout.cardGap", v)), "Space around the page card. 0 with a 0 radius fills the window edge to edge."),
      ...common,
      aiWidth
    ]),
    !dia && group("Top tabs", [
      row("Sidebar", seg([{ v: "shown", label: "Always" }, { v: "autohide", label: "Auto-hide" }, { v: "hidden", label: "Hidden" }], l.sidebar ?? "autohide", (v) => state.set("layout.sidebar", v)), "Auto-hide slides it in when you touch the left edge. ⌘B toggles."),
      row("Floating content frame", sw(l.frame !== false, (v) => state.set("layout.frame", v)), "Pages sit in an inset rounded glass frame."),
      row("Frame corner radius", rng(l.frameRadius ?? 14, 0, 28, 1, px, (v) => state.set("layout.frameRadius", v))),
      ...common,
      aiWidth
    ]),
    group(null, [restore("layout", "layout")])
  ].filter(Boolean)
}

// ── Privacy & Shield ──────────────────────────────────────────────
export function catPrivacy () {
  const p = state.get("privacy") ?? {}
  const stats = h("span.tag.ok", { text: "…" })
  window.flux.shield.stats().then((s) => { stats.textContent = `${s.total.toLocaleString()} blocked this session · ${s.domains} tracker domains` })
  const sites = Object.entries(state.get("siteSettings") ?? {}).filter(([, s]) => s.perms && Object.keys(s.perms).length)
  const permList = h("div", { style: { gridColumn: "1 / -1" }, dataset: { search: "site permissions camera microphone location notifications" } },
    sites.length
      ? sites.map(([host, s]) => h("div.set-row", {}, [
        h("div.rlabel", {}, [h("strong", { text: host }), h("span", { style: { color: "var(--f-text-dim)", marginLeft: "8px" }, text: Object.entries(s.perms).map(([k, v]) => `${k}: ${v}`).join(" · ") })]),
        h("div.control", {}, [btn("Reset", async () => {
          const all = { ...(state.get("siteSettings") ?? {}) }; all[host] = { ...all[host], perms: {} }
          await state.set("siteSettings", all); rerender()
        }, "btn btn--ghost")])
      ]))
      : [h("div.rdesc", { text: "No site has asked for permissions yet." })])
  return [
    group("Comet Shield", [
      row("Block trackers & ads", sw(p.blockTrackers !== false, (v) => state.set("privacy.blockTrackers", v)), "Blocks known ad networks and tracking beacons on every site. Pages you open always load."),
      row("Shield stats", stats),
      row("HTTPS-only", sw(!!p.httpsOnly, (v) => state.set("privacy.httpsOnly", v)), "Upgrades http:// pages to https:// (local addresses excluded)."),
      row("Send Global Privacy Control", sw(p.sendGpc !== false, (v) => state.set("privacy.sendGpc", v)), "Tells sites not to sell or share your data (GPC + DNT headers)."),
      row("Google sign-in fix", sw(p.googleSignInFix !== false, (v) => state.set("privacy.googleSignInFix", v)), "Google turns away browsers built like Comet (“This browser or app may not be secure”). Comet hides its name from most sites so they don't block it, and that disguise is what Google rejects. With this on, accounts.google.com sees Comet's real browser ID, which Google accepts. Every other site is unchanged.")
    ]),
    group("History", [
      row("Remember browsing history", sw(p.recordHistory !== false, (v) => state.set("privacy.recordHistory", v)), "Powers address-bar suggestions and the Library. Stored only on this Mac."),
      row("Clear history", btn("Clear all history", async () => { await window.flux.history.clear({}); toast("History cleared") }, "btn btn--danger"))
    ]),
    group("Site permissions", [permList])
  ]
}

// ── Search keywords ("yt cats") ───────────────────────────────────
export function catKeywords () {
  const list = state.get("keywords") ?? []
  const wrap = h("div", { style: { gridColumn: "1 / -1" }, dataset: { search: "keywords bang shortcut search youtube github" } })
  const paint = () => {
    clear(wrap)
    for (const [i, k] of list.entries()) {
      const key = h("input", { type: "text", value: k.key, style: { minWidth: "70px", width: "70px" } })
      const name = h("input", { type: "text", value: k.name, style: { minWidth: "130px", width: "130px" } })
      const url = h("input", { type: "text", value: k.url, style: { minWidth: "300px", flex: "1" } })
      const commit = () => { list[i] = { key: key.value.trim(), name: name.value.trim(), url: url.value.trim() }; state.set("keywords", list.filter((x) => x.key && x.url.includes("%s"))) }
      ;[key, name, url].forEach((x) => x.addEventListener("change", commit))
      wrap.append(h("div.kw-row", {}, [key, name, url, h("button.tb-btn", { title: "Remove", onclick: () => { list.splice(i, 1); state.set("keywords", list); paint() } }, [ico("trash", 14)])]))
    }
    wrap.append(btn("Add keyword", () => { list.push({ key: "new", name: "New", url: "https://example.com/search?q=%s" }); paint() }, "btn btn--ghost"))
  }
  paint()
  return [group("Search keywords", [wrap], "Type a keyword then your query in the address bar — e.g. “yt lofi beats”, “gh electron”. %s is where the query goes.")]
}
