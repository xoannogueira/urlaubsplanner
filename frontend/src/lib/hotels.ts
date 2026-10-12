import type { HotelAlternativesResponse, HotelListing, HotelOffer, RoomOffer } from '../api/hotels'
import type { LatLng, OptionInput, TripOption } from '../api/types'
import { formatEuro, todayIso } from './format'
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
  return [
    hotel.roomName,
    hotel.boardName,
    hotel.refundable ? 'kostenlos stornierbar' : 'nicht stornierbar',
    hotel.payAtProperty ? `zzgl. ${formatEuro(hotel.payAtProperty)} vor Ort` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Das Hotel mit einem anderen Zimmer als Hauptangebot (für Anzeige und Merken). */
export function withRoom(hotel: HotelOffer, room: RoomOffer): HotelOffer {
  // Google Hotels: Link und Beschriftung folgen dem gewählten Anbieter; ohne eigenen Link die Google-Seite des Hotels.
  const direct = hotel.bookingSource
    ? room.url
      ? { bookingUrl: room.url, bookingSource: room.url === hotel.googleUrl ? 'Google Hotels' : room.name }
      : { bookingUrl: hotel.googleUrl, bookingSource: 'Google Hotels' }
    : {}
  return {
    ...hotel,
    ...direct,
    roomName: room.name,
    boardName: room.boardName,
    refundable: room.refundable,
    totalPrice: room.totalPrice,
    currency: room.currency,
    marketPrice: room.marketPrice,
    payAtProperty: room.payAtProperty,
    payAtPropertyLabel: room.payAtPropertyLabel,
  }
}

/**
 * Hinweis zum Marktpreis (was Booking & Co. ungefähr verlangen), nur wenn er spürbar abweicht:
 * 'higher' = woanders vermutlich teurer, 'lower' = woanders vermutlich günstiger.
 */
export function marketComparison(price: number, market: number | null): { kind: 'higher' | 'lower'; diff: number } | null {
  if (market == null || market <= 0) return null
  const diff = Math.round(market - price)
  if (Math.abs(diff) < Math.max(5, price * 0.02)) return null
  return { kind: diff > 0 ? 'higher' : 'lower', diff: Math.abs(diff) }
}

/**
 * Sinnvolle Zimmeraufteilungen zum Vergleichen: 1 Zimmer, ~4, ~3 und ~2 Personen pro Zimmer (höchstens 4 Varianten).
 * 6 Personen → [1, 2, 3], 4 Personen → [1, 2], 2 Personen → [1, 2].
 */
export function roomSplits(travelers: number): number[] {
  const set = new Set([1, Math.ceil(travelers / 4), Math.ceil(travelers / 3), Math.ceil(travelers / 2)])
  if (set.size === 1 && travelers >= 2) set.add(2)
  return [...set].sort((a, b) => a - b).slice(0, 4)
}

/** "3 Zimmer à 2 Personen", "2 Zimmer für 5 Personen" */
export function splitLabel(rooms: number, travelers: number): string {
  const r = rooms === 1 ? '1 Zimmer' : `${rooms} Zimmer`
  return travelers % rooms === 0
    ? `${r} à ${travelers / rooms} ${travelers / rooms === 1 ? 'Person' : 'Pers.'}`
    : `${r} für ${travelers} Pers.`
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
export function hotelOptionInput(
  hotel: HotelOffer,
  stageId: string | null,
  checkin: string,
  checkout: string,
  provider: 'liteapi' | 'serpapi' = 'liteapi',
): OptionInput {
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
    provider,
    externalId: hotel.hotelId,
  }
}

/** Ob ein gemerktes Hotel erneut geprüft werden kann (LiteAPI oder Google Hotels). */
/**
 * activeProvider: die Quelle, die das Backend gerade nutzt. Hotel-IDs gelten nur bei ihrer eigenen Quelle
 * (LiteAPI-ID ≠ Google-Token) – mit der anderen Quelle lässt sich ein Hotel nicht neu prüfen.
 */
export function canRecheck(option: TripOption, today: string = todayIso(), activeProvider?: string): boolean {
  return (
    option.kind === 'Hotel' &&
    (option.provider === 'liteapi' || option.provider === 'serpapi') &&
    (activeProvider === undefined || option.provider === activeProvider) &&
    !!option.externalId &&
    !!option.startDate &&
    !!option.endDate &&
    option.startDate >= today
  )
}
