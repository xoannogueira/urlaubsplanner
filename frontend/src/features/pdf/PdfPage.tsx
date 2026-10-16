import clsx from 'clsx'
import {
  BedDouble,
  CalendarDays,
  CircleCheck,
  Compass,
  FileDown,
  FileText,
  Plane,
  ReceiptText,
  StickyNote,
  TrainFront,
  TriangleAlert,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { savePdf, useAppInfo, type PdfSaved } from '../../api/app'
import type { Trip } from '../../api/types'
import { loadTripWeather } from '../../api/weather'
import { useTripContext } from '../../components/layout/tripContext'
import { Button } from '../../components/ui/Button'
import { tripRange } from '../../lib/dates'
import { nightsLabel, todayIso } from '../../lib/format'
import { isChosen, isTransitAnreise } from '../../lib/options'
import { pdfFileName, renderTripPdf } from './renderPdf'

type Result = { kind: 'saved'; saved: PdfSaved } | { kind: 'downloaded'; fileName: string } | { kind: 'error'; message: string }

/** Reiseplan als PDF: zeigt, was drinsteht, und erstellt sie mit einem Klick. */
export function PdfPage() {
  const { trip } = useTripContext()
  const info = useAppInfo()
  const desktop = info.data?.desktop ?? false
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const parts = contents(trip)

  const create = async () => {
    setBusy(true)
    setResult(null)
    try {
      const weather = await loadTripWeather(queryClient, trip)
      const pdf = await renderTripPdf(trip, todayIso(), weather)
      if (desktop) {
        setResult({ kind: 'saved', saved: await savePdf(pdf, trip.name) })
      } else {
        const fileName = pdfFileName(trip)
        const url = URL.createObjectURL(pdf)
        const link = Object.assign(document.createElement('a'), { href: url, download: fileName })
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 10_000)
        setResult({ kind: 'downloaded', fileName })
      }
    } catch (e) {
      setResult({ kind: 'error', message: e instanceof Error ? e.message : 'Die PDF konnte nicht erstellt werden.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 px-4 pb-10 pt-6 md:px-8">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex flex-col gap-4 rounded-[18px] border border-line bg-surface p-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-extrabold">Das steht im Reiseplan</h2>
            <p className="text-sm text-muted">
              Flüge, Unterkünfte und Transport, wenn sie ausgewählt oder gebucht sind. Aktivitäten auch, wenn sie nur gemerkt sind.
            </p>
          </div>
          <ul className="flex flex-col divide-y divide-line">
            {parts.map((p) => (
              <li key={p.title} className="flex items-start gap-3 py-3">
                <span
                  className={clsx(
                    'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
                    p.empty ? 'bg-surface-2 text-muted' : 'bg-accent-soft text-accent',
                  )}
                >
                  {p.icon}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className={clsx('font-bold', p.empty && 'text-muted')}>{p.title}</span>
                  <span className="text-sm text-muted">{p.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <aside className="flex h-fit flex-col gap-4 rounded-[18px] border border-line bg-surface p-5 lg:sticky lg:top-6">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <FileText size={22} />
            </span>
            <div className="flex flex-col">
              <span className="font-extrabold">{pdfFileName(trip)}</span>
              <span className="text-xs text-muted">A4 · zum Ausdrucken oder fürs Handy</span>
            </div>
          </div>
          <Button variant="primary" icon={<FileDown size={18} />} onClick={() => void create()} disabled={busy}>
            {busy ? 'PDF wird erstellt …' : 'PDF erstellen'}
          </Button>
          <p className="text-xs text-muted">
            {desktop
              ? 'Wird im Ordner „Downloads“ gespeichert und gleich geöffnet. Erstellst du sie neu, wird die alte Fassung ersetzt.'
              : 'Wird von deinem Browser heruntergeladen.'}
          </p>
          {result && <ResultMessage result={result} />}
        </aside>
      </div>
    </div>
  )
}

function ResultMessage({ result }: { result: Result }) {
  if (result.kind === 'error') {
    return (
      <p role="alert" className="flex gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-3 text-sm">
        <TriangleAlert size={17} className="mt-0.5 shrink-0 text-danger" />
        {result.message}
      </p>
    )
  }
  return (
    <p role="status" className="flex gap-2 rounded-xl bg-accent-soft px-3.5 py-3 text-sm">
      <CircleCheck size={17} className="mt-0.5 shrink-0 text-accent" />
      <span>
        {result.kind === 'saved' ? (
          <>
            Gespeichert und geöffnet:
            <span className="mt-1 block break-all font-mono text-xs text-muted">{result.saved.path}</span>
          </>
        ) : (
          <>Heruntergeladen: {result.fileName}</>
        )}
      </span>
    </p>
  )
}

interface Part {
  title: string
  detail: string
  icon: ReactNode
  empty: boolean
}

function contents(trip: Trip): Part[] {
  const chosen = trip.options.filter(isChosen)
  const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`)
  const flights = chosen.filter((o) => o.kind === 'Flight').length
  const trains = chosen.filter(isTransitAnreise).length
  const hotels = chosen.filter((o) => o.kind === 'Hotel')
  const withoutHotel = trip.stages.filter((s) => !hotels.some((h) => h.stageId === s.id))
  const activities = trip.options.filter((o) => o.kind === 'Activity' && o.status !== 'Idea').length
  const extras = chosen.filter((o) => (o.kind === 'Transport' && !isTransitAnreise(o)) || o.kind === 'Other').length
  const range = tripRange(trip)
  const days = range.start && range.end ? Math.round((Date.parse(range.end) - Date.parse(range.start)) / 86_400_000) + 1 : 0

  return [
    {
      title: 'Überblick',
      detail: `Zeitraum, Route, Personen, Gesamtkosten und was noch offen ist`,
      icon: <FileText size={16} />,
      empty: false,
    },
    {
      title: 'Anreise',
      detail:
        flights + trains > 0
          ? [
              flights > 0 && `${count(flights, 'Flug', 'Flüge')} mit Uhrzeiten, Flugnummern und Tarif`,
              trains > 0 && `${count(trains, 'Bahn-/Busverbindung', 'Bahn-/Busverbindungen')}`,
            ]
              .filter(Boolean)
              .join(' · ')
          : 'Noch keine Anreise ausgewählt',
      icon: <Plane size={16} />,
      empty: flights + trains === 0,
    },
    {
      title: 'Unterkünfte',
      detail:
        hotels.length > 0
          ? `${count(hotels.length, 'Unterkunft', 'Unterkünfte')} mit Check-in, Check-out, Adresse und Zimmer` +
            (withoutHotel.length > 0 ? ` · ohne Unterkunft: ${withoutHotel.map((s) => s.name).join(', ')}` : '')
          : 'Noch keine Unterkunft ausgewählt',
      icon: <BedDouble size={16} />,
      empty: hotels.length === 0,
    },
    {
      title: 'Aktivitäten',
      detail:
        activities > 0
          ? `${count(activities, 'gemerkte Aktivität', 'gemerkte Aktivitäten')} mit Beschreibung und Öffnungszeiten`
          : 'Noch keine Aktivitäten gemerkt',
      icon: <Compass size={16} />,
      empty: activities === 0,
    },
    ...(extras > 0
      ? [
          {
            title: 'Transfers & weitere Buchungen',
            detail: count(extras, 'Eintrag', 'Einträge') + ' (Bus, Bahn, Mietwagen & Sonstiges)',
            icon: <TrainFront size={16} />,
            empty: false,
          },
        ]
      : []),
    {
      title: 'Tag für Tag',
      detail:
        days > 0
          ? `${count(days, 'Tag', 'Tage')} · ${nightsLabel(Math.max(0, days - 1))} mit Programm, Übernachtung und Wetter`
          : 'Braucht einen Reisezeitraum',
      icon: <CalendarDays size={16} />,
      empty: days === 0,
    },
    {
      title: 'Kosten',
      detail: 'Nach Kategorie und Etappe, gebucht und gesamt',
      icon: <ReceiptText size={16} />,
      empty: chosen.length === 0,
    },
    ...(trip.notes?.trim() ? [{ title: 'Notizen', detail: 'Deine Notizen zur Reise', icon: <StickyNote size={16} />, empty: false }] : []),
  ]
}
