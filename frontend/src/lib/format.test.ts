import { describe, expect, it } from 'vitest'
import { formatDateRange, formatEuro, formatRelative, hostOf, nightsLabel } from './format'

// Intl nutzt geschützte Leerzeichen vor dem €-Zeichen; für die Tests normalisieren wir.
const plain = (s: string) => s.replace(/\s/g, ' ')

describe('formatEuro', () => {
  it('zeigt ganze Beträge ohne Nachkommastellen', () => {
    expect(plain(formatEuro(1136))).toBe('1.136 €')
  })

  it('zeigt Cent-Beträge mit zwei Stellen', () => {
    expect(plain(formatEuro(12.5))).toBe('12,50 €')
  })
})

describe('formatDateRange', () => {
  it('fasst Zeiträume im selben Monat zusammen', () => {
    expect(formatDateRange('2027-05-12', '2027-05-16')).toBe('12.–16. Mai 2027')
  })

  it('zeigt Monatswechsel im selben Jahr', () => {
    expect(plain(formatDateRange('2027-04-28', '2027-05-03'))).toBe('28. Apr. – 3. Mai 2027')
  })

  it('zeigt Jahreswechsel vollständig', () => {
    expect(formatDateRange('2026-12-30', '2027-01-02')).toBe('30. Dezember 2026 – 2. Januar 2027')
  })

  it('meldet offene Zeiträume', () => {
    expect(formatDateRange(null, null)).toBe('Zeitraum offen')
  })
})

describe('Hilfsfunktionen', () => {
  it('liest den Host aus Links', () => {
    expect(hostOf('https://www.booking.com/hotel/pt/x.html')).toBe('booking.com')
  })

  it('beschriftet Nächte richtig', () => {
    expect(nightsLabel(1)).toBe('1 Nacht')
    expect(nightsLabel(4)).toBe('4 Nächte')
  })

  it('beschreibt relative Tage', () => {
    const now = new Date('2026-10-09T12:00:00Z')
    expect(formatRelative('2026-10-09T08:00:00Z', now)).toBe('heute')
    expect(formatRelative('2026-10-06T08:00:00Z', now)).toBe('vor 3 Tagen')
  })
})
