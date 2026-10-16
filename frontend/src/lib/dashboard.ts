import type { OptionKind, Stage, Trip, TripOption, TripSummary } from '../api/types'
import { parseDate } from './format'
import { parseSignature } from './flights'
import { isArrival, isChosen } from './options'

/**
 * Diagrammfarbe einer Kategorie (CSS-Variable, hell/dunkel getrennt). Fest zugeordnet, nicht nach Rang –
 * Palette geprüft auf Farbenblindheit, Abstand und Helligkeit; im hellen Modus sind drei Farben unter 3:1,
 * deshalb stehen Beträge immer zusätzlich als Text daneben.
 */
export const kindColor = (kind: OptionKind) => `var(--kind-${kind.toLowerCase()})`

/** Feste Reihenfolge – die Farbe hängt an der Kategorie, nicht an ihrem Rang. */
export const kindOrder: OptionKind[] = ['Flight', 'Hotel', 'Activity', 'Transport', 'Other']

export interface KindSlice {
  kind: OptionKind
  total: number
  booked: number
  count: number
}

/** Kosten pro Kategorie (nur Ausgewählt/Gebucht), in fester Reihenfolge, ohne leere Kategorien. */
export function costByKind(options: TripOption[]): KindSlice[] {
  const chosen = options.filter(isChosen)
  return kindOrder
    .map((kind) => {
      const ofKind = chosen.filter((o) => o.kind === kind)
      return {
        kind,
        total: sum(ofKind),
        booked: sum(ofKind.filter((o) => o.status === 'Booked')),
        count: ofKind.length,
      }
    })
    .filter((k) => k.count > 0)
}

export interface StageCostRow {
  id: string | null
  name: string
  nights: number
  total: number
  /** Kosten pro Kategorie in fester Reihenfolge (0 = nicht vorhanden) */
  byKind: { kind: OptionKind; total: number }[]
}

/** Kosten pro Etappe, aufgeteilt nach Kategorie; Optionen ohne Etappe als „Ganze Reise“ am Ende. */
export function costByStage(trip: Trip): StageCostRow[] {
  const chosen = trip.options.filter(isChosen)
  const row = (id: string | null, name: string, nights: number, items: TripOption[]): StageCostRow => ({
    id,
    name,
    nights,
    total: sum(items),
    byKind: kindOrder.map((kind) => ({ kind, total: sum(items.filter((o) => o.kind === kind)) })),
  })
  const known = new Set(trip.stages.map((s) => s.id))
  const rows = trip.stages.map((s) =>
    row(
      s.id,
      s.name,
      s.nights,
      chosen.filter((o) => o.stageId === s.id),
    ),
  )
  const general = chosen.filter((o) => !o.stageId || !known.has(o.stageId))
  if (general.length > 0) rows.push(row(null, 'Ganze Reise', 0, general))
  return rows
}

/** Tage bis zur Abreise; 0 = heute, negativ = läuft schon/vorbei. */
export function daysUntil(start: string | null, today: string): number | null {
  if (!start) return null
  return Math.round((parseDate(start).getTime() - parseDate(today).getTime()) / 86_400_000)
}

export interface TimelineItem {
  id: string
  kind: OptionKind
  title: string
  /** z. B. "09:14–14:31" bei Flügen aus der Suche */
  time: string | null
  booked: boolean
}

export interface TimelineDay {
  date: string
  stage: Stage | null
  /** Erster Tag einer Etappe – dort beginnt im Zeitplan ein neuer Abschnitt. */
  stageStart: boolean
  items: TimelineItem[]
  /** Übernachtung: Hotelname, 'missing' wenn eine Etappen-Nacht ohne Hotel ist, null am letzten Tag */
  night: { title: string; booked: boolean } | 'missing' | null
}

export interface TimelineStage {
  stage: Stage
  /** Ausgewählte Aktivitäten der Etappe ohne Datum */
  unscheduled: TripOption[]
}

/**
 * Zeitplan Tag für Tag vom ersten bis zum letzten Reisetag: Flüge (bei Flügen aus der Suche jede Strecke an
 * ihrem Tag, mit Uhrzeit), Aktivitäten/Transport mit Datum und die Übernachtung jeder Nacht.
 * Berücksichtigt nur Ausgewähltes und Gebuchtes – also das, was wirklich stattfindet.
 */
