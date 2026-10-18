import { describe, expect, it } from 'vitest'
import { calendarWeeks, monthLabel, shiftMonth } from './calendar'

describe('Kalender', () => {
  it('Oktober 2026 beginnt am Donnerstag, Woche ab Montag', () => {
    const weeks = calendarWeeks('2026-10')
    expect(weeks).toHaveLength(6)
    expect(weeks[0].map((d) => d.day)).toEqual([28, 29, 30, 1, 2, 3, 4])
    expect(weeks[0][3]).toMatchObject({ iso: '2026-10-01', inMonth: true, label: 'Donnerstag, 1. Oktober 2026' })
    expect(weeks[0][0].inMonth).toBe(false)
  })

  it('Monate blättern und benennen', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2027-01', -1)).toBe('2026-12')
    expect(monthLabel('2027-03')).toBe('März 2027')
  })
})
