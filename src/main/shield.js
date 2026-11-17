// ───────────────────────────────────────────────────────────────────
//  shield.js — Comet Shield: built-in tracker/ad blocking, HTTPS-only
//  upgrades and Global Privacy Control headers for the browsing session.
//  Blocking is domain-based (fast Set lookup per hostname label), only
//  ever applied to sub-resources — a page you navigate to always loads.
// ───────────────────────────────────────────────────────────────────
const { store } = require("./store")
const { applyRequestQuirks } = require("./quirks")

// Curated list: the ad exchanges + analytics beacons that cover the bulk
// of third-party tracking without breaking logins, players or CDNs.
const BLOCK = new Set(`
doubleclick.net googlesyndication.com googleadservices.com google-analytics.com
adservice.google.com pagead2.googlesyndication.com ssl.google-analytics.com
googletagservices.com analytics.google.com stats.g.doubleclick.net
adnxs.com adsrvr.org amazon-adsystem.com criteo.com criteo.net taboola.com outbrain.com
scorecardresearch.com quantserve.com quantcount.com moatads.com pubmatic.com rubiconproject.com
openx.net casalemedia.com bidswitch.net 3lift.com sharethrough.com teads.tv yieldmo.com
media.net adform.net smartadserver.com serving-sys.com doubleverify.com adsafeprotected.com
advertising.com adtechus.com yahoo-ads.com ads.yahoo.com gemini.yahoo.com zedo.com
revcontent.com mgid.com contentad.net adroll.com bluekai.com krxd.net exelator.com
rlcdn.com agkn.com demdex.net omtrdc.net everesttech.net mathtag.com turn.com
contextweb.com lijit.com sovrn.com indexww.com spotxchange.com spotx.tv springserve.com
adcolony.com applovin.com unityads.unity3d.com inmobi.com chartboost.com vungle.com
hotjar.com hotjar.io mouseflow.com crazyegg.com luckyorange.com clarity.ms fullstory.com
inspectlet.com smartlook.com logrocket.io quantummetric.com
mc.yandex.ru an.yandex.ru adfox.ru bat.bing.com ads.microsoft.com
px.ads.linkedin.com ads.linkedin.com analytics.twitter.com ads-twitter.com static.ads-twitter.com
analytics.tiktok.com ads.tiktok.com ads.pinterest.com ct.pinterest.com
pixel.facebook.com an.facebook.com ads.reddit.com events.reddit.com alb.reddit.com
branch.io app.link adjust.com appsflyer.com kochava.com
segment.io api.segment.io cdn.segment.com mixpanel.com api-js.mixpanel.com heap.io heapanalytics.com
amplitude.com api.amplitude.com api2.amplitude.com braze.com
chartbeat.com chartbeat.net parsely.com
comscore.com imrworldwide.com nielsen.com tynt.com addthis.com sharethis.com
onesignal.com pushcrew.com pushengage.com subscribers.com
zergnet.com propellerads.com popads.net popcash.net adcash.com exoclick.com juicyads.com
trafficjunky.com hilltopads.net clickadu.com admaven.com adsterra.com
yieldlove.com yieldlab.net adition.com ligatus.com plista.com smartclip.net
33across.com gumgum.com kargo.com undertone.com conversantmedia.com tremorhub.com
liveintent.com liadm.com id5-sync.com crwdcntrl.net tapad.com eyeota.net lotame.com
`.split(/\s+/).filter(Boolean))

function blockedHost (host) {
  if (!host) return false
  let h = host.toLowerCase()
  while (true) {
    if (BLOCK.has(h)) return true
    const i = h.indexOf(".")
    if (i === -1) return false
    h = h.slice(i + 1)
  }
}

function isLocal (host) {
  return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".test") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host === "[::1]"
}

const counts = new Map()       // webContentsId -> blocked count (per page load)
let total = 0

function initShield (ses, getWin) {
  let pending = new Map()
  let flushT = null
  const notify = (wcId) => {
    pending.set(wcId, counts.get(wcId) ?? 0)
    if (flushT) return
    flushT = setTimeout(() => {
      flushT = null
      const w = getWin()
      if (w && !w.isDestroyed()) w.webContents.send("flux:shield:counts", { counts: Object.fromEntries(pending), total })
      pending = new Map()
    }, 400)
  }

  ses.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, cb) => {
    let u
    try { u = new URL(details.url) } catch { return cb({}) }
    const priv = store.get("privacy") ?? {}

    if (details.resourceType === "mainFrame") {
      // a new top-level page resets that tab's counter
      if (details.webContentsId) { counts.set(details.webContentsId, 0); notify(details.webContentsId) }
      if (priv.httpsOnly && u.protocol === "http:" && !isLocal(u.hostname)) {
        u.protocol = "https:"
        return cb({ redirectURL: u.toString() })
      }
      return cb({})
    }

    if (priv.blockTrackers !== false && /^(https?|wss?):$/.test(u.protocol) && blockedHost(u.hostname)) {
      const id = details.webContentsId
      if (id) { counts.set(id, (counts.get(id) ?? 0) + 1); notify(id) }
      total++
      return cb({ cancel: true })
    }
    cb({})
  })

  // a session gets one header hook, so site quirks ride along here
  ses.webRequest.onBeforeSendHeaders({ urls: ["<all_urls>"] }, (details, cb) => {
    if (store.get("privacy.sendGpc") !== false) {
      details.requestHeaders["Sec-GPC"] = "1"
      details.requestHeaders.DNT = "1"
    }
    applyRequestQuirks(details)
    cb({ requestHeaders: details.requestHeaders })
  })
}

module.exports = { initShield, shieldStats: () => ({ total, domains: BLOCK.size }) }
