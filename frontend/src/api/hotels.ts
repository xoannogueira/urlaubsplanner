import { keepPreviousData, useQuery } from '@tanstack/react-query'
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
