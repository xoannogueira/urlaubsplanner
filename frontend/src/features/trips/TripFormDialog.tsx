import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError, json } from '../../api/client'
import { usePackingTemplates } from '../../api/packingTemplates'
import { tripKeys } from '../../api/trips'
import { applyTemplate } from '../../lib/packing'
import type { Trip, TripInput } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { DateField } from '../../components/ui/DateField'
import { Dialog } from '../../components/ui/Dialog'
import { FormError, InputField, SelectField, TextAreaField } from '../../components/ui/Field'

interface TripFormDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (input: TripInput) => Promise<Trip>
  /** Wird nach dem Schließen aufgerufen, z. B. um zur neuen Reise zu springen. */
  onSuccess?: (trip: Trip) => void
  trip?: Trip
}

export function TripFormDialog({ open, onClose, onSubmit, onSuccess, trip }: TripFormDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={trip ? 'Reise bearbeiten' : 'Neue Reise'}
      description="Etappen mit Orten legst du danach in der Übersicht an."
    >
      {/* key sorgt dafür, dass das Formular beim Öffnen frisch startet */}
      {open && <TripForm key={trip?.id ?? 'new'} trip={trip} onSubmit={onSubmit} onSuccess={onSuccess} onClose={onClose} />}
    </Dialog>
  )
}

function TripForm({ trip, onSubmit, onSuccess, onClose }: Omit<TripFormDialogProps, 'open'>) {
  const [name, setName] = useState(trip?.name ?? '')
  const [travelers, setTravelers] = useState(String(trip?.travelers ?? 2))
  const [startDate, setStartDate] = useState(trip?.startDate ?? '')
  const [endDate, setEndDate] = useState(trip?.endDate ?? '')
  const [notes, setNotes] = useState(trip?.notes ?? '')
  const [error, setError] = useState<ApiError | null>(null)
  const [pending, setPending] = useState(false)
  // Neue Reise: Packliste direkt aus einer gespeicherten Vorlage füllen.
  const templates = usePackingTemplates()
  const [templateId, setTemplateId] = useState('')
  const queryClient = useQueryClient()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      const saved = await onSubmit({
        name,
        travelers: Number(travelers),
        startDate: startDate || null,
        endDate: endDate || null,
        notes: notes || null,
      })
      let result = saved
      const template = !trip ? templates.data?.find((t) => t.id === templateId) : undefined
      if (template) {
        const packing = applyTemplate({ items: [], dismissed: [] }, template.items, () => crypto.randomUUID()).list
        result = await api<Trip>(`/trips/${saved.id}/packing`, { method: 'PUT', ...json(packing) })
        queryClient.setQueryData(tripKeys.detail(result.id), result)
      }
      onClose()
      onSuccess?.(result)
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'Unbekannter Fehler'))
    } finally {
      setPending(false)
    }
  }

  const fe = error?.fieldErrors ?? {}

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <InputField
        label="Name der Reise"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="z. B. Portugal-Rundreise"
        required
        autoFocus
        error={fe.name}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <InputField
          label="Personen"
          type="number"
          min={1}
          max={50}
          value={travelers}
          onChange={(e) => setTravelers(e.target.value)}
          required
          disabled={(trip?.party.members.length ?? 0) > 0}
          hint={(trip?.party.members.length ?? 0) > 0 ? 'folgt den Mitreisenden' : undefined}
          error={fe.travelers}
        />
        {trip && trip.stages.length > 0 ? (
          <p className="self-end pb-2 text-[13px] text-muted sm:col-span-2">
            Zeitraum änderst du über das Datum oben in der Kopfzeile – erste und letzte Etappe wandern dann mit.
          </p>
        ) : (
          <>
            <DateField label="Reisebeginn (optional)" value={startDate} onValue={setStartDate} error={fe.startDate} />
            <DateField
              label="Reiseende (optional)"
              value={endDate}
              onValue={setEndDate}
              min={startDate || null}
              openAt={startDate || null}
              error={fe.endDate}
            />
          </>
        )}
      </div>
      {!trip && (templates.data?.length ?? 0) > 0 && (
        <SelectField label="Packliste aus Vorlage (optional)" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          <option value="">Keine</option>
          {templates.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.items.length} Einträge)
            </option>
          ))}
        </SelectField>
      )}
      <TextAreaField label="Notizen (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} error={fe.notes} />
      <FormError message={error && Object.keys(fe).length === 0 ? error.message : null} />
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onClose}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {trip ? 'Speichern' : 'Reise anlegen'}
        </Button>
      </div>
    </form>
  )
}
