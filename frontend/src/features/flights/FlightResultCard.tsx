import clsx from 'clsx'
import { Backpack, Briefcase, Check, ChevronDown, ChevronUp, ExternalLink, Heart, Plane, RefreshCcw, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { ApiError } from '../../api/client'
import { useFlightContinue, type FlightFare, type FlightJourney, type FlightJourneyLeg } from '../../api/flights'
import { buttonClass } from '../../components/ui/buttonStyles'
import { ErrorState, Skeleton } from '../../components/ui/Feedback'
import { formatEuro, formatShortDate } from '../../lib/format'
import {
  fareSummary,
  formatClock,
  formatDuration,
  legMatchesTimes,
  rateFlights,
  stopsLabel,
  type FlightFilters,
  type FlightRating,
  type FlightSort,
  type TimeValue,
} from '../../lib/flights'

interface SaveProps {
  adults: number
  legNames: string[]
  /** Kennungen gemerkter Flüge (ohne Tarif) */
  savedSignatures: Set<string>
  savingId: string | null
  onSave: (journey: FlightJourney, fare: FlightFare) => void
  /** Filter, Sortierung und Zeitwert – gelten auch für die nachgeladenen Rückflüge */
  filters?: FlightFilters
  sort?: FlightSort
  timeValue?: TimeValue
}

interface FlightResultCardProps extends SaveProps {
  journey: FlightJourney
  /** Vorausgewählter Tarif (z. B. günstigster mit Koffer, wenn der Filter an ist). */
  initialFare: FlightFare
  selected: boolean
  onSelect: () => void
  /** Bewertung im Vergleich zu den anderen Treffern (Beste Wahl, Günstigster, Schnellster) */
  rating?: FlightRating | null
}

export function FlightResultCard(props: FlightResultCardProps) {
  return props.journey.continuation ? <PartialCard {...props} continuation={props.journey.continuation} /> : <FullCard {...props} />
}

function FullCard({
  journey,
  initialFare,
  adults,
  legNames,
  savedSignatures,
  savingId,
  selected,
  onSelect,
  onSave,
  rating,
}: FlightResultCardProps) {
  const [fare, setFare] = useState(initialFare)
  const saved = savedSignatures.has(journey.signature)
  const saving = savingId === journey.signature
  const fareChoice = journey.fares.length > 1 || fare.checkedBags != null

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
      <RatingBadges rating={rating} />
      <div className="flex flex-col gap-3">
        {journey.legs.map((leg, i) => (
          <LegRow key={i} leg={leg} name={legNames[i] ?? `Strecke ${i + 1}`} />
        ))}
      </div>

      {fareChoice && (
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
                {(f.checkedBags ?? 0) > 0 ? <Briefcase size={14} /> : <Backpack size={14} />}
                {f.family}
                <span className="font-mono">{formatEuro(Math.round(f.totalPrice))}</span>
              </button>
            )
          })}
        </div>
      )}

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
        <PriceBlock price={fare.totalPrice} perAdult={fare.pricePerAdult} adults={adults} minutes={journey.totalMinutes} />
        <div className="flex flex-wrap items-center gap-2">
          <BookingLinks journey={journey} />
          <SaveButton saved={saved} saving={saving} onSave={() => onSave(journey, fare)} />
        </div>
      </div>
    </article>
  )
}

/**
 * Hinflug von Google Flights: Preis = günstigster Gesamtpreis mit diesem Hinflug. Die Rückflüge kosten eine weitere
 * Google-Suche und werden deshalb erst auf Klick geladen.
 */
function PartialCard({
  journey,
  continuation,
  adults,
  legNames,
  savedSignatures,
  savingId,
  selected,
  onSelect,
  onSave,
  rating,
  filters,
  sort,
  timeValue,
}: FlightResultCardProps & { continuation: string }) {
  const [open, setOpen] = useState(false)
  const nextName = legNames[journey.legs.length] ?? `Strecke ${journey.legs.length + 1}`
  const savedHere = [...savedSignatures].some((s) => s.startsWith(`${journey.signature}|`))

  return (
    <article
      data-flight-id={journey.signature}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button, a, [data-next-legs]')) onSelect()
      }}
      className={clsx(
        'flex scroll-m-4 cursor-pointer flex-col gap-3 rounded-2xl border bg-surface p-4 transition-[border-color,box-shadow] duration-100',
        selected ? 'border-accent shadow-[0_0_0_3px_var(--accent)]' : 'border-line hover:border-muted/50',
      )}
    >
      <RatingBadges rating={rating} />
      <div className="flex flex-col gap-3">
        {journey.legs.map((leg, i) => (
          <LegRow key={i} leg={leg} name={legNames[i] ?? `Strecke ${i + 1}`} />
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line pt-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold text-muted">Gesamt mit {nextName} ab</span>
          <span className="font-mono text-lg font-semibold">{formatEuro(journey.totalPrice)}</span>
          <span className="text-xs text-muted">
            {adults === 1 ? 'für 1 Person' : `${formatEuro(journey.fares[0].pricePerAdult)} p. P. × ${adults}`}
            {savedHere && <span className="ml-2 font-semibold text-accent">· mit einem {nextName} gemerkt</span>}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={journey.googleUrl} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'sm')}>
            Google
            <ExternalLink size={14} />
          </a>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={buttonClass(open ? 'secondary' : 'primary', 'sm')}
            title="Lädt die passenden Flüge – kostet eine Google-Suche (danach eine Stunde gespeichert)"
          >
            {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            {nextName} wählen
          </button>
        </div>
      </div>

      {open && (
        <NextLegs
          continuation={continuation}
          known={journey.legs.length}
          adults={adults}
          legNames={legNames}
          savedSignatures={savedSignatures}
          savingId={savingId}
          onSave={onSave}
          filters={filters}
          sort={sort}
          timeValue={timeValue}
        />
      )}
    </article>
  )
}

