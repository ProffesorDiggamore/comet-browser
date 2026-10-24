// ───────────────────────────────────────────────────────────────────
//  settings.js — overhauled: category rail + filterable content,
//  glass cards, segmented controls, engine picker, live perf table.
//  Every control writes straight through state.set() / secrets.
// ───────────────────────────────────────────────────────────────────
import { h, clear } from "../core/dom.js"
import { state } from "../core/state.js"
import { bus, toast } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { sfx } from "../audio/sfx.js"
import { ENGINES } from "../data/engines.js"
import { THEMES, themeById } from "../data/themes.js"
import { wallpaperPicker } from "./home.js"
import { allPacks, applyPack, installPack, exportCurrent } from "../modpacks/index.js"
import { watchMetrics } from "../core/perf.js"
import * as T from "../core/tabs.js"

import { group, row, seg, sw, rng, textField, btn } from "./settings/kit.js"
import { initShell } from "./settings/shell.js"
import { catAI, catMotion, catLayout, catKeywords, catPrivacy as catShield } from "./settings/extra.js"

// ── categories ────────────────────────────────────────────────────
function catSearch () {
  const id = state.get("general.searchEngineId")
  const grid = h("div.engine-grid", {}, ENGINES.map((e) => h("button", {
    class: e.id === id ? "engine is-on" : "engine",
    onclick: () => { state.set("general.searchEngineId", e.id); bus.emit("settings:rerender") }
  }, [
    h("span.dot", { style: { background: e.hue }, text: e.name[0] }),
    h("span.en-name", { text: e.name }),
    h("span.en-check", {}, [ico("check", 16)])
  ])))
  return [
    group("Default search engine", [
      h("div.set-row", { dataset: { search: "search engine google duckduckgo bing brave" } }, [grid]),
      id === "custom" && row("Custom search URL", textField(state.get("general.customSearchUrl"), (v) => state.set("general.customSearchUrl", v), { wide: true, placeholder: "https://example.com/?q=%s" }), "Use %s where the query goes.")
    ]),
    group("Tabs", [
      row("New tab opens", seg([{ v: "end", label: "At the end" }, { v: "afterCurrent", label: "Next to current" }], state.get("general.newTabPosition"), (v) => state.set("general.newTabPosition", v))),
      row("Show Home on new tab", sw(state.get("general.homeOnNewTab"), (v) => state.set("general.homeOnNewTab", v))),
      row("Restore tabs on launch", sw(state.get("general.restoreTabs"), (v) => state.set("general.restoreTabs", v))),
      row("Easy Files uploads", sw(state.get("general.easyFiles") !== false, (v) => state.set("general.easyFiles", v)), "When a site asks for a file, offer what you copied and your recent downloads first. Applies to pages loaded after the change."),
      row("Default page zoom", rng(state.get("general.defaultZoom") ?? 1, 0.5, 2, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => state.set("general.defaultZoom", v)), "Applied to newly opened tabs.")
    ])
  ]
}

function themeGrid (active) {
  const card = (t) => h(`button.theme-card${t.id === active ? ".is-on" : ""}`, {
    title: t.family === "classic" ? `${t.name} — ${t.mode ?? "dark"} only` : `${t.name} — light & dark`,
    onclick: () => { state.set("theme.active", t.id); state.set("theme.accentCustom", false); bus.emit("settings:rerender") }
  }, [
    h("span.theme-sw", {}, [
      h("i", { style: { background: t.sw[0] } }),
      h("i", { style: { background: t.sw[1] } }),
      h("b", { style: { background: t.sw[2] } })
    ]),
    h("span.theme-name", { text: t.name })
  ])
  return [
    h("div.set-row", { dataset: { search: "theme color light dark glass sky mint sunset rose lavender sand mono" } }, [h("div.theme-grid", {}, THEMES.filter((t) => t.family === "modern").map(card))]),
    h("div.set-row", { dataset: { search: "classic dark theme nebula ember midnight aurora carbon blackline noir" } }, [
      h("div.theme-block", {}, [
        h("div.micro", { text: "Classic · one fixed look each" }),
        h("div.theme-grid.is-classic", {}, THEMES.filter((t) => t.family === "classic").map(card))
      ])
    ])
  ]
}

