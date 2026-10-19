import { describe, expect, it } from 'vitest'
import type { TripOption } from '../api/types'
import type { WeatherDay } from '../api/weather'
import { sampleTrip } from '../features/pdf/sampleTrip'
import { applyTemplate, groupPacking, openSuggestions, suggestPacking, templateItems } from './packing'

const day = (over: Partial<WeatherDay>): WeatherDay => ({
  date: '2027-05-12',
  source: 'Climate',
  code: 0,
  tempMax: 20,
  tempMin: 13,
  precipitationMm: 0,
  rainChance: 10,
  years: 5,
  ...over,
})

const keys = (s: { key: string }[]) => s.map((x) => x.key)

describe('Packliste', () => {
  it('Grundausstattung, Flug und Wäsche nach Reisedauer', () => {
    const s = suggestPacking(sampleTrip, [])
    expect(keys(s)).toContain('ausweis')
    expect(keys(s)).toContain('bordkarten')
    expect(keys(s)).toContain('fluessigkeiten')
    expect(s.find((x) => x.key === 'unterwaesche')?.text).toBe('Unterwäsche & Socken (8×)')
    expect(keys(s)).not.toContain('regenjacke')
    expect(keys(s)).not.toContain('fuehrerschein')
  })

  it('Wetter: Sonne, kühle Nächte und Regen', () => {
    const s = suggestPacking(sampleTrip, [day({ tempMax: 27.4 }), day({ tempMin: 9, code: 61, rainChance: 70 })])
    expect(s.find((x) => x.key === 'sonnencreme')?.reason).toBe('bis 27 °C')
    expect(s.find((x) => x.key === 'pullover')?.reason).toBe('nachts 9 °C')
    expect(s.find((x) => x.key === 'regenjacke')?.reason).toBe('1 Regentag')
    expect(keys(s)).not.toContain('winter')
  })

  it('Mietwagen und Strand', () => {
    const rental: TripOption = { ...sampleTrip.options[0], id: 'car', kind: 'Transport', provider: 'rental', status: 'Selected' }
    const beach: TripOption = { ...sampleTrip.options[0], id: 'b', kind: 'Activity', status: 'Favorite', locationName: 'Strand' }
    const s = suggestPacking({ ...sampleTrip, options: [...sampleTrip.options, rental, beach] }, [])
    expect(keys(s)).toEqual(expect.arrayContaining(['fuehrerschein', 'kaution', 'badesachen', 'sonnencreme']))
    expect(keys(s).filter((k) => k === 'sonnencreme')).toHaveLength(1)
  })

  it('übernommene und weggeklickte Vorschläge kommen nicht wieder', () => {
    const s = suggestPacking(sampleTrip, [])
    const open = openSuggestions(
      { items: [{ id: '1', text: 'Pass', category: 'Dokumente', packed: false, suggestionKey: 'ausweis' }], dismissed: ['bargeld'] },
      s,
    )
    expect(keys(open)).not.toContain('ausweis')
    expect(keys(open)).not.toContain('bargeld')
    expect(open.length).toBe(s.length - 2)
  })

  it('gruppiert in fester Reihenfolge, eigene Kategorien hinten', () => {
    const groups = groupPacking([
      { id: '1', text: 'Kamera', category: 'Fotos', packed: false, suggestionKey: null },
      { id: '2', text: 'Socken', category: 'Kleidung', packed: false, suggestionKey: null },
      { id: '3', text: 'Pass', category: 'Dokumente', packed: true, suggestionKey: null },
    ])
    expect(groups.map((g) => g.category)).toEqual(['Dokumente', 'Kleidung', 'Fotos'])
  })
})

describe('Packlisten-Vorlagen', () => {
  it('übernimmt nur fehlende Einträge, ohne Haken', () => {
    const list = {
      items: [{ id: '1', text: 'Reisepass', category: 'Dokumente', packed: true, suggestionKey: 'pass' }],
      dismissed: [],
    }
    let n = 0
    const { list: next, added } = applyTemplate(
      list,
      [
        { text: 'reisepass', category: 'Dokumente', suggestionKey: null },
        { text: 'Sonnencreme', category: 'Hygiene & Gesundheit', suggestionKey: null },
      ],
      () => `n${++n}`,
    )
    expect(added).toBe(1)
    expect(next.items.map((i) => [i.text, i.packed])).toEqual([
      ['Reisepass', true],
      ['Sonnencreme', false],
    ])
    expect(templateItems(next)[0]).toEqual({ text: 'Reisepass', category: 'Dokumente', suggestionKey: 'pass' })
  })
})
