import { BellRing, BellOff, ExternalLink, TrendingDown } from 'lucide-react'
import { ApiError } from '../../api/client'
import { MAX_PRICE_WATCHES, usePriceWatchActions, usePriceWatches } from '../../api/priceWatches'
import { useTripActions } from '../../api/trips'
import type { Trip, TripOption } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { buttonClass } from '../../components/ui/buttonStyles'
import { formatEuro, formatRelative } from '../../lib/format'
import { googleFlightsUrl } from '../../lib/googleFlights'
import { optionToInput } from '../../lib/options'

/**
 * Preisalarm für einen gemerkten Flug: Link zu Google Flights („Preise beobachten“ per Mail) und der eigene
 * Preiswächter der App (höchstens 3 Flüge, einmal am Tag, solange die App läuft).
 */
export function PriceWatchControl({ trip, option }: { trip: Trip; option: TripOption }) {
  const watches = usePriceWatches()
  const { watch, unwatch, seen } = usePriceWatchActions()
  const actions = useTripActions(trip.id)
  const current = watches.data?.find((w) => w.optionId === option.id)
  const full = (watches.data?.length ?? 0) >= MAX_PRICE_WATCHES && !current
  const google = googleFlightsUrl(option.externalId, Math.min(trip.travelers, 9))
  const error = watch.error instanceof ApiError ? watch.error.message : null

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface-2/60 px-3 py-2.5 text-[13px]">
      {current?.dropFrom != null && current.lastPrice != null && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg bg-accent-soft px-2.5 py-2 font-semibold text-accent">
          <TrendingDown size={15} />
          Preis gefallen: {formatEuro(current.dropFrom)} → {formatEuro(current.lastPrice)}
          <span className="flex-1" />
          {option.totalPrice !== current.lastPrice && (
            <Button
              size="sm"
              onClick={() =>
                actions.updateOption.mutate(
                  { id: option.id, input: { ...optionToInput(option), price: current.lastPrice, pricePerPerson: false } },
                  { onSuccess: () => seen.mutate(option.id) },
                )
              }
            >
              Preis übernehmen
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => seen.mutate(option.id)}>
            OK
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {current ? (
          <>
            <span className="flex items-center gap-1.5 font-semibold text-accent">
              <BellRing size={14} />
              Preis wird beobachtet
            </span>
            <span className="text-muted">
              {current.unavailable
                ? '· zuletzt nicht mehr buchbar'
                : current.checkedAt
                  ? `· geprüft ${formatRelative(current.checkedAt)}${current.lastPrice != null ? `: ${formatEuro(current.lastPrice)}` : ''}`
                  : '· erste Prüfung in Kürze (solange die App offen ist)'}
              {current.problem ? ` · ${current.problem}` : ''}
            </span>
            <button type="button" onClick={() => unwatch.mutate(option.id)} className={buttonClass('ghost', 'sm', '-my-1')}>
              <BellOff size={14} />
              Beenden
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={full || watch.isPending}
            title={
              full
                ? `Höchstens ${MAX_PRICE_WATCHES} Flüge – jede Prüfung kostet eine Google-Suche`
                : 'Die App prüft den Preis einmal am Tag, solange sie offen ist (kostet je eine Google-Suche)'
            }
            onClick={() => watch.mutate({ tripId: trip.id, optionId: option.id })}
            className={buttonClass('ghost', 'sm', '-mx-2 w-fit disabled:opacity-50')}
          >
            <BellRing size={14} />
            {full ? `Preis beobachten (max. ${MAX_PRICE_WATCHES})` : 'Preis beobachten'}
          </button>
        )}
        <span className="flex-1" />
        {google && (
          <a
            href={google}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass('ghost', 'sm', '-my-1')}
            title="Öffnet Google Flights mit diesem Flug – dort „Preise beobachten“ anklicken, dann schickt Google Mails"
          >
            Preisalarm bei Google
            <ExternalLink size={13} />
          </a>
        )}
      </div>
      {error && <span className="text-danger">{error}</span>}
    </div>
  )
}