function catAppearance () {
  const t = state.get("theme")
  const classic = themeById(t.active).family === "classic"
  const accent = h("input", { type: "color", value: t.accent })
  accent.addEventListener("input", () => { state.set("theme.accent", accent.value); state.set("theme.accentCustom", true) })
  const css = h("textarea", { value: t.customCss ?? "", style: { minHeight: "84px", fontFamily: "monospace", minWidth: "340px" } })
  css.addEventListener("change", () => state.set("theme.customCss", css.value))
  return [
    group("Appearance", [
      row("Mode", seg([{ v: "auto", label: "Auto" }, { v: "light", label: "Light" }, { v: "dark", label: "Dark" }], classic ? themeById(t.active).mode ?? "dark" : t.mode ?? "auto", (v) => {
        if (classic) state.set("theme.active", "glass")
        state.set("theme.mode", v); bus.emit("settings:rerender")
      }), classic ? "Classic themes have one fixed look — picking a mode switches to Glass." : "Auto follows macOS. Websites follow along too."),
      ...themeGrid(t.active),
      row("Density", seg([{ v: "comfortable", label: "Comfortable" }, { v: "compact", label: "Compact" }], t.density ?? "comfortable", (v) => state.set("theme.density", v)), "Compact tightens spacing across the whole UI."),
      row("Accent color", [accent, t.accentCustom && btn("Use theme color", () => { state.set("theme.accentCustom", false); bus.emit("settings:rerender") }, "btn btn--plain")])
    ]),
    group("Liquid glass", [
      row("macOS window glass", sw(t.vibrancy !== false, (v) => { state.set("theme.vibrancy", v); window.flux.win.vibrancy(v) }), "Your real desktop shows through the sidebar, blurred — like Apple's own apps."),
      row("Translucency", rng(t.glass, 0.3, 1, 0.02, (v) => `${Math.round(v * 100)}%`, (v) => state.set("theme.glass", v))),
      row("Backdrop blur", rng(t.blur, 0, 60, 1, (v) => `${v}px`, (v) => state.set("theme.blur", v)))
    ]),
    group("Advanced", [
      row("Custom CSS", css, "Injected globally. Great for one-off tweaks and shared themes.")
    ]),
    group(null, [restoreRow("theme")])
  ]
}

function catHome () {
  return [
    group("Wallpaper & widgets", [
      h("div.set-row", { dataset: { search: "wallpaper background photo desktop picture home widgets dim style frosted liquid solid tinted clear" } }, [wallpaperPicker()])
    ]),
    group("Home screen", [
      row("Search field", sw(state.get("home.showSearch") !== false, (v) => state.set("home.showSearch", v))),
      row("24-hour clock", sw(state.get("home.clock24") === true, (v) => state.set("home.clock24", v))),
      row("Temperature", seg([{ v: "f", label: "°F" }, { v: "c", label: "°C" }], state.get("home.tempUnit") ?? "f", (v) => state.set("home.tempUnit", v))),
      row("Your name", textField(state.get("user.name"), (v) => state.set("user.name", v), { placeholder: "Used by Flux AI" })),
      row("Widgets", btn("Reset to default widgets", async () => {
        const d = await window.flux.config.defaults()
        state.set("home.widgets", d.home.widgets); toast("Widgets reset")
      }, "btn btn--ghost"), "Add, remove, resize and reorder from Home → Edit Widgets.")
    ])
  ]
}

function catModpacks () {
  const active = state.get("modpacks.active")
  return [
    group("Modpacks", [
      h("div.set-row", { dataset: { search: "modpack theme pack" } }, [
        h("div.control", { style: { flexWrap: "wrap", justifySelf: "start", gridColumn: "1 / -1" } },
          allPacks().map((p) => btn(p.name, () => applyPack(p.id), p.id === active ? "btn btn--accent" : "btn")))
      ]),
      row("Import / export", [
        btn("Import…", async () => { const r = await window.flux.pick.jsonOpen("Import modpack"); if (r.ok) { await installPack(r.data); bus.emit("settings:rerender") } }, "btn btn--ghost"),
        btn("Export current look", async () => { const r = await window.flux.pick.jsonSave("flux-modpack.json", exportCurrent()); if (r.ok) toast("Exported") }, "btn btn--ghost")
      ], "A modpack bundles theme + audio + background as one portable JSON file.")
    ])
  ]
}

