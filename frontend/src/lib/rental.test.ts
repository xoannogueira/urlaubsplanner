import { describe, expect, it } from 'vitest'
import type { TripOption } from '../api/types'
import { sampleTrip } from '../features/pdf/sampleTrip'
import { buildTimeline } from './dashboard'
import { parseRental, rentalLinks, rentalNotes, rentalOptionInput, type RentalDetails } from './rental'

const details: RentalDetails = {
  title: 'Mietwagen Lissabon',
  pickupPlace: 'Flughafen Lissabon',
  pickupDate: '2027-05-13',
  pickupTime: '10:00',
  returnPlace: 'Porto Hbf',
  returnDate: '2027-05-18',
  returnTime: '18:30',
  price: 245,
  url: null,
  status: 'Selected',
  stageId: null,
  latitude: 38.77,
  longitude: -9.13,
  note: 'Vollkasko inklusive',
}

describe('Mietwagen', () => {
  it('Notiz hin und zurück', () => {
    expect(rentalNotes(details)).toBe('Abholung: 10:00 · Flughafen Lissabon\nRückgabe: 18:30 · Porto Hbf\nVollkasko inklusive')
    const input = rentalOptionInput(details)
    expect(input.provider).toBe('rental')
    expect(input.kind).toBe('Transport')
    const option: TripOption = { ...sampleTrip.options[0], ...input, id: 'car', provider: 'rental', totalPrice: 245 } as TripOption
    expect(parseRental(option)).toMatchObject({
      pickupTime: '10:00',
      returnPlace: 'Porto Hbf',
      returnTime: '18:30',
      note: 'Vollkasko inklusive',
    })
  })

  it('gleicher Rückgabeort, wenn keiner angegeben ist', () => {
    expect(rentalNotes({ ...details, returnPlace: '', returnTime: '', note: '' })).toBe(
      'Abholung: 10:00 · Flughafen Lissabon\nRückgabe: Flughafen Lissabon',
    )
  })

  it('Abholung und Rückgabe im Tagesplan', () => {
    const input = rentalOptionInput(details)
    const car = { ...sampleTrip.options[0], ...input, id: 'car', provider: 'rental' } as TripOption
    const { days } = buildTimeline({ ...sampleTrip, options: [car] }, { startDate: '2027-05-12', endDate: '2027-05-20' })
    const items = days.flatMap((d) => d.items.map((i) => `${d.date} ${i.title} ${i.time}`))
    expect(items).toEqual(['2027-05-13 Mietwagen abholen · Flughafen Lissabon 10:00', '2027-05-18 Mietwagen zurückgeben · Porto Hbf 18:30'])
  })

  it('Links zu Vergleichsportalen und Vermietern vor Ort', () => {
    const links = rentalLinks('Flughafen Lissabon')
    expect(links.at(-1)?.url).toBe('https://www.google.com/maps/search/?api=1&query=Autovermietung%20Flughafen%20Lissabon')
    expect(rentalLinks('')).toHaveLength(3)
  })
})
