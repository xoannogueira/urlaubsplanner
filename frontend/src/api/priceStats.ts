import { useQuery } from '@tanstack/react-query'
import { api } from './client'

/** Ein gesehener Flugpreis aus dem eigenen Preisarchiv. */
export interface PriceRecord {
  searchedAt: string
  origin: string
  destination: string
  departureDate: string
  /** „09:15“ (Ortszeit Abflug) */
  departureTime: string
  returnDate: string | null
  airline: string
  stops: number
  minutes: number
  pricePerAdult: number
  totalPrice: number
  currency: string
  /** suche | andere-daten | prüfung | wächter */
  source: string
}

export interface PriceHistory {
  origin: string
  destination: string
  departureDate: string
  returnDate: string | null
  fetchedAt: string
  lowest: number | null
  level: string | null
  typicalLow: number | null
  typicalHigh: number | null
  points: { date: string; price: number }[]
}

export interface PriceRoute {
  origin: string
  destination: string
  count: number
  lastSearched: string
  cheapest: number
}

export function usePriceRoutes() {
  return useQuery({ queryKey: ['price-stats', 'routes'], queryFn: () => api<PriceRoute[]>('/price-stats/routes') })
}

export function usePriceStats(route: { origin: string; destination: string } | null) {
  return useQuery({
    queryKey: ['price-stats', route?.origin, route?.destination],
    queryFn: () =>
      api<{ records: PriceRecord[]; histories: PriceHistory[] }>(`/price-stats?origin=${route!.origin}&destination=${route!.destination}`),
    enabled: route !== null,
  })
}
