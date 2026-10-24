import clsx from 'clsx'
import { CalendarRange, ExternalLink, Gift, Play, RefreshCw, Search, Square, Trash2, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAirportLookup, type Airport } from '../../api/airports'
import { ApiError } from '../../api/client'
import { useFlightSearchStatus } from '../../api/flights'
import {
  usePriceCalendarActions,
  usePriceCalendars,
  usePriceSource,
  useRecheckPriceSource,
  type CalendarPattern,
  type PriceCalendar,
  type PriceSource,
} from '../../api/priceCalendars'
import type { Trip } from '../../api/types'
import { Card } from '../../components/charts/ChartParts'
import { GroupBars } from '../../components/charts/GroupBars'
import { Button, IconButton } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { FormError } from '../../components/ui/Field'
import { ProgressBar, Skeleton } from '../../components/ui/Feedback'
import { euro } from '../../lib/chart'
import { flightSegments } from '../../lib/flightSegments'
import { formatShortDate, todayIso } from '../../lib/format'
import { routeFitsTrip } from '../../lib/tripRelevance'
import { distanceKm, toLatLng } from '../../lib/geo'
import { prepareFlightSearch } from './openFlightSearch'
import { parseSignature, shiftDate } from '../../lib/flights'
import {
  aviasalesRequests,
  byMonth,
  byWeekday,
  calendarDates,
  checkOnGoogleUrl,
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
 * Preiskalender: für mehrere Monate pro Abflugtag den günstigsten Preis laden und als Monatskalender, nach Wochentag
 * und nach Monat zeigen. Quelle: kostenlose Richtpreise von Aviasales (wenn verfügbar) oder genau über Google
 * (eine Suche pro Tag).
 */
export function PriceCalendarSection({ trip }: { trip: Trip }) {
  const calendars = usePriceCalendars()
  const actions = usePriceCalendarActions()
  const [dialog, setDialog] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const all = calendars.data ?? []
  // Nur Kalender dieser Reise: neue tragen die Reise, ältere werden über die Strecke zugeordnet.
  const lookup = useAirportLookup(all.filter((c) => !c.tripId).flatMap((c) => [...c.origins, ...c.destinations]))
  const fits = (c: PriceCalendar) =>
    c.tripId ? c.tripId === trip.id : c.origins.some((o) => c.destinations.some((d) => routeFitsTrip(trip, o, d, lookup.data ?? [])))
  const [showAll, setShowAll] = useState(false)
  const mine = all.filter(fits)
  const list = showAll ? all : mine
  // Es lädt immer nur ein Kalender – auch wenn er zu einer anderen Reise gehört.
  const running = all.find((c) => c.state === 'Running')
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
            Lädt für jeden gewählten Abflugtag den günstigsten Flug und speichert das Ergebnis. So siehst du, in welchen Monaten und an
            welchen Tagen es am billigsten ist. Kostenlos über Aviasales (Richtpreise) oder genau über Google (eine Suche pro Tag).
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
                  <span className="flex flex-wrap items-center gap-2 font-bold">
                    {title(c)}
                    <SourceBadge source={c.source} />
                  </span>
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
      <OtherTripsToggle
        hidden={all.length - mine.length}
        showAll={showAll}
        onToggle={() => setShowAll((v) => !v)}
        what={['Kalender', 'Kalender']}
      />

      {shown && shown.days.some((d) => d.cheapest !== null) && <CalendarDetail key={shown.id} trip={trip} calendar={shown} />}

      <LoadDialog open={dialog} trip={trip} onClose={() => setDialog(false)} onStarted={(id) => setOpenId(id)} />
    </section>
  )
}

