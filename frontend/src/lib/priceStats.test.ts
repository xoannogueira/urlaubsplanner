import { describe, expect, it } from 'vitest'
import type { PriceRecord } from '../api/priceStats'
import { airlineByMonth, byLeadTime, preferredKind, step, weekdayByTime } from './priceStats'

const rec = (p: Partial<PriceRecord>): PriceRecord => ({
  searchedAt: '2026-10-01T10:00:00Z',
  origin: 'STR',
  destination: 'LIS',
  departureDate: '2026-11-12',
  departureTime: '09:15',
  returnDate: '2026-11-17',
  airline: 'Eurowings',
  stops: 0,
  minutes: 205,
  pricePerAdult: 150,
  totalPrice: 300,
  currency: 'EUR',
  source: 'suche',
  ...p,
})

describe('Preis-Statistik', () => {
  it('Airline × Monat nimmt den günstigsten Preis', () => {
    const m = airlineByMonth([
      rec({}),
      rec({ pricePerAdult: 120 }),
      rec({ airline: 'TAP', departureDate: '2026-12-03', pricePerAdult: 200 }),
    ])
    expect(m.rows).toEqual(['Eurowings', 'TAP'])
    expect(m.cols.map((c) => c.label)).toEqual(['Nov 26', 'Dez 26'])
    expect(m.cells[0][0]).toEqual({ min: 120, count: 2 })
    expect(m.cells[1][0]).toEqual({ min: null, count: 0 })
    expect([m.min, m.max]).toEqual([120, 200])
  })

  it('mehr als 8 Airlines: Rest als „Andere“', () => {
    const many = Array.from({ length: 10 }, (_, i) => rec({ airline: `A${i}` }))
    expect(airlineByMonth(many).rows.at(-1)).toBe('Andere')
    expect(airlineByMonth(many).rows).toHaveLength(8)
  })

  it('Wochentag × Uhrzeit (12.11.2026 ist ein Donnerstag)', () => {
    const m = weekdayByTime([rec({ departureTime: '18:30' })])
    expect(m.cells[3][3]).toEqual({ min: 150, count: 1 })
  })

  it('Tage vor Abflug: Median', () => {
    const b = byLeadTime([
      rec({ pricePerAdult: 100 }),
      rec({ pricePerAdult: 200 }),
      rec({ searchedAt: '2026-11-10T08:00:00Z', pricePerAdult: 300 }),
    ])
    expect(b.find((x) => x.label === '31–60')).toMatchObject({ median: 150, min: 100, count: 2 })
    expect(b.find((x) => x.label === '0–7')).toMatchObject({ median: 300, count: 1 })
  })

  it('Stufen und bevorzugte Art', () => {
    expect([step(100, 100, 200), step(200, 100, 200), step(150, 100, 200)]).toEqual([4, 0, 2])
    expect(preferredKind([rec({}), rec({ returnDate: null }), rec({})])).toBe('roundtrip')
  })
})
