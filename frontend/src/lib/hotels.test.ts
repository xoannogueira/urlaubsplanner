import { describe, expect, it } from 'vitest'
import type { HotelOffer } from '../api/hotels'
import type { HotelListing } from '../api/hotels'
import type { TripOption } from '../api/types'
import {
  alternativesByHotel,
  canRecheck,
  marketComparison,
  roomSplits,
  splitLabel,
  withRoom,
  defaultRooms,
  filterAndSortHotels,
  hotelNotes,
  hotelOptionInput,
  noFilters,
  ratingLabel,
  shiftLabel,
  unavailableHotels,
} from './hotels'

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
  googleUrl: 'https://www.google.com/travel/search',
  marketPrice: null,
  payAtProperty: null,
  payAtPropertyLabel: null,
  rooms: [],
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

const listing = (patch: Partial<HotelListing>): HotelListing => ({
  hotelId: 'h',
  name: 'Hotel',
  address: null,
  latitude: 38.72,
  longitude: -9.14,
  rating: 8,
  reviewCount: null,
  stars: 3,
  photoUrl: null,
  bookingUrl: 'https://www.booking.com/',
  googleUrl: 'https://www.google.com/travel/search',
  ...patch,
})

describe('unavailableHotels', () => {
  const listings = [
    listing({ hotelId: 'teuer-nah' }), // hat ein Angebot → nicht ausgebucht
    listing({ hotelId: 'voll-gut', rating: 9.4, stars: 5 }),
    listing({ hotelId: 'voll-ok', rating: 7.2, stars: 2 }),
  ]

  it('zeigt nur Hotels ohne Angebot, beste Bewertung zuerst', () => {
    expect(unavailableHotels(listings, hotels, noFilters, 'price', center).map((h) => h.hotelId)).toEqual(['voll-gut', 'voll-ok'])
  })

  it('wendet Bewertungs- und Sternefilter an, ignoriert Preisfilter', () => {
    const result = unavailableHotels(listings, hotels, { ...noFilters, minStars: 4, maxPrice: 1 }, 'price', center)
    expect(result.map((h) => h.hotelId)).toEqual(['voll-gut'])
  })
})

describe('alternativesByHotel', () => {
  it('gruppiert pro Hotel nach Datum und behält Hotels ohne Treffer', () => {
    const windows = [
      {
        checkin: '2027-05-13',
        checkout: '2027-05-17',
        shiftDays: 1,
        nights: 4,
        failed: false,
        hotels: [hotel({ hotelId: 'a', totalPrice: 650 })],
      },
      {
        checkin: '2027-05-11',
        checkout: '2027-05-15',
        shiftDays: -1,
        nights: 4,
        failed: false,
        hotels: [hotel({ hotelId: 'a', totalPrice: 589 })],
      },
    ]
    const grouped = alternativesByHotel({ windows, requests: 2, sandbox: false }, ['a', 'b'])
    expect(grouped.get('a')!.map((x) => [x.checkin, x.offer.totalPrice])).toEqual([
      ['2027-05-11', 589],
      ['2027-05-13', 650],
    ])
    expect(grouped.get('b')).toEqual([])
  })

  it('beschriftet Verschiebungen', () => {
    expect(shiftLabel(-1)).toBe('1 Tag früher')
    expect(shiftLabel(3)).toBe('3 Tage später')
  })
})

describe('hotelOptionInput', () => {
  it('übernimmt Zeitraum, Herkunft und Gesamtpreis', () => {
    const input = hotelOptionInput(hotel({ hotelId: 'lp1', name: 'Miradouro', totalPrice: 589 }), 's1', '2027-05-11', '2027-05-15')
    expect(input).toMatchObject({
      title: 'Miradouro',
      stageId: 's1',
      startDate: '2027-05-11',
      endDate: '2027-05-15',
      price: 589,
      pricePerPerson: false,
      provider: 'liteapi',
      externalId: 'lp1',
      status: 'Favorite',
    })
  })
})

describe('canRecheck', () => {
  const saved = { kind: 'Hotel', provider: 'liteapi', externalId: 'lp1', startDate: '2027-05-12', endDate: '2027-05-16' } as TripOption

  it('prüft nur Hotels aus der Suche mit Zeitraum in der Zukunft', () => {
    expect(canRecheck(saved, '2026-10-11')).toBe(true)
    expect(canRecheck(saved, '2027-05-13')).toBe(false)
    expect(canRecheck({ ...saved, provider: 'manual' }, '2026-10-11')).toBe(false)
    expect(canRecheck(saved, '2026-10-11', 'serpapi')).toBe(saved.provider === 'serpapi')
    expect(canRecheck({ ...saved, provider: 'serpapi' }, '2026-10-11', 'serpapi')).toBe(true)
    expect(canRecheck({ ...saved, endDate: null }, '2026-10-11')).toBe(false)
  })
})

describe('Zimmer und Marktpreis', () => {
  it('schlägt sinnvolle Aufteilungen vor', () => {
    expect(roomSplits(6)).toEqual([1, 2, 3])
    expect(roomSplits(4)).toEqual([1, 2])
    expect(roomSplits(2)).toEqual([1, 2])
    expect(roomSplits(1)).toEqual([1])
    expect(roomSplits(10)).toEqual([1, 3, 4, 5])
  })

  it('beschriftet Aufteilungen', () => {
    expect(splitLabel(3, 6)).toBe('3 Zimmer à 2 Pers.')
    expect(splitLabel(2, 5)).toBe('2 Zimmer für 5 Pers.')
  })

  it('meldet den Marktpreis nur bei spürbarem Unterschied', () => {
    expect(marketComparison(1000, 1100)).toEqual({ kind: 'higher', diff: 100 })
    expect(marketComparison(1000, 900)).toEqual({ kind: 'lower', diff: 100 })
    expect(marketComparison(1000, 1010)).toBeNull()
    expect(marketComparison(1000, null)).toBeNull()
  })

  it('übernimmt ein anderes Zimmer samt Kosten vor Ort in die Notiz', () => {
    const room = {
      name: 'Suite',
      boardName: 'Frühstück',
      refundable: true,
      totalPrice: 980,
      currency: 'EUR',
      marketPrice: 1050,
      payAtProperty: 32,
      payAtPropertyLabel: 'City tax',
    }
    const picked = withRoom(hotel({ totalPrice: 612, roomName: 'Doppelzimmer' }), room)
    expect(picked.totalPrice).toBe(980)
    expect(hotelNotes(picked).replace(/\s/g, ' ')).toBe('Suite · Frühstück · kostenlos stornierbar · zzgl. 32 € vor Ort')
    expect(picked.bookingUrl).toBe(hotel({}).bookingUrl)
  })

  it('führt bei Google Hotels direkt zum gewählten Anbieter, sonst zur Google-Seite des Hotels', () => {
    const base = hotel({ bookingUrl: 'https://expedia.example/h1', bookingSource: 'Expedia', googleUrl: 'https://google.example/h1' })
    const offer = {
      name: 'Booking.com',
      boardName: null,
      refundable: false,
      totalPrice: 630,
      currency: 'EUR',
      marketPrice: null,
      payAtProperty: null,
      payAtPropertyLabel: null,
    }
    expect(withRoom(base, { ...offer, url: 'https://booking.example/h1' })).toMatchObject({
      bookingUrl: 'https://booking.example/h1',
      bookingSource: 'Booking.com',
    })
    expect(withRoom(base, offer)).toMatchObject({ bookingUrl: 'https://google.example/h1', bookingSource: 'Google Hotels' })
  })
})
