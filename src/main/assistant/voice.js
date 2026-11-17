// ───────────────────────────────────────────────────────────────────
//  assistant/voice.js — mic → text.  The renderer records audio; this
//  transcribes it with OpenAI's speech-to-text using the OpenAI key from
//  Settings (Claude has no speech-to-text endpoint).  macOS dictation
//  (press Fn twice in any field) works with no key at all.
// ───────────────────────────────────────────────────────────────────
const { ipcMain, systemPreferences } = require("electron")
const { secrets } = require("../store")

async function transcribe ({ audio, mime }) {
  const key = secrets.getSecret("openai")
  if (!key) return { ok: false, needsKey: true, text: "Voice input uses an OpenAI key (Settings → API Keys). Or press Fn twice to use macOS dictation." }
  try {
    const bytes = Buffer.from(audio)
    if (bytes.length < 2000) return { ok: false, text: "Didn't catch anything — hold the mic a little longer." }
    const ext = /mp4|m4a/.test(mime) ? "m4a" : /ogg/.test(mime) ? "ogg" : "webm"
    const form = new FormData()
    form.append("file", new Blob([bytes], { type: mime || "audio/webm" }), `speech.${ext}`)
    form.append("model", "whisper-1")
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST", headers: { authorization: `Bearer ${key}` }, body: form
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, text: json?.error?.message ?? `Transcription failed (HTTP ${res.status})` }
    return { ok: true, text: String(json.text ?? "").trim() }
  } catch (e) {
    return { ok: false, text: `Transcription failed: ${e.message}` }
  }
}

function registerVoiceIpc () {
  ipcMain.handle("flux:voice:transcribe", (_e, args) => transcribe(args ?? {}))
  ipcMain.handle("flux:voice:permission", async () => {
    if (process.platform !== "darwin") return { ok: true }
    try {
      const status = systemPreferences.getMediaAccessStatus("microphone")
      if (status === "granted") return { ok: true }
      return { ok: await systemPreferences.askForMediaAccess("microphone") }
    } catch (e) { return { ok: false, text: e.message } }
  })
}

module.exports = { registerVoiceIpc }
