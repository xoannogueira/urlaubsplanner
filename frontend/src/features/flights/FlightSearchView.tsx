import clsx from 'clsx'
import { ArrowRight, CalendarSearch, Clock, KeyRound, Search, SearchX, TriangleAlert } from 'lucide-react'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useAirportLookup, useNearbyAirports, type Airport } from '../../api/airports'
import { ApiError } from '../../api/client'
import {
  useFlightSearch,
  useFlightSearchStatus,
  type CabinClass,
  type FlightFare,
  type FlightJourney,
  type FlightSearchParams,
  type FlightSearchStatus,
} from '../../api/flights'
import { useTripActions } from '../../api/trips'
import type { Trip } from '../../api/types'
import { TripMap } from '../../components/map/TripMap'
import type { MapAirport, MapArc } from '../../components/map/types'
import { Button } from '../../components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback'
import { QuotaBadge } from '../../components/ui/QuotaBadge'
import { GoogleSetupHint } from '../setup/GoogleSetupHint'
import { controlClass } from '../../components/ui/fieldStyles'
import { addDays } from '../../lib/dates'
import { formatShortDate, peopleLabel, todayIso } from '../../lib/format'
import {
  combinationCount,
  filterAndSortFlights,
  flightOptionInput,
  anyTime,
  hasTimeFilter,
  noFlightFilters,
  rateFlights,
  timeValueLabels,
  type TimeValue,
  type TimeWindow,
  planLegs,
  planProblem,
  shiftDate,
  suggestTripType,
  type FlightFilters,
  type FlightPlan,
  type FlightSort,
  type TripType,
} from '../../lib/flights'
import { toLatLng } from '../../lib/geo'
import { stageMarkers } from '../../lib/mapData'
import { AirportPicker } from './AirportPicker'
import { FlightDatesDialog } from './FlightDatesDialog'
import { FlightResultCard } from './FlightResultCard'

const HOME_KEY = 'urlaubsplanner.homeAirports'
const MAX_ADULTS = 9
const radiusOptions = [100, 150, 250]
const tripTypes: { value: TripType; label: string }[] = [
  { value: 'roundtrip', label: 'Hin & zurück' },
  { value: 'openjaw', label: 'Gabelflug' },
  { value: 'oneway', label: 'Nur Hinflug' },
]
const cabins: { value: CabinClass; label: string }[] = [
  { value: 'Economy', label: 'Economy' },
  { value: 'PremiumEconomy', label: 'Premium Economy' },
  { value: 'Business', label: 'Business' },
  { value: 'First', label: 'First' },
]

/** Heimatflughafen merkt sich der Browser – praktisch, aber nicht wichtig genug für den Server. */
function loadHome(): Airport[] {
  try {
    const raw = localStorage.getItem(HOME_KEY)
    return raw ? (JSON.parse(raw) as Airport[]) : []
  } catch {
    return []
  }
}

function saveHome(airports: Airport[]) {
  try {
    localStorage.setItem(HOME_KEY, JSON.stringify(airports))
  } catch {
    // Ohne Speicher muss der Flughafen eben jedes Mal gewählt werden.
  }
}

/** Ohne eigene Auswahl: der nächste große Flughafen (sonst der nächste) aus dem Umkreis. */
const defaultPick = (nearby: Airport[] | undefined) => {
  const pick = nearby?.find((a) => a.major) ?? nearby?.[0]
  return pick ? [pick] : []
}

/** Flugsuche für die ganze Reise: Hinflug zur ersten Etappe, Rückflug von der letzten. */
export function FlightSearchView({ trip }: { trip: Trip }) {
  const status = useFlightSearchStatus()
  if (status.data && !status.data.configured) return <SetupHint provider={status.data.provider} />
  return <SearchArea trip={trip} status={status.data ?? null} />
}

