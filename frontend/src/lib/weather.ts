import type { Stage } from '../api/types'
import type { WeatherDay } from '../api/weather'

export type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm'

/** WMO-Wettercode → Art und deutsches Wort. */
export function weatherKind(code: number): WeatherKind {
  if (code <= 1) return 'clear'
  if (code === 2) return 'partly'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'storm'
  return 'rain'
}

const labels: Record<WeatherKind, string> = {
  clear: 'Sonnig',
  partly: 'Wechselhaft',
  cloudy: 'Bewölkt',
  fog: 'Neblig',
  drizzle: 'Nieselregen',
  rain: 'Regen',
  snow: 'Schnee',
  storm: 'Gewitter',
}

export const weatherLabel = (code: number) => labels[weatherKind(code)]

export const formatTemp = (value: number) => `${Math.round(value)}°`

/** "24° / 15°" */
export const tempRange = (day: Pick<WeatherDay, 'tempMax' | 'tempMin'>) => `${formatTemp(day.tempMax)} / ${formatTemp(day.tempMin)}`

/** "Sonnig, 24° / 15°, Regen 20 %" – für PDF und Tooltips. */
export function weatherLine(day: WeatherDay): string {
  const rain = day.rainChance !== null && day.rainChance >= 10 ? `, Regen ${day.rainChance} %` : ''
  return `${weatherLabel(day.code)}, ${tempRange(day)}${rain}`
}

export type WeatherByDate = Map<string, WeatherDay & { stageId: string }>

/** Wetter je Kalendertag. Am Wechseltag gilt der Ort, an dem man übernachtet (die spätere Etappe). */
export function tripWeatherByDate(stages: Stage[], byStage: Map<string, WeatherDay[]>): WeatherByDate {
  const map: WeatherByDate = new Map()
  for (const stage of [...stages].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
    for (const day of byStage.get(stage.id) ?? []) map.set(day.date, { ...day, stageId: stage.id })
  }
  return map
}

export interface WeatherSummary {
  code: number
  /** Anteil der Tage mit dieser Wetterlage (0–1) */
  share: number
  tempMax: number
  tempMin: number
  /** Tage mit Regenwahrscheinlichkeit ab 50 % bzw. mindestens 1 mm */
  rainyDays: number
  days: number
  source: 'Forecast' | 'Climate' | 'Mixed'
  years: number | null
}

/** Zusammenfassung einer Etappe: wärmster Mittag, kühlste Nacht, häufigstes Wetter, Regentage. */
export function summarizeWeather(days: WeatherDay[]): WeatherSummary | null {
  if (days.length === 0) return null
  const counts = new Map<WeatherKind, { n: number; code: number }>()
  for (const d of days) {
    const kind = weatherKind(d.code)
    const entry = counts.get(kind) ?? { n: 0, code: d.code }
    counts.set(kind, { n: entry.n + 1, code: entry.code })
  }
  const order: WeatherKind[] = ['clear', 'partly', 'cloudy', 'fog', 'drizzle', 'rain', 'snow', 'storm']
  const [, typical] = [...counts.entries()].sort((a, b) => b[1].n - a[1].n || order.indexOf(a[0]) - order.indexOf(b[0]))[0]
  const sources = new Set(days.map((d) => d.source))
  return {
    code: typical.code,
    share: typical.n / days.length,
    tempMax: Math.max(...days.map((d) => d.tempMax)),
    tempMin: Math.min(...days.map((d) => d.tempMin)),
    rainyDays: days.filter(isRainy).length,
    days: days.length,
    source: sources.size > 1 ? 'Mixed' : days[0].source,
    years: days.find((d) => d.years !== null)?.years ?? null,
  }
}

export const isRainy = (d: WeatherDay) => (d.rainChance ?? 0) >= 50 || d.precipitationMm >= 1

/** "meist sonnig, 15–24 °C, 2 Regentage" – „meist“ nur, wenn es mindestens die Hälfte der Tage so ist. */
export function summaryLine(s: WeatherSummary): string {
  const rain = s.rainyDays === 0 ? 'kaum Regen' : s.rainyDays === 1 ? '1 Regentag' : `${s.rainyDays} Regentage`
  const sky = s.share >= 0.5 ? `meist ${weatherLabel(s.code).toLowerCase()}` : 'wechselhaft'
  return `${sky}, ${Math.round(s.tempMin)}–${Math.round(s.tempMax)} °C, ${rain}`
}

/** Symbol für die Zusammenfassung: bei gemischtem Wetter das für „wechselhaft“. */
export const summaryCode = (s: WeatherSummary) => (s.share >= 0.5 ? s.code : 2)

/** "Vorhersage" / "typisch (Ø 5 Jahre)" / "Vorhersage + typisch" */
export function sourceLabel(s: Pick<WeatherSummary, 'source' | 'years'>): string {
  if (s.source === 'Forecast') return 'Vorhersage'
  const typical = s.years ? `typisch (Ø ${s.years} Jahre)` : 'typisch'
  return s.source === 'Mixed' ? `Vorhersage + ${typical}` : typical
}
