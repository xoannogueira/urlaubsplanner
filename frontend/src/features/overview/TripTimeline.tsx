import clsx from 'clsx'
import { BedDouble, Bus, CalendarPlus, Check, Compass, MoreHorizontal, Plane, TriangleAlert } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { OptionKind, Trip, TripSummary } from '../../api/types'
import { buildTimeline, kindColor, type TimelineDay } from '../../lib/dashboard'
import { formatShortDate, nightsLabel, todayIso } from '../../lib/format'

const kindIcons: Record<OptionKind, ReactNode> = {
  Flight: <Plane size={14} />,
  Hotel: <BedDouble size={14} />,
  Activity: <Compass size={14} />,
  Transport: <Bus size={14} />,
  Other: <MoreHorizontal size={14} />,
}

/**
 * Zeitplan Tag für Tag: Flüge mit Uhrzeit, Aktivitäten mit Datum und die Übernachtung jeder Nacht.
 * Fehlt ein Hotel, steht das direkt am Tag. Aktivitäten ohne Tag stehen bei ihrer Etappe.
 */
export function TripTimeline({ trip, summary }: { trip: Trip; summary: TripSummary }) {
  const { days, stages } = useMemo(() => buildTimeline(trip, summary), [trip, summary])
  const today = todayIso()

  if (days.length === 0) {
    return <p className="text-sm text-muted">Leg Etappen mit Zeitraum an – dann entsteht hier der Zeitplan Tag für Tag.</p>
  }

  return (
    <ol className="flex flex-col">
      {days.map((day, i) => {
        const stageInfo = day.stageStart ? stages.find((s) => s.stage.id === day.stage?.id) : undefined
        return (
          <li key={day.date} className="flex flex-col">
            {stageInfo && (
              <div className={clsx('flex flex-wrap items-baseline gap-x-3 gap-y-1 pb-2', i > 0 && 'pt-4')}>
                <h3 className="text-[15px] font-extrabold">{stageInfo.stage.name}</h3>
                <span className="text-xs text-muted">{nightsLabel(stageInfo.stage.nights)}</span>
                {stageInfo.unscheduled.length > 0 && (
                  <Link
                    to={`/trips/${trip.id}/aktivitaeten`}
                    className="flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                    title={stageInfo.unscheduled.map((o) => o.title).join(', ')}
                  >
                    <CalendarPlus size={13} />
                    {stageInfo.unscheduled.length === 1 ? '1 Aktivität ohne Tag' : `${stageInfo.unscheduled.length} Aktivitäten ohne Tag`}
                  </Link>
                )}
              </div>
            )}
            <DayRow day={day} isToday={day.date === today} isLast={i === days.length - 1} tripId={trip.id} />
          </li>
        )
      })}
    </ol>
  )
}

function DayRow({ day, isToday, isLast, tripId }: { day: TimelineDay; isToday: boolean; isLast: boolean; tripId: string }) {
  const [weekday, ...rest] = formatShortDate(day.date).split(' ')
  return (
    <div className={clsx('grid grid-cols-[64px_1fr] gap-3 border-l-2 py-2 pl-3', isToday ? 'border-accent' : 'border-line')}>
      <div className="flex flex-col leading-tight">
        <span className="text-xs font-bold uppercase text-muted">{weekday.replace(',', '')}</span>
        <span className="text-sm font-semibold">{rest.join(' ')}</span>
        {isToday && <span className="text-[11px] font-bold text-accent">heute</span>}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        {day.items.map((item) => (
          <span key={item.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <span
              className="flex size-6 shrink-0 items-center justify-center rounded-md"
              style={{ color: kindColor(item.kind), background: `color-mix(in srgb, ${kindColor(item.kind)} 16%, transparent)` }}
              aria-hidden="true"
            >
              {kindIcons[item.kind]}
            </span>
            <span className="min-w-0 font-semibold break-words">{item.title}</span>
            {item.time && <span className="shrink-0 font-mono text-xs text-muted">{item.time}</span>}
            {item.booked && (
              <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-accent">
                <Check size={12} strokeWidth={3} />
                gebucht
              </span>
            )}
          </span>
        ))}
        {day.night === 'missing' ? (
          <Link
            to={`/trips/${tripId}/hotels`}
            className="flex w-fit items-center gap-2 rounded-md bg-star/12 px-2 py-0.5 text-xs font-semibold text-star hover:underline"
          >
            <TriangleAlert size={13} />
            Keine Unterkunft ausgewählt
          </Link>
        ) : day.night ? (
          <span className="flex min-w-0 items-center gap-2 text-xs text-muted">
            <BedDouble size={13} className="shrink-0" />
            <span className="truncate">{day.night.title}</span>
            {day.night.booked && <Check size={12} strokeWidth={3} className="shrink-0 text-accent" aria-label="gebucht" />}
          </span>
        ) : isLast ? (
          <span className="text-xs text-muted">Heimreise</span>
        ) : null}
        {day.items.length === 0 && day.night !== 'missing' && !day.night && !isLast && (
          <span className="text-xs text-muted">Kein Ort zugeordnet</span>
        )}
      </div>
    </div>
  )
}
