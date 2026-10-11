import { describe, expect, it } from 'vitest'
import type { HotelOffer } from '../api/hotels'
import { defaultRooms, filterAndSortHotels, hotelNotes, noFilters, ratingLabel } from './hotels'

const hotel = (patch: Partial<HotelOffer>): HotelOffer => ({
  hotelId: 'h',
  name: 'Hotel',
  address: null,
  latitude: 38.72,
  longitude: -9.14,
  rating: 8,
  reviewCount: 100,
  stars: 3,
  photoUrl: null,
  totalPrice: 500,
  currency: 'EUR',
  roomName: null,
  boardName: null,
  refundable: false,
  bookingUrl: 'https://www.booking.com/',
  ...patch,
})

const hotels = [
  hotel({ hotelId: 'teuer-nah', totalPrice: 900, rating: 9.2, stars: 5, refundable: true }),
  hotel({ hotelId: 'billig-fern', totalPrice: 300, rating: 7.1, stars: 2, latitude: 38.8, longitude: -9.3 }),
  hotel({ hotelId: 'mittel', totalPrice: 600, rating: null, stars: 4, latitude: 38.73, longitude: -9.15 }),
]
const center = { latitude: 38.72, longitude: -9.14 }
const ids = (list: HotelOffer[]) => list.map((h) => h.hotelId)

describe('filterAndSortHotels', () => {
  it('sortiert standardmäßig nach Preis', () => {
    expect(ids(filterAndSortHotels(hotels, noFilters, 'price', center))).toEqual(['billig-fern', 'mittel', 'teuer-nah'])
  })

  it('sortiert nach Bewertung, ohne Bewertung zuletzt', () => {
    expect(ids(filterAndSortHotels(hotels, noFilters, 'rating', center))).toEqual(['teuer-nah', 'billig-fern', 'mittel'])
  })

  it('sortiert nach Entfernung zum Etappen-Mittelpunkt', () => {
    expect(ids(filterAndSortHotels(hotels, noFilters, 'distance', center))).toEqual(['teuer-nah', 'mittel', 'billig-fern'])
  })

  it('kombiniert Filter', () => {
    expect(ids(filterAndSortHotels(hotels, { ...noFilters, minStars: 4 }, 'price', center))).toEqual(['mittel', 'teuer-nah'])
    expect(ids(filterAndSortHotels(hotels, { ...noFilters, refundableOnly: true }, 'price', center))).toEqual(['teuer-nah'])
    expect(ids(filterAndSortHotels(hotels, { ...noFilters, minRating: 8, maxPrice: 800 }, 'price', center))).toEqual([])
  })

  it('verändert die Eingabeliste nicht', () => {
    const before = ids(hotels)
    filterAndSortHotels(hotels, noFilters, 'rating', center)
    expect(ids(hotels)).toEqual(before)
  })
})

describe('Hilfen', () => {
  it('beschriftet Bewertungen', () => {
    expect(ratingLabel(9.1)).toBe('Hervorragend')
    expect(ratingLabel(8.0)).toBe('Sehr gut')
    expect(ratingLabel(6.5)).toBe('Okay')
  })

  it('rechnet zwei Personen pro Zimmer', () => {
    expect(defaultRooms(1)).toBe(1)
    expect(defaultRooms(4)).toBe(2)
    expect(defaultRooms(5)).toBe(3)
  })

  it('baut die Notiz fürs Merken', () => {
    expect(hotelNotes(hotel({ roomName: 'Doppelzimmer', boardName: 'Frühstück', refundable: true }))).toBe(
      'Doppelzimmer · Frühstück · kostenlos stornierbar',
    )
  })
})
