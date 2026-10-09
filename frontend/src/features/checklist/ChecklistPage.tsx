import clsx from 'clsx'
import { Check, ClipboardCheck, ExternalLink } from 'lucide-react'
import { Link } from 'react-router'
import { useTripActions } from '../../api/trips'
import type { TripOption } from '../../api/types'
import { useTripContext } from '../../components/layout/tripContext'
import { buttonClass } from '../../components/ui/buttonStyles'
import { EmptyState, ProgressBar } from '../../components/ui/Feedback'
import { formatDateRange, formatEuro, hostOf } from '../../lib/format'
import { checklistGroups, isChosen, kindLabels, sumTotals } from '../../lib/options'

/**
 * Alles, was ausgewählt ist, mit Link zum Buchen. Abhaken setzt den Status auf "Gebucht",
 * Aufheben wieder auf "Ausgewählt".
 */
export function ChecklistPage() {
  const { trip } = useTripContext()
  const { setStatus } = useTripActions(trip.id)

  const chosen = trip.options.filter(isChosen)
  const booked = chosen.filter((o) => o.status === 'Booked')
  const groups = checklistGroups(trip)

  if (chosen.length === 0) {
    return (
      <div className="px-4 md:px-8 pb-10 pt-6">
        <EmptyState
          icon={<ClipboardCheck size={22} />}
          title="Noch nichts ausgewählt"
          text="Setze Flüge, Hotels oder Aktivitäten auf „Ausgewählt“ – dann landen sie hier mit Buchungslink und du kannst sie nacheinander abhaken."
          action={
            <Link to={`/trips/${trip.id}/hotels`} className={buttonClass('primary')}>
              Zu den Hotels
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex max-w-[1040px] flex-col gap-5 px-4 md:px-8 pb-10 pt-6">
      <section className="flex flex-wrap items-center gap-6 rounded-[18px] border border-line bg-surface p-5">
        <div className="flex min-w-[240px] flex-1 flex-col gap-2.5">
          <span className="text-[15px] font-bold">
            {booked.length} von {chosen.length} gebucht
          </span>
          <ProgressBar value={booked.length} max={chosen.length} label="Buchungsfortschritt" />
        </div>
        <div className="flex gap-7">
          <Money label="Gebucht" value={sumTotals(booked)} />
          <Money label="Noch offen" value={sumTotals(chosen) - sumTotals(booked)} highlight />
        </div>
      </section>

      {groups.map((group) => (
        <section key={group.key} className="flex flex-col gap-2.5" aria-labelledby={`group-${group.key}`}>
          <h2 id={`group-${group.key}`} className="mt-2 text-[15px] font-extrabold uppercase tracking-[0.06em] text-muted">
            {group.name}
            {group.startDate && (
              <span className="font-semibold normal-case tracking-normal"> · {formatDateRange(group.startDate, group.endDate)}</span>
            )}
          </h2>
          {group.items.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              onToggle={(done) => setStatus.mutate({ id: item.id, status: done ? 'Booked' : 'Selected' })}
            />
          ))}
        </section>
      ))}
    </div>
  )
}

function ChecklistRow({ item, onToggle }: { item: TripOption; onToggle: (done: boolean) => void }) {
  const done = item.status === 'Booked'
  return (
    <div
      className={clsx(
        'flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-3.5 transition-opacity',
        done && 'opacity-75',
      )}
    >
      <label className="flex min-w-[260px] flex-1 cursor-pointer items-center gap-3.5">
        <input type="checkbox" checked={done} onChange={(e) => onToggle(e.target.checked)} className="size-[22px] cursor-pointer" />
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-[11px] font-extrabold text-accent">
          {kindLabels[item.kind].short}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={clsx('font-bold', done && 'line-through')}>{item.title}</span>
          <span className="text-[13px] text-muted">
            {[item.startDate && formatDateRange(item.startDate, item.endDate), item.locationName].filter(Boolean).join(' · ') ||
              kindLabels[item.kind].singular}
          </span>
        </span>
      </label>
      <span className="w-24 text-right font-mono font-semibold">{item.totalPrice != null ? formatEuro(item.totalPrice) : '–'}</span>
      {done ? (
        <span className="flex h-10 min-w-[170px] items-center justify-center gap-1.5 rounded-xl bg-accent-soft text-sm font-bold text-accent">
          <Check size={15} strokeWidth={3} />
          Gebucht
        </span>
      ) : item.url ? (
        <a href={item.url} target="_blank" rel="noopener noreferrer" className={buttonClass('primary', 'md', 'h-10 min-w-[170px]')}>
          <span className="truncate">Bei {hostOf(item.url)}</span>
          <ExternalLink size={14} />
        </a>
      ) : (
        <span className="flex h-10 min-w-[170px] items-center justify-center rounded-xl border border-dashed border-line text-[13px] text-muted">
          Kein Link gespeichert
        </span>
      )}
    </div>
  )
}

function Money({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[13px] text-muted">{label}</span>
      <span className={clsx('font-mono text-[22px] font-semibold', highlight && value > 0 && 'text-star')}>{formatEuro(value)}</span>
    </div>
  )
}
