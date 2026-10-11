import clsx from 'clsx'
import { BedDouble, Compass, ExternalLink, List, Map as MapIcon, MapPinOff, Plane, Plus, Search, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTripActions } from '../../api/trips'
import type { OptionKind, OptionStatus, TripOption } from '../../api/types'
import { useTripContext } from '../../components/layout/tripContext'
import { TripMap } from '../../components/map/TripMap'
import { Button, IconButton } from '../../components/ui/Button'
import { buttonClass } from '../../components/ui/buttonStyles'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/Feedback'
import { formatDateRange, formatEuro, hostOf, nightsLabel } from '../../lib/format'
import { toLatLng } from '../../lib/geo'
import { optionPins, stageMarkers } from '../../lib/mapData'
import { kindLabels, sortOptions } from '../../lib/options'
import { canRecheck } from '../../lib/hotels'
import { canRecheckFlight, parseSignature, savedFlightArcs } from '../../lib/flights'
import { ActivitySuggestionsView } from '../activities/ActivitySuggestionsView'
import { useAirportLookup } from '../../api/airports'
import { FlightRecheck } from '../flights/FlightRecheck'
import { FlightSearchView } from '../flights/FlightSearchView'
import { HotelRecheck } from '../hotels/HotelRecheck'
import { HotelSearchView } from '../hotels/HotelSearchView'
import { OptionCard } from './OptionCard'
import { OptionFormDialog } from './OptionFormDialog'

const icons: Record<OptionKind, ReactNode> = {
  Flight: <Plane size={22} />,
  Hotel: <BedDouble size={22} />,
  Activity: <Compass size={22} />,
  Transport: <Plane size={22} />,
  Other: <Compass size={22} />,
}

type StatusFilter = 'all' | 'Favorite' | 'chosen'
const ALL = 'all'
const GENERAL = 'general'

