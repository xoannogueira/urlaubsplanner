import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import type { LatLng, OptionInput, OptionKind, OptionStatus, Stage, TripOption } from '../../api/types'
import { MapHint, PlaceSearchField } from '../../components/PlaceSearchField'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { FormError, InputField, SelectField, TextAreaField } from '../../components/ui/Field'
import { formatDateRange } from '../../lib/format'
import { toLatLng } from '../../lib/geo'
import { kindLabels, statusLabels, statusOrder } from '../../lib/options'

interface OptionFormDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (input: OptionInput) => Promise<unknown>
  kind: OptionKind
  stages: Stage[]
  option?: TripOption
  defaultStageId?: string | null
}

const placeholders: Record<OptionKind, { title: string; location: string }> = {
  Flight: { title: 'z. B. STR → LIS, TAP 10:40', location: 'z. B. Flughafen Lissabon' },
  Hotel: { title: 'z. B. Hotel Miradouro', location: 'Hotelname oder Adresse suchen' },
  Activity: { title: 'z. B. Oceanário de Lisboa', location: 'Sehenswürdigkeit oder Adresse suchen' },
  Transport: { title: 'z. B. Zug Lissabon → Porto', location: '' },
  Other: { title: 'z. B. Reiseversicherung', location: '' },
}

export function OptionFormDialog(props: OptionFormDialogProps) {
  const { open, onClose, option, kind } = props
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={option ? `${kindLabels[kind].singular} bearbeiten` : `${kindLabels[kind].singular} speichern`}
      description="Füg den Link von Booking, Airbnb, Skyscanner & Co. ein – so kannst du später direkt dort buchen."
      width="lg"
    >
      {open && <OptionForm key={option?.id ?? 'new'} {...props} />}
    </Dialog>
  )
}

function OptionForm({ onClose, onSubmit, kind, stages, option, defaultStageId }: OptionFormDialogProps) {
  const [title, setTitle] = useState(option?.title ?? '')
  const [url, setUrl] = useState(option?.url ?? '')
  const [stageId, setStageId] = useState(option ? (option.stageId ?? '') : (defaultStageId ?? ''))
  const [status, setStatus] = useState<OptionStatus>(option?.status ?? 'Idea')
  const [price, setPrice] = useState(option?.price != null ? String(option.price) : '')
  const [pricePerPerson, setPricePerPerson] = useState(option?.pricePerPerson ?? kind === 'Flight')
  const [startDate, setStartDate] = useState(option?.startDate ?? '')
  const [endDate, setEndDate] = useState(option?.endDate ?? '')
  const [locationName, setLocationName] = useState(option?.locationName ?? '')
  const [coordinates, setCoordinates] = useState<LatLng | null>(toLatLng(option))
  const [notes, setNotes] = useState(option?.notes ?? '')
  const [error, setError] = useState<ApiError | null>(null)
  const [pending, setPending] = useState(false)

  const isHotel = kind === 'Hotel'
  // Suche bevorzugt Orte rund um die gewählte Etappe – "Hotel Miradouro" findet dann das in Lissabon.
  const near = toLatLng(stages.find((s) => s.id === stageId))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      await onSubmit({
        kind,
        title,
        status,
        stageId: stageId || null,
        url: url || null,
        price: price === '' ? null : Number(price.replace(',', '.')),
        pricePerPerson,
        startDate: startDate || null,
        endDate: endDate || null,
        locationName: locationName || null,
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
        notes: notes || null,
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
      <InputField
        label="Titel"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholders[kind].title}
        required
        autoFocus
        error={fe.title}
      />
      <InputField
        label="Link zur Buchung"
        type="url"
        inputMode="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…"
        error={fe.url}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField label="Etappe" value={stageId} onChange={(e) => setStageId(e.target.value)} error={fe.stageId}>
          <option value="">Ganze Reise</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({formatDateRange(s.startDate, s.endDate)})
            </option>
          ))}
        </SelectField>
        <SelectField label="Status" value={status} onChange={(e) => setStatus(e.target.value as OptionStatus)} error={fe.status}>
          {statusOrder.map((s) => (
            <option key={s} value={s}>
              {statusLabels[s]}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
        <InputField
          label="Preis in €"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="z. B. 189"
          pattern="[0-9]+([.,][0-9]{1,2})?"
          error={fe.price}
        />
        <fieldset className="flex h-11 items-center gap-1 rounded-xl bg-surface-2 p-1">
          <legend className="sr-only">Preisangabe</legend>
          <PriceModeButton active={!pricePerPerson} onClick={() => setPricePerPerson(false)}>
            Gesamt
          </PriceModeButton>
          <PriceModeButton active={pricePerPerson} onClick={() => setPricePerPerson(true)}>
            Pro Person
          </PriceModeButton>
        </fieldset>
      </div>

      <div className="flex flex-col gap-1.5">
        <PlaceSearchField
          label={kind === 'Flight' ? 'Ort (optional)' : 'Ort / Adresse'}
          value={locationName}
          coordinates={coordinates}
          near={near}
          onTextChange={(text) => {
            setLocationName(text)
            setCoordinates(null)
          }}
          fillWith="label"
          onPick={(place) => {
            setLocationName(place.label)
            setCoordinates({ latitude: place.latitude, longitude: place.longitude })
            if (!title.trim()) setTitle(place.name)
          }}
          placeholder={placeholders[kind].location}
          error={fe.locationName ?? fe.latitude}
        />
        <MapHint coordinates={coordinates} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField
          label={isHotel ? 'Check-in' : 'Datum'}
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          error={fe.startDate}
          hint={isHotel ? 'leer = ganze Etappe' : undefined}
        />
        <InputField
          label={isHotel ? 'Check-out' : 'Bis (optional)'}
          type="date"
          value={endDate}
          min={startDate || undefined}
          onChange={(e) => setEndDate(e.target.value)}
          error={fe.endDate}
        />
      </div>

      <TextAreaField
        label="Notizen"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="z. B. Frühstück inklusive, kostenlose Stornierung bis 1. Mai"
        error={fe.notes}
      />

      <FormError message={error && Object.keys(fe).length === 0 ? error.message : null} />
      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onClose}>Abbrechen</Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {option ? 'Speichern' : 'Hinzufügen'}
        </Button>
      </div>
    </form>
  )
}

function PriceModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={
        active
          ? 'h-9 flex-1 cursor-pointer rounded-lg bg-accent text-sm font-bold text-accent-ink'
          : 'h-9 flex-1 cursor-pointer rounded-lg text-sm font-bold text-muted hover:text-text'
      }
    >
      {children}
    </button>
  )
}
