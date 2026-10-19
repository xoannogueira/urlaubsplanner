import type { Stage, Trip } from '../api/types'
import { formatDateRange, parseDate } from './format'

export interface DateRange {
  start: string | null
  end: string | null
}

/** "2027-02-19" + 3 → "2027-02-22" */
export function addDays(iso: string, days: number): string {
  const d = parseDate(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Der Reisezeitraum – der eine Zeitraum für Kopfzeile, Suchen, Wetter und PDF. Er umfasst immer alle Etappen
 * (der Server sorgt dafür); ohne Reisedaten ergibt er sich aus den Etappen.
 */
export function tripRange(trip: Pick<Trip, 'startDate' | 'endDate' | 'stages'>): DateRange {
  const starts = [trip.startDate, ...trip.stages.map((s) => s.startDate)].filter((d): d is string => !!d).sort()
  const ends = [trip.endDate, ...trip.stages.map((s) => s.endDate)].filter((d): d is string => !!d).sort()
  return { start: starts[0] ?? null, end: ends.at(-1) ?? null }
}

/** „Reisezeitraum auf 1.–12. Mai verlängert“, wenn eine Etappe den Zeitraum vergrößert hat – sonst null. */
export function periodExtendedMessage(
  before: Pick<Trip, 'startDate' | 'endDate' | 'stages'>,
  after: Pick<Trip, 'startDate' | 'endDate' | 'stages'>,
): string | null {
  const a = tripRange(before)
  const b = tripRange(after)
  if (!a.start || !a.end || !b.start || !b.end) return null
  if (b.start >= a.start && b.end <= a.end) return null
  return `Reisezeitraum auf ${formatDateRange(b.start, b.end)} verlängert`
}

/** Zeitraum für Einträge einer Etappe (Hotel, Aktivität): die Etappe, sonst die ganze Reise. */
export function rangeFor(trip: Pick<Trip, 'startDate' | 'endDate' | 'stages'>, stage: Stage | null | undefined): DateRange {
  return stage ? { start: stage.startDate, end: stage.endDate } : tripRange(trip)
}

/**
 * Vorschlag für eine neue Etappe: Anreise am Ende der letzten Etappe (sonst Reisebeginn),
 * Abreise am Reiseende – sofern das danach liegt.
 */
export function newStageDefaults(trip: Pick<Trip, 'startDate' | 'endDate' | 'stages'>): { start: string; end: string } {
  const range = tripRange(trip)
  const lastEnd = [...trip.stages].sort((a, b) => a.endDate.localeCompare(b.endDate)).at(-1)?.endDate
  const start = lastEnd ?? range.start ?? ''
  const end = range.end && start && range.end > start ? range.end : ''
  return { start, end }
}

/** "Reise: 19.–28. Februar 2027" */
export function rangeHint(range: DateRange, prefix = 'Reise'): string | undefined {
  return range.start && range.end ? `${prefix}: ${formatDateRange(range.start, range.end)}` : undefined
}
