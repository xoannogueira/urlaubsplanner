import { describe, expect, it } from 'vitest'
import { boundsOf, distanceKm, formatDistance, toLatLng } from './geo'

describe('toLatLng', () => {
  it('liefert nur vollständige Koordinaten', () => {
    expect(toLatLng({ latitude: 38.7, longitude: -9.1 })).toEqual({ latitude: 38.7, longitude: -9.1 })
    expect(toLatLng({ latitude: 38.7, longitude: null })).toBeNull()
    expect(toLatLng(null)).toBeNull()
  })

  it('akzeptiert 0 als gültige Koordinate', () => {
    expect(toLatLng({ latitude: 0, longitude: 0 })).toEqual({ latitude: 0, longitude: 0 })
  })
})

describe('boundsOf', () => {
  it('umschließt alle Punkte', () => {
    expect(
      boundsOf([
        { latitude: 38.7, longitude: -9.1 },
        { latitude: 41.1, longitude: -8.6 },
      ]),
    ).toEqual([-9.1, 38.7, -8.6, 41.1])
  })

  it('gibt einem einzelnen Punkt etwas Rand', () => {
    const [west, south, east, north] = boundsOf([{ latitude: 38.7, longitude: -9.1 }])!
    expect(east - west).toBeGreaterThan(0)
    expect(north - south).toBeGreaterThan(0)
  })

  it('liefert null ohne Punkte', () => {
    expect(boundsOf([])).toBeNull()
  })
})

describe('Entfernung', () => {
  it('rechnet Lissabon–Porto ungefähr richtig', () => {
    const km = distanceKm({ latitude: 38.7223, longitude: -9.1393 }, { latitude: 41.1579, longitude: -8.6291 })
    expect(km).toBeGreaterThan(270)
    expect(km).toBeLessThan(280)
  })

  it('formatiert Meter und Kilometer', () => {
    expect(formatDistance(0.45)).toBe('450 m')
    expect(formatDistance(2.345)).toBe('2,3 km')
    expect(formatDistance(274.6)).toBe('275 km')
  })
})
