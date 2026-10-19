import clsx from 'clsx'
import {
  ArrowRight,
  Bus,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Footprints,
  Heart,
  Check,
  ExternalLink,
  LoaderCircle,
  Plane,
  Search,
  Ship,
  TrainFront,
  TramFront,
  TrainFrontTunnel,
  CircleDot,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { ApiError } from '../../api/client'
import { useTransitPlan, type TransitItinerary, type TransitLeg, type TransitQuery } from '../../api/transit'
import { useTripActions } from '../../api/trips'
import type { LatLng, Trip } from '../../api/types'
import { PlaceSearchField } from '../../components/PlaceSearchField'
import { Button } from '../../components/ui/Button'
import { buttonClass } from '../../components/ui/buttonStyles'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback'
import { DateInput, TimeInput } from '../../components/ui/DateInput'
import { formatEuro, formatShortDate, todayIso } from '../../lib/format'
import { formatDuration } from '../../lib/flights'
import {
  approximateUtc,
  bahnUrl,
  exampleSearchDate,
  shiftItinerary,
  clockAt,
  dateAt,
  googleTransitUrl,
  legLabel,
  modeInfo,
  transfersLabel,
  transitOptionInput,
  visibleLegs,
  type ModeKind,
  type TransitPoint,
  type TransitScope,
} from '../../lib/transit'

export interface TransitSearchDefaults {
  from: TransitPoint | null
  to: TransitPoint | null
  date: string
  hour: number
  minute: number
  arriveBy: boolean
}

interface TransitSearchProps {
  trip: Trip
  scope: TransitScope
  stageId: string | null
  defaults: TransitSearchDefaults
  /** Gleich suchen (z. B. beim Aufklappen eines Transfer-Vorschlags) */
  autoSearch?: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Verbindungen mit Bus & Bahn suchen und merken (Transitous – kostenlos). */
export function TransitSearch({ trip, scope, stageId, defaults, autoSearch = false }: TransitSearchProps) {
  const actions = useTripActions(trip.id)
  const [fromText, setFromText] = useState(defaults.from?.name ?? '')
  const [from, setFrom] = useState<LatLng | null>(defaults.from?.location ?? null)
  const [toText, setToText] = useState(defaults.to?.name ?? '')
  const [to, setTo] = useState<LatLng | null>(defaults.to?.location ?? null)
  const [date, setDate] = useState(defaults.date)
  const [time, setTime] = useState(`${pad(defaults.hour)}:${pad(defaults.minute)}`)
  const [arriveBy, setArriveBy] = useState(defaults.arriveBy)
  const [query, setQuery] = useState<TransitQuery | null>(() => (autoSearch ? build() : null))
  // Wofür zuletzt gesucht wurde – für die Ersatzsuche, wenn der Fahrplan für das Datum noch fehlt.
  const [searched, setSearched] = useState(() => (autoSearch ? { date, time, arriveBy } : null))
  const [savingId, setSavingId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const plan = useTransitPlan(query)
  const noResult = !!query && !query.cursor && plan.data?.itineraries.length === 0
  const exampleDate = noResult && searched ? exampleSearchDate(searched.date, todayIso()) : null
  const exampleQuery = useMemo<TransitQuery | null>(() => {
    if (!exampleDate || !query || !searched) return null
    const [h, m] = searched.time.split(':').map(Number)
    return { ...query, time: approximateUtc(exampleDate, h, m, searched.arriveBy ? query.to : query.from), cursor: null }
  }, [exampleDate, query, searched])
  const example = useTransitPlan(exampleQuery)

  function build(): TransitQuery | null {
    if (!from || !to || !date || !time) return null
    const [h, m] = time.split(':').map(Number)
    return { from, to, time: approximateUtc(date, h, m, arriveBy ? to : from), arriveBy, cursor: null }
  }

  const problem = !from ? 'Wähle einen Startort aus der Liste.' : !to ? 'Wähle ein Ziel aus der Liste.' : !date ? 'Datum fehlt.' : null
  const savedIds = useMemo(() => new Set(trip.options.filter((o) => o.provider === 'transitous').map((o) => o.externalId)), [trip.options])
  const places = from && to ? { fromName: fromText, toName: toText, from, to } : null

  const save = (itinerary: TransitItinerary, isExample = false) => {
    if (!places) return
    const input = transitOptionInput(itinerary, places, scope, stageId, isExample)
    setSavingId(input.externalId ?? null)
    setSaveError(null)
    actions.addOption.mutate(input, {
      onSettled: () => setSavingId(null),
      onError: (e) => setSaveError(e instanceof Error ? e.message : 'Merken hat nicht geklappt.'),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault()
          setQuery(build())
          setSearched({ date, time, arriveBy })
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <PlaceSearchField
            label="Von"
            value={fromText}
            coordinates={from}
            onTextChange={(t) => {
              setFromText(t)
              setFrom(null)
            }}
            onPick={(p) => {
              setFromText(p.name)
              setFrom({ latitude: p.latitude, longitude: p.longitude })
            }}
            near={to}
            placeholder="z. B. Stuttgart Hbf"
          />
          <PlaceSearchField
            label="Nach"
            value={toText}
            coordinates={to}
            onTextChange={(t) => {
              setToText(t)
              setTo(null)
            }}
            onPick={(p) => {
              setToText(p.name)
              setTo({ latitude: p.latitude, longitude: p.longitude })
            }}
            near={from}
            placeholder="z. B. Hotel oder Bahnhof"
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-muted">Datum</span>
            <DateInput label="Datum" value={date} onValue={setDate} className="w-44" />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-muted">Uhrzeit</span>
            <div className="flex items-center gap-2">
              <div role="radiogroup" aria-label="Abfahrt oder Ankunft" className="flex rounded-xl bg-surface-2 p-1">
                <Toggle active={!arriveBy} onClick={() => setArriveBy(false)}>
                  Abfahrt ab
                </Toggle>
                <Toggle active={arriveBy} onClick={() => setArriveBy(true)}>
                  Ankunft bis
                </Toggle>
              </div>
              <TimeInput label="Uhrzeit" value={time} onValue={setTime} className="w-24" />
            </div>
          </div>
          <Button type="submit" variant="primary" icon={<Search size={17} />} disabled={!!problem}>
            Verbindungen suchen
          </Button>
          <span className={clsx('text-sm', problem ? 'text-star' : 'text-muted')}>
            {problem ?? 'Kostenlos – zählt nicht zu den Google-Suchen'}
          </span>
        </div>
      </form>

      {saveError && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm">
          {saveError}
        </p>
      )}
      {query && (
        <Results
          query={query}
          plan={plan}
          places={places}
          savedIds={savedIds}
          savingId={savingId}
          scope={scope}
          onSave={save}
          onPage={(cursor) => setQuery({ ...query, cursor })}
          example={exampleDate && searched ? { date: exampleDate, target: searched.date, plan: example } : null}
        />
      )}
    </div>
  )
}

function Results({
  plan,
  places,
  savedIds,
  savingId,
  scope,
  onSave,
  onPage,
  example,
}: {
  query: TransitQuery
  plan: ReturnType<typeof useTransitPlan>
  places: { fromName: string; toName: string; from: LatLng; to: LatLng } | null
  savedIds: Set<string | null>
  savingId: string | null
  scope: TransitScope
  onSave: (i: TransitItinerary, example?: boolean) => void
  onPage: (cursor: string) => void
  /** Ersatzsuche am gleichen Wochentag, wenn der Fahrplan für das Reisedatum noch nicht veröffentlicht ist */
  example: { date: string; target: string; plan: ReturnType<typeof useTransitPlan> } | null
}) {
  const idOf = (it: TransitItinerary) =>
    `${scope}|${it.departure}|${it.legs
      .filter((l) => l.mode !== 'WALK')
      .map(legLabel)
      .join('+')}`
  if (plan.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <p className="flex items-center gap-2 text-sm text-muted">
          <LoaderCircle size={15} className="animate-spin text-accent" />
          Suche Verbindungen …
        </p>
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    )
  }
  if (plan.error) {
    return (
      <ErrorState
        message={plan.error instanceof ApiError ? plan.error.message : 'Fehler bei der Suche.'}
        onRetry={() => void plan.refetch()}
      />
    )
  }
  const data = plan.data!
  return (
    <section aria-label="Verbindungen" className="flex flex-col gap-3">
      {data.itineraries.length === 0 && example && !example.plan.data?.itineraries.length ? (
        example.plan.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <LoaderCircle size={15} className="animate-spin text-accent" />
            Für den {formatShortDate(example.target)} gibt es noch keinen Fahrplan – suche ein Beispiel vom {formatShortDate(example.date)}{' '}
            …
          </p>
        ) : (
          <NoConnection places={places} />
        )
      ) : data.itineraries.length === 0 && example ? (
        <>
          <p role="status" className="flex gap-2.5 rounded-xl border border-star/40 bg-star/10 px-3.5 py-3 text-sm">
            <CalendarClock size={17} className="mt-0.5 shrink-0 text-star" />
            <span>
              <strong>Fahrplan für den {formatShortDate(example.target)} ist noch nicht veröffentlicht.</strong> Offene Fahrpläne reichen
              meist nur bis zum nächsten Fahrplanwechsel (Mitte Dezember). So fährt es aktuell am gleichen Wochentag (
              {formatShortDate(example.date)}) – auf dein Datum übertragen. Die Zeiten ändern sich meist nur wenig; kurz vorher noch einmal
              prüfen.
            </span>
          </p>
          {example.plan.data!.itineraries.map((original) => {
            const it = shiftItinerary(original, example.date, example.target)
            const id = idOf(it)
            return (
              <ItineraryCard
                key={`beispiel-${id}`}
                itinerary={it}
                places={places}
                saved={savedIds.has(id)}
                saving={savingId === id}
                onSave={() => onSave(it, true)}
              />
            )
          })}
        </>
      ) : data.itineraries.length === 0 ? (
        <NoConnection places={places} />
      ) : (
        <>
          {data.earlierCursor && (
            <Button
              size="sm"
              variant="ghost"
              className="self-center"
              onClick={() => onPage(data.earlierCursor!)}
              disabled={plan.isFetching}
            >
              Frühere Verbindungen
            </Button>
          )}
          {data.itineraries.map((it) => {
            const id = idOf(it)
            return (
              <ItineraryCard
                key={`${it.departure}-${id}`}
                itinerary={it}
                places={places}
                saved={savedIds.has(id)}
                saving={savingId === id}
                onSave={() => onSave(it)}
              />
            )
          })}
          {data.laterCursor && (
            <Button size="sm" variant="ghost" className="self-center" onClick={() => onPage(data.laterCursor!)} disabled={plan.isFetching}>
              Spätere Verbindungen
            </Button>
          )}
        </>
      )}
      <p className="text-xs text-muted">
        Fahrpläne aus offenen Daten von{' '}
        <a
          href="https://transitous.org/sources/"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-accent hover:underline"
        >
          Transitous
        </a>{' '}
        und OpenStreetMap. Preise und Tickets beim Anbieter, z. B. über bahn.de.
      </p>
    </section>
  )
}

function NoConnection({ places }: { places: { from: LatLng; to: LatLng } | null }) {
  return (
    <EmptyState
      icon={<TrainFront size={22} />}
      title="Keine Verbindung gefunden"
      text="In den offenen Fahrplandaten ist nichts zu finden. Tipp: Wähle statt eines Ortsnamens einen Bahnhof oder eine Haltestelle (z. B. „Jerez de la Frontera Estación“) – Ortsmitten liegen oft weit vom Bahnhof. In manchen Regionen fehlen Fahrpläne (vor allem Busse); dann hilft Google Maps."
      action={
        places ? (
          <a href={googleTransitUrl(places.from, places.to)} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary')}>
            In Google Maps suchen
            <ExternalLink size={14} />
          </a>
        ) : undefined
      }
    />
  )
}

function ItineraryCard({
  itinerary: it,
  places,
  saved,
  saving,
  onSave,
}: {
  itinerary: TransitItinerary
  places: { fromName: string; toName: string; from: LatLng; to: LatLng } | null
  saved: boolean
  saving: boolean
  onSave: () => void
}) {
  const [open, setOpen] = useState(false)
  const first = it.legs[0]
  const last = it.legs[it.legs.length - 1]
  const legs = visibleLegs(it.legs)
  const depDate = dateAt(it.departure, first.from.timeZone)
  const arrDate = dateAt(it.arrival, last.to.timeZone)
  const transit = it.legs.some((l) => l.mode !== 'WALK')
  // Transitous nennt Start und Ziel bei Koordinaten „START“/„END“ – dann die Namen aus der Suche zeigen.
  const name = (n: string) => (n === 'START' ? (places?.fromName ?? 'Start') : n === 'END' ? (places?.toName ?? 'Ziel') : n)

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-lg font-semibold">{clockAt(it.departure, first.from.timeZone)}</span>
          <ArrowRight size={15} className="self-center text-muted" />
          <span className="font-mono text-lg font-semibold">
            {clockAt(it.arrival, last.to.timeZone)}
            {arrDate !== depDate && <sup className="ml-0.5 text-xs text-star">+1</sup>}
          </span>
          <span className="ml-2 text-sm text-muted">{formatShortDate(depDate)}</span>
        </div>
        <span className="text-sm text-muted">
          {formatDuration(it.durationMinutes)} · {transit ? transfersLabel(it.transfers) : 'nur zu Fuß'}
          {it.fare && it.fare.currency === 'EUR' && (
            <span
              className="ml-2 font-semibold text-text"
              title={`Preis laut Tarifdaten des Verkehrsverbunds, pro Person${it.fare.name ? ` (${it.fare.name})` : ''} – ohne Gewähr`}
            >
              · ca. {formatEuro(it.fare.amount)} p. P.
            </span>
          )}
        </span>
      </div>

      <ol className="flex flex-wrap items-center gap-1.5" aria-label="Abschnitte">
        {legs.map((leg, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-muted">›</span>}
            <LegChip leg={leg} />
          </li>
        ))}
      </ol>

      {open && (
        <ol className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3 text-sm">
          {legs.map((leg, i) => (
            <li key={i} className="grid grid-cols-[52px_1fr] gap-x-3 gap-y-0.5">
              <span className="font-mono font-semibold">{clockAt(leg.from.time, leg.from.timeZone)}</span>
              <span>
                {name(leg.from.name)}
                {leg.from.track && <span className="text-muted"> · Gleis {leg.from.track}</span>}
              </span>
              <span />
              <span className="flex flex-wrap items-center gap-1.5 text-muted">
                <ModeIcon kind={modeInfo(leg.mode).kind} />
                {modeInfo(leg.mode).kind === 'walk'
                  ? `${formatDuration(leg.durationMinutes)} zu Fuß${leg.distanceMeters ? ` (${(leg.distanceMeters / 1000).toFixed(1).replace('.', ',')} km)` : ''}`
                  : `${legLabel(leg)}${leg.headsign ? ` Richtung ${leg.headsign}` : ''}${leg.stops > 0 ? ` · ${leg.stops} Halte` : ''}${leg.agency ? ` · ${leg.agency}` : ''}`}
              </span>
              {i === legs.length - 1 && (
                <>
                  <span className="font-mono font-semibold">{clockAt(leg.to.time, leg.to.timeZone)}</span>
                  <span>{name(leg.to.name)}</span>
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <button type="button" onClick={() => setOpen((o) => !o)} className={buttonClass('ghost', 'sm')} aria-expanded={open}>
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          Details
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {places && transit && (
            <a
              href={bahnUrl(places.fromName, places.toName, it)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass('secondary', 'sm')}
            >
              bahn.de
              <ExternalLink size={14} />
            </a>
          )}
          {places && (
            <a
              href={googleTransitUrl(places.from, places.to)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass('secondary', 'sm')}
            >
              Maps
              <ExternalLink size={14} />
            </a>
          )}
          {saved ? (
            <span className={buttonClass('secondary', 'sm', 'cursor-default border-accent text-accent')}>
              <Check size={15} />
              Gemerkt
            </span>
          ) : (
            <Button size="sm" variant="primary" icon={<Heart size={15} />} onClick={onSave} disabled={saving || !places}>
              {saving ? 'Merke …' : 'Merken'}
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

function LegChip({ leg }: { leg: TransitLeg }) {
  const info = modeInfo(leg.mode)
  const walk = info.kind === 'walk'
  const color = leg.color && /^[0-9a-f]{6}$/i.test(leg.color) ? `#${leg.color}` : null
  return (
    <span
      className={clsx(
        'flex items-center gap-1 rounded-lg px-2 py-0.5 text-[13px] font-semibold',
        walk ? 'text-muted' : 'bg-accent-soft text-text',
      )}
      style={color && !walk ? { boxShadow: `inset 3px 0 0 ${color}` } : undefined}
      title={walk ? undefined : [info.label, leg.headsign && `Richtung ${leg.headsign}`].filter(Boolean).join(' · ')}
    >
      <ModeIcon kind={info.kind} />
      {walk ? formatDuration(leg.durationMinutes) : legLabel(leg)}
    </span>
  )
}

function ModeIcon({ kind }: { kind: ModeKind }) {
  const icons: Record<ModeKind, ReactNode> = {
    walk: <Footprints size={14} />,
    bus: <Bus size={14} />,
    tram: <TramFront size={14} />,
    subway: <TrainFrontTunnel size={14} />,
    train: <TrainFront size={14} />,
    ferry: <Ship size={14} />,
    plane: <Plane size={14} />,
    other: <CircleDot size={14} />,
  }
  return <span aria-hidden="true">{icons[kind]}</span>
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={clsx(
        'h-8 cursor-pointer whitespace-nowrap rounded-lg px-3 text-sm font-bold transition-colors duration-100',
        active ? 'bg-accent text-accent-ink' : 'text-muted hover:text-text',
      )}
    >
      {children}
    </button>
  )
}
