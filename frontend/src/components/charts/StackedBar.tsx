import clsx from 'clsx'
import type { CSSProperties } from 'react'
import type { OptionKind } from '../../api/types'
import { kindColor } from '../../lib/dashboard'
import { formatEuro } from '../../lib/format'
import { kindLabels } from '../../lib/options'

export interface BarSegment {
  kind: OptionKind
  value: number
}

interface StackedBarProps {
  segments: BarSegment[]
  /** Wert, der 100 % der Breite entspricht (Standard: Summe der Segmente). */
  max?: number
  /** Beschriftung für Screenreader, z. B. „Kosten Lissabon“ */
  label: string
  height?: number
  className?: string
}

/**
 * Gestapelter Balken: Segmente mit 2 px Lücke in der Flächenfarbe, abgerundete Enden nur außen.
 * Jedes Segment zeigt beim Überfahren oder Fokussieren Kategorie und Betrag (die Werte stehen zusätzlich in der Legende).
 */
export function StackedBar({ segments, max, label, height = 14, className }: StackedBarProps) {
  const visible = segments.filter((s) => s.value > 0)
  const total = visible.reduce((n, s) => n + s.value, 0)
  const scale = max && max > 0 ? max : total
  if (total <= 0 || scale <= 0) {
    return <div className={clsx('rounded bg-surface-3', className)} style={{ height }} aria-label={`${label}: keine Kosten`} role="img" />
  }

  return (
    <div className={clsx('flex', className)} role="group" aria-label={label}>
      <div className="flex gap-[2px]" style={{ width: `${(total / scale) * 100}%`, minWidth: 6 }}>
        {visible.map((s, i) => {
          const style: CSSProperties = { flexGrow: s.value, flexBasis: 0, height, background: kindColor(s.kind) }
          return (
            <span
              key={s.kind}
              tabIndex={0}
              aria-label={`${kindLabels[s.kind].plural}: ${formatEuro(Math.round(s.value))}`}
              className={clsx(
                'group relative min-w-[3px] outline-none transition-[filter] duration-100 hover:brightness-110 focus-visible:brightness-110 focus-visible:ring-2 focus-visible:ring-text',
                i === 0 && 'rounded-l',
                i === visible.length - 1 && 'rounded-r',
              )}
              style={style}
            >
              <span
                role="tooltip"
                className="pointer-events-none invisible absolute bottom-full left-1/2 z-10 mb-2 flex -translate-x-1/2 flex-col whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 py-1.5 text-left shadow-lg group-hover:visible group-focus-visible:visible"
              >
                <span className="font-mono text-sm font-semibold text-text">{formatEuro(Math.round(s.value))}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="h-[3px] w-3 rounded-full" style={{ background: kindColor(s.kind) }} />
                  {kindLabels[s.kind].plural} · {Math.round((s.value / total) * 100)} %
                </span>
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
