// ───────────────────────────────────────────────────────────────────
//  links.js — copy the page's link the way you need it: clean (tracking
//  parameters removed: utm_*, fbclid, gclid, si, …) or as a Markdown
//  link, [Title](url).  Used by the palette, the File menu and the tab menu.
// ───────────────────────────────────────────────────────────────────
import { toast } from "./bus.js"

const TRACKERS = /^(utm_\w+|fbclid|gclid|gclsrc|dclid|gbraid|wbraid|msclkid|yclid|twclid|ttclid|li_fat_id|igshid|igsh|mc_cid|mc_eid|_hsenc|_hsmi|mkt_tok|oly_anon_id|oly_enc_id|vero_id|vero_conv|wickedid|ref_src|ref_url|s_cid|spm|scm|pd_rd_\w+|pf_rd_\w+|_encoding|ved|ei|sca_esv|si|feature|pp)$/i
// these keys are tracking only on the sites that add them
const SITE_ONLY = { si: /(^|\.)(youtube\.com|youtu\.be|spotify\.com)$/, feature: /(^|\.)(youtube\.com|youtu\.be)$/, pp: /(^|\.)youtube\.com$/, ved: /(^|\.)google\./, ei: /(^|\.)google\./, sca_esv: /(^|\.)google\./ }

export function cleanUrl (raw) {
  let u
  try { u = new URL(raw) } catch { return raw }
  for (const k of [...u.searchParams.keys()]) {
    if (!TRACKERS.test(k)) continue
    const only = SITE_ONLY[k.toLowerCase()]
    if (only && !only.test(u.hostname)) continue
    u.searchParams.delete(k)
  }
  if (/(^|\.)amazon\./.test(u.hostname)) u.pathname = u.pathname.replace(/\/ref=[^/]*$/, "")
  let out = u.toString()
  if (!u.search) out = out.replace(/\?$/, "")
  return out
}

const mdEscape = (s) => String(s).replace(/([[\]\\])/g, "\\$1")

export function copyLink (tab, mode) {
  const url = cleanUrl(tab.url)
  if (mode === "markdown") {
    const title = (tab.pageTitle || tab.title || url).trim()
    navigator.clipboard.writeText(`[${mdEscape(title)}](${url})`)
    return toast("Copied as Markdown link")
  }
  navigator.clipboard.writeText(url)
  toast(url === tab.url ? "Link copied — it was already clean" : "Clean link copied (tracking removed)")
}
