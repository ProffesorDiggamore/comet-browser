// ───────────────────────────────────────────────────────────────────
//  quirks.js — site-specific compatibility fixes, the way qutebrowser
//  and WebKit ship them.  Kept to the narrowest URL that needs it.
//
//  Google sign-in turns away Chromium engines that live inside an app
//  (Electron, QtWebEngine): "Couldn't sign you in — This browser or app
//  may not be secure."  qutebrowser's built-in "ua-google" quirk sends a
//  Firefox user agent on requests to accounts.google.com only; Flux does
//  the same.  Every other site, and the page's own JavaScript, still see
//  Flux's real Chromium identity.  Toggle: privacy.googleSignInFix.
// ───────────────────────────────────────────────────────────────────
const { store } = require("./store")

// Firefox ships every 4 weeks (141 on 2025-07-22); claim the release before
// the current one so the string never goes stale or names a future version
const FIREFOX_141 = Date.UTC(2025, 6, 22)
function firefoxVersion () {
  return 141 + Math.max(0, Math.floor((Date.now() - FIREFOX_141) / (28 * 864e5)) - 1)
}
const firefoxUA = () => { const v = firefoxVersion(); return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:${v}.0) Gecko/20100101 Firefox/${v}.0` }

function isGoogleSignIn (url) {
  try { const u = new URL(url); return u.protocol === "https:" && u.hostname === "accounts.google.com" } catch { return false }
}

// called from the session's one onBeforeSendHeaders hook (shield.js)
function applyRequestQuirks (details) {
  if (store.get("privacy.googleSignInFix") !== false && isGoogleSignIn(details.url)) {
    details.requestHeaders["User-Agent"] = firefoxUA()
  }
}

module.exports = { applyRequestQuirks, firefoxUA }
