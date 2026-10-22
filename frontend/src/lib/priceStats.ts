import type { PriceRecord } from '../api/priceStats'

export interface Cell {
  /** günstigster Preis pro Person, null = keine Daten */
  min: number | null
  count: number
}

export interface Matrix {
  rows: string[]
  cols: { key: string; label: string }[]
  cells: Cell[][]
  min: number | null
  max: number | null
}

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
export const TIME_BANDS = [
  { key: 'frueh', label: 'Früh (bis 9 Uhr)', from: 0, to: 9 },
  { key: 'vormittag', label: 'Vormittag (9–12)', from: 9, to: 12 },
  { key: 'nachmittag', label: 'Nachmittag (12–17)', from: 12, to: 17 },
  { key: 'abend', label: 'Abend (ab 17 Uhr)', from: 17, to: 24 },
]
export const LEAD_BUCKETS = [
  { label: '0–7', from: 0, to: 7 },
  { label: '8–14', from: 8, to: 14 },
  { label: '15–30', from: 15, to: 30 },
  { label: '31–60', from: 31, to: 60 },
  { label: '61–90', from: 61, to: 90 },
  { label: '91+', from: 91, to: Number.POSITIVE_INFINITY },
]

/** Hin & zurück und Nur-Hinflug haben ganz andere Preise – nie gemischt. */
export type TripKind = 'roundtrip' | 'oneway'
export const kindOf = (r: PriceRecord): TripKind => (r.returnDate ? 'roundtrip' : 'oneway')

/** Häufigere Art zuerst – sie wird vorausgewählt. */
export function preferredKind(records: PriceRecord[]): TripKind {
  const round = records.filter((r) => r.returnDate).length
  return round >= records.length - round ? 'roundtrip' : 'oneway'
}

function build(
  records: PriceRecord[],
  rowOf: (r: PriceRecord) => string,
  colOf: (r: PriceRecord) => string,
  rows: string[],
  cols: { key: string; label: string }[],
): Matrix {
  const cells = rows.map(() => cols.map((): Cell => ({ min: null, count: 0 })))
  for (const r of records) {
    const ri = rows.indexOf(rowOf(r))
    const ci = cols.findIndex((c) => c.key === colOf(r))
    if (ri < 0 || ci < 0) continue
    const cell = cells[ri][ci]
    cell.count++
    cell.min = cell.min === null ? r.pricePerAdult : Math.min(cell.min, r.pricePerAdult)
  }
  const values = cells
    .flat()
    .map((c) => c.min)
    .filter((v): v is number => v !== null)
  return { rows, cols, cells, min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null }
}

/** Airlines × Abflugmonat: günstigster Preis pro Person. Höchstens 8 Airlines, der Rest als „Andere“. */
export function airlineByMonth(records: PriceRecord[]): Matrix {
  const counts = new Map<string, number>()
  for (const r of records) counts.set(r.airline, (counts.get(r.airline) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a)
  const shown = top.length > 8 ? top.slice(0, 7) : top
  const rowOf = (r: PriceRecord) => (shown.includes(r.airline) ? r.airline : 'Andere')
  const rows = top.length > 8 ? [...shown, 'Andere'] : shown
  const months = [...new Set(records.map((r) => r.departureDate.slice(0, 7)))].sort()
  const cols = months.map((m) => ({ key: m, label: `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}` }))
  return build(records, rowOf, (r) => r.departureDate.slice(0, 7), rows, cols)
}

const weekday = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7

/** Wochentag × Abflugzeit: günstigster Preis pro Person. */
export function weekdayByTime(records: PriceRecord[]): Matrix {
  const band = (time: string) => {
    const h = Number(time.slice(0, 2))
    return TIME_BANDS.find((b) => h >= b.from && h < b.to)?.key ?? 'abend'
  }
  return build(
    records,
    (r) => WEEKDAYS[weekday(r.departureDate)],
    (r) => band(r.departureTime),
    WEEKDAYS,
    TIME_BANDS,
  )
}

export interface LeadBucket {
  label: string
  median: number | null
  min: number | null
  count: number
}

/** Wie viele Tage vor Abflug gesucht – und was es da kostete (Median und günstigster Preis pro Person). */
export function byLeadTime(records: PriceRecord[]): LeadBucket[] {
  const days = (r: PriceRecord) => Math.round((Date.parse(r.departureDate) - Date.parse(r.searchedAt.slice(0, 10))) / 86_400_000)
  return LEAD_BUCKETS.map((b) => {
    const prices = records
      .filter((r) => {
        const d = days(r)
        return d >= b.from && d <= b.to
      })
      .map((r) => r.pricePerAdult)
      .sort((x, y) => x - y)
    const mid = prices.length
      ? prices.length % 2
        ? prices[(prices.length - 1) / 2]
        : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
      : null
    return { label: b.label, median: mid === null ? null : Math.round(mid), min: prices[0] ?? null, count: prices.length }
  })
}

/** Stufe 0–4 für die Heatmap: 4 = günstigste. */
export function step(value: number, min: number, max: number): number {
  if (max <= min) return 4
  const t = (value - min) / (max - min)
  return 4 - Math.min(4, Math.floor(t * 5))
}
