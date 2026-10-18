import clsx from 'clsx'
import { LoaderCircle, Search, SearchX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PAGE_SIZE, useActivityPages, type ActivityCategory, type ActivitySort, type ActivitySuggestion } from '../../api/activities'
import { ApiError } from '../../api/client'
import { useDebouncedValue } from '../../api/places'
import { useTripActions } from '../../api/trips'
import type { LatLng, Stage, Trip } from '../../api/types'
import { TripMap } from '../../components/map/TripMap'
import type { MapPin } from '../../components/map/types'
import { Button } from '../../components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback'
import { activityOptionInput, categoryLabels, routeFromHotelUrl, stageHotel } from '../../lib/activities'
import { toLatLng } from '../../lib/geo'
import { stageMarkers } from '../../lib/mapData'
import { ActivityCard } from './ActivityCard'
import { CategoryIcon } from './CategoryIcon'

const radiusOptions = [2000, 5000, 10_000, 20_000, 50_000]

interface ActivitySuggestionsViewProps {
  trip: Trip
  stage: Stage | null
  onEditStage: () => void
}

/** Vorschläge für eine Etappe aus OpenStreetMap und Wikidata – kostenlos, deshalb lädt die Liste sofort. */
export function ActivitySuggestionsView({ trip, stage, onEditStage }: ActivitySuggestionsViewProps) {
  const center = useMemo(() => toLatLng(stage), [stage])

  if (!stage) {
    return (
      <EmptyState
        icon={<SearchX size={22} />}
        title="Noch keine Etappe"
        text="Leg in der Übersicht eine Etappe mit Ort an – danach gibt es hier Vorschläge für Sehenswürdigkeiten, Museen, Strände und mehr."
      />
    )
  }
  if (!center) {
    return (
      <EmptyState
        icon={<SearchX size={22} />}
        title={`${stage.name} hat noch keinen Ort`}
        text="Für Vorschläge braucht die Etappe einen Ort auf der Karte. Bearbeite sie und wähle einen Vorschlag aus der Liste."
        action={
          <Button variant="primary" onClick={onEditStage}>
            Etappe bearbeiten
          </Button>
        }
      />
    )
  }

  return <Suggestions key={stage.id} trip={trip} stage={stage} center={center} />
}

