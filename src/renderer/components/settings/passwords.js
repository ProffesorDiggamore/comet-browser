// ───────────────────────────────────────────────────────────────────
//  settings/passwords.js — Settings → Passwords, like Apple's Passwords
//  app: search, All / Reused / Weak filters, and every login editable
//  in place (website, username, password) with a strong-password
//  generator.  Passwords stay in main until you reveal, copy or edit
//  one; the list itself is metadata only (weak / reused come from main).
// ───────────────────────────────────────────────────────────────────
import { h, clear } from "../../core/dom.js"
import { bus, toast } from "../../core/bus.js"
import { ico } from "../../core/icons.js"
import * as T from "../../core/tabs.js"
import { group, row, btn } from "./kit.js"

const V = () => window.flux.vault
let filter = "all"      // all | reused | weak (kept while Settings re-renders)
let query = ""
let openId = null       // the login whose editor is open ("new" = adding one)

const hueOf = (s) => { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x % 360 }
const ago = (t) => {
  if (!t) return ""
  const d = new Date(t), now = new Date()
  if (d.toDateString() === now.toDateString()) return "today"
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" })
}
const SOURCE = { manual: "added by you", autosave: "saved after sign-in", operagx: "from Opera GX", chrome: "from Chrome", brave: "from Brave", edge: "from Edge", arc: "from Arc", vivaldi: "from Vivaldi" }

function plate (e) {
  const host = e.host || e.url || "?"
  const el = h("span.pw-plate", { style: { "--h": hueOf(host) } })
  const letter = () => h("b", { text: (host.replace(/^www\./, "")[0] ?? "?").toUpperCase() })
  const f = T.faviconFor(e.url || `https://${host}`)
  el.append(f ? h("img", { src: f, draggable: false, alt: "", onerror: (ev) => ev.target.replaceWith(letter()) }) : letter())
  return el
}

// how strong the typed password looks: 0 empty … 4 strong (a hint, not a verdict)
function strength (p) {
  if (!p) return 0
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((r) => r.test(p)).length
  if (p.length < 8) return 1
  if (p.length >= 16 && kinds >= 2) return 4
  if (p.length >= 12 && kinds >= 3) return 4
  return kinds >= 3 ? 3 : 2
}
const STRENGTH = ["", "Weak", "Fair", "Good", "Strong"]

