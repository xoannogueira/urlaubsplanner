const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const WEEKDAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

export interface CalendarDay {
  iso: string
  day: number
  inMonth: boolean
  /** „Freitag, 30. Oktober 2026“ – für Screenreader */
  label: string
}

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d))
const iso = (d: Date) => d.toISOString().slice(0, 10)

/** "2026-10" → "Oktober 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

/** "2026-10", -1 → "2026-09" */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  return iso(utc(y, m - 1 + delta, 1)).slice(0, 7)
}

/** Wochen eines Monats, Montag zuerst, aufgefüllt mit Tagen aus Vor- und Folgemonat (immer 6 Wochen). */
export function calendarWeeks(month: string): CalendarDay[][] {
  const [y, m] = month.split('-').map(Number)
  const first = utc(y, m - 1, 1)
  const offset = (first.getUTCDay() + 6) % 7 // Montag = 0
  const start = utc(y, m - 1, 1 - offset)
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = utc(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + w * 7 + d)
      return {
        iso: iso(date),
        day: date.getUTCDate(),
        inMonth: date.getUTCMonth() === m - 1,
        label: `${WEEKDAY_NAMES[date.getUTCDay()]}, ${date.getUTCDate()}. ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`,
      }
    }),
  )
}
