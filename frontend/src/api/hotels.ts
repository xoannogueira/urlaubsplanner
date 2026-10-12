import { keepPreviousData, useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, json } from './client'

/** Ein buchbares Zimmerangebot; bei mehreren Zimmern alle zusammen. */
export interface RoomOffer {
  name: string | null
  boardName: string | null
  refundable: boolean
  totalPrice: number
  currency: string
  /** Vom Hotel empfohlener öffentlicher Preis – ungefähr das, was Booking & Co. zeigen. */
  marketPrice: number | null
  /** Nicht im Preis enthalten, wird vor Ort bezahlt (z. B. Kurtaxe). */
  payAtProperty: number | null
  payAtPropertyLabel: string | null
  /** Direkter Link zu diesem Angebot beim Anbieter (Google Hotels) */
  url?: string | null
}

export interface HotelOffer {
  hotelId: string
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  /** Gästebewertung 0–10 */
  rating: number | null
  reviewCount: number | null
  /** Hotelsterne 0–5 */
  stars: number | null
  photoUrl: string | null
  totalPrice: number
  currency: string
  roomName: string | null
  boardName: string | null
  refundable: boolean
  bookingUrl: string
  /** Google Hotels – vergleicht viele Anbieter; Reisedaten sind vorausgefüllt, Personen nicht. */
  googleUrl: string
  marketPrice: number | null
  payAtProperty: number | null
  payAtPropertyLabel: string | null
  /** Alle Zimmervarianten, günstigste zuerst (die Felder oben = günstigste). */
  rooms: RoomOffer[]
  /** Wohin bookingUrl führt, z. B. „Expedia“ oder „Hotelseite“; null = Booking.com-Suche */
  bookingSource?: string | null
}

/** Hotel im Umkreis ohne Preis – für „Ausgebuchte zeigen“. */
export interface HotelListing {
  hotelId: string
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  rating: number | null
  reviewCount: number | null
  stars: number | null
  photoUrl: string | null
  bookingUrl: string
  googleUrl: string
  bookingSource?: string | null
}

export interface AlternativeWindow {
  checkin: string
  checkout: string
  /** -2 = zwei Tage früher */
  shiftDays: number
  nights: number
  /** Abfrage für diesen Zeitraum ist fehlgeschlagen. */
  failed: boolean
  hotels: HotelOffer[]
}

export interface HotelAlternativesResponse {
  windows: AlternativeWindow[]
  requests: number
  sandbox: boolean
}

export interface HotelAlternativesParams {
  place?: string
  hotelIds: string[]
  checkin: string
  checkout: string
  adults: number
  rooms: number
  shiftDays?: number
}

export interface HotelRecheckParams {
  /** Name des Hotels – Google Hotels braucht einen Suchtext. */
  place?: string
  hotelIds: string[]
  checkin: string
  checkout: string
  adults: number
  rooms: number
}

export interface HotelSearchResponse {
  hotels: HotelOffer[]
  sandbox: boolean
  fetchedAt: string
  nights: number
  rooms: number
  radiusMeters: number
  /** Weitere Ergebnisse (Google Hotels: 20 pro Seite); null = alles geladen. */
  nextPage: string | null
}

export interface HotelSearchStatus {
  configured: boolean
  provider: 'liteapi' | 'serpapi'
  /** Ergebnisse kommen seitenweise (Google Hotels) */
  paged: boolean
  quota: { left: number; perMonth: number } | null
}

export interface HotelSearchParams {
  latitude: number
  longitude: number
  checkin: string
  checkout: string
  adults: number
  rooms: number
  radiusMeters: number
  /** Ortsname für die Google-Suche, z. B. „Lissabon“ */
  place?: string
}

export function useHotelSearchStatus() {
  return useQuery({
    queryKey: ['hotels', 'status'],
    queryFn: () => api<HotelSearchStatus>('/hotels/status'),
    staleTime: 60_000,
  })
}

/** Kontingent (Google-Suchen) neu laden, nachdem gesucht wurde – gilt für Flüge und Hotels. */
function useRefreshQuota() {
  const client = useQueryClient()
  return () => {
    void client.invalidateQueries({ queryKey: ['hotels', 'status'] })
    void client.invalidateQueries({ queryKey: ['flights', 'status'] })
  }
}

