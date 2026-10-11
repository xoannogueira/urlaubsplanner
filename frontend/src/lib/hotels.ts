import type { HotelOffer } from '../api/hotels'
import type { LatLng } from '../api/types'
import { distanceKm } from './geo'

export type HotelSort = 'price' | 'rating' | 'distance'

export interface HotelFilters {
  refundableOnly: boolean
  minRating: number | null
  minStars: number | null
  maxPrice: number | null
}

export const noFilters: HotelFilters = { refundableOnly: false, minRating: null, minStars: null, maxPrice: null }

export function ratingLabel(rating: number): string {
  if (rating >= 9) return 'Hervorragend'
  if (rating >= 8) return 'Sehr gut'
  if (rating >= 7) return 'Gut'
  return 'Okay'
}

/** Filtert und sortiert Suchergebnisse; Hotels ohne Bewertung/Lage landen bei der Sortierung hinten. */
export function filterAndSortHotels(hotels: HotelOffer[], filters: HotelFilters, sort: HotelSort, center: LatLng | null): HotelOffer[] {
  const distance = (h: HotelOffer) =>
    center && h.latitude != null && h.longitude != null
      ? distanceKm(center, { latitude: h.latitude, longitude: h.longitude })
      : Number.POSITIVE_INFINITY

  return hotels
    .filter(
      (h) =>
        (!filters.refundableOnly || h.refundable) &&
        (filters.minRating == null || (h.rating ?? 0) >= filters.minRating) &&
        (filters.minStars == null || (h.stars ?? 0) >= filters.minStars) &&
        (filters.maxPrice == null || h.totalPrice <= filters.maxPrice),
    )
    .sort((a, b) => {
      if (sort === 'rating') return (b.rating ?? -1) - (a.rating ?? -1) || a.totalPrice - b.totalPrice
      if (sort === 'distance') return distance(a) - distance(b) || a.totalPrice - b.totalPrice
      return a.totalPrice - b.totalPrice
    })
}

/** Standard: 2 Personen pro Zimmer. */
export const defaultRooms = (travelers: number) => Math.max(1, Math.ceil(travelers / 2))

/** Notiz, die beim Merken eines Hotels gespeichert wird. */
export function hotelNotes(hotel: HotelOffer): string {
  return [hotel.roomName, hotel.boardName, hotel.refundable ? 'kostenlos stornierbar' : 'nicht stornierbar'].filter(Boolean).join(' · ')
}