export function OptionsPage({ kind }: { kind: OptionKind }) {
  const { trip } = useTripContext()
  const actions = useTripActions(trip.id)
  const [stageFilter, setStageFilter] = useState<string>(ALL)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [dialog, setDialog] = useState<{ option?: TripOption } | null>(null)
  const [toDelete, setToDelete] = useState<TripOption | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'map'>('list')
  // Hotels und Flüge: gespeicherte Einträge oder Live-Suche
  const [mode, setMode] = useState<'saved' | 'search'>('saved')
  const searchable = kind === 'Hotel' || kind === 'Flight' || kind === 'Activity'
  const searching = searchable && mode === 'search'
  const navigate = useNavigate()
  // Die Suche braucht eine konkrete Etappe: die gewählte, sonst die erste mit Ort.
  const searchStage = trip.stages.find((s) => s.id === stageFilter) ?? trip.stages.find((s) => s.latitude != null) ?? trip.stages[0] ?? null
  const mapRef = useRef<HTMLElement>(null)
  const showMapView = () => {
    setView('map')
    // Am Handy liegt die Karte unter den Filtern – direkt hinscrollen.
    requestAnimationFrame(() => mapRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }

  const ofKind = useMemo(() => trip.options.filter((o) => o.kind === kind), [trip.options, kind])
  const stageById = useMemo(() => new Map(trip.stages.map((s) => [s.id, s])), [trip.stages])

  const visible = useMemo(
    () =>
      sortOptions(
        ofKind.filter((o) => {
          const stageOk = stageFilter === ALL || (stageFilter === GENERAL ? !o.stageId : o.stageId === stageFilter)
          const statusOk =
            statusFilter === 'all' ||
            (statusFilter === 'Favorite' ? o.status === 'Favorite' : o.status === 'Selected' || o.status === 'Booked')
          return stageOk && statusOk
        }),
      ),
    [ofKind, stageFilter, statusFilter],
  )

  const count = (pred: (o: TripOption) => boolean) => ofKind.filter(pred).length
  const labels = kindLabels[kind]
  const defaultStage =
    stageFilter !== ALL && stageFilter !== GENERAL ? stageFilter : kind === 'Flight' ? null : (trip.stages[0]?.id ?? null)

  const setStatus = (option: TripOption, status: OptionStatus) => actions.setStatus.mutate({ id: option.id, status })

  // Flüge haben meist keinen festen Ort – die Karte erscheint dort nur, wenn es Punkte gibt.
  const showMap = kind !== 'Flight' || ofKind.some((o) => toLatLng(o))
  // Flüge aus der Suche erscheinen als Bögen (siehe unten) – ein Preis-Pin läge dort genau auf dem Flughafen.
  const pins = useMemo(
    () => optionPins(kind === 'Flight' ? visible.filter((o) => !parseSignature(o.externalId)) : visible),
    [kind, visible],
  )
  // Gemerkte Flüge als Bögen zwischen den Flughäfen (aus der gespeicherten Kennung).
  const flightCodes = useMemo(
    () => (kind === 'Flight' ? visible.flatMap((o) => o.externalId?.match(/[A-Z]{3}(?=[-@])/g) ?? []) : []),
    [kind, visible],
  )
  const airportLookup = useAirportLookup(flightCodes)
  const flightArcs = useMemo(
    () => (kind === 'Flight' ? savedFlightArcs(visible, airportLookup.data ?? [], selectedId) : { arcs: [], airports: [] }),
    [kind, visible, airportLookup.data, selectedId],
  )
  const mapStages = useMemo(
    () => stageMarkers(trip.stages).filter((s) => stageFilter === ALL || stageFilter === GENERAL || s.id === stageFilter),
    [trip.stages, stageFilter],
  )
  const withoutLocation = visible.filter((o) => !toLatLng(o)).length
  const selected = visible.find((o) => o.id === selectedId) ?? null

  // Pin auf der Karte angeklickt → passende Karte in der Liste sichtbar machen.
  const selectFromMap = useCallback((id: string | null) => {
    setSelectedId(id)
    if (id) {
      requestAnimationFrame(() =>
        document.querySelector(`[data-option-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
      )
    }
  }, [])

  return (
    <div className="flex flex-col gap-5 px-4 md:px-8 pb-10 pt-5">
      {searchable && (
        <div role="tablist" aria-label={labels.plural} className="flex self-start rounded-xl bg-surface-2 p-1">
          <ModeTab
            active={!searching}
            onClick={() => setMode('saved')}
            icon={kind === 'Flight' ? <Plane size={16} /> : kind === 'Activity' ? <Compass size={16} /> : <BedDouble size={16} />}
          >
            Gespeichert · {ofKind.length}
          </ModeTab>
          <ModeTab active={searching} onClick={() => setMode('search')} icon={<Search size={16} />}>
            {kind === 'Flight' ? 'Flüge suchen' : kind === 'Activity' ? 'Vorschläge' : 'Hotels suchen'}
          </ModeTab>
        </div>
      )}
      {/* Flüge werden für die ganze Reise gesucht – dort keine Etappen-Auswahl. */}
      <div
        role="tablist"
        aria-label="Etappen"
        className={clsx('-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1', searching && kind === 'Flight' && 'hidden')}
      >
        {!searching && (
          <StageTab active={stageFilter === ALL} onClick={() => setStageFilter(ALL)} title="Alle" sub={`${ofKind.length} gespeichert`} />
        )}
        {trip.stages.map((s) => {
          const chosen = count((o) => o.stageId === s.id && (o.status === 'Selected' || o.status === 'Booked'))
          return (
            <StageTab
              key={s.id}
              active={searching ? searchStage?.id === s.id : stageFilter === s.id}
              onClick={() => setStageFilter(s.id)}
              title={s.name}
              sub={`${formatDateRange(s.startDate, s.endDate)} · ${nightsLabel(s.nights)}`}
              dot={chosen > 0 ? 'done' : 'open'}
            />
          )
        })}
        {!searching && (
          <StageTab
            active={stageFilter === GENERAL}
            onClick={() => setStageFilter(GENERAL)}
            title="Ganze Reise"
            sub={`${count((o) => !o.stageId)} ohne Etappe`}
          />
        )}
      </div>

      {searching && kind === 'Flight' ? (
        <FlightSearchView trip={trip} />
      ) : searching && kind === 'Activity' ? (
        <ActivitySuggestionsView trip={trip} stage={searchStage} onEditStage={() => void navigate(`/trips/${trip.id}`)} />
      ) : searching ? (
        <HotelSearchView trip={trip} stage={searchStage} onEditStage={() => void navigate(`/trips/${trip.id}`)} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <Chip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
              Alle
            </Chip>
            <Chip active={statusFilter === 'Favorite'} onClick={() => setStatusFilter('Favorite')}>
              Favoriten · {count((o) => o.status === 'Favorite')}
            </Chip>
            <Chip active={statusFilter === 'chosen'} onClick={() => setStatusFilter('chosen')}>
              Ausgewählt & gebucht · {count((o) => o.status === 'Selected' || o.status === 'Booked')}
            </Chip>
            <div className="flex-1" />
            {showMap && (
              <div role="radiogroup" aria-label="Ansicht" className="flex rounded-xl bg-surface-2 p-1 xl:hidden">
                <ViewButton active={view === 'list'} onClick={() => setView('list')} icon={<List size={16} />}>
                  Liste
                </ViewButton>
                <ViewButton active={view === 'map'} onClick={showMapView} icon={<MapIcon size={16} />}>
                  Karte
                </ViewButton>
              </div>
            )}
            <Button variant="primary" icon={<Plus size={16} strokeWidth={2.5} />} onClick={() => setDialog({})}>
              {labels.singular} speichern
            </Button>
          </div>

          <div className="flex flex-wrap items-start gap-6">
            <section aria-label={labels.plural} className={clsx('min-w-0 flex-[1_1_520px]', showMap && view === 'map' && 'max-xl:hidden')}>
              {visible.length === 0 ? (
                <EmptyState
                  icon={icons[kind]}
                  title={ofKind.length === 0 ? `Noch keine ${labels.plural}` : 'Nichts passt zum Filter'}
                  text={
                    ofKind.length === 0
                      ? `Speichere ${labels.plural} als Link mit Preis, markiere Favoriten und wähle am Ende aus, was gebucht wird.`
                      : 'Ändere die Etappe oder den Statusfilter.'
                  }
                  action={
                    ofKind.length === 0 && (
                      <Button variant="primary" onClick={() => setDialog({})}>
                        {labels.singular} speichern
                      </Button>
                    )
                  }
                />
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
                  {visible.map((option) => (
                    <OptionCard
                      key={option.id}
                      option={option}
                      stage={option.stageId ? stageById.get(option.stageId) : undefined}
                      travelers={trip.travelers}
                      onStatus={(status) => setStatus(option, status)}
                      onEdit={() => setDialog({ option })}
                      onDelete={() => setToDelete(option)}
                      selected={showMap && option.id === selectedId}
                      onSelect={showMap && toLatLng(option) ? () => setSelectedId(option.id) : undefined}
                      extra={
                        canRecheck(option) ? (
                          <HotelRecheck trip={trip} option={option} />
                        ) : canRecheckFlight(option) ? (
                          <FlightRecheck trip={trip} option={option} />
                        ) : undefined
                      }
                    />
                  ))}
                </div>
              )}
            </section>

            {showMap && (
              <aside
                ref={mapRef}
                aria-label="Karte"
                className={clsx(
                  'sticky top-4 flex min-w-0 scroll-mt-4 flex-[1_1_420px] flex-col gap-2',
                  view === 'list' && 'max-xl:hidden',
                )}
              >
                <div className="relative">
                  <TripMap
                    label={`Karte: ${labels.plural}`}
                    pins={pins}
                    arcs={flightArcs.arcs}
                    airports={flightArcs.airports}
                    stages={mapStages}
                    selectedId={selectedId}
                    onSelect={selectFromMap}
                    fitTo="pins"
                    className="h-[calc(100dvh-140px)] max-h-[860px] min-h-[420px] max-xl:h-[calc(100dvh-90px)]"
                  />
                  {selected && <SelectedOverlay option={selected} onClose={() => setSelectedId(null)} />}
                  {pins.length === 0 && mapStages.length === 0 && (
                    <p className="pointer-events-none absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-xl bg-surface px-4 py-3 text-center text-sm text-muted shadow">
                      Wähle beim Speichern einen Ort aus der Liste – dann erscheint hier ein Pin mit Preis.
                    </p>
                  )}
                </div>
                {withoutLocation > 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-muted">
                    <MapPinOff size={13} />
                    {withoutLocation === 1
                      ? '1 Eintrag hat keinen Ort und fehlt auf der Karte.'
                      : `${withoutLocation} Einträge haben keinen Ort und fehlen auf der Karte.`}
                  </p>
                )}
              </aside>
            )}
          </div>
        </>
      )}

      <OptionFormDialog
        open={dialog !== null}
        kind={kind}
        stages={trip.stages}
        trip={trip}
        option={dialog?.option}
        defaultStageId={defaultStage}
        onClose={() => setDialog(null)}
        onSubmit={(input) =>
          dialog?.option ? actions.updateOption.mutateAsync({ id: dialog.option.id, input }) : actions.addOption.mutateAsync(input)
        }
      />
      <ConfirmDialog
        open={toDelete !== null}
        title={`${labels.singular} löschen?`}
        message={`„${toDelete?.title}“ wird aus der Reise entfernt.`}
        confirmLabel="Löschen"
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) actions.removeOption.mutate(toDelete.id)
          setToDelete(null)
        }}
      />
    </div>
  )
}

function SelectedOverlay({ option, onClose }: { option: TripOption; onClose: () => void }) {
  return (
    <div className="absolute inset-x-3 top-3 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-[0_10px_30px_rgb(0_0_0/0.3)]">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-extrabold">{option.title}</span>
        {option.locationName && <span className="truncate text-[13px] text-muted">{option.locationName}</span>}
        <span className="font-mono text-sm font-semibold">{option.totalPrice != null ? formatEuro(option.totalPrice) : 'Preis offen'}</span>
      </div>
      {option.url && (
        <a href={option.url} target="_blank" rel="noopener noreferrer" className={buttonClass('primary', 'md', 'h-10')}>
          <span className="max-w-32 truncate">{hostOf(option.url)}</span>
          <ExternalLink size={14} />
        </a>
      )}
      <IconButton label="Auswahl schließen" onClick={onClose} className="size-9">
        <X size={16} />
      </IconButton>
    </div>
  )
}

function ModeTab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={clsx(
        'flex h-10 cursor-pointer items-center gap-2 rounded-lg px-4 text-sm font-bold transition-colors duration-100',
        active ? 'bg-accent text-accent-ink' : 'text-muted hover:text-text',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function ViewButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={clsx(
        'flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-bold transition-colors duration-100',
        active ? 'bg-accent text-accent-ink' : 'text-muted hover:text-text',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function StageTab({
  active,
  onClick,
  title,
  sub,
  dot,
}: {
  active: boolean
  onClick: () => void
  title: string
  sub: string
  dot?: 'done' | 'open'
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={clsx(
        'flex min-w-[170px] shrink-0 cursor-pointer flex-col items-start gap-1 rounded-xl border px-4 py-3 text-left transition-colors duration-100',
        active ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-surface-3',
      )}
    >
      <span className="flex items-center gap-2 text-[15px] font-bold">
        {dot && <span className={clsx('size-2 rounded-full', dot === 'done' ? 'bg-accent' : 'bg-star')} />}
        {title}
      </span>
      <span className="text-[13px] text-muted">{sub}</span>
    </button>
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
