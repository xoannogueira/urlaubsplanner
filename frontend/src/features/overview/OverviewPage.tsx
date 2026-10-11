import { CalendarRange, MapPin, Pencil, Plus, Trash2, TriangleAlert, Users } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useDeleteTrip, useTripActions, useTripSummary } from '../../api/trips'
import type { Stage, TripSummary } from '../../api/types'
import { useTripContext } from '../../components/layout/tripContext'
import { TripMap } from '../../components/map/TripMap'
import { Button, IconButton } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState, ProgressBar, Skeleton } from '../../components/ui/Feedback'
import { formatDateRange, formatEuro, formatShortDate, nightsLabel } from '../../lib/format'
import { distanceKm, formatDistance, toLatLng } from '../../lib/geo'
import { stageMarkers } from '../../lib/mapData'
import { kindLabels } from '../../lib/options'
import { TripFormDialog } from '../trips/TripFormDialog'
import { StageFormDialog } from './StageFormDialog'

export function OverviewPage() {
  const { trip } = useTripContext()
  const { data: summary } = useTripSummary(trip.id)
  const actions = useTripActions(trip.id)
  const deleteTrip = useDeleteTrip()
  const navigate = useNavigate()

  const [stageDialog, setStageDialog] = useState<{ stage?: Stage } | null>(null)
  const [stageToDelete, setStageToDelete] = useState<Stage | null>(null)
  const [editTrip, setEditTrip] = useState(false)
  const [confirmDeleteTrip, setConfirmDeleteTrip] = useState(false)

  const lastEnd = trip.stages.at(-1)?.endDate
  const mapStages = useMemo(() => stageMarkers(trip.stages), [trip.stages])
  const stagesWithoutPlace = trip.stages.length - mapStages.length

  return (
    <div className="flex flex-col gap-5 px-4 md:px-8 pb-10 pt-6">
      <Kpis summary={summary} travelers={trip.travelers} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card
          title="Etappen"
          action={
            <Button size="sm" variant="primary" icon={<Plus size={16} strokeWidth={2.5} />} onClick={() => setStageDialog({})}>
              Etappe
            </Button>
          }
        >
          {trip.stages.length === 0 ? (
            <EmptyState
              icon={<MapPin size={22} />}
              title="Noch keine Etappen"
              text="Leg die Orte deiner Reise an, z. B. Lissabon, Porto, Algarve. Hotels und Aktivitäten ordnest du dann den Etappen zu."
            />
          ) : (
            <ol className="flex flex-col gap-2">
              {trip.stages.map((stage, index) => (
                <li key={stage.id} className="flex items-center gap-4 rounded-2xl bg-surface-2 p-3.5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft font-mono text-sm font-semibold text-accent">
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-bold">{stage.name}</span>
                    <span className="text-[13px] text-muted">
                      {formatDateRange(stage.startDate, stage.endDate)} · {nightsLabel(stage.nights)}
                      {legLabel(stage, trip.stages[index + 1])}
                    </span>
                  </div>
                  <span className="hidden font-mono text-sm font-semibold sm:block">
                    {summary ? formatEuro(summary.costByStage.find((c) => c.stageId === stage.id)?.total ?? 0) : ''}
                  </span>
                  <IconButton label={`${stage.name} bearbeiten`} onClick={() => setStageDialog({ stage })}>
                    <Pencil size={16} />
                  </IconButton>
                  <IconButton label={`${stage.name} löschen`} onClick={() => setStageToDelete(stage)}>
                    <Trash2 size={16} />
                  </IconButton>
                </li>
              ))}
            </ol>
          )}
          {summary && summary.gaps.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {summary.gaps.map((gap) => (
                <li
                  key={`${gap.kind}-${gap.stageId}-${gap.from}`}
                  className="flex items-start gap-2.5 rounded-xl bg-surface-2 px-3.5 py-3 text-sm"
                >
                  <TriangleAlert size={16} className="mt-0.5 shrink-0 text-star" />
                  <span>
                    {gap.kind === 'MissingHotel' ? (
                      <>
                        <strong>{gap.stageName}:</strong> kein Hotel für {formatShortDate(gap.from)} – {formatShortDate(gap.to)}
                      </>
                    ) : (
                      <>
                        <strong>Zwischen zwei Etappen</strong> ist {formatShortDate(gap.from)} – {formatShortDate(gap.to)} keinem Ort
                        zugeordnet
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-5">
          {trip.stages.length > 0 && (
            <Card title="Route">
              <TripMap label="Karte der Reiseroute" stages={mapStages} pins={[]} showRoute className="h-80" />
              <p className="text-[13px] leading-relaxed text-muted">
                {stagesWithoutPlace > 0
                  ? `${stagesWithoutPlace === 1 ? '1 Etappe hat' : `${stagesWithoutPlace} Etappen haben`} noch keinen Ort – beim Bearbeiten einen Vorschlag wählen.`
                  : 'Die Nummern zeigen die Reihenfolge der Etappen.'}
              </p>
            </Card>
          )}
          <Card title="Kosten nach Kategorie">
            {!summary ? (
              <Skeleton className="h-28" />
            ) : summary.costByKind.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted">
                Sobald du Optionen auf „Ausgewählt“ oder „Gebucht“ setzt, erscheinen hier die Kosten.
              </p>
            ) : (
              <ul className="flex flex-col">
                {summary.costByKind.map((k) => (
                  <li key={k.kind} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
                    <span className="flex-1 font-semibold">{kindLabels[k.kind].plural}</span>
                    <span className="text-[13px] text-muted">{k.count}×</span>
                    <span className="w-28 text-right font-mono font-semibold">{formatEuro(k.total)}</span>
                  </li>
                ))}
              </ul>
            )}
            {summary && summary.missingPriceCount > 0 && (
              <p className="mt-3 text-[13px] text-muted">
                {summary.missingPriceCount === 1 ? '1 gewählte Option hat' : `${summary.missingPriceCount} gewählte Optionen haben`} noch
                keinen Preis.
              </p>
            )}
          </Card>

          <Card title="Reise">
            {trip.notes && <p className="mb-4 whitespace-pre-line text-sm leading-relaxed text-muted">{trip.notes}</p>}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={<Pencil size={15} />} onClick={() => setEditTrip(true)}>
                Bearbeiten
              </Button>
              <Button size="sm" variant="danger" icon={<Trash2 size={15} />} onClick={() => setConfirmDeleteTrip(true)}>
                Reise löschen
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <StageFormDialog
        open={stageDialog !== null}
        stage={stageDialog?.stage}
        suggestedStart={lastEnd}
        onClose={() => setStageDialog(null)}
        onSubmit={(input) =>
          stageDialog?.stage ? actions.updateStage.mutateAsync({ id: stageDialog.stage.id, input }) : actions.addStage.mutateAsync(input)
        }
      />
      <ConfirmDialog
        open={stageToDelete !== null}
        title="Etappe löschen?"
        message={`„${stageToDelete?.name}“ wird entfernt. Gespeicherte Hotels, Flüge und Aktivitäten bleiben erhalten und gelten danach für die ganze Reise.`}
        confirmLabel="Löschen"
        onClose={() => setStageToDelete(null)}
        onConfirm={() => {
          if (stageToDelete) actions.removeStage.mutate(stageToDelete.id)
          setStageToDelete(null)
        }}
      />
      <TripFormDialog
        open={editTrip}
        trip={trip}
        onClose={() => setEditTrip(false)}
        onSubmit={(input) => actions.updateTrip.mutateAsync(input)}
      />
      <ConfirmDialog
        open={confirmDeleteTrip}
        title="Reise löschen?"
        message={`„${trip.name}“ mit allen Etappen und gespeicherten Optionen wird endgültig gelöscht.`}
        confirmLabel="Endgültig löschen"
        pending={deleteTrip.isPending}
        onClose={() => setConfirmDeleteTrip(false)}
        onConfirm={() => deleteTrip.mutate(trip.id, { onSuccess: () => void navigate('/') })}
      />
    </div>
  )
}

/** " · 275 km bis Porto" – nur wenn beide Etappen einen Ort haben. */
function legLabel(stage: Stage, next: Stage | undefined): string {
  const from = toLatLng(stage)
  const to = toLatLng(next)
  return next && from && to ? ` · ${formatDistance(distanceKm(from, to))} bis ${next.name}` : ''
}

function Kpis({ summary, travelers }: { summary?: TripSummary; travelers: number }) {
  if (!summary) {
    return (
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
      <Kpi label="Gesamtkosten" value={formatEuro(summary.totalCost)} sub={`${formatEuro(summary.costPerPerson)} pro Person`} />
      <Kpi
        label="Reisedauer"
        value={summary.days ? `${summary.days} ${summary.days === 1 ? 'Tag' : 'Tage'}` : '–'}
        sub={
          summary.days
            ? `${nightsLabel(summary.nights)} · ${summary.stageCount} ${summary.stageCount === 1 ? 'Ort' : 'Orte'}`
            : 'Zeitraum offen'
        }
        icon={<CalendarRange size={16} />}
      />
      <Kpi label="Personen" value={String(travelers)} sub={`Preise „pro Person“ × ${travelers}`} icon={<Users size={16} />} />
      <div className="flex flex-col gap-2 rounded-[18px] border border-line bg-surface p-5">
        <span className="text-[13px] font-bold text-muted">Gebucht</span>
        <span className="font-mono text-[34px] font-semibold leading-tight">
          {summary.bookedCount} / {summary.chosenCount}
        </span>
        <ProgressBar value={summary.bookedCount} max={summary.chosenCount} label="Buchungsfortschritt" />
      </div>
    </div>
  )
}

function Kpi({ label, value, sub, icon }: { label: string; value: string; sub: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-[18px] border border-line bg-surface p-5">
      <span className="flex items-center gap-1.5 text-[13px] font-bold text-muted">
        {icon}
        {label}
      </span>
      <span className="font-mono text-[34px] font-semibold leading-tight tracking-tight">{value}</span>
      <span className="text-[13px] text-muted">{sub}</span>
    </div>
  )
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-[18px] border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-extrabold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
