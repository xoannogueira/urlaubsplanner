import { describe, expect, it } from 'vitest'
import type { FlightFare, FlightJourney } from '../api/flights'
import type { Stage, TripOption } from '../api/types'
import {
  canRecheckFlight,
  combinationCount,
  fareSummary,
  filterAndSortFlights,
  flightNotes,
  flightOptionInput,
  formatDuration,
  anyTime,
  noFlightFilters,
  parseSignature,
  rateFlights,
  timeCost,
  planLegs,
  planProblem,
  shiftDate,
  stopsLabel,
  suggestTripType,
  type FlightPlan,
} from './flights'

const fare = (patch: Partial<FlightFare>): FlightFare => ({
  family: 'Light',
  cabin: 'Economy',
  totalPrice: 400,
  pricePerAdult: 200,
  currency: 'EUR',
  cabinBagKg: 8,
  checkedBags: 0,
  checkedBagKg: null,
  refundable: false,
  changeable: false,
  changeFee: null,
  seatsRemaining: 9,
  ...patch,
})

const segment = (origin: string, destination: string, departure: string, arrival: string, number: string) => ({
  origin,
  originName: null,
  destination,
  destinationName: null,
  departure,
  arrival,
  durationMinutes: 120,
  carrierCode: 'EW',
  carrierName: 'Eurowings',
  carrierLogo: null,
  flightNumber: number,
})

const journey = (patch: Partial<FlightJourney> & { stops?: boolean }): FlightJourney => {
  const outbound = patch.stops
    ? [
        segment('STR', 'HAM', '2027-05-12T06:00:00', '2027-05-12T07:10:00', '2042'),
        segment('HAM', 'LIS', '2027-05-12T09:00:00', '2027-05-12T11:30:00', '7602'),
      ]
    : [segment('STR', 'LIS', '2027-05-12T14:25:00', '2027-05-12T16:25:00', '2604')]
  return {
    continuation: null,
    signature: 'sig',
    legs: [
      {
        origin: 'STR',
        destination: 'LIS',
        departure: outbound[0].departure,
        arrival: outbound[outbound.length - 1].arrival,
        durationMinutes: 180,
        dayChange: 0,
        stops: outbound.length - 1,
        segments: outbound,
      },
      {
        origin: 'OPO',
        destination: 'STR',
        departure: '2027-05-19T22:15:00',
        arrival: '2027-05-20T01:50:00',
        durationMinutes: 155,
        dayChange: 1,
        stops: 0,
        segments: [segment('OPO', 'STR', '2027-05-19T22:15:00', '2027-05-20T01:50:00', '2713')],
      },
    ],
    totalMinutes: 335,
    totalPrice: 400,
    fares: [fare({})],
    bookingUrl: 'https://www.kayak.de/flights',
    googleUrl: 'https://www.google.com/travel/flights',
    ...patch,
  }
}

const plan = (type: FlightPlan['type']): FlightPlan => ({
  type,
  outbound: { origins: ['STR'], destinations: ['LIS', 'OPO'], date: '2027-05-12' },
  inbound: { origins: ['OPO'], destinations: ['STR', 'FRA'], date: '2027-05-19' },
})

describe('Flugplan', () => {
  it('baut Strecken je nach Reiseart', () => {
    expect(planLegs(plan('oneway'))).toHaveLength(1)
    expect(planLegs(plan('roundtrip'))[1]).toEqual({ origins: ['LIS', 'OPO'], destinations: ['STR'], date: '2027-05-19' })
    expect(planLegs(plan('openjaw'))[1]).toEqual({ origins: ['OPO'], destinations: ['STR', 'FRA'], date: '2027-05-19' })
  })

  it('zählt die Suchen', () => {
    expect(combinationCount(planLegs(plan('roundtrip')))).toBe(4)
    expect(combinationCount(planLegs(plan('openjaw')))).toBe(4)
    expect(combinationCount([{ origins: ['STR'], destinations: ['STR'], date: '2027-05-12' }])).toBe(0)
  })

  it('meldet fehlende Angaben', () => {
    expect(planProblem(plan('openjaw'), '2026-10-11')).toBeNull()
    expect(planProblem({ ...plan('oneway'), outbound: { ...plan('oneway').outbound, destinations: [] } }, '2026-10-11')).toBe(
      'Wähle einen Zielflughafen.',
    )
    expect(planProblem({ ...plan('roundtrip'), inbound: { ...plan('roundtrip').inbound, date: '2027-05-01' } }, '2026-10-11')).toBe(
      'Der Rückflug liegt vor dem Hinflug.',
    )
  })

  it('kennt mit Google Flights keine Obergrenze für Flughafen-Kombinationen', () => {
    const many = {
      ...plan('oneway'),
      outbound: { origins: ['STR', 'FRA', 'MUC'], destinations: ['LIS', 'OPO', 'FAO'], date: '2027-05-12' },
    }
    expect(planProblem(many, '2026-10-11')).toContain('höchstens 8')
    expect(planProblem(many, '2026-10-11', true)).toBeNull()
  })

  it('schlägt einen Gabelflug vor, wenn erste und letzte Etappe weit auseinander liegen', () => {
    const stage = (lat: number, lng: number) => ({ latitude: lat, longitude: lng }) as Stage
    expect(suggestTripType([stage(38.72, -9.14), stage(41.15, -8.61)])).toBe('openjaw') // Lissabon → Porto
    expect(suggestTripType([stage(38.72, -9.14), stage(38.69, -9.21)])).toBe('roundtrip') // Lissabon → Belém
    expect(suggestTripType([stage(38.72, -9.14)])).toBe('roundtrip')
  })
})

