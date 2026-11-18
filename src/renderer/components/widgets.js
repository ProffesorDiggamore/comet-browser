// ───────────────────────────────────────────────────────────────────
//  widgets.js — Home's widget kinds, drawn like Apple's WidgetKit
//  widgets (macOS 26 / iOS): small 1×1, medium 2×1, large 2×2, wide
//  4×1, each with its own "full color" container — or Tinted / Clear /
//  a glass material (styles/widgets.css).  Each kind renders into a
//  body element and returns a cleanup (timers stop off-screen).
//  Per-widget settings live on the widget: w.config.
//  The kinds themselves: widgets-time.js, widgets-wx.js,
//  widgets-web.js, widgets-personal.js, widgets-useful.js.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { state } from "../core/state.js"
import { toast } from "../core/bus.js"
import { clock, calendar, worldclock, countdown, focus } from "./widgets-time.js"
import { weather } from "./widgets-wx.js"
import { sites, tabs, closed, hottabs, clipboard, imagesearch } from "./widgets-web.js"
import { notes, todo, battery } from "./widgets-personal.js"
import { spotifyWidget } from "./widgets/spotify.js"
import { reading, downloads, headlines, favorites } from "./widgets-useful.js"

export const SIZES = {
  small: { label: "Small", cols: 1, rows: 1 },
  medium: { label: "Medium", cols: 2, rows: 1 },
  large: { label: "Large", cols: 2, rows: 2 },
  wide: { label: "Wide", cols: 4, rows: 1 }
}

// one timeout for the soonest running Focus Timer, wherever you are in Comet
let alarmT = 0
export function armFocusAlarm () {
  clearTimeout(alarmT)
  const ends = (state.get("home.widgets") ?? []).filter((w) => w.kind === "focus" && w.config?.endsAt).map((w) => w.config.endsAt)
  if (!ends.length) return
  alarmT = setTimeout(() => {
    const now = Date.now() + 500
    state.set("home.widgets", (state.get("home.widgets") ?? []).map((w) => w.kind === "focus" && w.config?.endsAt && w.config.endsAt <= now ? { ...w, config: { ...w.config, endsAt: null, left: 0 } } : w))
    toast("Focus timer done")
    try { new Notification("Comet", { body: "Focus timer done — take a break." }) } catch {}
    armFocusAlarm()
  }, Math.max(0, Math.min(...ends) - Date.now()))
}

export const KINDS = {
  reading: { name: "Reading List", icon: "glasses", desc: "Pages you saved for later (⇧⌘D)", sizes: ["small", "medium", "large"], render: reading },
  headlines: { name: "Headlines", icon: "news", desc: "Top stories from a news site or any RSS feed", sizes: ["medium", "large", "wide"], render: headlines },
  downloads: { name: "Downloads", icon: "download", desc: "Your newest files — open or show in Finder", sizes: ["small", "medium", "large"], render: downloads },
  favorites: { name: "Favorites", icon: "bookmark", desc: "Your bookmarks, one click away", sizes: ["small", "medium", "large"], render: favorites },
  clock: { name: "Clock", icon: "clock", desc: "An analog dial, or the time in big type", sizes: ["small", "medium"], render: clock },
  calendar: { name: "Calendar", icon: "calendar", desc: "Today and this month", sizes: ["small", "medium", "large"], render: calendar },
  weather: { name: "Weather", icon: "sun", desc: "Now, the next hours and days", sizes: ["small", "medium", "wide"], render: weather },
  sites: { name: "Top Sites", icon: "globe", desc: "Your most-visited sites", sizes: ["small", "medium", "large"], render: sites },
  clipboard: { name: "Clipboard", icon: "clipboard", desc: "What you copied, ready to upload", sizes: ["small", "medium"], render: clipboard },
  notes: { name: "Notes", icon: "note", desc: "A quick note, always on Home", sizes: ["small", "medium", "large"], render: notes },
  battery: { name: "Batteries", icon: "battery", desc: "Charge level and time left", sizes: ["small", "medium"], render: battery },
  tabs: { name: "Open Tabs", icon: "layers", desc: "Jump to an open tab", sizes: ["small", "medium", "large"], render: tabs },
  hottabs: { name: "Hot Tabs", icon: "bolt", desc: "Your launchers and hotkeys", sizes: ["medium", "large", "wide"], render: hottabs },
  todo: { name: "To-Do", icon: "list", desc: "A checklist that stays on Home", sizes: ["small", "medium", "large"], render: todo },
  focus: { name: "Focus Timer", icon: "timer", desc: "25-minute Pomodoro with breaks", sizes: ["small", "medium"], render: focus },
  countdown: { name: "Countdown", icon: "hourglass", desc: "Days until a trip, birthday, deadline", sizes: ["small", "medium"], render: countdown },
  worldclock: { name: "World Clock", icon: "globe", desc: "Times in other cities", sizes: ["small", "medium", "wide"], render: worldclock },
  closed: { name: "Recently Closed", icon: "history", desc: "Bring back tabs you closed", sizes: ["small", "medium", "large"], render: closed },
  imagesearch: { name: "Image Search", icon: "lens", desc: "Drop or paste an image → Google Lens", sizes: ["small", "medium"], render: imagesearch },
  spotify: { name: "Spotify", icon: "music", desc: "What's playing in Spotify, with controls", sizes: ["small", "medium", "large"], render: spotifyWidget }
}

// what the widget gallery previews show before you add one (never saved)
export const SAMPLE = {
  weather: () => ({ city: (state.get("home.widgets") ?? []).find((w) => w.kind === "weather" && w.config?.city)?.config.city ?? "Cupertino" }),
  notes: () => ({ text: "Groceries\nOat milk, lemons, basil, the good bread", at: Date.now() }),
  todo: () => ({ items: [{ t: "Book flights", done: false }, { t: "Call the dentist", done: false }, { t: "Water plants", done: true }] }),
  countdown: () => ({ label: "Vacation", date: new Date(Date.now() + 12 * 86_400_000).toLocaleDateString("en-CA") }),
  headlines: () => ({ feed: (state.get("home.widgets") ?? []).find((w) => w.kind === "headlines")?.config?.feed ?? "verge" })
}

export function renderWidget (body, w, ctx) {
  const kind = KINDS[w.kind]
  if (!kind) { body.append(h("div.hw-list-empty", { text: `Unknown widget “${w.kind}”` })); return null }
  try { return kind.render(body, w, ctx) ?? null } catch (e) {
    console.error("[widget]", w.kind, e)
    toast(`${kind.name} widget failed: ${e.message}`)
    return null
  }
}
