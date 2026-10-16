import type { Airport } from '../api/airports'
import type { TransitItinerary, TransitLeg } from '../api/transit'
import type { LatLng, OptionInput, Trip } from '../api/types'
import { stageHotel } from './activities'
import { flightTime } from './dashboard'
import { parseSignature } from './flights'
import { formatShortDate } from './format'
import { toLatLng } from './geo'
import { isChosen } from './options'

/** Wofür eine Verbindung gemerkt wird: Anreise (statt Flug) oder Transfer vor Ort. */
export type TransitScope = 'anreise' | 'transfer'

export type ModeKind = 'walk' | 'bus' | 'tram' | 'subway' | 'train' | 'ferry' | 'plane' | 'other'

/** Art und deutscher Name eines Verkehrsmittels. */
export function modeInfo(mode: string): { kind: ModeKind; label: string } {
  switch (mode) {
    case 'WALK':
      return { kind: 'walk', label: 'zu Fuß' }
    case 'BUS':
      return { kind: 'bus', label: 'Bus' }
    case 'COACH':
      return { kind: 'bus', label: 'Fernbus' }
    case 'TRAM':
    case 'CABLE_CAR':
    case 'FUNICULAR':
    case 'AERIAL_LIFT':
    case 'AREAL_LIFT':
      return { kind: 'tram', label: mode === 'TRAM' ? 'Tram' : 'Seilbahn' }
    case 'SUBWAY':
    case 'METRO':
      return { kind: 'subway', label: 'U-Bahn' }
    case 'SUBURBAN':
      return { kind: 'train', label: 'S-Bahn' }
    case 'HIGHSPEED_RAIL':
    case 'LONG_DISTANCE':
    case 'NIGHT_RAIL':
      return { kind: 'train', label: mode === 'NIGHT_RAIL' ? 'Nachtzug' : 'Fernzug' }
    case 'RAIL':
    case 'REGIONAL_RAIL':
    case 'REGIONAL_FAST_RAIL':
      return { kind: 'train', label: 'Zug' }
    case 'FERRY':
      return { kind: 'ferry', label: 'Fähre' }
    case 'AIRPLANE':
      return { kind: 'plane', label: 'Flug' }
    default:
      return { kind: 'other', label: 'Verbindung' }
  }
}

/** Uhrzeit in der Zeitzone des Halts („09:39“). */
export function clockAt(iso: string, timeZone: string | null): string {
  return format(iso, timeZone, { hour: '2-digit', minute: '2-digit' })
}

/** Datum in der Zeitzone des Halts („2027-05-12“). */
export function dateAt(iso: string, timeZone: string | null): string {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', ...zone(timeZone) }).format(
    new Date(iso),
  )
  return parts.slice(0, 10)
}

function format(iso: string, timeZone: string | null, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('de-DE', { ...options, ...zone(timeZone) }).format(new Date(iso))
}

function zone(timeZone: string | null): { timeZone?: string } {
  if (!timeZone) return {}
  try {
    new Intl.DateTimeFormat('de-DE', { timeZone })
    return { timeZone }
  } catch {
    return {}
  }
}

/**
 * Ungefährer UTC-Zeitpunkt für „Datum, Uhrzeit“ am Startort. Die genaue Zeitzone kennt erst die Fahrplanauskunft –
 * gesucht wird ohnehin in einem 2-Stunden-Fenster. Europa: MEZ/MESZ (bzw. WEZ ganz im Westen), sonst nach Längengrad.
 */
export function approximateUtc(date: string, hour: number, minute: number, at: LatLng): string {
  const [y, m, d] = date.split('-').map(Number)
  const summer = m >= 4 && m <= 10
  const europe = at.latitude > 34 && at.longitude > -11 && at.longitude < 32
  const offset = europe ? (at.longitude < -5 ? 0 : at.longitude > 21 ? 2 : 1) + (summer ? 1 : 0) : Math.round(at.longitude / 15)
  return new Date(Date.UTC(y, m - 1, d, hour - offset, minute)).toISOString()
}

/** Teilstrecken, die man anzeigt: kurze Umsteigewege (unter 3 Min.) fallen weg. */
export const visibleLegs = (legs: TransitLeg[]) => legs.filter((l) => l.mode !== 'WALK' || l.durationMinutes >= 3 || legs.length === 1)

export function transfersLabel(transfers: number): string {
  return transfers === 0 ? 'direkt' : transfers === 1 ? '1 Umstieg' : `${transfers} Umstiege`
}

