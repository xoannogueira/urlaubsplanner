import type { Content, ContentTable, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces'
import type { OptionKind, OptionStatus, Stage, Trip, TripOption } from '../../api/types'
import { buildTimeline, costByKind, costByStage } from '../../lib/dashboard'
import { tripRange } from '../../lib/dates'
import { parseSignature } from '../../lib/flights'
import { formatDate, formatDateRange, formatEuro, formatShortDate, hostOf, nightsLabel, parseDate, peopleLabel } from '../../lib/format'
import { isArrival, isChosen, isTransitAnreise, kindLabels } from '../../lib/options'

/**
 * Reiseplan als PDF (Beschreibung für pdfmake): Überblick, Flüge, Unterkünfte, gemerkte Aktivitäten,
 * Tag-für-Tag-Plan und Kosten. Flüge, Hotels und Transport nur, wenn ausgewählt oder gebucht – Aktivitäten auch,
 * wenn sie nur gemerkt sind. Reine Funktion, damit sie ohne Browser getestet werden kann.
 */

const color = {
  text: '#0b1e31',
  muted: '#4a6075',
  line: '#d5dfe8',
  soft: '#f2f6f9',
  accent: '#0f766e',
  accentSoft: '#e3f1ef',
  warn: '#b45309',
  warnSoft: '#fdf3e2',
  kind: { Flight: '#2a78d6', Hotel: '#eb6834', Activity: '#1baf7a', Transport: '#eda100', Other: '#e87ba4' } satisfies Record<
    OptionKind,
    string
  >,
}

const statusChip: Record<OptionStatus, { text: string; fill: string; ink: string }> = {
  Booked: { text: 'GEBUCHT', fill: '#dcf3e8', ink: '#11643f' },
  Selected: { text: 'NOCH BUCHEN', fill: '#fdf3e2', ink: '#9a4a07' },
  Favorite: { text: 'GEMERKT', fill: '#e8eef4', ink: '#38506a' },
  Idea: { text: 'IDEE', fill: '#e8eef4', ink: '#38506a' },
}

/** Die eingebettete Schrift (Roboto) hat keinen Pfeil „→“ – im PDF steht stattdessen „›“. */
export const pdfText = (text: string) => text.replaceAll('→', '›')

/** Ersetzt in allen Texten des Dokuments Zeichen, die die Schrift nicht kennt. */
function withPdfText<T>(node: T): T {
  if (typeof node === 'string') return pdfText(node) as T
  if (Array.isArray(node)) return node.map(withPdfText) as T
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node).map(([k, v]) => [
        k,
        k === 'text' || k === 'stack' || k === 'columns' || k === 'body' || k === 'table' ? withPdfText(v) : v,
      ]),
    ) as T
  }
  return node
}

const days = (from: string, to: string) => Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000)

export interface TripPdfOptions {
  /** Erstellungsdatum "YYYY-MM-DD" */
  today: string
}

