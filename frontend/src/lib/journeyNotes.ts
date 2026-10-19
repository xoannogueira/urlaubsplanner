import { utcOffsetHours } from './transit'

/** Eine Strecke eines gemerkten Flugs bzw. einer Bus-&-Bahn-Verbindung, aus der Notiz gelesen. */
export interface JourneyLine {
  from: string
  to: string
  /** „Fr., 13. Nov.“ */
  date: string
  departure: string
  arrival: string
  /** Ankunft am Folgetag: 1 */
  plusDays: number
  /** Flugnummern bzw. Linien: ["LH1124"], ["RE 1", "Bus 728"] */
  services: string[]
  /** „Direkt“, „1 Umstieg (MAD)“, „direkt“ */
  stops: string
  durationMinutes: number | null
}

/** Teilstrecke mit Bus & Bahn: „08:12 Jerez (Gleis 2) → 08:40 Cádiz: RE 1 Richtung Cádiz“ */
export interface JourneyStep {
  departure: string
  from: string
  arrival: string
  to: string
  service: string
}

const LINE =
  /^(.+?) → (.+?): (.+?), (\d{2}:\d{2})–(\d{2}:\d{2})(?: \(\+(\d)\))?, (.+?), (Direkt|direkt|\d+ Umstiege?(?: \([^)]*\))?)(?:, Dauer (.+))?$/
const STEP = /^(\d{2}:\d{2}) (.+?) → (\d{2}:\d{2}) (.+?): (.+)$/

/** „2 Std. 5 Min.“ → 125 */
export function parseDuration(text: string | undefined): number | null {
  if (!text) return null
  const m = /^(?:(\d+) Std\.)?\s?(?:(\d+) Min\.)?$/.exec(text.trim())
  if (!m || (!m[1] && !m[2])) return null
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)
}

/** Liest die Zeilen, die beim Merken geschrieben wurden (siehe flightNotes/transitNotes). */
export function parseJourneyNotes(notes: string | null): { lines: JourneyLine[]; steps: JourneyStep[]; rest: string[] } {
  const lines: JourneyLine[] = []
  const steps: JourneyStep[] = []
  const rest: string[] = []
  for (const raw of (notes ?? '').split('\n')) {
    const text = raw.trim()
    if (!text) continue
    const m = LINE.exec(text)
    if (m) {
      lines.push({
        from: m[1],
        to: m[2],
        date: m[3],
        departure: m[4],
        arrival: m[5],
        plusDays: m[6] ? Number(m[6]) : 0,
        services: m[7] === 'zu Fuß' ? [] : m[7].split(' + '),
        stops: m[8],
        durationMinutes: parseDuration(m[9]),
      })
      continue
    }
    const s = STEP.exec(text)
    if (s && lines.length > 0) {
      steps.push({ departure: s[1], from: s[2], arrival: s[3], to: s[4], service: s[5] })
      continue
    }
    rest.push(text)
  }
  return { lines, steps, rest }
}

/**
 * Dauer aus Ab- und Ankunftszeit (Ortszeiten). Für ältere gemerkte Flüge ohne gespeicherte Dauer: Zeitzonen grob
 * über die Lage der Flughäfen – deshalb nur eine Schätzung.
 */
export function estimateDuration(
  line: Pick<JourneyLine, 'departure' | 'arrival' | 'plusDays'>,
  isoDate: string,
  from?: { latitude: number; longitude: number } | null,
  to?: { latitude: number; longitude: number } | null,
): number | null {
  const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  let diff = minutes(line.arrival) - minutes(line.departure) + line.plusDays * 1440
  if (from && to) diff -= (utcOffsetHours(isoDate, to) - utcOffsetHours(isoDate, from)) * 60
  if (diff <= 0) diff += 1440
  return diff > 0 && diff < 48 * 60 ? diff : null
}