function CalendarDetail({ trip, calendar }: { trip: Trip; calendar: PriceCalendar }) {
  const { open } = usePriceCalendarActions()
  // Angeklickter Tag: zeigt den günstigsten Flug dieses Tages mit Weiterleitung.
  const [picked, setPicked] = useState<string | null>(null)
  const pickedDay = calendar.days.find((d) => d.date === picked && d.cheapest !== null) ?? null
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
  const indicative = calendar.source === 'Aviasales'

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] text-muted">
        {title(calendar)} · {unit} · {prices.length} Tage mit Preis
      </p>
      {indicative && (
        <p className="rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-[13px]">
          <strong>Richtpreise von Aviasales:</strong> aus Suchen anderer Nutzer der letzten Tage, nicht live.
          {calendar.nights ? ' Hin & zurück = günstigster Hinflug + günstigster Rückflug.' : ''} Gut für Trends – vor dem Buchen bei Google
          nachprüfen (Knopf bei den günstigsten Tagen, kostet keine Suche).
        </p>
      )}
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
                            : cell.day
                              ? `${formatShortDate(cell.date)}: keine Daten`
                              : `${formatShortDate(cell.date)}: nicht gesucht`
                      const content = (
                        <>
                          <span className="block text-[10px] opacity-80">{dayNo}</span>
                          {price !== null && <span className="block font-mono font-semibold tabular-nums">{Math.round(price)}</span>}
                        </>
                      )
                      return (
                        <td
                          key={ci}
                          title={label}
                          className={clsx(
                            'h-11 w-11 rounded-[4px] p-0 text-center align-middle leading-tight',
                            s === null && (cell.inRange && cell.day ? 'bg-surface-3 text-muted' : 'text-muted/60'),
                            picked === cell.date && 'outline-2 outline-offset-1 outline-text',
                          )}
                          style={s === null ? undefined : { background: `var(--heat-${s})`, color: `var(--heat-ink-${s})` }}
                        >
                          {price !== null ? (
                            <button
                              type="button"
                              aria-label={`${label} – Details`}
                              aria-pressed={picked === cell.date}
                              onClick={() => setPicked(picked === cell.date ? null : cell.date)}
                              className="flex size-full cursor-pointer flex-col items-center justify-center rounded-[4px] px-0.5 hover:brightness-110"
                            >
                              {content}
                            </button>
                          ) : (
                            <span aria-label={label} className="flex size-full flex-col items-center justify-center px-0.5">
                              {content}
                            </span>
                          )}
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
        {!pickedDay && <span>· Tag anklicken für den günstigsten Flug</span>}
      </div>
      {pickedDay && <DayPanel trip={trip} calendar={calendar} day={pickedDay} onClose={() => setPicked(null)} />}

      <div className="grid gap-5 xl:grid-cols-3">
        <Card title="Günstigste Abflugtage" note="Die fünf billigsten Tage im Zeitraum">
          <ol className="flex flex-col gap-1.5 text-sm">
            {best.map((d, i) => {
              const info = [d.route?.replace('-', ' → '), d.airline].filter(Boolean).join(' · ')
              return (
                <li
                  key={d.date}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg bg-surface-2 px-3 py-2"
                >
                  <span className="font-mono text-xs text-muted">{i + 1}.</span>
                  <button
                    type="button"
                    onClick={() => setPicked(d.date)}
                    className="flex min-w-0 cursor-pointer flex-col text-left"
                    title="Details zu diesem Tag"
                  >
                    <span className="font-semibold whitespace-nowrap underline-offset-2 hover:underline">{formatShortDate(d.date)}</span>
                    {info && <span className="truncate text-xs text-muted">{info}</span>}
                  </button>
                  <span className="flex items-center gap-2">
                    <span className="font-mono font-bold whitespace-nowrap tabular-nums">{euro(d.cheapest)}</span>
                    <GoogleCheck calendar={calendar} day={d} />
                  </span>
                </li>
              )
            })}
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
      description="Lädt im Hintergrund weiter, solange die App offen ist."
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
  return (
    <Form
      tripId={trip.id}
      initialFrom={find(preset.origins)}
      initialTo={find(preset.destinations)}
      onClose={onClose}
      onStarted={onStarted}
    />
  )
}

