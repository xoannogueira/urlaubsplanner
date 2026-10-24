import { describe, expect, it } from 'vitest'
import type { Stage, TripOption } from '../api/types'
import { flightSegments, savedFlightLegs, stageArriving, stageLeaving } from './flightSegments'

const stage = (id: string, startDate: string, endDate: string, latitude: number, longitude: number): Stage => ({
  id,
  name: id,
  startDate,
  endDate,
  nights: 0,
  latitude,
  longitude,
})
// Japan: Osaka → Okinawa (Flug) → Tokio (Flug); Kyoto liegt nah bei Osaka (kein Flug)
const kyoto = stage('Kyoto', '2027-04-25', '2027-04-28', 35.01, 135.77)
const osaka = stage('Osaka', '2027-04-28', '2027-05-02', 34.69, 135.5)
const okinawa = stage('Okinawa', '2027-05-02', '2027-05-09', 26.21, 127.68)
const tokio = stage('Tokio', '2027-05-09', '2027-05-19', 35.68, 139.76)
const stages = [tokio, okinawa, kyoto, osaka]

describe('flightSegments', () => {
  it('An- und Rückreise plus Weiterflüge nur zwischen weit entfernten Etappen', () => {
    const segs = flightSegments(stages)
    expect(segs.map((s) => (s.kind === 'hop' ? `${s.from.name}→${s.to.name}@${s.date}` : s.id))).toEqual([
      'trip',
      'Osaka→Okinawa@2027-05-02',
      'Okinawa→Tokio@2027-05-09',
    ])
  })
})

describe('Etappe zum Datum', () => {
  it('beim Wechsel: Ankunft in der neuen, Abflug aus der alten Etappe', () => {
    expect(stageArriving(stages, '2027-05-02')?.name).toBe('Okinawa')
    expect(stageLeaving(stages, '2027-05-02')?.name).toBe('Osaka')
    expect(stageLeaving(stages, '2027-05-09')?.name).toBe('Okinawa')
    expect(stageArriving(stages, '2027-05-09')?.name).toBe('Tokio')
  })

  it('vor und nach der Reise: erste bzw. letzte Etappe', () => {
    expect(stageArriving(stages, '2027-04-01')?.name).toBe('Kyoto')
    expect(stageLeaving(stages, '2027-05-19')?.name).toBe('Tokio')
    expect(stageLeaving(stages, '2027-06-01')?.name).toBe('Tokio')
  })
})

describe('savedFlightLegs', () => {
  it('liest die Strecken gemerkter Flüge', () => {
    const flight = (externalId: string) => ({ kind: 'Flight', externalId }) as TripOption
    const legs = savedFlightLegs([
      flight('STR-KIX@2027-04-25:LH1|HND-FRA@2027-05-19:LH2#Basic'),
      flight('HND-FRA@2027-05-19:NH3'),
      { kind: 'Hotel', externalId: 'x' } as TripOption,
    ])
    expect(legs).toEqual([
      { origin: 'STR', destination: 'KIX', date: '2027-04-25' },
      { origin: 'HND', destination: 'FRA', date: '2027-05-19' },
    ])
  })
})
