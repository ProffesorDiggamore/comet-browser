// ───────────────────────────────────────────────────────────────────
//  contextmenu.js — native right-click menus.  Web pages get the full
//  browser set (links, images, selection, spelling, Ask Comet AI,
//  inspect); the Comet UI itself gets editing basics in text fields.
//  Actions that need the tab model are forwarded to the renderer.
// ───────────────────────────────────────────────────────────────────
const { Menu, clipboard, shell } = require("electron")

function trim (s, n = 32) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim()
  return t.length > n ? t.slice(0, n - 1) + "…" : t
}

function attachContextMenu (contents, getWin) {
  const isPage = contents.getType() === "webview"
  const send = (channel, payload) => {
    const w = getWin()
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload)
  }

  contents.on("context-menu", (_e, p) => {
    const t = []
    const sep = () => { if (t.length && t[t.length - 1].type !== "separator") t.push({ type: "separator" }) }

    // spelling
    if (p.misspelledWord) {
      for (const s of (p.dictionarySuggestions ?? []).slice(0, 5)) t.push({ label: s, click: () => contents.replaceMisspelling(s) })
      if (!p.dictionarySuggestions?.length) t.push({ label: "No suggestions", enabled: false })
      t.push({ label: "Add to Dictionary", click: () => contents.session.addWordToSpellCheckerDictionary(p.misspelledWord) })
      sep()
    }

    if (isPage && p.linkURL) {
      t.push(
        { label: "Open Link in New Tab", click: () => send("flux:open-tab", { url: p.linkURL, background: true, from: contents.id }) },
        { label: "Peek at Link  (⇧-click)", visible: /^https?:/i.test(p.linkURL), click: () => send("flux:menu", { action: "peek", url: p.linkURL, from: contents.id }) },
        { label: "Open Link in Private Tab", click: () => send("flux:open-tab", { url: p.linkURL, private: true }) },
        { label: "Open Link in Split View", click: () => send("flux:menu", { action: "split-with-url", url: p.linkURL }) },
        { label: "Open Link in System Browser", click: () => /^https?:/.test(p.linkURL) && shell.openExternal(p.linkURL) },
        { label: "Copy Link", click: () => clipboard.writeText(p.linkURL) },
        { label: "Ask Comet AI About Link", click: () => send("flux:ai:ask", { text: `What's at this link? ${p.linkURL}`, openLink: p.linkURL }) }
      )
      sep()
    }

    if (isPage && p.mediaType === "image" && p.srcURL) {
      t.push(
        { label: "Open Image in New Tab", click: () => send("flux:open-tab", { url: p.srcURL, background: true, from: contents.id }) },
        { label: "Save Image…", click: () => contents.downloadURL(p.srcURL) },
        { label: "Copy Image", click: () => contents.copyImageAt(p.x, p.y) },
        { label: "Copy Image Address", click: () => clipboard.writeText(p.srcURL) },
        { type: "separator", visible: /^https?:/i.test(p.srcURL) },
        { label: "Search Image with Google Lens", visible: /^https?:/i.test(p.srcURL), click: () => send("flux:open-tab", { url: `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(p.srcURL)}`, from: contents.id }) }
      )
      sep()
    }

    if (isPage && (p.mediaType === "video" || p.mediaType === "audio")) {
      t.push(
        { label: "Picture in Picture", visible: p.mediaType === "video", click: () => send("flux:menu", { action: "pip" }) },
        { label: p.mediaFlags?.isPaused ? "Play" : "Pause", click: () => contents.executeJavaScript(`(()=>{const m=document.elementFromPoint(${p.x},${p.y});const v=m&&m.closest('video,audio')||document.querySelector('video,audio');if(v){v.paused?v.play():v.pause()}})()`, true) },
        { label: "Save Media…", enabled: /^https?:/.test(p.srcURL ?? ""), click: () => contents.downloadURL(p.srcURL) }
      )
      sep()
    }

    const sel = (p.selectionText ?? "").trim()
    if (p.isEditable) {
      t.push(
        { role: "undo", enabled: p.editFlags.canUndo }, { role: "redo", enabled: p.editFlags.canRedo }, { type: "separator" },
        { role: "cut", enabled: p.editFlags.canCut }, { role: "copy", enabled: p.editFlags.canCopy },
        { role: "paste", enabled: p.editFlags.canPaste }, { role: "pasteAndMatchStyle", enabled: p.editFlags.canPaste },
        { role: "selectAll" }
      )
      sep()
    } else if (sel) {
      t.push({ role: "copy" })
    }

    if (isPage && sel) {
      t.push(
        { label: `Search for “${trim(sel, 24)}”`, click: () => send("flux:open-tab", { url: sel, background: false, search: true }) },
        { label: `Ask Comet AI: “${trim(sel, 22)}”`, click: () => send("flux:ai:ask", { text: `Explain this:\n\n"${sel.slice(0, 4000)}"` }) },
        { label: "Translate with Comet AI", click: () => send("flux:ai:ask", { text: `Translate this to English (or to Spanish if it's already English):\n\n"${sel.slice(0, 4000)}"` }) },
        { label: "Look Up", click: () => contents.showDefinitionForSelection?.() }
      )
      sep()
    }

    if (isPage && !p.linkURL && !sel && !p.isEditable && p.mediaType === "none") {
      const nh = contents.navigationHistory
      t.push(
        { label: "Back", enabled: nh?.canGoBack?.() ?? contents.canGoBack(), click: () => (nh?.goBack ? nh.goBack() : contents.goBack()) },
        { label: "Forward", enabled: nh?.canGoForward?.() ?? contents.canGoForward(), click: () => (nh?.goForward ? nh.goForward() : contents.goForward()) },
        { label: "Reload", click: () => contents.reload() },
        { type: "separator" },
        { label: "Summarize Page with Comet AI", click: () => send("flux:ai:ask", { text: "Summarize this page: key points, then anything I should act on.", withPage: true }) },
        { label: "Reader Mode", click: () => send("flux:menu", { action: "reader" }) },
        { label: "Bookmark Page", click: () => send("flux:menu", { action: "bookmark" }) },
        { label: "Copy Page Link", click: () => clipboard.writeText(contents.getURL()) },
        { label: "Save Screenshot", click: () => send("flux:menu", { action: "screenshot" }) },
        { label: "View Page Source", click: () => send("flux:open-tab", { url: `view-source:${contents.getURL()}` }) }
      )
      sep()
    }

    if (isPage) t.push({ label: "Inspect Element", click: () => contents.inspectElement(p.x, p.y) })
    while (t.length && t[t.length - 1].type === "separator") t.pop()
    if (!t.length) return
    Menu.buildFromTemplate(t).popup({ window: getWin() ?? undefined })
  })
}

module.exports = { attachContextMenu }
