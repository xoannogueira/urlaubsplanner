import { describe, expect, it } from 'vitest'
import type { Stage, Trip, TripOption, TripSummary } from '../api/types'
import { buildTimeline, costByKind, costByStage, daysUntil, flightTime, openTasks } from './dashboard'

const stage = (id: string, name: string, startDate: string, endDate: string, nights: number): Stage => ({
  id,
  name,
  startDate,
  endDate,
  nights,
  latitude: 38.7,
  longitude: -9.1,
})

let n = 0
const option = (patch: Partial<TripOption>): TripOption => ({
  id: `o${++n}`,
  kind: 'Activity',
  status: 'Selected',
  stageId: null,
  title: 'Option',
  url: null,
  price: null,
  pricePerPerson: false,
  totalPrice: null,
  startDate: null,
  endDate: null,
  locationName: null,
  latitude: null,
  longitude: null,
  notes: null,
  provider: 'manual',
  externalId: null,
  imageUrl: null,
  priceCheckedAt: null,
  createdAt: '2026-10-11T00:00:00Z',
  updatedAt: '2026-10-11T00:00:00Z',
  ...patch,
})

const lisboa = stage('s1', 'Lissabon', '2027-05-12', '2027-05-15', 3)
const porto = stage('s2', 'Porto', '2027-05-15', '2027-05-17', 2)

const trip = (options: TripOption[]): Trip => ({
  id: 't',
  name: 'Portugal',
  travelers: 2,
  startDate: null,
  endDate: null,
  notes: null,
  createdAt: '',
  updatedAt: '',
  stages: [lisboa, porto],
  options,
  packing: { items: [], dismissed: [] },
  party: { members: [], expenses: [], optionShares: [] },
})

const summary = (patch: Partial<TripSummary> = {}): TripSummary => ({
  travelers: 2,
  startDate: '2027-05-12',
  endDate: '2027-05-17',
  days: 6,
  nights: 5,
  stageCount: 2,
  totalCost: 0,
  costPerPerson: 0,
  bookedCost: 0,
  openCost: 0,
  chosenCount: 0,
  bookedCount: 0,
  missingPriceCount: 0,
  costByKind: [],
  costByStage: [],
  gaps: [],
  ...patch,
})

const flight = option({
  kind: 'Flight',
  status: 'Booked',
  title: 'STR → LIS · OPO → STR',
  totalPrice: 467.04,
  externalId: 'STR-LIS@2027-05-12:EW2604|OPO-STR@2027-05-17:EW2713#Smart',
  notes: 'STR → LIS: Mi., 12. Mai, 14:25–16:25, EW2604, Direkt\nOPO → STR: Mo., 17. Mai, 22:15–01:50 (+1), EW2713, Direkt',
})
const hotelLisboa = option({ kind: 'Hotel', title: 'Hotel Miradouro', stageId: 's1', totalPrice: 600 })
const museum = option({ kind: 'Activity', title: 'Museu Berardo', stageId: 's1', startDate: '2027-05-13', totalPrice: 20 })
const castle = option({ kind: 'Activity', title: 'Castelo', stageId: 's1', totalPrice: 30 })
const idea = option({ kind: 'Hotel', status: 'Idea', stageId: 's2', totalPrice: 999 })

describe('Kosten', () => {
  const t = trip([flight, hotelLisboa, museum, castle, idea])

  it('pro Kategorie in fester Reihenfolge, nur Ausgewähltes', () => {
    expect(costByKind(t.options)).toEqual([
      { kind: 'Flight', total: 467.04, booked: 467.04, count: 1 },
      { kind: 'Hotel', total: 600, booked: 0, count: 1 },
      { kind: 'Activity', total: 50, booked: 0, count: 2 },
    ])
  })

  it('pro Etappe nach Kategorie, Flug unter „Ganze Reise“', () => {
    const rows = costByStage(t)
    expect(rows.map((r) => [r.name, r.total])).toEqual([
      ['Lissabon', 650],
      ['Porto', 0],
      ['Ganze Reise', 467.04],
    ])
    expect(rows[0].byKind.find((k) => k.kind === 'Hotel')?.total).toBe(600)
  })

  it('zählt die Tage bis zur Reise', () => {
    expect(daysUntil('2027-05-12', '2027-05-01')).toBe(11)
    expect(daysUntil('2027-05-12', '2027-05-12')).toBe(0)
    expect(daysUntil(null, '2027-05-12')).toBeNull()
  })
})

describe('Zeitplan', () => {
  const { days, stages } = buildTimeline(trip([flight, hotelLisboa, museum, castle, idea]), summary())

  it('legt jeden Tag vom ersten bis letzten Reisetag an', () => {
    expect(days.map((d) => d.date)).toEqual(['2027-05-12', '2027-05-13', '2027-05-14', '2027-05-15', '2027-05-16', '2027-05-17'])
    expect(days.filter((d) => d.stageStart).map((d) => d.stage?.name)).toEqual(['Lissabon', 'Porto'])
  })

  it('setzt jede Flugstrecke an ihren Tag, mit Uhrzeit', () => {
    expect(days[0].items).toEqual([{ id: `${flight.id}:0`, kind: 'Flight', title: 'STR → LIS', time: '14:25–16:25', booked: true }])
    expect(days[5].items[0]).toMatchObject({ title: 'OPO → STR', time: '22:15–01:50 (+1)' })
  })

  it('zeigt Übernachtung oder Lücke', () => {
    expect(days[0].night).toEqual({ title: 'Hotel Miradouro', booked: false })
    expect(days[3].night).toBe('missing') // Porto ohne gewähltes Hotel (Idee zählt nicht)
    expect(days[5].night).toBeNull() // Abreisetag
  })

  it('Aktivitäten mit Datum am Tag, ohne Datum bei der Etappe', () => {
    expect(days[1].items.map((i) => i.title)).toEqual(['Museu Berardo'])
    expect(stages[0].unscheduled.map((o) => o.title)).toEqual(['Castelo'])
  })

  it('liest Flugzeiten aus der Notiz', () => {
    expect(flightTime(flight.notes, 'STR', 'LIS')).toBe('14:25–16:25')
    expect(flightTime(null, 'STR', 'LIS')).toBeNull()
  })
})

describe('Offene Punkte', () => {
  it('nennt fehlende Flüge, Hotels, Aktivitäten und Ungebuchtes', () => {
    const tasks = openTasks(
      trip([hotelLisboa, museum]),
      summary({
        missingPriceCount: 1,
        gaps: [{ kind: 'MissingHotel', stageId: 's2', stageName: 'Porto', from: '2027-05-15', to: '2027-05-17' }],
      }),
    )
    expect(tasks.map((t) => [t.text, t.target])).toEqual([
      ['Noch keine Anreise ausgewählt', 'fluege'],
      ['Porto: 2 Nächte ohne Hotel', 'hotels'],
      ['Porto: noch keine Aktivitäten', 'aktivitaeten'],
      ['2 Auswahlen noch nicht gebucht', 'checkliste'],
      ['1 Auswahl ohne Preis', 'checkliste'],
    ])
  })
})
