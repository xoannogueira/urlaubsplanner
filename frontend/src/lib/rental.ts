import type { OptionInput, OptionStatus, TripOption } from '../api/types'

/** Abholung und Rückgabe eines Mietwagens. Datum steht in startDate/endDate, Uhrzeit und Ort in der Notiz. */
export interface RentalDetails {
  title: string
  pickupPlace: string
  pickupDate: string
  pickupTime: string
  returnPlace: string
  returnDate: string
  returnTime: string
  price: number | null
  url: string | null
  status: OptionStatus
  stageId: string | null
  latitude: number | null
  longitude: number | null
  note: string
}

/** "Abholung: 10:00 · Flughafen Lissabon\nRückgabe: 18:00 · Porto\n…" */
export function rentalNotes(d: Pick<RentalDetails, 'pickupTime' | 'pickupPlace' | 'returnTime' | 'returnPlace' | 'note'>): string {
  return [
    `Abholung: ${[d.pickupTime, d.pickupPlace].filter(Boolean).join(' · ')}`,
    `Rückgabe: ${[d.returnTime, d.returnPlace || d.pickupPlace].filter(Boolean).join(' · ')}`,
    d.note.trim(),
  ]
    .filter(Boolean)
    .join('\n')
}

function parseLine(notes: string | null, prefix: string): { time: string; place: string } {
  const line = notes?.split('\n').find((l) => l.startsWith(prefix)) ?? ''
  const rest = line.slice(prefix.length).trim()
  const match = /^(\d{2}:\d{2})(?:\s*·\s*(.*))?$/.exec(rest)
  return match ? { time: match[1], place: match[2] ?? '' } : { time: '', place: rest }
}

export function parseRental(o: TripOption): RentalDetails {
  const pickup = parseLine(o.notes, 'Abholung:')
  const ret = parseLine(o.notes, 'Rückgabe:')
  const note = (o.notes ?? '')
    .split('\n')
    .filter((l) => !l.startsWith('Abholung:') && !l.startsWith('Rückgabe:'))
    .join('\n')
  return {
    title: o.title,
    pickupPlace: pickup.place || o.locationName || '',
    pickupDate: o.startDate ?? '',
    pickupTime: pickup.time,
    returnPlace: ret.place,
    returnDate: o.endDate ?? '',
    returnTime: ret.time,
    price: o.price,
    url: o.url,
    status: o.status,
    stageId: o.stageId,
    latitude: o.latitude,
    longitude: o.longitude,
    note,
  }
}

export function rentalOptionInput(d: RentalDetails): OptionInput {
  return {
    kind: 'Transport',
    title: d.title.trim() || `Mietwagen ${d.pickupPlace}`.trim(),
    status: d.status,
    stageId: d.stageId,
    url: d.url,
    price: d.price,
    pricePerPerson: false,
    startDate: d.pickupDate || null,
    endDate: d.returnDate || null,
    locationName: d.pickupPlace || null,
    latitude: d.latitude,
    longitude: d.longitude,
    notes: rentalNotes(d),
    imageUrl: null,
    provider: 'rental',
    externalId: null,
  }
}

/** Abholung und Rückgabe als Einträge für den Tagesplan. */
export function rentalTimelineEntries(o: TripOption): { date: string; title: string; time: string | null; suffix: string }[] {
  const d = parseRental(o)
  const out: { date: string; title: string; time: string | null; suffix: string }[] = []
  if (d.pickupDate)
    out.push({
      date: d.pickupDate,
      title: `Mietwagen abholen${d.pickupPlace ? ` · ${d.pickupPlace}` : ''}`,
      time: d.pickupTime || null,
      suffix: 'abholen',
    })
  if (d.returnDate) {
    const place = d.returnPlace || d.pickupPlace
    out.push({
      date: d.returnDate,
      title: `Mietwagen zurückgeben${place ? ` · ${place}` : ''}`,
      time: d.returnTime || null,
      suffix: 'zurueck',
    })
  }
  return out
}

/** Vergleichsportale: Abholort, Daten und Uhrzeiten dort eintragen – Preis danach hier übernehmen. */
export function rentalLinks(pickupPlace: string): { label: string; url: string }[] {
  const links = [
    { label: 'billiger-mietwagen.de', url: 'https://www.billiger-mietwagen.de/' },
    { label: 'CHECK24 Mietwagen', url: 'https://www.check24.de/mietwagen/' },
    { label: 'KAYAK Mietwagen', url: 'https://www.kayak.de/mietwagen' },
  ]
  if (pickupPlace.trim()) {
    links.push({
      label: 'Vermieter vor Ort (Google Maps)',
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Autovermietung ${pickupPlace}`)}`,
    })
  }
  return links
}
