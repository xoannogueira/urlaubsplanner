import { describe, expect, it } from 'vitest'
import type { TransitItinerary } from '../api/transit'
import type { Trip, TripOption } from '../api/types'
import { timeRange } from './dashboard'
import { approximateUtc, bahnUrl, clockAt, legLabel, modeInfo, suggestTransfers, transitOptionInput, visibleLegs } from './transit'

const stop = (name: string, time: string, timeZone = 'Europe/Berlin', track: string | null = null) => ({
  name,
  latitude: 48.78,
  longitude: 9.18,
  time,
  timeZone,
  track,
})

const itinerary: TransitItinerary = {
  departure: '2027-05-12T06:43:00+00:00',
  arrival: '2027-05-12T09:56:00+00:00',
  durationMinutes: 193,
  transfers: 0,
  legs: [
    {
      mode: 'WALK',
      line: null,
      headsign: null,
      agency: null,
      from: stop('Start', '2027-05-12T06:43:00+00:00'),
      to: stop('Stuttgart Hbf', '2027-05-12T06:50:00+00:00'),
      durationMinutes: 7,
      distanceMeters: 510,
      stops: 0,
      color: null,
    },
    {
      mode: 'HIGHSPEED_RAIL',
      line: 'ICE 9576',
      headsign: 'Paris Est',
      agency: 'DB',
      from: stop('Stuttgart Hbf', '2027-05-12T06:50:00+00:00', 'Europe/Berlin', '9'),
      to: stop('Paris Est', '2027-05-12T09:54:00+00:00', 'Europe/Paris'),
      durationMinutes: 184,
      distanceMeters: null,
      stops: 2,
      color: null,
    },
    {
      mode: 'WALK',
      line: null,
      headsign: null,
      agency: null,
      from: stop('Paris Est', '2027-05-12T09:54:00+00:00', 'Europe/Paris'),
      to: stop('Ziel', '2027-05-12T09:56:00+00:00', 'Europe/Paris'),
      durationMinutes: 2,
      distanceMeters: 120,
      stops: 0,
      color: null,
    },
  ],
}

describe('Bus & Bahn', () => {
  it('zeigt Zeiten in der Zeitzone des Halts', () => {
    expect(clockAt('2027-05-12T06:50:00+00:00', 'Europe/Berlin')).toBe('08:50')
    expect(clockAt('2027-05-12T09:54:00+00:00', 'Europe/Lisbon')).toBe('10:54')
  })

  it('benennt Verkehrsmittel und Linien', () => {
    expect(modeInfo('REGIONAL_RAIL').kind).toBe('train')
    expect(modeInfo('SUBWAY').label).toBe('U-Bahn')
    expect(legLabel({ ...itinerary.legs[1], mode: 'BUS', line: '728' })).toBe('Bus 728')
    expect(legLabel(itinerary.legs[1])).toBe('ICE 9576')
  })

  it('lässt kurze Umsteigewege weg', () => {
    expect(visibleLegs(itinerary.legs).map((l) => l.mode)).toEqual(['WALK', 'HIGHSPEED_RAIL'])
  })

  it('rechnet die Uhrzeit am Startort ungefähr in UTC um', () => {
    expect(approximateUtc('2027-05-12', 8, 0, { latitude: 48.78, longitude: 9.18 })).toBe('2027-05-12T06:00:00.000Z')
    expect(approximateUtc('2027-01-12', 8, 0, { latitude: 38.72, longitude: -9.14 })).toBe('2027-01-12T08:00:00.000Z')
    expect(approximateUtc('2027-05-12', 8, 0, { latitude: 40.7, longitude: -74 })).toBe('2027-05-12T13:00:00.000Z')
  })

  it('merkt eine Verbindung als Transport mit Zeiten in der Notiz', () => {
    const input = transitOptionInput(
      itinerary,
      { fromName: 'Stuttgart', toName: 'Paris', from: { latitude: 48.78, longitude: 9.18 }, to: { latitude: 48.87, longitude: 2.36 } },
      'anreise',
      's1',
    )
    expect(input.kind).toBe('Transport')
    expect(input.title).toBe('Stuttgart → Paris')
    expect(input.externalId).toBe('anreise|2027-05-12T06:43:00+00:00|ICE 9576')
    expect(input.startDate).toBe('2027-05-12')
    expect(input.notes?.split('\n')[0]).toBe('Stuttgart → Paris: Mi., 12. Mai, 08:43–11:56, ICE 9576, direkt')
    expect(input.notes).toContain('08:50 Stuttgart Hbf (Gleis 9) → 11:54 Paris Est: ICE 9576 Richtung Paris Est')
    expect(timeRange(input.notes)).toBe('08:43–11:56')
  })

  it('verlinkt bahn.de mit Start, Ziel und Abfahrt', () => {
    const url = bahnUrl('Stuttgart', 'Paris', itinerary)
    const hash = new URLSearchParams(url.split('#')[1])
    expect(hash.get('so')).toBe('Stuttgart Hbf')
    expect(hash.get('zo')).toBe('Paris')
    expect(hash.get('hd')).toBe('2027-05-12T08:50:00')
  })
})

