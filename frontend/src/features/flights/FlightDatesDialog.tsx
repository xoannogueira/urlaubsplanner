import clsx from 'clsx'
import { useEffect, useRef } from 'react'
import { ApiError } from '../../api/client'
import { useFlightAlternatives, type FlightAlternativesParams } from '../../api/flights'
import { Dialog } from '../../components/ui/Dialog'
import { ErrorState, Skeleton } from '../../components/ui/Feedback'
import { formatEuro, formatShortDate } from '../../lib/format'
import { shiftLabel } from '../../lib/hotels'

const MAX_SHIFT_DAYS = 3

interface FlightDatesDialogProps {
  open: boolean
  onClose: () => void
  /** Strecken der günstigsten Verbindung mit den aktuellen Reisedaten. */
  params: Omit<FlightAlternativesParams, 'shiftDays'> | null
  currentPrice: number | null
  /** Zeitraum übernehmen: alle Daten um so viele Tage verschieben und neu suchen. */
  onPick: (shiftDays: number) => void
}

/**
 * Preisleiste wie bei Google Flights: dieselben Strecken, alle Flüge gemeinsam ±1–3 Tage verschoben
 * (gleiche Reisedauer). Kostet eine Abfrage pro Zeitraum – also höchstens 6.
 */
export function FlightDatesDialog(props: FlightDatesDialogProps) {
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="Andere Daten prüfen"
      description={`Gleiche Strecke und Reisedauer, bis zu ${MAX_SHIFT_DAYS} Tage früher oder später.`}
      width="lg"
    >
      {props.open && props.params && <Body {...props} params={props.params} />}
    </Dialog>
  )
}

function Body({
  params,
  currentPrice,
  onPick,
  onClose,
}: FlightDatesDialogProps & { params: NonNullable<FlightDatesDialogProps['params']> }) {
  const alternatives = useFlightAlternatives()
  const { mutate } = alternatives
  const started = useRef(false)

  useEffect(() => {
    if (!started.current) {
      started.current = true
      mutate({ ...params, shiftDays: MAX_SHIFT_DAYS })
    }
  }, [mutate, params])

  if (alternatives.error) {
    return (
      <ErrorState
        message={alternatives.error instanceof ApiError ? alternatives.error.message : 'Prüfung fehlgeschlagen.'}
        onRetry={() => mutate({ ...params, shiftDays: MAX_SHIFT_DAYS })}
      />
    )
  }

  if (!alternatives.data) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <p className="text-sm text-muted">Prüfe bis zu {MAX_SHIFT_DAYS * 2} Zeiträume – das dauert ein paar Sekunden …</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    )
  }

  const windows = [
    ...alternatives.data.windows,
    { shiftDays: 0, dates: params.legs.map((l) => l.date), cheapestPrice: currentPrice, count: 0, failed: false },
  ].sort((a, b) => a.shiftDays - b.shiftDays)
  const prices = windows.map((w) => w.cheapestPrice).filter((p): p is number => p != null)
  const best = prices.length > 0 ? Math.min(...prices) : null

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Preise nach Reisedaten">
        {windows.map((w) => {
          const current = w.shiftDays === 0
          const cheapest = w.cheapestPrice != null && w.cheapestPrice === best
          const diff = w.cheapestPrice != null && currentPrice != null && !current ? w.cheapestPrice - currentPrice : null
          return (
            <li key={w.shiftDays}>
              <button
                type="button"
                disabled={current || w.cheapestPrice == null}
                onClick={() => {
                  onPick(w.shiftDays)
                  onClose()
                }}
                className={clsx(
                  'flex h-full w-full flex-col items-start gap-1 rounded-xl border p-3 text-left enabled:cursor-pointer',
                  current
                    ? 'border-accent bg-accent-soft'
                    : cheapest
                      ? 'border-accent enabled:hover:bg-accent-soft'
                      : 'border-line enabled:hover:bg-surface-2',
                  w.cheapestPrice == null && !current && 'opacity-60',
                )}
              >
                <span className="text-xs font-bold text-muted">{current ? 'Deine Daten' : shiftLabel(w.shiftDays)}</span>
                <span className="text-[13px] font-semibold">
                  {formatShortDate(w.dates[0])}
                  {w.dates.length > 1 && ` – ${formatShortDate(w.dates[w.dates.length - 1])}`}
                </span>
                <span className="font-mono font-semibold">
                  {w.failed ? 'Fehler' : w.cheapestPrice == null ? 'keine Flüge' : `ab ${formatEuro(Math.round(w.cheapestPrice))}`}
                </span>
                {diff != null && Math.abs(diff) >= 1 && (
                  <span className={clsx('text-xs font-semibold', diff < 0 ? 'text-accent' : 'text-star')}>
                    {diff < 0 ? `${formatEuro(Math.round(-diff))} günstiger` : `${formatEuro(Math.round(diff))} teurer`}
                  </span>
                )}
                {cheapest && <span className="text-[11px] font-bold uppercase tracking-wide text-accent">Günstigster</span>}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted">
        Geprüft wurde die Strecke der günstigsten Verbindung. Ein Klick auf einen Zeitraum übernimmt die Daten und sucht mit allen gewählten
        Flughäfen neu.
      </p>
    </div>
  )
}
