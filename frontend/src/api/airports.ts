import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from './client'
import { useDebouncedValue } from './places'
import type { LatLng } from './types'

export interface Airport {
  code: string
  name: string
  city: string
  countryCode: string
  latitude: number
  longitude: number
  /** Großer Flughafen mit vielen Verbindungen */
  major: boolean
  /** Bei Umkreissuche bzw. Treffer über einen Ort */
  distanceKm: number | null
  /** Ort, über den der Flughafen gefunden wurde (z. B. „Lissabon“) */
  near: string | null
}

/** Flughafensuche beim Tippen: Code, Stadt, Name – oder ein Ort (dann Flughäfen in der Nähe). */
export function useAirportSearch(query: string) {
  const debounced = useDebouncedValue(query.trim(), 250)
  return useQuery({
    queryKey: ['airports', 'search', debounced],
    queryFn: ({ signal }) => api<Airport[]>(`/airports?q=${encodeURIComponent(debounced)}`, { signal }),
    enabled: debounced.length >= 2,
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: keepPreviousData,
    retry: false,
  })
}

/** Flughäfen im Umkreis eines Punkts (z. B. der Etappe), nächste zuerst. */
export function useNearbyAirports(center: LatLng | null, radiusKm: number) {
  return useQuery({
    queryKey: ['airports', 'near', center?.latitude.toFixed(3), center?.longitude.toFixed(3), radiusKm],
    queryFn: ({ signal }) =>
      api<Airport[]>(`/airports/near?lat=${center!.latitude}&lon=${center!.longitude}&radiusKm=${radiusKm}`, { signal }),
    enabled: center !== null,
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: keepPreviousData,
  })
}

/** Details zu bekannten Codes (z. B. für die Karte gemerkter Flüge). */
export function useAirportLookup(codes: string[]) {
  const key = [...new Set(codes)].sort().join(',')
  return useQuery({
    queryKey: ['airports', 'lookup', key],
    queryFn: ({ signal }) => api<Airport[]>(`/airports/lookup?codes=${encodeURIComponent(key)}`, { signal }),
    enabled: key.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
  })
}
