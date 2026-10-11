import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, json } from './client'

export type CabinClass = 'Economy' | 'PremiumEconomy' | 'Business' | 'First'

export interface FlightSegment {
  origin: string
  originName: string | null
  destination: string
  destinationName: string | null
  /** Ortszeit des Flughafens, ohne Zeitzone: "2027-05-12T14:25:00" */
  departure: string
  arrival: string
  durationMinutes: number
  carrierCode: string
  carrierName: string | null
  carrierLogo: string | null
  flightNumber: string
}

export interface FlightJourneyLeg {
  origin: string
  destination: string
  departure: string
  arrival: string
  durationMinutes: number
  /** +1 = Ankunft am nächsten Tag */
  dayChange: number
  stops: number
  segments: FlightSegment[]
}

export interface FlightFare {
  family: string
  cabin: string | null
  /** Für alle Reisenden zusammen */
  totalPrice: number
  pricePerAdult: number
  currency: string
  cabinBagKg: number | null
  /** Aufgabegepäck pro Person (0 = nur Handgepäck, null = unbekannt, z. B. bei Google Flights) */
  checkedBags: number | null
  checkedBagKg: number | null
  refundable: boolean
  changeable: boolean
  changeFee: number | null
  seatsRemaining: number | null
}

export interface FlightJourney {
  /** z. B. "STR-LIS@2027-05-12:EW2604|OPO-STR@2027-05-19:EW2713" */
  signature: string
  legs: FlightJourneyLeg[]
  totalMinutes: number
  /** Günstigster Tarif */
  totalPrice: number
  /** Tarife, günstigster zuerst */
  fares: FlightFare[]
  /** Kayak mit Strecken, Daten, Personen und Klasse */
  bookingUrl: string
  googleUrl: string
  /**
   * Gesetzt, wenn erst ein Teil der Strecken feststeht (Google Flights: erst Hinflug, dann Rückflug wählen).
   * totalPrice ist dann der günstigste Gesamtpreis mit diesem Hinflug.
   */
  continuation: string | null
}

export type FlightProvider = 'liteapi' | 'serpapi'

export interface FlightSearchStatus {
  configured: boolean
  provider: FlightProvider
  /** Verbindungen kommen schrittweise (Rückflug nach Wahl des Hinflugs) */
  stepwise: boolean
  /** Restliche Suchen beim Anbieter (SerpApi: 250 kostenlose pro Monat) */
  quota: { left: number; perMonth: number } | null
}

export interface FlightLegQuery {
  origins: string[]
  destinations: string[]
  date: string
}

export interface FlightSearchParams {
  legs: FlightLegQuery[]
  adults: number
  cabin: CabinClass
}

export interface FlightSearchResponse {
  journeys: FlightJourney[]
  requests: number
  failed: number
  sandbox: boolean
  fetchedAt: string
}

export interface FlightAlternativesParams {
  legs: { origin: string; destination: string; date: string }[]
  adults: number
  cabin: CabinClass
  shiftDays?: number
}

export interface FlightAlternativeWindow {
  shiftDays: number
  dates: string[]
  cheapestPrice: number | null
  count: number
  failed: boolean
}

export interface FlightRecheckResponse {
  available: boolean
  journey: FlightJourney | null
  fare: FlightFare | null
  /** Andere Verbindungen derselben Strecke */
  alternatives: number
  cheapestPrice: number | null
}

export function useFlightSearchStatus() {
  return useQuery({
    queryKey: ['flights', 'status'],
    queryFn: () => api<FlightSearchStatus>('/flights/status'),
    staleTime: 60_000,
  })
}

/** Kontingent neu laden, nachdem eine Suche gelaufen ist. */
function useRefreshQuota() {
  const client = useQueryClient()
  return () => void client.invalidateQueries({ queryKey: ['flights', 'status'] })
}

/** Sucht erst nach Klick (params gesetzt). Gleiche Suchen kommen 15 Minuten aus dem Cache. */
export function useFlightSearch(params: FlightSearchParams | null) {
  const refreshQuota = useRefreshQuota()
  return useQuery({
    queryKey: ['flights', 'search', params],
    queryFn: async ({ signal }) => {
      try {
        return await api<FlightSearchResponse>('/flights/search', { method: 'POST', signal, ...json(params) })
      } finally {
        refreshQuota()
      }
    },
    enabled: params !== null,
    staleTime: 15 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    retry: false,
  })
}

/** Nächste Strecke zu einer Teil-Verbindung (z. B. Rückflüge zum gewählten Hinflug). Lädt erst, wenn token gesetzt ist. */
export function useFlightContinue(continuation: string | null) {
  const refreshQuota = useRefreshQuota()
  return useQuery({
    queryKey: ['flights', 'continue', continuation],
    queryFn: async ({ signal }) => {
      try {
        return await api<FlightSearchResponse>('/flights/continue', { method: 'POST', signal, ...json({ continuation }) })
      } finally {
        refreshQuota()
      }
    },
    enabled: continuation !== null,
    staleTime: 60 * 60_000,
    gcTime: 2 * 60 * 60_000,
    retry: false,
  })
}

/** Günstigster Preis für ±1–3 Tage verschobene Reisedaten (eine Abfrage pro Zeitraum). */
export function useFlightAlternatives() {
  const refreshQuota = useRefreshQuota()
  return useMutation({
    mutationFn: (params: FlightAlternativesParams) =>
      api<{ windows: FlightAlternativeWindow[]; requests: number }>('/flights/alternatives', { method: 'POST', ...json(params) }),
    onSettled: refreshQuota,
  })
}

/** Gemerkten Flug erneut prüfen. */
export function useFlightRecheck() {
  const refreshQuota = useRefreshQuota()
  return useMutation({
    mutationFn: (params: { signature: string; adults: number; cabin: CabinClass }) =>
      api<FlightRecheckResponse>('/flights/recheck', { method: 'POST', ...json(params) }),
    onSettled: refreshQuota,
  })
}
