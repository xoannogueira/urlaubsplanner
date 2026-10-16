import { useQuery } from '@tanstack/react-query'
import { api } from './client'

/** Verkehrsmittel laut Fahrplan (MOTIS), z. B. WALK, BUS, TRAM, SUBWAY, REGIONAL_RAIL, HIGHSPEED_RAIL, FERRY, COACH. */
export type TransitMode = string

export interface TransitStop {
  name: string
  latitude: number
  longitude: number
  /** UTC, z. B. "2027-05-12T06:50:00+00:00" */
  time: string
  /** z. B. "Europe/Berlin" – für die Anzeige in Ortszeit */
  timeZone: string | null
  track: string | null
}

export interface TransitLeg {
  mode: TransitMode
  /** „ICE 9576“, „S1“, „Bus 728“ */
  line: string | null
  headsign: string | null
  agency: string | null
  from: TransitStop
  to: TransitStop
  durationMinutes: number
  distanceMeters: number | null
  stops: number
  color: string | null
}

export interface TransitItinerary {
  departure: string
  arrival: string
  durationMinutes: number
  transfers: number
  legs: TransitLeg[]
}

export interface TransitPlan {
  itineraries: TransitItinerary[]
  earlierCursor: string | null
  laterCursor: string | null
}

export interface TransitQuery {
  from: { latitude: number; longitude: number }
  to: { latitude: number; longitude: number }
  /** UTC-Zeitpunkt (ISO) */
  time: string
  arriveBy: boolean
  cursor?: string | null
}

/** Verbindungen mit Bus & Bahn (Transitous) – kostenlos, zählt nicht zu den Google-Suchen. */
export function useTransitPlan(query: TransitQuery | null) {
  return useQuery({
    queryKey: ['transit', query],
    queryFn: ({ signal }) => {
      const q = query!
      const params = new URLSearchParams({
        fromLat: String(q.from.latitude),
        fromLon: String(q.from.longitude),
        toLat: String(q.to.latitude),
        toLon: String(q.to.longitude),
        time: q.time,
        arriveBy: String(q.arriveBy),
      })
      if (q.cursor) params.set('cursor', q.cursor)
      return api<TransitPlan>(`/transit/plan?${params}`, { signal })
    },
    enabled: query !== null,
    staleTime: 10 * 60_000,
    placeholderData: (previous) => previous,
  })
}
