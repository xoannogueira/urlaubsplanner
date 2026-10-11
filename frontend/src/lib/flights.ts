import type { Airport } from '../api/airports'
import type { FlightFare, FlightJourney, FlightJourneyLeg, FlightLegQuery } from '../api/flights'
import type { MapAirport, MapArc } from '../components/map/types'
import type { LatLng, OptionInput, Stage, TripOption } from '../api/types'
import { formatEuro, formatShortDate, todayIso } from './format'
import { distanceKm } from './geo'

/** Hin & zurück, Gabelflug (zurück von woanders) oder nur ein Weg. */
export type TripType = 'roundtrip' | 'openjaw' | 'oneway'

export interface LegDraft {
  origins: string[]
  destinations: string[]
  date: string
}

export interface FlightPlan {
  type: TripType
  outbound: LegDraft
  /** Bei Hin & zurück ergibt sich der Rückflug aus dem Hinflug; nur das Datum zählt. */
  inbound: LegDraft
}

/** Strecken für die Suche. Hin & zurück: Rückflug = Hinflug umgedreht. */
export function planLegs(plan: FlightPlan): FlightLegQuery[] {
  const out = { origins: plan.outbound.origins, destinations: plan.outbound.destinations, date: plan.outbound.date }
  if (plan.type === 'oneway') return [out]
  if (plan.type === 'roundtrip') {
    return [out, { origins: plan.outbound.destinations, destinations: plan.outbound.origins, date: plan.inbound.date }]
  }
  return [out, { origins: plan.inbound.origins, destinations: plan.inbound.destinations, date: plan.inbound.date }]
}

/** Wie viele Suchen (LiteAPI-Abfragen) die Flughafen-Auswahl ergibt. */
export function combinationCount(legs: FlightLegQuery[]): number {
  return legs.reduce((n, leg) => n * leg.origins.reduce((m, o) => m + leg.destinations.filter((d) => d !== o).length, 0), 1)
}

/** Was im Formular noch fehlt; null = bereit zum Suchen. */
export function planProblem(plan: FlightPlan, today = todayIso()): string | null {
  const legs = planLegs(plan)
  if (legs.some((l) => l.origins.length === 0)) return 'Wähle einen Abflughafen.'
  if (legs.some((l) => l.destinations.length === 0)) return 'Wähle einen Zielflughafen.'
  if (legs.some((l) => !l.date)) return 'Wähle ein Datum.'
  if (legs[0].date < today) return 'Das Datum liegt in der Vergangenheit.'
  if (legs.length === 2 && legs[1].date < legs[0].date) return 'Der Rückflug liegt vor dem Hinflug.'
  if (combinationCount(legs) === 0) return 'Start und Ziel sind gleich.'
  if (combinationCount(legs) > 8) return `Das wären ${combinationCount(legs)} Suchen – höchstens 8. Wähle weniger Flughäfen.`
  return null
}

/**
 * Vorschlag aus den Etappen: Hinflug am ersten Tag zur ersten Etappe, Rückflug am letzten Tag von der letzten.
 * Liegen erste und letzte Etappe weit auseinander (> 100 km), ist ein Gabelflug sinnvoll.
 */
export function suggestTripType(stages: Stage[]): TripType {
  const located = stages.filter((s) => s.latitude != null && s.longitude != null)
  if (located.length < 2) return 'roundtrip'
  const first = located[0]
  const last = located[located.length - 1]
  const km = distanceKm(
    { latitude: first.latitude!, longitude: first.longitude! },
    { latitude: last.latitude!, longitude: last.longitude! },
  )
  return km > 100 ? 'openjaw' : 'roundtrip'
}

export interface FlightFilters {
  nonstop: boolean
  /** Nur Tarife mit Aufgabegepäck */
  withBag: boolean
}

export const noFlightFilters: FlightFilters = { nonstop: false, withBag: false }

export type FlightSort = 'price' | 'duration' | 'departure'

/** Tarif, der zu den Filtern passt: günstigster, bzw. günstigster mit Koffer. */
export function fareFor(journey: FlightJourney, filters: FlightFilters): FlightFare | null {
  return filters.withBag ? (journey.fares.find((f) => f.checkedBags > 0) ?? null) : journey.fares[0]
}

export function filterAndSortFlights(
  journeys: FlightJourney[],
  filters: FlightFilters,
  sort: FlightSort,
): { journey: FlightJourney; fare: FlightFare }[] {
  return journeys
    .flatMap((journey) => {
      if (filters.nonstop && journey.legs.some((l) => l.stops > 0)) return []
      const fare = fareFor(journey, filters)
      return fare ? [{ journey, fare }] : []
    })
    .sort((a, b) => {
      if (sort === 'duration') return a.journey.totalMinutes - b.journey.totalMinutes || a.fare.totalPrice - b.fare.totalPrice
      if (sort === 'departure') return a.journey.legs[0].departure.localeCompare(b.journey.legs[0].departure)
      return a.fare.totalPrice - b.fare.totalPrice || a.journey.totalMinutes - b.journey.totalMinutes
    })
}

