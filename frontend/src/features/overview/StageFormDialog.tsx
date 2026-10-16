import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import type { LatLng, Stage, StageInput, Trip } from '../../api/types'
import { MapHint, PlaceSearchField } from '../../components/PlaceSearchField'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { DateField } from '../../components/ui/DateField'
import { FormError, TextAreaField } from '../../components/ui/Field'
import { newStageDefaults, rangeHint, tripRange } from '../../lib/dates'
import { toLatLng } from '../../lib/geo'

interface StageFormDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (input: StageInput) => Promise<unknown>
  stage?: Stage
  /** Für Vorschläge und Grenzen: Reisezeitraum und vorhandene Etappen. */
  trip: Pick<Trip, 'startDate' | 'endDate' | 'stages'>
}

export function StageFormDialog({ open, onClose, onSubmit, stage, trip }: StageFormDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={stage ? 'Reise-Etappe bearbeiten' : 'Reise-Etappe hinzufügen'}
      description="Ein Ort mit Zeitraum, z. B. Lissabon vom 12. bis 16. Mai."
      width="sm"
    >
      {open && <StageForm key={stage?.id ?? 'new'} stage={stage} trip={trip} onSubmit={onSubmit} onClose={onClose} />}
    </Dialog>
  )
}

function StageForm({ stage, trip, onSubmit, onClose }: Omit<StageFormDialogProps, 'open'>) {
  // Neue Etappe: schließt an die letzte an und reicht bis zum Reiseende.
  const [defaults] = useState(() => newStageDefaults(trip))
  const range = tripRange(trip)
  // Feste Grenzen nur, wenn die Reise selbst Daten hat – sonst könnte man die Reise nicht um Etappen verlängern.
  const limits = trip.startDate && trip.endDate ? { min: trip.startDate, max: trip.endDate } : { min: null, max: null }
  const [name, setName] = useState(stage?.name ?? '')
  const [coordinates, setCoordinates] = useState<LatLng | null>(toLatLng(stage))
  const [startDate, setStartDate] = useState(stage?.startDate ?? defaults.start)
  const [endDate, setEndDate] = useState(stage?.endDate ?? defaults.end)
  const [description, setDescription] = useState(stage?.description ?? '')
  const [error, setError] = useState<ApiError | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      await onSubmit({
        name,
        startDate,
        endDate,
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
        description: description.trim() || null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'Unbekannter Fehler'))
    } finally {
      setPending(false)
    }
  }

  const fe = error?.fieldErrors ?? {}

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <PlaceSearchField
          label="Ort"
          value={name}
          coordinates={coordinates}
          onTextChange={(text) => {
            setName(text)
            setCoordinates(null)
          }}
          onPick={(place) => {
            setName(place.name)
            setCoordinates({ latitude: place.latitude, longitude: place.longitude })
          }}
          placeholder="z. B. Lissabon"
          required
          autoFocus
          error={fe.name ?? fe.latitude}
        />
        <MapHint coordinates={coordinates} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <DateField
          label="Anreise"
          value={startDate}
          onValue={setStartDate}
          min={limits.min}
          max={limits.max}
          openAt={range.start}
          required
          error={fe.startDate}
          hint={rangeHint(range)}
        />
        <DateField
          label="Abreise"
          value={endDate}
          onValue={setEndDate}
          min={startDate || limits.min}
          max={limits.max}
          openAt={range.end && range.end > startDate ? range.end : startDate || range.start}
          required
          error={fe.endDate}
        />
      </div>
      <TextAreaField
        label="Beschreibung (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="z. B. Altstadt erkunden, Strandtage, Tagesausflug nach Sintra"
        maxLength={2000}
        rows={3}
        error={fe.description}
      />
      <FormError message={error && Object.keys(fe).length === 0 ? error.message : null} />
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onClose}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {stage ? 'Speichern' : 'Hinzufügen'}
        </Button>
      </div>
    </form>
  )
}
