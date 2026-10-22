import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, json } from './client'

export interface PriceWatch {
  tripId: string
  optionId: string
  title: string
  signature: string
  adults: number
  startPrice: number
  lastPrice: number | null
  /** gesetzt, wenn der Preis gefallen ist (alter Preis) – bis zum Wegklicken */
  dropFrom: number | null
  unavailable: boolean
  checkedAt: string | null
  problem: string | null
  createdAt: string
}

export const MAX_PRICE_WATCHES = 3
const key = ['price-watches'] as const

/** Beobachtete Flüge – die App prüft sie höchstens einmal am Tag, solange sie läuft. */
export function usePriceWatches() {
  return useQuery({ queryKey: key, queryFn: () => api<PriceWatch[]>('/price-watches'), refetchInterval: 30 * 60_000 })
}

export function usePriceWatchActions() {
  const queryClient = useQueryClient()
  const onSuccess = () => void queryClient.invalidateQueries({ queryKey: key })
  return {
    watch: useMutation({
      mutationFn: (v: { tripId: string; optionId: string }) => api<PriceWatch>('/price-watches', { method: 'POST', ...json(v) }),
      onSuccess,
    }),
    unwatch: useMutation({ mutationFn: (optionId: string) => api<void>(`/price-watches/${optionId}`, { method: 'DELETE' }), onSuccess }),
    seen: useMutation({
      mutationFn: (optionId: string) => api<PriceWatch>(`/price-watches/${optionId}/seen`, { method: 'POST' }),
      onSuccess,
    }),
  }
}