function catAudio () {
  const a = state.get("audio")
  return [
    group("UI sound", [
      row("Enable UI sounds", sw(a.enabled, (v) => state.set("audio.enabled", v))),
      row("Sound pack", seg([{ v: "mech", label: "Mechanical" }, { v: "soft", label: "Soft" }, { v: "off", label: "Silent" }], a.pack, (v) => state.set("audio.pack", v))),
      row("Volume", rng(a.volume, 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => state.set("audio.volume", v))),
      row("Play on…", [h("div.control", { style: { flexWrap: "wrap" } }, Object.keys(a.events).map((k) =>
        h("label", { style: { display: "flex", gap: "6px", alignItems: "center" } }, [sw(a.events[k], (v) => state.set(`audio.events.${k}`, v)), h("span", { text: k })])))]),
      row("Preview", btn("Test sound", () => sfx.play("click")))
    ])
  ]
}

let visionStatus = {}

function catVision () {
  const v = state.get("vision")
  const keyRows = ["anthropic", "openai", "gemini"].map((p) => {
    const input = h("input", { type: "password", placeholder: `Paste ${p} key`, style: { minWidth: "260px" } })
    input.addEventListener("change", async () => { if (input.value) { await window.flux.secrets.set(p, input.value); input.value = ""; toast(`${p} key saved`); bus.emit("settings:rerender") } })
    return h("div.set-row", { dataset: { search: `api key ${p}` } }, [
      h("div.rlabel", { text: p }),
      h("div.control", {}, [
        h("span.tag", { class: visionStatus[p] ? "tag ok" : "tag", text: visionStatus[p] ? "set" : "none" }),
        input,
        btn("Clear", async () => { await window.flux.secrets.set(p, ""); toast(`${p} cleared`); bus.emit("settings:rerender") }, "btn btn--ghost")
      ])
    ])
  })
  return [
    group("Provider", [
      row("Active model", seg([{ v: "anthropic", label: "Anthropic" }, { v: "openai", label: "OpenAI" }, { v: "gemini", label: "Gemini" }], v.provider, (val) => state.set("vision.provider", val))),
      h("div.rdesc", { text: "Keys are encrypted at rest (OS keychain) and never exposed to the page. The Companion uses the Anthropic key too." })
    ]),
    group("API keys", keyRows),
    group("Capture", [
      row("Screenshot scope", seg([{ v: "page", label: "Browser page" }, { v: "screen", label: "Whole screen" }], v.captureScope, (val) => state.set("vision.captureScope", val)), "Whole-screen needs macOS Screen Recording permission."),
      row("Global capture hotkey", textField(v.hotkey, (val) => state.set("vision.hotkey", val), { placeholder: "CmdOrCtrl+Shift+Space" }))
    ])
  ]
}

function catCompanion () {
  const c = state.get("companion")
  return [
    group("Self-coding companion", [
      row("Model (Anthropic)", textField(c.model, (v) => state.set("companion.model", v))),
      row("Project folder", [
        h("span.tag", { text: (c.projectPath || "Flux source").split("/").slice(-2).join("/") }),
        btn("Change…", async () => { const r = await window.flux.companion.setProject(); if (r.ok) bus.emit("settings:rerender") }, "btn btn--ghost")
      ], "The agent can read/search/write anything under this folder."),
      row("Autonomous writes", sw(c.autonomous, (v) => state.set("companion.autonomous", v)), "Off = every file write shows an Approve bar first.")
    ])
  ]
}

