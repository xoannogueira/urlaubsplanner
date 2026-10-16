import { ArrowRight, ChevronDown, ChevronUp, MapPinned, Route } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAirportLookup } from '../../api/airports'
import type { Trip } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/Feedback'
import { formatShortDate } from '../../lib/format'
import { parseSignature } from '../../lib/flights'
import { isChosen } from '../../lib/options'
import { suggestTransfers, type TransferSuggestion } from '../../lib/transit'
import { TransitSearch } from './TransitSearch'
import { RentalSection } from '../rental/RentalSection'

/**
 * Transfers vor Ort: Die App schlägt die Wege vor, die die Reise braucht (Flughafen → Unterkunft, zwischen den
 * Etappen, Unterkunft → Flughafen) – dazu eine freie Suche für alles andere.
 */
export function TransfersView({ trip }: { trip: Trip }) {
  const codes = useMemo(
    () =>
      trip.options
        .filter((o) => o.kind === 'Flight' && isChosen(o))
        .flatMap((o) => parseSignature(o.externalId)?.legs.flatMap((l) => [l.origin, l.destination]) ?? []),
    [trip.options],
  )
  const airports = useAirportLookup(codes)
  const suggestions = useMemo(() => suggestTransfers(trip, airports.data ?? []), [trip, airports.data])
  const [open, setOpen] = useState<string | null>(null)
  const [free, setFree] = useState(false)
  const firstStage = [...trip.stages].sort((a, b) => a.startDate.localeCompare(b.startDate))[0]

  return (
    <div className="flex flex-col gap-4">
      <RentalSection trip={trip} />
      {suggestions.length === 0 ? (
        <EmptyState
          icon={<Route size={22} />}
          title="Noch keine Wege vorgeschlagen"
          text="Sobald ein Flug ausgewählt ist und die Etappen einen Ort haben, schlägt die App hier die Wege vor – vom Flughafen zur Unterkunft, zwischen den Etappen und zurück. Mit der freien Suche unten geht jede Strecke."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {suggestions.map((s) => (
            <li key={s.id} className="flex flex-col gap-3">
              <SuggestionCard suggestion={s} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} />
              {open === s.id && (
                <TransitSearch
                  key={s.id}
                  trip={trip}
                  scope="transfer"
                  stageId={s.stageId}
                  autoSearch
                  defaults={{ from: s.from, to: s.to, date: s.date, hour: s.hour, minute: s.minute, arriveBy: s.arriveBy }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3">
        <Button className="w-fit" icon={free ? <ChevronUp size={16} /> : <MapPinned size={16} />} onClick={() => setFree((f) => !f)}>
          {free ? 'Freie Suche schließen' : 'Andere Strecke suchen'}
        </Button>
        {free && (
          <TransitSearch
            key="frei"
            trip={trip}
            scope="transfer"
            stageId={firstStage?.id ?? null}
            defaults={{ from: null, to: null, date: firstStage?.startDate ?? trip.startDate ?? '', hour: 10, minute: 0, arriveBy: false }}
          />
        )}
      </div>
    </div>
  )
}

function SuggestionCard({ suggestion: s, open, onToggle }: { suggestion: TransferSuggestion; open: boolean; onToggle: () => void }) {
  return (
    <article className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-bold uppercase tracking-[0.06em] text-muted">
          {s.title} · {formatShortDate(s.date)}
        </span>
        <span className="flex flex-wrap items-center gap-2 font-semibold">
          {s.from.name}
          <ArrowRight size={15} className="text-muted" />
          {s.to.name}
        </span>
        <span className="text-xs text-muted">{s.hint}</span>
      </div>
      <Button variant={open ? 'secondary' : 'primary'} icon={open ? <ChevronUp size={16} /> : <ChevronDown size={16} />} onClick={onToggle}>
        {open ? 'Schließen' : 'Verbindungen'}
      </Button>
    </article>
  )
}
