import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import { useTripActions } from '../../api/trips'
import type { Trip } from '../../api/types'
import { tripRange } from '../../lib/dates'
import { formatDateRange, nightsLabel } from '../../lib/format'
import { Button } from '../ui/Button'
import { DateField } from '../ui/DateField'
import { Dialog } from '../ui/Dialog'
import { FormError } from '../ui/Field'

/** Reisezeitraum ändern – z. B. weil der Flug doch früher oder später geht. Erste und letzte Etappe wandern mit. */
export function PeriodDialog({ trip, open, onClose }: { trip: Trip; open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Reisezeitraum ändern"
      description={
        trip.stages.length > 1
          ? 'Die erste Etappe beginnt am neuen Startdatum, die letzte endet am neuen Enddatum. Etappen dazwischen bleiben, wie sie sind.'
          : trip.stages.length === 1
            ? 'Die Etappe bekommt den neuen Zeitraum.'
            : 'Grober Zeitraum der Reise – Etappen kannst du danach anlegen.'
      }
      width="sm"
    >
      {open && <PeriodForm trip={trip} onClose={onClose} />}
    </Dialog>
  )
}

function PeriodForm({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const { changePeriod } = useTripActions(trip.id)
  const range = tripRange(trip)
  const [start, setStart] = useState(range.start ?? '')
  const [end, setEnd] = useState(range.end ?? '')
  const [error, setError] = useState<ApiError | null>(null)
  const nights = start && end && end > start ? Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) : null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await changePeriod.mutateAsync({ startDate: start, endDate: end })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'Unbekannter Fehler'))
    }
  }
  const fe = error?.fieldErrors ?? {}

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <DateField label="Beginn" value={start} onValue={setStart} required error={fe.startDate} />
        <DateField label="Ende" value={end} onValue={setEnd} min={start || null} openAt={start || null} required error={fe.endDate} />
      </div>
      <p className="text-sm text-muted">
        {nights !== null ? `${formatDateRange(start, end)} · ${nightsLabel(nights)}` : 'Das Ende muss nach dem Beginn liegen.'}
      </p>
      <FormError message={error && Object.keys(fe).length === 0 ? error.message : null} />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={nights === null || changePeriod.isPending}>
          Übernehmen
        </Button>
      </div>
    </form>
  )
}