/**
 * Sucht erst, wenn `params` gesetzt sind (Klick auf „Hotels suchen“). Weitere Seiten (Google Hotels) mit fetchNextPage.
 * Gleiche Suchen kommen aus dem Cache – im Browser und im Backend.
 */
export function useHotelSearch(params: HotelSearchParams | null) {
  const refreshQuota = useRefreshQuota()
  return useInfiniteQuery({
    queryKey: ['hotels', 'search', params],
    queryFn: async ({ signal, pageParam }) => {
      try {
        if (pageParam === null) return await api<HotelSearchResponse>('/hotels/search', { method: 'POST', signal, ...json(params) })
        const more = await api<Pick<HotelSearchResponse, 'hotels' | 'sandbox' | 'fetchedAt' | 'nextPage'>>('/hotels/more', {
          method: 'POST',
          signal,
          ...json({ nextPage: pageParam }),
        })
        return { ...more, nights: 0, rooms: params?.rooms ?? 1, radiusMeters: params?.radiusMeters ?? 0 }
      } finally {
        refreshQuota()
      }
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextPage ?? undefined,
    enabled: params !== null,
    staleTime: 15 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    retry: false,
  })
}

/** Alle Seiten einer Suche zu einem Ergebnis zusammengefasst (gleiche Hotels nur einmal). */
export function mergeHotelPages(pages: HotelSearchResponse[] | undefined): HotelSearchResponse | undefined {
  if (!pages || pages.length === 0) return undefined
  const seen = new Set<string>()
  const hotels = pages.flatMap((p) => p.hotels).filter((h) => (seen.has(h.hotelId) ? false : (seen.add(h.hotelId), true)))
  return { ...pages[0], hotels, nextPage: pages[pages.length - 1].nextPage }
}

/** Alle Hotels im Umkreis (auch ausgebuchte). Lädt erst, wenn der Schalter an ist. */
export function useNearbyHotels(params: HotelSearchParams | null, enabled: boolean) {
  return useQuery({
    queryKey: ['hotels', 'nearby', params],
    queryFn: ({ signal }) => api<{ hotels: HotelListing[] }>('/hotels/nearby', { method: 'POST', signal, ...json(params) }),
    enabled: enabled && params !== null,
    staleTime: 60 * 60_000,
    gcTime: 60 * 60_000,
    retry: false,
  })
}

/** Ausweichdaten (±3 Tage, gleiche Nächteanzahl) für ausgewählte Hotels – nur auf Klick. */
export function useHotelAlternatives() {
  const refreshQuota = useRefreshQuota()
  return useMutation({
    mutationFn: (params: HotelAlternativesParams) =>
      api<HotelAlternativesResponse>('/hotels/alternatives', { method: 'POST', ...json(params) }),
    onSettled: refreshQuota,
  })
}

/** Prüft gemerkte Hotels erneut für ihren Zeitraum (eine Abfrage). */
export function useHotelRecheck() {
  const refreshQuota = useRefreshQuota()
  return useMutation({
    mutationFn: (params: HotelRecheckParams) => api<HotelSearchResponse>('/hotels/search', { method: 'POST', ...json(params) }),
    onSettled: refreshQuota,
  })
}

/**
 * Dieselbe Suche mit anderen Zimmeraufteilungen (eine Abfrage pro Aufteilung, 15 Minuten gecacht).
 * Läuft nur, wenn „Aufteilungen vergleichen“ an ist.
 */
export function useRoomSplitSearches(base: HotelSearchParams | null, roomCounts: number[], enabled: boolean) {
  return useQueries({
    queries: roomCounts.map((rooms) => {
      const params = base ? { ...base, rooms } : null
      return {
        queryKey: ['hotels', 'split', params],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          api<HotelSearchResponse>('/hotels/search', { method: 'POST', signal, ...json(params) }),
        enabled: enabled && params !== null,
        staleTime: 15 * 60_000,
        gcTime: 30 * 60_000,
        retry: false,
      }
    }),
  })
}
