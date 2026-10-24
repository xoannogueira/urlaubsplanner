import { useAirportLookup } from '../../api/airports'
import clsx from 'clsx'
import { BarChart3, Info } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PriceCalendarSection } from './PriceCalendarSection'
import { Card, DataTable, Toggle } from '../../components/charts/ChartParts'
import { useWidth } from '../../hooks/useWidth'
import { euro, niceTicks, roundedTop } from '../../lib/chart'
import { usePriceRoutes, usePriceStats, type PriceHistory } from '../../api/priceStats'
import type { Trip } from '../../api/types'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback'
import { formatShortDate } from '../../lib/format'
import { parseSignature } from '../../lib/flights'
import {
  airlineByMonth,
  byLeadTime,
  kindOf,
  preferredKind,
  step,
  weekdayByTime,
  type LeadBucket,
  type Matrix,
  type TripKind,
} from '../../lib/priceStats'
import { routeFitsTrip } from '../../lib/tripRelevance'
import { OtherTripsToggle } from './PriceCalendarSection'

/**
 * Preis-Statistik einer Flugstrecke aus dem eigenen Preisarchiv (jede Suche legt ihre Preise ab) und dem
 * Preisverlauf, den Google bei jeder Suche mitliefert. Alles pro Person, Hin & zurück und Nur-Hinflug getrennt.
 */
export function PriceStatsView({ trip }: { trip: Trip }) {
  return (
    <div className="flex flex-col gap-5">
      <PriceCalendarSection trip={trip} />
      <ArchiveStats trip={trip} />
    </div>
  )
}

/** Auswertung des Preisarchivs (alle gesehenen Preise) für eine Strecke. */
function ArchiveStats({ trip }: { trip: Trip }) {
  const routes = usePriceRoutes()
  // Vorauswahl: Strecke des ersten gemerkten Flugs dieser Reise, sonst die zuletzt gesuchte.
  const preferred = useMemo(() => {
    for (const o of trip.options) {
      const leg = o.kind === 'Flight' ? parseSignature(o.externalId)?.legs[0] : undefined
      if (leg) return `${leg.origin}-${leg.destination}`
    }
    return null
  }, [trip.options])
  const [picked, setPicked] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  // Nur Strecken dieser Reise (gemerkte Flüge oder Flughafen nahe einer Etappe) – keine Barcelona-Preise bei Japan.
  const lookup = useAirportLookup((routes.data ?? []).flatMap((r) => [r.origin, r.destination]))

  if (routes.isPending || (routes.data?.length && lookup.isPending)) return <Skeleton className="h-72" />
  if (routes.error) return <ErrorState message={routes.error.message} onRetry={() => void routes.refetch()} />
  const all = routes.data ?? []
  const mine = all.filter((r) => routeFitsTrip(trip, r.origin, r.destination, lookup.data ?? []))
  const list = showAll ? all : mine
  if (list.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 size={22} />}
        title="Noch keine Preise für diese Reise"
        text="Jede Flugsuche legt die gefundenen Preise hier ab – ohne zusätzliche Suche. Nach ein paar Suchen siehst du, welche Airline wann am günstigsten ist."
        action={
          all.length > 0 ? (
            <OtherTripsToggle hidden={all.length} showAll={false} onToggle={() => setShowAll(true)} what={['Strecke', 'Strecken']} />
          ) : undefined
        }
      />
    )
  }
  const keys = list.map((r) => `${r.origin}-${r.destination}`)
  const key = picked && keys.includes(picked) ? picked : preferred && keys.includes(preferred) ? preferred : keys[0]
  const [origin, destination] = key.split('-')

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-wrap items-end gap-4 rounded-[18px] border border-line bg-surface p-5">
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <span className="text-[13px] font-bold text-muted">Preis-Statistik</span>
          <span className="text-sm text-muted">
            Aus deinen eigenen Suchen (alle Preise pro Person) und dem Preisverlauf von Google. Je öfter du suchst, desto aussagekräftiger.
          </span>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-muted">Strecke</span>
          <select
            value={key}
            onChange={(e) => setPicked(e.target.value)}
            className="h-11 rounded-xl border border-line bg-surface-2 px-3 text-[15px] font-semibold"
          >
            {list.map((r) => (
              <option key={`${r.origin}-${r.destination}`} value={`${r.origin}-${r.destination}`}>
                {r.origin} → {r.destination} ({r.count} Preise)
              </option>
            ))}
          </select>
        </label>
      </section>
      <OtherTripsToggle
        hidden={all.length - mine.length}
        showAll={showAll}
        onToggle={() => setShowAll((v) => !v)}
        what={['Strecke', 'Strecken']}
      />
      <RouteStats key={key} origin={origin} destination={destination} />
    </div>
  )
}

