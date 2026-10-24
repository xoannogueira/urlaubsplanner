import { updateSearchDraft } from '../../hooks/useSearchDraft'
import { flightDraftKey, segmentDraftKey, type FlightSegment } from '../../lib/flightSegments'

/** Gleicher Schlüssel wie in der Anreise-Suche (Flug oder Bus & Bahn). */
const ANREISE_MODE_KEY = 'urlaubsplanner.anreise'

/**
 * Flugsuche vorbereiten, bevor man zur Seite „Anreise“ wechselt: Such-Tab und Flug wählen, die richtige Strecke
 * (An-/Rückreise oder Weiterflug) einstellen und optional Werte vorbelegen (z. B. Flughäfen und Datum aus dem
 * Preiskalender). Gesucht wird erst auf Knopfdruck – kostet also nichts.
 */
export function prepareFlightSearch(tripId: string, segment: Pick<FlightSegment, 'id' | 'kind'>, values?: Record<string, unknown>) {
  updateSearchDraft(`${tripId}.seite.Flight`, { mode: 'search' })
  updateSearchDraft(segmentDraftKey(tripId), { segment: segment.id })
  if (values) updateSearchDraft(flightDraftKey(tripId, segment), { ...values, last: null })
  try {
    localStorage.setItem(`${ANREISE_MODE_KEY}.${tripId}`, 'flug')
  } catch {
    // dann bleibt die zuletzt gewählte Art
  }
}
