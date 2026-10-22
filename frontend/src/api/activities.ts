import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { LatLng } from './types'

export type ActivityCategory =
  | 'Sight'
  | 'Museum'
  | 'Viewpoint'
  | 'Castle'
  | 'Religious'
  | 'Nature'
  | 'Beach'
  | 'Zoo'
  | 'ThemePark'
  | 'Restaurant'
  | 'Cafe'
  | 'Bar'
  | 'IceCream'

/** Sehenswertes oder Essen & Trinken */
export type ActivityTheme = 'Sights' | 'Food'

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
  /** Essen & Trinken: Küche auf Deutsch, z. B. „Portugiesisch, Fisch“ */
  cuisine?: string | null
  /** „vegan“, „vegetarisch“, „vegetarische Auswahl“ … */
  diet?: string | null
  phone?: string | null
}

export type ActivitySort = 'Popular' | 'Distance'

export interface ActivityPage {
  activities: ActivitySuggestion[]
  /** Treffer insgesamt (nach Kategorie und Suchtext) */
  total: number
  offset: number
  /** Anzahl pro Kategorie (nach Suchtext, ohne Kategoriefilter) */
  categories: { category: ActivityCategory; count: number }[]
  fetchedAt: string
  radiusMeters: number
}

export interface ActivityFilter {
  category: ActivityCategory | null
  query: string
  sort: ActivitySort
}

export const PAGE_SIZE = 10

/**
 * Vorschläge seitenweise (10 Stück). Die Suche bei OpenStreetMap läuft auf dem Server nur einmal und bleibt
 * einen Tag im Cache – weitere Seiten, Filter und Sortierung kosten keine neue Abfrage dort.
 */
export function useActivityPages(center: LatLng | null, radiusMeters: number, filter: ActivityFilter, theme: ActivityTheme = 'Sights') {
  return useInfiniteQuery({
    queryKey: ['activities', theme, center?.latitude.toFixed(3), center?.longitude.toFixed(3), radiusMeters, filter],
    queryFn: ({ signal, pageParam }) => {
      const params = new URLSearchParams({
        lat: String(center!.latitude),
        lon: String(center!.longitude),
        radiusMeters: String(radiusMeters),
        offset: String(pageParam),
        limit: String(PAGE_SIZE),
        sort: filter.sort,
        theme,
      })
      if (filter.category) params.set('category', filter.category)
      if (filter.query.trim()) params.set('q', filter.query.trim())
      return api<ActivityPage>(`/activities?${params.toString()}`, { signal })
    },
    initialPageParam: 0,
    getNextPageParam: (last) => (last.offset + last.activities.length < last.total ? last.offset + last.activities.length : undefined),
    enabled: center !== null,
    staleTime: 6 * 60 * 60_000,
    gcTime: 6 * 60 * 60_000,
    placeholderData: keepPreviousData,
    // Das Backend probiert schon mehrere Server – ein weiterer Versuch würde OpenStreetMap nur zusätzlich belasten.
    retry: false,
  })
}

/**
 * Foto für einen Vorschlag ohne Bild nachladen (Wikimedia Commons in der Nähe, passender Dateiname).
 * Nur wenn die Karte sichtbar ist – sonst gingen bei langen Listen viele Anfragen auf einmal raus.
 */
export function useActivityPhoto(a: Pick<ActivitySuggestion, 'id' | 'name' | 'latitude' | 'longitude' | 'imageUrl'>, visible: boolean) {
  return useQuery({
    queryKey: ['activity-photo', a.id],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ lat: String(a.latitude), lon: String(a.longitude), name: a.name })
      return api<{ url: string | null }>(`/activities/photo?${params.toString()}`, { signal })
    },
    enabled: visible && !a.imageUrl,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 24 * 60 * 60_000,
    retry: false,
  })
}
