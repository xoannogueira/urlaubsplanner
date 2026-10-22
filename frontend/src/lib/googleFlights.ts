import { parseSignature } from './flights'

/**
 * Link zu Google Flights mit genau dieser Strecke und diesen Daten – dort kann man mit „Preise beobachten“ einen
 * Preisalarm per Mail einrichten (Google-Konto nötig). Google erwartet die Suche als kleines Protobuf in „tfs“:
 * Feld 3 = Strecke (2: Datum, 13: von, 14: nach), 8 = je ein Erwachsener, 9 = Klasse, 19 = Art (1 hin & zurück,
 * 2 nur hin, 3 Gabelflug).
 */
export function googleFlightsUrl(signature: string | null | undefined, adults: number, cabin: 1 | 2 | 3 | 4 = 1): string | null {
  const parsed = parseSignature(signature)
  if (!parsed || parsed.legs.length === 0) return null
  const legs = parsed.legs
  const roundTrip = legs.length === 2 && legs[0].origin === legs[1].destination && legs[0].destination === legs[1].origin
  const type = legs.length === 1 ? 2 : roundTrip ? 1 : 3
  const bytes: number[] = [...varintField(2, 0)]
  for (const leg of legs) {
    const body = [
      ...stringField(2, leg.date),
      ...messageField(13, [...varintField(1, 1), ...stringField(2, leg.origin)]),
      ...messageField(14, [...varintField(1, 1), ...stringField(2, leg.destination)]),
    ]
    bytes.push(...messageField(3, body))
  }
  for (let i = 0; i < Math.max(1, Math.min(adults, 9)); i++) bytes.push(...varintField(8, 1))
  bytes.push(...varintField(9, cabin), ...varintField(19, type))
  return `https://www.google.com/travel/flights/search?tfs=${base64Url(bytes)}&hl=de&curr=EUR`
}

function varint(n: number): number[] {
  const out: number[] = []
  let v = n
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80)
    v >>>= 7
  }
  out.push(v)
  return out
}

const key = (field: number, wire: number) => varint((field << 3) | wire)
const varintField = (field: number, value: number) => [...key(field, 0), ...varint(value)]
const messageField = (field: number, body: number[]) => [...key(field, 2), ...varint(body.length), ...body]
const stringField = (field: number, text: string) => messageField(field, [...new TextEncoder().encode(text)])

function base64Url(bytes: number[]): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