function catPerformance () {
  const p = state.get("perf")
  const procWrap = h("div.proc", { dataset: { search: "task manager memory cpu processes ram" } }, [h("div.set-empty", { text: "Reading process metrics…" })])
  // live table
  const stop = watchMetrics((rows) => {
    if (!procWrap.isConnected) { stop(); return }
    const sorted = [...rows].sort((a, b) => b.memMB - a.memMB).slice(0, 14)
    clear(procWrap)
    procWrap.append(h("table", {}, [
      h("thead", {}, [h("tr", {}, [h("th", { text: "Process" }), h("th", { text: "PID" }), h("th.num", { text: "CPU %" }), h("th.num", { text: "Memory" })])]),
      h("tbody", {}, sorted.map((r) => h(`tr${r.cpu > 25 ? ".hot" : ""}`, {}, [
        h("td", { text: r.type + (r.name ? ` · ${r.name}` : "") }),
        h("td", { text: r.pid }),
        h("td.num", { text: r.cpu.toFixed(1) }),
        h("td.num", { text: `${r.memMB} MB` })
      ])))
    ]))
    const total = rows.reduce((s, r) => s + r.memMB, 0)
    procWrap.append(h("div.rdesc", { text: `${rows.length} processes · ${(total / 1024).toFixed(1)} GB total` }))
  })

  return [
    group("Tab sleeping", [
      row("Sleep idle background tabs", sw(p.sleepEnabled, (v) => state.set("perf.sleepEnabled", v)), "Unloads tabs you haven't touched to free memory. They reload instantly when clicked."),
      row("Sleep after", rng(p.sleepAfterMin, 2, 60, 1, (v) => `${v} min`, (v) => state.set("perf.sleepAfterMin", v))),
      row("Right now", btn("Sleep all background tabs", () => { T.sleepAllBackground(); toast("Background tabs slept") }))
    ]),
    group("Rendering", [
      row("Frame-rate cap", seg([{ v: 0, label: "Uncapped" }, { v: 30, label: "30 FPS" }, { v: 60, label: "60 FPS" }], Number(p.fpsCap) || 0, (v) => { state.set("perf.fpsCap", Number(v)); toast("Applies to new tabs") }), "Lower cap = less GPU/battery. Opera-GX style limiter."),
      row("Block media autoplay", sw(p.blockAutoplay, (v) => { state.set("perf.blockAutoplay", v); T.refreshPerfFlags(); toast("Applies to new tabs") })),
      row("Throttle background tabs", sw(p.backgroundThrottle, (v) => { state.set("perf.backgroundThrottle", v); T.refreshPerfFlags() }), "Pauses timers/animation in hidden tabs."),
      row("Hardware acceleration", [
        sw(p.hardwareAccel, (v) => state.set("perf.hardwareAccel", v)),
        btn("Restart Flux", () => window.flux.app.restart(), "btn btn--ghost")
      ], "GPU rendering. Turning off can fix flicker on some machines. Needs a restart.")
    ]),
    group("Process monitor", [procWrap])
  ]
}

function catExtensions () {
  const wrap = h("div", { dataset: { search: "extensions chrome" }, style: { gridColumn: "1 / -1" } }, [h("div.rdesc", { text: "Loading…" })])
  window.flux.extensions.list().then((exts) => {
    clear(wrap)
    wrap.append(...(exts.length
      ? exts.map((x) => h("div.set-row", {}, [h("div.rlabel", { text: `${x.name} · ${x.version}` }), h("div.control", {}, [btn("Remove", async () => { await window.flux.extensions.remove(x.id); bus.emit("settings:rerender") }, "btn btn--ghost")])]))
      : [h("div.rdesc", { text: "No extensions loaded." })]))
    wrap.append(h("div.set-row", {}, [h("div.rlabel", { text: "Add" }), h("div.control", {}, [btn("Load unpacked folder…", async () => { const r = await window.flux.extensions.add(); if (r.ok) { toast(`Loaded ${r.ext.name}`); bus.emit("settings:rerender") } else if (r.text) toast(r.text) })])]))
  })
  return [group("Extensions", [wrap, h("div.rdesc", { text: "Electron supports a useful subset of Chrome MV2/MV3. Loaded folders are remembered across launches." })])]
}

const SHORTCUTS = [
  ["Ask Flux AI", "⌘J"], ["Ask about this page", "⇧⌘J"], ["New AI chat", "⌥⌘J"], ["Command palette", "⌘K"],
  ["New tab", "⌘T"], ["Close tab", "⌘W"], ["Reopen closed tab", "⇧⌘T"], ["Next / previous tab", "⌃Tab / ⌃⇧Tab"],
  ["Focus address bar", "⌘L"], ["Reload page", "⌘R"], ["Reload Flux UI", "⇧⌘R"], ["Back / Forward", "⌘[  /  ⌘]"],
  ["Find in page", "⌘F"], ["Bookmark page", "⌘D"], ["History", "⌘Y"], ["Bookmarks", "⌥⌘B"], ["Downloads", "⌥⌘L"],
  ["Tab overview", "⇧⌘\\"], ["Split view", "⌘\\"], ["Reader mode", "⌥⌘R"], ["Picture in picture", "⌥⌘P"],
  ["Mute tab", "⌃M"], ["Save screenshot", "⇧⌘S"], ["Zoom in / out / reset", "⌘+  /  ⌘-  /  ⌘0"], ["Focus mode", "⇧⌘F"],
  ["Toggle sidebar", "⌘B"], ["Home", "⇧⌘H"], ["Settings", "⌘,"], ["Vision capture (global)", "⇧⌘Space"],
  ["Inspect page", "⌥⌘I"], ["Omnibox: ask AI", "⌘⏎ or Tab"], ["Omnibox: open in new tab", "⌥⏎"]
]
function catShortcuts () {
  return [group("Keyboard shortcuts", [
    h("div.kbd-list", { dataset: { search: "shortcuts keyboard hotkeys" } },
      SHORTCUTS.map(([k, v]) => h("div", {}, [h("span", { text: k }), h("kbd", { text: v })])))
  ])]
}

