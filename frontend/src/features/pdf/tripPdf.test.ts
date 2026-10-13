import { describe, expect, it } from 'vitest'
import { sampleTrip } from './sampleTrip'
import { buildTripPdf, flightLegs } from './tripPdf'

/** Alle Texte eines pdfmake-Dokuments, zum Durchsuchen. */
function texts(node: unknown): string[] {
  if (typeof node === 'string') return [node]
  if (Array.isArray(node)) return node.flatMap(texts)
  if (node && typeof node === 'object') return Object.entries(node).flatMap(([k, v]) => (k === 'link' ? [] : texts(v)))
  return []
}

describe('buildTripPdf', () => {
  const doc = buildTripPdf(sampleTrip, { today: '2026-10-13' })
  const all = texts(doc.content).join('\n')

  it('enthält Überblick, Flüge mit Zeiten, Unterkünfte, Aktivitäten, Tagesplan und Kosten', () => {
    expect(all).toContain('Portugal-Rundreise')
    expect(all).toContain('STR › LIS')
    expect(all).toContain('09:15–11:40')
    expect(all).toContain('TP566 + LH2177')
    expect(all).toContain('Memmo Alfama Hotel')
    expect(all).toContain('Castelo de São Jorge')
    expect(all).toContain('Tag für Tag')
    expect(all).toContain('Kosten')
    expect(all).toContain('Mietwagen für den Tagesausflug')
  })

  it('nimmt nur Ausgewähltes und Gebuchtes – gemerkte Aktivitäten aber schon', () => {
    expect(all).not.toContain('Pestana Vintage Porto')
    expect(all).not.toContain('Weinprobe')
    expect(all).toContain('Miradouro da Senhora do Monte')
  })

  it('nutzt keine Zeichen, die die Schrift nicht kennt', () => {
    expect(all).not.toContain('→')
  })

  it('meldet fehlende Unterkünfte', () => {
    const withoutHotel = { ...sampleTrip, options: sampleTrip.options.filter((o) => o.id !== 'h2') }
    const text = texts(buildTripPdf(withoutHotel, { today: '2026-10-13' }).content).join('\n')
    expect(text).toContain('3 Nächte ohne Unterkunft')
    expect(text).toContain('Noch keine Unterkunft ausgewählt.')
  })

  it('kommt mit einer leeren Reise zurecht', () => {
    const empty = { ...sampleTrip, startDate: null, endDate: null, stages: [], options: [], notes: null }
    const text = texts(buildTripPdf(empty, { today: '2026-10-13' }).content).join('\n')
    expect(text).toContain('Noch kein Flug ausgewählt.')
    expect(text).not.toContain('Tag für Tag')
  })
})

describe('flightLegs', () => {
  it('liest Strecken aus Signatur und Notiz', () => {
    const { legs, fare } = flightLegs(sampleTrip.options[0])
    expect(legs).toHaveLength(2)
    expect(legs[1]).toMatchObject({ route: 'OPO › STR', time: '13:05–19:20', flights: 'TP566 + LH2177', stops: '1 Umstieg (LIS)' })
    expect(fare).toBe('Light · nur Handgepäck · nicht umbuchbar')
  })
})
