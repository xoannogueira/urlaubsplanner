import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, json } from './client'

export interface AppInfo {
  app: string
  /** Läuft als Desktop-App (per Icon gestartet) */
  desktop: boolean
  version: string
  dataDirectory: string
}

export interface AppSettings {
  serpApi: {
    configured: boolean
    /** z. B. „••••a1b2“ – der Key selbst verlässt das Backend nie */
    hint: string | null
    /** In der App eingetragen (hier änderbar) */
    fromApp: boolean
  }
  flightsProvider: 'liteapi' | 'serpapi'
  hotelsProvider: 'liteapi' | 'serpapi'
  dataDirectory: string
  desktop: boolean
}

export interface SaveKeyResult {
  configured: boolean
  hint: string
  quota: { left: number; perMonth: number }
}

export function useAppInfo() {
  return useQuery({ queryKey: ['app', 'info'], queryFn: () => api<AppInfo>('/app/info'), staleTime: Infinity, retry: 2 })
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api<AppSettings>('/settings'), staleTime: 60_000 })
}

/** Nach einer Key-Änderung alles neu laden, was davon abhängt (Status, Kontingent, Suchen). */
function useRefreshAfterKeyChange() {
  const client = useQueryClient()
  return () => {
    void client.invalidateQueries({ queryKey: ['settings'] })
    void client.invalidateQueries({ queryKey: ['flights', 'status'] })
    void client.invalidateQueries({ queryKey: ['hotels', 'status'] })
  }
}

/** Prüft den Key bei SerpApi und speichert ihn nur, wenn er gültig ist. */
export function useSaveSerpApiKey() {
  const refresh = useRefreshAfterKeyChange()
  return useMutation({
    mutationFn: (apiKey: string) => api<SaveKeyResult>('/settings/serpapi', { method: 'PUT', ...json({ apiKey }) }),
    onSuccess: refresh,
  })
}

export function useRemoveSerpApiKey() {
  const refresh = useRefreshAfterKeyChange()
  return useMutation({
    mutationFn: () => api<void>('/settings/serpapi', { method: 'DELETE' }),
    onSuccess: refresh,
  })
}
