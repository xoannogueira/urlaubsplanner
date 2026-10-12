import clsx from 'clsx'
import { CalendarSearch, KeyRound, Minus, Plus, Search, SearchX, TriangleAlert } from 'lucide-react'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { ApiError } from '../../api/client'
import {
  mergeHotelPages,
  useHotelSearch,
  useHotelSearchStatus,
  useNearbyHotels,
  useRoomSplitSearches,
  type HotelOffer,
  type HotelSearchParams,
  type HotelSearchStatus,
} from '../../api/hotels'
import { useTripActions } from '../../api/trips'
import type { Stage, Trip } from '../../api/types'
import { TripMap } from '../../components/map/TripMap'
import type { MapPin, PinTone } from '../../components/map/types'
import { Button } from '../../components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback'
import { QuotaBadge } from '../../components/ui/QuotaBadge'
import { formatDateRange, formatEuro, nightsLabel, peopleLabel } from '../../lib/format'
import { distanceKm, toLatLng } from '../../lib/geo'
import {
  defaultRooms,
  filterAndSortHotels,
  hotelOptionInput,
  noFilters,
  roomSplits,
  unavailableHotels,
  type AlternativeOffer,
  type HotelFilters,
  type HotelSort,
} from '../../lib/hotels'
import { stageMarkers } from '../../lib/mapData'
import { AlternativesDialog, type AlternativeCandidate } from './AlternativesDialog'
import { HotelResultCard, UnavailableHotelCard, type SplitPrice } from './HotelResultCard'

const radiusOptions = [1000, 3000, 5000, 10_000, 20_000, 50_000]

interface HotelSearchViewProps {
  trip: Trip
  /** Etappe, für die gesucht wird (Ort und Daten kommen von dort). */
  stage: Stage | null
  onEditStage: () => void
}

/** Hotelsuche (Google Hotels über SerpApi oder LiteAPI) für eine Etappe: Ergebnisse als Liste und als Preis-Pins auf der Karte. */
export function HotelSearchView({ trip, stage, onEditStage }: HotelSearchViewProps) {
  const status = useHotelSearchStatus()
  // Stabiles Objekt, damit Liste und Karte nicht bei jedem Rendern neu rechnen.
  const center = useMemo(() => toLatLng(stage), [stage])

  if (status.data && !status.data.configured) return <SetupHint provider={status.data.provider} />
  if (!stage) {
    return (
      <EmptyState
        icon={<SearchX size={22} />}
        title="Noch keine Etappe"
        text="Leg in der Übersicht eine Etappe mit Ort und Zeitraum an – danach kannst du hier Hotels dafür suchen."
      />
    )
  }
  if (!center) {
    return (
      <EmptyState
        icon={<SearchX size={22} />}
        title={`${stage.name} hat noch keinen Ort`}
        text="Für die Suche braucht die Etappe einen Ort auf der Karte. Bearbeite sie und wähle einen Vorschlag aus der Liste."
        action={
          <Button variant="primary" onClick={onEditStage}>
            Etappe bearbeiten
          </Button>
        }
      />
    )
  }

  return <SearchArea key={stage.id} trip={trip} stage={stage} center={center} status={status.data ?? null} />
}