export function buildTimeline(
  trip: Trip,
  summary: Pick<TripSummary, 'startDate' | 'endDate'>,
): {
  days: TimelineDay[]
  stages: TimelineStage[]
} {
  if (!summary.startDate || !summary.endDate) return { days: [], stages: [] }
  const chosen = trip.options.filter(isChosen)
  const byDate = new Map<string, TimelineItem[]>()
  const add = (date: string, item: TimelineItem) => byDate.set(date, [...(byDate.get(date) ?? []), item])

  for (const o of chosen) {
    const booked = o.status === 'Booked'
    if (o.kind === 'Flight') {
      const parsed = parseSignature(o.externalId)
      if (parsed) {
        parsed.legs.forEach((leg, i) =>
          add(leg.date, {
            id: `${o.id}:${i}`,
            kind: 'Flight',
            title: `${leg.origin} → ${leg.destination}`,
            time: flightTime(o.notes, leg.origin, leg.destination),
            booked,
          }),
        )
      } else if (o.startDate) {
        add(o.startDate, { id: o.id, kind: 'Flight', title: o.title, time: null, booked })
        if (o.endDate && o.endDate !== o.startDate) {
          add(o.endDate, { id: `${o.id}:back`, kind: 'Flight', title: `${o.title} (Rückflug)`, time: null, booked })
        }
      }
    } else if (o.kind !== 'Hotel' && o.startDate) {
      add(o.startDate, { id: o.id, kind: o.kind, title: o.title, time: o.kind === 'Transport' ? timeRange(o.notes) : null, booked })
    }
  }

  const days: TimelineDay[] = []
  let previousStage: string | null = null
  for (let date = summary.startDate; date <= summary.endDate; date = nextDay(date)) {
    const stage = trip.stages.find((s) => s.startDate <= date && date < s.endDate) ?? null
    const hotel = stage
      ? chosen.find(
          (o) =>
            o.kind === 'Hotel' && o.stageId === stage.id && (o.startDate ?? stage.startDate) <= date && date < (o.endDate ?? stage.endDate),
        )
      : undefined
    days.push({
      date,
      stage,
      stageStart: stage !== null && stage.id !== previousStage,
      items: byDate.get(date) ?? [],
      night: stage ? (hotel ? { title: hotel.title, booked: hotel.status === 'Booked' } : 'missing') : null,
    })
    previousStage = stage?.id ?? previousStage
  }

  const stages = trip.stages.map((stage) => ({
    stage,
    unscheduled: chosen.filter((o) => o.kind === 'Activity' && o.stageId === stage.id && !o.startDate),
  }))
  return { days, stages }
}

/** Erste Zeitspanne in der Notiz („…, 09:39–12:28, …“) – z. B. bei gemerkten Bus- & Bahn-Verbindungen. */
export function timeRange(notes: string | null): string | null {
  const match = notes ? /(\d{2}:\d{2})–(\d{2}:\d{2})/.exec(notes.split('\n')[0]) : null
  return match ? `${match[1]}–${match[2]}` : null
}

/** Uhrzeit aus der Notiz eines gemerkten Flugs: "STR → LIS: Mi., 12. Mai, 09:14–14:31, …" → "09:14–14:31" */
export function flightTime(notes: string | null, origin: string, destination: string): string | null {
  const line = notes?.split('\n').find((l) => l.startsWith(`${origin} → ${destination}:`))
  const match = line ? /(\d{2}:\d{2})–(\d{2}:\d{2})( \(\+\d\))?/.exec(line) : null
  return match ? `${match[1]}–${match[2]}${match[3] ?? ''}` : null
}

export type TaskTarget = 'fluege' | 'hotels' | 'aktivitaeten' | 'checkliste'

export interface OpenTask {
  id: string
  text: string
  target: TaskTarget
  /** 'warn' = fehlt etwas Wichtiges, 'info' = noch zu erledigen */
  level: 'warn' | 'info'
}

/** Was noch zu tun ist – kurz und mit Ziel, wo man es erledigt. */
export function openTasks(trip: Trip, summary: TripSummary): OpenTask[] {
  const tasks: OpenTask[] = []
  const chosen = trip.options.filter(isChosen)

  if (!chosen.some(isArrival) && trip.stages.length > 0) {
    tasks.push({ id: 'flight', text: 'Noch keine Anreise ausgewählt', target: 'fluege', level: 'warn' })
  }
  for (const gap of summary.gaps.filter((g) => g.kind === 'MissingHotel')) {
    const nights = Math.round((parseDate(gap.to).getTime() - parseDate(gap.from).getTime()) / 86_400_000)
    tasks.push({
      id: `hotel:${gap.stageId}:${gap.from}`,
      text: `${gap.stageName}: ${nights === 1 ? '1 Nacht' : `${nights} Nächte`} ohne Hotel`,
      target: 'hotels',
      level: 'warn',
    })
  }
  for (const stage of trip.stages) {
    const hasActivity = trip.options.some((o) => o.kind === 'Activity' && o.stageId === stage.id && o.status !== 'Idea')
    if (!hasActivity) {
      tasks.push({ id: `activity:${stage.id}`, text: `${stage.name}: noch keine Aktivitäten`, target: 'aktivitaeten', level: 'info' })
    }
  }
  const unbooked = chosen.filter((o) => o.status === 'Selected').length
  if (unbooked > 0) {
    tasks.push({
      id: 'unbooked',
      text: unbooked === 1 ? '1 Auswahl noch nicht gebucht' : `${unbooked} Auswahlen noch nicht gebucht`,
      target: 'checkliste',
      level: 'info',
    })
  }
  if (summary.missingPriceCount > 0) {
    tasks.push({
      id: 'price',
      text: summary.missingPriceCount === 1 ? '1 Auswahl ohne Preis' : `${summary.missingPriceCount} Auswahlen ohne Preis`,
      target: 'checkliste',
      level: 'info',
    })
  }
  return tasks
}

function sum(options: TripOption[]): number {
  return Math.round(options.reduce((n, o) => n + (o.totalPrice ?? 0), 0) * 100) / 100
}

function nextDay(iso: string): string {
  const d = parseDate(iso)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
