import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from './client'
import type { LatLng, Place } from './types'

/** Wartet, bis der Nutzer kurz aufhört zu tippen – so geht nicht bei jedem Buchstaben eine Anfrage raus. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

export function placesUrl(query: string, near?: LatLng | null): string {
  const params = new URLSearchParams({ q: query })
  if (near) {
    params.set('lat', near.latitude.toFixed(2))
    params.set('lon', near.longitude.toFixed(2))
  }
  return `/places?${params.toString()}`
}

/**
 * Ortssuche beim Tippen. Ergebnisse bleiben im Cache (gleiche Suche = sofort da),
 * und die alte Liste bleibt stehen, bis die neue da ist – kein Flackern.
 */
export function usePlaceSearch(query: string, near?: LatLng | null) {
  const debounced = useDebouncedValue(query.trim(), 250)
  const enabled = debounced.length >= 2
  return useQuery({
    queryKey: ['places', debounced, near?.latitude.toFixed(2), near?.longitude.toFixed(2)],
    queryFn: ({ signal }) => api<Place[]>(placesUrl(debounced, near), { signal }),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    placeholderData: keepPreviousData,
    retry: false,
  })
}
