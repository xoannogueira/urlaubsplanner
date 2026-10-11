import clsx from 'clsx'
import { CircleCheck, CircleX, RefreshCw } from 'lucide-react'
import { ApiError } from '../../api/client'
import { useFlightRecheck } from '../../api/flights'
import { useTripActions } from '../../api/trips'
import type { Trip, TripOption } from '../../api/types'
import { buttonClass } from '../../components/ui/buttonStyles'
import { formatEuro } from '../../lib/format'
import { optionToInput } from '../../lib/options'

/**
 * „Verfügbarkeit & Preis prüfen“ für einen gemerkten Flug: gibt es genau diese Flüge noch, und was kostet
 * der gemerkte Tarif jetzt? Eine Abfrage.
 */
export function FlightRecheck({ trip, option }: { trip: Trip; option: TripOption }) {
  const recheck = useFlightRecheck()
  const actions = useTripActions(trip.id)
  const adults = Math.min(trip.travelers, 9)

  const check = () =>
    recheck.mutate(
      { signature: option.externalId!, adults, cabin: 'Economy' },
      {
        onSuccess: (result) => {
          // Gleicher Preis: nur „geprüft“ aktualisieren.
          if (result.fare && result.fare.totalPrice === option.totalPrice)
            actions.confirmPrice.mutate({ id: option.id, price: result.fare.totalPrice })
        },
      },
    )

  const fare = recheck.data?.fare
  const diff = fare && option.totalPrice != null ? fare.totalPrice - option.totalPrice : null
  const priceTaken = fare != null && option.totalPrice === fare.totalPrice

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface-2/60 px-3 py-2.5 text-[13px]">
      {recheck.isIdle ? (
        <button type="button" onClick={check} className={buttonClass('ghost', 'sm', '-mx-2 w-fit')}>
          <RefreshCw size={14} />
          Verfügbarkeit & Preis prüfen
        </button>
      ) : recheck.isPending ? (
        <span className="flex items-center gap-2 text-muted" aria-live="polite">
          <RefreshCw size={14} className="animate-spin" />
          Prüfe den Flug …
        </span>
      ) : recheck.error ? (
        <span className="flex flex-wrap items-center gap-2 text-danger">
          {recheck.error instanceof ApiError ? recheck.error.message : 'Prüfung fehlgeschlagen.'}
          <button type="button" onClick={check} className="cursor-pointer font-bold underline">
            Nochmal
          </button>
        </span>
      ) : recheck.data?.available && fare ? (
        <div className="flex flex-wrap items-center justify-between gap-2" aria-live="polite">
          <span className="flex items-center gap-1.5 font-semibold text-accent">
            <CircleCheck size={15} />
            Noch buchbar
            {diff === 0 || priceTaken ? (
              <span className="font-normal text-muted">· Preis unverändert</span>
            ) : (
              <span className={clsx('font-mono', diff != null && diff > 0 ? 'text-danger' : 'text-accent')}>
                · jetzt {formatEuro(fare.totalPrice)}
                {diff != null && ` (${diff > 0 ? '+' : '−'}${formatEuro(Math.abs(diff))})`}
              </span>
            )}
          </span>
          {!priceTaken && diff !== 0 && (
            <button
              type="button"
              disabled={actions.updateOption.isPending}
              onClick={() =>
                actions.updateOption.mutate({
                  id: option.id,
                  input: { ...optionToInput(option), price: fare.totalPrice, pricePerPerson: false },
                })
              }
              className={buttonClass('secondary', 'sm')}
            >
              Preis übernehmen
            </button>
          )}
        </div>
      ) : (
        <span className="flex flex-wrap items-center gap-1.5 font-semibold text-danger" aria-live="polite">
          <CircleX size={15} />
          Dieser Flug ist nicht mehr buchbar
          {recheck.data && recheck.data.alternatives > 0 && recheck.data.cheapestPrice != null && (
            <span className="font-normal text-muted">
              · {recheck.data.alternatives} andere Verbindungen ab {formatEuro(Math.round(recheck.data.cheapestPrice))} – unter „Flüge
              suchen“
            </span>
          )}
        </span>
      )}
    </div>
  )
}