export function buildTripPdf(trip: Trip, { today }: TripPdfOptions): TDocumentDefinitions {
  const range = tripRange(trip)
  const chosen = trip.options.filter(isChosen)
  const flights = chosen.filter((o) => o.kind === 'Flight').sort(byStart)
  const trains = chosen.filter(isTransitAnreise).sort(byStart)
  const extras = chosen.filter((o) => (o.kind === 'Transport' && !isTransitAnreise(o)) || o.kind === 'Other').sort(byStart)
  const timeline = range.start && range.end ? buildTimeline(trip, { startDate: range.start, endDate: range.end }) : null
  const dateText = formatDateRange(range.start, range.end)

  const content: Content[] = [
    header(trip, dateText, range),
    keyFigures(trip),
    openPoints(trip, timeline?.days.filter((d) => d.night === 'missing').length ?? 0),
    section('Anreise', 'Flight'),
    flights.length + trains.length > 0 ? [...flights.map(flightBlock), ...trains.map(extraBlock)] : empty('Noch keine Anreise ausgewählt.'),
    section('Unterkünfte', 'Hotel'),
    trip.stages.length > 0 ? trip.stages.map((s) => hotelsOfStage(trip, s)) : empty('Noch keine Etappen angelegt.'),
    section('Aktivitäten', 'Activity'),
    activities(trip),
  ]
  if (extras.length > 0) content.push(section('Transfers & weitere Buchungen', 'Transport'), extras.map(extraBlock))
  if (timeline && timeline.days.length > 0) content.push(section('Tag für Tag', null, true), dayTable(timeline.days))
  content.push(section('Kosten', null), costTables(trip))
  if (trip.notes?.trim()) content.push(section('Notizen', null), { text: trip.notes.trim(), style: 'body' })

  return {
    pageSize: 'A4',
    pageMargins: [44, 48, 44, 60],
    info: { title: `${trip.name} – Reiseplan`, creator: 'Urlaubsplanner' },
    defaultStyle: { font: 'Roboto', fontSize: 9.5, color: color.text, lineHeight: 1.25 },
    styles: {
      body: { fontSize: 9.5 },
      small: { fontSize: 8, color: color.muted },
      label: { fontSize: 7.5, color: color.muted, bold: true, characterSpacing: 0.6 },
      itemTitle: { fontSize: 11, bold: true },
    },
    content: withPdfText(content),
    // Überschrift nie allein unten auf einer Seite: in den untersten ~4 cm gleich auf die nächste
    pageBreakBefore: (node) => node.headlineLevel === 1 && node.startPosition.top > 842 - 60 - 130,
    footer: (page, pages) => ({
      margin: [44, 20, 44, 0],
      columns: [
        { text: `${trip.name} · ${dateText} · erstellt am ${formatDate(today)}`, style: 'small' },
        { text: `Seite ${page} von ${pages}`, style: 'small', alignment: 'right', width: 80 },
      ],
    }),
  }
}

function header(trip: Trip, dateText: string, range: { start: string | null; end: string | null }): Content {
  const nights = range.start && range.end ? days(range.start, range.end) : null
  const facts = [dateText, nights ? nightsLabel(nights) : null, peopleLabel(trip.travelers)].filter(Boolean).join('  ·  ')
  const route = trip.stages.map((s) => `${s.name} (${nightsLabel(s.nights)})`).join('  ›  ')
  return {
    stack: [
      { text: 'REISEPLAN', style: 'label', color: color.accent },
      { text: trip.name, fontSize: 24, bold: true, margin: [0, 2, 0, 4] },
      { text: facts, fontSize: 11, color: color.muted },
      route ? { text: route, margin: [0, 6, 0, 0] } : '',
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 507, y2: 0, lineWidth: 1.5, lineColor: color.accent }], margin: [0, 12, 0, 0] },
    ],
  }
}

function keyFigures(trip: Trip): Content {
  const chosen = trip.options.filter(isChosen)
  const total = chosen.reduce((n, o) => n + (o.totalPrice ?? 0), 0)
  const booked = chosen.filter((o) => o.status === 'Booked')
  const bookedCost = booked.reduce((n, o) => n + (o.totalPrice ?? 0), 0)
  const cell = (label: string, value: string, sub: string): TableCell => ({
    stack: [
      { text: label, style: 'label' },
      { text: value, fontSize: 15, bold: true, margin: [0, 2, 0, 0] },
      { text: sub, style: 'small' },
    ],
    fillColor: color.soft,
    margin: [10, 8, 10, 8],
  })
  return {
    margin: [0, 14, 0, 0],
    table: {
      widths: ['*', '*', '*'],
      body: [
        [
          cell('GESAMTKOSTEN', formatEuro(round(total)), `${formatEuro(round(total / Math.max(1, trip.travelers)))} pro Person`),
          cell('GEBUCHT', `${booked.length} von ${chosen.length}`, `${formatEuro(round(bookedCost))} davon gebucht`),
          cell('NOCH OFFEN', formatEuro(round(total - bookedCost)), `${chosen.length - booked.length} noch zu buchen`),
        ],
      ],
    },
    layout: { hLineWidth: () => 0, vLineWidth: (i) => (i === 1 || i === 2 ? 6 : 0), vLineColor: () => '#ffffff' },
  }
}

