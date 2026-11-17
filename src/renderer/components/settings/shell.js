// ───────────────────────────────────────────────────────────────────
//  settings/shell.js — the Settings window, laid out like macOS System
//  Settings: a floating glass sidebar (search, profile card, grouped
//  categories with colored squircle icons) and a content column with a
//  hero header and grouped inset lists.  Search filters every row.
// ───────────────────────────────────────────────────────────────────
import { h, mount } from "../../core/dom.js"
import { bus } from "../../core/bus.js"
import { ico } from "../../core/icons.js"
import { tile } from "./kit.js"
import { catGlyph } from "./glyphs.js"
import { avatar, currentProfile, allProfiles } from "../profiles.js"

export const META = {
  profiles: { tint: "#64D2FF", group: "General", desc: "Separate worlds for school, work and home: each has its own tabs, bookmarks, history, logins and look." },
  search: { tint: "#0A84FF", group: "General", desc: "Search engine, keyword shortcuts and how new tabs behave." },
  home: { tint: "#5E5CE6", group: "General", desc: "Your New Tab page — greeting, background and shortcuts." },
  layout: { tint: "#40C8E0", group: "General", desc: "Sidebar, tab rows, groups and the page card." },
  appearance: { tint: "#BF5AF2", group: "Look & Feel", desc: "Theme, live Style pattern, accent color and the liquid glass material." },
  motion: { tint: "#FF9F0A", group: "Look & Feel", desc: "Every animation in Comet — speed, curves and effects." },
  modpacks: { tint: "#30D158", group: "Look & Feel", desc: "One-click looks: theme, sound and background together." },
  audio: { tint: "#FF375F", group: "Look & Feel", desc: "Interface sounds." },
  ai: { tint: "#8E8E93", group: "Intelligence", desc: "Your built-in assistant. Runs free on this Mac, or with Claude." },
  vision: { tint: "#8E8E93", group: "Intelligence", desc: "API keys for cloud models." },
  privacy: { tint: "#0A84FF", group: "Privacy & Security", desc: "Tracker blocking, HTTPS, history and site permissions." },
  passwords: { tint: "#8E8E93", group: "Privacy & Security", desc: "Saved logins, encrypted with your macOS keychain." },
  import: { tint: "#64D2FF", group: "Privacy & Security", desc: "Bring passwords, bookmarks and history from another browser." },
  perf: { tint: "#30D158", group: "System", desc: "Tab sleeping, frame rate and live process usage." },
  extensions: { tint: "#FFD60A", group: "System", desc: "Chrome extensions loaded from a folder." },
  shortcuts: { tint: "#8E8E93", group: "System", desc: "Every keyboard shortcut in Comet." },
  backup: { tint: "#30B0C7", group: "System", desc: "Save every setting to one file, or bring a saved setup back." },
  about: { tint: "#8E8E93", group: "System", desc: "Version, data folder and the Welcome tour." }
}
const ORDER = ["General", "Look & Feel", "Privacy & Security", "Intelligence", "System"]


export function initShell (CATS) {
  const pane = document.getElementById("settings")
  let activeCat = "search"   // Settings opens on the everyday page, not Comet AI
  let query = ""
  const scrollMemo = new Map()
  let qt = null

  async function render () {
    const prevMain = pane.querySelector(".set-main")
    if (prevMain) scrollMemo.set(activeCat, prevMain.scrollTop)

    const prof = currentProfile()
    const count = allProfiles().length
    const searchInput = h("input.set-search", {
      type: "text", placeholder: "Search", value: query, spellcheck: false,
      // debounced: a search renders every category, so wait for a pause in typing
      oninput: () => {
        clearTimeout(qt)
        qt = setTimeout(() => {
          query = searchInput.value.trim().toLowerCase()
          nav.querySelectorAll(".set-nav-item").forEach((b) => b.classList.toggle("is-active", !query && b.dataset.cat === activeCat))
          paintMain()
        }, 120)
      }
    })

    const navGroups = ORDER.map((g) => {
      const items = CATS.filter((c) => (META[c.id]?.group ?? "System") === g)
      return items.length && h("div.set-nav-group", {}, items.map((c) => h(`button.set-nav-item${c.id === activeCat && !query ? ".is-active" : ""}`, {
        dataset: { cat: c.id },
        onclick: () => { activeCat = c.id; query = ""; render() }
      }, [tile(catGlyph(c.id, 15, c.icon), META[c.id]?.tint ?? "#8E8E93"), h("span", { text: c.label })])))
    })

    const nav = h("nav.set-nav", {}, [
      h("div.set-search-wrap", {}, [ico("search", 13), searchInput]),
      h("button.set-profile", { onclick: () => { activeCat = "profiles"; query = ""; render() } }, [
        avatar(prof, 40),
        h("span.set-profile-text", {}, [
          h("strong", { text: prof.name }),
          h("span", { text: count > 1 ? `${count} profiles · Switch or add` : "Profile · Add school, work…" })
        ])
      ]),
      ...navGroups
    ])

    const main = h("div.set-main")
    function paintMain () {
      const cat = CATS.find((c) => c.id === activeCat) ?? CATS[0]
      const content = h("div.set-content")
      if (query) {
        content.append(h("div.set-hero.is-compact", {}, [h("h1", { text: `Results for “${query}”` })]))
        for (const c of CATS) {
          const groups = c.render()
          const holder = h("div.set-result", {}, [h("div.set-result-head", {}, [tile(catGlyph(c.id, 12, c.icon), META[c.id]?.tint ?? "#8E8E93", 18), h("span", { text: c.label })]), ...groups])
          let any = false
          holder.querySelectorAll(".set-group").forEach((g) => {
            let hit = false
            g.querySelectorAll(".set-row").forEach((r) => {
              const ok = (r.dataset.search || r.textContent || "").toLowerCase().includes(query)
              r.classList.toggle("is-hidden", !ok)
              if (ok) hit = true
            })
            g.style.display = hit ? "" : "none"
            if (hit) any = true
          })
          if (any) content.append(holder)
        }
        if (!content.querySelector(".set-result")) content.append(h("div.set-empty", { text: "No settings match." }))
      } else {
        const m = META[cat.id] ?? {}
        content.append(
          h("div.set-hero", {}, [
            tile(catGlyph(cat.id, 32, cat.icon), m.tint ?? "#8E8E93", 54),
            h("div", {}, [h("h1", { text: cat.label }), m.desc && h("p", { text: m.desc })])
          ]),
          ...cat.render()
        )
      }
      main.replaceChildren(content)
      if (!query) requestAnimationFrame(() => { main.scrollTop = scrollMemo.get(activeCat) ?? 0 })
    }

    mount(pane, h("div.set", {}, [nav, main]))
    paintMain()
    if (query) setTimeout(() => { searchInput.focus(); searchInput.setSelectionRange(query.length, query.length) }, 0)
  }

  bus.on("view", (v) => { if (v === "settings") render() })
  bus.on("settings:rerender", () => { if ((window.__fluxView ?? "") === "settings") render() })
  bus.on("settings:goto", (cat) => { activeCat = cat; query = ""; bus.emit("view", "settings"); render() })
  render()
}
