import type { Stage, TripOption } from '../api/types'
import { parseSignature } from './flights'
import { distanceKm, toLatLng } from './geo'

/** Ab dieser Entfernung zwischen zwei Etappen lohnt sich ein Weiterflug (z. B. Osaka → Okinawa). */
export const HOP_MIN_KM = 300

export type FlightSegment =
  { id: 'trip'; kind: 'trip' } | { id: string; kind: 'hop'; from: Stage; to: Stage; date: string; distanceKm: number }

export const hopId = (from: Pick<Stage, 'id'>, to: Pick<Stage, 'id'>) => `hop:${from.id}:${to.id}`

const sorted = (stages: Stage[]) => [...stages].sort((a, b) => a.startDate.localeCompare(b.startDate))

/**
 * Welche Flüge braucht die Reise? Immer An- und Rückreise; dazu ein Weiterflug zwischen zwei aufeinanderfolgenden
 * Etappen, die weit auseinander liegen. Datum = Beginn der nächsten Etappe.
 */
export function flightSegments(stages: Stage[]): FlightSegment[] {
  const list = sorted(stages)
  const result: FlightSegment[] = [{ id: 'trip', kind: 'trip' }]
  for (let i = 1; i < list.length; i++) {
    const a = toLatLng(list[i - 1])
    const b = toLatLng(list[i])
    if (!a || !b) continue
    const km = distanceKm(a, b)
    if (km >= HOP_MIN_KM)
      result.push({ id: hopId(list[i - 1], list[i]), kind: 'hop', from: list[i - 1], to: list[i], date: list[i].startDate, distanceKm: km })
  }
  return result
}

/**
 * Wo ist man nach der Landung an diesem Tag? Die Etappe, die an dem Tag beginnt oder läuft (bei einem Wechsel die
 * neue). Vor der Reise: die erste Etappe.
 */
export function stageArriving(stages: Stage[], date: string): Stage | null {
  const list = sorted(stages)
  if (!date || list.length === 0) return list[0] ?? null
  const started = list.filter((s) => s.startDate <= date)
  return started[started.length - 1] ?? list[0]
}

/**
 * Wo startet man an diesem Tag? Die Etappe, die an dem Tag endet oder läuft (bei einem Wechsel die alte). Nach der
 * Reise: die letzte Etappe.
 */
export function stageLeaving(stages: Stage[], date: string): Stage | null {
  const list = sorted(stages)
  if (!date || list.length === 0) return list[list.length - 1] ?? null
  return list.find((s) => s.endDate >= date && s.startDate < date) ?? list.find((s) => s.endDate >= date) ?? list[list.length - 1]
}

export interface SavedLeg {
  origin: string
  destination: string
  date: string
}

/** Strecken aus gemerkten Flügen (je Strecke nur einmal, nach Datum) – zum schnellen Übernehmen in die Suche. */
export function savedFlightLegs(options: TripOption[]): SavedLeg[] {
  const seen = new Set<string>()
  const legs: SavedLeg[] = []
  for (const o of options) {
    if (o.kind !== 'Flight') continue
    for (const leg of parseSignature(o.externalId)?.legs ?? []) {
      const key = `${leg.origin}-${leg.destination}-${leg.date}`
      if (seen.has(key)) continue
      seen.add(key)
      legs.push({ origin: leg.origin, destination: leg.destination, date: leg.date })
    }
  }
  return legs.sort((a, b) => a.date.localeCompare(b.date))
}

/** Unter diesen Namen merken sich Strecken-Auswahl und Suchmasken ihre Eingaben (siehe useSearchDraft). */
export const segmentDraftKey = (tripId: string) => `${tripId}.flugstrecke`
export const flightDraftKey = (tripId: string, segment: Pick<FlightSegment, 'id' | 'kind'>) =>
  segment.kind === 'hop' ? `${tripId}.flug.${segment.id}` : `${tripId}.flug`
