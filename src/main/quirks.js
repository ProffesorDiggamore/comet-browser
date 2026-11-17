// ───────────────────────────────────────────────────────────────────
//  quirks.js — site-specific compatibility fixes, the way qutebrowser
//  and WebKit ship them.  Kept to the narrowest URL that needs it.
//
//  Google sign-in: "Couldn't sign you in — This browser or app may not
//  be secure."  Comet drops its Flux/Electron tokens from the user agent
//  (main.js) because many sites wall off browsers they don't know.  That
//  leaves a user agent claiming to be plain Chrome, and Google's sign-in
//  turns away a browser that claims to be Chrome (or Firefox) but isn't.
//  Shown Comet's real user agent, the same page lets it in.
//
//  Measured 2026-11-13, Electron 44.9.3, email step, fresh sessions:
//    real user agent on accounts.google.com   9/9 accepted
//    Firefox user agent (the previous quirk)  3/3 rejected
//    Chrome-shaped user agent (no quirk)      1/1 rejected
//
//  Header only: switching the page-side user agent as well means a
//  webContents.setUserAgent() during the redirect into sign-in, which
//  reloads the navigation and hung the test.  Toggle: privacy.googleSignInFix.
// ───────────────────────────────────────────────────────────────────
const { app } = require("electron")
const { store } = require("./store")

// Electron's untouched default (the token is app.name, which stays "Flux": see main.js): "… Flux/0.7.0 Chrome/152.x Electron/44.x Safari/537.36"
const realUA = () => app.userAgentFallback

function isGoogleSignIn (url) {
  try { const u = new URL(url); return u.protocol === "https:" && u.hostname === "accounts.google.com" } catch { return false }
}

// called from the session's one onBeforeSendHeaders hook (shield.js)
function applyRequestQuirks (details) {
  if (store.get("privacy.googleSignInFix") !== false && isGoogleSignIn(details.url)) {
    details.requestHeaders["User-Agent"] = realUA()
  }
}

module.exports = { applyRequestQuirks }
