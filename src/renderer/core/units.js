// ───────────────────────────────────────────────────────────────────
//  units.js — quick unit conversion for the address bar / Home search:
//  "5 km to mi", "72f in c", "3 lb to kg", "1.5 l in cups", "90 min to h",
//  "2 gb in mb".  Pure arithmetic, nothing leaves Comet.
// ───────────────────────────────────────────────────────────────────
// [dimension, size in the base unit, names…]
const U = [
  ["len", 1, "m", "meter", "meters", "metre", "metres"], ["len", 1000, "km", "kilometer", "kilometers", "kilometre", "kilometres"],
  ["len", 0.01, "cm", "centimeter", "centimeters"], ["len", 0.001, "mm", "millimeter", "millimeters"],
  ["len", 1609.344, "mi", "mile", "miles"], ["len", 0.9144, "yd", "yard", "yards"], ["len", 0.3048, "ft", "foot", "feet", "'"],
  ["len", 0.0254, "in", "inch", "inches", "\""], ["len", 1852, "nmi", "nautical mile", "nautical miles"],
  ["mass", 1, "kg", "kilo", "kilos", "kilogram", "kilograms"], ["mass", 0.001, "g", "gram", "grams"], ["mass", 1e-6, "mg", "milligram", "milligrams"],
  ["mass", 0.45359237, "lb", "lbs", "pound", "pounds"], ["mass", 0.028349523125, "oz", "ounce", "ounces"], ["mass", 6.35029318, "st", "stone", "stones"],
  ["mass", 1000, "t", "tonne", "tonnes", "metric ton"],
  ["vol", 1, "l", "liter", "liters", "litre", "litres"], ["vol", 0.001, "ml", "milliliter", "milliliters", "millilitre"],
  ["vol", 3.785411784, "gal", "gallon", "gallons"], ["vol", 0.946352946, "qt", "quart", "quarts"], ["vol", 0.473176473, "pt", "pint", "pints"],
  ["vol", 0.2365882365, "cup", "cups"], ["vol", 0.0295735295625, "fl oz", "floz", "fluid ounce", "fluid ounces"],
  ["vol", 0.01478676478, "tbsp", "tablespoon", "tablespoons"], ["vol", 0.00492892159, "tsp", "teaspoon", "teaspoons"],
  ["speed", 1, "m/s", "mps"], ["speed", 1 / 3.6, "km/h", "kmh", "kph"], ["speed", 0.44704, "mph"], ["speed", 0.514444, "kn", "knot", "knots"],
  ["time", 1, "s", "sec", "secs", "second", "seconds"], ["time", 60, "min", "mins", "minute", "minutes"], ["time", 3600, "h", "hr", "hrs", "hour", "hours"],
  ["time", 86400, "d", "day", "days"], ["time", 604800, "wk", "week", "weeks"], ["time", 0.001, "ms", "millisecond", "milliseconds"],
  ["data", 1, "b", "byte", "bytes"], ["data", 1e3, "kb", "kilobyte", "kilobytes"], ["data", 1e6, "mb", "megabyte", "megabytes"],
  ["data", 1e9, "gb", "gigabyte", "gigabytes"], ["data", 1e12, "tb", "terabyte", "terabytes"],
  ["data", 1024, "kib"], ["data", 1024 ** 2, "mib"], ["data", 1024 ** 3, "gib"], ["data", 1024 ** 4, "tib"],
  ["area", 1, "m2", "m²", "sq m", "square meter", "square meters"], ["area", 0.09290304, "ft2", "ft²", "sq ft", "square foot", "square feet"],
  ["area", 4046.8564224, "acre", "acres"], ["area", 10000, "ha", "hectare", "hectares"], ["area", 1e6, "km2", "km²", "sq km"],
  ["area", 2589988.110336, "mi2", "mi²", "sq mi"]
]
const BY = new Map()
const show = (dim, n) => (dim === "data" ? n.toUpperCase().replace("IB", "iB") : n === "l" ? "L" : n === "ml" ? "mL" : n)
for (const [dim, k, ...names] of U) for (const n of names) BY.set(n, { dim, k, sym: show(dim, names[0]) })
const TEMP = { c: "°C", celsius: "°C", "°c": "°C", f: "°F", fahrenheit: "°F", "°f": "°F", k: "K", kelvin: "K" }

const unitOf = (s) => {
  const n = s.trim().toLowerCase().replace(/\.$/, "")
  if (TEMP[n]) return { dim: "temp", sym: TEMP[n] }
  return BY.get(n) ?? BY.get(n.replace(/s$/, "")) ?? null
}
const toC = (v, u) => (u === "°C" ? v : u === "°F" ? (v - 32) * 5 / 9 : v - 273.15)
const fromC = (v, u) => (u === "°C" ? v : u === "°F" ? v * 9 / 5 + 32 : v + 273.15)

const RX = /^(-?\d+(?:[.,]\d+)?)\s*(.+?)\s+(?:to|in|into|as|=|->|→)\s+(.+?)\??$/i

// → { value, text } or null
export function convert (q) {
  const m = RX.exec(String(q ?? "").trim())
  if (!m) return null
  const v = Number(m[1].replace(",", "."))
  const a = unitOf(m[2]), b = unitOf(m[3])
  if (!a || !b || a.dim !== b.dim || a.sym === b.sym) return null
  const out = a.dim === "temp" ? fromC(toC(v, a.sym), b.sym) : (v * a.k) / b.k
  if (!Number.isFinite(out)) return null
  const value = Math.abs(out) >= 1000 ? Math.round(out * 100) / 100 : Number(out.toPrecision(6))
  const unit = b.dim === "temp" ? b.sym : ` ${b.sym}`
  return { value, text: `${v.toLocaleString()}${a.dim === "temp" ? a.sym : ` ${a.sym}`} = ${value.toLocaleString(undefined, { maximumFractionDigits: 6 })}${unit}` }
}
