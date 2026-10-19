import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, json } from './client'

export interface PackingTemplateItem {
  text: string
  category: string
  suggestionKey: string | null
}

export interface PackingTemplate {
  id: string
  name: string
  items: PackingTemplateItem[]
  updatedAt: string
}

const key = ['packing-templates'] as const

/** Gespeicherte Packlisten-Vorlagen (gelten für alle Reisen, liegen im Datenordner der App). */
export function usePackingTemplates() {
  return useQuery({ queryKey: key, queryFn: () => api<PackingTemplate[]>('/packing-templates') })
}

export function usePackingTemplateActions() {
  const queryClient = useQueryClient()
  const onSuccess = () => void queryClient.invalidateQueries({ queryKey: key })
  return {
    save: useMutation({
      mutationFn: (input: { name: string; items: PackingTemplateItem[] }) =>
        api<PackingTemplate>('/packing-templates', { method: 'POST', ...json(input) }),
      onSuccess,
    }),
    rename: useMutation({
      mutationFn: ({ id, name }: { id: string; name: string }) =>
        api<PackingTemplate>(`/packing-templates/${id}`, { method: 'PUT', ...json({ name }) }),
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api<void>(`/packing-templates/${id}`, { method: 'DELETE' }),
      onSuccess,
    }),
  }
}
