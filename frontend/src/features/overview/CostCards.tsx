import { CircleCheck } from 'lucide-react'
import { useMemo } from 'react'
import type { Trip, TripSummary } from '../../api/types'
import { StackedBar } from '../../components/charts/StackedBar'
import { ProgressBar } from '../../components/ui/Feedback'
import { costByKind, costByStage, kindColor, kindOrder } from '../../lib/dashboard'
import { formatEuro, nightsLabel } from '../../lib/format'
import { kindLabels } from '../../lib/options'

/** Wofür das Geld ausgegeben wird: ein gestapelter Balken plus Legende mit Beträgen (die Legende ist zugleich die Tabelle). */
export function CostByKindCard({ trip, summary }: { trip: Trip; summary: TripSummary }) {
  const slices = useMemo(() => costByKind(trip.options), [trip.options])
  const total = slices.reduce((n, s) => n + s.total, 0)

  if (slices.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted">
        Sobald du Flüge, Hotels oder Aktivitäten auf „Ausgewählt“ oder „Gebucht“ setzt, siehst du hier, wofür das Geld ausgegeben wird.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <StackedBar segments={slices.map((s) => ({ kind: s.kind, value: s.total }))} label="Kosten nach Kategorie" height={20} />
      <table className="w-full text-sm">
        <caption className="sr-only">Kosten nach Kategorie</caption>
        <tbody>
          {slices.map((s) => (
            <tr key={s.kind} className="border-b border-line last:border-0">
              <th scope="row" className="py-2 text-left font-semibold">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ background: kindColor(s.kind) }} aria-hidden="true" />
                  {kindLabels[s.kind].plural}
                  <span className="font-normal text-muted">{s.count}×</span>
                </span>
              </th>
              <td className="py-2 text-right text-muted tabular-nums">{total > 0 ? `${Math.round((s.total / total) * 100)} %` : ''}</td>
              <td className="w-28 py-2 text-right font-mono font-semibold tabular-nums">{formatEuro(Math.round(s.total))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3.5">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="flex items-center gap-1.5 font-semibold">
            <CircleCheck size={15} className="text-accent" />
            Schon gebucht
          </span>
          <span className="font-mono font-semibold tabular-nums">
            {formatEuro(Math.round(summary.bookedCost))}{' '}
            <span className="font-sans font-normal text-muted">von {formatEuro(Math.round(summary.totalCost))}</span>
          </span>
        </div>
        <ProgressBar value={summary.bookedCost} max={Math.max(summary.totalCost, 1)} label="Anteil der gebuchten Kosten" />
        {summary.openCost > 0 && <span className="text-xs text-muted">Noch offen: {formatEuro(Math.round(summary.openCost))}</span>}
      </div>
      {summary.missingPriceCount > 0 && (
        <p className="text-[13px] text-muted">
          {summary.missingPriceCount === 1 ? '1 Auswahl hat' : `${summary.missingPriceCount} Auswahlen haben`} noch keinen Preis und fehlen
          in der Rechnung.
        </p>
      )}
    </div>
  )
}

/** Kosten pro Etappe: Balken gleicher Skala (teuerste Etappe = volle Breite), nach Kategorie gestapelt. */
export function CostByStageCard({ trip }: { trip: Trip }) {
  const rows = useMemo(() => costByStage(trip), [trip])
  const max = Math.max(0, ...rows.map((r) => r.total))
  const kinds = kindOrder.filter((kind) => rows.some((r) => r.byKind.some((k) => k.kind === kind && k.total > 0)))

  if (rows.length === 0 || max === 0) {
    return <p className="text-sm leading-relaxed text-muted">Noch keine ausgewählten Kosten, die einer Etappe zugeordnet sind.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3.5">
        {rows.map((r) => (
          <li key={r.id ?? 'general'} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-semibold">{r.name}</span>
              <span className="shrink-0 text-right">
                <span className="font-mono font-semibold tabular-nums">{formatEuro(Math.round(r.total))}</span>
                {r.nights > 0 && r.total > 0 && (
                  <span className="ml-2 text-xs text-muted">
                    {formatEuro(Math.round(r.total / r.nights))} / Nacht · {nightsLabel(r.nights)}
                  </span>
                )}
              </span>
            </div>
            <StackedBar segments={r.byKind.map((k) => ({ kind: k.kind, value: k.total }))} max={max} label={`Kosten ${r.name}`} />
          </li>
        ))}
      </ul>
      {kinds.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted" aria-label="Legende">
          {kinds.map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: kindColor(k) }} aria-hidden="true" />
              {kindLabels[k].plural}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
