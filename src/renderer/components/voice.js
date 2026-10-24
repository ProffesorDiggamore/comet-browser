// ───────────────────────────────────────────────────────────────────
//  voice.js — push-to-talk for the mic buttons.  Click to start, click
//  again to stop (auto-stops after 45s).  Audio is transcribed in the
//  main process; the text comes back to the caller.
// ───────────────────────────────────────────────────────────────────
import { bus, toast } from "../core/bus.js"

let rec = null

export function isRecording () { return !!rec }

export async function toggleVoice (onText) {
  if (rec) { rec.stop(); return }
  const perm = await window.flux.voice.permission()
  if (!perm.ok) { toast("Microphone access is off — enable Flux/Electron in System Settings → Privacy → Microphone."); return }
  let stream
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }) }
  catch (e) { toast(`Mic unavailable: ${e.message}`); return }
  const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm"
  const chunks = []
  const r = new MediaRecorder(stream, { mimeType: mime })
  rec = r
  const cap = setTimeout(() => r.state === "recording" && r.stop(), 45_000)
  r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
  r.onstop = async () => {
    clearTimeout(cap)
    stream.getTracks().forEach((t) => t.stop())
    rec = null
    bus.emit("voice:state", false)
    const buf = new Uint8Array(await new Blob(chunks, { type: mime }).arrayBuffer())
    bus.emit("voice:busy", true)
    const res = await window.flux.voice.transcribe(buf, mime)
    bus.emit("voice:busy", false)
    if (!res.ok) { toast(res.text); return }
    if (res.text) onText(res.text)
  }
  r.start(250)
  bus.emit("voice:state", true)
}
