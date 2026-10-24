// ───────────────────────────────────────────────────────────────────
//  engines.js — search engine presets.  The setting stores an id;
//  "custom" keeps a user template string with %s for the query.
// ───────────────────────────────────────────────────────────────────
export const ENGINES = [
  { id: "google",     name: "Google",       query: "https://www.google.com/search?q=%s",       home: "https://www.google.com",     hue: "#4285F4" },
  { id: "duckduckgo", name: "DuckDuckGo",   query: "https://duckduckgo.com/?q=%s",             home: "https://duckduckgo.com",     hue: "#DE5833" },
  { id: "brave",      name: "Brave Search", query: "https://search.brave.com/search?q=%s",     home: "https://search.brave.com",   hue: "#FB542B" },
  { id: "bing",       name: "Bing",         query: "https://www.bing.com/search?q=%s",         home: "https://www.bing.com",       hue: "#008373" },
  { id: "startpage",  name: "Startpage",    query: "https://www.startpage.com/sp/search?query=%s", home: "https://www.startpage.com", hue: "#6C4EE3" },
  { id: "ecosia",     name: "Ecosia",       query: "https://www.ecosia.org/search?q=%s",       home: "https://www.ecosia.org",     hue: "#2E7D32" },
  { id: "perplexity", name: "Perplexity",  query: "https://www.perplexity.ai/search?q=%s",    home: "https://www.perplexity.ai",  hue: "#20B8CD" },
  { id: "kagi",       name: "Kagi",         query: "https://kagi.com/search?q=%s",             home: "https://kagi.com",           hue: "#FFB319" },
  { id: "custom",     name: "Custom…",      query: null,                                      home: null,                          hue: "#8a8a8a" }
]

export function engineById (id) {
  return ENGINES.find((e) => e.id === id) ?? ENGINES[0]
}

// resolve a query template from config: preset id + optional custom template
export function queryTemplate (id, customUrl) {
  if (id === "custom") return (customUrl && customUrl.includes("%s")) ? customUrl : "https://duckduckgo.com/?q=%s"
  return engineById(id).query
}