function RouteStats({ origin, destination }: { origin: string; destination: string }) {
  const stats = usePriceStats({ origin, destination })
  const records = useMemo(() => stats.data?.records ?? [], [stats.data])
  const [kind, setKind] = useState<TripKind | null>(null)
  const active = kind ?? preferredKind(records)
  const shown = useMemo(() => records.filter((r) => kindOf(r) === active), [records, active])
  const hasBoth = records.some((r) => kindOf(r) === 'roundtrip') && records.some((r) => kindOf(r) === 'oneway')

  if (stats.isPending) return <Skeleton className="h-96" />
  if (stats.error) return <ErrorState message={stats.error.message} onRetry={() => void stats.refetch()} />

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
        {hasBoth && (
          <div role="radiogroup" aria-label="Art der Flüge" className="flex rounded-xl bg-surface-2 p-1">
            <Toggle active={active === 'roundtrip'} onClick={() => setKind('roundtrip')}>
              Hin & zurück
            </Toggle>
            <Toggle active={active === 'oneway'} onClick={() => setKind('oneway')}>
              Nur Hinflug
            </Toggle>
          </div>
        )}
        <span>
          {shown.length} Preise aus {new Set(shown.map((r) => r.searchedAt.slice(0, 10))).size} Suchtagen ·{' '}
          {active === 'roundtrip' ? 'Hin & zurück, Preis pro Person für beide Flüge' : 'nur Hinflug, Preis pro Person'}
        </span>
      </div>

      {shown.length > 0 && (
        <div className="grid gap-5 2xl:grid-cols-2">
          <Card title="Welche Airline ist wann am günstigsten?" note="Günstigster gefundener Preis pro Abflugmonat">
            <Heatmap matrix={airlineByMonth(shown)} rowTitle="Airline" />
          </Card>
          <Card title="Wochentag und Uhrzeit" note="Günstigster Preis nach Abflugtag und -zeit des Hinflugs">
            <Heatmap matrix={weekdayByTime(shown)} rowTitle="Tag" />
          </Card>
          <Card title="Wann buchen?" note="Median der Preise nach Tagen zwischen Suche und Abflug">
            <LeadChart buckets={byLeadTime(shown)} />
          </Card>
          <Card title="Preisverlauf bei Google" note="Täglicher Preis der letzten Wochen für bestimmte Reisedaten (alle Airlines)">
            <HistoryPanel histories={(stats.data?.histories ?? []).filter((h) => (h.returnDate ? 'roundtrip' : 'oneway') === active)} />
          </Card>
        </div>
      )}
      <p className="flex items-start gap-2 text-xs text-muted">
        <Info size={14} className="mt-0.5 shrink-0" />
        Ältere Preise anderer Leute gibt es nicht kostenlos – das Archiv entsteht aus deinen Suchen, gemerkten Flügen und dem Preiswächter.
        Es liegt nur auf diesem Computer.
      </p>
    </div>
  )
}

