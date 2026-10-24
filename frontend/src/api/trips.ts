import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, json } from './client'
import { adjustTripToFlight, announceAdjustment } from './flightAdjust'
import { periodExtendedMessage } from '../lib/dates'
import { clearSearchDrafts } from '../hooks/useSearchDraft'
import { newMismatchMessage } from '../lib/hotelFit'
import type {
  OptionInput,
  OptionStatus,
  PackingList,
  SearchSettings,
  StageInput,
  Trip,
  TripInput,
  TripListItem,
  TripParty,
  TripSummary,
} from './types'

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
      clearSearchDrafts(id)
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
  const store = (trip: Trip) => storeTrip(queryClient, trip)
  // Flug ausgewählt/gebucht → Zeitraum und ggf. erste Etappe automatisch anpassen
  const afterFlight = (trip: Trip, optionId: string) => void adjustTripToFlight(trip, optionId, store)
  // Bei schnellem Abhaken: nur die Antwort auf die letzte Änderung übernehmen – ältere würden den neueren Stand kurz überschreiben.
  const latestOnly = (key: string[]) => (trip: Trip) => {
    if (queryClient.isMutating({ mutationKey: key }) <= 1) storeTrip(queryClient, trip)
  }

  const updateTrip = useMutation({
    mutationFn: (input: TripInput) => api<Trip>(base, { method: 'PUT', ...json(input) }),
    onSuccess,
    ...optimisticVars<TripInput>(queryClient, tripId, (trip, input) => ({ ...trip, ...input })),
  })

  // Liegt eine Etappe außerhalb des Reisezeitraums, verlängert der Server ihn – das sagen wir dazu.
  const withPeriodHint = async (request: Promise<Trip>) => {
    const before = queryClient.getQueryData<Trip>(tripKeys.detail(tripId))
    const trip = await request
    const message = before ? periodExtendedMessage(before, trip) : null
    if (message) announceAdjustment({ tripId, message })
    return trip
  }

  const addStage = useMutation({
    mutationFn: (input: StageInput) => withPeriodHint(api<Trip>(`${base}/stages`, { method: 'POST', ...json(input) })),
    onSuccess,
  })

  const updateStage = useMutation({
    mutationFn: ({ id, input }: { id: string; input: StageInput }) =>
      withPeriodHint(api<Trip>(`${base}/stages/${id}`, { method: 'PUT', ...json(input) })),
    onSuccess,
  })

  const removeStage = useMutation({
    mutationFn: (id: string) => api<Trip>(`${base}/stages/${id}`, { method: 'DELETE' }),
    onSuccess,
  })

  const addOption = useMutation({
    mutationFn: (input: OptionInput) => api<Trip>(`${base}/options`, { method: 'POST', ...json(input) }),
    onSuccess: (trip: Trip, input: OptionInput) => {
      const known = new Set(queryClient.getQueryData<Trip>(tripKeys.detail(tripId))?.options.map((o) => o.id))
      storeTrip(queryClient, trip)
      if (input.kind === 'Flight') {
        const added = trip.options.filter((o) => !known.has(o.id))
        if (added.length === 1) afterFlight(trip, added[0].id)
      }
    },
  })

  const updateOption = useMutation({
    mutationFn: ({ id, input }: { id: string; input: OptionInput }) =>
      api<Trip>(`${base}/options/${id}`, { method: 'PUT', ...json(input) }),
    onSuccess: (trip: Trip, { id, input }: { id: string; input: OptionInput }) => {
      storeTrip(queryClient, trip)
      if (input.kind === 'Flight' || input.kind === 'Transport') afterFlight(trip, id)
    },
  })

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OptionStatus }) =>
      api<Trip>(`${base}/options/${id}/status`, { method: 'PATCH', ...json({ status }) }),
    onSuccess: (trip: Trip, { id, status }: { id: string; status: OptionStatus }) => {
      storeTrip(queryClient, trip)
      if (status === 'Selected' || status === 'Booked') afterFlight(trip, id)
    },
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

  /** Neuer Reisezeitraum – erste und letzte Etappe wandern mit. */
  /** Teil der Sucheinstellungen ändern („Als Standard merken“) – der Rest bleibt. */
  const setSearchSettings = useMutation({
    mutationFn: (patch: SearchSettings) => {
      const current = queryClient.getQueryData<Trip>(tripKeys.detail(tripId))?.searchSettings ?? {}
      return api<Trip>(`${base}/search-settings`, { method: 'PUT', ...json({ ...current, ...patch }) })
    },
    onSuccess,
  })

  const changePeriod = useMutation({
    mutationFn: async (period: { startDate: string; endDate: string }) => {
      const before = queryClient.getQueryData<Trip>(tripKeys.detail(tripId))
      const trip = await api<Trip>(`${base}/period`, { method: 'PUT', ...json(period) })
      // Gebuchte Hotels ziehen nicht von selbst um – darauf hinweisen.
      const message = before ? newMismatchMessage(before, trip) : null
      if (message) announceAdjustment({ tripId, message })
      return trip
    },
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

  /** Packliste: immer die ganze Liste – sofort angezeigt, damit Abhaken ohne Verzögerung wirkt. */
  const setPacking = useMutation({
    mutationKey: ['packing', tripId],
    mutationFn: (packing: PackingList) => api<Trip>(`${base}/packing`, { method: 'PUT', ...json(packing) }),
    onSuccess: latestOnly(['packing', tripId]),
    ...optimisticVars<PackingList>(queryClient, tripId, (trip, packing) => ({ ...trip, packing })),
  })

  /** Mitreisende und Ausgaben: die Personenzahl folgt den Mitreisenden. */
  const setParty = useMutation({
    mutationKey: ['party', tripId],
    mutationFn: (party: TripParty) => api<Trip>(`${base}/party`, { method: 'PUT', ...json(party) }),
    onSuccess: latestOnly(['party', tripId]),
    ...optimisticVars<TripParty>(queryClient, tripId, (trip, party) => ({
      ...trip,
      party,
      travelers: party.members.length > 0 ? party.members.length : trip.travelers,
    })),
  })

  return {
    updateTrip,
    addStage,
    updateStage,
    removeStage,
    addOption,
    updateOption,
    setStatus,
    confirmPrice,
    removeOption,
    changePeriod,
    setSearchSettings,
    setPacking,
    setParty,
  }
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
