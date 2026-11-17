**Comet — a fully custom, modular liquid-glass desktop browser for macOS.**

Formerly Flux. The data folder moved to `~/Library/Application Support/Comet` on first launch; the keychain entry ("Flux Safe Storage"), the bundle id (`com.whoslandon.flux`), `package.json`'s `productName`, the `flux:` IPC channels and `window.flux` keep the old name on purpose, so logins, saved passwords and macOS permissions carry over (see the note at the top of `src/main/main.js`).

Built on Electron. Local-first: nothing leaves your Mac except the cloud
vision / companion calls you explicitly configure with your own API key.

---

## v0.8 — Comet: new name and icon, private tabs, a toolbar that works

- **Renamed to Comet** — app, Dock, menus and on-screen text; saved labels migrate once (`main/store.js`, schema 6). `npm run install-app` now builds `Comet.app` and replaces an old `Flux.app`.
- **Private tabs (⇧⌘N)** — a tab in an in-memory session: no history, not restored, not in "reopen closed tab", and its cookies and logins are wiped when the last private tab closes. Links opened from a private page stay private; right-click a link → Open Link in Private Tab. Same Shield, downloads and permission prompts; extensions are off there. Code: `core/tabs.js` (`private`), `main/main.js` (`comet-private` partition).
- **Address autocomplete** — typing the start of a site you have open, bookmarked or visited completes it inline ("you" → "youtube.com", the rest selected), so Enter goes straight there; Backspace drops the suggestion. Code: `components/omnibox.js`.
- **Swipe back / forward** — two-finger swipe left or right on a page, with an arrow that follows the gesture and fills in when it will commit. Skipped where the page scrolls sideways itself. Code: `preload/webview-preload.js`, `components/overlays.js`.
- **Copy Link (⇧⌘C)** — copies the current page's address; also in the address pill and the palette.
- **Icon that follows macOS** — `build/AppIcon.icon` (Icon Composer) is compiled by `actool` at install, so macOS 26+ draws Comet in its glass / tinted / clear icon styles; `build/comet.icns` stays as the fallback. The installer also un-registers the copy it moves to the Trash, so Spotlight no longer lists two Cometes.
- **Toolbar that answers clicks** — in the Dia layout the toolbar is a window-drag strip, and `-webkit-app-region` inherits, so every toolbar button and the address field sat inside the drag region and never received a click (the earlier "address bar fix" could not work for the same reason). Everything interactive now opts out (`styles/app.css`), and in macOS fullscreen there are no drag strips at all. The address is a visible pill on every page, including New Tab: click anywhere on it and it widens into the full, selected URL. Copy link moved into the pill.
- **Hover hints, no labels** — every icon button shows a quick glass tooltip with its name and shortcut, and it glides between neighbouring buttons. Native `title` tooltips are lifted into it app-wide. Code: `renderer/components/tooltip.js`.
- **New icon + motion** — the app icon is a comet ring, a bright head leading a ring that thins out behind it (`build/icon.svg`, layered in `build/AppIcon.icon`), and the same mark sits on the New Tab row; the saved-login key reads as a key. The sidebar's active highlight glides between tabs, the address pill expands on focus, reload spins, a new bookmark pops, and the chrome settles in on launch (`styles/motion.css`).

## v0.7 — Profiles, a real Mac app, Custom theme

- **Default browser** — Settings → Search & Tabs → Links → Make default (macOS asks you to confirm). Links clicked in Mail, Messages and other apps open as a Comet tab, including ones that arrive while Comet is still starting. Needs the installed Comet.app (`npm run install-app`), which now declares the http/https schemes. Code: `main/main.js` (`open-url`), `scripts/install-app.sh`.
- **Glass that blurs** — the command palette and the profile sheet now blur the page behind them. Their backdrops used to fade with an opacity animation, which made the backdrop the blur boundary, so page text showed through sharp. Backdrops fade their color instead (`m-scrim` in `styles/motion.css`).
- **Comet AI out of the way** — "Ask Comet AI" is the last row in address-bar suggestions and the palette (Tab still jumps to it, ⌘J still opens it), and Settings opens on Search & Tabs.

