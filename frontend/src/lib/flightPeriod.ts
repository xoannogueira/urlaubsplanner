import type { Trip, TripOption } from '../api/types'
import { flightTime } from './dashboard'
import { tripRange } from './dates'
import { distanceKm, toLatLng } from './geo'
import { isTransitAnreise } from './options'
import { parseSignature, shiftDate } from './flights'

export interface FlightDates {
  /** Ankunftstag des Hinflugs (bei Nachtflug der Tag nach dem Abflug) */
  start: string
  /** Abflugtag des Rückflugs, bei Nur-Hinflug null */
  end: string | null
  /** Zielflughafen des Hinflugs (IATA), bei manuell eingetragenen Flügen null */
  destination: string | null
}

/** Wann man ankommt und wann es zurückgeht – aus einem gemerkten Flug. */
export function flightDates(o: TripOption): FlightDates | null {
  if (o.kind !== 'Flight') return null
  const parsed = parseSignature(o.externalId)
  if (parsed) {
    const out = parsed.legs[0]
    const time = flightTime(o.notes, out.origin, out.destination)
    const plus = time ? /\(\+(\d)\)/.exec(time) : null
    const back = parsed.legs.length > 1 ? parsed.legs[parsed.legs.length - 1] : null
    return { start: plus ? shiftDate(out.date, Number(plus[1])) : out.date, end: back?.date ?? null, destination: out.destination }
  }
  if (!o.startDate) return null
  return { start: o.startDate, end: o.endDate && o.endDate !== o.startDate ? o.endDate : null, destination: null }
}

/** Neuer Reisezeitraum passend zum Flug – oder null, wenn er schon passt bzw. sich nichts Sinnvolles ergibt. */
export function periodForFlight(trip: Trip, dates: FlightDates): { startDate: string; endDate: string } | null {
  const current = tripRange(trip)
  const end = dates.end ?? current.end
  if (!end || end <= dates.start) return null
  if (current.start === dates.start && current.end === end) return null
  return { startDate: dates.start, endDate: end }
}

/**
 * Anreise mit Bus & Bahn: Hinfahrt (Ziel = Etappe) setzt den Beginn auf den Ankunftstag, Rückfahrt (Ziel = zu Hause)
 * das Ende auf den Abfahrtstag. Verbindungen aus einem Beispiel-Fahrplan (anderes Datum) ändern nichts.
 */
export function periodForTransit(trip: Trip, o: TripOption): { startDate: string; endDate: string } | null {
  if (!isTransitAnreise(o) || !o.startDate || !o.endDate) return null
  if (o.notes?.includes('Beispiel:')) return null
  const stage = trip.stages.find((s) => s.id === o.stageId)
  const at = toLatLng(stage)
  const target = toLatLng(o)
  const outbound = !at || !target || distanceKm(at, target) < 40
  const current = tripRange(trip)
  const start = outbound ? o.endDate : current.start
  const end = outbound ? current.end : o.startDate
  if (!start || !end || end <= start) return null
  if (start === current.start && end === current.end) return null
  return { startDate: start, endDate: end }
}