// ── the editor: website, username, password (+ reveal, generate) ──
function editor (e, done) {
  const isNew = !e
  const site = h("input.pw-in", { type: "url", placeholder: "example.com", value: e?.url ?? "", spellcheck: false, "aria-label": "Website" })
  const user = h("input.pw-in", { type: "text", placeholder: "Email or username", value: e?.username ?? "", spellcheck: false, autocomplete: "off", "aria-label": "Username" })
  const pass = h("input.pw-in.is-secret", { type: "password", placeholder: isNew ? "Password" : "Loading…", spellcheck: false, autocomplete: "new-password", "aria-label": "Password" })
  const meter = h("span.pw-meter", {}, [h("i"), h("i"), h("i"), h("i")])
  const meterT = h("span.pw-meter-t")
  const paintMeter = () => {
    const s = strength(pass.value)
    meter.dataset.s = s
    meterT.textContent = STRENGTH[s]
  }
  let original = ""
  if (!isNew) V().reveal(e.id).then((p) => { original = p || ""; pass.value = original; pass.placeholder = "Password"; paintMeter() })
  pass.addEventListener("input", paintMeter)

  const eye = h("button.pw-mini", { type: "button", title: "Show password", "aria-label": "Show password", onclick: () => {
    const show = pass.type === "password"
    pass.type = show ? "text" : "password"
    eye.replaceChildren(ico(show ? "eyeoff" : "eye", 14))
    eye.title = show ? "Hide password" : "Show password"
  } }, [ico("eye", 14)])
  const gen = h("button.pw-mini", { type: "button", title: "Suggest a strong password", "aria-label": "Suggest a strong password", onclick: async () => {
    pass.value = await V().generate({})
    pass.type = "text"
    eye.replaceChildren(ico("eyeoff", 14))
    paintMeter()
    gen.animate?.([{ rotate: "0deg" }, { rotate: "180deg" }], { duration: 260, easing: "ease-out" })
  } }, [ico("dice", 14)])
  const copy = h("button.pw-mini", { type: "button", title: "Copy password", "aria-label": "Copy password", onclick: () => { navigator.clipboard.writeText(pass.value); toast("Password copied") } }, [ico("copy", 14)])

  const save = async () => {
    const url = site.value.trim()
    if (!url) { site.focus(); return toast("Add the website first") }
    if (isNew) {
      if (!pass.value) { pass.focus(); return toast("Add a password") }
      await V().add({ url, username: user.value.trim(), password: pass.value, source: "manual" })
      toast("Password saved")
    } else {
      const patch = { url, username: user.value }
      if (pass.value && pass.value !== original) patch.password = pass.value
      if (!pass.value) { pass.focus(); return toast("The password can't be empty") }
      const r = await V().update(e.id, patch)
      if (!r?.ok) return toast(r?.text ?? "Couldn't save that")
      toast("Login updated")
    }
    done(true)
  }
  const onKey = (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); save() }
    if (ev.key === "Escape") { ev.preventDefault(); done(false) }
  }
  for (const i of [site, user, pass]) i.addEventListener("keydown", onKey)

  const meta = !isNew && [
    e.addedAt && `Added ${ago(e.addedAt)}`,
    e.updatedAt && `edited ${ago(e.updatedAt)}`,
    SOURCE[e.source] ?? (e.source ? `from ${e.source}` : "")
  ].filter(Boolean).join(" · ")

  const el = h("div.pw-edit", {}, [
    h("label.pw-field", {}, [h("span.pw-lab", { text: "Website" }), site]),
    h("label.pw-field", {}, [h("span.pw-lab", { text: "Username" }), user]),
    h("label.pw-field", {}, [h("span.pw-lab", { text: "Password" }), h("span.pw-passwrap", {}, [pass, eye, copy, gen])]),
    h("div.pw-strength", {}, [h("span.pw-lab"), meter, meterT]),
    h("div.pw-edit-foot", {}, [
      meta ? h("span.pw-meta", { text: meta }) : h("span.pw-meta", { text: "Tip: the dice button suggests a strong password." }),
      h("span.pw-grow"),
      !isNew && btn("Delete", async () => {
        if (!confirm(`Delete the login for ${e.username || e.host}? This can't be undone.`)) return
        await V().remove(e.id)
        toast("Login deleted")
        done(true)
      }, "btn btn--danger"),
      btn("Cancel", () => done(false), "btn btn--ghost"),
      btn(isNew ? "Save" : "Save Changes", save, "btn btn--accent")
    ])
  ])
  requestAnimationFrame(() => (isNew ? site : user).focus())
  paintMeter()
  return el
}

// ── one login row (click to edit) ─────────────────────────────────
function loginRow (e, rerender) {
  const badges = [
    e.reused && h("span.pw-badge", { text: "Reused" }),
    e.weak && h("span.pw-badge", { text: "Weak" }),
    e.empty && h("span.pw-badge", { text: "No password" })
  ].filter(Boolean)
  const head = h("div.pw-row-main", { role: "button", tabIndex: 0, "aria-expanded": String(openId === e.id), onclick: () => { openId = openId === e.id ? null : e.id; rerender() },
    onkeydown: (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openId = openId === e.id ? null : e.id; rerender() } } }, [
    plate(e),
    h("span.pw-row-text", {}, [
      h("span.pw-host", {}, [h("b", { text: (e.host || e.url || "").replace(/^www\./, "") }), ...badges]),
      h("span.pw-user", { text: e.username || "No username" })
    ]),
    h("span.pw-actions", { onclick: (ev) => ev.stopPropagation() }, [
      h("button.pw-mini", { title: "Copy username", "aria-label": "Copy username", onclick: () => { navigator.clipboard.writeText(e.username || ""); toast("Username copied") } }, [ico("user", 14)]),
      h("button.pw-mini", { title: "Copy password", "aria-label": "Copy password", onclick: async () => { navigator.clipboard.writeText(await V().reveal(e.id)); toast("Password copied") } }, [ico("key", 14)]),
      h("button.pw-mini", { title: `Open ${e.host}`, "aria-label": `Open ${e.host}`, onclick: () => { T.newTab(e.url || `https://${e.host}`); bus.emit("view", "tabs") } }, [ico("external", 14)]),
      h("button.pw-mini", { title: "Edit", "aria-label": "Edit login", onclick: () => { openId = openId === e.id ? null : e.id; rerender() } }, [ico("edit", 14)])
    ])
  ])
  const el = h(`div.pw-row${openId === e.id ? ".is-open" : ""}`, { dataset: { search: `${e.host} ${e.username} passwords` } }, [head])
  if (openId === e.id) el.append(editor(e, (changed) => { openId = null; if (changed) bus.emit("settings:rerender"); else rerender() }))
  return el
}

