import { useState } from 'react'
import { useWidth } from '../../hooks/useWidth'
import { euro, niceTicks, roundedTop } from '../../lib/chart'
import { DataTable } from './ChartParts'

export interface BarItem {
  label: string
  /** Höhe der Säule (z. B. günstigster Preis) */
  value: number | null
  /** Zusatz im Hinweis, z. B. „Median 132 € · 6 Tage“ */
  detail: string
}

/**
 * Einfache Säulen (eine Reihe, eine Farbe) in echter Pixelbreite: runde Enden oben, am Boden verankert,
 * Hinweis beim Darüberfahren, „Als Tabelle“ darunter. Die günstigste Säule bekommt ihren Wert direkt angeschrieben.
 */
export function GroupBars({ items, label, axis }: { items: BarItem[]; label: string; axis?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const { ref, width } = useWidth()
  const values = items.map((i) => i.value).filter((v): v is number => v !== null)
  if (values.length === 0) return <p className="text-sm text-muted">Noch keine Daten.</p>
  const ticks = niceTicks(0, Math.max(...values))
  const yMax = ticks[ticks.length - 1]
  const W = width
  const H = 200
  const pad = { l: 48, r: 8, t: 18, b: axis ? 34 : 22 }
  const bw = (W - pad.l - pad.r) / items.length
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / yMax)
  const min = Math.min(...values)
  const active = hover === null ? null : items[hover]
  return (
    <div className="flex flex-col gap-2">
      <div className="relative" ref={ref}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label={label}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
                {euro(t)}
              </text>
            </g>
          ))}
          {items.map((item, i) => {
            const x = pad.l + i * bw
            const w = Math.min(56, bw - 6)
            const h = item.value === null ? 0 : H - pad.b - y(item.value)
            return (
              <g key={item.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={x} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
                {item.value !== null && (
                  <path
                    d={roundedTop(x + (bw - w) / 2, y(item.value), w, h, 4)}
                    fill="var(--accent)"
                    opacity={hover === null || hover === i ? 1 : 0.55}
                  />
                )}
                {item.value === min && (
                  <text x={x + bw / 2} y={y(item.value) - 5} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--text)">
                    {euro(item.value)}
                  </text>
                )}
                <text x={x + bw / 2} y={H - pad.b + 15} textAnchor="middle" fontSize={11} fill="var(--muted)">
                  {item.label}
                </text>
              </g>
            )
          })}
          {axis && (
            <text x={pad.l + (W - pad.l - pad.r) / 2} y={H - 3} textAnchor="middle" fontSize={11} fill="var(--muted)">
              {axis}
            </text>
          )}
        </svg>
        {active && (
          <div className="pointer-events-none absolute top-0 right-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow">
            <strong>{active.label}</strong>: {active.value === null ? 'keine Daten' : `ab ${euro(active.value)}`}
            {active.value !== null && <span className="text-muted"> · {active.detail}</span>}
          </div>
        )}
      </div>
      <DataTable
        head={['', 'Günstigster', 'Details']}
        rows={items.map((i) => [i.label, i.value === null ? '–' : euro(i.value), i.detail])}
      />
    </div>
  )
}
