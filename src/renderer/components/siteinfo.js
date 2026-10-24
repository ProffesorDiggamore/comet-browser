// ───────────────────────────────────────────────────────────────────
//  siteinfo.js — the site popover behind the lock chip: connection,
//  trackers blocked, per-site zoom, force-dark, remembered permissions.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { state } from "../core/state.js"
import { bus, toast } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { popover, closePopover } from "./popover.js"
import * as T from "../core/tabs.js"

const PERM_LABEL = {
  microphone: "Microphone", camera: "Camera", "camera+mic": "Camera & mic", geolocation: "Location",
  notifications: "Notifications", midi: "MIDI", midiSysex: "MIDI (sysex)", "clipboard-read": "Read clipboard",
  "display-capture": "Screen sharing", "idle-detection": "Idle detection", "speaker-selection": "Speaker selection"
}

export function openSiteInfo (anchor) {
  const a = T.getActive()
  if (!a || a.isHome) { bus.emit("focus-address"); return }
  const hostName = T.hostOf(a.url)
  const secure = a.url.startsWith("https:")
  const site = (state.get("siteSettings") ?? {})[hostName] ?? {}

  const zoomVal = h("span.si-zoom-val", { text: `${Math.round(T.zoomOf(a.id) * 100)}%` })
  const refreshZoom = () => { zoomVal.textContent = `${Math.round(T.zoomOf(a.id) * 100)}%` }

  const dark = h("span.switch", {}, [
    h("input", { type: "checkbox", checked: !!site.dark, onchange: async (e) => { await T.setSite(a.url, { dark: e.target.checked }); T.refreshSite(a.id) } }),
    h("span.track")
  ])

  const perms = Object.entries(site.perms ?? {})
  const permRows = perms.length
    ? perms.map(([k, v]) => h("div.si-row", {}, [
      h("span", { text: PERM_LABEL[k] ?? k }),
      h("span.tag", { class: v === "allow" ? "tag ok" : "tag", text: v === "allow" ? "Allowed" : "Blocked" }),
      h("button.tb-btn", { title: "Reset", onclick: async () => {
        const p = { ...(site.perms ?? {}) }; delete p[k]
        await T.setSite(a.url, { perms: p })
        toast(`${PERM_LABEL[k] ?? k} reset`)
        closePopover()
      } }, [ico("reset", 13)])
    ]))
    : [h("div.si-dim", { text: "No permissions granted or blocked." })]

  const body = h("div.si", {}, [
    h("div.si-head", {}, [
      h("span.si-ico", { class: secure ? "si-ico ok" : "si-ico warn" }, [ico(secure ? "lock" : "info", 16)]),
      h("div", {}, [h("div.si-host", { text: hostName }), h("div.si-dim", { text: secure ? "Connection is secure" : "Connection is not secure" })])
    ]),
    h("div.si-row", {}, [h("span", {}, [ico("shield", 14), " Trackers blocked"]), h("strong", { text: String(a.blocked ?? 0) })]),
    h("div.si-row", {}, [
      h("span", { text: "Zoom" }),
      h("div.si-zoom", {}, [
        h("button.tb-btn", { onclick: () => { T.zoomOut(); refreshZoom() } }, [ico("zoomOut", 14)]),
        zoomVal,
        h("button.tb-btn", { onclick: () => { T.zoomIn(); refreshZoom() } }, [ico("zoomIn", 14)]),
        h("button.tb-btn", { title: "Reset", onclick: () => { T.zoomReset(); refreshZoom() } }, [ico("reset", 14)])
      ])
    ]),
    h("div.si-row", {}, [h("span", { text: "Force dark mode" }), dark]),
    h("div.si-sub", { text: "Permissions" }),
    ...permRows,
    h("div.si-actions", {}, [
      h("button.btn.btn--ghost", { onclick: () => { navigator.clipboard.writeText(a.url); toast("Link copied"); closePopover() } }, "Copy link"),
      h("button.btn.btn--ghost", { onclick: () => { window.flux.openExternal(a.url); closePopover() } }, "Open in Safari")
    ])
  ])
  popover(anchor, body, { width: 320 })
}