export function catPasswords () {
  const listEl = h("div.pw-list", {}, [h("div.rdesc", { text: "Loading…" })])
  const chips = h("div.pw-chips", { role: "tablist" })
  const search = h("input.pw-search", { type: "search", placeholder: "Search logins", value: query, spellcheck: false, "aria-label": "Search logins" })
  let entries = []

  const paint = () => {
    const reused = entries.filter((e) => e.reused).length
    const weak = entries.filter((e) => e.weak).length
    if (filter === "reused" && !reused) filter = "all"
    if (filter === "weak" && !weak) filter = "all"
    clear(chips)
    for (const [k, label, n] of [["all", "All", entries.length], ["reused", "Reused", reused], ["weak", "Weak", weak]]) {
      if (k !== "all" && !n) continue
      chips.append(h(`button.pw-chip${filter === k ? ".is-on" : ""}${k !== "all" ? ".is-warn" : ""}`, { role: "tab", "aria-selected": String(filter === k), onclick: () => { filter = k; paint() } }, [
        h("span", { text: label }), h("b", { text: String(n) })
      ]))
    }
    const q = query.trim().toLowerCase()
    const shown = entries
      .filter((e) => filter === "all" || e[filter])
      .filter((e) => !q || `${e.host} ${e.url} ${e.username}`.toLowerCase().includes(q))
      .sort((a, b) => (a.host || "").localeCompare(b.host || "") || (a.username || "").localeCompare(b.username || ""))
    clear(listEl)
    if (openId === "new") {
      listEl.append(h("div.pw-row.is-open.is-new", {}, [h("div.pw-row-main.is-static", {}, [h("span.pw-plate.is-new", {}, [ico("plus", 15)]), h("span.pw-row-text", {}, [h("span.pw-host", {}, [h("b", { text: "New login" })])])]),
        editor(null, (changed) => { openId = null; if (changed) bus.emit("settings:rerender"); else paint() })]))
    }
    if (!entries.length && openId !== "new") {
      listEl.append(h("div.pw-empty", {}, [ico("key", 22), h("div", { text: "No saved passwords yet" }), h("div.rdesc", { text: "Comet offers to save a password when you sign in. You can also import them from another browser or add one here." })]))
      return
    }
    if (!shown.length && entries.length) listEl.append(h("div.pw-empty.is-small", { text: q ? `No logins match “${query}”` : "Nothing here" }))
    for (const e of shown) listEl.append(loginRow(e, paint))
    if (filter === "reused") listEl.prepend(h("div.pw-hint", { text: "These passwords are used on more than one site. If one site leaks, the others are at risk — open each login and use the dice button to give it its own." }))
    if (filter === "weak") listEl.prepend(h("div.pw-hint", { text: "These passwords are short or easy to guess. Change them on the site, then update them here." }))
  }

  search.addEventListener("input", () => { query = search.value; paint() })
  search.addEventListener("keydown", (e) => { if (e.key === "Escape" && search.value) { e.stopPropagation(); search.value = query = ""; paint() } })

  V().list().then((list) => { entries = list; paint() })

  return [
    group("Saved passwords", [
      h("div.set-row.pw-top", { dataset: { search: "passwords vault login credentials search add new import" } }, [
        h("span.pw-searchwrap", {}, [ico("search", 14), search]),
        h("div.control", {}, [
          btn("Import…", () => bus.emit("settings:goto", "import"), "btn btn--ghost"),
          h("button.btn.btn--accent", { onclick: () => { openId = "new"; paint() } }, [ico("plus", 13), h("span", { text: "New Password" })])
        ])
      ]),
      h("div.set-row.pw-chiprow", { dataset: { search: "passwords reused weak" } }, [chips]),
      h("div.set-row.set-row--block.pw-listrow", { dataset: { search: "passwords vault login credentials" } }, [listEl])
    ], "Encrypted on this Mac with your macOS keychain. Click a login to change its website, username or password."),
    group("Danger zone", [
      row("Delete every saved password", btn("Delete All Passwords…", async () => {
        const all = await V().list()
        if (!all.length) return toast("No saved passwords")
        if (!confirm(`Delete all ${all.length} saved password${all.length === 1 ? "" : "s"}? This can't be undone.`)) return
        await V().clear(); bus.emit("settings:rerender"); toast("Passwords deleted")
      }, "btn btn--danger"))
    ])
  ]
}