describe('Transfer-Vorschläge', () => {
  const option = (o: Partial<TripOption>): TripOption =>
    ({ status: 'Selected', stageId: null, latitude: null, longitude: null, notes: null, externalId: null, ...o }) as TripOption
  const trip = {
    stages: [
      { id: 'lis', name: 'Lissabon', startDate: '2027-05-12', endDate: '2027-05-17', nights: 5, latitude: 38.72, longitude: -9.14 },
      { id: 'opo', name: 'Porto', startDate: '2027-05-17', endDate: '2027-05-20', nights: 3, latitude: 41.15, longitude: -8.61 },
    ],
    options: [
      option({
        id: 'f',
        kind: 'Flight',
        externalId: 'STR-LIS@2027-05-12:EW2604|OPO-STR@2027-05-20:TP566#Light',
        notes: 'STR → LIS: Mi., 12. Mai, 09:15–11:40, EW2604, Direkt\nOPO → STR: Do., 20. Mai, 13:05–19:20, TP566, Direkt',
      }),
      option({ id: 'h', kind: 'Hotel', stageId: 'lis', title: 'Memmo Alfama', latitude: 38.71, longitude: -9.13 }),
    ],
  } as unknown as Trip
  const airports = [
    {
      code: 'LIS',
      name: 'Humberto Delgado',
      city: 'Lissabon',
      countryCode: 'PT',
      latitude: 38.77,
      longitude: -9.13,
      major: true,
      distanceKm: null,
      near: null,
    },
    {
      code: 'OPO',
      name: 'Francisco Sá Carneiro',
      city: 'Porto',
      countryCode: 'PT',
      latitude: 41.24,
      longitude: -8.68,
      major: true,
      distanceKm: null,
      near: null,
    },
  ]

  it('schlägt Ankunft, Etappenwechsel und Abreise vor', () => {
    const s = suggestTransfers(trip, airports)
    expect(s.map((x) => x.id)).toEqual(['ankunft', 'etappe:opo', 'abreise'])

    expect(s[0]).toMatchObject({ date: '2027-05-12', hour: 12, minute: 25, arriveBy: false })
    expect(s[0].from.name).toBe('Flughafen Lissabon (LIS)')
    expect(s[0].to.name).toBe('Memmo Alfama')

    expect(s[1]).toMatchObject({ date: '2027-05-17', hour: 10 })
    expect(s[1].from.name).toBe('Memmo Alfama')
    expect(s[1].to.name).toBe('Porto')

    expect(s[2]).toMatchObject({ date: '2027-05-20', hour: 11, minute: 5, arriveBy: true })
    expect(s[2].to.name).toBe('Flughafen Porto (OPO)')
  })

  it('ohne Flug nur die Etappenwechsel', () => {
    expect(suggestTransfers({ ...trip, options: [] }, airports).map((x) => x.id)).toEqual(['etappe:opo'])
  })
})