describe('Ergebnisse', () => {
  const cheapStops = journey({ signature: 'a', stops: true, totalMinutes: 600, fares: [fare({ totalPrice: 300 })] })
  const direct = journey({
    signature: 'b',
    totalMinutes: 335,
    fares: [fare({ totalPrice: 400 }), fare({ family: 'Standard', totalPrice: 460, checkedBags: 1, checkedBagKg: 23 })],
  })

  it('sortiert nach Preis oder Dauer', () => {
    expect(filterAndSortFlights([direct, cheapStops], noFlightFilters, 'price').map((x) => x.journey.signature)).toEqual(['a', 'b'])
    expect(filterAndSortFlights([cheapStops, direct], noFlightFilters, 'duration').map((x) => x.journey.signature)).toEqual(['b', 'a'])
  })

  it('filtert Direktflüge und nimmt mit Koffer den passenden Tarif', () => {
    expect(
      filterAndSortFlights([direct, cheapStops], { ...noFlightFilters, nonstop: true }, 'price').map((x) => x.journey.signature),
    ).toEqual(['b'])
    const withBag = filterAndSortFlights([direct, cheapStops], { ...noFlightFilters, withBag: true }, 'price')
    expect(withBag.map((x) => [x.journey.signature, x.fare.family])).toEqual([['b', 'Standard']])
  })

  it('beschreibt Google-Preise ohne erfundene Gepäckangaben', () => {
    expect(fareSummary(fare({ family: 'Google Flights', checkedBags: null }))).toBe(
      'Preis laut Google Flights · Gepäck und Bedingungen beim Buchen prüfen',
    )
    const google = journey({ signature: 'g', fares: [fare({ checkedBags: null })] })
    expect(filterAndSortFlights([google], { ...noFlightFilters, withBag: true }, 'price')).toEqual([])
  })

  it('beschriftet Dauer und Umstiege', () => {
    expect(formatDuration(425)).toBe('7 Std. 5 Min.')
    expect(formatDuration(120)).toBe('2 Std.')
    expect(stopsLabel(cheapStops.legs[0])).toBe('1 Umstieg (HAM)')
    expect(stopsLabel(direct.legs[0])).toBe('Direkt')
  })
})

describe('Merken und neu prüfen', () => {
  const j = journey({ signature: 'STR-LIS@2027-05-12:EW2604|OPO-STR@2027-05-19:EW2713' })

  it('baut Titel, Zeitraum, Notiz und Kennung mit Tarif', () => {
    const input = flightOptionInput(j, fare({ family: 'Smart', totalPrice: 467.04 }), { latitude: 38.78, longitude: -9.13 }, 'Lisbon (LIS)')
    expect(input).toMatchObject({
      kind: 'Flight',
      title: 'STR → LIS · OPO → STR',
      startDate: '2027-05-12',
      endDate: '2027-05-20', // Ankunft nach Mitternacht
      price: 467.04,
      externalId: 'STR-LIS@2027-05-12:EW2604|OPO-STR@2027-05-19:EW2713#Smart',
      provider: 'liteapi',
    })
    const notes = flightNotes(j, fare({ family: 'Smart', checkedBags: 1, checkedBagKg: 23, changeable: true, changeFee: 80 })).replace(
      /\s/g,
      ' ',
    )
    expect(notes).toContain('OPO → STR: Mi., 19. Mai, 22:15–01:50 (+1), EW2713, Direkt')
    expect(notes).toContain('Tarif Smart · 1× Koffer 23 kg · umbuchbar (80 €)')
  })

  it('liest die Kennung wieder', () => {
    expect(parseSignature('STR-LIS@2027-05-12:EW2042+EW7602|OPO-STR@2027-05-19:EW2713#Smart')).toEqual({
      legs: [
        { origin: 'STR', destination: 'LIS', date: '2027-05-12', flights: ['EW2042', 'EW7602'] },
        { origin: 'OPO', destination: 'STR', date: '2027-05-19', flights: ['EW2713'] },
      ],
      fare: 'Smart',
    })
    expect(parseSignature('kaputt')).toBeNull()
  })

  it('prüft nur gemerkte Suchflüge in der Zukunft', () => {
    const option = { kind: 'Flight', provider: 'liteapi', externalId: 'STR-LIS@2027-05-12:EW2604#Smart' } as TripOption
    expect(canRecheckFlight(option, '2026-10-11')).toBe(true)
    expect(canRecheckFlight(option, '2027-05-13')).toBe(false)
    expect(canRecheckFlight({ ...option, provider: 'manual' }, '2026-10-11')).toBe(false)
    expect(canRecheckFlight({ ...option, provider: 'serpapi' }, '2026-10-11')).toBe(true)
  })

  it('verschiebt Daten über Monatsgrenzen', () => {
    expect(shiftDate('2027-05-01', -2)).toBe('2027-04-29')
    expect(shiftDate('2027-12-31', 1)).toBe('2028-01-01')
  })
})

