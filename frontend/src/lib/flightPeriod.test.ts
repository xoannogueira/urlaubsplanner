import { describe, expect, it } from 'vitest'
import type { TripOption } from '../api/types'
import { sampleTrip } from '../features/pdf/sampleTrip'
import { flightDates, periodForFlight } from './flightPeriod'

const flight = (over: Partial<TripOption>): TripOption => ({ ...sampleTrip.options[0], kind: 'Flight', status: 'Selected', ...over })

describe('Zeitraum aus dem Flug', () => {
  it('Hin- und Rückflug, Ankunft am Folgetag bei Nachtflug', () => {
    const f = flight({
      externalId: 'STR-BCN@2027-05-11:VY1817|BCN-STR@2027-05-21:VY1818',
      notes: 'STR → BCN: Di., 11. Mai, 22:40–00:45 (+1), VY1817, Direkt\nBCN → STR: Fr., 21. Mai, 07:00–09:00, VY1818, Direkt',
    })
    expect(flightDates(f)).toEqual({ start: '2027-05-12', end: '2027-05-21', destination: 'BCN' })
  })

  it('manuell eingetragener Flug: Datum aus Start und Ende', () => {
    expect(flightDates(flight({ externalId: null, startDate: '2027-05-10', endDate: '2027-05-18' }))).toEqual({
      start: '2027-05-10',
      end: '2027-05-18',
      destination: null,
    })
    expect(flightDates(flight({ externalId: null, startDate: null }))).toBeNull()
  })

  it('neuer Zeitraum nur, wenn er sich ändert', () => {
    const trip = { ...sampleTrip, startDate: null, endDate: null } // Etappen 12.–20. Mai
    expect(periodForFlight(trip, { start: '2027-05-11', end: '2027-05-21', destination: 'LIS' })).toEqual({
      startDate: '2027-05-11',
      endDate: '2027-05-21',
    })
    expect(periodForFlight(trip, { start: '2027-05-12', end: '2027-05-20', destination: 'LIS' })).toBeNull()
    // Nur Hinflug: Ende bleibt
    expect(periodForFlight(trip, { start: '2027-05-13', end: null, destination: 'LIS' })).toEqual({
      startDate: '2027-05-13',
      endDate: '2027-05-20',
    })
  })
})
