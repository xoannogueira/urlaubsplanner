import { ArrowRight, CircleCheck, Info, TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import type { Trip, TripSummary } from '../../api/types'
import { openTasks } from '../../lib/dashboard'

/** Was noch fehlt – jeder Punkt führt direkt dorthin, wo man ihn erledigt. */
export function OpenTasks({ trip, summary }: { trip: Trip; summary: TripSummary }) {
  const tasks = useMemo(() => openTasks(trip, summary), [trip, summary])

  if (tasks.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm font-semibold text-accent">
        <CircleCheck size={17} />
        Alles erledigt – Flüge, Hotels und Aktivitäten stehen.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {tasks.map((task) => (
        <li key={task.id}>
          <Link
            to={`/trips/${trip.id}/${task.target}`}
            className="group flex items-center gap-2.5 rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm hover:bg-surface-3"
          >
            {task.level === 'warn' ? (
              <TriangleAlert size={16} className="shrink-0 text-star" aria-label="Wichtig" />
            ) : (
              <Info size={16} className="shrink-0 text-muted" aria-label="Hinweis" />
            )}
            <span className="flex-1">{task.text}</span>
            <ArrowRight size={15} className="shrink-0 text-muted transition-transform duration-100 group-hover:translate-x-0.5" />
          </Link>
        </li>
      ))}
    </ul>
  )
}
