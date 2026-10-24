// ───────────────────────────────────────────────────────────────────
//  weather.js — the Home weather widget's data.  Open-Meteo: free, no
//  account, no key.  Runs in main so the renderer's CSP stays closed;
//  cached 20 minutes per city.  Offline → the widget says so.
// ───────────────────────────────────────────────────────────────────
const { ipcMain } = require("electron")

const TTL_MS = 20 * 60_000
const cache = new Map()   // city -> { t, data }

async function getJson (url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

async function weather (city, unit) {
  const key = `${city}|${unit}`.toLowerCase()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.t < TTL_MS) return hit.data
  const geo = await getJson(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}`)
  const place = geo.results?.[0]
  if (!place) throw new Error(`Couldn't find “${city}”`)
  const f = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
    "&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=5&timezone=auto" +
    (unit === "f" ? "&temperature_unit=fahrenheit" : ""))
  const data = {
    place: place.name,
    temp: Math.round(f.current.temperature_2m),
    code: f.current.weather_code,
    day: !!f.current.is_day,
    hi: Math.round(f.daily.temperature_2m_max[0]),
    lo: Math.round(f.daily.temperature_2m_min[0]),
    days: f.daily.time.map((d, i) => ({ d, hi: Math.round(f.daily.temperature_2m_max[i]), lo: Math.round(f.daily.temperature_2m_min[i]), code: f.daily.weather_code[i] }))
  }
  cache.set(key, { t: Date.now(), data })
  return data
}

function registerWeatherIpc () {
  ipcMain.handle("flux:weather", async (_e, { city, unit } = {}) => {
    if (!city) return { ok: false, text: "No city set" }
    try { return { ok: true, ...(await weather(String(city), unit === "c" ? "c" : "f")) } } catch (e) { return { ok: false, text: e.message } }
  })
}

module.exports = { registerWeatherIpc }
