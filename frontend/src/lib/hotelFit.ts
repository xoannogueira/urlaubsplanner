import type { Trip, TripOption } from '../api/types'
import { tripRange } from './dates'
import { formatDateRange } from './format'
import { isChosen } from './options'

export interface HotelMismatch {
  option: TripOption
  /** Etappe bzw. Reise, in die das Hotel gehört */
  scopeName: string
  scopeStart: string
  scopeEnd: string
}

/**
 * Ausgewählte oder gebuchte Unterkünfte, deren Check-in/-out nicht mehr in ihre Etappe (bzw. die Reise) passt –
 * z. B. nachdem der Reisezeitraum verschoben wurde. Die Daten wandern nicht automatisch mit, weil eine Buchung
 * nicht von selbst umzieht.
 */
export function hotelMismatches(trip: Trip): HotelMismatch[] {
  const range = tripRange(trip)
  const result: HotelMismatch[] = []
  for (const option of trip.options) {
    if (option.kind !== 'Hotel' || !isChosen(option) || !option.startDate || !option.endDate) continue
    const stage = option.stageId ? trip.stages.find((s) => s.id === option.stageId) : undefined
    const start = stage?.startDate ?? range.start
    const end = stage?.endDate ?? range.end
    if (!start || !end) continue
    if (option.startDate < start || option.endDate > end) {
      result.push({ option, scopeName: stage?.name ?? 'Reise', scopeStart: start, scopeEnd: end })
    }
  }
  return result
}

/** „Casa Lagos (12.–16. Mai) passt nicht mehr zu Lissabon (13.–16. Mai)“ */
export function mismatchText(m: HotelMismatch): string {
  return `${m.option.title} (${formatDateRange(m.option.startDate, m.option.endDate)}) passt nicht mehr zu ${m.scopeName} (${formatDateRange(m.scopeStart, m.scopeEnd)})`
}

/** Hinweis nach dem Verschieben des Zeitraums – nur für Hotels, die vorher noch passten. */
export function newMismatchMessage(before: Trip, after: Trip): string | null {
  const old = new Set(hotelMismatches(before).map((m) => m.option.id))
  const fresh = hotelMismatches(after).filter((m) => !old.has(m.option.id))
  if (fresh.length === 0) return null
  return fresh.length === 1
    ? `Achtung: ${mismatchText(fresh[0])} – Buchung prüfen`
    : `Achtung: ${fresh.length} Unterkünfte passen nicht mehr zum Zeitraum – Buchungen prüfen`
}
