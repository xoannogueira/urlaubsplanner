import type { Airport } from './airports'
import { api, json } from './client'
import { placesUrl } from './places'
import type { Place, Trip } from './types'
import { tripRange } from '../lib/dates'
import { flightDates, periodForFlight } from '../lib/flightPeriod'
import { formatDateRange } from '../lib/format'
import { newMismatchMessage } from '../lib/hotelFit'
import { isChosen } from '../lib/options'

/** Was die App nach dem Auswählen eines Flugs angepasst hat – für den Hinweis mit „Rückgängig“. */
export interface TripAdjustment {
  tripId: string
  message: string
  /** Fehlt, wenn sich die Änderung nicht sinnvoll zurücknehmen lässt (dann nur ein Hinweis). */
  undo?: () => Promise<Trip>
}

/** Hinweis unten rechts anzeigen (z. B. „Reisezeitraum verlängert“). */
export function announceAdjustment(adjustment: TripAdjustment) {
  window.dispatchEvent(new CustomEvent<TripAdjustment>(ADJUST_EVENT, { detail: adjustment }))
}

export const ADJUST_EVENT = 'urlaubsplanner:trip-adjusted'

/**
 * Nach dem Auswählen oder Buchen eines Flugs: Reisezeitraum an Ankunft des Hinflugs und Abflug des Rückflugs
 * anpassen; hat die Reise noch keine Etappe, eine für die Zielstadt anlegen. Fehler hier sind nicht schlimm –
 * der Flug ist ja gespeichert –, deshalb werden sie nur protokolliert.
 */
export async function adjustTripToFlight(trip: Trip, optionId: string, store: (trip: Trip) => void): Promise<void> {
  const option = trip.options.find((o) => o.id === optionId)
  if (!option || option.kind !== 'Flight' || !isChosen(option)) return
  const dates = flightDates(option)
  if (!dates) return
  const base = `/trips/${trip.id}`
  const before = { range: tripRange(trip) }
  const period = periodForFlight(trip, dates)
  const createStage = trip.stages.length === 0 && dates.destination !== null
  if (!period && !createStage) return

  try {
    let current = trip
    const done: string[] = []
    if (period) {
      const beforePeriod = current
      current = await api<Trip>(`${base}/period`, { method: 'PUT', ...json(period) })
      done.push(`Zeitraum an den Flug angepasst: ${formatDateRange(period.startDate, period.endDate)}`)
      const hotels = newMismatchMessage(beforePeriod, current)
      if (hotels) done.push(hotels)
    }
    let stageId: string | null = null
    const range = tripRange(current)
    if (createStage && range.start && range.end && range.end > range.start) {
      const [airport] = await api<Airport[]>(`/airports/lookup?codes=${dates.destination}`)
      if (airport) {
        const name = await germanCityName(airport)
        const before = new Set(current.stages.map((s) => s.id))
        current = await api<Trip>(`${base}/stages`, {
          method: 'POST',
          ...json({ name, startDate: range.start, endDate: range.end, latitude: airport.latitude, longitude: airport.longitude }),
        })
        stageId = current.stages.find((s) => !before.has(s.id))?.id ?? null
        done.push(`Etappe „${name}“ angelegt`)
      }
    }
    if (done.length === 0) return
    store(current)

    const undo = async () => {
      let t = current
      if (stageId) t = await api<Trip>(`${base}/stages/${stageId}`, { method: 'DELETE' })
      if (period) {
        // Zeitraum wie vorher – oder wieder „noch offen“, wenn es vorher keinen gab (dann gibt es auch keine Etappen).
        t =
          before.range.start && before.range.end
            ? await api<Trip>(`${base}/period`, { method: 'PUT', ...json({ startDate: before.range.start, endDate: before.range.end }) })
            : await api<Trip>(base, {
                method: 'PUT',
                ...json({ name: t.name, travelers: t.travelers, startDate: null, endDate: null, notes: t.notes }),
              })
      }
      store(t)
      return t
    }
    announceAdjustment({ tripId: trip.id, message: done.join(' · '), undo })
  } catch (e) {
    console.warn('Reise an Flug anpassen:', e)
  }
}

/** „Lisbon“ → „Lissabon“: deutscher Ortsname über die Ortssuche, sonst der Name aus der Flughafenliste. */
async function germanCityName(airport: Airport): Promise<string> {
  try {
    const places = await api<Place[]>(placesUrl(airport.city || airport.name, { latitude: airport.latitude, longitude: airport.longitude }))
    const near = places.find((p) => Math.abs(p.latitude - airport.latitude) < 0.6 && Math.abs(p.longitude - airport.longitude) < 0.9)
    return near?.name ?? (airport.city || airport.name)
  } catch {
    return airport.city || airport.name
  }
}