function SearchArea({ trip, status }: { trip: Trip; status: FlightSearchStatus | null }) {
  // Google Flights (SerpApi): alle Flughäfen in einer Suche, Rückflug wird nach dem Hinflug gewählt.
  const google = status?.provider === 'serpapi'
  const actions = useTripActions(trip.id)
  const firstStage = trip.stages[0] ?? null
  const lastStage = trip.stages[trip.stages.length - 1] ?? null
  const firstCenter = useMemo(() => toLatLng(firstStage), [firstStage])
  const lastCenter = useMemo(() => toLatLng(lastStage), [lastStage])

  const [type, setType] = useState<TripType>(() => suggestTripType(trip.stages))
  const [cabin, setCabin] = useState<CabinClass>('Economy')
  const [home, setHome] = useState<Airport[]>(loadHome)
  // null = noch nicht angefasst → Vorschlag (Heimat bzw. nächster Flughafen der Etappe)
  const [outFrom, setOutFrom] = useState<Airport[] | null>(null)
  const [outTo, setOutTo] = useState<Airport[] | null>(null)
  const [inFrom, setInFrom] = useState<Airport[] | null>(null)
  const [inTo, setInTo] = useState<Airport[] | null>(null)
  const [outDate, setOutDate] = useState(firstStage?.startDate ?? trip.startDate ?? '')
  const [inDate, setInDate] = useState(lastStage?.endDate ?? trip.endDate ?? '')
  const [radiusOut, setRadiusOut] = useState(150)
  const [radiusIn, setRadiusIn] = useState(150)

  const [params, setParams] = useState<FlightSearchParams | null>(null)
  const [filters, setFilters] = useState<FlightFilters>(noFlightFilters)
  const [sort, setSort] = useState<FlightSort>('best')
  const [timeValue, setTimeValue] = useState<TimeValue>(storedTimeValue)
  const [timesOpen, setTimesOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [datesOpen, setDatesOpen] = useState(false)
  const [view, setView] = useState<'list' | 'map'>('list')

  const nearOut = useNearbyAirports(firstCenter, radiusOut)
  const nearIn = useNearbyAirports(lastCenter, radiusIn)

  const origins = outFrom ?? home
  const destinations = outTo ?? defaultPick(nearOut.data)
  const returnFrom = inFrom ?? defaultPick(nearIn.data)
  const returnTo = inTo ?? home
  const adults = Math.min(trip.travelers, MAX_ADULTS)
  // Airlines verkaufen ab heute bis ca. 11 Monate im Voraus.
  const today = todayIso()
  const latest = addDays(today, 330)

  const plan: FlightPlan = {
    type,
    outbound: { origins: origins.map((a) => a.code), destinations: destinations.map((a) => a.code), date: outDate },
    inbound: { origins: returnFrom.map((a) => a.code), destinations: returnTo.map((a) => a.code), date: inDate },
  }
  const legs = planLegs(plan)
  const problem = planProblem(plan, today, google)
  const requests = problem ? 0 : google ? 1 : combinationCount(legs)

  const search = useFlightSearch(params)
  const result = search.data
  const legNames = (params?.legs.length ?? legs.length) === 1 ? ['Hinflug'] : ['Hinflug', 'Rückflug']

  const flights = useMemo(() => filterAndSortFlights(result?.journeys ?? [], filters, sort, timeValue), [result, filters, sort, timeValue])
  const ratings = useMemo(() => rateFlights(flights, timeValue), [flights, timeValue])
  const changeTimeValue = (value: TimeValue) => {
    setTimeValue(value)
    try {
      localStorage.setItem(TIME_VALUE_KEY, value)
    } catch {
      // egal – gilt dann nur bis zum Neuladen
    }
  }
  const savedSignatures = useMemo(
    () => new Set(trip.options.filter((o) => o.kind === 'Flight' && o.externalId).map((o) => o.externalId!.split('#')[0])),
    [trip.options],
  )

  // Koordinaten für alle Flughäfen in den Ergebnissen (Karte, Ort beim Merken).
  const resultCodes = useMemo(
    () => (result?.journeys ?? []).flatMap((j) => j.legs.flatMap((l) => l.segments.flatMap((s) => [s.origin, s.destination]))),
    [result],
  )
  const lookup = useAirportLookup(resultCodes)
  const airportByCode = useMemo(() => new Map((lookup.data ?? []).map((a) => [a.code, a])), [lookup.data])

  const shown = useMemo(() => flights.slice(0, 40), [flights])
  const selected = shown.find((f) => f.journey.signature === selectedId)?.journey ?? null
  const { arcs, mapAirports } = useMemo(
    () =>
      flightMap(
        shown.map((f) => f.journey),
        selected,
        airportByCode,
      ),
    [shown, selected, airportByCode],
  )
  const stageMarker = useMemo(() => stageMarkers(trip.stages), [trip.stages])

  const runSearch = (dates?: { out: string; in: string }) => {
    const searchPlan = dates
      ? { ...plan, outbound: { ...plan.outbound, date: dates.out }, inbound: { ...plan.inbound, date: dates.in } }
      : plan
    if (planProblem(searchPlan, today, google)) return
    setSelectedId(null)
    setParams({ legs: planLegs(searchPlan), adults, cabin })
  }

  const changeOrigins = (airports: Airport[]) => {
    setOutFrom(airports)
    setHome(airports)
    saveHome(airports)
  }

  const save = (journey: FlightJourney, fare: FlightFare) => {
    const destination = airportByCode.get(journey.legs[0].destination)
    setSavingId(journey.signature)
    actions.addOption.mutate(
      flightOptionInput(
        journey,
        fare,
        destination ? { latitude: destination.latitude, longitude: destination.longitude } : null,
        destination ? `${destination.city || destination.name} (${destination.code})` : journey.legs[0].destination,
        google ? 'serpapi' : 'liteapi',
      ),
      { onSettled: () => setSavingId(null) },
    )
  }

  const pickShift = (days: number) => {
    const dates = { out: shiftDate(outDate, days), in: inDate ? shiftDate(inDate, days) : inDate }
    setOutDate(dates.out)
    setInDate(dates.in)
    runSearch(dates)
  }

  const selectFromMap = useCallback((id: string | null) => {
    setSelectedId(id)
  }, [])

  const cheapest = flights[0]?.journey ?? null
  const datesParams =
    cheapest && params
      ? {
          legs: params.legs.map((q, i) => {
            const known = cheapest.legs[i]
            if (known) return { origin: known.origin, destination: known.destination, date: q.date }
            // Rückflug noch nicht gewählt (Google): möglichst dieselben Flughäfen wie beim Hinflug, umgedreht.
            const first = cheapest.legs[0]
            const pick = (codes: string[], prefer: string) => (codes.includes(prefer) ? prefer : codes[0])
            return { origin: pick(q.origins, first.destination), destination: pick(q.destinations, first.origin), date: q.date }
          }),
          adults: params.adults,
          cabin: params.cabin,
        }
      : null
  const error = search.error instanceof ApiError ? search.error : null

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Flugsuche" className="flex flex-col gap-4 rounded-[18px] border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div role="radiogroup" aria-label="Reiseart" className="flex rounded-xl bg-surface-2 p-1">
            {tripTypes.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={type === t.value}
                onClick={() => setType(t.value)}
                className={clsx(
                  'h-9 cursor-pointer rounded-lg px-3 text-sm font-bold transition-colors duration-100',
                  type === t.value ? 'bg-accent text-accent-ink' : 'text-muted hover:text-text',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="text-sm text-muted">{peopleLabel(adults)}</span>
          <select
            aria-label="Klasse"
            value={cabin}
            onChange={(e) => setCabin(e.target.value as CabinClass)}
            className="h-10 rounded-xl border border-line bg-surface-2 px-3 text-sm font-semibold"
          >
            {cabins.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          {trip.travelers > MAX_ADULTS && (
            <span className="text-xs text-star">
              Airlines buchen höchstens {MAX_ADULTS} Personen auf einmal – gesucht wird für {MAX_ADULTS}.
            </span>
          )}
        </div>

        <LegForm title="Hinflug">
          <AirportPicker label="Von" value={origins} onChange={changeOrigins} placeholder="z. B. Stuttgart" />
          <AirportPicker
            label="Nach"
            value={destinations}
            onChange={setOutTo}
            suggestions={nearOut.data}
            suggestionLabel={firstStage ? `Nähe ${firstStage.name}` : undefined}
          />
          <DateAndRadius
            label="Abflug"
            date={outDate}
            onDate={setOutDate}
            min={today}
            max={latest}
            radius={firstCenter ? radiusOut : null}
            onRadius={setRadiusOut}
          />
        </LegForm>

        {type === 'roundtrip' && (
          <LegForm title="Rückflug">
            <ReturnRoute from={destinations} to={origins} />
            <DateAndRadius
              label="Rückflug am"
              date={inDate}
              onDate={setInDate}
              min={outDate || today}
              max={latest}
              radius={null}
              onRadius={() => undefined}
            />
          </LegForm>
        )}
        {type === 'openjaw' && (
          <LegForm title="Rückflug (über andere Flughäfen)">
            <AirportPicker
              label="Von"
              value={returnFrom}
              onChange={setInFrom}
              suggestions={nearIn.data}
              suggestionLabel={lastStage ? `Nähe ${lastStage.name}` : undefined}
            />
            <AirportPicker label="Nach" value={returnTo} onChange={setInTo} placeholder="z. B. Stuttgart" />
            <DateAndRadius
              label="Rückflug am"
              date={inDate}
              onDate={setInDate}
              min={outDate || today}
              max={latest}
              radius={lastCenter ? radiusIn : null}
              onRadius={setRadiusIn}
            />
          </LegForm>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            size="lg"
            icon={<Search size={18} />}
            onClick={() => runSearch()}
            disabled={!!problem || search.isFetching}
          >
            {search.isFetching ? 'Suche läuft …' : 'Flüge suchen'}
          </Button>
          <span className={clsx('text-sm', problem ? 'text-star' : 'text-muted')}>
            {problem ??
              (google
                ? '1 Google-Suche – Rückflüge kosten beim Aufklappen je eine weitere'
                : requests === 1
                  ? '1 Abfrage'
                  : `${requests} Abfragen (eine pro Flughafen-Kombination)`)}
          </span>
          {status?.quota && <QuotaBadge quota={status.quota} />}
        </div>
      </section>

      {!params ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted">
          {google
            ? 'Daten und Zielflughäfen kommen aus den Etappen. Preise kommen von Google Flights: Erst siehst du die Hinflüge mit dem günstigsten Gesamtpreis, dann wählst du den Rückflug. Mehrere Flughäfen pro Seite kosten keine Extra-Suche.'
            : 'Daten und Zielflughäfen kommen aus den Etappen. Mehrere Flughäfen pro Seite sind möglich (z. B. alle im Umkreis) – jede Kombination ist eine eigene Suche.'}{' '}
          Gefundene Flüge kannst du mit „Merken“ als Favorit speichern.
        </p>
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void search.refetch()} />
      ) : search.isPending ? (
        <div className="grid gap-3" aria-busy="true">
          <p className="text-sm text-muted">Flugsuchen dauern ein paar Sekunden …</p>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="mr-2 text-lg font-extrabold">
              {flights.length === result!.journeys.length
                ? `${flights.length} Flüge`
                : `${flights.length} von ${result!.journeys.length} Flügen`}
            </span>
            {result!.sandbox && (
              <span
                className="flex items-center gap-1.5 rounded-full border border-star/50 px-2.5 py-1 text-xs font-bold text-star"
                title="Mit einem Sandbox-Key liefert LiteAPI Testdaten."
              >
                <TriangleAlert size={13} />
                Sandbox – Testdaten
              </span>
            )}
            {result!.failed > 0 && (
              <span className="text-xs text-star">
                {result!.failed} von {result!.requests} Suchen fehlgeschlagen
              </span>
            )}
            <Chip active={filters.nonstop} onClick={() => setFilters((f) => ({ ...f, nonstop: !f.nonstop }))}>
              Nur Direktflüge
            </Chip>
            <Chip active={hasTimeFilter(filters) || timesOpen} onClick={() => setTimesOpen((o) => !o)}>
              <span className="flex items-center gap-1.5">
                <Clock size={14} />
                Uhrzeiten
              </span>
            </Chip>
            {!google && (
              <Chip active={filters.withBag} onClick={() => setFilters((f) => ({ ...f, withBag: !f.withBag }))}>
                Mit Koffer
              </Chip>
            )}
            <Button
              variant="secondary"
              size="sm"
              icon={<CalendarSearch size={15} />}
              onClick={() => setDatesOpen(true)}
              disabled={!datesParams}
            >
              Andere Daten prüfen
            </Button>
            <div className="flex-1" />
            <div role="radiogroup" aria-label="Ansicht" className="flex rounded-xl bg-surface-2 p-1 xl:hidden">
              <ViewButton active={view === 'list'} onClick={() => setView('list')}>
                Liste
              </ViewButton>
              <ViewButton active={view === 'map'} onClick={() => setView('map')}>
                Karte
              </ViewButton>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted">
              Sortieren
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as FlightSort)}
                className="h-10 rounded-xl border border-line bg-surface px-3 font-semibold text-text"
              >
                <option value="best">Beste Wahl</option>
                <option value="price">Preis</option>
                <option value="duration">Flugzeit</option>
                <option value="departure">Abflug</option>
              </select>
            </label>
          </div>

          {timesOpen && (
            <TimeFilters
              legNames={legNames}
              filters={filters}
              onChange={(departure, arrival) => setFilters((f) => ({ ...f, departure, arrival }))}
            />
          )}
          {sort === 'best' && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted">Wie wichtig ist dir Zeit?</span>
              <div role="radiogroup" aria-label="Wie wichtig ist dir Zeit?" className="flex rounded-xl bg-surface-2 p-1">
                {(Object.keys(timeValueLabels) as TimeValue[]).map((v) => (
                  <ViewButton key={v} active={timeValue === v} onClick={() => changeTimeValue(v)}>
                    {timeValueLabels[v]}
                  </ViewButton>
                ))}
              </div>
              <span className="text-xs text-muted">
                „Beste Wahl“ wiegt Preis gegen Reisezeit ab – lange Umwege zählen überproportional.
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-start gap-6">
            <section
              aria-label="Suchergebnisse"
              className={clsx('flex min-w-0 flex-[1_1_520px] flex-col gap-3', view === 'map' && 'max-xl:hidden')}
            >
              {flights.length === 0 ? (
                <EmptyState
                  icon={<SearchX size={22} />}
                  title={result!.journeys.length === 0 ? 'Keine Flüge gefunden' : 'Nichts passt zu den Filtern'}
                  text={
                    result!.journeys.length === 0
                      ? 'Probier weitere Flughäfen im Umkreis oder andere Daten.'
                      : 'Entferne einen Filter, um mehr Flüge zu sehen.'
                  }
                />
              ) : (
                <>
                  {shown.map(({ journey, fare }) => (
                    <FlightResultCard
                      key={`${journey.signature}:${fare.family}`}
                      journey={journey}
                      initialFare={fare}
                      adults={params.adults}
                      legNames={legNames}
                      savedSignatures={savedSignatures}
                      savingId={savingId}
                      selected={selectedId === journey.signature}
                      onSelect={() => setSelectedId(journey.signature)}
                      onSave={save}
                      rating={flights.length > 1 ? ratings.get(journey.signature) : null}
                      filters={filters}
                      sort={sort}
                      timeValue={timeValue}
                    />
                  ))}
                  {flights.length > shown.length && (
                    <p className="text-center text-sm text-muted">
                      {flights.length - shown.length} weitere Flüge – nutze Filter oder Sortierung, um die Liste einzugrenzen.
                    </p>
                  )}
                </>
              )}
            </section>
            <aside aria-label="Karte" className={clsx('sticky top-4 min-w-0 flex-[1_1_420px]', view === 'list' && 'max-xl:hidden')}>
              <TripMap
                label="Karte der Flugverbindungen"
                pins={[]}
                arcs={arcs}
                airports={mapAirports}
                stages={stageMarker}
                selectedId={selectedId}
                onSelect={selectFromMap}
                fitTo="pins"
                className="h-[calc(100dvh-140px)] max-h-[860px] min-h-[420px] max-xl:h-[calc(100dvh-90px)]"
              />
              <p className="mt-2 text-xs text-muted">
                {selected ? 'Hervorgehoben: der ausgewählte Flug.' : 'Klick auf einen Flug, um seine Strecke hervorzuheben.'}
              </p>
            </aside>
          </div>
        </>
      )}

      <FlightDatesDialog
        open={datesOpen}
        onClose={() => setDatesOpen(false)}
        params={datesParams}
        currentPrice={cheapest ? (flights[0]?.fare.totalPrice ?? null) : null}
        onPick={pickShift}
      />
    </div>
  )
}

/** Bögen pro Flug-Abschnitt (gleiche Strecken nur einmal), der ausgewählte Flug hervorgehoben. */
function flightMap(journeys: FlightJourney[], selected: FlightJourney | null, airports: Map<string, Airport>) {
  const pos = (code: string) => {
    const a = airports.get(code)
    return a ? { latitude: a.latitude, longitude: a.longitude } : null
  }
  const pairs = new Map<string, MapArc>()
  const addSegments = (journey: FlightJourney, emphasis: MapArc['emphasis']) => {
    for (const s of journey.legs.flatMap((l) => l.segments)) {
      const from = pos(s.origin)
      const to = pos(s.destination)
      if (!from || !to) continue
      const id = `${s.origin}-${s.destination}`
      if (emphasis === 'active' || !pairs.has(id)) pairs.set(id, { id, from, to, emphasis })
    }
  }
  for (const j of journeys) addSegments(j, 'muted')
  if (selected) addSegments(selected, 'active')

  const codes = new Set([...pairs.keys()].flatMap((id) => id.split('-')))
  const mapAirports: MapAirport[] = [...codes].flatMap((code) => {
    const a = airports.get(code)
    return a ? [{ code, position: { latitude: a.latitude, longitude: a.longitude }, title: `${a.code} – ${a.name}` }] : []
  })
  return { arcs: [...pairs.values()], mapAirports }
}

/** Hin & zurück: die Rückflug-Strecke ist der Hinflug umgedreht – als ruhiges Feld im selben Stil wie die Flughafen-Auswahl. */
function ReturnRoute({ from, to }: { from: Airport[]; to: Airport[] }) {
  const chips = (airports: Airport[]) =>
    airports.length > 0 ? (
      airports.map((a) => (
        <span key={a.code} className="flex items-center gap-1 rounded-lg bg-accent-soft px-2 py-0.5 text-sm font-semibold text-accent">
          <span className="font-mono">{a.code}</span>
          <span className="max-w-32 truncate font-normal text-text">{a.city || a.name}</span>
        </span>
      ))
    ) : (
      <span className="px-1 text-[15px] text-muted">…</span>
    )
  return (
    <div className="flex min-w-0 flex-col gap-1.5 md:col-span-2">
      <span className="text-[13px] font-bold text-muted">Strecke</span>
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-dashed border-line px-2 py-1.5">
        {chips(from)}
        <ArrowRight size={16} className="mx-1 shrink-0 text-muted" aria-label="nach" />
        {chips(to)}
      </div>
      <span className="text-xs text-muted">Wie der Hinflug, nur umgekehrt</span>
    </div>
  )
}

function LegForm({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-extrabold">{title}</legend>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">{children}</div>
    </fieldset>
  )
}

function DateAndRadius({
  label,
  date,
  onDate,
  min,
  max,
  radius,
  onRadius,
}: {
  label: string
  date: string
  onDate: (date: string) => void
  min?: string
  max?: string
  /** null = kein Umkreis (Etappe ohne Ort) */
  radius: number | null
  onRadius: (radius: number) => void
}) {
  return (
    <div className="flex items-start gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold text-muted">{label}</span>
        <input
          type="date"
          value={date}
          min={min}
          max={max}
          onChange={(e) => onDate(e.target.value)}
          className={clsx(controlClass, 'w-40')}
        />
        {date && <span className="text-xs text-muted">{formatShortDate(date)}</span>}
      </label>
      {radius != null && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-muted">Umkreis</span>
          <select
            value={radius}
            onChange={(e) => onRadius(Number(e.target.value))}
            className="h-11 rounded-xl border border-line bg-surface-2 px-3 text-[15px] font-semibold"
          >
            {radiusOptions.map((r) => (
              <option key={r} value={r}>
                {r} km
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}

function SetupHint({ provider }: { provider: FlightSearchStatus['provider'] }) {
  if (provider === 'serpapi') return <GoogleSetupHint what="Flugsuche" />
  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-dashed border-line p-6">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <KeyRound size={22} />
      </span>
      <h3 className="text-lg font-extrabold">Flugsuche einrichten</h3>
      <p className="max-w-2xl text-[15px] leading-relaxed text-muted">
        Die Flugsuche nutzt denselben LiteAPI-Key wie die Hotelsuche. Hinterlege ihn einmal im Terminal (im Ordner
        <code className="mx-1 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[13px]">backend/src/Urlaubsplanner.Api</code>) und starte
        das Backend neu:
      </p>
      <pre className="overflow-x-auto rounded-xl bg-surface-2 p-4 font-mono text-[13px]">
        dotnet user-secrets set "LiteApi:ApiKey" "sand_…"
      </pre>
    </section>
  )
}

const TIME_VALUE_KEY = 'urlaubsplanner.timeValue'

function storedTimeValue(): TimeValue {
  try {
    const value = localStorage.getItem(TIME_VALUE_KEY)
    return value === 'cheap' || value === 'fast' ? value : 'balanced'
  } catch {
    return 'balanced'
  }
}

const hours = Array.from({ length: 25 }, (_, h) => h)
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`

/** Abflug- und Ankunftsfenster pro Strecke. */
function TimeFilters({
  legNames,
  filters,
  onChange,
}: {
  legNames: string[]
  filters: FlightFilters
  onChange: (departure: TimeWindow[], arrival: TimeWindow[]) => void
}) {
  const set = (kind: 'departure' | 'arrival', index: number, window: TimeWindow) => {
    const next = { departure: [...filters.departure], arrival: [...filters.arrival] }
    for (let i = 0; i <= index; i++) {
      next.departure[i] ??= anyTime
      next.arrival[i] ??= anyTime
    }
    next[kind][index] = window
    onChange(next.departure, next.arrival)
  }
  return (
    <section aria-label="Uhrzeiten" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold">Uhrzeiten</span>
        {hasTimeFilter(filters) && (
          <button
            type="button"
            onClick={() => onChange([], [])}
            className="cursor-pointer text-sm font-semibold text-accent hover:underline"
          >
            Zurücksetzen
          </button>
        )}
      </div>
      {legNames.map((name, i) => (
        <div key={name} className="grid items-center gap-x-6 gap-y-2 sm:grid-cols-[90px_max-content_max-content]">
          <span className="text-sm font-semibold">{name}</span>
          <WindowSelect label="Abflug" window={filters.departure[i] ?? anyTime} onChange={(w) => set('departure', i, w)} />
          <WindowSelect label="Ankunft" window={filters.arrival[i] ?? anyTime} onChange={(w) => set('arrival', i, w)} />
        </div>
      ))}
      <p className="text-xs text-muted">Ortszeit am jeweiligen Flughafen. Kostet keine Suche – gefiltert wird in der App.</p>
    </section>
  )
}

function WindowSelect({ label, window, onChange }: { label: string; window: TimeWindow; onChange: (w: TimeWindow) => void }) {
  const select = 'h-9 rounded-lg border border-line bg-surface-2 px-2 text-sm font-semibold'
  return (
    <span className="flex items-center gap-2 text-sm text-muted">
      <span className="w-14">{label}</span>
      <select
        aria-label={`${label} frühestens`}
        value={window.from}
        onChange={(e) => onChange({ from: Number(e.target.value), to: Math.max(Number(e.target.value), window.to) })}
        className={select}
      >
        {hours.slice(0, 24).map((h) => (
          <option key={h} value={h}>
            {hourLabel(h)}
          </option>
        ))}
      </select>
      bis
      <select
        aria-label={`${label} spätestens`}
        value={window.to}
        onChange={(e) => onChange({ from: Math.min(window.from, Number(e.target.value)), to: Number(e.target.value) })}
        className={select}
      >
        {hours.slice(1).map((h) => (
          <option key={h} value={h}>
            {h === 24 ? '24:00' : hourLabel(h)}
          </option>
        ))}
      </select>
    </span>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'h-[38px] cursor-pointer rounded-full border px-3.5 text-sm font-semibold transition-colors duration-100',
        active ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface hover:bg-surface-3',
      )}
    >
      {children}
    </button>
  )
}

function ViewButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={clsx(
        'h-9 cursor-pointer rounded-lg px-3 text-sm font-bold transition-colors duration-100',
        active ? 'bg-accent text-accent-ink' : 'text-muted hover:text-text',
      )}
    >
      {children}
    </button>
  )
}
