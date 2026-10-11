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

/** Reisezeitraum: die Daten der Reise, sonst von der ersten bis zur letzten Etappe. */
export function tripRange(trip: Pick<Trip, 'startDate' | 'endDate' | 'stages'>): DateRange {
  const starts = trip.stages.map((s) => s.startDate).sort()
  const ends = trip.stages.map((s) => s.endDate).sort()
  return { start: trip.startDate ?? starts[0] ?? null, end: trip.endDate ?? ends.at(-1) ?? null }
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
