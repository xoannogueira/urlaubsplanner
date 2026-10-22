import { TrendingDown } from 'lucide-react'
import { Link } from 'react-router'
import { usePriceWatches } from '../../api/priceWatches'
import { formatEuro } from '../../lib/format'

/** Hinweis oben: Ein beobachteter Flug ist günstiger geworden – Link zur Anreise der Reise. */
export function PriceDropBanner() {
  const watches = usePriceWatches()
  const drops = (watches.data ?? []).filter((w) => w.dropFrom != null && w.lastPrice != null)
  if (drops.length === 0) return null
  return (
    <>
      {drops.map((w) => (
        <div
          key={w.optionId}
          role="status"
          className="flex flex-wrap items-center gap-3 border-b border-accent/40 bg-accent-soft px-4 py-3 text-sm md:px-8"
        >
          <TrendingDown size={17} className="shrink-0 text-accent" />
          <span className="flex-1">
            <strong>Preis gefallen:</strong> {w.title} jetzt {formatEuro(w.lastPrice!)} statt {formatEuro(w.dropFrom!)}
          </span>
          <Link to={`/trips/${w.tripId}/fluege`} className="font-bold text-accent hover:underline">
            Ansehen
          </Link>
        </div>
      ))}
    </>
  )
}
