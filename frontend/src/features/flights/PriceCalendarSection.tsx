import clsx from 'clsx'
import { CalendarRange, Play, Square, Trash2, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAirportLookup, type Airport } from '../../api/airports'
import { ApiError } from '../../api/client'
import { useFlightSearchStatus } from '../../api/flights'
import { usePriceCalendarActions, usePriceCalendars, type CalendarPattern, type PriceCalendar } from '../../api/priceCalendars'
import type { Trip } from '../../api/types'
import { Card } from '../../components/charts/ChartParts'
import { GroupBars } from '../../components/charts/GroupBars'
import { Button, IconButton } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { FormError } from '../../components/ui/Field'
import { ProgressBar, Skeleton } from '../../components/ui/Feedback'
import { euro } from '../../lib/chart'
import { formatShortDate, todayIso } from '../../lib/format'
import { parseSignature } from '../../lib/flights'
import {
  byMonth,
  byWeekday,
  calendarDates,
  cheapestDays,
  monthGrids,
  monthRange,
  patternLabels,
  upcomingMonths,
} from '../../lib/priceCalendar'
import { step, WEEKDAYS } from '../../lib/priceStats'
import { AirportPicker } from './AirportPicker'

const nightOptions = [null, 2, 3, 4, 5, 7, 10, 14] as const

const title = (c: Pick<PriceCalendar, 'origins' | 'destinations'>) => `${c.origins.join('/')} → ${c.destinations.join('/')}`
const describe = (c: PriceCalendar) =>
  `${formatShortDate(c.from)} – ${formatShortDate(c.to)} · ${c.nights ? `${c.nights} Nächte` : 'nur Hinflug'} · ${patternLabels[c.pattern]}`

/**
 * Preiskalender: für mehrere Monate pro Abflugtag den günstigsten Preis laden (eine Google-Suche pro Tag),
 * speichern und als Monatskalender, nach Wochentag und nach Monat zeigen.
 */
export function PriceCalendarSection({ trip }: { trip: Trip }) {
  const calendars = usePriceCalendars()
  const actions = usePriceCalendarActions()
  const [dialog, setDialog] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const list = calendars.data ?? []
  const running = list.find((c) => c.state === 'Running')
  // Ohne Auswahl: der laufende, sonst der neueste Kalender.
  const shown = list.find((c) => c.id === openId) ?? running ?? list[0] ?? null

  return (
    <section className="flex flex-col gap-4 rounded-[18px] border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 className="flex items-center gap-2 text-[17px] font-extrabold">
            <CalendarRange size={18} className="text-accent" />
            Preiskalender über mehrere Monate
          </h2>
          <p className="text-[13px] text-muted">
            Sucht für jeden gewählten Abflugtag den günstigsten Flug und speichert das Ergebnis. So siehst du, in welchen Monaten und an
            welchen Tagen es am billigsten ist. Jeder Tag kostet eine Google-Suche – vorher steht, wie viele.
          </p>
        </div>
        <Button variant="primary" icon={<Play size={15} />} onClick={() => setDialog(true)} disabled={!!running}>
          Mehrere Monate laden
        </Button>
      </div>

      {calendars.isPending ? (
        <Skeleton className="h-20" />
      ) : list.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {list.map((c) => {
            const priced = c.days.filter((d) => d.cheapest !== null)
            const best = cheapestDays(c.days, 1)[0]
            return (
              <li
                key={c.id}
                className={clsx(
                  'flex flex-wrap items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm',
                  shown?.id === c.id ? 'border-accent bg-accent-soft/40' : 'border-line bg-surface-2',
                )}
              >
                <button type="button" onClick={() => setOpenId(c.id)} className="flex min-w-0 flex-1 cursor-pointer flex-col text-left">
                  <span className="font-bold">{title(c)}</span>
                  <span className="text-[13px] text-muted">{describe(c)}</span>
                </button>
                {c.state === 'Running' ? (
                  <div className="flex min-w-[220px] items-center gap-2">
                    <ProgressBar value={c.days.length} max={c.total} label="Fortschritt" />
                    <span className="text-xs whitespace-nowrap text-muted">
                      {c.days.length} von {c.total}
                    </span>
                    <IconButton label="Abbrechen" className="size-8" onClick={() => actions.cancel.mutate(c.id)}>
                      <Square size={13} />
                    </IconButton>
                  </div>
                ) : (
                  <span className="text-[13px] text-muted">
                    {c.state === 'Done'
                      ? best
                        ? `günstigster Tag ${formatShortDate(best.date)}: ${euro(best.cheapest)}`
                        : 'keine Preise gefunden'
                      : `${c.problem ?? 'abgebrochen'} · ${priced.length} von ${c.total} Tagen`}
                  </span>
                )}
                {c.state !== 'Running' && (
                  <IconButton label={`${title(c)} löschen`} className="size-8" onClick={() => actions.remove.mutate(c.id)}>
                    <Trash2 size={14} />
                  </IconButton>
                )}
              </li>
            )
          })}
        </ul>
      ) : null}

      {shown && shown.days.some((d) => d.cheapest !== null) && <CalendarDetail calendar={shown} />}

      <LoadDialog open={dialog} trip={trip} onClose={() => setDialog(false)} onStarted={(id) => setOpenId(id)} />
    </section>
  )
}

