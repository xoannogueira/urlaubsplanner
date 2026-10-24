import type { Trip } from '../api/types'
import { parseSignature } from './flights'
import { distanceKm, toLatLng } from './geo'

/** So nah muss ein Flughafen an einer Etappe liegen, damit eine Strecke zur Reise gehört. */
export const NEAR_STAGE_KM = 300

type Located = { code: string; latitude: number; longitude: number }

/**
 * Gehört eine Strecke (z. B. aus dem Preisarchiv) zu dieser Reise? Ja, wenn sie in einem gemerkten Flug der Reise
 * vorkommt oder ein Ende nah an einer Etappe liegt. So erscheinen bei der Japan-Reise keine Barcelona-Preise –
 * der gemeinsame Heimatflughafen allein reicht nicht.
 */
export function routeFitsTrip(trip: Trip, origin: string, destination: string, airports: Located[]): boolean {
  const saved = trip.options.some(
    (o) => o.kind === 'Flight' && parseSignature(o.externalId)?.legs.some((l) => l.origin === origin && l.destination === destination),
  )
  if (saved) return true
  const centers = trip.stages.map(toLatLng).filter((c): c is NonNullable<typeof c> => c !== null)
  // Ohne Etappen mit Ort lässt sich nichts zuordnen – dann lieber alles zeigen.
  if (centers.length === 0) return true
  return [origin, destination].some((code) => {
    const a = airports.find((x) => x.code === code)
    return !!a && centers.some((c) => distanceKm(a, c) <= NEAR_STAGE_KM)
  })
}