describe('Uhrzeit-Filter', () => {
  const a = journey({ signature: 'direkt-nachmittags' }) // Hin 14:25–16:25, Rück 22:15–01:50
  const b = journey({ signature: 'frueh-mit-umstieg', stops: true }) // Hin 06:00–11:30

  it('filtert nach Abflug des Hinflugs', () => {
    const result = filterAndSortFlights([a, b], { ...noFlightFilters, departure: [{ from: 8, to: 24 }] }, 'price')
    expect(result.map((r) => r.journey.signature)).toEqual(['direkt-nachmittags'])
  })

  it('filtert nach Ankunft des Rückflugs (Uhrzeit am Ankunftstag)', () => {
    const result = filterAndSortFlights([a], { ...noFlightFilters, arrival: [anyTime, { from: 6, to: 23 }] }, 'price')
    expect(result).toHaveLength(0)
  })
})

describe('Beste Wahl', () => {
  // Nur der Hinflug zählt hier; Preis pro Person
  const offer = (signature: string, pricePerAdult: number, hours: number, stops = 0): { journey: FlightJourney; fare: FlightFare } => {
    const base = journey({ signature })
    const leg = { ...base.legs[0], stops, durationMinutes: hours * 60 }
    const j = { ...base, legs: [leg], totalMinutes: hours * 60 }
    return { journey: j, fare: fare({ pricePerAdult, totalPrice: pricePerAdult * 2 }) }
  }
  const best = (items: ReturnType<typeof offer>[], value?: 'cheap' | 'balanced' | 'fast') =>
    [...rateFlights(items, value)].find(([, r]) => r.best)![0]

  it('Zeitzuschlag wächst schneller als die Stunden', () => {
    expect(timeCost(60)).toBeLessThan(10)
    expect(timeCost(15 * 60)).toBeGreaterThan(200)
    expect(timeCost(15 * 60) / timeCost(60)).toBeGreaterThan(25)
  })

  it('16 Std. in Kopenhagen warten lohnt sich nicht für 100 € weniger', () => {
    expect(best([offer('direkt', 450, 5), offer('kopenhagen', 350, 20, 1)])).toBe('direkt')
  })

  it('… für 300 € weniger schon', () => {
    expect(best([offer('direkt', 450, 5), offer('kopenhagen', 150, 20, 1)])).toBe('kopenhagen')
  })

  it('1 Std. länger mit Umstieg für 40 € weniger ist die bessere Wahl', () => {
    expect(best([offer('direkt', 240, 5), offer('umstieg', 200, 6, 1)])).toBe('umstieg')
  })

  it('Bei „Schnell zuerst“ gewinnt eher der schnelle Flug', () => {
    const items = [offer('direkt', 240, 5), offer('umstieg', 215, 7, 1)]
    expect(best(items, 'cheap')).toBe('umstieg')
    expect(best(items, 'fast')).toBe('direkt')
  })

  it('markiert günstigsten und schnellsten und begründet die beste Wahl', () => {
    const ratings = rateFlights([offer('direkt', 260, 5), offer('umstieg', 220, 9, 1), offer('mitte', 235, 6, 1)])
    expect(ratings.get('umstieg')!.cheapest).toBe(true)
    expect(ratings.get('direkt')!.fastest).toBe(true)
    const [sig, rating] = [...ratings].find(([, r]) => r.best)!
    expect(sig).toBe('mitte')
    expect(rating.note?.replace(/\s/g, ' ')).toBe('15 € pro Person mehr als der günstigste, dafür 3 Std. schneller')
  })

  it('sortiert nach bester Wahl', () => {
    const items = [offer('kopenhagen', 350, 20, 1), offer('direkt', 450, 5)].map((i) => i.journey)
    items[0].fares = [fare({ pricePerAdult: 350 })]
    items[1].fares = [fare({ pricePerAdult: 450 })]
    expect(filterAndSortFlights(items, noFlightFilters, 'best').map((r) => r.journey.signature)).toEqual(['direkt', 'kopenhagen'])
  })
})