/** Passende Flüge für die nächste Strecke; jeder ergibt mit den gewählten eine vollständige Verbindung. */
function NextLegs({ continuation, known, ...save }: SaveProps & { continuation: string; known: number }) {
  const next = useFlightContinue(continuation)
  const name = save.legNames[known] ?? `Strecke ${known + 1}`
  const plural = name.endsWith('flug') ? `${name.slice(0, -4)}flüge` : name

  if (next.isPending) {
    return (
      <div data-next-legs className="flex flex-col gap-2" aria-busy="true">
        <p className="text-sm text-muted">{plural} werden geladen …</p>
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    )
  }
  if (next.error) {
    return (
      <div data-next-legs>
        <ErrorState
          message={next.error instanceof ApiError ? next.error.message : 'Fehler beim Laden.'}
          onRetry={() => void next.refetch()}
        />
      </div>
    )
  }
  const all = next.data.journeys
  const journeys = all.filter(
    (j) => (!save.filters || legMatchesTimes(j.legs[known], known, save.filters)) && !(save.filters?.nonstop && j.legs[known].stops > 0),
  )
  const items = journeys.map((j) => ({ journey: j, fare: j.fares[0] }))
  const ratings = rateFlights(items, save.timeValue)
  if (save.sort === 'best') journeys.sort((a, b) => ratings.get(a.signature)!.score - ratings.get(b.signature)!.score)
  if (journeys.length === 0) {
    return (
      <p data-next-legs className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-muted">
        {all.length > 0
          ? `${all.length} ${plural} passen nicht zu deinen Filtern (Uhrzeiten, Direktflug).`
          : `Keine passenden ${plural} gefunden – probier einen anderen Hinflug.`}
      </p>
    )
  }

  return (
    <ul data-next-legs className="flex flex-col gap-2" aria-label={plural}>
      {journeys.map((j) => (
        <li key={j.signature} className="flex flex-col gap-3 rounded-xl bg-surface-2 p-3.5">
          {journeys.length > 1 && <RatingBadges rating={ratings.get(j.signature)} />}
          <LegRow leg={j.legs[known]} name={name} />
          {j.continuation ? (
            <NextStep journey={j} known={known + 1} {...save} />
          ) : (
            <div className="flex flex-wrap items-end justify-between gap-3">
              <PriceBlock price={j.fares[0].totalPrice} perAdult={j.fares[0].pricePerAdult} adults={save.adults} minutes={j.totalMinutes} />
              <div className="flex flex-wrap items-center gap-2">
                <BookingLinks journey={j} />
                <SaveButton
                  saved={save.savedSignatures.has(j.signature)}
                  saving={save.savingId === j.signature}
                  onSave={() => save.onSave(j, j.fares[0])}
                />
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Mehr als zwei Strecken: weiter zur nächsten. */
function NextStep({ journey, known, ...save }: SaveProps & { journey: FlightJourney; known: number }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)} className={buttonClass('secondary', 'sm', 'self-start')}>
        Weiter ab {formatEuro(journey.totalPrice)}
      </button>
      {open && <NextLegs continuation={journey.continuation!} known={known} {...save} />}
    </>
  )
}

function PriceBlock({ price, perAdult, adults, minutes }: { price: number; perAdult: number; adults: number; minutes: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-lg font-semibold">{formatEuro(price)}</span>
      <span className="text-xs text-muted">
        {adults === 1 ? 'für 1 Person' : `${formatEuro(perAdult)} p. P. × ${adults}`} · {formatDuration(minutes)} Flugzeit
      </span>
    </div>
  )
}

function BookingLinks({ journey }: { journey: FlightJourney }) {
  return (
    <>
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
    </>
  )
}

function SaveButton({ saved, saving, onSave }: { saved: boolean; saving: boolean; onSave: () => void }) {
  return saved ? (
    <span className={buttonClass('secondary', 'sm', 'cursor-default border-accent text-accent')}>
      <Check size={15} strokeWidth={3} />
      Gemerkt
    </span>
  ) : (
    <button type="button" onClick={onSave} disabled={saving} className={buttonClass('primary', 'sm')}>
      <Heart size={15} />
      Merken
    </button>
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

/** „Beste Wahl“, „Günstigster“, „Schnellster“ – mit kurzer Begründung bei der besten Wahl. */
function RatingBadges({ rating }: { rating?: FlightRating | null }) {
  if (!rating || !(rating.best || rating.cheapest || rating.fastest)) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {rating.best && (
        <span className="flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-accent-ink">
          <Sparkles size={12} />
          Beste Wahl
        </span>
      )}
      {rating.cheapest && <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-bold">Günstigster</span>}
      {rating.fastest && <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-bold">Schnellster</span>}
      {rating.note && <span className="text-xs text-muted">{rating.note}</span>}
    </div>
  )
}
