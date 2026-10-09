import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import type { Trip, TripInput } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { FormError, InputField, TextAreaField } from '../../components/ui/Field'

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
      onClose()
      onSuccess?.(saved)
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
          error={fe.travelers}
        />
        <InputField
          label="Von (optional)"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          error={fe.startDate}
        />
        <InputField
          label="Bis (optional)"
          type="date"
          value={endDate}
          min={startDate || undefined}
          onChange={(e) => setEndDate(e.target.value)}
          error={fe.endDate}
        />
      </div>
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
