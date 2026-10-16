import { ExternalLink } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import type { LatLng, OptionInput, OptionStatus, Trip, TripOption } from '../../api/types'
import { PlaceSearchField } from '../../components/PlaceSearchField'
import { Button } from '../../components/ui/Button'
import { DateField } from '../../components/ui/DateField'
import { Dialog } from '../../components/ui/Dialog'
import { FormError, InputField, SelectField, TextAreaField } from '../../components/ui/Field'
import { tripRange } from '../../lib/dates'
import { formatShortDate } from '../../lib/format'
import { toLatLng } from '../../lib/geo'
import { statusLabels } from '../../lib/options'
import { parseRental, rentalLinks, rentalOptionInput, type RentalDetails } from '../../lib/rental'

interface RentalDialogProps {
  open: boolean
  trip: Trip
  option?: TripOption
  onClose: () => void
  onSubmit: (input: OptionInput) => Promise<unknown>
}

/** Mietwagen eintragen: Abholung und Rückgabe (vorausgefüllt aus der Reise), Links zu Vergleichsportalen, Preis von Hand. */
export function RentalDialog(props: RentalDialogProps) {
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title={props.option ? 'Mietwagen bearbeiten' : 'Mietwagen eintragen'}
      description="Vergleichen auf einem Portal, dann Preis und Link hier eintragen. Abholung und Rückgabe erscheinen im Tagesplan und in der PDF."
      width="lg"
    >
      {props.open && <RentalForm key={props.option?.id ?? 'new'} {...props} />}
    </Dialog>
  )
}

function defaults(trip: Trip): RentalDetails {
  const stages = [...trip.stages].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const first = stages[0]
  const range = tripRange(trip)
  return {
    title: '',
    pickupPlace: first?.name ?? '',
    pickupDate: range.start ?? '',
    pickupTime: '10:00',
    returnPlace: '',
    returnDate: range.end ?? '',
    returnTime: '10:00',
    price: null,
    url: null,
    status: 'Favorite',
    stageId: null,
    latitude: first?.latitude ?? null,
    longitude: first?.longitude ?? null,
    note: '',
  }
}

const statuses: OptionStatus[] = ['Favorite', 'Selected', 'Booked']

function RentalForm({ trip, option, onClose, onSubmit }: RentalDialogProps) {
  const [d, setD] = useState<RentalDetails>(() => (option ? parseRental(option) : defaults(trip)))
  const [price, setPrice] = useState(d.price != null ? String(d.price) : '')
  const [otherReturn, setOtherReturn] = useState(d.returnPlace !== '' && d.returnPlace !== d.pickupPlace)
  const [error, setError] = useState<ApiError | null>(null)
  const [pending, setPending] = useState(false)
  const set = (patch: Partial<RentalDetails>) => setD((x) => ({ ...x, ...patch }))
  const range = tripRange(trip)
  const pickupAt: LatLng | null = d.latitude != null && d.longitude != null ? { latitude: d.latitude, longitude: d.longitude } : null
  const near = pickupAt ?? toLatLng(trip.stages[0])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      await onSubmit(
        rentalOptionInput({
          ...d,
          returnPlace: otherReturn ? d.returnPlace : '',
          price: price === '' ? null : Number(price.replace(',', '.')),
          url: d.url || null,
        }),
      )
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
      <div className="flex flex-col gap-2">
        <PlaceSearchField
          label="Abholung"
          value={d.pickupPlace}
          coordinates={pickupAt}
          near={near}
          fillWith="label"
          placeholder="z. B. Flughafen Lissabon"
          onTextChange={(text) => set({ pickupPlace: text, latitude: null, longitude: null })}
          onPick={(place) => set({ pickupPlace: place.label, latitude: place.latitude, longitude: place.longitude })}
          error={fe.locationName}
        />
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <DateField
            label="Datum"
            value={d.pickupDate}
            onValue={(v) => set({ pickupDate: v })}
            min={range.start}
            max={range.end}
            openAt={range.start}
            required
            error={fe.startDate}
          />
          <InputField label="Uhrzeit" type="time" value={d.pickupTime} onChange={(e) => set({ pickupTime: e.target.value })} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={otherReturn} onChange={(e) => setOtherReturn(e.target.checked)} className="size-4" />
          Rückgabe an einem anderen Ort
        </label>
        {otherReturn && (
          <InputField
            label="Rückgabeort"
            value={d.returnPlace}
            onChange={(e) => set({ returnPlace: e.target.value })}
            placeholder="z. B. Porto Flughafen"
          />
        )}
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <DateField
            label="Rückgabe"
            value={d.returnDate}
            onValue={(v) => set({ returnDate: v })}
            min={d.pickupDate || range.start}
            max={range.end}
            openAt={d.pickupDate || range.start}
            required
            error={fe.endDate}
          />
          <InputField label="Uhrzeit" type="time" value={d.returnTime} onChange={(e) => set({ returnTime: e.target.value })} />
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl bg-surface-2 p-3.5">
        <span className="text-sm font-bold">Preise vergleichen</span>
        <span className="text-xs text-muted">
          Dort eintragen: {d.pickupPlace || 'Abholort'}, {d.pickupDate ? formatShortDate(d.pickupDate) : '…'} {d.pickupTime} bis{' '}
          {d.returnDate ? formatShortDate(d.returnDate) : '…'} {d.returnTime}
          {otherReturn && d.returnPlace ? ` (Rückgabe ${d.returnPlace})` : ''}
        </span>
        <div className="flex flex-wrap gap-2">
          {rentalLinks(d.pickupPlace).map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold hover:border-accent"
            >
              {l.label}
              <ExternalLink size={12} />
            </a>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField
          label="Preis gesamt in €"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="z. B. 245"
          pattern="[0-9]+([.,][0-9]{1,2})?"
          error={fe.price}
        />
        <SelectField label="Status" value={d.status} onChange={(e) => set({ status: e.target.value as OptionStatus })}>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {statusLabels[s]}
            </option>
          ))}
        </SelectField>
      </div>
      <InputField
        label="Link zum Angebot"
        type="url"
        inputMode="url"
        value={d.url ?? ''}
        onChange={(e) => set({ url: e.target.value })}
        placeholder="https://…"
        error={fe.url}
      />
      <InputField
        label="Bezeichnung (optional)"
        value={d.title}
        onChange={(e) => set({ title: e.target.value })}
        placeholder={`Mietwagen ${d.pickupPlace}`.trim()}
      />
      <TextAreaField
        label="Notiz (optional)"
        value={d.note}
        onChange={(e) => set({ note: e.target.value })}
        placeholder="z. B. Vollkasko ohne Selbstbeteiligung, Kindersitz"
        rows={2}
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
