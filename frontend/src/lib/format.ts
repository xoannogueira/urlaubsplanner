const euroWhole = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const euroCents = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })

/** 1136 → "1.136 €", 12.5 → "12,50 €" */
export function formatEuro(value: number): string {
  return Number.isInteger(value) ? euroWhole.format(value) : euroCents.format(value)
}

/** "2027-05-12" → Date um 00:00 UTC, damit keine Zeitzone das Datum verschiebt. */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

const dayMonthYear = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayMonth = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const weekdayDay = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const monthName = new Intl.DateTimeFormat('de-DE', { month: 'long', timeZone: 'UTC' })

export function formatDate(iso: string): string {
  return dayMonthYear.format(parseDate(iso))
}

export function formatShortDate(iso: string): string {
  return weekdayDay.format(parseDate(iso))
}

/**
 * Kompakter Zeitraum:
 * gleicher Monat → "12.–16. Mai 2027", gleiches Jahr → "28. Apr. – 3. Mai 2027", sonst beide voll.
 */
export function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return 'Zeitraum offen'
  if (!start || !end) return formatDate((start ?? end)!)

  const s = parseDate(start)
  const e = parseDate(end)
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear()
  const sameMonth = sameYear && s.getUTCMonth() === e.getUTCMonth()

  if (sameMonth) {
    return s.getUTCDate() === e.getUTCDate()
      ? formatDate(end)
      : `${s.getUTCDate()}.–${e.getUTCDate()}. ${monthName.format(e)} ${e.getUTCFullYear()}`
  }
  if (sameYear) return `${dayMonth.format(s)} – ${dayMonth.format(e)} ${e.getUTCFullYear()}`
  return `${formatDate(start)} – ${formatDate(end)}`
}

export function nightsLabel(nights: number): string {
  return nights === 1 ? '1 Nacht' : `${nights} Nächte`
}

export function peopleLabel(count: number): string {
  return count === 1 ? '1 Person' : `${count} Personen`
}

/** "https://www.booking.com/hotel/…" → "booking.com" */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'heute'
  if (days === 1) return 'gestern'
  return `vor ${days} Tagen`
}
