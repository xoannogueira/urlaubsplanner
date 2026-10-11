import type { HotelAlternativesResponse, HotelListing, HotelOffer } from '../api/hotels'
import type { LatLng, OptionInput, TripOption } from '../api/types'
import { todayIso } from './format'
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

/**
 * Hotels im Umkreis, die für den Zeitraum kein Angebot haben. Bewertungs- und Sternefilter gelten auch hier;
 * Preis und Stornierbarkeit gibt es ohne Angebot nicht. Sortiert nach Bewertung bzw. Entfernung.
 */
export function unavailableHotels(
  listings: HotelListing[],
  offers: HotelOffer[],
  filters: HotelFilters,
  sort: HotelSort,
  center: LatLng | null,
): HotelListing[] {
  const available = new Set(offers.map((o) => o.hotelId))
  const distance = (h: HotelListing) =>
    center && h.latitude != null && h.longitude != null
      ? distanceKm(center, { latitude: h.latitude, longitude: h.longitude })
      : Number.POSITIVE_INFINITY
  return listings
    .filter(
      (h) =>
        !available.has(h.hotelId) &&
        (filters.minRating == null || (h.rating ?? 0) >= filters.minRating) &&
        (filters.minStars == null || (h.stars ?? 0) >= filters.minStars),
    )
    .sort((a, b) => (sort === 'distance' ? distance(a) - distance(b) : (b.rating ?? -1) - (a.rating ?? -1)))
}

export interface AlternativeOffer {
  checkin: string
  checkout: string
  nights: number
  shiftDays: number
  offer: HotelOffer
}

/** Ordnet die Ausweichdaten pro Hotel, sortiert nach Anreisedatum. Hotels ohne freien Zeitraum bekommen eine leere Liste. */
export function alternativesByHotel(response: HotelAlternativesResponse, hotelIds: string[]): Map<string, AlternativeOffer[]> {
  const byHotel = new Map<string, AlternativeOffer[]>(hotelIds.map((id) => [id, []]))
  for (const window of response.windows) {
    for (const offer of window.hotels) {
      byHotel.get(offer.hotelId)?.push({
        checkin: window.checkin,
        checkout: window.checkout,
        nights: window.nights,
        shiftDays: window.shiftDays,
        offer,
      })
    }
  }
  for (const list of byHotel.values()) list.sort((a, b) => a.checkin.localeCompare(b.checkin))
  return byHotel
}

/** -1 → "1 Tag früher", 2 → "2 Tage später" */
export function shiftLabel(shiftDays: number): string {
  const n = Math.abs(shiftDays)
  if (n === 0) return 'Wunschtermin'
  return `${n} ${n === 1 ? 'Tag' : 'Tage'} ${shiftDays < 0 ? 'früher' : 'später'}`
}

/** Daten fürs Merken eines gefundenen Hotels als Favorit. */
export function hotelOptionInput(hotel: HotelOffer, stageId: string | null, checkin: string, checkout: string): OptionInput {
  return {
    kind: 'Hotel',
    title: hotel.name,
    status: 'Favorite',
    stageId,
    url: hotel.bookingUrl,
    price: hotel.totalPrice,
    pricePerPerson: false,
    startDate: checkin,
    endDate: checkout,
    locationName: hotel.address,
    latitude: hotel.latitude,
    longitude: hotel.longitude,
    notes: hotelNotes(hotel),
    imageUrl: hotel.photoUrl,
    provider: 'liteapi',
    externalId: hotel.hotelId,
  }
}

/** Ob ein gemerktes Hotel erneut bei LiteAPI geprüft werden kann. */
export function canRecheck(option: TripOption, today: string = todayIso()): boolean {
  return (
    option.kind === 'Hotel' &&
    option.provider === 'liteapi' &&
    !!option.externalId &&
    !!option.startDate &&
    !!option.endDate &&
    option.startDate >= today
  )
}
