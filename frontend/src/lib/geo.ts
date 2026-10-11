import type { LatLng } from '../api/types'

/** Nimmt ein Objekt mit optionalen Koordinaten und liefert sie nur, wenn beide gesetzt sind. */
export function toLatLng(value: { latitude: number | null; longitude: number | null } | null | undefined): LatLng | null {
  return value?.latitude != null && value.longitude != null ? { latitude: value.latitude, longitude: value.longitude } : null
}

export type Bounds = [west: number, south: number, east: number, north: number]

/** Kleinster Kartenausschnitt, der alle Punkte enthält. Ein einzelner Punkt bekommt einen kleinen Rand. */
export function boundsOf(points: LatLng[]): Bounds | null {
  if (points.length === 0) return null
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const p of points) {
    west = Math.min(west, p.longitude)
    east = Math.max(east, p.longitude)
    south = Math.min(south, p.latitude)
    north = Math.max(north, p.latitude)
  }
  const pad = 0.01
  if (east - west < pad) {
    west -= pad
    east += pad
  }
  if (north - south < pad) {
    south -= pad
    north += pad
  }
  return [west, south, east, north]
}

/** Entfernung zwischen zwei Punkten in km (Haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const r = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLng = rad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(h))
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toLocaleString('de-DE', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`
}

/**
 * Bogen zwischen zwei Punkten für Fluglinien auf der Karte: eine leicht gekrümmte Kurve (quadratische Bézierkurve),
 * damit Hin- und Rückflug nicht übereinander liegen. Liefert [Länge, Breite]-Paare für GeoJSON.
 */
export function arcPath(from: LatLng, to: LatLng, steps = 32): [number, number][] {
  const dx = to.longitude - from.longitude
  const dy = to.latitude - from.latitude
  // Kontrollpunkt seitlich der Mitte, immer zur gleichen Seite der Flugrichtung.
  const cx = from.longitude + dx / 2 - dy * 0.2
  const cy = from.latitude + dy / 2 + dx * 0.2
  const points: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    points.push([
      u * u * from.longitude + 2 * u * t * cx + t * t * to.longitude,
      u * u * from.latitude + 2 * u * t * cy + t * t * to.latitude,
    ])
  }
  return points
}