function catPrivacy () {
  const kinds = { cache: true, cookies: false, storage: false, history: false }
  const boxes = Object.keys(kinds).map((k) =>
    h("label", { style: { display: "flex", gap: "6px", alignItems: "center" } }, [
      h("input", { type: "checkbox", checked: kinds[k], onchange: (e) => { kinds[k] = e.target.checked } }),
      h("span", { text: k === "storage" ? "site data (localStorage, IndexedDB)" : k })
    ]))
  return [
    group("Clear browsing data", [
      h("div.set-row", { dataset: { search: "clear cache cookies history site data privacy" } }, [
        h("div.control", { style: { flexWrap: "wrap", justifySelf: "start", gridColumn: "1 / -1", gap: "16px" } }, boxes)
      ]),
      row("", btn("Clear now", async () => {
        const r = await window.flux.web.clearData(kinds)
        toast(r.ok ? "Cleared" : `Failed: ${r.text}`)
      }, "btn btn--danger"))
    ]),
    group("Reset", [
      row("Restore every setting to defaults", btn("Reset all settings", async () => {
        const d = await window.flux.config.defaults()
        await state.merge(d)
        bus.emit("settings:rerender")
        toast("Settings reset")
      }, "btn btn--danger"), "Does not touch saved API keys.")
    ])
  ]
}

function catAbout () {
  const info = h("div", { dataset: { search: "about version paths" } })
  window.flux.info().then((i) => {
    clear(info)
    info.append(
      h("div.rdesc", { text: `Flux · source: ${i.root}` }),
      h("div.rdesc", { text: `Config file: ${i.config}` })
    )
  })
  return [group("About", [info, row("Reload the UI", btn("Reload (⇧⌘R)", () => window.flux.reloadUi(), "btn btn--ghost"))])]
}