/** Heatmap als Tabelle: Zellen mit Preis, kräftiger = günstiger. Hover/Fokus zeigt die Anzahl Preise. */
function Heatmap({ matrix, rowTitle }: { matrix: Matrix; rowTitle: string }) {
  const [hover, setHover] = useState<string | null>(null)
  if (matrix.min === null || matrix.max === null) return <p className="text-sm text-muted">Noch zu wenige Daten.</p>
  const { min, max } = matrix
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-[2px] text-[12px]">
          <thead>
            <tr>
              <th scope="col" className="px-1.5 py-1 text-left font-semibold text-muted">
                {rowTitle}
              </th>
              {matrix.cols.map((c) => (
                <th key={c.key} scope="col" className="px-1 py-1 text-center font-semibold whitespace-nowrap text-muted">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row, ri) => (
              <tr key={row}>
                <th scope="row" className="max-w-[140px] truncate px-1.5 py-1 text-left font-semibold" title={row}>
                  {row}
                </th>
                {matrix.cells[ri].map((cell, ci) => {
                  const id = `${ri}-${ci}`
                  const s = cell.min === null ? null : step(cell.min, min, max)
                  const label =
                    cell.min === null ? 'keine Daten' : `ab ${euro(cell.min)} · ${cell.count} ${cell.count === 1 ? 'Preis' : 'Preise'}`
                  return (
                    <td
                      key={id}
                      tabIndex={cell.min === null ? undefined : 0}
                      aria-label={`${row}, ${matrix.cols[ci].label}: ${label}`}
                      title={`${row} · ${matrix.cols[ci].label}: ${label}`}
                      onMouseEnter={() => setHover(id)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(id)}
                      onBlur={() => setHover(null)}
                      className={clsx(
                        'h-9 min-w-[58px] rounded-[4px] px-1 text-center font-mono font-semibold tabular-nums',
                        cell.min === null ? 'bg-surface-2 text-muted' : 'cursor-default',
                        hover === id && 'outline-2 outline-offset-1 outline-text',
                      )}
                      style={s === null ? undefined : { background: `var(--heat-${s})`, color: `var(--heat-ink-${s})` }}
                    >
                      {cell.min === null ? '–' : euro(cell.min)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted" aria-hidden="true">
        <span>teurer ({euro(max)})</span>
        <span className="flex">
          {[0, 1, 2, 3, 4].map((s) => (
            <span key={s} className="h-3 w-6 first:rounded-l-[4px] last:rounded-r-[4px]" style={{ background: `var(--heat-${s})` }} />
          ))}
        </span>
        <span>günstiger ({euro(min)})</span>
      </div>
    </div>
  )
}

/** Säulen: Median pro Zeitraum vor Abflug, mit Hover-Hinweis und Tabelle. */
function LeadChart({ buckets }: { buckets: LeadBucket[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const { ref, width } = useWidth()
  const values = buckets.map((b) => b.median ?? 0)
  const top = Math.max(...values)
  if (top === 0) return <p className="text-sm text-muted">Noch zu wenige Daten.</p>
  const ticks = niceTicks(0, top)
  const yMax = ticks[ticks.length - 1]
  const W = width
  const H = 220
  const pad = { l: 48, r: 8, t: 8, b: 34 }
  const bw = (W - pad.l - pad.r) / buckets.length
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / yMax)
  const active = hover === null ? null : buckets[hover]
  return (
    <div className="flex flex-col gap-2">
      <div className="relative" ref={ref}>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block"
          role="img"
          aria-label="Median-Preis pro Person nach Tagen vor Abflug"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
                {euro(t)}
              </text>
            </g>
          ))}
          {buckets.map((b, i) => {
            const x = pad.l + i * bw
            const h = b.median === null ? 0 : H - pad.b - y(b.median)
            return (
              <g key={b.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                {/* Trefferfläche größer als die Säule */}
                <rect x={x} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
                {b.median !== null && (
                  <path
                    d={roundedTop(x + (bw - Math.min(72, bw - 6)) / 2, y(b.median), Math.min(72, bw - 6), h, 4)}
                    fill="var(--accent)"
                    opacity={hover === null || hover === i ? 1 : 0.55}
                  />
                )}
                <text x={x + bw / 2} y={H - pad.b + 16} textAnchor="middle" fontSize={11} fill="var(--muted)">
                  {b.label}
                </text>
              </g>
            )
          })}
          <text x={pad.l + (W - pad.l - pad.r) / 2} y={H - 3} textAnchor="middle" fontSize={11} fill="var(--muted)">
            Tage vor Abflug
          </text>
        </svg>
        {active && (
          <div className="pointer-events-none absolute top-1 right-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow">
            <strong>{active.label} Tage vorher</strong>
            <br />
            {active.median === null ? 'keine Daten' : `Median ${euro(active.median)} · ab ${euro(active.min!)} · ${active.count} Preise`}
          </div>
        )}
      </div>
      <DataTable
        head={['Tage vor Abflug', 'Median', 'Günstigster', 'Preise']}
        rows={buckets.map((b) => [b.label, b.median === null ? '–' : euro(b.median), b.min === null ? '–' : euro(b.min), String(b.count)])}
      />
    </div>
  )
}

/** Preisverlauf von Google: Linie mit üblichem Bereich, Fadenkreuz und Hinweis beim Darüberfahren. */
function HistoryPanel({ histories }: { histories: PriceHistory[] }) {
  const [index, setIndex] = useState(0)
  const [hover, setHover] = useState<number | null>(null)
  const { ref, width } = useWidth()
  if (histories.length === 0) {
    return <p className="text-sm text-muted">Kommt mit der nächsten Flugsuche über Google Flights.</p>
  }
  const h = histories[Math.min(index, histories.length - 1)]
  const points = h.points
  const prices = points.map((p) => p.price)
  const ticks = niceTicks(Math.min(...prices, h.typicalLow ?? Infinity) * 0.9, Math.max(...prices, h.typicalHigh ?? 0) * 1.05)
  const lo = ticks[0]
  const hi = ticks[ticks.length - 1]
  const W = width
  const H = 220
  const pad = { l: 48, r: 12, t: 10, b: 28 }
  const x = (i: number) => pad.l + ((W - pad.l - pad.r) * i) / Math.max(1, points.length - 1)
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - lo) / (hi - lo || 1))
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(' ')
  const active = hover === null ? null : points[hover]
  const label = (x: PriceHistory) =>
    `Abflug ${formatShortDate(x.departureDate)}${x.returnDate ? ` – ${formatShortDate(x.returnDate)}` : ''}`

  return (
    <div className="flex flex-col gap-2">
      {histories.length > 1 && (
        <select
          aria-label="Reisedaten"
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          className="h-10 w-fit rounded-xl border border-line bg-surface-2 px-3 text-sm font-semibold"
        >
          {histories.map((x, i) => (
            <option key={i} value={i}>
              {label(x)}
            </option>
          ))}
        </select>
      )}
      <p className="text-[13px] text-muted">
        {histories.length === 1 && `${label(h)} · `}
        {h.level && `Google stuft den Preis als „${levelDe(h.level)}“ ein`}
        {h.typicalLow != null && h.typicalHigh != null && ` · üblich ${euro(h.typicalLow)}–${euro(h.typicalHigh)}`}
      </p>
      <div className="relative" ref={ref}>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block"
          role="img"
          aria-label={`Preisverlauf ${label(h)}`}
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect()
            const px = ((e.clientX - box.left) / box.width) * W
            const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (points.length - 1))
            setHover(Math.max(0, Math.min(points.length - 1, i)))
          }}
          onMouseLeave={() => setHover(null)}
        >
          {h.typicalLow != null && h.typicalHigh != null && (
            <rect
              x={pad.l}
              width={W - pad.l - pad.r}
              y={y(h.typicalHigh)}
              height={Math.max(0, y(h.typicalLow) - y(h.typicalHigh))}
              fill="var(--accent-soft)"
            />
          )}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
                {euro(t)}
              </text>
            </g>
          ))}
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
          {[0, points.length - 1].map((i) => (
            <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : 'end'} fontSize={11} fill="var(--muted)">
              {formatShortDate(points[i].date)}
            </text>
          ))}
          {active && hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />
              <circle cx={x(hover)} cy={y(active.price)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          )}
        </svg>
        {active && (
          <div className="pointer-events-none absolute top-1 right-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow">
            <strong>{formatShortDate(active.date)}</strong>: {euro(active.price)}
          </div>
        )}
      </div>
      <DataTable head={['Tag', 'Preis']} rows={points.map((p) => [formatShortDate(p.date), euro(p.price)])} />
    </div>
  )
}

const levelDe = (level: string) => ({ low: 'niedrig', typical: 'üblich', high: 'hoch' })[level] ?? level
