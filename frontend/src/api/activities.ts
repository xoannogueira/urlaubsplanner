import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { LatLng } from './types'

export type ActivityCategory = 'Sight' | 'Museum' | 'Viewpoint' | 'Castle' | 'Religious' | 'Nature' | 'Beach' | 'Zoo' | 'ThemePark'

export interface ActivitySuggestion {
  /** OpenStreetMap-Kennung, z. B. "way/123" */
  id: string
  name: string
  category: ActivityCategory
  latitude: number
  longitude: number
  distanceKm: number
  description: string | null
  imageUrl: string | null
  wikipediaUrl: string | null
  website: string | null
  /** OpenStreetMap-Format, z. B. "Tu-Su 10:00-18:00" */
  openingHours: string | null
  /** true = Eintritt frei, false = kostet, null = unbekannt */
  freeEntry: boolean | null
  /** Anzahl Wikipedia-Sprachversionen – wie bekannt der Ort ist */
  popularity: number
  wikidataId: string | null
}

export interface ActivitySearchResponse {
  activities: ActivitySuggestion[]
  fetchedAt: string
  radiusMeters: number
}

/** Vorschläge rund um die Etappe – kostenlos, deshalb lädt die Liste direkt (und bleibt einen Tag im Cache). */
export function useActivitySuggestions(center: LatLng | null, radiusMeters: number) {
  return useQuery({
    queryKey: ['activities', center?.latitude.toFixed(3), center?.longitude.toFixed(3), radiusMeters],
    queryFn: ({ signal }) =>
      api<ActivitySearchResponse>(`/activities?lat=${center!.latitude}&lon=${center!.longitude}&radiusMeters=${radiusMeters}`, { signal }),
    enabled: center !== null,
    staleTime: 6 * 60 * 60_000,
    gcTime: 6 * 60 * 60_000,
    placeholderData: keepPreviousData,
    retry: 1,
  })
}
