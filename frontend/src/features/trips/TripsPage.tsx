import { Luggage, Plus } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useCreateTrip, useTrips } from '../../api/trips'
import type { TripListItem } from '../../api/types'
import { Logo, ThemeToggle } from '../../components/layout/Brand'
import { Button } from '../../components/ui/Button'
import { EmptyState, ErrorState, ProgressBar, Skeleton } from '../../components/ui/Feedback'
import { formatDateRange, formatEuro, peopleLabel } from '../../lib/format'
import { TripFormDialog } from './TripFormDialog'

export function TripsPage() {
  const { data: trips, isPending, error, refetch } = useTrips()
  const createTrip = useCreateTrip()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const dialogOpen = params.get('neu') === '1'
  const setDialogOpen = (open: boolean) => setParams(open ? { neu: '1' } : {}, { replace: true })

  const inPlanning = trips?.filter((t) => t.chosenCount > 0).length ?? 0

  return (
    <div className="min-h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-surface px-4 md:px-8 py-5">
        <Logo />
        <ThemeToggle />
      </header>

      <div className="mx-auto flex max-w-[1200px] flex-col gap-7 px-4 md:px-8 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[40px] font-extrabold leading-tight tracking-[-0.03em]">Deine Reisen</h1>
            {trips && (
              <p className="text-[15px] text-muted">
                {trips.length === 1 ? '1 Reise' : `${trips.length} Reisen`}
                {inPlanning > 0 && ` · ${inPlanning} mit Auswahl`}
              </p>
            )}
          </div>
          <Button variant="primary" size="lg" icon={<Plus size={18} strokeWidth={2.6} />} onClick={() => setDialogOpen(true)}>
            Neue Reise
          </Button>
        </div>

        {isPending ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
        ) : error ? (
          <ErrorState message={error.message} onRetry={() => void refetch()} />
        ) : trips.length === 0 ? (
          <EmptyState
            icon={<Luggage size={22} />}
            title="Noch keine Reise"
            text="Leg deine erste Reise an. Danach fügst du Etappen hinzu und sammelst Flüge, Hotels und Aktivitäten."
            action={
              <Button variant="primary" onClick={() => setDialogOpen(true)}>
                Erste Reise anlegen
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
            {trips.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </div>
        )}
      </div>

      <TripFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={(input) => createTrip.mutateAsync(input)}
        onSuccess={(trip) => void navigate(`/trips/${trip.id}`)}
      />
    </div>
  )
}

function TripCard({ trip }: { trip: TripListItem }) {
  const planning = trip.chosenCount > 0
  const nights = trip.startDate && trip.endDate ? Math.round((Date.parse(trip.endDate) - Date.parse(trip.startDate)) / 86_400_000) : null

  return (
    <Link
      to={`/trips/${trip.id}`}
      className="group flex flex-col overflow-hidden rounded-[20px] border border-line bg-surface text-text transition-[transform,border-color] duration-150 hover:-translate-y-[3px] hover:border-accent"
    >
      <div className="relative h-[150px] bg-surface-3">
        <span
          className={
            planning
              ? 'absolute left-3.5 top-3.5 rounded-full bg-accent px-2.5 py-1 text-xs font-extrabold text-accent-ink'
              : 'absolute left-3.5 top-3.5 rounded-full bg-surface px-2.5 py-1 text-xs font-extrabold'
          }
        >
          {planning ? 'In Planung' : 'Entwurf'}
        </span>
        <span className="absolute bottom-3.5 right-3.5 flex max-w-[calc(100%-28px)] flex-wrap justify-end gap-1.5">
          {trip.stageNames.slice(0, 4).map((name) => (
            <span key={name} className="rounded-lg bg-surface px-2 py-1 text-xs font-bold">
              {name}
            </span>
          ))}
        </span>
      </div>
      <div className="flex flex-col gap-3 px-5 pb-5 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-xl font-extrabold">{trip.name}</span>
          <span className="text-sm text-muted">
            {formatDateRange(trip.startDate, trip.endDate)} · {peopleLabel(trip.travelers)}
            {nights !== null && nights > 0 && ` · ${nights === 1 ? '1 Nacht' : `${nights} Nächte`}`}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className={planning ? 'font-mono text-xl font-semibold' : 'font-mono text-xl font-semibold text-muted'}>
            {planning ? formatEuro(trip.totalCost) : '–'}
          </span>
          <span className="text-[13px] text-muted">
            {planning ? `${formatEuro(trip.costPerPerson)} p. P.` : trip.favoriteCount > 0 ? `${trip.favoriteCount} Favoriten` : ''}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <ProgressBar value={trip.bookedCount} max={trip.chosenCount} label="Buchungsfortschritt" />
          <span className="text-xs text-muted">
            {planning ? `${trip.bookedCount} von ${trip.chosenCount} gebucht` : 'Noch nichts ausgewählt'}
          </span>
        </div>
      </div>
    </Link>
  )
}