/** „3 Kalender aus anderen Reisen ausgeblendet – anzeigen“ */
export function OtherTripsToggle({
  hidden,
  showAll,
  onToggle,
  what,
}: {
  hidden: number
  showAll: boolean
  onToggle: () => void
  /** Einzahl und Mehrzahl, z. B. ['Strecke', 'Strecken'] */
  what: [string, string]
}) {
  if (hidden === 0) return null
  const noun = hidden === 1 ? what[0] : what[1]
  return (
    <p className="text-xs text-muted">
      {showAll ? `Zeigt auch ${hidden} ${noun} aus anderen Reisen.` : `${hidden} ${noun} aus anderen Reisen ausgeblendet.`}{' '}
      <button type="button" onClick={onToggle} className="cursor-pointer font-semibold text-accent underline-offset-2 hover:underline">
        {showAll ? 'Nur diese Reise' : 'Trotzdem anzeigen'}
      </button>
    </p>
  )
}

/** Herkunft eines gespeicherten Kalenders. */
function SourceBadge({ source }: { source: PriceSource }) {
  return source === 'Aviasales' ? (
    <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">Aviasales · Richtpreise</span>
  ) : (
    <span className="rounded-md bg-surface-3 px-2 py-0.5 text-[11px] font-semibold text-muted">Google</span>
  )
}

/** Tag bei Google Flights öffnen – zum genauen Nachprüfen, kostet keine Suche. */
function GoogleCheck({ calendar, day }: { calendar: PriceCalendar; day: PriceCalendar['days'][number] }) {
  const url = checkOnGoogleUrl(calendar, day)
  if (!url) return null
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs font-semibold hover:bg-surface-3"
      aria-label={`${formatShortDate(day.date)} bei Google Flights prüfen`}
    >
      Google <ExternalLink size={12} aria-hidden="true" />
    </a>
  )
}

/**
 * Der angeklickte Tag: günstigster Flug (Strecke, Airline, Flugnummer, Umstiege, Preis) und wohin es weitergeht –
 * Google Flights für genau diesen Tag (kostet nichts) oder die Flugsuche der App, schon ausgefüllt.
 */
function DayPanel({
  trip,
  calendar,
  day,
  onClose,
}: {
  trip: Trip
  calendar: PriceCalendar
  day: PriceCalendar['days'][number]
  onClose: () => void
}) {
  const [origin, destination] = (day.route ?? `${calendar.origins[0]}-${calendar.destinations[0]}`).split('-')
  const back = calendar.nights ? shiftDate(day.date, calendar.nights) : null
  const lookup = useAirportLookup([origin, destination])
  const from = lookup.data?.find((a) => a.code === origin) ?? null
  const to = lookup.data?.find((a) => a.code === destination) ?? null
  const google = checkOnGoogleUrl(calendar, day)
  const indicative = calendar.source === 'Aviasales'
  const stops = day.stops === null ? null : day.stops === 0 ? 'direkt' : day.stops === 1 ? '1 Umstieg' : `${day.stops} Umstiege`

  const openSearch = () => {
    if (!from || !to) return
    // Passt die Strecke zu einem Weiterflug zwischen Etappen, dort öffnen – sonst als An-/Rückreise.
    const hop = back ? null : flightSegments(trip.stages).find((s) => s.kind === 'hop' && near(from, s.from) && near(to, s.to))
    if (hop) prepareFlightSearch(trip.id, hop, { outFrom: [from], outTo: [to], outDate: day.date })
    else
      prepareFlightSearch(
        trip.id,
        { id: 'trip', kind: 'trip' },
        {
          type: back ? 'roundtrip' : 'oneway',
          outFrom: [from],
          outTo: [to],
          outDate: day.date,
          ...(back ? { inDate: back } : {}),
        },
      )
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <section
      aria-label={`Günstigster Flug am ${formatShortDate(day.date)}`}
      className="flex flex-col gap-3 rounded-xl border-2 border-accent bg-surface-2 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold tracking-[0.06em] text-muted uppercase">Günstigster Flug am {formatShortDate(day.date)}</span>
          <span className="flex flex-wrap items-baseline gap-x-2 text-lg font-extrabold">
            <span className="font-mono">
              {origin} → {destination}
            </span>
            <span className="text-sm font-semibold text-muted">
              {[from?.city, to?.city].every(Boolean) ? `${from?.city} → ${to?.city}` : ''}
            </span>
          </span>
          <span className="text-sm">
            {[day.airline, day.flight, stops].filter(Boolean).join(' · ') || 'Airline unbekannt'}
            {back ? ` · zurück am ${formatShortDate(back)}` : ' · nur Hinflug'}
          </span>
          <span className="text-xs text-muted">
            {indicative
              ? `Richtpreis von Aviasales (einige Tage alt)${calendar.nights ? ', Hin- und Rückflug einzeln zusammengerechnet' : ''}`
              : `Google-Preis vom ${formatShortDate(calendar.createdAt.slice(0, 10))} · ${day.options} Verbindungen verglichen`}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="font-mono text-2xl font-extrabold tabular-nums">{day.cheapest === null ? '–' : euro(day.cheapest)}</span>
          <span className="text-xs text-muted">pro Person{back ? ', hin & zurück' : ''}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {google && (
          <a
            href={google}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3.5 text-sm font-bold text-accent-ink hover:brightness-110"
          >
            Bei Google Flights ansehen <ExternalLink size={14} aria-hidden="true" />
          </a>
        )}
        <Button
          size="sm"
          icon={<Search size={14} />}
          onClick={openSearch}
          disabled={!from || !to}
          title="Füllt die Suche aus – gesucht wird erst auf Knopfdruck"
        >
          In der Flugsuche öffnen
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Schließen
        </Button>
      </div>
    </section>
  )
}

