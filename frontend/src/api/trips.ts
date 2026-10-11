import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, json } from './client'
import type { OptionInput, OptionStatus, StageInput, Trip, TripInput, TripListItem, TripSummary } from './types'

export const tripKeys = {
  all: ['trips'] as const,
  detail: (id: string) => ['trip', id] as const,
  summary: (id: string) => ['trip', id, 'summary'] as const,
}

export function useTrips() {
  return useQuery({ queryKey: tripKeys.all, queryFn: () => api<TripListItem[]>('/trips') })
}

export function useTrip(id: string) {
  return useQuery({ queryKey: tripKeys.detail(id), queryFn: () => api<Trip>(`/trips/${id}`) })
}

export function useTripSummary(id: string) {
  return useQuery({ queryKey: tripKeys.summary(id), queryFn: () => api<TripSummary>(`/trips/${id}/summary`) })
}

export function useCreateTrip() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TripInput) => api<Trip>('/trips', { method: 'POST', ...json(input) }),
    onSuccess: (trip) => {
      queryClient.setQueryData(tripKeys.detail(trip.id), trip)
      void queryClient.invalidateQueries({ queryKey: tripKeys.all })
    },
  })
}

export function useDeleteTrip() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/trips/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: tripKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: tripKeys.all })
    },
  })
}

/** Jede Änderung liefert die ganze Reise zurück – wir legen sie direkt in den Cache. */
function storeTrip(queryClient: QueryClient, trip: Trip) {
  queryClient.setQueryData(tripKeys.detail(trip.id), trip)
  void queryClient.invalidateQueries({ queryKey: tripKeys.summary(trip.id) })
  void queryClient.invalidateQueries({ queryKey: tripKeys.all, exact: true })
}

/**
 * Bündelt alle Änderungen an einer Reise. Status, Personenzahl und Löschen werden
 * optimistisch angezeigt (sofort), andere Änderungen nach der Antwort des Servers.
 */
export function useTripActions(tripId: string) {
  const queryClient = useQueryClient()
  const base = `/trips/${tripId}`
  const onSuccess = (trip: Trip) => storeTrip(queryClient, trip)

  const updateTrip = useMutation({
    mutationFn: (input: TripInput) => api<Trip>(base, { method: 'PUT', ...json(input) }),
    onSuccess,
    ...optimisticVars<TripInput>(queryClient, tripId, (trip, input) => ({ ...trip, ...input })),
  })

  const addStage = useMutation({
    mutationFn: (input: StageInput) => api<Trip>(`${base}/stages`, { method: 'POST', ...json(input) }),
    onSuccess,
  })

  const updateStage = useMutation({
    mutationFn: ({ id, input }: { id: string; input: StageInput }) => api<Trip>(`${base}/stages/${id}`, { method: 'PUT', ...json(input) }),
    onSuccess,
  })

  const removeStage = useMutation({
    mutationFn: (id: string) => api<Trip>(`${base}/stages/${id}`, { method: 'DELETE' }),
    onSuccess,
  })

  const addOption = useMutation({
    mutationFn: (input: OptionInput) => api<Trip>(`${base}/options`, { method: 'POST', ...json(input) }),
    onSuccess,
  })

  const updateOption = useMutation({
    mutationFn: ({ id, input }: { id: string; input: OptionInput }) =>
      api<Trip>(`${base}/options/${id}`, { method: 'PUT', ...json(input) }),
    onSuccess,
  })

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OptionStatus }) =>
      api<Trip>(`${base}/options/${id}/status`, { method: 'PATCH', ...json({ status }) }),
    onSuccess,
    ...optimisticVars<{ id: string; status: OptionStatus }>(queryClient, tripId, (trip, { id, status }) => ({
      ...trip,
      options: trip.options.map((o) => (o.id === id ? { ...o, status } : o)),
    })),
  })

  /** Neu geprüfter Preis – setzt „geprüft vor …“ auch bei gleichem Preis. */
  const confirmPrice = useMutation({
    mutationFn: ({ id, price }: { id: string; price: number }) =>
      api<Trip>(`${base}/options/${id}/price`, { method: 'PATCH', ...json({ price }) }),
    onSuccess,
  })

  const removeOption = useMutation({
    mutationFn: (id: string) => api<Trip>(`${base}/options/${id}`, { method: 'DELETE' }),
    onSuccess,
    ...optimisticVars<string>(queryClient, tripId, (trip, id) => ({
      ...trip,
      options: trip.options.filter((o) => o.id !== id),
    })),
  })

  return { updateTrip, addStage, updateStage, removeStage, addOption, updateOption, setStatus, confirmPrice, removeOption }
}

/** Zeigt eine Änderung sofort an und rollt sie zurück, falls der Server ablehnt. */

function optimisticVars<TVars>(queryClient: QueryClient, tripId: string, apply: (trip: Trip, vars: TVars) => Trip) {
  return {
    onMutate: (vars: TVars) => {
      // Erst anzeigen, dann laufende Abrufe abbrechen – so reagiert die Oberfläche ohne Verzögerung.
      const previous = queryClient.getQueryData<Trip>(tripKeys.detail(tripId))
      if (previous) queryClient.setQueryData(tripKeys.detail(tripId), apply(previous, vars))
      void queryClient.cancelQueries({ queryKey: tripKeys.detail(tripId) })
      return { previous }
    },
    onError: (_error: unknown, _vars: TVars, context?: { previous?: Trip }) => {
      if (context?.previous) queryClient.setQueryData(tripKeys.detail(tripId), context.previous)
    },
  }
}
