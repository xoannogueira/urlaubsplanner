import clsx from 'clsx'
import { BedDouble, Compass, Plane, Plus } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTripActions } from '../../api/trips'
import type { OptionKind, OptionStatus, TripOption } from '../../api/types'
import { useTripContext } from '../../components/layout/tripContext'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/Feedback'
import { formatDateRange, nightsLabel } from '../../lib/format'
import { kindLabels, sortOptions } from '../../lib/options'
import { OptionCard } from './OptionCard'
import { OptionFormDialog } from './OptionFormDialog'

const icons: Record<OptionKind, ReactNode> = {
  Flight: <Plane size={22} />,
  Hotel: <BedDouble size={22} />,
  Activity: <Compass size={22} />,
  Transport: <Plane size={22} />,
  Other: <Compass size={22} />,
}

const upcoming: Partial<Record<OptionKind, string>> = {
  Flight: 'Die automatische Flugsuche mit Umkreis-Flughäfen und Karte kommt in Phase 4.',
  Hotel: 'Die Hotelsuche mit Karte und Preis-Pins kommt in Phase 2 und 3.',
  Activity: 'Vorschläge für Sehenswürdigkeiten und Aktivitäten kommen in Phase 5.',
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

  const ofKind = useMemo(() => trip.options.filter((o) => o.kind === kind), [trip.options, kind])
  const stageById = useMemo(() => new Map(trip.stages.map((s) => [s.id, s])), [trip.stages])

  const visible = sortOptions(
    ofKind.filter((o) => {
      const stageOk = stageFilter === ALL || (stageFilter === GENERAL ? !o.stageId : o.stageId === stageFilter)
      const statusOk =
        statusFilter === 'all' || (statusFilter === 'Favorite' ? o.status === 'Favorite' : o.status === 'Selected' || o.status === 'Booked')
      return stageOk && statusOk
    }),
  )

  const count = (pred: (o: TripOption) => boolean) => ofKind.filter(pred).length
  const labels = kindLabels[kind]
  const defaultStage =
    stageFilter !== ALL && stageFilter !== GENERAL ? stageFilter : kind === 'Flight' ? null : (trip.stages[0]?.id ?? null)

  const setStatus = (option: TripOption, status: OptionStatus) => actions.setStatus.mutate({ id: option.id, status })

  return (
    <div className="flex flex-col gap-5 px-4 md:px-8 pb-10 pt-5">
      <div role="tablist" aria-label="Etappen" className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
        <StageTab active={stageFilter === ALL} onClick={() => setStageFilter(ALL)} title="Alle" sub={`${ofKind.length} gespeichert`} />
        {trip.stages.map((s) => {
          const chosen = count((o) => o.stageId === s.id && (o.status === 'Selected' || o.status === 'Booked'))
          return (
            <StageTab
              key={s.id}
              active={stageFilter === s.id}
              onClick={() => setStageFilter(s.id)}
              title={s.name}
              sub={`${formatDateRange(s.startDate, s.endDate)} · ${nightsLabel(s.nights)}`}
              dot={chosen > 0 ? 'done' : 'open'}
            />
          )
        })}
        <StageTab
          active={stageFilter === GENERAL}
          onClick={() => setStageFilter(GENERAL)}
          title="Ganze Reise"
          sub={`${count((o) => !o.stageId)} ohne Etappe`}
        />
      </div>

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
        <Button variant="primary" icon={<Plus size={16} strokeWidth={2.5} />} onClick={() => setDialog({})}>
          {labels.singular} speichern
        </Button>
      </div>

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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
          {visible.map((option) => (
            <OptionCard
              key={option.id}
              option={option}
              stage={option.stageId ? stageById.get(option.stageId) : undefined}
              travelers={trip.travelers}
              onStatus={(status) => setStatus(option, status)}
              onEdit={() => setDialog({ option })}
              onDelete={() => setToDelete(option)}
            />
          ))}
        </div>
      )}

      {upcoming[kind] && <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-[13px] text-muted">{upcoming[kind]}</p>}

      <OptionFormDialog
        open={dialog !== null}
        kind={kind}
        stages={trip.stages}
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
