/**
 * Getippte Daten und Uhrzeiten im deutschen Format verstehen – unabhängig von der Spracheinstellung des Browsers
 * (das eingebaute Datumsfeld zeigt z. B. bei englischem Browser MM/TT/JJJJ und 12-Stunden-Uhr).
 */

/** "2027-02-19" → "19.02.2027" */
export function isoToGerman(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ''
}

/**
 * "19.02.2027", "19.2.27", "19022027", "19.02." (Jahr ergänzt aus `yearHint`) → "2027-02-19".
 * Ungültige Tage (31.02.) → null.
 */
export function parseGermanDate(text: string, yearHint?: number): string | null {
  const t = text.trim()
  let day: number, month: number, year: number
  const digits = /^(\d{2})(\d{2})(\d{4}|\d{2})$/.exec(t)
  const dotted = /^(\d{1,2})[./-](\d{1,2})[./-]?(\d{4}|\d{2})?$/.exec(t)
  if (digits) {
    ;[day, month, year] = [Number(digits[1]), Number(digits[2]), Number(digits[3])]
  } else if (dotted) {
    day = Number(dotted[1])
    month = Number(dotted[2])
    if (dotted[3]) year = Number(dotted[3])
    else if (yearHint) year = yearHint
    else return null
  } else {
    return null
  }
  if (year < 100) year += 2000
  if (month < 1 || month > 12 || day < 1 || year < 1900 || year > 2200) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCMonth() !== month - 1) return null
  return date.toISOString().slice(0, 10)
}

/** Beim Tippen von Ziffern die Punkte ergänzen: "1902" → "19.02", "19022027" → "19.02.2027". */
export function maskGermanDate(previous: string, next: string): string {
  // Beim Löschen nichts ergänzen
  if (next.length < previous.length) return next
  if (!/^[\d.]*$/.test(next)) return next
  const onlyDigits = next.replace(/\./g, '')
  if (next.includes('.') && !/^\d{2}\.\d{0,2}$|^\d{2}\.\d{2}\.\d{0,4}$/.test(next)) return next
  const d = onlyDigits.slice(0, 8)
  if (d.length <= 2) return d.length === 2 && next.length > previous.length && !next.includes('.') ? `${d}.` : next
  if (d.length <= 4) return `${d.slice(0, 2)}.${d.slice(2)}${d.length === 4 ? '.' : ''}`
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}`
}

/** "8", "8:5", "0830", "8.30", "20 Uhr" → "08:00", "08:05", "08:30", "08:30", "20:00"; ungültig → null. */
export function parseTime(text: string): string | null {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/\s*uhr$/, '')
  const m = /^(\d{1,2})(?:[:.](\d{1,2}))?$/.exec(t) ?? /^(\d{2})(\d{2})$/.exec(t)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2] ?? 0)
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}
