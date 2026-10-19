import { describe, expect, it } from 'vitest'
import type { Trip, TripOption } from '../api/types'
import { sampleTrip } from '../features/pdf/sampleTrip'
import { calculateSplit, removalImpact } from './split'

const anna = { id: 'a', name: 'Anna' }
const ben = { id: 'b', name: 'Ben' }
const cara = { id: 'c', name: 'Cara' }

const option = (id: string, totalPrice: number): TripOption => ({ ...sampleTrip.options[0], id, status: 'Selected', totalPrice, title: id })

function trip(party: Partial<Trip['party']>, options: TripOption[] = []): Trip {
  return { ...sampleTrip, options, party: { members: [anna, ben, cara], expenses: [], optionShares: [], ...party } }
}

describe('Kostenaufteilung', () => {
  it('Hotel von Anna für alle, Essen von Ben nur für Ben und Cara', () => {
    const split = calculateSplit(
      trip(
        {
          optionShares: [{ optionId: 'hotel', paidBy: 'a', for: [] }],
          expenses: [{ id: 'e', title: 'Essen', amount: 60, paidBy: 'b', for: ['b', 'c'], date: null }],
        },
        [option('hotel', 900)],
      ),
    )
    expect(split.total).toBe(960)
    expect(split.people.map((p) => [p.member.name, p.share, p.paid, p.balance])).toEqual([
      ['Anna', 300, 900, 600],
      ['Ben', 330, 60, -270],
      ['Cara', 330, 0, -330],
    ])
    expect(split.transfers.map((t) => `${t.from.name}→${t.to.name}:${t.amount}`)).toEqual(['Cara→Anna:330', 'Ben→Anna:270'])
    expect(split.unpaid).toBe(0)
    // Rechenweg für Ben: Hotel 900 ÷ 3 + Essen 60 ÷ 2
    const ben = split.people[1]
    expect(ben.parts.map((p) => [p.title, p.amount, p.people, p.each])).toEqual([
      ['hotel', 900, 3, 300],
      ['Essen', 60, 2, 30],
    ])
    expect(ben.purchases).toEqual([{ title: 'Essen', amount: 60 }])
    expect(ben.shareOfBought).toBe(330)
  })

  it('noch nicht bezahlte Posten zählen zum Anteil, aber nicht zum Ausgleich', () => {
    const split = calculateSplit(trip({}, [option('flug', 300)]))
    expect(split.unpaid).toBe(300)
    expect(split.people.every((p) => p.share === 100 && p.balance === 0)).toBe(true)
    expect(split.transfers).toEqual([])
  })

  it('krumme Beträge gehen auf den Cent auf', () => {
    const split = calculateSplit(trip({ expenses: [{ id: 'e', title: 'Taxi', amount: 10, paidBy: 'a', for: [], date: null }] }))
    expect(split.people.map((p) => p.share)).toEqual([3.34, 3.33, 3.33])
    expect(split.transfers.reduce((s, t) => s + t.amount, 0)).toBeCloseTo(6.66, 2)
    expect(split.people[0].balance).toBe(6.66)
  })

  it('zeigt vor dem Entfernen, was die Person gekauft hat und wo sie dabei ist', () => {
    const split = calculateSplit(
      trip(
        {
          optionShares: [{ optionId: 'hotel', paidBy: 'a', for: [] }],
          expenses: [{ id: 'e', title: 'Essen', amount: 60, paidBy: 'b', for: ['b', 'c'], date: null }],
        },
        [option('hotel', 900)],
      ),
    )
    expect(removalImpact(split, 'a', 3)).toEqual({ bought: [{ title: 'hotel', amount: 900 }], sharedIn: [] })
    expect(removalImpact(split, 'c', 3)).toEqual({ bought: [], sharedIn: ['Essen'] })
  })
})
