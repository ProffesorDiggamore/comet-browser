// ───────────────────────────────────────────────────────────────────
//  reader.js — Reader Mode (⌥⌘R).  Pulls the article out of the page as
//  plain blocks (no page markup), and lays it out on a calm surface
//  with type size / font / width / theme controls and Read Aloud.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { bus, toast } from "../core/bus.js"
import { ico } from "../core/icons.js"
import { readerScript } from "../core/pagescripts.js"
import { leave } from "../core/motion.js"
import * as T from "../core/tabs.js"

let view = null
const prefs = (() => { try { return { size: 19, serif: true, width: 700, theme: "dusk", ...JSON.parse(localStorage.getItem("flux.reader") ?? "{}") } } catch { return { size: 19, serif: true, width: 700, theme: "dusk" } } })()
const save = () => { try { localStorage.setItem("flux.reader", JSON.stringify(prefs)) } catch {} }

function stopSpeech () { try { speechSynthesis.cancel() } catch {} }

export function closeReader () {
  if (!view) return
  stopSpeech()
  const v = view
  view = null
  leave(v, "fade").then(() => v.remove())
}

export async function openReader () {
  if (view) { closeReader(); return }
  const a = T.getActive()
  if (!a || a.isHome) return toast("Open an article first")
  let data
  try { data = await T.exec(a.id, readerScript()) } catch (e) { return toast(`Reader unavailable: ${e.message}`) }
  if (!data?.blocks?.length || data.words < 60) return toast("This page doesn't look like an article")

  const article = h("article.rd-article")
  const apply = () => {
    article.style.setProperty("--rd-size", `${prefs.size}px`)
    article.style.setProperty("--rd-width", `${prefs.width}px`)
    article.classList.toggle("is-serif", prefs.serif)
    view.dataset.theme = prefs.theme
    save()
  }
  article.append(
    h("div.rd-site", { text: data.site }),
    h("h1.rd-title", { text: data.title }),
    h("div.rd-meta", { text: [data.byline, `${Math.max(1, Math.round(data.words / 230))} min read`].filter(Boolean).join(" · ") })
  )
  for (const b of data.blocks) {
    if (b.t === "h") article.append(h(`h${Math.min(4, b.l + 1)}`, { text: b.x }))
    else if (b.t === "p") article.append(h("p", { text: b.x }))
    else if (b.t === "pre") article.append(h("pre", { text: b.x }))
    else if (b.t === "q") article.append(h("blockquote", { text: b.x }))
    else if (b.t === "cap") article.append(h("figcaption", { text: b.x }))
    else if (b.t === "img") article.append(h("img.rd-img", { src: b.src, alt: b.alt, loading: "lazy", onerror: (e) => e.target.remove() }))
    else if (b.t === "list") article.append(h(b.o ? "ol" : "ul", {}, b.items.map((x) => h("li", { text: x }))))
  }

  const speakBtn = h("button.tb-btn", { title: "Read aloud" }, [ico("volume", 15)])
  speakBtn.onclick = () => {
    if (speechSynthesis.speaking) { stopSpeech(); speakBtn.classList.remove("is-on"); return }
    const text = [data.title, ...data.blocks.filter((b) => b.x).map((b) => b.x)].join(". ")
    const chunks = text.match(/[^.!?]+[.!?]*\s*/g)?.reduce((acc, s) => { const last = acc[acc.length - 1]; if (last && last.length + s.length < 220) acc[acc.length - 1] = last + s; else acc.push(s); return acc }, []) ?? [text]
    for (const c of chunks) {
      const u = new SpeechSynthesisUtterance(c)
      u.rate = 1.04
      speechSynthesis.speak(u)
    }
    speakBtn.classList.add("is-on")
  }

  const seg = (opts, cur, pick) => h("div.seg", {}, opts.map(([v, l]) => h("button", { class: v === cur ? "is-on" : "", onclick: (e) => { pick(v); [...e.currentTarget.parentElement.children].forEach((b) => b.classList.toggle("is-on", b === e.currentTarget)) } }, l)))
  const bar = h("div.rd-bar.glass", {}, [
    h("button.tb-btn", { title: "Smaller text", onclick: () => { prefs.size = Math.max(14, prefs.size - 1); apply() } }, [h("span.rd-a.sm", { text: "A" })]),
    h("button.tb-btn", { title: "Larger text", onclick: () => { prefs.size = Math.min(30, prefs.size + 1); apply() } }, [h("span.rd-a", { text: "A" })]),
    seg([["serif", "Serif"], ["sans", "Sans"]], prefs.serif ? "serif" : "sans", (v) => { prefs.serif = v === "serif"; apply() }),
    seg([[600, "Narrow"], [700, "Medium"], [860, "Wide"]], prefs.width, (v) => { prefs.width = v; apply() }),
    seg([["dusk", "Dusk"], ["sepia", "Sepia"], ["paper", "Paper"]], prefs.theme, (v) => { prefs.theme = v; apply() }),
    speakBtn,
    h("button.tb-btn", { title: "Summarize with Flux AI", onclick: () => bus.emit("ai:ask", { text: "Summarize this article: the key points, then what's worth acting on.", withPage: true }) }, [ico("spark", 15)]),
    h("button.tb-btn", { title: "Close reader (Esc)", onclick: closeReader }, [ico("close", 15)])
  ])

  view = h("div.rd", {}, [bar, h("div.rd-scroll", {}, [article])])
  view.dataset.tab = a.id
  document.getElementById("stage").append(view)
  apply()
}

bus.on("reader:toggle", openReader)
bus.on("reader:open", () => { if (!view) openReader() })
bus.on("tabs", ({ activeId }) => { if (view && view.dataset.tab && view.dataset.tab !== activeId) closeReader() })
bus.on("view", (v) => { if (v !== "tabs") closeReader() })
