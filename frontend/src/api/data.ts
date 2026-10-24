import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export interface StoredData {
  /** strecke | kalender */
  kind: string
  key: string
  label: string
  entries: number
  lastUsed: string
}

export interface OffloadedData {
  name: string
  kind: string
  label: string
  entries: number
  bytes: number
  offloadedAt: string
}

const key = ['data'] as const

/** Gespeicherte Preisdaten und ausgelagerte Dateien. */
export function useStoredData() {
  return useQuery({ queryKey: key, queryFn: () => api<{ stored: StoredData[]; offloaded: OffloadedData[] }>('/data') })
}

export function useDataActions() {
  const queryClient = useQueryClient()
  const onSuccess = () => {
    void queryClient.invalidateQueries({ queryKey: key })
    void queryClient.invalidateQueries({ queryKey: ['price-stats'] })
    void queryClient.invalidateQueries({ queryKey: ['price-calendars'] })
  }
  return {
    offload: useMutation({
      mutationFn: (days: number) => api<{ count: number }>(`/data/offload?days=${days}`, { method: 'POST' }),
      onSuccess,
    }),
    restore: useMutation({
      mutationFn: (name: string) => api<void>(`/data/offloaded/${encodeURIComponent(name)}/restore`, { method: 'POST' }),
      onSuccess,
    }),
    /** Ausgewähltes endgültig löschen; mit unusedDays zusätzlich alles, was so lange ungenutzt ist. */
    deleteSelected: useMutation({
      mutationFn: (body: { stored: string[]; offloaded: string[]; unusedDays: number | null }) =>
        api<{ count: number }>('/data/delete', { method: 'POST', body: JSON.stringify(body) }),
      onSuccess,
    }),
  }
}
