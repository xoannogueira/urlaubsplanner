import { Check, Save } from 'lucide-react'
import { useState } from 'react'
import { useAirportLookup, type Airport } from '../../api/airports'
import { useSearchDefaults, useSetSearchDefaults } from '../../api/app'
import type { SearchSettings } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Feedback'
import { AirportPicker } from '../flights/AirportPicker'

/** Vorgaben, die jede neue Reise übernimmt (pro Reise änderbar mit „Als Standard merken“ in der jeweiligen Suche). */
export function SearchDefaultsSection() {
  const defaults = useSearchDefaults()
  const codes = defaults.data?.homeAirports ?? []
  const airports = useAirportLookup(codes)
  if (defaults.isPending || (codes.length > 0 && airports.isPending)) return <Skeleton className="h-48" />
  const initial = codes.map((c) => airports.data?.find((a) => a.code === c)).filter((a): a is Airport => !!a)
  return <Form key={codes.join(',')} settings={defaults.data ?? {}} initialAirports={initial} />
}

function Form({ settings, initialAirports }: { settings: SearchSettings; initialAirports: Airport[] }) {
  const save = useSetSearchDefaults()
  const [home, setHome] = useState<Airport[]>(initialAirports)
  const [rooms, setRooms] = useState(settings.hotelRooms != null ? String(settings.hotelRooms) : '')
  const [nonstop, setNonstop] = useState(settings.nonstop ?? false)
  const [withBag, setWithBag] = useState(settings.withBag ?? false)
  const [cabin, setCabin] = useState(settings.cabin ?? 'Economy')
  const [saved, setSaved] = useState(false)

  const submit = () => {
    setSaved(false)
    save.mutate(
      { ...settings, homeAirports: home.map((a) => a.code), hotelRooms: rooms ? Number(rooms) : null, nonstop, withBag, cabin },
      { onSuccess: () => setSaved(true) },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <AirportPicker label="Heimatflughafen" value={home} onChange={setHome} placeholder="z. B. Stuttgart" />
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-muted">Klasse</span>
          <select
            value={cabin}
            onChange={(e) => setCabin(e.target.value)}
            className="h-11 rounded-xl border border-line bg-surface-2 px-3 text-[15px]"
          >
            <option value="Economy">Economy</option>
            <option value="PremiumEconomy">Premium Economy</option>
            <option value="Business">Business</option>
            <option value="First">First</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-muted">Hotelzimmer</span>
          <select
            value={rooms}
            onChange={(e) => setRooms(e.target.value)}
            className="h-11 rounded-xl border border-line bg-surface-2 px-3 text-[15px]"
          >
            <option value="">automatisch</option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-11 cursor-pointer items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={nonstop} onChange={(e) => setNonstop(e.target.checked)} className="size-4" />
          Nur Direktflüge
        </label>
        <label className="flex h-11 cursor-pointer items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={withBag} onChange={(e) => setWithBag(e.target.checked)} className="size-4" />
          Mit Koffer
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="primary"
          icon={saved ? <Check size={15} /> : <Save size={15} />}
          onClick={submit}
          disabled={save.isPending}
        >
          {saved ? 'Gespeichert' : 'Speichern'}
        </Button>
        {save.error && <span className="text-sm text-danger">{save.error.message}</span>}
      </div>
    </div>
  )
}
