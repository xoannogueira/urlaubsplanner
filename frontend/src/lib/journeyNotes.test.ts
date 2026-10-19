import { describe, expect, it } from 'vitest'
import { estimateDuration, parseDuration, parseJourneyNotes } from './journeyNotes'

describe('Gemerkte Verbindungen lesen', () => {
  it('liest Flugzeilen mit und ohne Dauer', () => {
    const { lines, rest } = parseJourneyNotes(
      'FRA → BCN: Fr., 13. Nov., 07:10–09:10, LH1124, Direkt, Dauer 2 Std.\n' +
        'BCN → FRA: Fr., 20. Nov., 22:05–00:15 (+1), LH1131 + LH400, 1 Umstieg (MUC)\n' +
        'Tarif Light · nur Handgepäck 8 kg · nicht erstattbar',
    )
    expect(lines[0]).toMatchObject({
      from: 'FRA',
      to: 'BCN',
      date: 'Fr., 13. Nov.',
      departure: '07:10',
      arrival: '09:10',
      services: ['LH1124'],
      stops: 'Direkt',
      durationMinutes: 120,
    })
    expect(lines[1]).toMatchObject({ plusDays: 1, services: ['LH1131', 'LH400'], stops: '1 Umstieg (MUC)', durationMinutes: null })
    expect(rest).toEqual(['Tarif Light · nur Handgepäck 8 kg · nicht erstattbar'])
  })

  it('liest Bus & Bahn mit Teilstrecken', () => {
    const { lines, steps } = parseJourneyNotes(
      'Jerez → El Puerto: Do., 31. Dez., 08:12–08:40, MD 13, direkt, Dauer 28 Min.\n08:12 Jerez de la Frontera (Gleis 2) → 08:40 El Puerto de Santa María: MD 13 Richtung Cádiz',
    )
    expect(lines[0]).toMatchObject({ from: 'Jerez', to: 'El Puerto', services: ['MD 13'], stops: 'direkt', durationMinutes: 28 })
    expect(steps[0]).toEqual({
      departure: '08:12',
      from: 'Jerez de la Frontera (Gleis 2)',
      arrival: '08:40',
      to: 'El Puerto de Santa María',
      service: 'MD 13 Richtung Cádiz',
    })
  })

  it('rechnet Dauern', () => {
    expect(parseDuration('7 Std. 5 Min.')).toBe(425)
    expect(parseDuration('45 Min.')).toBe(45)
    // Frankfurt 07:10 → Lissabon 09:10 Ortszeit = 3 Std. (Lissabon eine Stunde zurück)
    expect(
      estimateDuration(
        { departure: '07:10', arrival: '09:10', plusDays: 0 },
        '2026-11-13',
        { latitude: 50.03, longitude: 8.57 },
        { latitude: 38.77, longitude: -9.13 },
      ),
    ).toBe(180)
  })
})