function openPoints(trip: Trip, missingNights: number): Content {
  const chosen = trip.options.filter(isChosen)
  const points = [
    trip.stages.length > 0 && !chosen.some(isArrival) ? 'Noch keine Anreise ausgewählt' : null,
    missingNights > 0 ? `${nightsLabel(missingNights)} ohne Unterkunft` : null,
    chosen.some((o) => o.totalPrice === null) ? 'Nicht alle Auswahlen haben einen Preis' : null,
  ].filter((p): p is string => p !== null)
  if (points.length === 0) return ''
  return {
    margin: [0, 8, 0, 0],
    table: {
      widths: ['*'],
      body: [
        [
          {
            text: [{ text: 'Noch offen: ', bold: true }, points.join(' · ')],
            color: color.warn,
            fillColor: color.warnSoft,
            margin: [10, 6, 10, 6],
          },
        ],
      ],
    },
    layout: 'noBorders',
  }
}

function section(title: string, kind: OptionKind | null, pageBreak = false): Content {
  return {
    headlineLevel: 1,
    pageBreak: pageBreak ? 'before' : undefined,
    margin: [0, pageBreak ? 0 : 20, 0, 6],
    columns: [
      { width: 4, canvas: [{ type: 'rect', x: 0, y: 1, w: 4, h: 16, color: kind ? color.kind[kind] : color.accent }] },
      { text: title, fontSize: 15, bold: true, margin: [8, 0, 0, 0] },
    ],
  }
}

const empty = (text: string): Content => ({ text, style: 'small', italics: true, margin: [0, 2, 0, 0] })

function chip(status: OptionStatus): ContentTable {
  const s = statusChip[status]
  return {
    table: {
      body: [[{ text: s.text, fontSize: 7, bold: true, color: s.ink, fillColor: s.fill, margin: [5, 1, 5, 1], characterSpacing: 0.5 }]],
    },
    layout: 'noBorders',
  }
}

/** Kopfzeile eines Eintrags: Titel links, Preis und Status rechts. */
function itemHead(option: TripOption, title = option.title): Content {
  return {
    columns: [
      { text: pdfText(title), style: 'itemTitle', width: '*' },
      { text: priceText(option), bold: true, alignment: 'right', width: 'auto', margin: [0, 1, 8, 0] },
      { ...chip(option.status), width: 'auto' },
    ],
  }
}

function priceText(option: TripOption): string {
  if (option.totalPrice === null) return 'Preis offen'
  return option.totalPrice === 0 ? 'kostenlos' : formatEuro(option.totalPrice)
}

function linkLine(option: TripOption, label = 'Ansehen / buchen'): Content {
  if (!option.url) return ''
  return {
    text: [
      { text: `${label}: `, color: color.muted },
      { text: hostOf(option.url), link: option.url, color: color.accent, decoration: 'underline' },
    ],
    style: 'small',
    margin: [0, 2, 0, 0],
  }
}

function card(items: Content[], kind: OptionKind): Content {
  const stack = items.filter((c) => c !== '')
  return {
    margin: [0, 6, 0, 0],
    unbreakable: true,
    table: { widths: ['*'], body: [[{ stack, margin: [10, 7, 10, 7] }]] },
    layout: {
      hLineWidth: () => 0.6,
      vLineWidth: (i) => (i === 0 ? 3 : 0.6),
      hLineColor: () => color.line,
      vLineColor: (i) => (i === 0 ? color.kind[kind] : color.line),
    },
  }
}

interface LegRow {
  date: string
  route: string
  time: string
  flights: string
  stops: string
}

/** Strecken eines gemerkten Flugs aus Signatur + Notiz ("STR → LIS: Mi., 12. Mai, 09:14–14:31, EW2604, Direkt"). */
export function flightLegs(option: TripOption): { legs: LegRow[]; fare: string | null } {
  const parsed = parseSignature(option.externalId)
  const lines = option.notes?.split('\n') ?? []
  if (!parsed) return { legs: [], fare: null }
  const legs = parsed.legs.map((leg) => {
    const line = lines.find((l) => l.startsWith(`${leg.origin} → ${leg.destination}:`)) ?? ''
    const match = /(\d{2}:\d{2}–\d{2}:\d{2}(?: \(\+\d\))?), (.+), ([^,]+)$/.exec(line)
    return {
      date: formatShortDate(leg.date),
      route: `${leg.origin} › ${leg.destination}`,
      time: match?.[1] ?? '–',
      flights: match?.[2] ?? leg.flights.join(' + '),
      stops: match?.[3] ?? '',
    }
  })
  const fare = lines.find((l) => !/^[A-Z]{3} → [A-Z]{3}:/.test(l)) ?? null
  return { legs, fare }
}

