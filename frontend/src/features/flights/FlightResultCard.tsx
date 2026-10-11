import clsx from 'clsx'
import { Backpack, Briefcase, Check, ExternalLink, Heart, Plane, RefreshCcw } from 'lucide-react'
import { useState } from 'react'
import type { FlightFare, FlightJourney, FlightJourneyLeg } from '../../api/flights'
import { buttonClass } from '../../components/ui/buttonStyles'
import { formatEuro, formatShortDate } from '../../lib/format'
import { fareSummary, formatClock, formatDuration, stopsLabel } from '../../lib/flights'

interface FlightResultCardProps {
  journey: FlightJourney
  /** Vorausgewählter Tarif (z. B. günstigster mit Koffer, wenn der Filter an ist). */
  initialFare: FlightFare
  adults: number
  legNames: string[]
  saved: boolean
  saving: boolean
  selected: boolean
  onSelect: () => void
  onSave: (fare: FlightFare) => void
}

export function FlightResultCard({
  journey,
  initialFare,
  adults,
  legNames,
  saved,
  saving,
  selected,
  onSelect,
  onSave,
}: FlightResultCardProps) {
  const [fare, setFare] = useState(initialFare)

  return (
    <article
      data-flight-id={journey.signature}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button, a')) onSelect()
      }}
      className={clsx(
        'flex scroll-m-4 cursor-pointer flex-col gap-3 rounded-2xl border bg-surface p-4 transition-[border-color,box-shadow] duration-100',
        selected ? 'border-accent shadow-[0_0_0_3px_var(--accent)]' : 'border-line hover:border-muted/50',
      )}
    >
      <div className="flex flex-col gap-3">
        {journey.legs.map((leg, i) => (
          <LegRow key={i} leg={leg} name={legNames[i] ?? `Strecke ${i + 1}`} />
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tarif">
        {journey.fares.map((f) => {
          const active = f.family === fare.family
          return (
            <button
              key={f.family}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setFare(f)}
              className={clsx(
                'flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-semibold',
                active ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:bg-surface-2',
              )}
            >
              {f.checkedBags > 0 ? <Briefcase size={14} /> : <Backpack size={14} />}
              {f.family}
              <span className="font-mono">{formatEuro(Math.round(f.totalPrice))}</span>
            </button>
          )
        })}
      </div>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>{fareSummary(fare)}</span>
        {fare.refundable && (
          <span className="flex items-center gap-1 font-semibold text-accent">
            <Check size={12} strokeWidth={3} />
            Erstattbar
          </span>
        )}
        {fare.changeable && !fare.refundable && (
          <span className="flex items-center gap-1">
            <RefreshCcw size={12} />
            Umbuchbar
          </span>
        )}
        {fare.seatsRemaining != null && fare.seatsRemaining <= 4 && (
          <span className="font-semibold text-star">Nur noch {fare.seatsRemaining} Plätze</span>
        )}
      </p>

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line pt-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-lg font-semibold">{formatEuro(fare.totalPrice)}</span>
          <span className="text-xs text-muted">
            {adults === 1 ? 'für 1 Person' : `${formatEuro(fare.pricePerAdult)} p. P. × ${adults}`} · {formatDuration(journey.totalMinutes)}{' '}
            Flugzeit
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={journey.bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Kayak vergleicht Airlines und Portale – Strecken, Daten und Personen sind übernommen"
            className={buttonClass('secondary', 'sm')}
          >
            Kayak
            <ExternalLink size={14} />
          </a>
          <a href={journey.googleUrl} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'sm')}>
            Google
            <ExternalLink size={14} />
          </a>
          {saved ? (
            <span className={buttonClass('secondary', 'sm', 'cursor-default border-accent text-accent')}>
              <Check size={15} strokeWidth={3} />
              Gemerkt
            </span>
          ) : (
            <button type="button" onClick={() => onSave(fare)} disabled={saving} className={buttonClass('primary', 'sm')}>
              <Heart size={15} />
              Merken
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

function LegRow({ leg, name }: { leg: FlightJourneyLeg; name: string }) {
  const carriers = [...new Map(leg.segments.map((s) => [s.carrierCode, s])).values()]
  const logo = carriers[0]?.carrierLogo

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-bold uppercase tracking-wide text-muted">
        {name} · {formatShortDate(leg.departure.slice(0, 10))}
      </span>
      <div className="flex items-center gap-3">
        <AirlineLogo url={logo} name={carriers[0]?.carrierName ?? carriers[0]?.carrierCode ?? ''} />
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex flex-col">
            <span className="font-mono text-lg font-semibold leading-tight">{formatClock(leg.departure)}</span>
            <span className="font-mono text-xs font-bold text-muted">{leg.origin}</span>
          </div>
          <div className="flex min-w-16 flex-1 flex-col items-center gap-0.5">
            <span className="text-xs text-muted">{formatDuration(leg.durationMinutes)}</span>
            <span className="relative h-px w-full bg-line">
              {leg.segments.slice(1).map((_, i) => (
                <span
                  key={i}
                  className="absolute top-1/2 size-2 -translate-1/2 rounded-full border border-star bg-surface"
                  style={{ left: `${((i + 1) / leg.segments.length) * 100}%` }}
                />
              ))}
            </span>
            <span className={clsx('text-xs', leg.stops === 0 ? 'font-semibold text-accent' : 'text-star')}>{stopsLabel(leg)}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="font-mono text-lg font-semibold leading-tight">
              {formatClock(leg.arrival)}
              {leg.dayChange > 0 && <sup className="ml-0.5 text-[11px] text-star">+{leg.dayChange}</sup>}
            </span>
            <span className="font-mono text-xs font-bold text-muted">{leg.destination}</span>
          </div>
        </div>
      </div>
      <span className="truncate text-xs text-muted">
        {carriers.map((c) => c.carrierName ?? c.carrierCode).join(', ')} ·{' '}
        {leg.segments.map((s) => s.carrierCode + s.flightNumber).join(' + ')}
      </span>
    </div>
  )
}

function AirlineLogo({ url, name }: { url: string | null | undefined; name: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white" title={name}>
      {url && !failed ? (
        <img
          src={url}
          alt={name}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-8 object-contain"
        />
      ) : (
        <Plane size={18} className="text-slate-500" />
      )}
    </span>
  )
}
