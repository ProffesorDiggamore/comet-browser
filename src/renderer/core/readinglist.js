// ───────────────────────────────────────────────────────────────────
//  readinglist.js — Save for Later (⇧⌘D), like Safari's Reading List.
//  Per profile (config "readingList"), newest first.  Opening an item
//  marks it read; the Home widget and Jump Back In show the unread.
// ───────────────────────────────────────────────────────────────────
import { state } from "./state.js"
import { toast } from "./bus.js"
import * as T from "./tabs.js"
import { cleanUrl } from "./links.js"

const MAX = 200
export const readingList = () => state.get("readingList") ?? []
export const unread = () => readingList().filter((x) => !x.read)
export const inReadingList = (url) => !!url && readingList().some((x) => x.url === url)

export async function addToReadingList (url, title = "") {
  if (!/^https?:/i.test(url ?? "")) { toast("Open a web page first"); return false }
  url = cleanUrl(url)                     // no utm_* / fbclid riding along into the list
  const rest = readingList().filter((x) => x.url !== url)
  const existed = rest.length !== readingList().length
  await state.set("readingList", [{ url, title: title || url, host: T.hostOf(url).replace(/^www\./, ""), addedAt: Date.now(), read: false }, ...rest].slice(0, MAX))
  toast(existed ? "Already in your Reading List — moved to the top" : "Added to Reading List")
  return true
}

export function addActiveToReadingList () {
  const t = T.getActive()
  if (!t || t.isHome) return toast("Open a web page first")
  return addToReadingList(t.url, t.pageTitle || t.title)
}

export const removeFromReadingList = (url) => state.set("readingList", readingList().filter((x) => x.url !== url))
export const markRead = (url, read = true) => state.set("readingList", readingList().map((x) => (x.url === url ? { ...x, read } : x)))
export const clearRead = () => state.set("readingList", unread())