/** Bezeichnung einer Teilstrecke: „ICE 9576“, „Bus 728“, „zu Fuß“. */
export function legLabel(leg: TransitLeg): string {
  const info = modeInfo(leg.mode)
  if (info.kind === 'walk') return 'zu Fuß'
  if (!leg.line) return info.label
  return /^\d/.test(leg.line) && info.kind === 'bus' ? `Bus ${leg.line}` : leg.line
}

/** Notiz beim Merken: Strecke mit Zeiten und Linien – wie bei Flügen eine Zeile pro Abschnitt. */
export function transitNotes(itinerary: TransitItinerary, fromName: string, toName: string): string {
  const first = itinerary.legs[0]
  const last = itinerary.legs[itinerary.legs.length - 1]
  const lines = visibleLegs(itinerary.legs)
    .filter((l) => l.mode !== 'WALK')
    .map(legLabel)
  const head =
    `${fromName} → ${toName}: ${formatShortDate(dateAt(itinerary.departure, first.from.timeZone))}, ` +
    `${clockAt(itinerary.departure, first.from.timeZone)}–${clockAt(itinerary.arrival, last.to.timeZone)}, ` +
    `${lines.join(' + ') || 'zu Fuß'}, ${transfersLabel(itinerary.transfers)}`
  const details = visibleLegs(itinerary.legs)
    .filter((l) => l.mode !== 'WALK')
    .map(
      (l) =>
        `${clockAt(l.from.time, l.from.timeZone)} ${l.from.name}${l.from.track ? ` (Gleis ${l.from.track})` : ''} → ` +
        `${clockAt(l.to.time, l.to.timeZone)} ${l.to.name}: ${legLabel(l)}${l.headsign ? ` Richtung ${l.headsign}` : ''}`,
    )
  return [head, ...details].join('\n')
}

/** Bahn.de-Suche mit Start, Ziel und Abfahrtszeit vorausgefüllt (Preise und Tickets). */
export function bahnUrl(fromName: string, toName: string, itinerary: TransitItinerary): string {
  const first = itinerary.legs.find((l) => l.mode !== 'WALK') ?? itinerary.legs[0]
  const date = dateAt(first.from.time, first.from.timeZone)
  const time = clockAt(first.from.time, first.from.timeZone)
  const params = new URLSearchParams({ sts: 'true', so: first.from.name || fromName, zo: toName, hd: `${date}T${time}:00` })
  return `https://www.bahn.de/buchung/fahrplan/suche#${params}`
}

/** Google Maps mit Bus & Bahn von A nach B. */
export function googleTransitUrl(from: LatLng, to: LatLng): string {
  const params = new URLSearchParams({
    api: '1',
    origin: `${from.latitude},${from.longitude}`,
    destination: `${to.latitude},${to.longitude}`,
    travelmode: 'transit',
  })
  return `https://www.google.com/maps/dir/?${params}`
}

/** Daten fürs Merken als Transport (Favorit). Gespeichert wird das Ziel als Ort und die Abfahrt als Kennung. */
export function transitOptionInput(
  itinerary: TransitItinerary,
  places: { fromName: string; toName: string; from: LatLng; to: LatLng },
  scope: TransitScope,
  stageId: string | null,
): OptionInput {
  const first = itinerary.legs[0]
  const last = itinerary.legs[itinerary.legs.length - 1]
  const lines = itinerary.legs.filter((l) => l.mode !== 'WALK').map(legLabel)
  return {
    kind: 'Transport',
    title: `${places.fromName} → ${places.toName}`,
    status: 'Favorite',
    stageId,
    url: lines.length > 0 ? bahnUrl(places.fromName, places.toName, itinerary) : googleTransitUrl(places.from, places.to),
    price: null,
    pricePerPerson: true,
    startDate: dateAt(itinerary.departure, first.from.timeZone),
    endDate: dateAt(itinerary.arrival, last.to.timeZone),
    locationName: places.toName,
    latitude: places.to.latitude,
    longitude: places.to.longitude,
    notes: transitNotes(itinerary, places.fromName, places.toName),
    provider: 'transitous',
    externalId: `${scope}|${itinerary.departure}|${lines.join('+')}`,
  }
}

export { isTransitAnreise } from './options'

export interface TransitPoint {
  name: string
  location: LatLng
}