/** Liegt der Flughafen bei der Etappe (bis 200 km)? */
const near = (airport: { latitude: number; longitude: number }, stage: { latitude: number | null; longitude: number | null }) => {
  const at = toLatLng(stage)
  return !!at && distanceKm(airport, at) <= 200
}

/**
 * Quelle wählen: kostenlos über Aviasales (Standard, wenn die Startprüfung ok war) oder genau über Google. Geht
 * Aviasales nicht, ist die Karte gesperrt und sagt warum – mit „Erneut prüfen“.
 */
function SourcePicker({
  source,
  aviasales,
  onChange,
}: {
  source: PriceSource
  aviasales: { usable: boolean; message: string; checkedAt: string | null } | null
  onChange: (s: PriceSource) => void
}) {
  const recheck = useRecheckPriceSource()
  const checking = recheck.isPending || (aviasales !== null && aviasales.checkedAt === null)
  const usable = aviasales?.usable ?? false
  const option = (value: PriceSource, icon: ReactNode, title: string, text: string, disabled: boolean) => (
    <label
      className={clsx(
        'flex flex-1 cursor-pointer gap-3 rounded-xl border-2 px-3.5 py-3 text-sm',
        source === value ? 'border-accent bg-accent-soft/40' : 'border-line bg-surface-2',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <input
        type="radio"
        name="quelle"
        value={value}
        checked={source === value}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="mt-0.5 size-4 shrink-0"
      />
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5 font-bold">
          {icon}
          {title}
        </span>
        <span className="text-[13px] text-muted">{text}</span>
      </span>
    </label>
  )
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-[13px] font-bold text-muted">Quelle</legend>
      <div className="flex flex-col gap-2 sm:flex-row">
        {option(
          'Aviasales',
          <Gift size={15} aria-hidden="true" />,
          'Kostenlos (Aviasales)',
          usable
            ? 'Richtpreise aus Suchen anderer Nutzer, einige Tage alt. Ideal für Trends.'
            : checking
              ? 'Wird geprüft …'
              : (aviasales?.message ?? 'Wird geprüft …'),
          !usable,
        )}
        {option(
          'Google',
          <Search size={15} aria-hidden="true" />,
          'Genau (Google)',
          'Live-Preise wie bei Google Flights. Kostet eine Suche pro Tag.',
          false,
        )}
      </div>
      {!usable && !checking && aviasales?.checkedAt && (
        <Button size="sm" className="self-start" icon={<RefreshCw size={14} />} onClick={() => recheck.mutate()}>
          Aviasales erneut prüfen
        </Button>
      )}
    </fieldset>
  )
}

/** Kostenlose Quelle: statt Kosten ein Hinweis, was man bekommt. */
function FreeNote({ from, to, days, requests }: { from: string; to: string; days: number; requests: number }) {
  return (
    <div role="note" aria-label="Kosten" className="flex gap-3 rounded-xl border-2 border-accent bg-accent-soft/40 px-4 py-3.5">
      <Gift size={24} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-lg font-extrabold text-accent">Kostenlos · 0 Google-Suchen</span>
        <span className="text-sm">
          {days} Abflugtage · {formatShortDate(from)} – {formatShortDate(to)} · etwa {requests} Abfragen bei Aviasales
        </span>
        <span className="text-[13px] text-muted">Richtpreise, einige Tage alt. Tage ohne Daten bleiben leer.</span>
      </div>
    </div>
  )
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
  tripId,
  initialFrom,
  initialTo,
  onClose,
  onStarted,
}: {
  initialFrom: Airport[]
  initialTo: Airport[]
  onClose: () => void
  onStarted: (id: string) => void
  tripId: string
}) {
  const { start } = usePriceCalendarActions()
  const status = useFlightSearchStatus()
  const sourceStatus = usePriceSource()
  const aviasalesOk = sourceStatus.data?.usable ?? false
  const [chosen, setChosen] = useState<PriceSource | null>(null)
  // Standard: kostenlos, wenn Aviasales geht – sonst Google als Ersatz.
  const source: PriceSource = chosen === 'Google' || !aviasalesOk ? 'Google' : 'Aviasales'
  const google = source === 'Google'
  const today = todayIso()
  const months = upcomingMonths(today)
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)
  const [startMonth, setStartMonth] = useState(months[1]?.value ?? months[0].value)
  const [count, setCount] = useState(2)
  const [nights, setNights] = useState<number | null>(7)
  const [pattern, setPattern] = useState<CalendarPattern | null>(null)
  // Kostenlos lohnt sich jeder Tag, bei Google spart jeder 2. Tag die Hälfte der Suchen.
  const effectivePattern: CalendarPattern = pattern ?? (google ? 'EveryOther' : 'Daily')
  const [error, setError] = useState<string | null>(null)

  const range = monthRange(startMonth, count, today, nights)
  const searches = range.from <= range.to ? calendarDates(range.from, range.to, effectivePattern).length : 0
  const left = status.data?.quota?.left ?? null
  const tooMany = google && (searches > MAX_SEARCHES || (left !== null && searches > left - RESERVE))
  // Ab einer gewissen Menge muss man die Kosten ausdrücklich bestätigen – gilt nur für genau diese Anzahl.
  const [ackFor, setAckFor] = useState<number | null>(null)
  const needsAck = google && !tooMany && searches > ACK_FROM
  const routes = from.reduce((n, a) => n + to.filter((b) => b.code !== a.code).length, 0)
  const acknowledged = ackFor === searches

  const submit = () => {
    setError(null)
    start.mutate(
      {
        origins: from.map((a) => a.code),
        destinations: to.map((a) => a.code),
        from: range.from,
        to: range.to,
        nights,
        pattern: effectivePattern,
        source,
        tripId,
      },
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
      <SourcePicker
        source={source}
        aviasales={sourceStatus.data ?? null}
        onChange={(s) => {
          setChosen(s)
          setAckFor(null)
        }}
      />
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
            value={effectivePattern}
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
      {google ? (
        <CostWarning from={range.from} to={range.to} searches={searches} left={left} />
      ) : (
        <FreeNote
          from={range.from}
          to={range.to}
          days={searches}
          requests={aviasalesRequests(range.from, range.to, nights, Math.max(routes, 1))}
        />
      )}
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
          {google ? `${searches} Suchen starten` : 'Kostenlos laden'}
        </Button>
      </div>
    </div>
  )
}
