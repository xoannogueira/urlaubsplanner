import type { CalendarDay, CalendarPattern, PriceCalendar } from '../api/priceCalendars'
import { shiftDate } from './flights'
import { googleFlightsUrl } from './googleFlights'
import { WEEKDAYS } from './priceStats'

export const patternLabels: Record<CalendarPattern, string> = {
  Daily: 'Jeden Tag',
  EveryOther: 'Jeden 2. Tag',
  EveryThird: 'Jeden 3. Tag',
  Weekends: 'Nur Freitag & Samstag',
  Weekly: 'Einmal pro Woche',
}

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

const iso = (d: Date) => d.toISOString().slice(0, 10)
const utc = (s: string) => new Date(`${s}T00:00:00Z`)
export const weekdayIndex = (s: string) => (utc(s).getUTCDay() + 6) % 7

/** Gleiche Regeln wie im Backend – für die Vorschau „so viele Suchen“ ohne Server-Anfrage. */
export function calendarDates(from: string, to: string, pattern: CalendarPattern): string[] {
  const out: string[] = []
  const start = utc(from)
  for (let d = new Date(start); iso(d) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const offset = Math.round((d.getTime() - start.getTime()) / 86_400_000)
    const wd = weekdayIndex(iso(d))
    const take =
      pattern === 'EveryOther'
        ? offset % 2 === 0
        : pattern === 'EveryThird'
          ? offset % 3 === 0
          : pattern === 'Weekends'
            ? wd === 4 || wd === 5
            : pattern === 'Weekly'
              ? offset % 7 === 0
              : true
    if (take) out.push(iso(d))
  }
  return out
}

/** Zeitraum aus Startmonat („2026-12“) und Anzahl Monaten – frühestens morgen, spätestens 330 Tage minus Reisedauer. */
export function monthRange(startMonth: string, months: number, today: string, nights: number | null): { from: string; to: string } {
  const first = utc(`${startMonth}-01`)
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + months, 0))
  const tomorrow = utc(today)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const latest = utc(today)
  latest.setUTCDate(latest.getUTCDate() + 330 - (nights ?? 0))
  const from = first < tomorrow ? tomorrow : first
  const to = last > latest ? latest : last
  return { from: iso(from), to: iso(to) }
}

/** Die nächsten 11 Monate zur Auswahl: [{ value: "2026-11", label: "November 2026" }] */
export function upcomingMonths(today: string, count = 11): { value: string; label: string }[] {
  const d = utc(today)
  return Array.from({ length: count }, (_, i) => {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1))
    return { value: iso(m).slice(0, 7), label: `${MONTHS[m.getUTCMonth()]} ${m.getUTCFullYear()}` }
  })
}

export interface MonthGrid {
  key: string
  label: string
  /** Wochen mit 7 Feldern (Mo–So); null = Tag gehört nicht zum Monat */
  weeks: ({ date: string; day: CalendarDay | null; inRange: boolean } | null)[][]
}

/** Monatskalender mit den geladenen Tagen. */
export function monthGrids(c: Pick<PriceCalendar, 'from' | 'to' | 'days'>): MonthGrid[] {
  const byDate = new Map(c.days.map((d) => [d.date, d]))
  const grids: MonthGrid[] = []
  const start = utc(c.from)
  const end = utc(c.to)
  for (
    let m = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    m <= end;
    m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))
  ) {
    const days = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).getUTCDate()
    const cells: MonthGrid['weeks'][number] = Array.from({ length: weekdayIndex(iso(m)) }, () => null)
    for (let d = 1; d <= days; d++) {
      const date = iso(new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), d)))
      cells.push({ date, day: byDate.get(date) ?? null, inRange: date >= c.from && date <= c.to })
    }
    while (cells.length % 7) cells.push(null)
    const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7))
    grids.push({ key: iso(m).slice(0, 7), label: `${MONTHS[m.getUTCMonth()]} ${m.getUTCFullYear()}`, weeks })
  }
  return grids
}

const median = (xs: number[]) => {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

export interface Group {
  label: string
  min: number | null
  median: number | null
  count: number
}

const priced = (days: CalendarDay[]) => days.filter((d): d is CalendarDay & { cheapest: number } => d.cheapest !== null)

/** Pro Wochentag des Abflugs: günstigster und mittlerer Preis. */
export function byWeekday(days: CalendarDay[]): Group[] {
  const list = priced(days)
  return WEEKDAYS.map((label, i) => {
    const prices = list.filter((d) => weekdayIndex(d.date) === i).map((d) => d.cheapest)
    return { label, min: prices.length ? Math.min(...prices) : null, median: median(prices), count: prices.length }
  })
}

/** Pro Monat: günstigster und mittlerer Preis. */
export function byMonth(days: CalendarDay[]): Group[] {
  const list = priced(days)
  const months = [...new Set(list.map((d) => d.date.slice(0, 7)))].sort()
  return months.map((m) => {
    const prices = list.filter((d) => d.date.startsWith(m)).map((d) => d.cheapest)
    return {
      label: `${MONTHS[Number(m.slice(5, 7)) - 1].slice(0, 3)} ${m.slice(2, 4)}`,
      min: Math.min(...prices),
      median: median(prices),
      count: prices.length,
    }
  })
}

/** Die günstigsten Abflugtage. */
export const cheapestDays = (days: CalendarDay[], n = 5) => [...priced(days)].sort((a, b) => a.cheapest - b.cheapest).slice(0, n)

/**
 * Link zu Google Flights für einen Tag aus dem Kalender – zum genauen Nachprüfen eines Aviasales-Richtpreises,
 * kostet keine Suche. Nimmt die Strecke des günstigsten Preises, sonst die erste gewählte.
 */
export function checkOnGoogleUrl(
  c: Pick<PriceCalendar, 'origins' | 'destinations' | 'nights'>,
  day: Pick<CalendarDay, 'date' | 'route'>,
): string | null {
  const [origin, destination] = day.route?.split('-') ?? [c.origins[0], c.destinations[0]]
  if (!origin || !destination) return null
  const out = `${origin}-${destination}@${day.date}:`
  const signature = c.nights ? `${out}|${destination}-${origin}@${shiftDate(day.date, c.nights)}:` : out
  return googleFlightsUrl(signature, 1)
}

/** Wie viele Aviasales-Abfragen ein Kalender braucht: pro Monat und Strecke eine, bei Hin & zurück auch zurück. */
export function aviasalesRequests(from: string, to: string, nights: number | null, routes: number): number {
  const months = (end: string) =>
    (Number(end.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(end.slice(5, 7)) - Number(from.slice(5, 7)) + 1
  const outbound = months(to)
  const inbound = nights ? months(shiftDate(to, nights)) : 0
  return (outbound + inbound) * routes
}