/** 425 → "7 Std. 5 Min." */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} Min.`
  return m === 0 ? `${h} Std.` : `${h} Std. ${m} Min.`
}

/** "2027-05-12T14:25:00" → "14:25" (Ortszeit des Flughafens) */
export const formatClock = (iso: string) => iso.slice(11, 16)

export function stopsLabel(leg: FlightJourneyLeg): string {
  if (leg.stops === 0) return 'Direkt'
  const via = leg.segments
    .slice(1)
    .map((s) => s.origin)
    .join(', ')
  return `${leg.stops} ${leg.stops === 1 ? 'Umstieg' : 'Umstiege'} (${via})`
}

/** "STR → LIS · OPO → STR" */
export const flightTitle = (journey: FlightJourney) => journey.legs.map((l) => `${l.origin} → ${l.destination}`).join(' · ')

export function fareSummary(fare: FlightFare): string {
  return [
    `Tarif ${fare.family}`,
    fare.checkedBags > 0
      ? `${fare.checkedBags}× Koffer${fare.checkedBagKg ? ` ${fare.checkedBagKg} kg` : ''}`
      : `nur Handgepäck${fare.cabinBagKg ? ` ${fare.cabinBagKg} kg` : ''}`,
    fare.refundable
      ? 'erstattbar'
      : fare.changeable
        ? `umbuchbar${fare.changeFee ? ` (${formatEuro(fare.changeFee)})` : ''}`
        : 'nicht umbuchbar',
  ].join(' · ')
}

/** Notiz beim Merken: eine Zeile pro Strecke plus Tarif. */
export function flightNotes(journey: FlightJourney, fare: FlightFare): string {
  const legs = journey.legs.map((leg) => {
    const date = formatShortDate(leg.departure.slice(0, 10))
    const flights = leg.segments.map((s) => s.carrierCode + s.flightNumber).join(' + ')
    const arrival = formatClock(leg.arrival) + (leg.dayChange > 0 ? ` (+${leg.dayChange})` : '')
    return `${leg.origin} → ${leg.destination}: ${date}, ${formatClock(leg.departure)}–${arrival}, ${flights}, ${stopsLabel(leg)}`
  })
  return [...legs, fareSummary(fare)].join('\n')
}

/** Daten fürs Merken als Favorit. Der Ort ist der Zielflughafen des Hinflugs (für die Karte). */
export function flightOptionInput(
  journey: FlightJourney,
  fare: FlightFare,
  destination: LatLng | null,
  destinationName: string | null,
): OptionInput {
  const first = journey.legs[0]
  const last = journey.legs[journey.legs.length - 1]
  return {
    kind: 'Flight',
    title: flightTitle(journey),
    status: 'Favorite',
    stageId: null,
    url: journey.bookingUrl,
    price: fare.totalPrice,
    pricePerPerson: false,
    startDate: first.departure.slice(0, 10),
    endDate: last.arrival.slice(0, 10),
    locationName: destinationName,
    latitude: destination?.latitude ?? null,
    longitude: destination?.longitude ?? null,
    notes: flightNotes(journey, fare),
    imageUrl: null,
    provider: 'liteapi',
    externalId: `${journey.signature}#${fare.family}`,
  }
}

export interface SignatureLeg {
  origin: string
  destination: string
  date: string
  flights: string[]
}

/** "STR-LIS@2027-05-12:EW2604|OPO-STR@2027-05-19:EW2713#Smart" → Strecken + Tarif */
export function parseSignature(value: string | null | undefined): { legs: SignatureLeg[]; fare: string | null } | null {
  if (!value) return null
  const [signature, fare = null] = value.split('#')
  const legs: SignatureLeg[] = []
  for (const part of signature.split('|')) {
    const match = /^([A-Z]{3})-([A-Z]{3})@(\d{4}-\d{2}-\d{2}):(.*)$/.exec(part)
    if (!match) return null
    legs.push({ origin: match[1], destination: match[2], date: match[3], flights: match[4] ? match[4].split('+') : [] })
  }
  return { legs, fare }
}

/** Gemerkter Flug aus der Suche, dessen Abflug noch in der Zukunft liegt. */
export function canRecheckFlight(option: TripOption, today: string = todayIso()): boolean {
  if (option.kind !== 'Flight' || option.provider !== 'liteapi') return false
  const parsed = parseSignature(option.externalId)
  return parsed !== null && parsed.legs[0].date >= today
}

/** Ein Datum um Tage verschieben: ("2027-05-12", -2) → "2027-05-10" */
export function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

/** Bögen und Flughäfen für gemerkte Flüge; der ausgewählte Flug wird hervorgehoben. */
export function savedFlightArcs(
  options: TripOption[],
  airports: Airport[],
  selectedId: string | null,
): { arcs: MapArc[]; airports: MapAirport[] } {
  const byCode = new Map(airports.map((a) => [a.code, a]))
  const pos = (code: string) => {
    const a = byCode.get(code)
    return a ? { latitude: a.latitude, longitude: a.longitude } : null
  }
  const arcs: MapArc[] = []
  const used = new Set<string>()
  for (const option of options) {
    for (const leg of parseSignature(option.externalId)?.legs ?? []) {
      const from = pos(leg.origin)
      const to = pos(leg.destination)
      if (!from || !to) continue
      arcs.push({ id: `${option.id}:${leg.origin}-${leg.destination}`, from, to, emphasis: option.id === selectedId ? 'active' : 'muted' })
      used.add(leg.origin)
      used.add(leg.destination)
    }
  }
  return {
    arcs,
    airports: [...used].flatMap((code) => {
      const a = byCode.get(code)
      return a ? [{ code, position: { latitude: a.latitude, longitude: a.longitude }, title: `${a.code} – ${a.name}` }] : []
    }),
  }
}