// ── passwords vault ──────────────────────────────────────────────
function catPasswords () {
  const list = h("div", { dataset: { search: "passwords vault login credentials" }, style: { gridColumn: "1 / -1" } }, [h("div.rdesc", { text: "Loading vault…" })])
  const addForm = h("div", { style: { gridColumn: "1 / -1", display: "none", gap: "8px", flexWrap: "wrap", marginTop: "8px" } })

  window.flux.vault.list().then((entries) => {
    clear(list)
    if (!entries.length) list.append(h("div.rdesc", { text: "No saved passwords yet. Import them from another browser below, or add one manually." }))
    entries.sort((a, b) => (a.host || "").localeCompare(b.host || "")).forEach((e) => {
      const pwField = h("code", { style: { fontSize: "12px", color: "var(--f-text-dim)" }, text: "••••••••••" })
      let shown = false
      const revealBtn = h("button.tb-btn", { title: "Reveal", onclick: async () => {
        shown = !shown
        pwField.textContent = shown ? (await window.flux.vault.reveal(e.id)) || "(empty)" : "••••••••••"
        revealBtn.replaceChildren(ico(shown ? "eyeoff" : "eye", 15))
        if (shown) setTimeout(() => { if (shown) revealBtn.click() }, 12_000)
      } }, [ico("eye", 15)])
      list.append(h("div.set-row", { dataset: { search: `${e.host} ${e.username} ${e.source}` } }, [
        h("div.rlabel", {}, [h("strong", { text: e.host || e.url }), h("span", { style: { color: "var(--f-text-dim)", marginLeft: "8px" }, text: e.username || "(no username)" }), h("div", { style: { marginTop: "3px" } }, [pwField])]),
        h("div.control", {}, [
          revealBtn,
          h("button.tb-btn", { title: "Copy username", onclick: () => { navigator.clipboard.writeText(e.username || ""); toast("Username copied") } }, [ico("copy", 15)]),
          h("button.tb-btn", { title: "Copy password", onclick: async () => { navigator.clipboard.writeText(await window.flux.vault.reveal(e.id)); toast("Password copied") } }, [ico("key", 15)]),
          h("button.tb-btn", { title: "Delete", onclick: async () => { await window.flux.vault.remove(e.id); bus.emit("settings:rerender") } }, [ico("trash", 15)])
        ])
      ]))
    })
    list.append(h("div.rdesc", { text: `${entries.length} saved · encrypted at rest with the OS keychain · never leaves this Mac.` }))
  })

  const uf = h("input", { type: "url", placeholder: "https://site.com", style: { minWidth: "200px" } })
  const un = h("input", { type: "text", placeholder: "username", style: { minWidth: "160px" } })
  const up = h("input", { type: "password", placeholder: "password", style: { minWidth: "160px" } })
  addForm.append(uf, un, up, btn("Save", async () => {
    if (!uf.value) return toast("Need a URL")
    await window.flux.vault.add({ url: uf.value, username: un.value, password: up.value, source: "manual" })
    uf.value = un.value = up.value = ""
    bus.emit("settings:rerender")
  }, "btn btn--accent"))

  return [
    group("Saved passwords", [
      h("div.set-row", {}, [h("div.control", { style: { gridColumn: "1 / -1", justifySelf: "start", gap: "8px" } }, [
        btn("Import from another browser…", () => bus.emit("settings:goto", "import")),
        btn("Add manually", () => { addForm.style.display = addForm.style.display === "none" ? "flex" : "none" }, "btn btn--ghost")
      ])]),
      addForm,
      list
    ]),
    group("Danger zone", [
      row("Delete every saved password", btn("Clear vault", async () => { await window.flux.vault.clear(); bus.emit("settings:rerender"); toast("Vault cleared") }, "btn btn--danger"))
    ])
  ]
}

