import { describe, expect, it } from 'vitest'
import type { CalendarDay } from '../api/priceCalendars'
import { parseSignature } from './flights'
import {
  aviasalesRequests,
  byMonth,
  byWeekday,
  calendarDates,
  checkOnGoogleUrl,
  cheapestDays,
  monthGrids,
  monthRange,
  upcomingMonths,
} from './priceCalendar'

const day = (date: string, cheapest: number | null): CalendarDay => ({
  date,
  cheapest,
  airline: 'TAP',
  stops: 0,
  options: 3,
  problem: null,
})

describe('Preiskalender', () => {
  it('zählt Suchen wie das Backend', () => {
    expect(calendarDates('2026-12-01', '2026-12-31', 'Daily')).toHaveLength(31)
    expect(calendarDates('2026-12-01', '2026-12-31', 'EveryOther')).toHaveLength(16)
    expect(calendarDates('2026-12-01', '2026-12-31', 'Weekends')).toEqual([
      '2026-12-04',
      '2026-12-05',
      '2026-12-11',
      '2026-12-12',
      '2026-12-18',
      '2026-12-19',
      '2026-12-25',
      '2026-12-26',
    ])
  })

  it('Zeitraum aus Monaten: ab morgen, bis höchstens 330 Tage', () => {
    expect(monthRange('2026-10', 2, '2026-10-22', 7)).toEqual({ from: '2026-10-23', to: '2026-11-30' })
    expect(monthRange('2027-08', 3, '2026-10-22', 7).to).toBe('2027-09-10')
    expect(upcomingMonths('2026-10-22', 3).map((m) => m.label)).toEqual(['Oktober 2026', 'November 2026', 'Dezember 2026'])
  })

  it('Monatskalender beginnt am Montag', () => {
    const [dec] = monthGrids({ from: '2026-12-01', to: '2026-12-31', days: [day('2026-12-01', 120)] })
    expect(dec.label).toBe('Dezember 2026')
    expect(dec.weeks[0][0]).toBeNull() // 1.12.2026 ist ein Dienstag
    expect(dec.weeks[0][1]?.day?.cheapest).toBe(120)
  })

  it('Auswertung nach Wochentag und Monat', () => {
    const days = [day('2026-12-01', 120), day('2026-12-08', 100), day('2027-01-05', 90), day('2026-12-02', null)]
    expect(byWeekday(days)[1]).toEqual({ label: 'Di', min: 90, median: 100, count: 3 })
    expect(byMonth(days).map((m) => [m.label, m.min])).toEqual([
      ['Dez 26', 100],
      ['Jan 27', 90],
    ])
    expect(cheapestDays(days, 1)[0].date).toBe('2027-01-05')
  })
})

describe('Aviasales', () => {
  it('zählt die Abfragen pro Monat und Strecke', () => {
    expect(aviasalesRequests('2026-11-01', '2026-12-31', null, 1)).toBe(2)
    // Rückflüge reichen bis in den Januar
    expect(aviasalesRequests('2026-11-01', '2026-12-31', 7, 2)).toBe((2 + 3) * 2)
  })

  it('verlinkt den Tag bei Google Flights mit der günstigsten Strecke', () => {
    const url = checkOnGoogleUrl({ origins: ['STR', 'FRA'], destinations: ['BCN'], nights: 7 }, { date: '2026-12-07', route: 'FRA-BCN' })
    expect(url).toMatch(/^https:\/\/www\.google\.com\/travel\/flights\/search\?tfs=/)
    const oneWay = checkOnGoogleUrl({ origins: ['STR'], destinations: ['BCN'], nights: null }, { date: '2026-12-07', route: null })
    expect(oneWay).not.toBe(url)
    expect(parseSignature('FRA-BCN@2026-12-07:|BCN-FRA@2026-12-14:')?.legs).toHaveLength(2)
  })
})
