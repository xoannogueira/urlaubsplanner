import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, json } from './client'

export type CalendarPattern = 'Daily' | 'EveryOther' | 'EveryThird' | 'Weekends' | 'Weekly'
export type CalendarState = 'Running' | 'Done' | 'Cancelled' | 'Failed'
/** Google: genau, eine Suche pro Tag. Aviasales: kostenlose Richtpreise. */
export type PriceSource = 'Google' | 'Aviasales'
export type PriceSourceState = 'Ok' | 'Missing' | 'Rejected' | 'Limited' | 'Unreachable'

export interface PriceSourceStatus {
  state: PriceSourceState
  /** null = Prüfung beim Start läuft noch */
  checkedAt: string | null
  message: string
  usable: boolean
}

export interface PriceCalendarRequest {
  origins: string[]
  destinations: string[]
  from: string
  to: string
  /** Reisedauer bei Hin & zurück, null = nur Hinflug */
  nights: number | null
  pattern: CalendarPattern
  source: PriceSource
  /** Reise, aus der geladen wird – der Kalender erscheint nur dort */
  tripId: string
}

export interface CalendarDay {
  date: string
  /** günstigster Preis pro Person */
  cheapest: number | null
  airline: string | null
  stops: number | null
  options: number
  problem: string | null
  /** Strecke des günstigsten Preises, z. B. „FRA-BCN“ */
  route?: string | null
  /** Flugnummer(n) des günstigsten Hinflugs (nur Google) */
  flight?: string | null
}

export interface PriceCalendar {
  id: string
  origins: string[]
  destinations: string[]
  from: string
  to: string
  nights: number | null
  pattern: CalendarPattern
  createdAt: string
  lastUsedAt: string
  state: CalendarState
  total: number
  days: CalendarDay[]
  problem: string | null
  source: PriceSource
  /** null bei älteren Kalendern – dann nach Strecke zugeordnet */
  tripId: string | null
}

const key = ['price-calendars'] as const
const sourceKey = ['price-source'] as const

/** Ob die kostenlose Quelle (Aviasales) geht – wird beim Start der App geprüft. */
export function usePriceSource() {
  return useQuery({
    queryKey: sourceKey,
    queryFn: () => api<PriceSourceStatus>('/price-source'),
    // Solange die Startprüfung läuft, kurz nachfragen.
    refetchInterval: (q) => (q.state.data && q.state.data.checkedAt === null ? 1500 : false),
  })
}

export function useRecheckPriceSource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<PriceSourceStatus>('/price-source/check', { method: 'POST' }),
    onSuccess: (status) => queryClient.setQueryData(sourceKey, status),
  })
}

/** Gespeicherte Preiskalender – solange einer lädt, alle 3 Sekunden neu. */
export function usePriceCalendars() {
  return useQuery({
    queryKey: key,
    queryFn: () => api<PriceCalendar[]>('/price-calendars'),
    refetchInterval: (q) => (q.state.data?.some((c) => c.state === 'Running') ? 3000 : false),
  })
}

export function usePriceCalendarActions() {
  const queryClient = useQueryClient()
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key })
    void queryClient.invalidateQueries({ queryKey: ['flights', 'status'] })
    void queryClient.invalidateQueries({ queryKey: sourceKey })
  }
  return {
    preview: useMutation({
      mutationFn: (r: PriceCalendarRequest) => api<{ searches: number }>('/price-calendars/preview', { method: 'POST', ...json(r) }),
    }),
    start: useMutation({
      mutationFn: (r: PriceCalendarRequest) => api<PriceCalendar>('/price-calendars', { method: 'POST', ...json(r) }),
      onSuccess: refresh,
    }),
    cancel: useMutation({ mutationFn: (id: string) => api<void>(`/price-calendars/${id}/cancel`, { method: 'POST' }), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => api<void>(`/price-calendars/${id}`, { method: 'DELETE' }), onSuccess: refresh }),
    /** Öffnen zählt als „benutzt“ (fürs Auslagern nach 30 Tagen). */
    open: useMutation({ mutationFn: (id: string) => api<PriceCalendar>(`/price-calendars/${id}`), onSuccess: refresh }),
  }
}