function flightBlock(option: TripOption): Content {
  const { legs, fare } = flightLegs(option)
  const stack: Content[] = [itemHead(option)]
  if (legs.length > 0) {
    stack.push({
      margin: [0, 6, 0, 0],
      table: {
        headerRows: 1,
        widths: [70, 70, 80, '*', 'auto'],
        body: [
          ['Datum', 'Strecke', 'Zeit', 'Flug', 'Umstiege'].map((h) => ({ text: h, style: 'label' })),
          ...legs.map((l) => [l.date, { text: l.route, bold: true }, l.time, l.flights, l.stops]),
        ],
      },
      layout: thinRows,
    })
    if (fare) stack.push({ text: `Tarif: ${fare}`, style: 'small', margin: [0, 4, 0, 0] })
  } else {
    stack.push({ text: formatDateRange(option.startDate, option.endDate), color: color.muted })
    if (option.notes) stack.push({ text: pdfText(option.notes), style: 'small', margin: [0, 2, 0, 0] })
  }
  stack.push(linkLine(option))
  return card(stack, 'Flight')
}

function hotelsOfStage(trip: Trip, stage: Stage): Content {
  const hotels = trip.options.filter((o) => o.kind === 'Hotel' && o.stageId === stage.id && isChosen(o)).sort(byStart)
  const heading = {
    text: [
      { text: stage.name, bold: true },
      { text: `   ${formatDateRange(stage.startDate, stage.endDate)} · ${nightsLabel(stage.nights)}`, color: color.muted },
    ],
    margin: [0, 10, 0, 0],
  } satisfies Content
  if (hotels.length === 0) return [heading, { text: 'Noch keine Unterkunft ausgewählt.', color: color.warn, margin: [0, 4, 0, 0] }]
  return [
    heading,
    ...hotels.map((h) => {
      const from = h.startDate ?? stage.startDate
      const to = h.endDate ?? stage.endDate
      return card(
        [
          itemHead(h),
          {
            text: `Check-in ${formatShortDate(from)}  ›  Check-out ${formatShortDate(to)}  (${nightsLabel(days(from, to))})`,
            margin: [0, 3, 0, 0],
          },
          h.locationName ? { text: h.locationName, style: 'small' } : '',
          h.notes ? { text: pdfText(h.notes), style: 'small', margin: [0, 2, 0, 0] } : '',
          linkLine(h),
        ],
        'Hotel',
      )
    }),
  ]
}

function activities(trip: Trip): Content {
  const remembered = (o: TripOption) => o.kind === 'Activity' && o.status !== 'Idea'
  const groups = [
    ...trip.stages.map((s) => ({ name: s.name, items: trip.options.filter((o) => remembered(o) && o.stageId === s.id) })),
    {
      name: 'Ganze Reise',
      items: trip.options.filter((o) => remembered(o) && (!o.stageId || !trip.stages.some((s) => s.id === o.stageId))),
    },
  ].filter((g) => g.items.length > 0)
  if (groups.length === 0) return empty('Noch keine Aktivitäten gemerkt.')
  return groups.map((g) => [
    { text: g.name, bold: true, margin: [0, 10, 0, 0] },
    ...g.items.sort(byStart).map((a) => {
      const [description, ...rest] = (a.notes ?? '').split('\n').filter(Boolean)
      const hours = rest.find((l) => l.startsWith('Öffnungszeiten:'))
      const free = rest.includes('Eintritt frei')
      const sub = [a.locationName, a.startDate ? formatShortDate(a.startDate) : null, free ? 'Eintritt frei' : null]
        .filter(Boolean)
        .join(' · ')
      return card(
        [
          itemHead(a),
          sub ? { text: sub, style: 'small' } : '',
          description ? { text: shorten(description, 260), margin: [0, 3, 0, 0] } : '',
          hours ? { text: hours, style: 'small', margin: [0, 2, 0, 0] } : '',
          linkLine(a, 'Mehr dazu'),
        ],
        'Activity',
      )
    }),
  ])
}

