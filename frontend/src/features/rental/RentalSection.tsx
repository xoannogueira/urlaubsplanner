import { Car, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTripActions } from '../../api/trips'
import type { Trip, TripOption } from '../../api/types'
import { Button, IconButton } from '../../components/ui/Button'
import { formatEuro, formatShortDate } from '../../lib/format'
import { isRentalCar, statusLabels } from '../../lib/options'
import { parseRental } from '../../lib/rental'
import { RentalDialog } from './RentalDialog'

/** Mietwagen im Tab „Transfers“: eingetragene Wagen und ein Knopf für einen neuen. */
export function RentalSection({ trip }: { trip: Trip }) {
  const actions = useTripActions(trip.id)
  const [dialog, setDialog] = useState<{ option?: TripOption } | null>(null)
  const rentals = trip.options.filter(isRentalCar)

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4" aria-labelledby="mietwagen">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Car size={20} />
          </span>
          <div className="flex flex-col">
            <h2 id="mietwagen" className="font-extrabold">
              Mietwagen
            </h2>
            <span className="text-[13px] text-muted">Abholung & Rückgabe eintragen, Preise auf Vergleichsportalen prüfen</span>
          </div>
        </div>
        <Button size="sm" variant={rentals.length === 0 ? 'primary' : undefined} icon={<Plus size={16} />} onClick={() => setDialog({})}>
          Mietwagen
        </Button>
      </div>
      {rentals.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rentals.map((o) => {
            const d = parseRental(o)
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-bold">{o.title}</span>
                  <span className="text-[13px] text-muted">
                    {d.pickupDate && formatShortDate(d.pickupDate)} {d.pickupTime} – {d.returnDate && formatShortDate(d.returnDate)}{' '}
                    {d.returnTime}
                    {d.returnPlace && d.returnPlace !== d.pickupPlace ? ` · Rückgabe ${d.returnPlace}` : ''}
                  </span>
                </span>
                <span className="text-xs font-semibold text-muted">{statusLabels[o.status]}</span>
                <span className="w-20 text-right font-mono font-semibold">{o.price != null ? formatEuro(o.price) : '–'}</span>
                <IconButton label={`${o.title} bearbeiten`} className="size-8" onClick={() => setDialog({ option: o })}>
                  <Pencil size={14} />
                </IconButton>
              </li>
            )
          })}
        </ul>
      )}
      <RentalDialog
        open={dialog !== null}
        trip={trip}
        option={dialog?.option}
        onClose={() => setDialog(null)}
        onSubmit={(input) =>
          dialog?.option ? actions.updateOption.mutateAsync({ id: dialog.option.id, input }) : actions.addOption.mutateAsync(input)
        }
      />
    </section>
  )
}
