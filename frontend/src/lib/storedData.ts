import type { OffloadedData, StoredData } from '../api/data'

export const UNUSED_DAYS = 30
const DAY = 86_400_000

/** Schlüssel, unter dem ein gespeicherter Datensatz ausgewählt und gelöscht wird, z. B. „strecke:STR-BCN“. */
export const storedId = (d: StoredData) => `${d.kind}:${d.key}`

/** Seit mehr als <days> Tagen nicht benutzt – gespeichert: zuletzt benutzt, ausgelagert: seit dem Auslagern. */
export const isUnused = (iso: string, now: number, days = UNUSED_DAYS) => now - Date.parse(iso) > days * DAY

/**
 * Was „Ungenutzte mitlöschen“ zusätzlich zur Auswahl entfernen würde – nur, was nicht ohnehin ausgewählt ist.
 * Für den Hinweis „Auch 3 seit 30 Tagen ungenutzte Datensätze mitlöschen“.
 */
export function unusedExtras(
  stored: StoredData[],
  offloaded: OffloadedData[],
  selected: ReadonlySet<string>,
  now: number,
  days = UNUSED_DAYS,
): { label: string }[] {
  return [
    ...stored.filter((d) => isUnused(d.lastUsed, now, days) && !selected.has(storedId(d))),
    ...offloaded.filter((o) => isUnused(o.offloadedAt, now, days) && !selected.has(o.name)),
  ].map((x) => ({ label: x.label }))
}