function Suggestions({ trip, stage, center }: { trip: Trip; stage: Stage; center: LatLng }) {
  const actions = useTripActions(trip.id)
  const hotel = stageHotel(trip, stage.id)
  const [radius, setRadius] = useState(5000)
  const [category, setCategory] = useState<ActivityCategory | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<ActivitySort>('Popular')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'map'>('list')

  const debouncedQuery = useDebouncedValue(query, 300)
  const filter = useMemo(() => ({ category, query: debouncedQuery, sort }), [category, debouncedQuery, sort])
  const suggestions = useActivityPages(center, radius, filter)
  const pages = suggestions.data?.pages
  const shown = useMemo(() => pages?.flatMap((p) => p.activities) ?? [], [pages])
  const total = pages?.[0]?.total ?? 0
  const counts = pages?.[0]?.categories ?? []
  const allCount = counts.reduce((n, c) => n + c.count, 0)
  // Während neue Daten laden (z. B. anderer Umkreis), bleibt die alte Liste stehen – sichtbar als „wird aktualisiert“.
  const refreshing = suggestions.isPlaceholderData
  const shownRadius = pages?.[0]?.radiusMeters
  const radiusChanging = refreshing && shownRadius !== undefined && shownRadius !== radius

  // Am Ende der Liste automatisch die nächsten 10 laden.
  const sentinel = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = suggestions
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const savedIds = useMemo(
    () => new Set(trip.options.filter((o) => o.kind === 'Activity' && o.provider === 'osm').map((o) => o.externalId)),
    [trip.options],
  )

  const pins = useMemo<MapPin[]>(
    () =>
      shown.map((a) => ({
        id: a.id,
        position: { latitude: a.latitude, longitude: a.longitude },
        label: a.name.length > 18 ? `${a.name.slice(0, 17)}…` : a.name,
        title: a.name,
        tone: savedIds.has(a.id) ? 'favorite' : 'idea',
      })),
    [shown, savedIds],
  )
  const stageMarker = useMemo(() => stageMarkers(trip.stages).filter((s) => s.id === stage.id), [trip.stages, stage.id])

  const save = (a: ActivitySuggestion) => {
    setSavingId(a.id)
    actions.addOption.mutate(activityOptionInput(a, stage.id), { onSettled: () => setSavingId(null) })
  }

  const selectFromMap = useCallback((id: string | null) => {
    setSelectedId(id)
    if (id) {
      requestAnimationFrame(() =>
        document.querySelector(`[data-activity-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
      )
    }
  }, [])

  const error = suggestions.error instanceof ApiError ? suggestions.error : null

  return (
    <div className="flex flex-col gap-5">
      <section
        aria-label="Vorschläge"
        className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-[18px] border border-line bg-surface p-5"
      >
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-[13px] font-bold text-muted">Vorschläge für</span>
          <span className="text-lg font-extrabold">{stage.name}</span>
          <span className="text-sm text-muted">Sehenswürdigkeiten, Museen, Aussichtspunkte, Natur und mehr – bekannteste zuerst</span>
        </div>
        <label className="relative flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-muted">Suchen</span>
          <Search size={16} className="pointer-events-none absolute bottom-3.5 left-3 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="z. B. Kloster"
            className="h-11 w-56 rounded-xl border border-line bg-surface-2 pl-9 pr-3 text-[15px]"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-[13px] font-bold text-muted">
            Umkreis
            {radiusChanging && <LoaderCircle size={13} className="animate-spin text-accent" aria-label="lädt" />}
          </span>
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
      </section>

      {error ? (
        <ErrorState message={error.message} onRetry={() => void suggestions.refetch()} />
      ) : suggestions.isPending ? (
        <div className="grid gap-3" aria-busy="true">
          <p className="flex items-center gap-2 text-sm text-muted">
            <LoaderCircle size={15} className="shrink-0 animate-spin text-accent" />
            Suche Vorschläge in OpenStreetMap und Wikipedia … beim ersten Mal kann das bis zu 30 Sekunden dauern, danach sind sie
            gespeichert.
          </p>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : (
        <>
          {refreshing && (
            <div
              role="status"
              className="sticky top-3 z-20 flex items-center gap-3 rounded-2xl border border-accent/40 bg-surface px-4 py-3 text-sm font-semibold text-accent shadow-[0_8px_24px_rgb(0_0_0/0.25)]"
            >
              <LoaderCircle size={18} className="shrink-0 animate-spin" />
              <span>
                {radiusChanging
                  ? `Hole neue Vorschläge für ${radius / 1000} km … das kann bei großem Umkreis bis zu 20 Sekunden dauern.`
                  : 'Aktualisiere Vorschläge …'}
              </span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="mr-2 text-lg font-extrabold">{total === allCount ? `${total} Vorschläge` : `${total} von ${allCount}`}</span>
            <Chip active={category === null} onClick={() => setCategory(null)}>
              Alle
            </Chip>
            {counts.map(({ category: c, count }) => (
              <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? null : c)}>
                <CategoryIcon category={c} size={15} />
                {categoryLabels[c].plural} · {count}
              </Chip>
            ))}
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
                onChange={(e) => setSort(e.target.value as ActivitySort)}
                className="h-10 rounded-xl border border-line bg-surface px-3 font-semibold text-text"
              >
                <option value="Popular">Bekanntheit</option>
                <option value="Distance">Entfernung</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-start gap-6">
            <section
              aria-label="Vorschlagsliste"
              aria-busy={refreshing}
              className={clsx(
                'flex min-w-0 flex-[1_1_520px] flex-col gap-3 transition-opacity duration-150',
                view === 'map' && 'max-xl:hidden',
                refreshing && 'pointer-events-none opacity-50',
              )}
            >
              {shown.length === 0 ? (
                <EmptyState
                  icon={<SearchX size={22} />}
                  title={allCount === 0 && !debouncedQuery ? 'Keine Vorschläge gefunden' : 'Nichts passt zur Suche'}
                  text={
                    allCount === 0 && !debouncedQuery
                      ? 'Versuch einen größeren Umkreis – bei Regionen oder ganzen Ländern z. B. 50 km.'
                      : 'Ändere den Suchtext oder die Kategorie.'
                  }
                />
              ) : (
                shown.map((a) => (
                  <ActivityCard
                    key={a.id}
                    activity={a}
                    saved={savedIds.has(a.id)}
                    saving={savingId === a.id}
                    selected={selectedId === a.id}
                    onSelect={() => setSelectedId(a.id)}
                    onSave={(photo) => save(photo && !a.imageUrl ? { ...a, imageUrl: photo } : a)}
                    routeFromHotel={hotel ? { url: routeFromHotelUrl(hotel, a), hotel: hotel.title } : null}
                  />
                ))
              )}
              {hasNextPage && (
                <div ref={sentinel} className="flex justify-center py-2">
                  <Button
                    variant="secondary"
                    icon={isFetchingNextPage ? <LoaderCircle size={16} className="animate-spin" /> : undefined}
                    disabled={isFetchingNextPage}
                    onClick={() => void fetchNextPage()}
                  >
                    {isFetchingNextPage ? 'Lädt …' : `Weitere ${Math.min(PAGE_SIZE, total - shown.length)} Vorschläge`}
                  </Button>
                </div>
              )}
              {!hasNextPage && shown.length > PAGE_SIZE && (
                <p className="text-center text-sm text-muted">Das waren alle {total} Vorschläge im Umkreis.</p>
              )}
              <p className="text-center text-xs text-muted">
                Daten: ©{' '}
                <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">
                  OpenStreetMap
                </a>
                -Mitwirkende · Beschreibungen und Fotos: Wikidata / Wikimedia Commons
              </p>
            </section>
            <aside aria-label="Karte" className={clsx('sticky top-4 min-w-0 flex-[1_1_420px]', view === 'list' && 'max-xl:hidden')}>
              <TripMap
                label="Karte der Vorschläge"
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

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'flex h-[38px] cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors duration-100',
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