// ── import from Opera GX / other browsers ─────────────────────────
function catImport () {
  const wrap = h("div", { dataset: { search: "import opera gx chrome brave edge passwords bookmarks history" }, style: { gridColumn: "1 / -1" } }, [h("div.rdesc", { text: "Looking for installed browsers…" })])
  const out = h("div", { style: { gridColumn: "1 / -1", marginTop: "10px" } })

  window.flux.import.sources().then((sources) => {
    const present = sources.filter((s) => s.present)
    clear(wrap)
    if (!present.length) { wrap.append(h("div.rdesc", { text: "No supported browser profiles found on this Mac." })); return }

    let sourceId = present.find((s) => s.id === "operagx")?.id ?? present[0].id
    const kinds = { passwords: true, bookmarks: true, history: false }

    const srcSeg = h("div.seg", {}, present.map((s) => h("button", {
      class: s.id === sourceId ? "is-on" : "",
      onclick: () => { sourceId = s.id; [...srcSeg.children].forEach((b, i) => b.classList.toggle("is-on", present[i].id === sourceId)) }
    }, s.name)))

    const checks = Object.keys(kinds).map((k) => h("label", { style: { display: "flex", gap: "6px", alignItems: "center" } }, [
      h("input", { type: "checkbox", checked: kinds[k], onchange: (e) => { kinds[k] = e.target.checked } }), h("span", { text: k })
    ]))

    wrap.append(
      h("div.set-row", {}, [h("div.rlabel", { text: "Source browser" }), h("div.control", {}, [srcSeg])]),
      h("div.set-row", {}, [h("div.rlabel", { text: "What to import" }), h("div.control", { style: { gap: "14px" } }, checks)]),
      h("div.rdesc", { text: "macOS will ask permission to read the source browser's keychain item — click Allow. Everything is decrypted and stored locally; nothing is uploaded." }),
      h("div.set-row", {}, [h("div.control", { style: { gridColumn: "1 / -1", justifySelf: "start" } }, [
        btn("Import now", async () => {
          out.replaceChildren(h("div.rdesc", { text: "Importing… (approve the macOS keychain prompt if it appears)" }))
          const r = await window.flux.import.run({ sourceId, kinds })
          renderResult(r)
        }, "btn btn--accent")
      ])])
    )

    function renderResult (r) {
      clear(out)
      const lines = []
      if (r.passwords) lines.push(h("div", { text: `Passwords: ${r.passwords.added} added, ${r.passwords.updated} updated (vault now ${r.passwords.total}).` }))
      if (r.bookmarks?.length) lines.push(h("div", { text: `Bookmarks: ${r.bookmarks.length} read.` }))
      if (r.history?.length) lines.push(h("div", { text: `History: ${r.history.length} top sites read.` }))
      r.errors?.forEach((e) => lines.push(h("div.danger", { text: e })))
      out.append(group("Result", [
        ...lines.map((l) => h("div.set-row", {}, [l])),
        (r.bookmarks?.length || r.history?.length) ? h("div.set-row", {}, [h("div.control", { style: { gridColumn: "1 / -1", justifySelf: "start", gap: "8px", flexWrap: "wrap" } }, [
          r.bookmarks?.length ? btn(`Create ${Math.min(10, r.bookmarks.length)} Hot Tabs`, () => hotTabsFrom(r.bookmarks.slice(0, 10))) : null,
          r.bookmarks?.length ? btn("Add all as sidebar Links widget", () => linksWidgetFrom(r.bookmarks.slice(0, 40)), "btn btn--ghost") : null,
          r.history?.length ? btn("Top 8 history → Hot Tabs", () => hotTabsFrom(r.history.slice(0, 8)), "btn btn--ghost") : null
        ].filter(Boolean))]) : null
      ]))
    }
  })

  async function hotTabsFrom (items) {
    const cur = state.get("hotTabs") ?? []
    const add = items.map((b, i) => ({ id: `ht_imp_${Date.now().toString(36)}_${i}`, label: (b.title || b.url).slice(0, 22), url: b.url, icon: null, hotkey: "", action: "open" }))
    await state.set("hotTabs", [...cur, ...add])
    toast(`Added ${add.length} Hot Tabs`)
  }
  async function linksWidgetFrom (items) {
    const w = state.get("sidebar.widgets") ?? []
    w.push({ id: `w_imp_${Date.now().toString(36)}`, type: "links", label: "Imported", links: items.map((b) => ({ label: (b.title || b.url).slice(0, 28), url: b.url })) })
    await state.set("sidebar.widgets", w)
    toast("Added Links widget to the sidebar")
  }

  return [group("Import browser data", [wrap, out])]
}

function restoreRow (branch) {
  return row(`Restore ${branch} defaults`, btn("Restore", async () => {
    const d = await window.flux.config.defaults()
    await state.set(branch, d[branch])
    bus.emit("settings:rerender")
    toast(`${branch} reset`)
  }, "btn btn--ghost"))
}

const CATS = [
  { id: "search", label: "Search & Tabs", icon: "search", render: () => [...catSearch(), ...catKeywords()] },
  { id: "appearance", label: "Appearance", icon: "palette", render: catAppearance },
  { id: "passwords", label: "Passwords", icon: "key", render: catPasswords },
  { id: "import", label: "Import Data", icon: "download", render: catImport },
  { id: "home", label: "Home Screen", icon: "home", render: catHome },
  { id: "modpacks", label: "Modpacks", icon: "layers", render: catModpacks },
  { id: "audio", label: "Sound", icon: "volume", render: catAudio },
  { id: "ai", label: "Flux AI", icon: "spark", render: catAI },
  { id: "motion", label: "Motion", icon: "bolt", render: catMotion },
  { id: "layout", label: "Layout", icon: "sidebar", render: catLayout },
  { id: "vision", label: "API Keys & Vision", icon: "eye", render: catVision },
  { id: "companion", label: "Companion", icon: "spark", render: catCompanion },
  { id: "perf", label: "Performance", icon: "gauge", render: catPerformance },
  { id: "extensions", label: "Extensions", icon: "puzzle", render: catExtensions },
  { id: "shortcuts", label: "Shortcuts", icon: "bolt", render: catShortcuts },
  { id: "privacy", label: "Privacy & Shield", icon: "shield", render: () => [...catShield(), ...catPrivacy()] },
  { id: "about", label: "About", icon: "info", render: catAbout }
]

// ── shell (System Settings layout lives in settings/shell.js) ──────
export function initSettings () { initShell(CATS) }