function extraBlock(option: TripOption): Content {
  return card(
    [
      itemHead(option, `${kindLabels[option.kind].singular}: ${option.title}`),
      option.startDate ? { text: formatDateRange(option.startDate, option.endDate), color: color.muted } : '',
      option.notes ? { text: pdfText(option.notes), style: 'small', margin: [0, 2, 0, 0] } : '',
      linkLine(option),
    ],
    option.kind,
  )
}

function dayTable(days: ReturnType<typeof buildTimeline>['days']): Content {
  const body: TableCell[][] = [['Tag', 'Ort', 'Programm', 'Übernachtung'].map((h) => ({ text: h, style: 'label' }))]
  for (const d of days) {
    const program =
      d.items.length > 0
        ? pdfText(d.items.map((i) => `${kindLabels[i.kind].singular}: ${i.title}${i.time ? ` (${i.time})` : ''}`).join('\n'))
        : '–'
    const night =
      d.night === 'missing'
        ? { text: 'fehlt noch', color: color.warn, bold: true }
        : d.night
          ? { text: pdfText(d.night.title) + (d.night.booked ? '' : ' (noch buchen)') }
          : { text: 'Abreise', color: color.muted }
    body.push([
      { text: formatShortDate(d.date), bold: true, noWrap: true },
      { text: d.stage?.name ?? '–', color: d.stageStart ? color.text : color.muted },
      { text: program },
      night,
    ])
  }
  return { table: { headerRows: 1, widths: [62, 70, '*', 150], body, dontBreakRows: true }, layout: zebra } satisfies ContentTable
}

function costTables(trip: Trip): Content {
  const kinds = costByKind(trip.options)
  const stages = costByStage(trip)
  const total = round(kinds.reduce((n, k) => n + k.total, 0))
  const right = (text: string, bold = false): TableCell => ({ text, alignment: 'right', bold })
  return {
    columns: [
      {
        width: '*',
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto'],
          body: [
            [
              { text: 'Kategorie', style: 'label' },
              { text: 'Gebucht', style: 'label', alignment: 'right' },
              { text: 'Gesamt', style: 'label', alignment: 'right' },
            ],
            ...kinds.map((k) => [`${kindLabels[k.kind].plural} (${k.count})`, right(formatEuro(k.booked)), right(formatEuro(k.total))]),
            [
              { text: 'Summe', bold: true },
              right(formatEuro(round(kinds.reduce((n, k) => n + k.booked, 0))), true),
              right(formatEuro(total), true),
            ],
          ],
        },
        layout: thinRows,
      },
      { width: 18, text: '' },
      {
        width: '*',
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto'],
          body: [
            [
              { text: 'Etappe', style: 'label' },
              { text: 'Pro Nacht', style: 'label', alignment: 'right' },
              { text: 'Gesamt', style: 'label', alignment: 'right' },
            ],
            ...stages.map((s) => [
              s.nights > 0 ? `${s.name} (${nightsLabel(s.nights)})` : s.name,
              right(s.nights > 0 ? formatEuro(round(s.total / s.nights)) : '–'),
              right(formatEuro(s.total)),
            ]),
          ],
        },
        layout: thinRows,
      },
    ],
  }
}

const thinRows = {
  hLineWidth: (i: number) => (i === 0 ? 0 : 0.5),
  vLineWidth: () => 0,
  hLineColor: () => color.line,
  paddingTop: () => 3,
  paddingBottom: () => 3,
  paddingLeft: (i: number) => (i === 0 ? 0 : 6),
  paddingRight: () => 6,
}

const zebra = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  fillColor: (row: number) => (row === 0 ? null : row % 2 === 1 ? color.soft : null),
  paddingTop: () => 4,
  paddingBottom: () => 4,
}

function byStart(a: TripOption, b: TripOption): number {
  return (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999') || a.title.localeCompare(b.title, 'de')
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

function shorten(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max).replace(/\s+\S*$/, '')} …`
}
