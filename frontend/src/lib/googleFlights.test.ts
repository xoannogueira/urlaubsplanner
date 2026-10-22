import { describe, expect, it } from 'vitest'
import { googleFlightsUrl } from './googleFlights'

describe('Link zu Google Flights', () => {
  it('kodiert die Suche wie Google (nur Hinflug)', () => {
    // Bekanntes Beispiel: SFO → JFK am 15.07.2026, 1 Erwachsener, Economy
    expect(googleFlightsUrl('SFO-JFK@2026-07-15:UA123#Basic', 1)).toBe(
      'https://www.google.com/travel/flights/search?tfs=EAAaHhIKMjAyNi0wNy0xNWoHCAESA1NGT3IHCAESA0pGS0ABSAGYAQI&hl=de&curr=EUR',
    )
  })

  it('Hin- und Rückflug mit zwei Personen', () => {
    const url = googleFlightsUrl('FRA-BCN@2026-11-13:LH1124|BCN-FRA@2026-11-20:LH1129#Light', 2)!
    const tfs = new URL(url).searchParams.get('tfs')!
    const bytes = atob(tfs.replace(/-/g, '+').replace(/_/g, '/'))
    expect(bytes).toContain('2026-11-13')
    expect(bytes).toContain('2026-11-20')
    expect(bytes.endsWith('\x98\x01\x01')).toBe(true) // Art: hin & zurück
    expect(bytes.split('@\x01').length - 1).toBe(2) // zwei Erwachsene
  })

  it('ohne gültige Kennung kein Link', () => {
    expect(googleFlightsUrl(null, 1)).toBeNull()
    expect(googleFlightsUrl('Kayak-Link', 1)).toBeNull()
  })
})
