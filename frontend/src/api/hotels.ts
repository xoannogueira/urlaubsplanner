import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { api, json } from './client'

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
  /** Google Hotels – vergleicht viele Anbieter; Daten werden dort gewählt. */
  googleUrl: string
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
  hotelIds: string[]
  checkin: string
  checkout: string
  adults: number
  rooms: number
  shiftDays?: number
}

export interface HotelRecheckParams {
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
}

export interface HotelSearchParams {
  latitude: number
  longitude: number
  checkin: string
  checkout: string
  adults: number
  rooms: number
  radiusMeters: number
}

export function useHotelSearchStatus() {
  return useQuery({
    queryKey: ['hotels', 'status'],
    queryFn: () => api<{ configured: boolean }>('/hotels/status'),
    staleTime: 60_000,
  })
}

/**
 * Sucht erst, wenn `params` gesetzt sind (Klick auf „Hotels suchen“). Gleiche Suchen kommen
 * 15 Minuten lang aus dem Cache – im Browser und im Backend.
 */
export function useHotelSearch(params: HotelSearchParams | null) {
  return useQuery({
    queryKey: ['hotels', 'search', params],
    queryFn: ({ signal }) => api<HotelSearchResponse>('/hotels/search', { method: 'POST', signal, ...json(params) }),
    enabled: params !== null,
    staleTime: 15 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    retry: false,
  })
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
  return useMutation({
    mutationFn: (params: HotelAlternativesParams) =>
      api<HotelAlternativesResponse>('/hotels/alternatives', { method: 'POST', ...json(params) }),
  })
}

/** Prüft gemerkte Hotels erneut für ihren Zeitraum (eine Abfrage). */
export function useHotelRecheck() {
  return useMutation({
    mutationFn: (params: HotelRecheckParams) => api<HotelSearchResponse>('/hotels/search', { method: 'POST', ...json(params) }),
  })
}
