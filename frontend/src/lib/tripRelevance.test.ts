import { describe, expect, it } from 'vitest'
import type { Trip } from '../api/types'
import { routeFitsTrip } from './tripRelevance'

const airports = [
  { code: 'STR', latitude: 48.69, longitude: 9.22 },
  { code: 'BCN', latitude: 41.3, longitude: 2.08 },
  { code: 'KIX', latitude: 34.43, longitude: 135.24 },
  { code: 'HND', latitude: 35.55, longitude: 139.78 },
]
const trip = (stages: [number, number][], externalId?: string) =>
  ({
    stages: stages.map(([latitude, longitude], i) => ({
      id: `s${i}`,
      name: '',
      startDate: '',
      endDate: '',
      nights: 0,
      latitude,
      longitude,
    })),
    options: externalId ? [{ kind: 'Flight', externalId }] : [],
  }) as unknown as Trip

describe('routeFitsTrip', () => {
  const japan = trip([
    [34.69, 135.5],
    [35.68, 139.76],
  ])
  it('zeigt bei der Japan-Reise Japan-Strecken, aber nicht Barcelona – auch nicht wegen Stuttgart', () => {
    expect(routeFitsTrip(japan, 'STR', 'KIX', airports)).toBe(true)
    expect(routeFitsTrip(japan, 'HND', 'STR', airports)).toBe(true)
    expect(routeFitsTrip(japan, 'STR', 'BCN', airports)).toBe(false)
  })
  it('gemerkte Flüge der Reise zählen immer; ohne Etappen-Ort wird nichts ausgeblendet', () => {
    expect(routeFitsTrip(trip([[34.69, 135.5]], 'STR-BCN@2027-01-01:X'), 'STR', 'BCN', airports)).toBe(true)
    expect(routeFitsTrip(trip([]), 'STR', 'BCN', airports)).toBe(true)
  })
})