/** Ein Weg, den man vor Ort zurücklegen muss – z. B. vom Flughafen zum Hotel. */
export interface TransferSuggestion {
  id: string
  title: string
  from: TransitPoint
  to: TransitPoint
  date: string
  /** Uhrzeit (Ortszeit) – Abfahrt ab bzw. Ankunft bis */
  hour: number
  minute: number
  arriveBy: boolean
  /** Hinweis, warum diese Zeit („Landung 11:40“) */
  hint: string
  stageId: string | null
}

/** Ziel in einer Etappe: das ausgewählte Hotel, sonst der Ort der Etappe. */
function stagePoint(trip: Trip, stageId: string): TransitPoint | null {
  const stage = trip.stages.find((s) => s.id === stageId)
  const hotel = stageHotel(trip, stageId)
  const hotelAt = hotel ? toLatLng(hotel) : null
  if (hotel && hotelAt) return { name: hotel.title, location: hotelAt }
  const at = stage ? toLatLng(stage) : null
  return stage && at ? { name: stage.name, location: at } : null
}

/**
 * Welche Wege braucht die Reise? Vom Ankunftsflughafen zur ersten Unterkunft, zwischen den Etappen und von der
 * letzten Unterkunft zum Abflughafen – aus den ausgewählten Flügen, Etappen und Hotels.
 */
export function suggestTransfers(trip: Trip, airports: Airport[]): TransferSuggestion[] {
  const result: TransferSuggestion[] = []
  const airport = (code: string): TransitPoint | null => {
    const a = airports.find((x) => x.code === code)
    return a ? { name: `Flughafen ${a.city || a.name} (${a.code})`, location: { latitude: a.latitude, longitude: a.longitude } } : null
  }
  const stages = [...trip.stages].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const flight = trip.options.filter((o) => o.kind === 'Flight' && isChosen(o)).map((o) => ({ o, sig: parseSignature(o.externalId) }))[0]
  const legs = flight?.sig?.legs ?? []

  // Ankunft: Landung → erste Unterkunft
  const first = stages[0]
  if (first && legs[0]) {
    const from = airport(legs[0].destination)
    const to = stagePoint(trip, first.id)
    const landing = flightTime(flight.o.notes, legs[0].origin, legs[0].destination)?.split('–')[1]
    const [h, m] = landing ? landing.slice(0, 5).split(':').map(Number) : [12, 0]
    if (from && to) {
      // Nach der Landung ca. 45 Min. für Gepäck und Weg zum Bahnhof
      const total = h * 60 + m + 45
      result.push({
        id: 'ankunft',
        title: 'Vom Flughafen zur Unterkunft',
        from,
        to,
        date: legs[0].date,
        hour: Math.min(23, Math.floor(total / 60)),
        minute: total % 60,
        arriveBy: false,
        hint: landing ? `Landung ${landing.slice(0, 5)} – Abfahrt frühestens 45 Min. später` : 'Ankunftszeit unbekannt',
        stageId: first.id,
      })
    }
  }

  // Zwischen den Etappen
  for (let i = 1; i < stages.length; i++) {
    const from = stagePoint(trip, stages[i - 1].id)
    const to = stagePoint(trip, stages[i].id)
    if (from && to) {
      result.push({
        id: `etappe:${stages[i].id}`,
        title: `${stages[i - 1].name} → ${stages[i].name}`,
        from,
        to,
        date: stages[i].startDate,
        hour: 10,
        minute: 0,
        arriveBy: false,
        hint: 'Etappenwechsel – Abfahrt ab 10 Uhr (nach dem Check-out)',
        stageId: stages[i].id,
      })
    }
  }

  // Abreise: letzte Unterkunft → Abflughafen (2 Std. vor Abflug da sein)
  const last = stages[stages.length - 1]
  const back = legs.length > 1 ? legs[legs.length - 1] : null
  if (last && back) {
    const from = stagePoint(trip, last.id)
    const to = airport(back.origin)
    const departure = flightTime(flight.o.notes, back.origin, back.destination)?.split('–')[0]
    if (from && to) {
      const [h, m] = departure ? departure.split(':').map(Number) : [14, 0]
      const total = Math.max(0, h * 60 + m - 120)
      result.push({
        id: 'abreise',
        title: 'Von der Unterkunft zum Flughafen',
        from,
        to,
        date: back.date,
        hour: Math.floor(total / 60),
        minute: total % 60,
        arriveBy: true,
        hint: departure ? `Abflug ${departure} – Ankunft am Flughafen 2 Std. vorher` : 'Abflugzeit unbekannt',
        stageId: last.id,
      })
    }
  }
  return result
}
