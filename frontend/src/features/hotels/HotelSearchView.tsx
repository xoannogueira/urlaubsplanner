import clsx from 'clsx'
import { KeyRound, Minus, Plus, Search, SearchX, TriangleAlert } from 'lucide-react'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { ApiError } from '../../api/client'
import { useHotelSearch, useHotelSearchStatus, type HotelOffer, type HotelSearchParams } from '../../api/hotels'
import { useTripActions } from '../../api/trips'
import type { Stage, Trip } from '../../api/types'
import { TripMap } from '../../components/map/TripMap'
import type { MapPin } from '../../components/map/types'
import { Button } from '../../components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback'
import { formatDateRange, formatEuro, nightsLabel, peopleLabel } from '../../lib/format'
import { distanceKm, toLatLng } from '../../lib/geo'
import { defaultRooms, filterAndSortHotels, hotelNotes, noFilters, type HotelFilters, type HotelSort } from '../../lib/hotels'
import { stageMarkers } from '../../lib/mapData'
import { HotelResultCard } from './HotelResultCard'

const radiusOptions = [1000, 3000, 5000, 10_000]

interface HotelSearchViewProps {
  trip: Trip
  /** Etappe, für die gesucht wird (Ort und Daten kommen von dort). */
  stage: Stage | null
  onEditStage: () => void
}

/** Hotelsuche über LiteAPI für eine Etappe: Ergebnisse als Liste und als Preis-Pins auf der Karte. */
export function HotelSearchView({ trip, stage, onEditStage }: HotelSearchViewProps) {
  const status = useHotelSearchStatus()
  // Stabiles Objekt, damit Liste und Karte nicht bei jedem Rendern neu rechnen.
  const center = useMemo(() => toLatLng(stage), [stage])

  if (status.data && !status.data.configured) return <SetupHint />
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

  return <SearchArea key={stage.id} trip={trip} stage={stage} center={center} />
}

function SearchArea({ trip, stage, center }: { trip: Trip; stage: Stage; center: { latitude: number; longitude: number } }) {
  const actions = useTripActions(trip.id)
  const [rooms, setRooms] = useState(() => Math.min(defaultRooms(trip.travelers), trip.travelers))
  const [radius, setRadius] = useState(3000)
  const [params, setParams] = useState<HotelSearchParams | null>(null)
  const [filters, setFilters] = useState<HotelFilters>(noFilters)
  const [sort, setSort] = useState<HotelSort>('price')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'map'>('list')

  const search = useHotelSearch(params)
  const result = search.data
  const nights = result?.nights ?? stage.nights

  const savedIds = useMemo(
    () => new Set(trip.options.filter((o) => o.provider === 'liteapi' && o.stageId === stage.id).map((o) => o.externalId)),
    [trip.options, stage.id],
  )

  const hotels = useMemo(() => filterAndSortHotels(result?.hotels ?? [], filters, sort, center), [result, filters, sort, center])

  const pins = useMemo<MapPin[]>(
    () =>
      hotels.flatMap((h) =>
        h.latitude != null && h.longitude != null
          ? [
              {
                id: h.hotelId,
                position: { latitude: h.latitude, longitude: h.longitude },
                label: formatEuro(h.totalPrice),
                title: h.name,
                tone: savedIds.has(h.hotelId) ? ('favorite' as const) : ('idea' as const),
              },
            ]
          : [],
      ),
    [hotels, savedIds],
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
    })
  }

  const save = (hotel: HotelOffer) => {
    setSavingId(hotel.hotelId)
    actions.addOption.mutate(
      {
        kind: 'Hotel',
        title: hotel.name,
        status: 'Favorite',
        stageId: stage.id,
        url: hotel.bookingUrl,
        price: hotel.totalPrice,
        pricePerPerson: false,
        startDate: stage.startDate,
        endDate: stage.endDate,
        locationName: hotel.address,
        latitude: hotel.latitude,
        longitude: hotel.longitude,
        notes: hotelNotes(hotel),
        imageUrl: hotel.photoUrl,
        provider: 'liteapi',
        externalId: hotel.hotelId,
      },
      { onSettled: () => setSavingId(null) },
    )
  }

  const selectFromMap = useCallback((id: string | null) => {
    setSelectedId(id)
    if (id) {
      requestAnimationFrame(() =>
        document.querySelector(`[data-hotel-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
      )
    }
  }, [])

  const distanceOf = (h: HotelOffer) =>
    h.latitude != null && h.longitude != null ? distanceKm(center, { latitude: h.latitude, longitude: h.longitude }) : null

  const error = search.error instanceof ApiError ? search.error : null
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
          {search.isFetching ? 'Suche läuft …' : 'Hotels suchen'}
        </Button>
      </section>

      {!params ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-muted">
          Ort, Daten und Personen kommen aus der Etappe. Gefundene Hotels kannst du mit „Merken“ als Favorit speichern – sie erscheinen dann
          unter „Gespeichert“ und später in der Checkliste.
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
              {hotels.length === result!.hotels.length ? `${hotels.length} Hotels` : `${hotels.length} von ${result!.hotels.length} Hotels`}
            </span>
            {result!.sandbox && (
              <span
                className="flex items-center gap-1.5 rounded-full border border-star/50 px-2.5 py-1 text-xs font-bold text-star"
                title="Mit einem Sandbox-Key liefert LiteAPI möglicherweise Testpreise."
              >
                <TriangleAlert size={13} />
                Sandbox – Preise evtl. Testdaten
              </span>
            )}
            <Chip active={filters.refundableOnly} onClick={() => toggle({ refundableOnly: true }, filters.refundableOnly)}>
              Kostenlos stornierbar
            </Chip>
            <Chip active={filters.minRating === 8} onClick={() => toggle({ minRating: 8 }, filters.minRating === 8)}>
              Bewertung 8+
            </Chip>
            <Chip active={filters.minStars === 4} onClick={() => toggle({ minStars: 4 }, filters.minStars === 4)}>
              4 Sterne+
            </Chip>
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
              {hotels.length === 0 ? (
                <EmptyState
                  icon={<SearchX size={22} />}
                  title={result!.hotels.length === 0 ? 'Keine freien Hotels gefunden' : 'Nichts passt zu den Filtern'}
                  text={
                    result!.hotels.length === 0
                      ? 'Versuch einen größeren Umkreis oder andere Daten.'
                      : 'Entferne einen Filter, um mehr Hotels zu sehen.'
                  }
                />
              ) : (
                hotels.map((hotel) => (
                  <HotelResultCard
                    key={hotel.hotelId}
                    hotel={hotel}
                    nights={nights}
                    distanceKm={distanceOf(hotel)}
                    saved={savedIds.has(hotel.hotelId)}
                    saving={savingId === hotel.hotelId}
                    selected={selectedId === hotel.hotelId}
                    onSave={() => save(hotel)}
                    onSelect={() => setSelectedId(hotel.hotelId)}
                  />
                ))
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
    </div>
  )
}

function SetupHint() {
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