function SearchArea({
  trip,
  stage,
  center,
  status,
}: {
  trip: Trip
  stage: Stage
  center: { latitude: number; longitude: number }
  status: HotelSearchStatus | null
}) {
  // Google Hotels: Preise mehrerer Anbieter, keine Zimmeraufteilung, 20 Hotels pro Seite.
  const google = status?.provider === 'serpapi'
  const actions = useTripActions(trip.id)
  const [rooms, setRooms] = useState(() => Math.min(defaultRooms(trip.travelers), trip.travelers))
  const [radius, setRadius] = useState(3000)
  const [params, setParams] = useState<HotelSearchParams | null>(null)
  const [filters, setFilters] = useState<HotelFilters>(noFilters)
  const [sort, setSort] = useState<HotelSort>('price')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'map'>('list')
  const [showUnavailable, setShowUnavailable] = useState(false)
  const [alternativesFor, setAlternativesFor] = useState<string[] | null>(null)

  const search = useHotelSearch(params)
  const result = useMemo(() => mergeHotelPages(search.data?.pages), [search.data])
  const nights = result?.nights ?? stage.nights
  const nearby = useNearbyHotels(params, showUnavailable)

  // Zimmeraufteilungen vergleichen: dieselbe Suche mit 1, 2, 3 … Zimmern (die aktuelle kommt aus der Hauptsuche).
  const [compareSplits, setCompareSplits] = useState(false)
  const splitCounts = useMemo(() => roomSplits(trip.travelers), [trip.travelers])
  const splitSearches = useRoomSplitSearches(params, splitCounts, compareSplits && !google)
  const splitPrices = useMemo(() => {
    const byHotel = new Map<string, SplitPrice[]>()
    if (!compareSplits || google) return byHotel
    for (const hotel of result?.hotels ?? []) {
      byHotel.set(
        hotel.hotelId,
        splitCounts.map((count, i) => ({
          rooms: count,
          price: splitSearches[i].data?.hotels.find((h) => h.hotelId === hotel.hotelId)?.totalPrice ?? null,
          loading: splitSearches[i].isFetching,
        })),
      )
    }
    return byHotel
  }, [compareSplits, google, result, splitCounts, splitSearches])

  /** Andere Aufteilung übernehmen: Suche mit dieser Zimmeranzahl (kommt meist schon aus dem Cache). */
  const pickRooms = (count: number) => {
    setRooms(count)
    setParams((p) => (p ? { ...p, rooms: count } : p))
  }

  const savedIds = useMemo(
    () =>
      new Set(
        trip.options
          .filter((o) => (o.provider === 'liteapi' || o.provider === 'serpapi') && o.stageId === stage.id)
          .map((o) => o.externalId),
      ),
    [trip.options, stage.id],
  )

  const hotels = useMemo(() => filterAndSortHotels(result?.hotels ?? [], filters, sort, center), [result, filters, sort, center])
  const soldOut = useMemo(
    () => (showUnavailable ? unavailableHotels(nearby.data?.hotels ?? [], result?.hotels ?? [], filters, sort, center) : []),
    [showUnavailable, nearby.data, result, filters, sort, center],
  )
  const candidates = useMemo<AlternativeCandidate[]>(
    () => [
      ...soldOut.map((h) => ({ hotelId: h.hotelId, name: h.name, unavailable: true })),
      ...hotels.map((h) => ({ hotelId: h.hotelId, name: h.name, unavailable: false })),
    ],
    [soldOut, hotels],
  )

  const pins = useMemo<MapPin[]>(
    () => [
      ...hotels.flatMap((h) => pinFor(h, formatEuro(h.totalPrice), h.name, savedIds.has(h.hotelId) ? 'favorite' : 'idea')),
      ...soldOut.flatMap((h) => pinFor(h, 'ausgebucht', `${h.name} (ausgebucht)`, 'unavailable')),
    ],
    [hotels, soldOut, savedIds],
  )
  const stageMarker = useMemo(() => stageMarkers(trip.stages).filter((s) => s.id === stage.id), [trip.stages, stage.id])

  const runSearch = () => {
    setSelectedId(null)
    setParams({
      latitude: center.latitude,
      longitude: center.longitude,
      checkin: stage.startDate,
      checkout: stage.endDate,
      adults: trip.travelers,
      rooms,
      radiusMeters: radius,
      place: stage.name,
    })
  }

  const save = (hotel: HotelOffer) => {
    setSavingId(hotel.hotelId)
    actions.addOption.mutate(hotelOptionInput(hotel, stage.id, stage.startDate, stage.endDate, google ? 'serpapi' : 'liteapi'), {
      onSettled: () => setSavingId(null),
    })
  }

  /** Ausweichtermin aus dem Dialog als eigenen Favoriten merken. */
  const saveAlternative = (alt: AlternativeOffer) =>
    actions.addOption.mutateAsync(hotelOptionInput(alt.offer, stage.id, alt.checkin, alt.checkout, google ? 'serpapi' : 'liteapi'))
  const isAlternativeSaved = (alt: AlternativeOffer) =>
    trip.options.some((o) => o.externalId === alt.offer.hotelId && o.startDate === alt.checkin)

  const selectFromMap = useCallback((id: string | null) => {
    setSelectedId(id)
    if (id) {
      requestAnimationFrame(() =>
        document.querySelector(`[data-hotel-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
      )
    }
  }, [])

  const distanceOf = (h: { latitude: number | null; longitude: number | null }) =>
    h.latitude != null && h.longitude != null ? distanceKm(center, { latitude: h.latitude, longitude: h.longitude }) : null

  // Fehler beim Nachladen weiterer Seiten zeigen wir unter der Liste, nicht statt der Liste.
  const error = search.error instanceof ApiError && !search.isFetchNextPageError ? search.error : null
  const toggle = (patch: Partial<HotelFilters>, active: boolean) =>
    setFilters((f) => ({
      ...f,
      ...(active ? Object.fromEntries(Object.keys(patch).map((k) => [k, noFilters[k as keyof HotelFilters]])) : patch),
    }))

  return (
    <div className="flex flex-col gap-5">
      <section
        aria-label="Hotelsuche"
        className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-[18px] border border-line bg-surface p-5"
      >
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-[13px] font-bold text-muted">Suche für</span>
          <span className="text-lg font-extrabold">{stage.name}</span>
          <span className="text-sm text-muted">
            {formatDateRange(stage.startDate, stage.endDate)} · {nightsLabel(stage.nights)} · {peopleLabel(trip.travelers)}
          </span>
        </div>
        {!google && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold text-muted" id="rooms-label">
              Zimmer
            </span>
            <div className="flex h-11 items-center gap-1 rounded-xl bg-surface-2 px-1" role="group" aria-labelledby="rooms-label">
              <button
                type="button"
                aria-label="Ein Zimmer weniger"
                disabled={rooms <= 1}
                onClick={() => setRooms(rooms - 1)}
                className="flex size-9 cursor-pointer items-center justify-center rounded-lg hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Minus size={16} />
              </button>
              <span className="w-8 text-center font-mono font-semibold" aria-live="polite">
                {rooms}
              </span>
              <button
                type="button"
                aria-label="Ein Zimmer mehr"
                disabled={rooms >= trip.travelers}
                onClick={() => setRooms(rooms + 1)}
                className="flex size-9 cursor-pointer items-center justify-center rounded-lg hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-muted">Umkreis</span>
          <select
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="h-11 rounded-xl border border-line bg-surface-2 px-3 text-[15px] font-semibold"
          >
            {radiusOptions.map((r) => (
              <option key={r} value={r}>
                {r / 1000} km
              </option>
            ))}
          </select>
        </label>
        <Button variant="primary" size="lg" icon={<Search size={18} />} onClick={runSearch} disabled={search.isFetching}>
          {search.isFetching && !search.isFetchingNextPage ? 'Suche läuft …' : 'Hotels suchen'}
        </Button>
        {status?.quota && <QuotaBadge quota={status.quota} />}
      </section>

      {!params ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted">
          Ort, Daten und Personen kommen aus der Etappe.{' '}
          {google &&
            'Preise kommen von Google Hotels und vergleichen Booking.com, Expedia & Co. – eine Suche liefert ca. 20 Hotels, weitere kosten je eine Google-Suche. '}
          Gefundene Hotels kannst du mit „Merken“ als Favorit speichern – sie erscheinen dann unter „Gespeichert“ und später in der
          Checkliste.
        </p>
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => void search.refetch()} />
      ) : search.isPending ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="mr-2 text-lg font-extrabold">
              {hotels.length === result!.hotels.length ? `${hotels.length} frei` : `${hotels.length} von ${result!.hotels.length} frei`}
              {showUnavailable && nearby.data && <span className="text-danger"> · {soldOut.length} ausgebucht</span>}
            </span>
            {google && result!.searchedFor && result!.searchedFor !== `Hotels ${stage.name}` && (
              <span
                className="rounded-full border border-line px-2.5 py-1 text-xs text-muted"
                title={`Google kennt „${stage.name}“ nicht als Ort – deshalb wurde mit dem nächstgrößeren Ort bzw. der Region gesucht.`}
              >
                Gesucht: „{result!.searchedFor}“
              </span>
            )}
            {result!.sandbox && (
              <span
                className="flex items-center gap-1.5 rounded-full border border-star/50 px-2.5 py-1 text-xs font-bold text-star"
                title="Mit einem Sandbox-Key liefert LiteAPI möglicherweise Testpreise."
              >
                <TriangleAlert size={13} />
                Sandbox – Preise evtl. Testdaten
              </span>
            )}
            {!google && (
              <Chip active={filters.refundableOnly} onClick={() => toggle({ refundableOnly: true }, filters.refundableOnly)}>
                Kostenlos stornierbar
              </Chip>
            )}
            <Chip active={filters.minRating === 8} onClick={() => toggle({ minRating: 8 }, filters.minRating === 8)}>
              Bewertung 8+
            </Chip>
            <Chip active={filters.minStars === 4} onClick={() => toggle({ minStars: 4 }, filters.minStars === 4)}>
              4 Sterne+
            </Chip>
            <Chip active={showUnavailable} danger onClick={() => setShowUnavailable(!showUnavailable)}>
              Ausgebuchte zeigen
            </Chip>
            {splitCounts.length > 1 && !google && (
              <Chip active={compareSplits} onClick={() => setCompareSplits(!compareSplits)}>
                Aufteilungen vergleichen
              </Chip>
            )}
            <Button
              variant="secondary"
              size="sm"
              icon={<CalendarSearch size={15} />}
              onClick={() => {
                // Ausgebuchte gehören in die Auswahl – dafür die Liste laden.
                setShowUnavailable(true)
                setAlternativesFor([])
              }}
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
                onChange={(e) => setSort(e.target.value as HotelSort)}
                className="h-10 rounded-xl border border-line bg-surface px-3 font-semibold text-text"
              >
                <option value="price">Preis</option>
                <option value="rating">Bewertung</option>
                <option value="distance">Entfernung</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-start gap-6">
            <section
              aria-label="Suchergebnisse"
              className={clsx('flex min-w-0 flex-[1_1_520px] flex-col gap-3', view === 'map' && 'max-xl:hidden')}
            >
              {hotels.length === 0 && !(showUnavailable && soldOut.length > 0) ? (
                <EmptyState
                  icon={<SearchX size={22} />}
                  title={result!.hotels.length === 0 ? 'Keine freien Hotels gefunden' : 'Nichts passt zu den Filtern'}
                  text={
                    result!.hotels.length === 0
                      ? google
                        ? `Google hat für „${result!.searchedFor ?? stage.name}“ keine freien Hotels im Umkreis gefunden. Versuch einen größeren Umkreis oder benenne die Etappe nach dem nächsten größeren Ort.`
                        : 'Versuch einen größeren Umkreis – oder schalte „Ausgebuchte zeigen“ ein und prüfe andere Daten.'
                      : 'Entferne einen Filter, um mehr Hotels zu sehen.'
                  }
                />
              ) : (
                hotels.map((hotel) => (
                  <HotelResultCard
                    key={`${hotel.hotelId}:${result!.rooms}`}
                    hotel={hotel}
                    nights={nights}
                    travelers={trip.travelers}
                    rooms={result!.rooms}
                    google={google}
                    splits={splitPrices.get(hotel.hotelId)}
                    onPickRooms={pickRooms}
                    distanceKm={distanceOf(hotel)}
                    saved={savedIds.has(hotel.hotelId)}
                    saving={savingId === hotel.hotelId}
                    selected={selectedId === hotel.hotelId}
                    onSave={save}
                    onSelect={() => setSelectedId(hotel.hotelId)}
                  />
                ))
              )}
              {search.hasNextPage && (
                <Button
                  variant="secondary"
                  onClick={() => void search.fetchNextPage()}
                  disabled={search.isFetchingNextPage}
                  className="self-center"
                >
                  {search.isFetchingNextPage ? 'Lädt …' : 'Weitere Hotels laden (1 Google-Suche)'}
                </Button>
              )}
              {search.isFetchNextPageError && (
                <p className="text-center text-sm text-danger">
                  {search.error instanceof ApiError ? search.error.message : 'Weitere Hotels konnten nicht geladen werden.'}
                </p>
              )}
              {showUnavailable && (
                <div className="mt-3 flex flex-col gap-3" aria-label="Ausgebuchte Hotels" role="group">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-danger">
                    <span className="h-px flex-1 bg-danger/40" />
                    Für deine Daten ausgebucht
                    <span className="h-px flex-1 bg-danger/40" />
                  </h3>
                  {nearby.isPending ? (
                    [0, 1].map((i) => <Skeleton key={i} className="h-32" />)
                  ) : nearby.error ? (
                    <ErrorState
                      message={nearby.error instanceof ApiError ? nearby.error.message : 'Ausgebuchte Hotels konnten nicht geladen werden.'}
                      onRetry={() => void nearby.refetch()}
                    />
                  ) : soldOut.length === 0 ? (
                    <p className="text-center text-sm text-muted">Keine ausgebuchten Hotels im Umkreis gefunden.</p>
                  ) : (
                    soldOut.map((hotel) => (
                      <UnavailableHotelCard
                        key={hotel.hotelId}
                        hotel={hotel}
                        distanceKm={distanceOf(hotel)}
                        selected={selectedId === hotel.hotelId}
                        onSelect={() => setSelectedId(hotel.hotelId)}
                        onCheckDates={() => setAlternativesFor([hotel.hotelId])}
                      />
                    ))
                  )}
                </div>
              )}
            </section>
            <aside aria-label="Karte" className={clsx('sticky top-4 min-w-0 flex-[1_1_420px]', view === 'list' && 'max-xl:hidden')}>
              <TripMap
                label="Karte der Suchergebnisse"
                pins={pins}
                stages={stageMarker}
                selectedId={selectedId}
                onSelect={selectFromMap}
                fitTo="pins"
                className="h-[calc(100dvh-140px)] max-h-[860px] min-h-[420px] max-xl:h-[calc(100dvh-90px)]"
              />
            </aside>
          </div>
        </>
      )}

      <AlternativesDialog
        open={alternativesFor !== null}
        onClose={() => setAlternativesFor(null)}
        candidates={candidates}
        initialSelected={alternativesFor ?? []}
        stay={{
          checkin: stage.startDate,
          checkout: stage.endDate,
          adults: trip.travelers,
          rooms: params?.rooms ?? rooms,
          place: stage.name,
        }}
        perHotel={google}
        pickLabel="Merken"
        isPicked={isAlternativeSaved}
        onPick={saveAlternative}
      />
    </div>
  )
}

function pinFor(
  hotel: { hotelId: string; latitude: number | null; longitude: number | null },
  label: string,
  title: string,
  tone: PinTone,
): MapPin[] {
  if (hotel.latitude == null || hotel.longitude == null) return []
  return [{ id: hotel.hotelId, position: { latitude: hotel.latitude, longitude: hotel.longitude }, label, title, tone }]
}

function SetupHint({ provider }: { provider: HotelSearchStatus['provider'] }) {
  if (provider === 'serpapi') {
    return (
      <section className="flex flex-col gap-3 rounded-[20px] border border-dashed border-line p-6">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <KeyRound size={22} />
        </span>
        <h3 className="text-lg font-extrabold">Hotelsuche einrichten</h3>
        <p className="max-w-2xl text-[15px] leading-relaxed text-muted">
          Die Hotelsuche nutzt Google Hotels über SerpApi (derselbe Key wie die Flugsuche). Hinterlege ihn einmal im Terminal (im Ordner
          <code className="mx-1 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[13px]">backend/src/Urlaubsplanner.Api</code>) und starte
          das Backend neu:
        </p>
        <pre className="overflow-x-auto rounded-xl bg-surface-2 p-4 font-mono text-[13px]">
          dotnet user-secrets set "SerpApi:ApiKey" "…"
        </pre>
      </section>
    )
  }
  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-dashed border-line p-6">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <KeyRound size={22} />
      </span>
      <h3 className="text-lg font-extrabold">Hotelsuche einrichten</h3>
      <p className="max-w-2xl text-[15px] leading-relaxed text-muted">
        Für die Suche braucht das Backend deinen LiteAPI-Key. Hinterlege ihn einmal im Terminal (im Ordner
        <code className="mx-1 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[13px]">backend/src/Urlaubsplanner.Api</code>) und starte
        das Backend neu:
      </p>
      <pre className="overflow-x-auto rounded-xl bg-surface-2 p-4 font-mono text-[13px]">
        dotnet user-secrets set "LiteApi:ApiKey" "sand_…"
      </pre>
      <p className="text-sm text-muted">Bis dahin kannst du Hotels unter „Gespeichert“ weiterhin manuell mit Link eintragen.</p>
    </section>
  )
}

function Chip({ active, danger, onClick, children }: { active: boolean; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'h-[38px] cursor-pointer rounded-full border px-3.5 text-sm font-semibold transition-colors duration-100',
        active
          ? danger
            ? 'border-danger bg-danger text-danger-ink'
            : 'border-accent bg-accent text-accent-ink'
          : 'border-line bg-surface hover:bg-surface-3',
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
