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

/**
 * Was im Formular noch fehlt; null = bereit zum Suchen.
 * multiAirport: der Anbieter sucht alle Flughäfen in einer Anfrage (Google Flights) – dann gibt es keine Obergrenze für Kombinationen.
 */
export function planProblem(plan: FlightPlan, today = todayIso(), multiAirport = false): string | null {
  const legs = planLegs(plan)
  if (legs.some((l) => l.origins.length === 0)) return 'Wähle einen Abflughafen.'
  if (legs.some((l) => l.destinations.length === 0)) return 'Wähle einen Zielflughafen.'
  if (legs.some((l) => !l.date)) return 'Wähle ein Datum.'
  if (legs[0].date < today) return 'Das Datum liegt in der Vergangenheit.'
  if (legs.length === 2 && legs[1].date < legs[0].date) return 'Der Rückflug liegt vor dem Hinflug.'
  if (combinationCount(legs) === 0) return 'Start und Ziel sind gleich.'
  if (!multiAirport && combinationCount(legs) > 8)
    return `Das wären ${combinationCount(legs)} Suchen – höchstens 8. Wähle weniger Flughäfen.`
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

/** Uhrzeit-Fenster in vollen Stunden, z. B. 6–22 = von 06:00 bis 22:00. */
export interface TimeWindow {
  from: number
  to: number
}

export const anyTime: TimeWindow = { from: 0, to: 24 }

export interface FlightFilters {
  nonstop: boolean
  /** Nur Tarife mit Aufgabegepäck */
  withBag: boolean
  /** Abflug-Fenster pro Strecke (Index 0 = Hinflug, 1 = Rückflug) */
  departure: TimeWindow[]
  /** Ankunfts-Fenster pro Strecke */
  arrival: TimeWindow[]
}

export const noFlightFilters: FlightFilters = { nonstop: false, withBag: false, departure: [], arrival: [] }

export type FlightSort = 'best' | 'price' | 'duration' | 'departure'

/** Tarif, der zu den Filtern passt: günstigster, bzw. günstigster mit Koffer. */
export function fareFor(journey: FlightJourney, filters: FlightFilters): FlightFare | null {
  return filters.withBag ? (journey.fares.find((f) => (f.checkedBags ?? 0) > 0) ?? null) : journey.fares[0]
}

const hourOf = (localTime: string) => {
  const [h, m] = localTime.slice(11, 16).split(':').map(Number)
  return h + m / 60
}

const inWindow = (hour: number, w: TimeWindow | undefined) => !w || (hour >= w.from && hour <= w.to)

/** Passt die Strecke (Index = welche Strecke der Reise) zu den Uhrzeit-Filtern? */
export function legMatchesTimes(leg: FlightJourneyLeg, index: number, filters: Pick<FlightFilters, 'departure' | 'arrival'>): boolean {
  return inWindow(hourOf(leg.departure), filters.departure[index]) && inWindow(hourOf(leg.arrival), filters.arrival[index])
}

/** Sind Uhrzeit-Filter gesetzt? */
export const hasTimeFilter = (filters: Pick<FlightFilters, 'departure' | 'arrival'>) =>
  [...filters.departure, ...filters.arrival].some((w) => w && (w.from > 0 || w.to < 24))

export function filterAndSortFlights(
  journeys: FlightJourney[],
  filters: FlightFilters,
  sort: FlightSort,
  timeValue: TimeValue = 'balanced',
): { journey: FlightJourney; fare: FlightFare }[] {
  const matching = journeys.flatMap((journey) => {
    if (filters.nonstop && journey.legs.some((l) => l.stops > 0)) return []
    if (!journey.legs.every((leg, i) => legMatchesTimes(leg, i, filters))) return []
    const fare = fareFor(journey, filters)
    return fare ? [{ journey, fare }] : []
  })
  const ratings = sort === 'best' ? rateFlights(matching, timeValue) : null
  return matching.sort((a, b) => {
    if (ratings) return ratings.get(a.journey.signature)!.score - ratings.get(b.journey.signature)!.score
    if (sort === 'duration') return a.journey.totalMinutes - b.journey.totalMinutes || a.fare.totalPrice - b.fare.totalPrice
    if (sort === 'departure') return a.journey.legs[0].departure.localeCompare(b.journey.legs[0].departure)
    return a.fare.totalPrice - b.fare.totalPrice || a.journey.totalMinutes - b.journey.totalMinutes
  })
}

/** Wie viel Zeit wert ist: „günstig“ nimmt lange Wege eher in Kauf, „schnell“ zahlt lieber mehr. */
export type TimeValue = 'cheap' | 'balanced' | 'fast'

export const timeValueLabels: Record<TimeValue, string> = { cheap: 'Günstig zuerst', balanced: 'Ausgewogen', fast: 'Schnell zuerst' }

const hourlyRate: Record<TimeValue, number> = { cheap: 3, balanced: 6, fast: 12 }

/** Zuschlag für einen Umstieg (pro Person) – Umsteigen ist lästig, auch wenn es kaum Zeit kostet. */
const STOP_COST = 10

/**
 * Was die Zeit gegenüber der schnellsten Verbindung „kostet“ (pro Person, in Euro). Wächst schneller als die Stunden:
 * 1 Std. länger ist kaum schlimm (≈ 7 €), 3 Std. schon eher (≈ 25 €), 15 Std. Warten in Kopenhagen sehr (≈ 260 €).
 */
export function timeCost(extraMinutes: number, timeValue: TimeValue = 'balanced'): number {
  const hours = Math.max(0, extraMinutes) / 60
  return hourlyRate[timeValue] * hours * (1 + hours / 8)
}

export interface FlightRating {
  /** Preis pro Person + Zeit- und Umstiegszuschlag – kleiner ist besser */
  score: number
  best: boolean
  cheapest: boolean
  fastest: boolean
  /** Kurze Begründung bei der besten Wahl */
  note: string | null
}

/** Bewertet Verbindungen untereinander: beste Wahl, günstigste, schnellste. */
export function rateFlights(
  items: { journey: FlightJourney; fare: FlightFare }[],
  timeValue: TimeValue = 'balanced',
): Map<string, FlightRating> {
  const ratings = new Map<string, FlightRating>()
  if (items.length === 0) return ratings
  const minutes = (i: (typeof items)[number]) => i.journey.totalMinutes
  const price = (i: (typeof items)[number]) => i.fare.pricePerAdult
  const stops = (i: (typeof items)[number]) => i.journey.legs.reduce((n, l) => n + l.stops, 0)
  const fastestMinutes = Math.min(...items.map(minutes))
  const cheapestPrice = Math.min(...items.map(price))
  const score = (i: (typeof items)[number]) =>
    price(i) + timeCost(minutes(i) - fastestMinutes, timeValue) + (STOP_COST * stops(i) * hourlyRate[timeValue]) / hourlyRate.balanced
  const scored = items.map((i) => ({ item: i, score: score(i) }))
  const bestScore = Math.min(...scored.map((s) => s.score))
  const cheapest = items.filter((i) => price(i) === cheapestPrice).sort((a, b) => minutes(a) - minutes(b))[0]
  const fastest = items.filter((i) => minutes(i) === fastestMinutes).sort((a, b) => price(a) - price(b))[0]
  const best = scored.find((s) => s.score === bestScore)!.item

  for (const { item, score: value } of scored) {
    const isBest = item === best
    ratings.set(item.journey.signature, {
      score: value,
      best: isBest,
      cheapest: item === cheapest,
      fastest: item === fastest,
      note: isBest && items.length > 1 ? bestNote(item, cheapest, fastest) : null,
    })
  }
  return ratings

  function bestNote(b: (typeof items)[number], c: (typeof items)[number], f: (typeof items)[number]): string | null {
    if (b === c && b === f) return 'Günstigster und schnellster Flug'
    if (b === c) return `Günstigster – nur ${formatDuration(minutes(b) - minutes(f))} länger als der schnellste`
    const saved = minutes(c) - minutes(b)
    const extra = Math.round(price(b) - price(c))
    return saved > 0
      ? `${formatEuro(extra)} pro Person mehr als der günstigste, dafür ${formatDuration(saved)} schneller`
      : `Nur ${formatEuro(extra)} pro Person mehr als der günstigste`
  }
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
  // Google Flights nennt nur den Preis – Gepäck und Bedingungen stehen beim Anbieter.
  if (fare.checkedBags == null) return 'Preis laut Google Flights · Gepäck und Bedingungen beim Buchen prüfen'
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
    return `${leg.origin} → ${leg.destination}: ${date}, ${formatClock(leg.departure)}–${arrival}, ${flights}, ${stopsLabel(leg)}, Dauer ${formatDuration(leg.durationMinutes)}`
  })
  return [...legs, fareSummary(fare)].join('\n')
}

/** Daten fürs Merken als Favorit. Der Ort ist der Zielflughafen des Hinflugs (für die Karte). */
export function flightOptionInput(
  journey: FlightJourney,
  fare: FlightFare,
  destination: LatLng | null,
  destinationName: string | null,
  provider: 'liteapi' | 'serpapi' = 'liteapi',
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
    provider,
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
  if (option.kind !== 'Flight' || (option.provider !== 'liteapi' && option.provider !== 'serpapi')) return false
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
