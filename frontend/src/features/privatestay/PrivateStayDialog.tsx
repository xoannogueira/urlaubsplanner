import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import type { LatLng, OptionInput, OptionStatus, Trip, TripOption } from '../../api/types'
import { MapHint, PlaceSearchField } from '../../components/PlaceSearchField'
import { Button } from '../../components/ui/Button'
import { DateField } from '../../components/ui/DateField'
import { Dialog } from '../../components/ui/Dialog'
import { FormError, InputField, SelectField, TextAreaField } from '../../components/ui/Field'
import { rangeFor } from '../../lib/dates'
import { formatDateRange } from '../../lib/format'
import { toLatLng } from '../../lib/geo'
import { statusLabels } from '../../lib/options'
import { parsePrivateStay, privateStayInput, type PrivateStayDetails } from '../../lib/privateStay'

interface PrivateStayDialogProps {
  open: boolean
  trip: Trip
  option?: TripOption
  /** Etappe, die gerade ausgewählt ist – wird vorgeschlagen. */
  defaultStageId?: string | null
  onClose: () => void
  onSubmit: (input: OptionInput) => Promise<unknown>
}

/** Übernachten bei Verwandten oder Freunden: Adresse eintragen, kostet nichts, die Nächte gelten als abgedeckt. */
export function PrivateStayDialog(props: PrivateStayDialogProps) {
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title={props.option ? 'Privat übernachten bearbeiten' : 'Bei Familie oder Freunden übernachten'}
      description="Kostet nichts und zählt als Unterkunft – die Nächte fehlen dann nicht mehr unter „Offene Punkte“. Adresse steht in Tagesplan und PDF."
      width="lg"
    >
      {props.open && <PrivateStayForm key={props.option?.id ?? 'new'} {...props} />}
    </Dialog>
  )
}

const statuses: OptionStatus[] = ['Selected', 'Booked']

function PrivateStayForm({ trip, option, defaultStageId, onClose, onSubmit }: PrivateStayDialogProps) {
  const stages = trip.stages
  const [d, setD] = useState<PrivateStayDetails>(() =>
    option
      ? parsePrivateStay(option)
      : {
          host: '',
          address: '',
          latitude: null,
          longitude: null,
          stageId: defaultStageId ?? stages[0]?.id ?? null,
          startDate: '',
          endDate: '',
          status: 'Booked',
          note: '',
        },
  )
  const [error, setError] = useState<ApiError | null>(null)
  const [pending, setPending] = useState(false)
  const set = (patch: Partial<PrivateStayDetails>) => setD((x) => ({ ...x, ...patch }))
  const stage = stages.find((s) => s.id === d.stageId) ?? null
  const range = rangeFor(trip, stage)
  const coordinates: LatLng | null = d.latitude != null && d.longitude != null ? { latitude: d.latitude, longitude: d.longitude } : null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      await onSubmit(privateStayInput(d))
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
      <InputField
        label="Bei wem?"
        value={d.host}
        onChange={(e) => set({ host: e.target.value })}
        placeholder="z. B. Tante Maria"
        maxLength={100}
        required
        autoFocus
        error={fe.title}
      />
      <div className="flex flex-col gap-1.5">
        <PlaceSearchField
          label="Adresse"
          value={d.address}
          coordinates={coordinates}
          near={toLatLng(stage)}
          fillWith="label"
          placeholder="Straße, Hausnummer, Ort"
          onTextChange={(text) => set({ address: text, latitude: null, longitude: null })}
          onPick={(place) => set({ address: place.label, latitude: place.latitude, longitude: place.longitude })}
          error={fe.locationName ?? fe.latitude}
        />
        <MapHint coordinates={coordinates} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField label="Etappe" value={d.stageId ?? ''} onChange={(e) => set({ stageId: e.target.value || null })} error={fe.stageId}>
          {stages.length === 0 && <option value="">Ganze Reise</option>}
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({formatDateRange(s.startDate, s.endDate)})
            </option>
          ))}
        </SelectField>
        <SelectField label="Status" value={d.status} onChange={(e) => set({ status: e.target.value as OptionStatus })}>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {statusLabels[s]}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <DateField
          label="Ankunft (optional)"
          value={d.startDate}
          onValue={(v) => set({ startDate: v })}
          min={range.start}
          max={range.end}
          openAt={range.start}
          hint="leer = ganze Etappe"
          error={fe.startDate}
        />
        <DateField
          label="Abreise (optional)"
          value={d.endDate}
          onValue={(v) => set({ endDate: v })}
          min={d.startDate || range.start}
          max={range.end}
          openAt={d.startDate || range.end}
          error={fe.endDate}
        />
      </div>
      <TextAreaField
        label="Notiz (optional)"
        value={d.note}
        onChange={(e) => set({ note: e.target.value })}
        placeholder="z. B. Schlüssel beim Nachbarn, Gastgeschenk mitbringen"
        rows={2}
        error={fe.notes}
      />
      <FormError message={error && Object.keys(fe).length === 0 ? error.message : null} />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Speichert …' : 'Speichern'}
        </Button>
      </div>
    </form>
  )
}
