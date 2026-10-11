import clsx from 'clsx'
import { Gauge } from 'lucide-react'

/** Restliche kostenlose Google-Suchen; wird knapp → gelb. */
export function QuotaBadge({ quota }: { quota: { left: number; perMonth: number } }) {
  const low = quota.left <= Math.max(10, quota.perMonth * 0.1)
  return (
    <span
      className={clsx(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        low ? 'border-star/50 text-star' : 'border-line text-muted',
      )}
      title="Kostenlose Suchen bei SerpApi (Google Flights) – gleiche Suchen kommen eine Stunde aus dem Speicher und kosten nichts"
    >
      <Gauge size={13} />
      Noch {quota.left}
      {quota.perMonth > 0 ? ` von ${quota.perMonth}` : ''} Google-Suchen
    </span>
  )
}