function CalendarDetail({ calendar }: { calendar: PriceCalendar }) {
  const { open } = usePriceCalendarActions()
  const openMutate = open.mutate
  // Öffnen zählt als „benutzt“ – wichtig fürs Auslagern nach 30 Tagen.
  useEffect(() => {
    if (calendar.state !== 'Running') openMutate(calendar.id)
  }, [calendar.id, calendar.state, openMutate])

  const grids = useMemo(() => monthGrids(calendar), [calendar])
  const prices = calendar.days.map((d) => d.cheapest).filter((v): v is number => v !== null)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const weekdays = byWeekday(calendar.days)
  const months = byMonth(calendar.days)
  const best = cheapestDays(calendar.days, 5)
  const unit = calendar.nights ? `Hin & zurück (${calendar.nights} Nächte), pro Person` : 'nur Hinflug, pro Person'

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] text-muted">
        {title(calendar)} · {unit} · {prices.length} Tage mit Preis
      </p>
      <div className="flex flex-wrap gap-5">
        {grids.map((g) => (
          <div key={g.key} className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">{g.label}</span>
            <table className="border-separate border-spacing-[2px] text-[11px]">
              <thead>
                <tr>
                  {WEEKDAYS.map((w) => (
                    <th key={w} scope="col" className="w-11 font-semibold text-muted">
                      {w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.weeks.map((week, wi) => (
                  <tr key={wi}>
                    {week.map((cell, ci) => {
                      if (!cell) return <td key={ci} />
                      const price = cell.day?.cheapest ?? null
                      const s = price === null ? null : step(price, min, max)
                      const dayNo = Number(cell.date.slice(8, 10))
                      const label =
                        price !== null
                          ? `${formatShortDate(cell.date)}: ab ${euro(price)}${cell.day?.airline ? ` mit ${cell.day.airline}` : ''}`
                          : cell.day?.problem
                            ? `${formatShortDate(cell.date)}: ${cell.day.problem}`
                            : `${formatShortDate(cell.date)}: nicht gesucht`
                      return (
                        <td
                          key={ci}
                          title={label}
                          aria-label={label}
                          className={clsx(
                            'h-11 w-11 rounded-[4px] px-0.5 text-center align-middle leading-tight',
                            s === null && (cell.inRange && cell.day ? 'bg-surface-3 text-muted' : 'text-muted/60'),
                          )}
                          style={s === null ? undefined : { background: `var(--heat-${s})`, color: `var(--heat-ink-${s})` }}
                        >
                          <span className="block text-[10px] opacity-80">{dayNo}</span>
                          {price !== null && <span className="block font-mono font-semibold tabular-nums">{Math.round(price)}</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted" aria-hidden="true">
        <span>teurer ({euro(max)})</span>
        <span className="flex">
          {[0, 1, 2, 3, 4].map((s) => (
            <span key={s} className="h-3 w-6 first:rounded-l-[4px] last:rounded-r-[4px]" style={{ background: `var(--heat-${s})` }} />
          ))}
        </span>
        <span>günstiger ({euro(min)}) · Zahl = Preis in €</span>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card title="Günstigste Abflugtage" note="Die fünf billigsten Tage im Zeitraum">
          <ol className="flex flex-col gap-1.5 text-sm">
            {best.map((d, i) => (
              <li key={d.date} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2">
                <span className="font-mono text-xs text-muted">{i + 1}.</span>
                <span className="flex-1 font-semibold">{formatShortDate(d.date)}</span>
                <span className="text-xs text-muted">{d.airline}</span>
                <span className="font-mono font-bold tabular-nums">{euro(d.cheapest)}</span>
              </li>
            ))}
          </ol>
        </Card>
        <Card title="Nach Wochentag" note="Günstigster Preis je Abflug-Wochentag">
          <GroupBars
            label="Günstigster Preis nach Wochentag"
            items={weekdays.map((w) => ({
              label: w.label,
              value: w.min,
              detail: w.median === null ? '' : `Median ${euro(w.median)} · ${w.count} Tage`,
            }))}
          />
        </Card>
        <Card title="Nach Monat" note="Günstigster Preis je Abflugmonat">
          <GroupBars
            label="Günstigster Preis nach Monat"
            items={months.map((m) => ({
              label: m.label,
              value: m.min,
              detail: m.median === null ? '' : `Median ${euro(m.median)} · ${m.count} Tage`,
            }))}
          />
        </Card>
      </div>
    </div>
  )
}

/** Strecke und Zeitraum wählen; zeigt vorher, wie viele Google-Suchen das kostet. */
function LoadDialog({
  open,
  trip,
  onClose,
  onStarted,
}: {
  open: boolean
  trip: Trip
  onClose: () => void
  onStarted: (id: string) => void
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Preiskalender laden"
      description="Eine Google-Suche pro Abflugtag. Die Suche läuft im Hintergrund weiter, solange die App offen ist."
      width="lg"
    >
      {open && <LoadForm trip={trip} onClose={onClose} onStarted={onStarted} />}
    </Dialog>
  )
}

function suggestedRoute(trip: Trip): { origins: string[]; destinations: string[] } {
  for (const o of trip.options) {
    const leg = o.kind === 'Flight' ? parseSignature(o.externalId)?.legs[0] : undefined
    if (leg) return { origins: [leg.origin], destinations: [leg.destination] }
  }
  return { origins: trip.searchSettings?.homeAirports ?? [], destinations: [] }
}

function LoadForm({ trip, onClose, onStarted }: { trip: Trip; onClose: () => void; onStarted: (id: string) => void }) {
  // Vorschlag: Strecke des gemerkten Flugs, sonst Heimatflughafen der Reise.
  const preset = suggestedRoute(trip)
  const lookup = useAirportLookup([...preset.origins, ...preset.destinations])
  if ((preset.origins.length > 0 || preset.destinations.length > 0) && lookup.isPending) return <Skeleton className="h-60" />
  const find = (codes: string[]) => codes.map((c) => lookup.data?.find((a) => a.code === c)).filter((a): a is Airport => !!a)
  return <Form initialFrom={find(preset.origins)} initialTo={find(preset.destinations)} onClose={onClose} onStarted={onStarted} />
}

const MAX_SEARCHES = 100
/** So viele Suchen bleiben für normale Flugsuchen übrig. */
const RESERVE = 10
/** Ab so vielen Suchen muss man die Kosten bestätigen. */
const ACK_FROM = 20

/**
 * Was das Laden kostet, als deutliche Warnung: Anzahl Google-Suchen groß, Anteil am restlichen Monatskontingent als
 * Balken. Rot, wenn es zu viele sind (dann lässt es sich nicht starten).
 */
function CostWarning({ from, to, searches, left }: { from: string; to: string; searches: number; left: number | null }) {
  const tooMany = searches > MAX_SEARCHES || (left !== null && searches > left - RESERVE)
  const share = left !== null && left > 0 ? Math.min(1, searches / left) : null
  const after = left !== null ? left - searches : null
  return (
    <div
      role={tooMany ? 'alert' : 'note'}
      aria-label="Kosten"
      className={clsx('flex gap-3 rounded-xl border-2 px-4 py-3.5', tooMany ? 'border-danger bg-danger/10' : 'border-star bg-star/10')}
    >
      <TriangleAlert size={26} className={clsx('mt-0.5 shrink-0', tooMany ? 'text-danger' : 'text-star')} aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className={clsx('text-2xl font-extrabold tabular-nums leading-none', tooMany ? 'text-danger' : 'text-star')}>
            {searches} Google-Suchen
          </span>
          <span className="text-sm font-semibold">
            werden verbraucht · {formatShortDate(from)} – {formatShortDate(to)}
          </span>
        </div>
        {share !== null && (
          <div className="flex flex-col gap-1">
            <div
              className="h-2.5 overflow-hidden rounded-full bg-surface-2"
              role="meter"
              aria-label="Anteil am restlichen Kontingent"
              aria-valuemin={0}
              aria-valuemax={left ?? 0}
              aria-valuenow={Math.min(searches, left ?? 0)}
            >
              <div className={clsx('h-full rounded-full', tooMany ? 'bg-danger' : 'bg-star')} style={{ width: `${share * 100}%` }} />
            </div>
            <span className="text-[13px] text-muted">
              {Math.round(share * 100)} % von deinen {left} übrigen Suchen diesen Monat
              {after !== null && after >= 0 && ` · danach noch ${after}`}
            </span>
          </div>
        )}
        {tooMany && (
          <span className="text-sm font-semibold text-danger">
            {searches > MAX_SEARCHES
              ? `Höchstens ${MAX_SEARCHES} auf einmal. Kürzeren Zeitraum oder seltenere Abflugtage wählen.`
              : 'Das wäre fast das ganze Kontingent. Kürzeren Zeitraum oder seltenere Abflugtage wählen.'}
          </span>
        )}
      </div>
    </div>
  )
}

function Form({
  initialFrom,
  initialTo,
  onClose,
  onStarted,
}: {
  initialFrom: Airport[]
  initialTo: Airport[]
  onClose: () => void
  onStarted: (id: string) => void
}) {
  const { start } = usePriceCalendarActions()
  const status = useFlightSearchStatus()
  const today = todayIso()
  const months = upcomingMonths(today)
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)
  const [startMonth, setStartMonth] = useState(months[1]?.value ?? months[0].value)
  const [count, setCount] = useState(2)
  const [nights, setNights] = useState<number | null>(7)
  const [pattern, setPattern] = useState<CalendarPattern>('EveryOther')
  const [error, setError] = useState<string | null>(null)

  const range = monthRange(startMonth, count, today, nights)
  const searches = range.from <= range.to ? calendarDates(range.from, range.to, pattern).length : 0
  const left = status.data?.quota?.left ?? null
  const tooMany = searches > MAX_SEARCHES || (left !== null && searches > left - RESERVE)
  // Ab einer gewissen Menge muss man die Kosten ausdrücklich bestätigen – gilt nur für genau diese Anzahl.
  const [ackFor, setAckFor] = useState<number | null>(null)
  const needsAck = !tooMany && searches > ACK_FROM
  const acknowledged = ackFor === searches

  const submit = () => {
    setError(null)
    start.mutate(
      { origins: from.map((a) => a.code), destinations: to.map((a) => a.code), from: range.from, to: range.to, nights, pattern },
      {
        onSuccess: (c) => {
          onStarted(c.id)
          onClose()
        },
        onError: (e) => setError(e instanceof ApiError ? e.message : 'Konnte nicht starten.'),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <AirportPicker label="Von" value={from} onChange={setFrom} placeholder="z. B. Stuttgart" />
        <AirportPicker label="Nach" value={to} onChange={setTo} placeholder="z. B. Lissabon" />
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-muted">Ab Monat</span>
          <select
            value={startMonth}
            onChange={(e) => setStartMonth(e.target.value)}
            className="h-11 rounded-xl border border-line bg-surface-2 px-3 text-[15px]"
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-muted">Monate</span>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="h-11 rounded-xl border border-line bg-surface-2 px-3 text-[15px]"
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? '1 Monat' : `${n} Monate`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-muted">Reisedauer</span>
          <select
            value={nights ?? ''}
            onChange={(e) => setNights(e.target.value === '' ? null : Number(e.target.value))}
            className="h-11 rounded-xl border border-line bg-surface-2 px-3 text-[15px]"
          >
            {nightOptions.map((n) => (
              <option key={n ?? 'oneway'} value={n ?? ''}>
                {n === null ? 'Nur Hinflug' : `${n} Nächte (hin & zurück)`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-muted">Abflugtage</span>
          <select
            value={pattern}
            onChange={(e) => setPattern(e.target.value as CalendarPattern)}
            className="h-11 rounded-xl border border-line bg-surface-2 px-3 text-[15px]"
          >
            {(Object.keys(patternLabels) as CalendarPattern[]).map((p) => (
              <option key={p} value={p}>
                {patternLabels[p]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <CostWarning from={range.from} to={range.to} searches={searches} left={left} />
      {needsAck && (
        <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAckFor(e.target.checked ? searches : null)}
            className="size-4 shrink-0"
          />
          Mir ist klar, dass das {searches} Google-Suchen verbraucht.
        </label>
      )}
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Abbrechen</Button>
        <Button
          variant="primary"
          icon={<Play size={15} />}
          onClick={submit}
          disabled={tooMany || (needsAck && !acknowledged) || searches === 0 || from.length === 0 || to.length === 0 || start.isPending}
        >
          {searches} Suchen starten
        </Button>
      </div>
    </div>
  )
}
