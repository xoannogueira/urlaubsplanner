import clsx from 'clsx'
import { Check, Heart } from 'lucide-react'
import type { OptionStatus } from '../api/types'
import { statusLabels, statusOrder } from '../lib/options'

interface StatusControlProps {
  value: OptionStatus
  onChange: (status: OptionStatus) => void
  label: string
}

const activeStyle: Record<OptionStatus, string> = {
  Idea: 'bg-surface-3 text-text',
  Favorite: 'bg-surface-3 text-star',
  Selected: 'bg-accent-soft text-accent',
  Booked: 'bg-accent text-accent-ink',
}

/** Segmentierte Auswahl Idee → Favorit → Ausgewählt → Gebucht. */
export function StatusControl({ value, onChange, label }: StatusControlProps) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-4 gap-1 rounded-xl bg-surface-2 p-1">
      {statusOrder.map((status) => {
        const active = status === value
        return (
          <button
            key={status}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(status)}
            className={clsx(
              'flex h-8 cursor-pointer items-center justify-center gap-1 rounded-lg px-1 text-xs font-bold transition-colors duration-100',
              active ? activeStyle[status] : 'text-muted hover:text-text',
            )}
          >
            {status === 'Favorite' && active && <Heart size={12} fill="currentColor" />}
            {status === 'Booked' && active && <Check size={12} strokeWidth={3} />}
            {statusLabels[status]}
          </button>
        )
      })}
    </div>
  )
}

export function StatusBadge({ status }: { status: OptionStatus }) {
  return (
    <span className={clsx('inline-flex items-center rounded-lg px-2 py-1 text-xs font-bold', activeStyle[status])}>
      {statusLabels[status]}
    </span>
  )
}
