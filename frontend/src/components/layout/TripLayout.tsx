import clsx from 'clsx'
import { BedDouble, CalendarDays, ChartColumn, ClipboardCheck, Compass, Minus, Plane, Plus, Settings, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router'
import { useTrip, useTripActions, useTrips } from '../../api/trips'
import type { Trip } from '../../api/types'
import { formatDateRange, peopleLabel } from '../../lib/format'
import { isChosen } from '../../lib/options'
import { KeyBanner } from '../../features/setup/KeyBanner'
import { ErrorState, Skeleton } from '../ui/Feedback'
import { Logo, ThemeToggle } from './Brand'
import type { TripContext } from './tripContext'

export function TripLayout() {
  const { tripId = '' } = useParams()
  const { data: trip, error, refetch, isPending } = useTrip(tripId)

  return (
    <div className="flex min-h-dvh flex-wrap">
      <Sidebar trip={trip} />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col">
        <KeyBanner />
        {isPending ? (
          <div className="flex flex-col gap-4 p-8">
            <Skeleton className="h-16 w-1/2" />
            <Skeleton className="h-64" />
          </div>
        ) : error || !trip ? (
          <div className="p-8">
            <ErrorState message={error?.message ?? 'Reise nicht gefunden.'} onRetry={() => void refetch()} />
            <Link to="/" className="mt-4 inline-block font-bold text-accent">
              Zurück zu allen Reisen
            </Link>
          </div>
        ) : (
          <>
            <TripHeader trip={trip} />
            <Outlet context={{ trip } satisfies TripContext} />
          </>
        )}
      </main>
    </div>
  )
}

function Sidebar({ trip }: { trip?: Trip }) {
  const { data: trips } = useTrips()
  const others = (trips ?? []).filter((t) => t.id !== trip?.id).slice(0, 5)
  const chosen = trip?.options.filter(isChosen) ?? []
  const booked = chosen.filter((o) => o.status === 'Booked').length
  const base = trip ? `/trips/${trip.id}` : ''

  return (
    <nav
      aria-label="Hauptnavigation"
      className="flex flex-[1_1_232px] flex-col gap-6 border-r border-line bg-surface px-3.5 py-5 max-md:flex-row max-md:items-center max-md:gap-3 max-md:overflow-x-auto max-md:border-b max-md:border-r-0 max-md:py-3"
    >
      <Logo />
      {trip && (
        <div className="flex flex-col gap-1 max-md:flex-row">
          <div className="truncate px-2.5 pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted max-md:hidden">
            {trip.name}
          </div>
          <NavItem to={base} end icon={<ChartColumn size={18} />}>
            Übersicht
          </NavItem>
          <NavItem to={`${base}/fluege`} icon={<Plane size={18} />}>
            Flüge
          </NavItem>
          <NavItem to={`${base}/hotels`} icon={<BedDouble size={18} />}>
            Hotels
          </NavItem>
          <NavItem to={`${base}/aktivitaeten`} icon={<Compass size={18} />}>
            Aktivitäten
          </NavItem>
          <NavItem to={`${base}/checkliste`} icon={<ClipboardCheck size={18} />} badge={`${booked}/${chosen.length}`}>
            Checkliste
          </NavItem>
        </div>
      )}
      <div className="flex flex-col gap-1 max-md:hidden">
        <div className="px-2.5 pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
          {trip ? 'Weitere Reisen' : 'Reisen'}
        </div>
        {others.map((t) => (
          <Link
            key={t.id}
            to={`/trips/${t.id}`}
            className="truncate rounded-[10px] px-3 py-2 text-sm font-semibold text-muted hover:bg-surface-3 hover:text-text"
          >
            {t.name}
          </Link>
        ))}
        <Link to="/?neu=1" className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-bold text-accent hover:bg-surface-3">
          <Plus size={16} strokeWidth={2.5} />
          Neue Reise
        </Link>
      </div>
      <div className="mt-auto max-md:mt-0 max-md:ml-auto">
        <NavItem to="/einstellungen" icon={<Settings size={18} />}>
          Einstellungen
        </NavItem>
      </div>
    </nav>
  )
}

function NavItem({ to, end, icon, badge, children }: { to: string; end?: boolean; icon: ReactNode; badge?: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          'flex shrink-0 items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm transition-colors duration-100 max-md:gap-2',
          isActive
            ? 'bg-accent-soft font-bold text-text [&>svg]:text-accent'
            : 'font-semibold text-muted hover:bg-surface-3 hover:text-text',
        )
      }
    >
      {icon}
      {children}
      {badge && <span className="ml-auto font-mono text-xs text-muted">{badge}</span>}
    </NavLink>
  )
}

function TripHeader({ trip }: { trip: Trip }) {
  const { updateTrip } = useTripActions(trip.id)
  const stageStart = trip.stages[0]?.startDate ?? trip.startDate
  const stageEnd =
    trip.stages.length > 0 ? trip.stages.reduce((max, s) => (s.endDate > max ? s.endDate : max), trip.stages[0].endDate) : trip.endDate

  const setTravelers = (travelers: number) =>
    updateTrip.mutate({ name: trip.name, travelers, startDate: trip.startDate, endDate: trip.endDate, notes: trip.notes })

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-surface px-4 md:px-8 py-5">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2 text-[13px] text-muted">
          <Link to="/" className="hover:text-text">
            Reisen
          </Link>
          <span aria-hidden="true">/</span>
          <span className="truncate">{trip.name}</span>
        </div>
        <h1 className="truncate text-[26px] font-extrabold tracking-tight">{trip.name}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="flex h-10 items-center gap-2 rounded-[10px] bg-surface-2 px-3.5 text-sm font-semibold">
          <CalendarDays size={16} />
          {formatDateRange(stageStart, stageEnd)}
        </span>
        <div className="flex h-10 items-center gap-1 rounded-[10px] bg-surface-2 px-1" aria-label="Anzahl Personen">
          <button
            type="button"
            aria-label="Eine Person weniger"
            disabled={trip.travelers <= 1}
            onClick={() => setTravelers(trip.travelers - 1)}
            className="flex size-8 cursor-pointer items-center justify-center rounded-lg hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Minus size={16} />
          </button>
          <span className="flex items-center gap-1.5 px-1 text-sm font-bold" aria-live="polite">
            <Users size={16} />
            {peopleLabel(trip.travelers)}
          </span>
          <button
            type="button"
            aria-label="Eine Person mehr"
            disabled={trip.travelers >= 50}
            onClick={() => setTravelers(trip.travelers + 1)}
            className="flex size-8 cursor-pointer items-center justify-center rounded-lg hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={16} />
          </button>
        </div>
        <ThemeToggle />
      </div>
    </header>
  )
}
