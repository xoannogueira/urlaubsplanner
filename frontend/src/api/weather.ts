import { useQueries, type QueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { Stage, Trip } from './types'
import { api } from './client'
import { tripWeatherByDate, type WeatherByDate } from '../lib/weather'

export type WeatherSource = 'Forecast' | 'Climate'

export interface WeatherDay {
  /** "YYYY-MM-DD" */
  date: string
  /** Forecast = echte Vorhersage (nächste 16 Tage), Climate = typisches Wetter der letzten Jahre */
  source: WeatherSource
  /** WMO-Wettercode: 0 klar, 2 wechselhaft, 3 bedeckt, 61 Regen, 71 Schnee, 95 Gewitter … */
  code: number
  tempMax: number
  tempMin: number
  precipitationMm: number
  /** Regenwahrscheinlichkeit in % – bei Climate: Anteil der Vorjahre mit Regen */
  rainChance: number | null
  years: number | null
}

export interface WeatherOutlook {
  days: WeatherDay[]
}

export function fetchStageWeather(stage: Stage, signal?: AbortSignal): Promise<WeatherOutlook> {
  const params = new URLSearchParams({
    lat: String(stage.latitude),
    lon: String(stage.longitude),
    from: stage.startDate,
    to: stage.endDate,
  })
  return api<WeatherOutlook>(`/weather?${params.toString()}`, { signal })
}

export const stageWeatherKey = (stage: Stage) => [
  'weather',
  stage.latitude?.toFixed(2),
  stage.longitude?.toFixed(2),
  stage.startDate,
  stage.endDate,
]

const combine = (results: { data?: WeatherOutlook; isPending: boolean; isError: boolean }[]) => ({
  outlooks: results.map((r) => r.data),
  loading: results.some((r) => r.isPending),
  failed: results.some((r) => r.isError),
})

/** Wetter aller Etappen mit Ort (kostenlos über Open-Meteo). Fehler einer Etappe lassen die anderen unberührt. */
export function useTripWeather(trip: Pick<Trip, 'stages'>) {
  const stages = useMemo(() => trip.stages.filter((s) => s.latitude !== null && s.longitude !== null), [trip.stages])
  const { outlooks, loading, failed } = useQueries({
    queries: stages.map((stage) => ({
      queryKey: stageWeatherKey(stage),
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchStageWeather(stage, signal),
      staleTime: 60 * 60_000,
      gcTime: 6 * 60 * 60_000,
      retry: 1,
    })),
    combine,
  })
  const byStage = useMemo(() => {
    const map = new Map<string, WeatherDay[]>()
    stages.forEach((s, i) => {
      const days = outlooks[i]?.days
      if (days) map.set(s.id, days)
    })
    return map
  }, [stages, outlooks])
  const byDate: WeatherByDate = useMemo(() => tripWeatherByDate(stages, byStage), [stages, byStage])
  return { byStage, byDate, loading, failed, hasPlaces: stages.length > 0 }
}

export interface TripWeather {
  byStage: Map<string, WeatherDay[]>
  byDate: WeatherByDate
}

/** Für die PDF: Wetter aller Etappen laden (aus dem Cache, wenn schon da). Fehlt es, fehlt nur das Wetter. */
export async function loadTripWeather(client: QueryClient, trip: Pick<Trip, 'stages'>): Promise<TripWeather> {
  const stages = trip.stages.filter((s) => s.latitude !== null && s.longitude !== null)
  const results = await Promise.allSettled(
    stages.map((stage) =>
      client.fetchQuery({
        queryKey: stageWeatherKey(stage),
        queryFn: ({ signal }) => fetchStageWeather(stage, signal),
        staleTime: 60 * 60_000,
      }),
    ),
  )
  const byStage = new Map<string, WeatherDay[]>()
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') byStage.set(stages[i].id, r.value.days)
  })
  return { byStage, byDate: tripWeatherByDate(stages, byStage) }
}