- **Profiles (like Chrome's)** — Personal, School, Work… each with its own tabs, bookmarks, history, saved passwords, cookies and site logins, Home screen, AI chats and look. Switch from the avatar at the top of the sidebar, the **Profiles** menu (⌃⌘1…9), or Settings → Profiles (rename, color, emoji, remove). A new profile starts with your current look, tinted its color. Your original data is the first profile, so nothing moved. Removing a profile sends its data to the Trash. API keys stay shared. Code: `main/profiles.js`, `renderer/components/profiles.js`, `styles/profiles.css`.
- **Installs as Comet.app** — `npm run install-app` builds it (with its own icon) and puts it in /Applications, so ⌘Space → “Comet” opens it. Re-run after code changes. It shares your data with `npm start`, and only one copy runs at a time (opening it again just brings the window forward). Code: `scripts/install-app.sh`, `scripts/make-icon.js`, `build/icon.svg`.
- **Engine upgrade** — Comet now runs on Electron 44 (Chromium 152, current as of Oct 2026) instead of Electron 33 (Chromium 130 from 2024), which was missing two years of security fixes. Sites see a normal, current Chromium. Sized pop-ups (window.open with features) now open as real windows, so OAuth pop-ups (Microsoft, GitHub, Apple…) can hand the login back; plain new-window links still become tabs. **Google sign-in:** Google rejects a browser whose user agent claims to be plain Chrome or Firefox but isn't (“This browser or app may not be secure”). Comet hides its Comet/Electron tokens from most sites, so `accounts.google.com` alone gets Comet's real user agent, which Google accepts (9/9 email-step tests on Electron 44.9.3; the Firefox disguise used before was rejected 3/3). Settings → Privacy & Shield → Google sign-in fix. Code: `main/quirks.js`.
- **Address bar fix** — clicking the “site / page title” breadcrumb now always opens the address for editing, with the URL selected so typing replaces it; Enter goes there in the same tab.
- **Custom theme** — Settings → Appearance → Custom: pick your own tint, glow and accent; works in light and dark.
- **Polish** — switches that are on now show as on in light mode; the dark Home search is dark glass with an accent focus ring; Comet follows macOS Reduce Transparency and Increase Contrast.

## v0.6 — Light & dark, Home Widgets, Easy Files

- **Light + dark mode** — Auto (follows macOS live), Light or Dark, from Settings → Appearance or the sun/moon button at the bottom of the sidebar. Websites follow along (`prefers-color-scheme`), and so does the native window glass. Eight new themes work in both modes — Glass (default), Sky, Mint, Sunset, Rose, Lavender, Sand, Mono — each just a tint + an accent. The classic themes keep their one fixed look (Blackline is light paper, the rest are dark). Under the hood every neutral is drawn with one polarity channel, `rgb(var(--ink) / a)`, so light mode is a token flip, not a second stylesheet. Code: `styles/tokens.css`, `styles/themes/modern.css`, `styles/light.css`, `data/themes.js`.
- **Dia-style shell, refined** — the page floats as a card with rounded corners all round and a soft shadow; the active tab lifts out of the sidebar as a little card; pinned sites are larger favicon tiles; the toolbar lost the Ask pill (Comet AI is still ⌘J, the sidebar chat button, and the ⋯ menu).
- **Home Widgets on the New Tab page** — your wallpaper, one search field, and an Apple-proportioned widget grid styled after the Home Widgets desktop app: Clock, Calendar, Weather (Open-Meteo, free, no key), Top Sites, Clipboard, Notes, Battery, Open Tabs, Hot Tabs; sizes small / medium / large / wide; materials Frosted / Liquid / Solid / Tinted / Clear. **Edit Widgets** jiggles them: drag to reorder, ⊖ to remove, the size chip to resize, + to add. **Wallpaper** offers presets, any photo (HEIC too), your Home Widgets photos, or your current desktop picture, plus a dim slider. Code: `components/home.js`, `components/widgets.js`, `main/wallpaper.js`, `main/weather.js`, `styles/widgets.css`.
- **Easy Files (Opera GX-style uploads)** — when a site opens a file picker, Comet first offers what you just copied (a screenshot/image, Finder files, or text as a .txt) and your newest downloads; pick one and the site receives it as a normal upload — even sites that block paste. "Browse files…" is the regular macOS dialog. Folder pickers are left alone. Toggle in Settings → Search & Tabs. Code: `main/easyfiles.js`, `preload/webview-preload.js`, `components/easyfiles.js`.
- One-time migration: your previous theme is saved as the **"My look before v0.6"** modpack (Settings → Modpacks) — one click to go back.

## v0.5 — Free local AI + Apple-style redesign

- **Comet AI runs on your Mac for free** via [Ollama](https://ollama.com) (default). Pick, download (one click, live progress) and delete models in Settings → Comet AI; the panel's model menu switches between local models and Claude. Local models get a free web search (DuckDuckGo) + page fetch tool, sloppy tool arguments from small models are auto-repaired, and a model stuck repeating a failing step is stopped early. Claude (API key) is still there as the "cloud" brain. Code: `main/assistant/ollama.js`, `websearch.js`, `renderer/components/localai.js`.
- **Liquid Glass, Apple-style** — real macOS window glass (vibrancy; toggle in Appearance), Apple's dark system palette and SF type scale, hairline borders with specular rims, macOS controls (sliding segmented control, switches, pop-up menus, filled sliders, App Store-style GET buttons), macOS menus, a Spotlight-style command palette, iMessage-style chat bubbles and a Siri-style glow while Comet AI works.
- **Dia-style layout (default)** — vertical tabs in a translucent sidebar (pinned sites as tiles — drag a tab onto them to pin; active tab shows a live thumbnail; Chats / Library / Settings at the bottom), one slim toolbar with a "site / page title" breadcrumb that turns into the address bar on click, and the page as a clean card. ⌘B collapses the sidebar (hover the left edge to peek). The old top-tabs layout is Settings → Layout → Style. Code: `renderer/components/vtabs.js`, `styles/dia.css`.
- **Settings rebuilt like System Settings** — glass sidebar with search, profile card and colored squircle icons; hero headers; grouped inset lists.
- Fix: the accent color picker now actually overrides the theme (themes keep their own accent until you pick one).

## v0.4 — Comet AI, Nebula Glass, motion engine, real-browser essentials

- **Comet AI (⌘J)** — Claude (Opus 5.5 by default; Sonnet 5.5 / Haiku 5.5 / Fable 5.1 selectable) docked beside your tabs. Streams answers, searches the web with cited sources, and **drives the browser**: open/close/switch/organize tabs, read and summarize pages, screenshot a tab, click / type / scroll on pages (asks first by default; never touches password or payment fields), split view, bookmarks, history search, and restyling Comet itself. Attach the page, a screenshot, or your voice. Chats are saved locally. Needs an Anthropic API key (Settings → Comet AI). Code: `main/assistant/*`, `renderer/components/aipanel.js`, `aitools.js`.
- **Nebula Glass look** — the reference design: violet nebula ribbons, inset rounded content frame with folder-style active tab, pinned-tab capsule, glass clusters, and a Home hero (living orb mascot, greeting, "How can I help you?", liquid-glass pill with lens + mic). Your old look is saved as the "My previous look" modpack.
- **Smart omnibox** — one box for URLs, searches and questions (questions go to Comet AI; ⌘⏎ always does, ⌥⏎ new tab), with history/bookmark/open-tab suggestions, inline math, and keyword searches (`yt lofi`, `gh electron`, editable).
- **Motion (Settings → Motion)** — global duration, 8 easing curves incl. a real spring-physics curve (stiffness/damping) with live previews, per-element animation styles (tab open/close, view switches, panels, popovers, toasts, Home), hover lift, press depth, ripples, glass spotlight + shimmer, liquid-lens refraction, ambient background, orb style, load indicator. Follows macOS Reduce Motion.
- **Browser essentials** — session restore (lazy: restored tabs stay asleep until clicked), pinned tabs, drag-to-reorder, tab context menu, mute + audio indicators, split view (⌘\), tab overview with thumbnails (⇧⌘\), Reader Mode with Read Aloud (⌥⌘R), picture-in-picture, history + bookmarks Library (⌘Y / ⌘D), downloads manager, page screenshots (⇧⌘S), per-site zoom + force-dark, site info popover, native right-click menus (open in new tab/split, copy image, Ask Comet AI, inspect…), hovered-link pill, load-error card, focus mode (⇧⌘F), auto-hiding sidebar, command palette (⌘K).
- **Comet Shield** — built-in tracker/ad blocking with per-page counts, HTTPS-only option, Global Privacy Control, and per-site permission prompts (camera, mic, location, notifications… — Electron used to grant these silently).
- **Shortcuts live in the macOS menu bar**, so they work even when a web page has focus.
- Fixes: extensions now load into the browsing session (they previously loaded into the UI session and never reached tabs); "Clear browsing data" now clears the web session; sites see a standard Chrome user agent.

## v0.3 — Import from Opera GX + Forged Carbon theme

- **Import Data** (Settings → Import Data): pulls **passwords, bookmarks, and history** from a local Chromium-family profile — **Opera GX** (default), plus Opera, Chrome, Brave, Edge. Passwords are decrypted with the source browser's own macOS Keychain key (you approve the system prompt), then stored in Comet's own encrypted vault. Nothing is uploaded. Imported bookmarks/history can be turned into Hot Tabs or a sidebar Links widget in one click.
- **Passwords** (Settings → Passwords): the vault — search, reveal (auto re-masks after 12s), copy user/pass, delete, add manually. Encrypted at rest with the OS keychain (`vault.bin`, 0600).
- **Fill saved login**: the key button in the toolbar (or "Fill saved login" in ⇧⌘A) injects a matching username/password into the current page's login form. Never automatic.
- **Forged Carbon theme**: chopped-tow carbon marbling + fractal-noise flecks + wet clearcoat sheen, under extra-clear liquid glass — low tint, high blur/saturation, a prismatic cyan→magenta refraction rim on every panel. Pick it in Appearance → Theme, or apply the **Forged Carbon** modpack for the tuned glass/accent/background set.

## v0.2 — Settings overhaul + QOL + optimization

- **Settings**: rebuilt as a two-pane app (category rail + filterable content). Type in the search box to jump to any setting across all categories. SVG icons throughout (no emoji), segmented controls, live-readout sliders, keyboard focus rings, Comfortable/Compact density.
- **Search engine**: now a picker (Google, DuckDuckGo, Brave, Bing, Startpage, Ecosia, Perplexity, Kagi, + Custom) instead of a URL field.
- **Optimization** (Settings → Performance): **tab sleeping** — idle background tabs unload after N minutes and reload instantly on click (manual "sleep all" too); frame-rate cap (30/60/uncapped); block media autoplay; throttle background tabs; hardware-acceleration toggle; a live **process monitor** (CPU/RAM per Electron process).
- **QOL**: ⇧⌘A tab switcher / command palette · ⇧⌘T reopen closed tab · ⌘F find-in-page · ⌘±/0 zoom · ⌘B toggle sidebar · Privacy → clear cache/cookies/site-data · per-section and global "restore defaults".
- Design pass guided by the installed **ui-ux-pro-max** skill (`~/.claude/skills/ui-ux-pro-max`).

## Run it

```bash
cd "Projects/Comet"
npm install
npm start
```

Or double-click `start.command` from Finder (installs Electron on first run,
then just opens).

Node 18+ required. First `npm install` downloads Electron (~100 MB).

---

## What's inside

| Feature | Where |
|---|---|
| **Customizable Home + Hot Tabs** — Apple-style squircle icons, custom image upload or favicon fallback, per-tab hotkey, single-URL or macro (open many at once). Background = image / gradient / raw CSS. | `renderer/components/home.js`, `hottabs.js` |
| **Fully modular sidebar** — widget registry: `nav`, `button` (e.g. a "bruh" button), `macro` (open 20 AI checkers in one click), `links`, `clock`, `notes`, `label`, `divider`, `js` (arbitrary snippet). Edit mode adds / removes / drag-reorders. All persisted. | `renderer/components/sidebar.js`, `widgets/registry.js` |
| **Liquid glass aesthetic** — one `.glass` class: layered translucency, backdrop blur, specular edge, lantern bloom. Live-tuned by translucency / blur / accent sliders. | `renderer/styles/glass.css`, `tokens.css` |
| **Ember Lantern theme** — warm ambient orange, soft lantern glows, deep terracotta/rust accents, muted beige on a warm low-light wall. Plus Midnight Glass and Aurora. | `renderer/styles/themes/*` |
| **Opera GX-style modpacks + audio** — portable modpack JSON (theme + audio + background), import/export. UI sounds are **synthesised** (WebAudio) so no assets ship: mechanical key clacks, soft blips, per-event toggles, volume. A modpack may override any sound with its own sample. | `renderer/modpacks/`, `renderer/audio/sfx.js` |
| **Cloud Vision AI** — Settings holds encrypted API keys for Anthropic / OpenAI / Gemini (OS keychain via `safeStorage`, never exposed to the renderer). A global hotkey (default `⌘⇧Space`) captures the page **or** the whole screen, opens the side panel, and sends screenshot + your prompt to the active model. | `main/vision.js`, `main/screenshot.js`, `main/shortcuts.js`, `renderer/components/visionpanel.js` |
| **Core browser** — address bar (smart URL/search), back/forward/reload/home, tab strip, `⌘T ⌘W ⌘L ⌘R ⌘[ ⌘]`, popups routed to tabs. Web content rendered via `<webview>` on a persistent partition. | `renderer/core/tabs.js`, `components/titlebar.js` |
| **Extensions** — load an unpacked Chrome-style extension folder; Electron supports a useful subset of MV2/MV3. Loaded set is remembered and reloaded on launch. | `main/extensions.js` |
| **Self-coding companion** — an Anthropic tool-use agent embedded in a panel, with `list_files` / `read_file` / `search` / `write_file` scoped to Comet's own source tree. It can implement features in the browser itself. Every write backs the original up to `*.bak-DATE` and pops an approve bar — unless you flip on **Autonomous mode**. | `main/companion/agent.js`, `main/companion/tools.js`, `renderer/components/companionpanel.js` |

---

## File structure

```
Comet/
├── package.json                  one dependency: electron
├── start.command                 double-click launcher (macOS)
├── README.md
└── src/
    ├── main/                     ── main process ──────────────────
    │   ├── main.js               window, webview host, lifecycle
│   ├── menu.js               app menu = every browser shortcut
│   ├── contextmenu.js        native right-click menus
│   ├── shield.js             tracker blocking, HTTPS-only, GPC
│   ├── permissions.js        per-site permission prompts
│   ├── downloads.js          download tracking
│   ├── history.js            local browsing history
│   ├── ipc-browser.js        v0.4 channels
│   ├── assistant/            Comet AI: agent loop (Ollama + Claude), tools, web search, chats, voice
    │   ├── store.js              JSON config (merged over defaults) + encrypted secrets
    │   ├── ipc.js                every "flux:*" channel in one place
    │   ├── vision.js             Anthropic / OpenAI / Gemini vision adapters
    │   ├── screenshot.js         whole-screen capture (desktopCapturer)
    │   ├── shortcuts.js          global hotkey registration
    │   ├── extensions.js         load / list / remove unpacked extensions
    │   └── companion/
    │       ├── agent.js          Anthropic tool-use loop
    │       └── tools.js          fs tools, sandboxed to the project root
    ├── preload/
    │   ├── preload.js            contextBridge → window.flux (the only bridge)
    │   └── webview-preload.js    relays in-page keyboard shortcuts only
    └── renderer/                 ── UI (vanilla ES modules, no bundler) ──
        ├── index.html
        ├── app.js               bootstrap, view switching, shortcuts
        ├── core/                dom.js · bus.js · state.js · tabs.js
        ├── audio/sfx.js         synthesised UI sound engine
        ├── modpacks/index.js    bundled packs + import/export
        ├── styles/              tokens.css · glass.css · app.css · themes/
        └── components/          titlebar · sidebar · widgets/ · home · hottabs
                                 · visionpanel · companionpanel · settings
```

---

## Config & data

Everything lives under Electron's user-data dir
(`~/Library/Application Support/Comet/`):

- `config.json` — safe to read / share / hand-edit; merged over defaults on load, bad values degrade to defaults.
- `secrets.json` — `0600`, API keys encrypted with the OS keychain when available.
- `wallpaper.jpg` — the Home wallpaper (kept out of `config.json` so it stays small).

Delete either file to reset that half.

## Things that will bite you

- **Whole-screen capture** needs macOS *Screen Recording* permission (System Settings → Privacy). Page capture doesn't.
- **`<webview>`** is how Comet renders the web. It's the pragmatic choice for a custom browser UI; if Electron ever drops it, migrate `core/tabs.js` to `WebContentsView`.
- **Extensions**: MV3 support in Electron is partial. Service-worker-only extensions may not fully work.
- The **companion** uses the same Anthropic key as Vision AI. With Autonomous mode off, nothing is written without you clicking Approve.
- Model ids (`claude-sonnet-5`, `gpt-4o`, `gemini-1.5-flash`) are defaults — change them in Settings if your account uses different ones.
