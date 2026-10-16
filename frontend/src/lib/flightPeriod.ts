import type { Trip, TripOption } from '../api/types'
import { flightTime } from './dashboard'
import { shownRange } from './dates'
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
  const current = shownRange(trip)
  const end = dates.end ?? current.end
  if (!end || end <= dates.start) return null
  if (current.start === dates.start && current.end === end) return null
  return { startDate: dates.start, endDate: end }
}
