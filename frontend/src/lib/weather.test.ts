import { describe, expect, it } from 'vitest'
import type { Stage } from '../api/types'
import type { WeatherDay } from '../api/weather'
import { sourceLabel, summarizeWeather, summaryLine, tripWeatherByDate, weatherLabel, weatherLine } from './weather'

const day = (date: string, over: Partial<WeatherDay> = {}): WeatherDay => ({
  date,
  source: 'Climate',
  code: 0,
  tempMax: 24.4,
  tempMin: 15.2,
  precipitationMm: 0,
  rainChance: 20,
  years: 5,
  ...over,
})

const stage = (id: string, startDate: string, endDate: string): Stage => ({
  id,
  name: id,
  startDate,
  endDate,
  nights: 0,
  latitude: 1,
  longitude: 1,
})

describe('Wetter', () => {
  it('Wettercodes auf Deutsch', () => {
    expect(weatherLabel(0)).toBe('Sonnig')
    expect(weatherLabel(2)).toBe('Wechselhaft')
    expect(weatherLabel(63)).toBe('Regen')
    expect(weatherLabel(81)).toBe('Regen')
    expect(weatherLabel(73)).toBe('Schnee')
    expect(weatherLabel(96)).toBe('Gewitter')
  })

  it('Zeile für PDF und Tooltip', () => {
    expect(weatherLine(day('2027-05-12'))).toBe('Sonnig, 24° / 15°, Regen 20 %')
    expect(weatherLine(day('2027-05-12', { rainChance: 0 }))).toBe('Sonnig, 24° / 15°')
  })

  it('am Wechseltag zählt die neue Etappe', () => {
    const byStage = new Map([
      ['lis', [day('2027-05-16'), day('2027-05-17', { code: 3 })]],
      ['opo', [day('2027-05-17', { code: 61 }), day('2027-05-18')]],
    ])
    const map = tripWeatherByDate([stage('opo', '2027-05-17', '2027-05-18'), stage('lis', '2027-05-12', '2027-05-17')], byStage)
    expect(map.get('2027-05-17')?.stageId).toBe('opo')
    expect(map.get('2027-05-17')?.code).toBe(61)
    expect(map.size).toBe(3)
  })

  it('fasst eine Etappe zusammen', () => {
    const s = summarizeWeather([
      day('2027-05-12', { tempMax: 22, tempMin: 14 }),
      day('2027-05-13', { code: 61, tempMax: 19, tempMin: 12, rainChance: 60, precipitationMm: 3 }),
      day('2027-05-14', { tempMax: 25, tempMin: 16 }),
    ])!
    expect(s.code).toBe(0)
    expect(s.rainyDays).toBe(1)
    expect(summaryLine(s)).toBe('meist sonnig, 12–25 °C, 1 Regentag')
    expect(sourceLabel(s)).toBe('typisch (Ø 5 Jahre)')
    expect(sourceLabel({ ...s, source: 'Mixed' })).toBe('Vorhersage + typisch (Ø 5 Jahre)')
    expect(summarizeWeather([])).toBeNull()
    const mixed = summarizeWeather([day('a'), day('b', { code: 61 }), day('c', { code: 3 })])!
    expect(summaryLine(mixed)).toBe('wechselhaft, 15–24 °C, kaum Regen')
  })
})
